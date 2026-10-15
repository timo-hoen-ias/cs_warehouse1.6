import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import type { World } from './World';
import type { NetTransport } from '../multi/Transport';
import type { FpsPlayer } from '../player/FpsPlayer';
import type { Shooter } from '../weapons/Shooter';
import type { Hud } from '../ui/Hud';
import type { Grenades } from '../weapons/Grenades';
import type { Sfx } from '../audio/Sfx';
import { MatchAudio, toV3, type AudioMover } from '../audio/MatchAudio';
import { Soldier } from '../entities/Soldier';
import {
  addPlayer, aliveCounts, applyExplosion, applyHit, balanceBots, beginRound, bombCarrier, finishRound, newMatch, removePlayer,
  restartMatch, rewardAction, switchTeam, type MatchPlayer, type MatchState, type Pose,
} from '../logic/match';
import { ROUND, tickRound, type RoundPhase } from '../logic/round';
import type { Team } from '../logic/economy';
import { WEAPONS, shotInterval, type WeaponDef } from '../logic/weapons';
import { buyAmmo, buyItem, botBuy, consumeGrenade, bestWeapon, giveWeapon } from '../logic/loadout';
import { makeGun } from '../logic/fire';
import { fireSpread, startReload, tickGun, tryShoot } from '../logic/fire';
import { resolveRay, shotDirs, aimAt, spreadDir, dirToYawPitch, type ShotTarget } from '../logic/combat';
import { humanPartBoxes, type Vec3 } from '../logic/hitbox';
import { BOT, BOT_NAMES, aimError, decideBot, newBotMemory, type BotMemory } from '../logic/botDecide';
import type { XYZ } from '../logic/nav';
import { PLAYER, stepPlayer, type PlayerMotion } from '../logic/move';
import { GRENADE, flashStrength, heDamageAt, stepGrenade, throwGrenade, type GrenadeState, type Smoke } from '../logic/grenade';
import { applySnapshot, lerpPose, packSnapshot, poseMsg, sanitizeName, type GameEvent, type NetMsg, type PoseMsg, type Snapshot } from '../logic/net';
import { mulberry32 } from '../logic/rng';
import { capDrops, dropActive, dropOnDeath, droppedBomb, nextDropId, tryPickup, type DroppedItem } from '../logic/drops';
import { DroppedView } from '../weapons/DroppedView';
import { admitPlayer, holdWarmup, lobbyActive, sanitizeLobbyConfig, type LobbyConfig } from '../logic/lobby';
import { GAME_VERSION } from '../logic/serverList';

export type DriverOptions = {
  localName: string;
  team: Team | 'auto';
  /** Gesamtzahl Spieler inkl. Menschen, die der Host mit Bots auffüllt (0 = keine Bots). */
  fillTo: number;
  botSkill: number;
  /** Online-Host: Server-Konfiguration (Name, Limit, Passwort, Serverlobby). */
  lobby?: LobbyConfig | null;
  /** Client: Passwort-Prüfsumme für den Beitritt. */
  passwordDigest?: string | null;
};

type BotRuntime = {
  id: string;
  mem: BotMemory;
  motion: PlayerMotion;
  /** Geglätteter Navigationspfad (Wegpunkte in 3D). */
  path: XYZ[];
  pathAt: number;
  pathTarget: XYZ | null;
  /** Fortschritts-Überwachung (festgefahren → neu planen). */
  stuckT: number;
  stuckRef: { x: number; z: number };
  repathAt: number;
  pose: Pose;
  eHeld: boolean;
  blind: number;
  /** Deterministischer Zufall je Bot (Streuung, Reaktion). */
  rnd: () => number;
  lastShotAt: number;
};

type RemotePose = { prev: Pose; next: Pose; t: number; w: string; c: boolean; m: boolean; e: boolean; age: number };

const SNAP_HZ = 10;
const POSE_HZ = 20;
/** Bot-Lauftempo (knapp unter Sprint — Karten-Laufzeiten sind aufs Lauftempo ausgelegt). */
const BOT_SPEED = PLAYER.sprintSpeed * 0.9;

/**
 * Spiel-Treiber (Needle-Behaviour). Läuft auf jedem Client; der gewählte Host
 * rechnet autoritativ (Runde, Bombe, Treffer, Economy, Bots, Granaten) und
 * verteilt Snapshots + Ereignisse. Clients simulieren ihre Bewegung selbst,
 * senden Posen/Schüsse/Käufe und spiegeln den Match-Zustand fürs HUD.
 */
@registerType
export class MatchDriver extends Behaviour {
  world!: World;
  net!: NetTransport;
  player!: FpsPlayer;
  shooter!: Shooter;
  hud!: Hud;
  grenades!: Grenades;
  sfx?: Sfx;
  options: DriverOptions = { localName: 'Spieler', team: 'auto', fillTo: 6, botSkill: 0.6 };

  /** Autoritativ (Host) bzw. Spiegel (Client). */
  match: MatchState = newMatch();
  private wasHost = false;
  private helloSent = false;
  private snapSeq = 0;
  private snapTimer = 0;
  private poseTimer = 0;
  private lastSnapSeq = -1;
  private readonly bots = new Map<string, BotRuntime>();
  private readonly soldiers = new Map<string, Soldier>();
  private readonly remotePoses = new Map<string, RemotePose>();
  private lastRound = 0;
  private lastPhase: RoundPhase = 'warmup';
  private plan: 'a' | 'b' = 'a';
  private nades: { id: number; g: GrenadeState }[] = [];
  private nadeSeq = 1;
  private smokes: Smoke[] = [];
  private bombPos: Vec3 | null = null;
  private planterId: string | null = null;
  private defuserId: string | null = null;
  private fireSeq = 0;
  private rnd = mulberry32(42);
  private localDeadSince = -1;
  private chatLines: { who: string; text: string; team: Team | null }[] = [];
  private pendingHandled = false;
  private botIndex = 0;
  /** Liegende Waffen/C4 (Host autoritativ, Clients gespiegelt). */
  private drops: DroppedItem[] = [];
  private readonly dropView = new DroppedView();
  /** Zuschauer: Index in der Liste lebender Spieler, die man beobachten kann. */
  private specIndex = 0;
  private specTarget: string | null = null;
  /** Spielbezogenes Audio (Schritte, Bombe, Treffer) — Logik in src/audio/MatchAudio.ts. */
  private readonly audio = new MatchAudio(() => this.sfx, () => this.world?.zones);
  private lastNow = 0;
  /** Server-Konfiguration (Host: aus den Optionen, Client: aus dem Snapshot). */
  private lobbyCfg: LobbyConfig | null = null;
  private kicked = false;
  /** Der Host hat den Beitritt abgelehnt (Grund-Code aus lobby.ts). */
  onKicked?: (reason: string) => void;
  /** Debug-Zähler (Smoke/Netztest). */
  readonly counters = { firesSent: 0, firesHandled: 0, hitsApplied: 0, snapsApplied: 0, posesIn: 0 };

  get localId(): string {
    return this.net.id;
  }

  get isHost(): boolean {
    return !this.net.online || (this.net.hostId !== '' && this.net.hostId === this.net.id);
  }

  /** Lokaler Spieler im Match (Host: autoritativ; Client: Spiegel, ggf. undefined vor dem ersten Snapshot). */
  get local(): MatchPlayer | undefined {
    return this.match.players[this.localId];
  }

  start(): void {
    this.net.onMessage = (msg) => this.onNet(msg);
    this.net.onPeersChanged = () => this.onPeers();
    this.net.onPeerLeft = (id) => this.onPeerLeft(id);
    this.shooter.onFire = (w, o, d) => this.localFire(w, o, d);
    this.shooter.onThrow = (kind, o, d, s) => this.localThrow(kind, o, d, s);
    this.shooter.onReload = () => this.audio.localReload(this.shooter.weaponId, this.local?.loadout.guns[this.shooter.weaponId]);
    this.hud.onBuy = (item) => this.requestBuy(item);
    this.hud.onBuyAmmo = (slot) => this.requestAmmo(slot);
    this.hud.onChat = (text, teamOnly) => this.sendChat(text, teamOnly);
    this.hud.onRadio = (text) => {
      this.sendChat(`[Funk] ${text}`, true);
      this.sfx?.play('beep');
    };
    this.hud.onTeam = (team) => this.requestTeam(team);
    this.shooter.onDrop = (w) => this.requestDrop(w);
    this.context.scene.add(this.dropView.root);
    document.addEventListener('mousedown', this.onSpecClick);
    if (!this.net.online) this.becomeHost();
  }

  private readonly onSpecClick = (e: MouseEvent): void => {
    if (!this.player.isDead() || e.button !== 0) return;
    this.specIndex += 1;
    this.specTarget = null;
  };

  onDestroy(): void {
    document.removeEventListener('mousedown', this.onSpecClick);
    this.dropView.root.removeFromParent();
    for (const s of this.soldiers.values()) s.dispose();
    this.soldiers.clear();
    this.net.dispose();
  }

  // ---------------------------------------------------------------- Netz

  private lastHostId = '';

  private onPeers(): void {
    if (this.net.hostId !== this.lastHostId) {
      // Neuer Host zählt seine Snapshots neu → alte Sequenz vergessen
      this.lastHostId = this.net.hostId;
      this.lastSnapSeq = -1;
    }
    if (this.isHost && !this.wasHost) this.becomeHost();
    else if (!this.isHost && this.wasHost) this.wasHost = false;
    if (!this.isHost) this.sendHello();
    this.hud.setNetInfo(this.net.online ? `Raum ${this.net.roomName?.replace(/^csw16-/, '')} · ${this.net.peers.length + 1} Spieler · ${this.isHost ? 'Host' : 'Client'}` : 'Offline gegen Bots');
  }

