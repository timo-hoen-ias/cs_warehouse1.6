import { onStart, type Context } from '@needle-tools/engine';
import * as THREE from 'three';
import type { LevelFile } from './shared/level';
import { World } from './game/World';
import { FpsPlayer } from './player/FpsPlayer';
import { Shooter } from './weapons/Shooter';
import { ViewModel } from './weapons/ViewModel';
import { Fx } from './weapons/Fx';
import { Grenades } from './weapons/Grenades';
import { MatchDriver } from './game/MatchDriver';
import { Hud } from './ui/Hud';
import { showLobby, roomLink, type LobbyResult } from './ui/Lobby';
import { LocalTransport, NeedleTransport, type NetTransport } from './multi/Transport';
import { Sfx } from './audio/Sfx';
import { mapById } from './logic/maps';
import { WEAPONS } from './logic/weapons';

/** Karten lazy laden (Vite bündelt jede als eigenes Chunk). */
const LEVELS = import.meta.glob<{ default: LevelFile }>('../levels/*.json');

async function loadLevel(mapId: string): Promise<LevelFile> {
  const key = `../levels/${mapId}.json`;
  const loader = LEVELS[key] ?? LEVELS[`../levels/${mapById(mapId).id}.json`];
  if (!loader) throw new Error(`Karte fehlt: ${mapId}`);
  return (await loader()).default;
}

/**
 * Spiel-Start: Lobby → Karte laden → Welt + Spieler + Driver. Offline = lokaler
 * Host mit Bots; online = Needle-Raum (Host = kleinste Verbindungs-ID).
 */
onStart(async (context) => {
  const scene = context.scene;
  scene.background = new THREE.Color(0x15181d);
  scene.fog = new THREE.Fog(0x15181d, 70, 200);
  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x40301a, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.4);
  sun.position.set(30, 50, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);
  context.renderer.shadowMap.enabled = true;
  context.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const cam = context.mainCamera as THREE.PerspectiveCamera;
  cam.rotation.order = 'YXZ';
  cam.far = 250;
  cam.near = 0.05;

  // Smoke/Automation: ?auto=1 überspringt die Lobby (offline, Standardkarte)
  const url = new URL(window.location.href);
  const auto = url.searchParams.get('auto');
  const lobby: LobbyResult = auto
    ? { name: 'Smoke', mapId: url.searchParams.get('map') ?? mapById(undefined).id, team: 'T', mode: 'offline', room: '', fillTo: Number(url.searchParams.get('fill') ?? 4), botSkill: 0.6 }
    : await showLobby();

  const level = await loadLevel(lobby.mapId);
  await startGame(context, level, lobby);
});