  private sendHello(): void {
    this.net.send({ t: 'hello', id: this.localId, name: this.options.localName, team: this.options.team, pw: this.options.passwordDigest ?? null, v: GAME_VERSION });
    this.helloSent = true;
  }

  private becomeHost(): void {
    this.wasHost = true;
    // Eigene Konfiguration (Ersteller) oder die vom alten Host per Snapshot übernommene
    if (!this.lobbyCfg && this.options.lobby) this.lobbyCfg = { ...this.options.lobby };
    // Host-Migration: Spiegel wird autoritativ.
    // Snapshot-Zähler über dem bisherigen Host fortsetzen, Rundenzähler übernehmen (kein Doppelstart)
    this.snapSeq = Math.max(this.snapSeq, this.lastSnapSeq + 1);
    this.lastRound = this.match.round.round;
    // Menschen, die nicht mehr im Raum sind (z. B. der alte Host), entfernen
    const present = new Set([this.localId, ...this.net.peers]);
    for (const p of Object.values(this.match.players)) {
      if (!p.bot && !present.has(p.id)) removePlayer(this.match, p.id);
    }
    // Bot-IDs nach den vorhandenen fortsetzen (sonst überschreibt fillBots einen lebenden Bot)
    for (const p of Object.values(this.match.players)) {
      const n = Number(/^bot-(\d+)$/.exec(p.id)?.[1] ?? -1);
      if (n >= this.botIndex) this.botIndex = n + 1;
    }
    if (!this.match.players[this.localId]) {
      addPlayer(this.match, this.localId, sanitizeName(this.options.localName), { team: this.options.team });
    }
    for (const p of Object.values(this.match.players)) if (p.bot) this.ensureBot(p);
    this.fillBots();
    this.hud.setNetInfo(this.net.online ? `Raum ${this.net.roomName?.replace(/^csw16-/, '')} · Host` : 'Offline gegen Bots');
    if (this.match.round.round === 0 && this.match.round.phase === 'warmup') {
      // Warmup: alle sofort spawnen
      this.spawnAllNow();
    }
  }

  private onPeerLeft(id: string): void {
    const soldier = this.soldiers.get(id);
    if (soldier) {
      soldier.dispose();
      this.soldiers.delete(id);
    }
    this.remotePoses.delete(id);
    if (this.isHost && this.match.players[id]) {
      const name = this.match.players[id]!.name;
      removePlayer(this.match, id);
      this.emit({ k: 'leave', id, name });
      this.fillBots();
    }
  }

  private onNet(msg: NetMsg): void {
    switch (msg.t) {
      case 'pose':
        this.applyRemotePose(msg);
        break;
      case 'poses':
        if (!this.isHost) for (const p of msg.p) this.applyRemotePose(p);
        break;
      case 'snap':
        if (!this.isHost && (!msg.h || msg.h === this.net.hostId)) this.applySnap(msg.s);
        break;
      case 'ev':
        if (!this.isHost && (!msg.h || msg.h === this.net.hostId)) this.onEvent(msg.e);
        break;
      case 'hello':
        if (this.isHost) this.hostHello(msg.id, msg.name, msg.team, msg.pw, msg.v);
        break;
      case 'fire':
        if (this.isHost) this.hostFire(msg.id, msg.w, { x: msg.o[0], y: msg.o[1], z: msg.o[2] }, msg.d.map((d) => ({ x: d[0], y: d[1], z: d[2] })));
        break;
      case 'throw':
        if (this.isHost) this.hostThrow(msg.id, msg.kind, { x: msg.o[0], y: msg.o[1], z: msg.o[2] }, { x: msg.d[0], y: msg.d[1], z: msg.d[2] }, msg.s);
        break;
      case 'buy':
        if (this.isHost) this.hostBuy(msg.id, msg.item);
        break;
      case 'ammo':
        if (this.isHost) this.hostAmmo(msg.id, msg.slot);
        break;
      case 'team':
        if (this.isHost) this.hostTeam(msg.id, msg.team);
        break;
      case 'chat':
        // Teamchat/Funk nur für das eigene Team
        if (msg.teamOnly && msg.team !== this.local?.team) break;
        if (msg.text.startsWith('[Funk]')) this.sfx?.play('beep');
        this.pushChat((msg.teamOnly ? '(Team) ' : '') + msg.name, msg.text, msg.team);
        break;
      case 'reload':
        break;
      case 'dropreq':
        if (this.isHost) this.hostDrop(msg.id, msg.w);
        break;
    }
  }

  private applyRemotePose(p: PoseMsg): void {
    if (p.id === this.localId) return;
    this.counters.posesIn += 1;
    const pose: Pose = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
    const r = this.remotePoses.get(p.id);
    if (r) {
      r.prev = lerpPose(r.prev, r.next, Math.min(1, r.t));
      r.next = pose;
      r.t = 0;
      r.w = p.w;
      r.c = p.c;
      r.m = p.m;
      r.e = p.e;
      r.age = 0;
    } else {
      this.remotePoses.set(p.id, { prev: pose, next: pose, t: 1, w: p.w, c: p.c, m: p.m, e: p.e, age: 0 });
    }
    // Match-Pose nachführen: Host für Menschen (autoritativ für Treffer), Client für alle
    // (Spiegel; Bots kommen per 'poses' vom Host, lokal zielen/Radar brauchen aktuelle Werte).
    const mp = this.match.players[p.id];
    if (mp && (!this.isHost || !mp.bot)) {
      mp.pose = pose;
      mp.weapon = p.w;
    }
  }

  private emit(e: GameEvent): void {
    this.net.send({ t: 'ev', e, h: this.localId });
    this.onEvent(e);
  }

  // ---------------------------------------------------------------- Host: Spieler

  private hostHello(id: string, name: string, team: Team | 'auto', pw?: string | null, version?: string): void {
    if (this.match.players[id]) return;
    // Beitritt prüfen (Passwort, Spielerlimit, Version) — fremde Eingaben nie ungeprüft übernehmen
    const humans = Object.values(this.match.players).filter((p) => !p.bot).length;
    const admit = admitPlayer(this.lobbyCfg, humans, typeof pw === 'string' ? pw : null, typeof version === 'string' ? version : undefined, GAME_VERSION);
    if (!admit.ok) {
      this.emit({ k: 'kick', id, reason: admit.reason });
      return;
    }
    const p = addPlayer(this.match, id, sanitizeName(name), { team });
    this.fillBots();
    balanceBots(this.match);
    this.emit({ k: 'join', id, name: p.name, team: p.team });
    // Außerhalb der Kampfphase sofort spawnen
    if (this.match.round.phase !== 'live' && this.match.round.phase !== 'bomb') this.spawnOne(p);
    this.broadcastSnapshot();
  }

  private hostTeam(id: string, team: Team): void {
    const p = this.match.players[id];
    if (!p || p.team === team) return;
    switchTeam(this.match, id, team);
    balanceBots(this.match);
    this.emit({ k: 'join', id, name: p.name, team });
    if (this.match.round.phase !== 'live' && this.match.round.phase !== 'bomb') this.spawnOne(p);
  }

  requestTeam(team: Team): void {
    if (this.isHost) this.hostTeam(this.localId, team);
    else this.net.send({ t: 'team', id: this.localId, team });
  }

  /** Bots auffüllen/abbauen bis options.fillTo Spieler. */
  private fillBots(): void {
    if (!this.isHost) return;
    const humans = Object.values(this.match.players).filter((p) => !p.bot).length;
    const want = Math.max(0, this.options.fillTo - humans);
    const bots = Object.values(this.match.players).filter((p) => p.bot);
    while (bots.length < want) {
      const id = `bot-${this.botIndex++}`;
      const name = BOT_NAMES[(this.botIndex - 1) % BOT_NAMES.length]!;
      const p = addPlayer(this.match, id, name, { bot: true });
      bots.push(p);
      this.ensureBot(p);
      if (this.match.round.phase !== 'live' && this.match.round.phase !== 'bomb') this.spawnOne(p);
    }
    while (bots.length > want) {
      const p = bots.pop()!;
      removePlayer(this.match, p.id);
      this.bots.delete(p.id);
      const s = this.soldiers.get(p.id);
      if (s) {
        s.dispose();
        this.soldiers.delete(p.id);
      }
    }
    balanceBots(this.match);
  }

  private ensureBot(p: MatchPlayer): void {
    if (this.bots.has(p.id)) return;
    const seed = Number(p.id.replace(/\D/g, '')) || 1;
    const rnd = mulberry32(seed * 7919);
    this.bots.set(p.id, {
      id: p.id,
      mem: newBotMemory(rnd),
      motion: { x: p.pose.x, y: p.pose.y + PLAYER.eye, z: p.pose.z, vy: 0, grounded: true },
      path: [],
      pathAt: 0,
      pathTarget: null,
      stuckT: 0,
      stuckRef: { x: p.pose.x, z: p.pose.z },
      repathAt: 0,
      pose: { ...p.pose },
      eHeld: false,
      blind: 0,
      rnd,
      lastShotAt: 0,
    });
  }

  private spawnOne(p: MatchPlayer): void {
    const idx = Object.values(this.match.players).filter((q) => q.team === p.team).indexOf(p);
    p.pose = this.world.spawnPose(p.team, Math.max(0, idx));
    p.hp = 100;
    p.alive = true;
    p.weapon = bestWeapon(p.loadout);
    const b = this.bots.get(p.id);
    if (b) {
      b.motion = { x: p.pose.x, y: p.pose.y + PLAYER.eye, z: p.pose.z, vy: 0, grounded: true };
      b.pose = { ...p.pose };
      b.path = [];
      b.pathTarget = null;
    }
    this.emitSpawn(p);
  }

  private spawnAllNow(): void {
    for (const p of Object.values(this.match.players)) this.spawnOne(p);
  }

  private emitSpawn(p: MatchPlayer, fresh = false): void {
    this.emit({ k: 'spawn', id: p.id, x: p.pose.x, y: p.pose.y, z: p.pose.z, yaw: p.pose.yaw, fresh });
  }

  // ---------------------------------------------------------------- Host: Kampf

  private targetsFor(ignore: string): ShotTarget[] {
    const out: ShotTarget[] = [];
    for (const p of Object.values(this.match.players)) {
      if (!p.alive || p.id === ignore) continue;
      const crouch = this.remotePoses.get(p.id)?.c ?? (p.id === this.localId ? this.player.crouching() : false);
      out.push({ id: p.id, parts: humanPartBoxes({ x: p.pose.x, y: p.pose.y, z: p.pose.z }, crouch ? 0.75 : 1) });
    }
    return out;
  }

  private readonly lastFire = new Map<string, number>();

  private hostFire(shooterId: string, weaponId: string, origin: Vec3, dirs: Vec3[]): void {
    const shooter = this.match.players[shooterId];
    const def = WEAPONS[weaponId];
    this.counters.firesHandled += 1;
    if (!shooter || !shooter.alive || !def || !dirs.length) return;
    if (this.match.round.phase === 'freeze') return;
    // Fremde Schüsse prüfen: Waffe im Inventar, Kadenz, Anzahl Strahlen, Ursprung nahe der Pose
    if (shooterId !== this.localId && !shooter.bot) {
      const lo = shooter.loadout;
      const base = weaponId === 'knife_stab' ? 'knife' : weaponId;
      if (base !== 'knife' && lo.primary !== base && lo.secondary !== base) return;
      const last = this.lastFire.get(shooterId) ?? -1;
      if (last >= 0 && this.match.time - last < shotInterval(def) * 0.6) return;
      this.lastFire.set(shooterId, this.match.time);
      if (Math.hypot(origin.x - shooter.pose.x, origin.z - shooter.pose.z) > 2.5) return;
      if (dirs.length > Math.max(1, def.pellets)) dirs = dirs.slice(0, def.pellets);
      // Munition auf dem Host mitzählen (für Munitionskauf und Host-Wechsel)
      const gun = lo.guns[weaponId];
      if (gun && def.mode === 'hit') {
        if (gun.mag > 0) gun.mag -= 1;
        else if (gun.reserve > 0) {
          const take = Math.min(def.magSize, gun.reserve);
          gun.reserve -= take;
          gun.mag = take - 1;
        }
      }
    }
    const targets = this.targetsFor(shooterId);
    const ends: [number, number, number][] = [];
    const walls: [number, number, number][] = [];
    for (const dir of dirs) {
      const hit = resolveRay(origin, dir, def.range, this.world.collider, targets, shooterId);
      ends.push([hit.point.x, hit.point.y, hit.point.z]);
      if (hit.kind === 'wall') walls.push([hit.point.x, hit.point.y, hit.point.z]);
      if (hit.kind === 'target') {
        const victim = this.match.players[hit.id];
        if (!victim) continue;
        const r = applyHit(this.match, hit.id, shooterId, def, hit.part, hit.dist);
        if (!r) continue;
        this.counters.hitsApplied += 1;
        this.emit({ k: 'hit', victim: hit.id, attacker: shooterId, dmg: r.dmg, part: hit.part, from: [origin.x, origin.y, origin.z], at: [hit.point.x, hit.point.y, hit.point.z] });
        if (r.killed) this.onHostKill(victim, shooterId, def.id, hit.part === 'head');
        if (def.pellets === 1 && hit.part === 'head' && def.type !== 'shotgun') { /* ein Kopftreffer reicht */ }
      }
    }
    this.net.send({ t: 'ev', h: this.localId, e: { k: 'shot', id: shooterId, w: weaponId, o: [origin.x, origin.y, origin.z], ends, walls } });
    if (shooterId !== this.localId) this.onEvent({ k: 'shot', id: shooterId, w: weaponId, o: [origin.x, origin.y, origin.z], ends, walls });
  }

  private onHostKill(victim: MatchPlayer, killerId: string | null, weapon: string, hs: boolean): void {
    this.emit({ k: 'kill', killer: killerId, victim: victim.id, weapon, hs });
    // CS: beste Schusswaffe und C4 fallen auf den Boden
    for (const item of dropOnDeath(victim.loadout, { x: victim.pose.x, y: victim.pose.y, z: victim.pose.z })) this.addDrop(item, null);
    const b = this.bots.get(victim.id);
    if (b) b.path = [];
  }

  private addDrop(item: DroppedItem, by: string | null, from?: Vec3): void {
    // Nicht durch Wände werfen, auf den Boden legen (mehrere Ebenen)
    if (from && !this.world.collider.clear({ x: from.x, y: from.y + 0.5, z: from.z }, { x: item.x, y: from.y + 0.5, z: item.z })) {
      item.x = from.x;
      item.z = from.z;
    }
    item.y = this.world.groundAt(item.x, item.z, item.y + 0.6);
    this.drops = capDrops([...this.drops, item]);
    this.emit({ k: 'drop', item: { id: item.id, weapon: item.weapon, x: item.x, y: item.y, z: item.z }, by });
  }

  /** G: gehaltene Waffe fallen lassen (Host). */
  private hostDrop(id: string, weaponId: string): void {
    const p = this.match.players[id];
    if (!p || !p.alive) return;
    const item = dropActive(p.loadout, weaponId, { x: p.pose.x, y: p.pose.y, z: p.pose.z }, p.pose.yaw, nextDropId);
    if (!item) return;
    if (p.weapon === weaponId) p.weapon = bestWeapon(p.loadout);
    this.addDrop(item, id, { x: p.pose.x, y: p.pose.y, z: p.pose.z });
    // Kurz nicht wieder aufheben (sonst landet die Waffe sofort wieder im Inventar)
    this.pickupBlock.set(id, { item: item.id, until: this.match.time + 1.5 });
  }

  requestDrop(weaponId: string): void {
    if (this.player.isDead()) return;
    if (this.isHost) this.hostDrop(this.localId, weaponId);
    else this.net.send({ t: 'dropreq', id: this.localId, w: weaponId });
  }

  private readonly pickupBlock = new Map<string, { item: number; until: number }>();

  /** Host: lebende Spieler heben Waffen/C4 beim Drüberlaufen auf. */
  private hostPickups(): void {
    if (!this.drops.length) return;
    for (const p of Object.values(this.match.players)) {
      if (!p.alive) continue;
      const block = this.pickupBlock.get(p.id);
      const candidates = block && block.until > this.match.time ? this.drops.filter((d) => d.id !== block.item) : this.drops;
      const got = tryPickup(p.loadout, p.team, candidates, { x: p.pose.x, y: p.pose.y, z: p.pose.z });
      if (!got) continue;
      this.drops = this.drops.filter((d) => d.id !== got.id);
      if (p.bot && got.weapon !== 'c4') p.weapon = bestWeapon(p.loadout);
      this.emit({ k: 'pickup', id: got.id, by: p.id, weapon: got.weapon });
    }
  }

  private hostThrow(id: string, kind: 'he' | 'flash' | 'smoke', origin: Vec3, dir: Vec3, strength: number): void {
    const p = this.match.players[id];
    if (!p || !p.alive) return;
    if (p.loadout.grenades[kind] <= 0) return;
    consumeGrenade(p.loadout, kind);
    const g = throwGrenade(kind, origin, dir, id, strength);
    const nid = this.nadeSeq++;
    this.nades.push({ id: nid, g });
    this.emit({ k: 'nade', id: nid, kind, owner: id, o: [g.pos.x, g.pos.y, g.pos.z], v: [g.vel.x, g.vel.y, g.vel.z] });
  }

  private hostBuy(id: string, item: string): void {
    const p = this.match.players[id];
    if (!p) return;
    const phase = this.match.round.phase;
    const canBuy = phase === 'warmup' || phase === 'freeze' || (phase === 'live' && this.match.round.timer > ROUND.roundTime - 15);
    if (!canBuy || !p.alive) {
      this.emit({ k: 'buy', id, item, ok: false, reason: 'Kaufzeit vorbei' });
      return;
    }
    if (!this.world.inBuyZone(p.team, p.pose)) {
      this.emit({ k: 'buy', id, item, ok: false, reason: 'Nicht in der Kaufzone (Spawn)' });
      return;
    }
    const r = buyItem(p.loadout, p.money, item, p.team);
    if (r.ok) {
      const def = WEAPONS[item];
      if (def && (def.slot === 1 || def.slot === 2)) p.weapon = item;
    }
    this.emit({ k: 'buy', id, item, ok: r.ok, reason: r.ok ? undefined : buyReason(r.reason) });
  }

  private hostAmmo(id: string, slot: 1 | 2): void {
    const p = this.match.players[id];
    if (!p) return;
    const r = buyAmmo(p.loadout, p.money, slot);
    this.emit({ k: 'buy', id, item: slot === 1 ? 'ammo1' : 'ammo2', ok: r.ok, reason: r.ok ? undefined : buyReason(r.reason) });
  }