async function startGame(context: Context, level: LevelFile, lobby: LobbyResult): Promise<void> {
  const scene = context.scene;
  const world = new World(level);
  scene.add(world.group);

  const sfx = new Sfx();
  const unlock = (): void => sfx.unlock();
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  const hud = new Hud();
  hud.mount(world.solids);
  hud.setRadarLabel(world.mapName);

  const playerRoot = new THREE.Object3D();
  scene.add(playerRoot);
  const player = playerRoot.addComponent(FpsPlayer);
  player.solids = world.solids;
  const shooter = playerRoot.addComponent(Shooter);
  shooter.solids = world.solids;
  shooter.aabbs = world.aabbs;
  shooter.player = player;
  shooter.onHud = (s) => hud.update(s);
  shooter.menuOpen = () => hud.menuOpen();
  shooter.blocked = () => player.isDead() || player.frozen;
  shooter.onShotSfx = (w) => sfx.shot(w, 0);
  shooter.onEmptyClick = () => sfx.play('empty');
  shooter.onReload = () => sfx.play('reload');
  hud.onMenuChange = (open) => { player.inputEnabled = !open; };

  const fx = playerRoot.addComponent(Fx);
  const viewModel = playerRoot.addComponent(ViewModel);
  viewModel.solids = world.solids;
  shooter.fx = fx;
  shooter.viewModel = viewModel;
  const grenades = playerRoot.addComponent(Grenades);
  grenades.fx = fx;

  let net: NetTransport;
  if (lobby.mode === 'offline') net = new LocalTransport();
  else net = new NeedleTransport(context, `csw16-${lobby.room}`);

  const driver = playerRoot.addComponent(MatchDriver);
  driver.world = world;
  driver.net = net;
  driver.player = player;
  driver.shooter = shooter;
  driver.hud = hud;
  driver.grenades = grenades;
  driver.sfx = sfx;
  driver.options = { localName: lobby.name, team: lobby.team, fillTo: lobby.fillTo, botSkill: lobby.botSkill };
  shooter.loadout = () => driver.local?.loadout;

  // Startposition bis zum ersten Spawn
  const t = world.spawnPose('T', 0);
  player.spawn(t.x, t.z, t.yaw);
  shooter.setWeapon('knife');

  // HUD-Overlay-Tick
  playerRoot.addComponent(HudTicker).hud = hud;

  if (lobby.mode !== 'offline') {
    const link = roomLink(lobby.room, lobby.mapId);
    hud.notice(`Raumcode ${lobby.room} — Link in der Adressleiste teilen`);
    history.replaceState(null, '', link);
    hud.setNetInfo(`Verbinde mit Raum ${lobby.room}…`);
  }

  // Debug-Hooks (Smoke-Tests, DevTools)
  if (import.meta.env?.DEV) {
    const g = globalThis as Record<string, unknown>;
    g.__csw = {
      solids: world.solids.length,
      hasCam: !!context.mainCamera,
      sceneChildren: scene.children.length,
      map: world.mapName,
    };
    g.__frames = () => {
      const info = context.renderer?.info?.render;
      return info ? { calls: info.calls, triangles: info.triangles } : null;
    };
    g.__state = () => driver.debugState();
    g.__bots = () => driver.debugBotPos();
    g.__pos = () => ({ x: +player.motionX().toFixed(2), z: +player.motionZ().toFixed(2), yaw: +player.yawNow().toFixed(2), hp: player.hp, dead: player.isDead() });
    g.__killTeam = (team: 'T' | 'CT') => { driver.debugKillTeam(team); return driver.debugState(); };
    g.__buy = (item: string) => { driver.requestBuy(item); return driver.local?.loadout; };
    g.__switch = (slot: number) => { shooter.selectSlot(slot); return { weapon: shooter.weaponId }; };
    g.__weapon = (id: string) => { shooter.setWeapon(id); return { weapon: shooter.weaponId }; };
    g.__vm = () => ({ loaded: viewModel.hasModel(), meshes: viewModel.meshCount(), verts: viewModel.vertexCount() });
    g.__vmAim = () => {
      const c = context.mainCamera as THREE.PerspectiveCamera;
      const w = viewModel.muzzleWorld(new THREE.Vector3());
      const rel = w.clone().sub(c.getWorldPosition(new THREE.Vector3())).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()).invert());
      return { x: +rel.x.toFixed(2), y: +rel.y.toFixed(2), z: +rel.z.toFixed(2) };
    };
    g.__decals = () => fx.decalStats();
    g.__fxWall = () => fx.wallDecals;
    g.__nades = () => grenades.count();
    g.__teleport = (x: number, z: number, yaw = 0) => { driver.debugTeleport(x, z, yaw); return g.__pos; };
    g.__zones = () => world.zones;
    g.__aimAtBot = () => {
      // Deterministisch auf den nächsten lebenden Gegner-Bot zielen (Körpermitte) und AWP-Schuss
      const me = driver.local;
      const enemies = Object.values(driver.match.players).filter((p) => p.alive && p.team !== me?.team);
      if (!enemies.length) return { error: 'kein Gegner' };
      const e = enemies[0]!;
      const px = e.pose.x - 4;
      const pz = e.pose.z;
      player.spawn(px, pz, 0);
      player.setDead(false);
      const dx = e.pose.x - px;
      const dz = e.pose.z - pz;
      const dist = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.asin((1.0 - 1.65) / dist);
      player.setLook(yaw, pitch);
      if (me && !me.loadout.primary) { me.loadout.primary = 'awp'; me.loadout.guns['awp'] = { mag: 10, reserve: 30, cooldown: 0, reloadLeft: 0, heat: 0 }; }
      shooter.setWeapon('awp');
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 60);
      }, 250);
      return { ok: true, target: e.id, hp: e.hp, dist: +dist.toFixed(2) };
    };
    g.__enemyHp = () => Object.values(driver.match.players).filter((p) => p.team !== driver.local?.team).map((p) => ({ id: p.id, hp: p.hp, alive: p.alive }));
    g.__wallShot = () => {
      const wall = world.solids.find((s) => s.kind === 'wall' && s.label === 'wand-ost');
      if (!wall) return { error: 'wand-ost fehlt' };
      player.spawn(wall.minX - 3, (wall.minZ + wall.maxZ) / 2, -Math.PI / 2);
      player.setDead(false);
      player.setLook(-Math.PI / 2, 0.35);
      shooter.setWeapon(driver.local?.loadout.secondary ?? 'glock');
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 60);
      }, 120);
      return { ok: true };
    };
    g.__throwNade = (kind: 'he' | 'flash' | 'smoke') => {
      const me = driver.local;
      if (!me) return { error: 'kein Spieler' };
      me.loadout.grenades[kind] = 1;
      const id = ({ he: 'hegrenade', flash: 'flashbang', smoke: 'smokegrenade' } as const)[kind];
      shooter.setWeapon(id);
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 80);
      }, 150);
      return { ok: true, weapon: shooter.weaponId };
    };
    g.__plantTest = () => {
      const me = driver.local;
      if (!me || driver.match.round.phase !== 'live') return { error: 'phase: ' + driver.match.round.phase };
      me.loadout.bomb = true;
      for (const p of Object.values(driver.match.players)) if (p.id !== me.id) p.loadout.bomb = false;
      const a = world.zones.a;
      player.spawn(a.x, a.z, 0);
      player.setDead(false);
      shooter.setWeapon('c4');
      setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true })), 100);
      setTimeout(() => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true })), 5000);
      return { ok: true };
    };
    g.__weapons = () => Object.keys(WEAPONS);
  }

  // Hinweis bis PointerLock
  const hint = document.createElement('div');
  Object.assign(hint.style, {
    position: 'fixed', top: '44px', left: '50%', transform: 'translateX(-50%)', color: '#dfe6ee', font: '12px Consolas, monospace',
    background: 'rgba(10,13,18,.6)', padding: '4px 12px', borderRadius: '6px', pointerEvents: 'none', zIndex: '20',
  });
  hint.textContent = 'Klick ins Spiel = Maus fangen · Esc = Maus frei · B kaufen · Tab Scoreboard';
  document.body.appendChild(hint);
  document.addEventListener('pointerlockchange', () => {
    hint.style.display = document.pointerLockElement ? 'none' : 'block';
  });
}

import { Behaviour, registerType } from '@needle-tools/engine';

/** Kleiner Helfer: HUD-Overlays pro Frame abklingen lassen. */
@registerType
class HudTicker extends Behaviour {
  hud!: Hud;
  update(): void {
    this.hud.tick(Math.min(this.context.time.deltaTime, 0.1));
  }
}