  // ---------------------------------------------------------------- Lokale Aktionen

  private localFire(weaponId: string, origin: Vec3, dirs: Vec3[]): void {
    this.counters.firesSent += 1;
    if (this.isHost) this.hostFire(this.localId, weaponId, origin, dirs);
    else this.net.send({ t: 'fire', id: this.localId, w: weaponId, o: [origin.x, origin.y, origin.z], d: dirs.map((d) => [d.x, d.y, d.z]), seq: this.fireSeq++ });
  }

  private localThrow(kind: 'he' | 'flash' | 'smoke', origin: Vec3, dir: Vec3, strength: number): void {
    if (this.isHost) this.hostThrow(this.localId, kind, origin, dir, strength);
    else this.net.send({ t: 'throw', id: this.localId, kind, o: [origin.x, origin.y, origin.z], d: [dir.x, dir.y, dir.z], s: strength });
  }

  requestBuy(item: string): void {
    if (this.isHost) this.hostBuy(this.localId, item);
    else this.net.send({ t: 'buy', id: this.localId, item });
  }

  requestAmmo(slot: 1 | 2): void {
    if (this.isHost) this.hostAmmo(this.localId, slot);
    else this.net.send({ t: 'ammo', id: this.localId, slot });
  }

  sendChat(text: string, teamOnly = false): void {
    const t = text.trim().slice(0, 120);
    if (!t) return;
    const team = this.local?.team ?? null;
    this.net.send({ t: 'chat', id: this.localId, name: this.options.localName, text: t, team, teamOnly });
    this.pushChat((teamOnly ? '(Team) ' : '') + this.options.localName, t, team);
  }

  private pushChat(who: string, text: string, team: Team | null): void {
    this.chatLines.push({ who, text, team });
    if (this.chatLines.length > 8) this.chatLines.shift();
    this.hud.setChat(this.chatLines);
  }

  // ---------------------------------------------------------------- Ereignisse (alle)

  private onEvent(e: GameEvent): void {
    switch (e.k) {
      case 'spawn':
        if (e.id === this.localId) {
          // Frisches Inventar: Munitionsstand der Spiegelkopie zurücksetzen (Host hat ihn schon neu)
          if (e.fresh && !this.isHost && this.local) for (const id of Object.keys(this.local.loadout.guns)) this.local.loadout.guns[id] = makeGun(WEAPONS[id]!);
          this.player.spawn(e.x, e.z, e.yaw, e.y ?? this.world.groundAt(e.x, e.z));
          if (this.local) this.shooter.viewModel?.setTeam(this.local.team); // Arme in Teamfarben
          this.player.hp = 100;
          this.player.setDead(false);
          this.localDeadSince = -1;
          this.shooter.onSpawn();
          this.hud.setSpectator(null);
        }
        break;
      case 'hit': {
        const victimSoldier = this.soldiers.get(e.victim);
        victimSoldier?.flashHit();
        this.audio.hit(e, this.localId, this.shooter.weaponId);
        if (e.victim === this.localId) {
          this.player.hp = Math.max(0, this.player.hp - e.dmg);
          const ang = Math.atan2(e.from[0] - this.player.motionX(), e.from[2] - this.player.motionZ());
          this.hud.damageFrom(ang - this.player.yawNow());
        }
        if (e.attacker === this.localId) {
          this.hud.hitmarker(false);
          this.grenades.fx.impact({ kind: 'target', part: e.part, point: { x: e.at[0], y: e.at[1], z: e.at[2] }, killed: false, normal: { x: 0, y: 1, z: 0 } }, { x: 0, y: -1, z: 0 });
        }
        break;
      }
      case 'kill': {
        if (e.killer === this.localId) {
          this.hud.hitmarker(true);
          this.sfx?.play('kill'); // Kopftreffer-„Dink“ kam schon mit dem Treffer
        }
        if (e.victim === this.localId) {
          this.player.hp = 0;
          this.player.setDead(true);
          this.localDeadSince = this.match.time;
          this.hud.setSpectator('Du bist tot — Zuschauer bis zur nächsten Runde');
          this.sfx?.play('death');
        }
        if (e.victim !== this.localId) this.audio.death(this.match.players[e.victim]?.pose);
        this.soldiers.get(e.victim)?.setAlive(false);
        this.hud.pushKill(e, this.match);
        break;
      }
      case 'shot': {
        if (e.id === this.localId || !e.ends.length) break;
        // Mündung des fremden Soldaten (Tabellenpunkt der Waffe) statt Augenhöhe; Leuchtspur und Feuer starten dort
        const o = this.soldierMuzzle(e.id) ?? { x: e.o[0], y: e.o[1] - 0.1, z: e.o[2] };
        for (const end of e.ends) this.grenades.fx.tracer(o, { x: end[0], y: end[1], z: end[2] });
        for (const w of e.walls) this.grenades.fx.impact({ kind: 'wall', point: { x: w[0], y: w[1], z: w[2] }, normal: { x: 0, y: 1, z: 0 } }, { x: 0, y: -1, z: 0 });
        this.grenades.fx.muzzleFlash(o, { x: e.ends[0]![0] - o.x, y: e.ends[0]![1] - o.y, z: e.ends[0]![2] - o.z }, 0.8);
        this.sfx?.shotAt(e.w, o, e.ends.map(toV3), e.walls.map(toV3));
        break;
      }
      case 'nade':
        this.grenades.spawn(e.id, e.kind, { x: e.o[0], y: e.o[1], z: e.o[2] });
        this.sfx?.grenade('throw', toV3(e.o));
        break;
      case 'boom': {
        const at = { x: e.at[0], y: e.at[1], z: e.at[2] };
        this.grenades.detonate(e.id, e.kind, at);
        if (e.kind === 'flash') {
          const cam = this.context.mainCamera as THREE.PerspectiveCamera;
          const dir = cam.getWorldDirection(new THREE.Vector3());
          const eye = cam.getWorldPosition(new THREE.Vector3());
          const s = this.player.isDead() ? 0 : flashStrength({ x: eye.x, y: eye.y, z: eye.z }, { x: dir.x, y: dir.y, z: dir.z }, at, this.world.collider);
          if (s > 0.05) this.hud.flash(s);
          this.sfx?.explosion('flash', at);
          this.sfx?.flashed(s);
        } else if (e.kind === 'he') {
          const d = Math.hypot(at.x - this.player.motionX(), at.z - this.player.motionZ());
          this.sfx?.explosion('he', at);
          this.player.shake(Math.max(0, 0.03 * (1 - d / 25)));
        } else this.sfx?.explosion('smoke', at);
        break;
      }
      case 'bomb':
        if (e.what === 'planted') {
          this.hud.showBanner('Die Bombe wurde gelegt!', '#ff9d8a');
          this.sfx?.c4('planted', this.audio.bombAt(e.spot));
        } else if (e.what === 'defused') {
          this.hud.showBanner('Bombe entschärft!', '#8fd0ff');
          this.sfx?.c4('defused', this.audio.bombAt(e.spot));
        } else if (e.what === 'exploded') {
          const at = this.bombPos ?? (e.spot ? { x: this.world.zones[e.spot].x, y: this.world.zones[e.spot].y + 0.2, z: this.world.zones[e.spot].z } : null);
          if (at) this.sfx?.explosion('c4', at);
          else this.sfx?.play('boom', 1);
          if (at) this.grenades.detonate(-1, 'he', at, 3);
        }
        break;
      case 'drop':
        if (!this.isHost) this.drops = [...this.drops.filter((d) => d.id !== e.item.id), e.item];
        this.dropView.add(e.item.id, e.item.weapon, e.item.x, e.item.y, e.item.z);
        if (e.by === this.localId) this.sfx?.play('switch');
        break;
      case 'pickup': {
        if (!this.isHost) this.drops = this.drops.filter((d) => d.id !== e.id);
        this.dropView.remove(e.id);
        if (e.by === this.localId) {
          this.sfx?.play('buy');
          this.hud.notice(`Aufgehoben: ${WEAPONS[e.weapon]?.name ?? e.weapon}`);
          const def = WEAPONS[e.weapon];
          if (def && def.slot === 1 && this.shooter.weaponId !== e.weapon && WEAPONS[this.shooter.weaponId]?.slot !== 1) this.shooter.setWeapon(e.weapon);
        }
        break;
      }
      case 'round':
        if (e.what === 'start') {
          this.hud.showBanner(`Runde ${e.round}`, '#dfe6ee');
          this.hud.setSpectator(null);
          this.sfx?.play('roundStart');
          this.grenades.clearAll();
          this.dropView.clear();
          if (!this.isHost) this.drops = [];
          this.smokes = [];
          this.bombPos = null;
        } else {
          this.hud.showRoundEnd(e.outcome ?? '', e.reason ?? '');
          this.sfx?.play(e.outcome && ((e.outcome.startsWith('t_') && this.local?.team === 'T') || (e.outcome.startsWith('ct_') && this.local?.team === 'CT')) ? 'win' : 'lose');
        }
        break;
      case 'buy':
        if (e.id === this.localId) {
          if (e.ok) {
            this.sfx?.play('buy');
            const lo = this.local?.loadout;
            if (e.item === 'ammo1' || e.item === 'ammo2') {
              // Munition: Client-Kopie selbst auffüllen (Snapshot trägt keinen Munitionsstand)
              const wid = e.item === 'ammo1' ? lo?.primary : lo?.secondary;
              if (!this.isHost && lo && wid && lo.guns[wid]) {
                const d = WEAPONS[wid]!;
                lo.guns[wid]!.reserve = Math.min(d.reserve, lo.guns[wid]!.reserve + d.magSize);
              }
              this.hud.notice(e.item === 'ammo1' ? 'Munition (Primär) gekauft' : 'Munition (Pistole) gekauft');
              break;
            }
            const def = WEAPONS[e.item];
            if (def && (def.slot === 1 || def.slot === 2)) {
              // Ereignis kann vor dem Snapshot eintreffen → Spiegel sofort aktualisieren
              if (!this.isHost && lo && lo.primary !== e.item && lo.secondary !== e.item) giveWeapon(lo, e.item);
              this.shooter.setWeapon(e.item);
            }
            this.hud.notice(`Gekauft: ${def?.name ?? e.item}`);
          } else this.hud.notice(`Kauf fehlgeschlagen: ${e.reason ?? ''}`);
        }
        break;
      case 'match':
        this.hud.showBanner(`${e.winner === 'T' ? 'Terroristen' : 'Counter-Terroristen'} gewinnen das Match!`, '#ffd98a', 6000);
        break;
      case 'join':
        this.hud.notice(`${e.name} ist Team ${e.team} beigetreten`);
        break;
      case 'leave':
        this.hud.notice(`${e.name} hat das Spiel verlassen`);
        break;
      case 'kick':
        if (e.id === this.localId && !this.isHost && !this.kicked) {
          this.kicked = true;
          this.onKicked?.(e.reason);
        }
        break;
    }
  }

  private applySnap(s: Snapshot): void {
    if (s.seq <= this.lastSnapSeq && s.seq > 0) return;
    this.lastSnapSeq = s.seq;
    this.counters.snapsApplied += 1;
    const prevPhase = this.match.round.phase;
    const prevRound = this.match.round.round;
    applySnapshot(this.match, s);
    if (s.lobby !== undefined) this.lobbyCfg = sanitizeLobbyConfig(s.lobby);
    this.smokes = s.smokes.map((x) => ({ pos: { x: x.p[0], y: x.p[1], z: x.p[2] }, radius: x.r, timeLeft: x.t }));
    this.bombPos = s.bombPos ? { x: s.bombPos[0], y: s.bombPos[1], z: s.bombPos[2] } : null;
    this.grenades.syncPositions(s.nades);
    if (s.drops) {
      this.drops = s.drops.map((d) => ({ id: d.id, weapon: d.weapon, x: d.p[0], y: d.p[1], z: d.p[2] }));
      this.dropView.sync(this.drops);
    }
    const me = this.local;
    if (me) {
      this.player.hp = me.hp;
      if (!me.alive && !this.player.isDead()) {
        this.player.setDead(true);
        this.hud.setSpectator('Du bist tot — Zuschauer bis zur nächsten Runde');
      }
      this.player.frozen = this.match.round.phase === 'freeze';
    }
    void prevPhase;
    void prevRound;
  }

  // ---------------------------------------------------------------- Frame

  update(): void {
    // Spielzeit läuft auch bei niedriger Bildrate in Echtzeit: große Frames in Teilschritte
    // (≤ 0.1 s) zerlegen, damit Runde, Bomben-Timer, Bots und Granaten korrekt weiterlaufen.
    // Eigene Uhr: Needle deckelt deltaTime auf 0.1 s (Tab-Wechsel-Schutz) → wir messen selbst
    // und begrenzen erst bei 0.6 s, damit Runden-Timer auch bei 2–5 FPS in Echtzeit laufen.
    const now = performance.now();
    const real = this.lastNow > 0 ? (now - this.lastNow) / 1000 : this.context.time.deltaTime;
    this.lastNow = now;
    const total = Math.min(Math.max(real, 0), 0.6);
    const steps = Math.max(1, Math.ceil(total / 0.1));
    const dt = total / steps;
    if (this.net.online && !this.helloSent && !this.isHost && this.net.id) this.sendHello();
    for (let i = 0; i < steps; i++) {
      if (this.isHost) this.hostTick(dt);
      else this.clientTick(dt);
    }
    this.renderSoldiers(total);
    this.grenades.tick(total, this.isHost ? this.nades.map((n) => ({ id: n.id, p: n.g.pos })) : null);
    this.dropView.tick(now / 1000);
    this.updateSpectator();
    this.updateAudio(total);
    this.updateHud();
  }

  private clientTick(dt: number): void {
    this.poseTimer += dt;
    if (this.poseTimer >= 1 / POSE_HZ) {
      this.poseTimer = 0;
      this.net.send(poseMsg(this.localId, this.localPose(), this.shooter.weaponId, this.player.crouching(), this.player.moving(), this.shooter.eHeld && !this.player.isDead()));
    }
    for (const s of this.smokes) s.timeLeft -= dt;
    this.match.time += dt;
    this.match.round.timer = Math.max(0, this.match.round.timer - dt);
    const bp = this.match.round.bomb.phase;
    if (bp === 'planted' || bp === 'defusing') this.match.round.bomb.fuseLeft = Math.max(0, this.match.round.bomb.fuseLeft - dt);
  }

  private localPose(): Pose {
    return { x: this.player.motionX(), y: this.player.feetY(), z: this.player.motionZ(), yaw: this.player.yawNow(), pitch: this.player.pitchNow() };
  }

  private hostTick(dt: number): void {
    const m = this.match;
    m.time += dt;
    const me = m.players[this.localId];
    if (me) {
      me.pose = this.localPose();
      me.weapon = this.shooter.weaponId;
      if (me.alive && this.player.isDead()) { /* Snapshot-Spiegel korrigiert */ }
    }
    this.player.frozen = m.round.phase === 'freeze';

    // Bots denken/laufen/schießen
    for (const b of this.bots.values()) this.tickBot(b, dt);
    this.hostPickups();

    // Bombe: Plant (T mit Bombe, E, im Spot) / Defuse (CT, E, am Bombenspot)
    const carrier = bombCarrier(m);
    let inSpot: 'a' | 'b' | null = null;
    let plant = false;
    let defuse = false;
    let hasKit = false;
    this.planterId = null;
    this.defuserId = null;
    if (carrier && (m.round.phase === 'live')) {
      const held = this.eHeldFor(carrier.id);
      const s = this.world.siteAt(carrier.pose);
      if (held && s && carrier.weapon === 'c4') {
        inSpot = s;
        plant = true;
        this.planterId = carrier.id;
      } else if (held && s && !carrier.bot) {
        // Mensch hält E im Spot ohne C4 in der Hand → automatisch Bombe ziehen (Komfort)
        inSpot = s;
        plant = true;
        this.planterId = carrier.id;
      }
    }
    if (m.round.phase === 'bomb' && m.round.bomb.spot) {
      const spot = m.round.bomb.spot;
      for (const p of Object.values(m.players)) {
        if (!p.alive || p.team !== 'CT') continue;
        const bp = this.bombPos ?? this.world.zones[spot];
        if (Math.hypot(p.pose.x - bp.x, p.pose.z - bp.z) > BOT.spotRadius || Math.abs(p.pose.y - bp.y) > 1.6) continue;
        if (!this.eHeldFor(p.id)) continue;
        defuse = true;
        inSpot = spot;
        hasKit = p.loadout.defuseKit;
        this.defuserId = p.id;
        break;
      }
    }
    const bombBefore = m.round.bomb.phase;
    // Serverlobby: Aufwärmen läuft weiter, bis der Host startet
    holdWarmup(m.round, !!this.lobbyCfg?.hold);
    // Nach dem Match-Sieg keine weitere Runde starten: Ergebnis stehen lassen bis zum Neustart
    const result = m.winner ? null : tickRound(m.round, { alive: aliveCounts(m), bombAction: { plant, defuse }, inSpot, hasKit }, dt);
    if (m.round.bomb.phase !== bombBefore) {
      if (m.round.bomb.phase === 'planted' && bombBefore === 'planting') {
        if (this.planterId) {
          rewardAction(m, this.planterId, 'plant');
          const pl = m.players[this.planterId];
          if (pl) {
            pl.loadout.bomb = false;
            this.bombPos = { x: pl.pose.x, y: pl.pose.y + 0.15, z: pl.pose.z };
            if (pl.weapon === 'c4') pl.weapon = bestWeapon(pl.loadout);
            if (pl.id === this.localId) this.shooter.setWeapon(bestWeapon(pl.loadout));
          }
          // Taktik-Plan der T: ab jetzt Bombe verteidigen (Rolle wechselt automatisch)
        }
        this.emit({ k: 'bomb', what: 'planted', by: this.planterId, spot: m.round.bomb.spot });
      } else if (m.round.bomb.phase === 'defused') {
        if (this.defuserId) rewardAction(m, this.defuserId, 'defuse');
        this.emit({ k: 'bomb', what: 'defused', by: this.defuserId, spot: m.round.bomb.spot });
      } else if (m.round.bomb.phase === 'exploded') {
        this.emit({ k: 'bomb', what: 'exploded', by: null, spot: m.round.bomb.spot });
        // Explosionsschaden an allen in der Nähe
        if (this.bombPos) {
          for (const p of Object.values(m.players)) {
            if (!p.alive) continue;
            const dmg = heDamageAt(this.bombPos, { x: p.pose.x, y: p.pose.y + 1, z: p.pose.z }, [], 18, 300);
            if (dmg > 0) {
              const r = applyExplosion(m, p.id, null, dmg, 1);
              if (r?.killed) this.onHostKill(p, null, 'c4', false);
            }
          }
        }
      }
    }
    if (result) {
      const planted = result.outcome === 't_win_explode' || result.outcome === 'ct_win_defuse' || m.round.bomb.phase !== 'none';
      const winner = finishRound(m, result.outcome, planted);
      this.emit({ k: 'round', what: 'end', round: m.round.round, outcome: result.outcome, reason: result.reason });
      if (winner) this.emit({ k: 'match', winner });
    }
    // Neue Runde (round.ts startet sie nach roundEnd/warmup selbst)
    if (!m.winner && m.round.round !== this.lastRound && m.round.phase === 'freeze') {
      this.lastRound = m.round.round;
      this.startRound();
    }
    if (m.winner) {
      m.matchEndTimer -= dt;
      if (m.matchEndTimer <= 0) {
        restartMatch(m);
        m.round.round = 0;
        m.round.phase = 'warmup';
        m.round.timer = ROUND.warmupTime;
        this.lastRound = 0;
        this.nades = [];
        this.smokes = [];
        this.bombPos = null;
        this.drops = [];
        this.emit({ k: 'round', what: 'start', round: 0 });
        this.spawnAllNow();
      }
    }
    this.lastPhase = m.round.phase;

    // Granaten simulieren
    this.tickGrenades(dt);
    for (const s of this.smokes) s.timeLeft -= dt;
    this.smokes = this.smokes.filter((s) => s.timeLeft > 0);

    // Lokaler Spieler-Zustand aus dem Match
    if (me) {
      this.player.hp = me.hp;
      if (!me.alive && !this.player.isDead()) {
        this.player.setDead(true);
        this.hud.setSpectator('Du bist tot — Zuschauer bis zur nächsten Runde');
      }
    }

    // Netz: Bot-Posen + Snapshot
    if (this.net.online) {
      this.poseTimer += dt;
      if (this.poseTimer >= 1 / POSE_HZ) {
        this.poseTimer = 0;
        const list: PoseMsg[] = [poseMsg(this.localId, this.localPose(), this.shooter.weaponId, this.player.crouching(), this.player.moving(), this.shooter.eHeld)];
        for (const b of this.bots.values()) {
          const p = m.players[b.id];
          if (p) list.push(poseMsg(b.id, b.pose, p.weapon, false, b.path.length > 0, b.eHeld));
        }
        this.net.send({ t: 'poses', p: list });
      }
      this.snapTimer += dt;
      if (this.snapTimer >= 1 / SNAP_HZ) {
        this.snapTimer = 0;
        this.broadcastSnapshot();
      }
    }
  }

  private broadcastSnapshot(): void {
    if (!this.net.online) return;
    const snap = packSnapshot(this.match, ++this.snapSeq, {
      nades: this.nades.map((n) => ({ id: n.id, kind: n.g.kind, p: [n.g.pos.x, n.g.pos.y, n.g.pos.z] })),
      drops: this.drops.map((d) => ({ id: d.id, weapon: d.weapon, p: [d.x, d.y, d.z] as [number, number, number] })),
      smokes: this.smokes,
      bombPos: this.bombPos ? [this.bombPos.x, this.bombPos.y, this.bombPos.z] : null,
      lobby: this.lobbyCfg,
    });
    this.net.send({ t: 'snap', s: snap, h: this.localId });
  }

  private eHeldFor(id: string): boolean {
    if (id === this.localId) return this.shooter.eHeld && !this.player.isDead();
    const b = this.bots.get(id);
    if (b) return b.eHeld;
    return this.remotePoses.get(id)?.e ?? false;
  }

  private startRound(): void {
    const m = this.match;
    // Taktik-Plan für die T-Bots (zufälliger Spot), Bots kaufen
    this.plan = this.rnd() < 0.5 ? 'a' : 'b';
    this.fillBots();
    // Wer nicht überlebt hat, startet mit frischem Inventar → Clients setzen ihre Munition zurück
    const keeps = new Map(Object.values(m.players).map((p) => [p.id, p.survived && p.alive && m.round.round > 1]));
    beginRound(m, (team, i) => this.world.spawnPose(team, i), this.rnd);
    for (const p of Object.values(m.players)) {
      if (p.bot) {
        botBuy(p.loadout, p.money, p.team, this.rnd);
        p.weapon = bestWeapon(p.loadout);
        const b = this.bots.get(p.id);
        if (b) {
          b.motion = { x: p.pose.x, y: p.pose.y + PLAYER.eye, z: p.pose.z, vy: 0, grounded: true };
          b.pose = { ...p.pose };
          b.path = [];
          b.pathTarget = null;
          b.mem = newBotMemory(b.rnd);
          b.blind = 0;
        }
      }
      this.emitSpawn(p, !keeps.get(p.id));
    }
    this.nades = [];
    this.smokes = [];
    this.bombPos = null;
    this.drops = [];
    this.pickupBlock.clear();
    this.emit({ k: 'round', what: 'start', round: m.round.round });
    this.broadcastSnapshot();
  }

  // ---------------------------------------------------------------- Host: Bots

  /** Debug/Smoke: Bots anhalten (deterministische Treffertests). */
  botsPaused = false;

  private tickBot(b: BotRuntime, dt: number): void {
    if (this.botsPaused) return;
    const m = this.match;
    const p = m.players[b.id];
    if (!p || !p.alive) {
      b.eHeld = false;
      return;
    }
    b.blind = Math.max(0, b.blind - dt);
    const def = WEAPONS[p.weapon] ?? WEAPONS['knife']!;
    const enemies = Object.values(m.players)
      .filter((q) => q.alive && q.team !== p.team && q.id !== b.id)
      .map((q) => ({ id: q.id, pos: { x: q.pose.x, y: q.pose.y, z: q.pose.z } }));
    // Rang innerhalb des eigenen Teams (gleichmäßige Aufteilung auf A/B unabhängig von den Bot-IDs)
    const teamIndex = Object.values(m.players).filter((q) => q.bot && q.team === p.team).map((q) => q.id).sort().indexOf(b.id);
    const decision = decideBot({
      self: { id: b.id, team: p.team, pos: { x: b.pose.x, y: b.pose.y, z: b.pose.z }, hasBomb: p.loadout.bomb, weaponRange: def.mode === 'melee' ? def.range : Math.min(def.range, BOT.sight), auto: def.rpm > 0, skill: this.options.botSkill, index: teamIndex },
      enemies: b.blind > 0 ? [] : enemies,
      solids: this.world.collider,
      smokes: this.smokes,
      zones: this.world.zones,
      bomb: { phase: m.round.bomb.phase, spot: m.round.bomb.spot, pos: this.bombPos ? { x: this.bombPos.x, y: this.bombPos.y - 0.15, z: this.bombPos.z } : null, dropped: (() => { const d = droppedBomb(this.drops); return d ? { x: d.x, y: d.y, z: d.z } : null; })() },
      phase: m.round.phase,
      plan: this.plan,
    }, b.mem, dt, b.rnd);

    // Waffe: Bombe in die Hand beim Pflanzen, sonst beste Waffe
    if (decision.plant && p.loadout.bomb) p.weapon = 'c4';
    else if (p.weapon === 'c4') p.weapon = bestWeapon(p.loadout);
    b.eHeld = decision.plant || decision.defuse;

    // Bewegung über Wegpunkte
    if (decision.moveTo && m.round.phase !== 'freeze') this.botMove(b, decision.moveTo, dt);
    else {
      b.motion = stepPlayer(b.motion, 0, 0, false, dt, this.world.collider);
      b.pose.x = b.motion.x;
      b.pose.y = b.motion.y - PLAYER.eye;
      b.pose.z = b.motion.z;
    }

    // Blick
    if (decision.lookAt) {
      const target = decision.target ? m.players[decision.target] : null;
      const ty = target ? 1.2 : 1.2;
      const aim = aimAt({ x: b.pose.x, y: b.pose.y + BOT.eye, z: b.pose.z }, { x: decision.lookAt.x, y: (target?.pose.y ?? decision.lookAt.y ?? b.pose.y) + ty, z: decision.lookAt.z });
      const yp = dirToYawPitch(aim.dir);
      b.pose.yaw = yp.yaw;
      b.pose.pitch = yp.pitch;
    }
    p.pose = { ...b.pose };

    // Schießen
    const gun = p.loadout.guns[p.weapon];
    if (gun) tickGun(gun, def, dt);
    if (decision.fire && decision.target && def.mode !== 'throw' && def.mode !== 'plant') {
      const target = m.players[decision.target];
      if (!target) return;
      if (gun && gun.mag <= 0) {
        startReload(gun, def);
        return;
      }
      const interval = def.rpm > 0 ? 60 / def.rpm : 0.45;
      if (m.time - b.lastShotAt < interval) return;
      if (gun) {
        const r = tryShoot(gun, def);
        if (!r.ok) return;
      }
      b.lastShotAt = m.time;
      const eye = { x: b.pose.x, y: b.pose.y + BOT.eye, z: b.pose.z };
      const aim = aimAt(eye, { x: target.pose.x, y: target.pose.y + 1.1, z: target.pose.z });
      const err = aimError(b.mem.sightTime, this.options.botSkill);
      const base = spreadDir(aim.dir, err, b.rnd);
      const spread = gun ? fireSpread(def, gun, b.path.length > 0, false) : def.spreadBase;
      const dirs = shotDirs(def, base, spread, b.rnd);
      this.hostFire(b.id, def.id, eye, dirs);
      this.grenades.fx.muzzleFlash(this.soldierMuzzle(b.id) ?? { x: eye.x + aim.dir.x * 0.5, y: eye.y - 0.1, z: eye.z + aim.dir.z * 0.5 }, aim.dir, 0.8);
      // Schussklang kommt positioniert über das 'shot'-Ereignis (hostFire → onEvent)
    }
  }

  /** Mündung des sichtbaren Soldaten (Weltraum) oder null, wenn keiner existiert. */
  private soldierMuzzle(id: string): Vec3 | null {
    const sol = this.soldiers.get(id);
    if (!sol) return null;
    const v = sol.shotMuzzleWorld(new THREE.Vector3());
    return { x: v.x, y: v.y, z: v.z };
  }

  /** Bot läuft über den 3D-Navigationsgraphen (A* + geglätteter Pfad, Neuplanung bei Stillstand). */
  private botMove(b: BotRuntime, target: { x: number; z: number; y?: number }, dt: number): void {
    const goal: XYZ = { x: target.x, y: target.y ?? b.pose.y, z: target.z };
    const t = this.match.time;
    const moved = Math.hypot(b.pose.x - b.stuckRef.x, b.pose.z - b.stuckRef.z);
    b.stuckT += dt;
    if (moved > 0.6) {
      b.stuckT = 0;
      b.stuckRef = { x: b.pose.x, z: b.pose.z };
    }
    const stuck = b.stuckT > 1.2 && b.path.length > 0;
    const retarget = !b.pathTarget || Math.hypot(b.pathTarget.x - goal.x, b.pathTarget.z - goal.z) > 1.5 || Math.abs(b.pathTarget.y - goal.y) > 1.5;
    if ((retarget || stuck || b.pathAt >= b.path.length) && t >= b.repathAt) {
      const from: XYZ = { x: b.pose.x, y: b.pose.y, z: b.pose.z };
      const res = this.world.findPath(from, goal);
      b.path = res ? res.points : [];
      b.pathAt = 0;
      b.pathTarget = goal;
      b.repathAt = t + (stuck ? 0.3 : 0.5);
      if (stuck) {
        // seitlich ausweichen: kleiner Zufallsschritt vor dem neuen Pfad
        b.stuckT = 0;
        b.stuckRef = { x: b.pose.x, z: b.pose.z };
        b.path.unshift({ x: b.pose.x + (b.rnd() - 0.5) * 2, y: b.pose.y, z: b.pose.z + (b.rnd() - 0.5) * 2 });
      }
    }
    let gx = goal.x;
    let gz = goal.z;
    const wpt = b.path[b.pathAt];
    if (wpt) {
      gx = wpt.x;
      gz = wpt.z;
      if (Math.hypot(gx - b.pose.x, gz - b.pose.z) < 0.5 && Math.abs(wpt.y - b.pose.y) < 1.4) {
        b.pathAt += 1;
        return;
      }
    } else if (Math.hypot(gx - b.pose.x, gz - b.pose.z) < 0.4) {
      b.path = [];
      return;
    }
    const dx = gx - b.pose.x;
    const dz = gz - b.pose.z;
    const l = Math.hypot(dx, dz) || 1;
    b.motion = stepPlayer(b.motion, (dx / l) * BOT_SPEED, (dz / l) * BOT_SPEED, false, dt, this.world.collider);
    b.pose.x = b.motion.x;
    b.pose.y = b.motion.y - PLAYER.eye;
    b.pose.z = b.motion.z;
  }

  // ---------------------------------------------------------------- Host: Granaten

  private tickGrenades(dt: number): void {
    const m = this.match;
    for (const n of [...this.nades]) {
      const boom = stepGrenade(n.g, dt, this.world.collider);
      if (!boom) continue;
      const at = { ...n.g.pos };
      this.nades = this.nades.filter((x) => x !== n);
      this.emit({ k: 'boom', id: n.id, kind: n.g.kind, at: [at.x, at.y, at.z] });
      if (n.g.kind === 'he') {
        for (const p of Object.values(m.players)) {
          if (!p.alive) continue;
          const dmg = heDamageAt(at, { x: p.pose.x, y: p.pose.y + 1.0, z: p.pose.z }, this.world.collider);
          if (dmg <= 0) continue;
          const r = applyExplosion(m, p.id, n.g.owner, dmg);
          if (!r) continue;
          this.emit({ k: 'hit', victim: p.id, attacker: n.g.owner, dmg: r.dmg, part: 'body', from: [at.x, at.y, at.z], at: [p.pose.x, 1, p.pose.z] });
          if (r.killed) this.onHostKill(p, n.g.owner, 'hegrenade', false);
        }
      } else if (n.g.kind === 'smoke') {
        this.smokes.push({ pos: at, radius: GRENADE.smokeRadius, timeLeft: GRENADE.smokeDuration });
      } else if (n.g.kind === 'flash') {
        for (const b of this.bots.values()) {
          const p = m.players[b.id];
          if (!p?.alive) continue;
          const dir = { x: -Math.sin(b.pose.yaw), y: 0, z: -Math.cos(b.pose.yaw) };
          const s = flashStrength({ x: b.pose.x, y: b.pose.y + BOT.eye, z: b.pose.z }, dir, at, this.world.collider);
          if (s > 0.1) b.blind = Math.max(b.blind, GRENADE.flashDuration * s);
        }
      }
    }
  }

  // ---------------------------------------------------------------- Darstellung

  /** Zuschauer-Kamera: tot → lebende Teamkameraden (sonst alle) aus deren Sicht; Klick wechselt. */
  private updateSpectator(): void {
    const me = this.local;
    if (!this.player.isDead() || !me || this.match.round.phase === 'freeze') {
      if (this.specTarget) this.soldiers.get(this.specTarget)?.root && (this.soldiers.get(this.specTarget)!.root.visible = true);
      this.specTarget = null;
      this.player.spectate(null);
      return;
    }
    // Erst 2 s Todeskamera, dann zuschauen
    if (this.localDeadSince >= 0 && this.match.time - this.localDeadSince < 2) return;
    const alive = Object.values(this.match.players).filter((p) => p.alive && p.id !== this.localId);
    const mates = alive.filter((p) => p.team === me.team);
    const pool = mates.length ? mates : alive;
    if (!pool.length) {
      this.player.spectate(null);
      return;
    }
    const target = pool[((this.specIndex % pool.length) + pool.length) % pool.length]!;
    if (this.specTarget !== target.id) {
      if (this.specTarget) { const old = this.soldiers.get(this.specTarget); if (old) old.root.visible = true; }
      this.specTarget = target.id;
      this.hud.setSpectator(`Zuschauer: ${target.name} (${target.team}) — Klick = nächster Spieler`);
    }
    const s = this.soldiers.get(target.id);
    if (s) s.root.visible = false; // nicht durch das eigene Modell schauen
    const bot = this.bots.get(target.id);
    const r = this.remotePoses.get(target.id);
    const pose = this.isHost && bot ? bot.pose : r ? lerpPose(r.prev, r.next, r.t) : target.pose;
    this.player.spectate(pose);
  }

  /** Schritte/Sprünge aller Spieler (positioniert, je Oberfläche), Bombe (Tastenfeld, Entschärfen, Piepen). */
  private updateAudio(dt: number): void {
    if (!this.sfx) return;
    const movers: AudioMover[] = [];
    if (!this.player.isDead()) {
      // Eigenes Tempo aus der Eingabe (die Bewegung pro Frame ist gedeckelt und taugt bei wenig FPS nicht zur Schätzung)
      const speed = !this.player.moving() ? 0 : this.player.crouching() ? PLAYER.crouchSpeed : this.player.sprinting() ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      movers.push({ id: this.localId, x: this.player.motionX(), y: this.player.feetY(), z: this.player.motionZ(), crouch: this.player.crouching(), local: true, speed });
    }
    for (const p of Object.values(this.match.players)) {
      if (p.id === this.localId || !p.alive) continue;
      const bot = this.bots.get(p.id);
      const r = this.remotePoses.get(p.id);
      const pose = this.isHost && bot ? bot.pose : r ? lerpPose(r.prev, r.next, r.t) : p.pose;
      movers.push({ id: p.id, x: pose.x, y: pose.y, z: pose.z, crouch: r?.c ?? false, local: false });
    }
    const b = this.match.round.bomb;
    const actorId = b.phase === 'planting' ? this.planterId : b.phase === 'defusing' ? this.defuserId : null;
    // Akteur: eigener Spieler → nicht positioniert; bekannt (Host) → seine Pose; unbekannt (Client) → Bombenplatz
    const pose = actorId && actorId !== this.localId ? this.match.players[actorId]?.pose : undefined;
    const actor = actorId === this.localId ? null : pose ? { x: pose.x, y: pose.y + 0.8, z: pose.z } : undefined;
    this.audio.update(dt, movers, b, this.bombPos, actor);
  }

  private renderSoldiers(dt: number): void {
    const m = this.match;
    for (const p of Object.values(m.players)) {
      if (p.id === this.localId) continue;
      let s = this.soldiers.get(p.id);
      if (!s) {
        s = new Soldier(p.id, p.name, p.team);
        s.addTo(this.context.scene);
        this.soldiers.set(p.id, s);
      }
      if (s.team !== p.team) s.setTeam(p.team);
      if (s.name !== p.name) s.setName(p.name);
      s.setAlive(p.alive);
      s.setWeapon(p.weapon);
      let pose: Pose;
      let crouch = false;
      const bot = this.bots.get(p.id);
      if (this.isHost && bot) pose = bot.pose;
      else {
        const r = this.remotePoses.get(p.id);
        if (r) {
          r.t += dt * POSE_HZ;
          r.age += dt;
          pose = lerpPose(r.prev, r.next, r.t);
          crouch = r.c;
        } else pose = p.pose;
      }
      if (p.alive) s.setPose(pose, crouch);
    }
    for (const [id, s] of this.soldiers) {
      if (!m.players[id]) {
        s.dispose();
        this.soldiers.delete(id);
      }
    }
  }

  private updateHud(): void {
    const m = this.match;
    const me = this.local;
    const phase = m.round.phase;
    const bombLive = m.round.bomb.phase === 'planted' || m.round.bomb.phase === 'defusing';
    this.hud.setRound({
      phase,
      timer: Math.max(0, Math.ceil(bombLive ? m.round.bomb.fuseLeft : m.round.timer)),
      tRounds: m.round.tRounds,
      ctRounds: m.round.ctRounds,
      round: m.round.round,
      bombInfo: bombInfoText(m, this.planterId === this.localId || this.defuserId === this.localId),
      mapName: this.world.mapName,
      alive: aliveCounts(m),
      winner: m.winner,
      bombProgress: this.localBombProgress(),
      lobby: lobbyActive(m.round, this.lobbyCfg),
    });
    this.hud.setMatch(m, this.localId, this.net.online ? this.net.hostId : '');
    if (me) {
      this.hud.setPlayer({
        team: me.team,
        money: me.money.amount,
        armor: me.loadout.armor,
        helmet: me.loadout.helmet,
        hasBomb: me.loadout.bomb,
        hasKit: me.loadout.defuseKit,
        nades: me.loadout.grenades,
        alive: me.alive,
        canBuy: (phase === 'warmup' || phase === 'freeze' || (phase === 'live' && m.round.timer > ROUND.roundTime - 15)) && this.world.inBuyZone(me.team, this.localPose()),
      });
    }
    this.hud.setRadar(
      this.localPose(),
      Object.values(m.players).filter((p) => p.id !== this.localId).map((p) => {
        const bot = this.bots.get(p.id);
        const pose = this.isHost && bot ? bot.pose : this.remotePoses.get(p.id) ? lerpPose(this.remotePoses.get(p.id)!.prev, this.remotePoses.get(p.id)!.next, this.remotePoses.get(p.id)!.t) : p.pose;
        return { x: pose.x, z: pose.z, yaw: pose.yaw, team: p.team, alive: p.alive, id: p.id };
      }),
      me?.team ?? 'T',
      // Gelegte Bombe sehen alle; eine liegende C4 nur die Terroristen (wie im CS-Radar)
      this.bombPos ?? (me?.team === 'T' ? (() => { const d = droppedBomb(this.drops); return d ? { x: d.x, y: d.y, z: d.z } : null; })() : null),
    );
    if (this.hud.scoreboardVisible) this.hud.setScoreboard(m, this.localId);
    // Interaktions-Hinweis: im Spot mit Bombe
    if (me?.alive && me.team === 'T' && me.loadout.bomb && phase === 'live') {
      const s = this.world.siteAt(this.localPose());
      const site = s ? this.world.sites.find((q) => q.id === (s === 'a' ? 'A' : 'B')) : null;
      this.hud.setHint(site ? `E halten: Bombe legen (${site.name})` : 'Bombenspot A/B aufsuchen (Radar)');
    } else if (me?.alive && me.team === 'CT' && phase === 'bomb' && this.bombPos && Math.hypot(this.player.motionX() - this.bombPos.x, this.player.motionZ() - this.bombPos.z) <= BOT.spotRadius && Math.abs(this.player.feetY() - this.bombPos.y) < 1.6) {
      this.hud.setHint(`E halten: Bombe entschärfen${me.loadout.defuseKit ? ' (Kit)' : ''}`);
    } else this.hud.setHint(null);
  }

  /** Fortschritt fürs HUD, wenn der lokale Spieler gerade legt/entschärft. */
  private localBombProgress(): { kind: 'plant' | 'defuse'; value: number } | null {
    const b = this.match.round.bomb;
    const me = this.local;
    if (!me?.alive) return null;
    const acting = this.isHost ? this.planterId === this.localId || this.defuserId === this.localId : this.shooter.eHeld;
    if (!acting) return null;
    if (b.phase === 'planting' && me.team === 'T') return { kind: 'plant', value: b.progress };
    if (b.phase === 'defusing' && me.team === 'CT') return { kind: 'defuse', value: b.progress };
    return null;
  }

  /** Server-Konfiguration (null = offline/ohne Lobby). */
  get lobbyConfig(): LobbyConfig | null {
    return this.lobbyCfg;
  }

  /** Serverlobby aktiv (Aufwärmen gehalten, bis der Host startet)? */
  get lobbyHeld(): boolean {
    return lobbyActive(this.match.round, this.lobbyCfg);
  }

  /** Host: Serverlobby beenden — nach kurzem Countdown beginnt Runde 1. */
  startMatch(): boolean {
    if (!this.isHost || !this.lobbyCfg?.hold) return false;
    this.lobbyCfg = { ...this.lobbyCfg, hold: false };
    this.match.round.timer = Math.min(this.match.round.timer, 3);
    this.broadcastSnapshot();
    return true;
  }

  /** Letzte Chatzeilen (Serverlobby-Anzeige). */
  get chatHistory(): readonly { who: string; text: string; team: Team | null }[] {
    return this.chatLines;
  }

  /** Debug/Smoke: kompakter Zustand. */
  debugState(): Record<string, unknown> {
    const m = this.match;
    return {
      host: this.isHost,
      phase: m.round.phase,
      timer: Math.ceil(m.round.timer),
      round: m.round.round,
      score: `${m.round.tRounds}:${m.round.ctRounds}`,
      bomb: m.round.bomb.phase,
      players: Object.values(m.players).length,
      bots: this.bots.size,
      alive: aliveCounts(m),
      money: this.local?.money.amount,
      hp: this.local?.hp,
      nades: this.nades.length,
      smokes: this.smokes.length,
      drops: this.drops.length,
      chat: this.chatLines.at(-1)?.text ?? null,
      dropViews: this.dropView.count(),
      weapon: this.shooter.weaponId,
      secondary: this.local?.loadout.secondary ?? null,
      lobby: this.lobbyHeld,
    };
  }

  debugCounters(): Record<string, number> {
    return { ...this.counters };
  }

  /** Debug/Smoke: alle Gegner-Bots töten (Rundenlogik testen). */
  debugKillTeam(team: Team): void {
    for (const p of Object.values(this.match.players)) {
      if (p.team !== team || !p.alive) continue;
      const r = applyHit(this.match, p.id, this.localId, WEAPONS['awp']!, 'head', 0);
      if (r?.killed) this.onHostKill(p, this.localId, 'awp', true);
    }
  }

  /** Debug/Smoke: lokalen Spieler im Match wiederbeleben (Host). */
  debugRevive(): void {
    const me = this.match.players[this.localId];
    if (me) {
      me.alive = true;
      me.hp = 100;
    }
    this.player.hp = 100;
    this.player.setDead(false);
    this.hud.setSpectator(null);
  }

  /** Debug/Netztest: beliebigen Spieler auf dem Host wiederbeleben. */
  debugReviveId(id: string): boolean {
    const p = this.match.players[id];
    if (!p) return false;
    p.alive = true;
    p.hp = 100;
    return true;
  }

  /** Debug/Smoke: Spieler teleportieren. */
  debugTeleport(x: number, z: number, yaw = 0, y?: number): void {
    this.player.spawn(x, z, yaw, y ?? this.world.groundAt(x, z));
  }

  /** Debug: Position eines Bots. */
  debugBotPos(): { id: string; x: number; z: number; alive: boolean }[] {
    return [...this.bots.values()].map((b) => ({ id: b.id, x: +b.pose.x.toFixed(2), y: +b.pose.y.toFixed(2), z: +b.pose.z.toFixed(2), alive: !!this.match.players[b.id]?.alive, area: this.world.areaAt(b.pose)?.name ?? null }));
  }

  /** Debug/Smoke: Mündung (Weltraum) der sichtbaren Spielfigur und ihr Fußpunkt. */
  debugSoldierMuzzle(id: string): { x: number; y: number; z: number; rx: number; rz: number; ry: number } | null {
    const s = this.soldiers.get(id);
    if (!s) return null;
    const m = s.muzzleWorld(new THREE.Vector3());
    return { x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2), rx: +s.root.position.x.toFixed(2), rz: +s.root.position.z.toFixed(2), ry: +s.root.position.y.toFixed(2) };
  }
}

function buyReason(r: string): string {
  return ({ money: 'Nicht genug Geld', team: 'Nicht für dein Team', unknown: 'Unbekannter Artikel', full: 'Maximum erreicht', owned: 'Bereits vorhanden' } as Record<string, string>)[r] ?? r;
}

function bombInfoText(m: MatchState, meActing: boolean): string {
  const b = m.round.bomb;
  switch (b.phase) {
    case 'planting': return `${meActing ? 'Du legst die Bombe' : 'Bombe wird gelegt'}… ${Math.round(b.progress * 100)} %`;
    case 'planted': return `Bombe aktiv — ${Math.ceil(b.fuseLeft)} s`;
    case 'defusing': return `${meActing ? 'Du entschärfst' : 'Entschärfung'}… ${Math.round(b.progress * 100)} % (${Math.ceil(b.fuseLeft)} s)`;
    case 'defused': return 'Bombe entschärft';
    case 'exploded': return 'Bombe explodiert';
    default: return '';
  }
}

export type { WeaponDef };
