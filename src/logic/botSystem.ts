import { BotBody } from './botBody';
import { BotBrain, type BrainInput, type Intent, type SeenEnemy } from './botBrain';
import { applyBuy, botBuyList, teamBuyKind, type BotRole, type BuyKind } from './botBuy';
import { CTCoach, TCoach, type CoachBot, type CoachCtx } from './botCoach';
import { aimError } from './botDecide';
import { decay, markDead, newKnowledge, report, resetKnowledge, sighting, type TeamKnowledge } from './botKnowledge';
import { enemyOf, zoneAt, type BotMapInfo, type SiteId } from './botMap';
import { SENSE, canSeePlayer, footstepRange, heardPosition, shotRange } from './botPerception';
import { pickTPlan, type TPlanKind } from './botStrategy';
import { shotDirs, spreadDir } from './combat';
import type { Team } from './economy';
import { fireSpread, startReload, tickGun, tryShoot } from './fire';
import type { Smoke } from './grenade';
import { bestWeapon, GRENADE_ID } from './loadout';
import type { MatchPlayer, MatchState, Pose } from './match';
import type { XYZ } from './nav';
import { BOT_RADIO, radioAllowed, type BotRadioKey } from './radio';
import { mulberry32 } from './rng';
import { WEAPONS, type GrenadeKind } from './weapons';

/**
 * Bot-System (pure): verbindet Karten-Analyse, Team-Trainer (T/CT), Wahrnehmung,
 * Team-Wissen, Gehirn und Körper aller Bots. Der Host (MatchDriver) und die
 * Headless-Simulation (botSim) rufen nur `roundStart`, `tick` und `notify` auf und
 * führen Schüsse/Würfe/Funk über `BotActions` aus — dieselbe Logik im Spiel und im Test.
 *
 * Budget: Sicht je Bot alle 0.1 s (gestaffelt), Schritte hören alle 0.3 s, Trainer alle
 * 0.25 s; Wege werden nur bei Auftragswechsel/Stillstand neu geplant (≤ 1× je 0.6 s).
 */
export type BotActions = {
  fire(id: string, weapon: string, origin: XYZ, dirs: XYZ[]): void;
  throwNade(id: string, kind: GrenadeKind, origin: XYZ, dir: XYZ, strength: number): void;
  radio(id: string, text: string): void;
};

export type BotWorldView = {
  match: MatchState;
  smokes: readonly Smoke[];
  /** Gelegte Bombe (Position) oder null. */
  bombPos: XYZ | null;
  /** Liegende C4 oder null. */
  dropped: XYZ | null;
  /** Geduckt? (für Nicht-Bots; Bots kennt das System selbst). */
  crouching: (id: string) => boolean;
};

export type BotEvent =
  | { k: 'shot'; id: string; pos: XYZ; weapon: string }
  | { k: 'hit'; victim: string; attacker: string | null; from: XYZ }
  | { k: 'kill'; victim: string; killer: string | null; pos: XYZ }
  | { k: 'boom'; pos: XYZ };

type Unit = {
  id: string;
  team: Team;
  brain: BotBrain;
  body: BotBody;
  rnd: () => number;
  /** Sicht-Takt (gestaffelt) und zuletzt sichtbare Gegner. */
  seeT: number;
  hearT: number;
  visible: SeenEnemy[];
  blind: number;
  /** Gehaltene Waffe und Restzeit des Waffenwechsels. */
  weapon: string;
  switchT: number;
  eHeld: boolean;
  lastShot: number;
  intent: Intent | null;
  role: BotRole;
};

export type BotSystemOpts = { skill: number; seed?: number };

/** Persönlicher Skill: Grundwert ± 0.12 je Bot (deterministisch aus der ID). */
export function botSkill(base: number, id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const r = mulberry32(h)();
  return Math.min(1, Math.max(0, base + (r - 0.5) * 0.24));
}

export class BotSystem {
  readonly info: BotMapInfo;
  private baseSkill: number;
  private readonly units = new Map<string, Unit>();
  readonly know: Record<Team, TeamKnowledge> = { T: newKnowledge('T'), CT: newKnowledge('CT') };
  coachT: TCoach | null = null;
  coachCT: CTCoach | null = null;
  private readonly radioLog: Record<Team, Map<string, number>> = { T: new Map(), CT: new Map() };
  private readonly motion = new Map<string, { x: number; z: number; speed: number }>();
  private liveAt = -1;
  private coachT0 = 0;
  private lastPlan: TPlanKind | null = null;
  private readonly rnd: () => number;
  buyKind: Record<Team, BuyKind> = { T: 'pistol', CT: 'pistol' };

  constructor(info: BotMapInfo, opts: BotSystemOpts) {
    this.info = info;
    this.baseSkill = opts.skill;
    this.rnd = mulberry32((opts.seed ?? 1) * 2654435761);
  }

  set skill(v: number) {
    this.baseSkill = v;
    for (const u of this.units.values()) u.brain.skill = botSkill(v, u.id);
  }

  get skill(): number {
    return this.baseSkill;
  }

  has(id: string): boolean {
    return this.units.has(id);
  }

  ids(): string[] {
    return [...this.units.keys()];
  }

  add(p: MatchPlayer): void {
    if (this.units.has(p.id)) return;
    const seed = Number(p.id.replace(/\D/g, '')) || 1;
    const rnd = mulberry32(seed * 7919 + 17);
    this.units.set(p.id, {
      id: p.id, team: p.team, brain: new BotBrain(p.id, p.team, botSkill(this.baseSkill, p.id), rnd), body: new BotBody(p.pose), rnd,
      seeT: (seed % 7) * 0.014, hearT: (seed % 5) * 0.06, visible: [], blind: 0, weapon: p.weapon, switchT: 0, eHeld: false, lastShot: -10, intent: null, role: 'support',
    });
  }

  remove(id: string): void {
    this.units.delete(id);
  }

  /** Bot an eine Pose setzen (Spawn, Teamwechsel). */
  place(p: MatchPlayer): void {
    const u = this.units.get(p.id);
    if (!u) return;
    if (u.team !== p.team) {
      this.units.delete(p.id);
      this.add(p);
      return;
    }
    u.body.reset(p.pose);
    u.weapon = p.weapon;
    u.visible = [];
    u.blind = 0;
    u.eHeld = false;
  }

  pose(id: string): Pose | null {
    return this.units.get(id)?.body.pose ?? null;
  }
  crouching(id: string): boolean {
    return this.units.get(id)?.body.crouch ?? false;
  }
  eHeld(id: string): boolean {
    return this.units.get(id)?.eHeld ?? false;
  }
  moving(id: string): boolean {
    return (this.units.get(id)?.body.speed ?? 0) > 0.3;
  }
  body(id: string): BotBody | null {
    return this.units.get(id)?.body ?? null;
  }
  /** Blendung (s). */
  blind(id: string, seconds: number): void {
    const u = this.units.get(id);
    if (u) u.blind = Math.max(u.blind, seconds);
  }
  /** Debug: Zustand, Auftrag, Rolle. */
  state(id: string): { state: string; task: string | null; role: BotRole } | null {
    const u = this.units.get(id);
    if (!u) return null;
    const coach = u.team === 'T' ? this.coachT : this.coachCT;
    return { state: u.intent?.state ?? '', task: coach?.tasks.get(id)?.label ?? null, role: u.role };
  }

  /**
   * Rundenstart (nach `beginRound`): Wissen zurücksetzen, Körper an die Spawns, Team-Kauf
   * (Economy-Entscheidung + Rollen), Pläne beider Teams und erste Aufträge.
   */
  roundStart(m: MatchState): void {
    resetKnowledge(this.know.T);
    resetKnowledge(this.know.CT);
    this.liveAt = -1;
    for (const u of this.units.values()) {
      const p = m.players[u.id];
      if (p) this.place(p);
    }
    const awp: Record<Team, string | null> = { T: null, CT: null };
    for (const team of ['T', 'CT'] as Team[]) {
      const players = Object.values(m.players).filter((p) => p.team === team);
      const kind = teamBuyKind(team, players.map((p) => p.money.amount), m.round.round, m.lossStreak[team], this.rnd);
      this.buyKind[team] = kind;
      const bots = players.filter((p) => this.units.has(p.id)).sort((a, b) => b.money.amount - a.money.amount);
      // Scharfschütze: der reichste Bot bei Vollkauf (ab 3 Spielern, ordentlicher Skill)
      if (kind === 'full' && players.length >= 3 && this.baseSkill >= 0.4 && bots[0] && (bots[0].money.amount >= 5750 || bots[0].loadout.primary === 'awp')) awp[team] = bots[0].id;
      bots.forEach((p, i) => {
        const u = this.units.get(p.id)!;
        u.role = p.id === awp[team] ? 'awp' : team === 'T' ? (i % 3 === 1 ? 'entry' : 'support') : i % 2 === 0 ? 'anchor' : 'rotator';
        applyBuy(p.loadout, p.money, team, botBuyList(p.loadout, p.money.amount, team, kind, u.role, u.brain.skill, u.rnd));
        p.weapon = bestWeapon(p.loadout);
        u.weapon = p.weapon;
      });
    }
    const ctxT = this.coachCtx(m, 'T', null);
    const plan = pickTPlan(this.info, this.buyKind.T, ctxT.bots.length + Object.values(m.players).filter((p) => p.team === 'T' && !p.bot).length, this.rnd, this.lastPlan);
    this.lastPlan = plan.kind;
    this.coachT = new TCoach(plan);
    this.coachT.start(ctxT);
    for (const [id, role] of this.coachT.roles) {
      const u = this.units.get(id);
      if (u && u.role !== 'awp') u.role = role;
    }
    this.coachCT = new CTCoach();
    this.coachCT.start(this.coachCtx(m, 'CT', null), awp.CT);
    for (const u of this.units.values()) if (u.team === 'CT' && u.role !== 'awp') u.role = this.coachCT.role(u.id);
  }

  private coachCtx(m: MatchState, team: Team, w: BotWorldView | null): CoachCtx {
    const now = m.time;
    const bots: CoachBot[] = [];
    for (const u of this.units.values()) {
      const p = m.players[u.id];
      if (!p || !p.alive || p.team !== team) continue;
      bots.push({ id: u.id, pos: { x: u.body.pose.x, y: u.body.pose.y, z: u.body.pose.z }, hasBomb: p.loadout.bomb, hasKit: p.loadout.defuseKit, nades: { ...p.loadout.grenades }, fighting: u.brain.engaged });
    }
    const b = m.round.bomb;
    const k = this.know[team];
    const dropped = w?.dropped ?? null;
    return {
      info: this.info,
      now,
      elapsed: this.liveAt >= 0 ? now - this.liveAt : 0,
      timeLeft: b.phase === 'planted' || b.phase === 'defusing' ? b.fuseLeft : m.round.timer,
      bots,
      enemyAlive: Object.values(m.players).filter((p) => p.alive && p.team !== team).length,
      know: k,
      bomb: {
        phase: b.phase,
        spot: b.spot,
        pos: w?.bombPos ?? null,
        // T sehen die liegende C4 im Radar, CT nur, wenn gesichtet
        dropped: team === 'T' ? dropped : k.bomb?.state === 'dropped' ? k.bomb.pos : null,
        fuseLeft: b.fuseLeft,
      },
      rnd: this.rnd,
      radio: (id, key) => this.sendRadio(id, team, key, now),
    };
  }

  private actions: BotActions | null = null;

  private sendRadio(id: string, team: Team, key: BotRadioKey, now: number): void {
    if (!this.actions) return;
    if (radioAllowed(this.radioLog[team], key, now)) this.actions.radio(id, BOT_RADIO[key]);
  }

  /** Ereignisse aus dem Spiel (Schüsse, Treffer, Kills, Explosionen). */
  notify(ev: BotEvent, m: MatchState): void {
    const now = m.time;
    switch (ev.k) {
      case 'shot': {
        const shooter = m.players[ev.id];
        if (!shooter) break;
        const range = shotRange(ev.weapon);
        for (const u of this.units.values()) {
          const p = m.players[u.id];
          if (!p?.alive || p.team === shooter.team) continue;
          const d = Math.hypot(u.body.pose.x - ev.pos.x, u.body.pose.z - ev.pos.z);
          if (d > range) continue;
          const heard = heardPosition(u.body.pose, ev.pos, u.rnd);
          u.brain.onHeard(heard, now);
          report(this.know[p.team], sighting(this.info, ev.id, heard, now, 'shot'));
        }
        break;
      }
      case 'hit': {
        const u = this.units.get(ev.victim);
        if (u) u.brain.onDamaged(ev.from, now);
        const victim = m.players[ev.victim];
        if (victim && ev.attacker && m.players[ev.attacker]?.team !== victim.team) {
          report(this.know[victim.team], sighting(this.info, ev.attacker, { x: ev.from.x, y: ev.from.y - 1.6, z: ev.from.z }, now, 'damage'));
        }
        break;
      }
      case 'kill': {
        const victim = m.players[ev.victim];
        if (!victim) break;
        markDead(this.know[enemyOf(victim.team)], ev.victim);
        this.know[victim.team].mateDeaths.push({ pos: { ...ev.pos }, t: now, zone: zoneAt(this.info, ev.pos) });
        const killer = ev.killer ? m.players[ev.killer] : undefined;
        if (killer && killer.team !== victim.team) {
          report(this.know[victim.team], sighting(this.info, killer.id, { x: killer.pose.x, y: killer.pose.y, z: killer.pose.z }, now, 'damage'));
          this.units.get(killer.id)?.brain.onKill(now);
        }
        const u = this.units.get(ev.victim);
        if (u) u.eHeld = false;
        break;
      }
      case 'boom':
        for (const u of this.units.values()) {
          if (Math.hypot(u.body.pose.x - ev.pos.x, u.body.pose.z - ev.pos.z) < SENSE.boom) u.brain.onHeard(ev.pos, now);
        }
        break;
    }
  }

  /** Ein Simulationsschritt aller Bots (dt in s, Spielzeit über match.time). */
  tick(w: BotWorldView, dt: number, act: BotActions): void {
    this.actions = act;
    const m = w.match;
    const now = m.time;
    const phase = m.round.phase;
    if ((phase === 'live' || phase === 'bomb') && this.liveAt < 0) this.liveAt = now;
    this.trackMotion(m, dt);
    decay(this.know.T, now);
    decay(this.know.CT, now);
    const bomb = m.round.bomb;
    if ((bomb.phase === 'planted' || bomb.phase === 'defusing') && w.bombPos) {
      for (const t of ['T', 'CT'] as Team[]) {
        const k = this.know[t];
        if (k.bomb?.state !== 'planted' && k.bomb?.state !== 'defusing') k.bomb = { pos: { ...w.bombPos }, t: now, state: 'planted' };
        k.bomb!.state = bomb.phase === 'defusing' ? 'defusing' : 'planted';
      }
    }
    // Trainer
    if (phase === 'live' || phase === 'bomb') {
      this.coachT0 -= dt;
      if (this.coachT0 <= 0) {
        this.coachT0 = 0.25;
        this.coachT?.update(this.coachCtx(m, 'T', w));
        this.coachCT?.update(this.coachCtx(m, 'CT', w));
      }
    }
    for (const u of this.units.values()) this.tickUnit(u, w, dt, act);
  }

  private trackMotion(m: MatchState, dt: number): void {
    for (const p of Object.values(m.players)) {
      const prev = this.motion.get(p.id);
      if (!prev) {
        this.motion.set(p.id, { x: p.pose.x, z: p.pose.z, speed: 0 });
        continue;
      }
      const d = Math.hypot(p.pose.x - prev.x, p.pose.z - prev.z);
      const v = dt > 0 && d < 3 ? d / dt : 0;
      prev.speed += (v - prev.speed) * Math.min(1, dt * 8);
      prev.x = p.pose.x;
      prev.z = p.pose.z;
    }
  }

  private tickUnit(u: Unit, w: BotWorldView, dt: number, act: BotActions): void {
    const m = w.match;
    const p = m.players[u.id];
    if (!p || !p.alive) {
      u.eHeld = false;
      return;
    }
    const now = m.time;
    const info = this.info;
    const team = p.team;
    const live = m.round.phase === 'live' || m.round.phase === 'bomb';
    u.blind = Math.max(0, u.blind - dt);
    u.switchT = Math.max(0, u.switchT - dt);
    if (live) this.perceive(u, p, w, dt);
    const coach = team === 'T' ? this.coachT : this.coachCT;
    const task = live ? coach?.tasks.get(u.id) ?? null : null;
    const mates: XYZ[] = [];
    for (const q of Object.values(m.players)) if (q.alive && q.team === team && q.id !== u.id) mates.push(this.units.get(q.id)?.body.pose ?? q.pose);
    const gun = p.loadout.guns[u.weapon];
    const input: BrainInput = {
      now, elapsed: this.liveAt >= 0 ? now - this.liveAt : 0, dt, phase: m.round.phase, info, col: info.col, smokes: w.smokes,
      self: {
        pos: u.body.feet, eye: u.body.eye, yaw: u.body.pose.yaw, hp: p.hp, loadout: p.loadout, weapon: u.weapon, crouch: u.body.crouch,
        stillFor: u.body.stillFor, reloading: !!gun && gun.reloadLeft > 0, blind: u.blind, ahead: u.body.ahead, inSite: this.inSite(u.body.feet),
      },
      visible: u.blind > 0.6 ? [] : u.visible,
      mates,
      know: this.know[team],
      task,
      bomb: { phase: m.round.bomb.phase, pos: w.bombPos, fuseLeft: m.round.bomb.fuseLeft, progress: m.round.bomb.progress },
    };
    const it = u.brain.think(input);
    u.intent = it;
    // Waffe wechseln (Ziehzeit), Bombe/Granate nur, wenn vorhanden
    let want = it.weapon;
    if (want === 'c4' && !p.loadout.bomb) want = bestWeapon(p.loadout);
    const nadeKind = (Object.keys(GRENADE_ID) as GrenadeKind[]).find((k) => GRENADE_ID[k] === want);
    if (nadeKind && p.loadout.grenades[nadeKind] <= 0) want = bestWeapon(p.loadout);
    if (want !== 'knife' && want !== 'c4' && !nadeKind && !p.loadout.guns[want]) want = bestWeapon(p.loadout);
    if (want !== u.weapon) {
      u.weapon = want;
      u.switchT = want === 'c4' ? 0.5 : nadeKind ? 0.35 : 0.45;
    }
    p.weapon = u.weapon;
    const def = WEAPONS[u.weapon] ?? WEAPONS['knife']!;
    const g = p.loadout.guns[u.weapon];
    if (g) tickGun(g, def, dt);
    if (it.reload && g && u.switchT <= 0) startReload(g, def);
    // Bewegung
    if (live) u.body.step(it, dt, { col: info.col, nav: info.nav, now, skill: u.brain.skill, mates });
    else u.body.step({ ...it, goal: null, strafe: null, speed: 'stop' }, dt, { col: info.col, nav: info.nav, now, skill: u.brain.skill, mates });
    p.pose = { ...u.body.pose };
    // Pflanzen/Entschärfen (E): Pflanzen nur mit C4 in der Hand
    u.eHeld = live && it.use && (it.weapon !== 'c4' || (u.weapon === 'c4' && u.switchT <= 0));
    // Granate werfen
    if (it.throwNade && u.weapon === GRENADE_ID[it.throwNade.kind] && u.switchT <= 0 && p.loadout.grenades[it.throwNade.kind] > 0) {
      act.throwNade(u.id, it.throwNade.kind, u.body.eye, it.throwNade.dir, it.throwNade.strength);
    }
    // Schießen
    if (it.fire && live && u.switchT <= 0 && (def.mode === 'hit' || def.mode === 'melee')) this.shoot(u, p, it.fire, def, w, act);
    if (it.radio) this.sendRadio(u.id, team, it.radio, now);
  }

  private shoot(u: Unit, p: MatchPlayer, fire: { target: string; aim: XYZ }, def: (typeof WEAPONS)[string], w: BotWorldView, act: BotActions): void {
    const m = w.match;
    const target = m.players[fire.target];
    if (!target?.alive) return;
    const eye = u.body.eye;
    const dist = Math.hypot(fire.aim.x - eye.x, fire.aim.y - eye.y, fire.aim.z - eye.z);
    // Erst schießen, wenn das Fadenkreuz ungefähr drauf ist (Drehen braucht Zeit)
    if (u.body.aimOff(fire.aim) > Math.max(0.06, 0.9 / Math.max(1, dist))) return;
    const gun = p.loadout.guns[u.weapon];
    if (gun) {
      if (gun.mag <= 0) {
        startReload(gun, def);
        return;
      }
      if (!tryShoot(gun, def).ok) return;
    } else {
      const cycle = def.cycle ?? 0.45;
      if (m.time - u.lastShot < cycle) return;
    }
    u.lastShot = m.time;
    const dx = fire.aim.x - eye.x, dy = fire.aim.y - eye.y, dz = fire.aim.z - eye.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const err = aimError(u.brain.sightTime, u.brain.skill) * (u.blind > 0 ? 3 : 1);
    const base = spreadDir({ x: dx / l, y: dy / l, z: dz / l }, err, u.rnd);
    const moving = u.body.speed > 0.6;
    const scoped = def.type === 'sniper' && u.body.stillFor > 0.25;
    const spread = gun ? fireSpread(def, gun, moving, u.body.crouch, scoped) : def.spreadBase;
    act.fire(u.id, def.id, eye, shotDirs(def, base, spread, u.rnd));
    u.brain.onShot(dist, u.weapon);
  }

  private inSite(p: XYZ): boolean {
    for (const s of this.info.sites) {
      if (p.x >= s.min[0] && p.x <= s.max[0] && p.y + 0.5 >= s.min[1] && p.y + 0.5 <= s.max[1] && p.z >= s.min[2] && p.z <= s.max[2]) return true;
    }
    return false;
  }

  /** Sehen (gestaffelt alle SENSE.interval) und Hören von Schritten (alle 0.3 s). */
  private perceive(u: Unit, p: MatchPlayer, w: BotWorldView, dt: number): void {
    const m = w.match;
    const now = m.time;
    const info = this.info;
    const k = this.know[p.team];
    u.seeT -= dt;
    if (u.seeT <= 0) {
      u.seeT = SENSE.interval;
      const eye = u.body.eye;
      const vis: SeenEnemy[] = [];
      for (const q of Object.values(m.players)) {
        if (!q.alive || q.team === p.team) continue;
        const crouch = this.units.get(q.id)?.body.crouch ?? w.crouching(q.id);
        const feet = { x: q.pose.x, y: q.pose.y, z: q.pose.z };
        if (!canSeePlayer(info.col, w.smokes, eye, u.body.pose.yaw, feet, crouch)) continue;
        vis.push({ id: q.id, pos: feet, crouch, dist: Math.hypot(feet.x - eye.x, feet.y - u.body.pose.y, feet.z - eye.z) });
        const fresh = report(k, sighting(info, q.id, feet, now, 'seen'));
        if (fresh) this.sendRadio(u.id, p.team, 'enemySpotted', now);
        if (p.team === 'CT' && q.loadout.bomb) {
          k.bomb = { pos: feet, t: now, state: 'carried' };
          this.sendRadio(u.id, p.team, 'bombSpotted', now);
        }
      }
      u.visible = vis;
      // CT entdecken die liegende C4
      if (p.team === 'CT' && w.dropped && k.bomb?.state !== 'dropped') {
        const d = Math.hypot(w.dropped.x - eye.x, w.dropped.z - eye.z);
        if (d < 45 && info.col.clear(eye, { x: w.dropped.x, y: w.dropped.y + 0.3, z: w.dropped.z })) {
          k.bomb = { pos: { ...w.dropped }, t: now, state: 'dropped' };
          this.sendRadio(u.id, p.team, 'bombSpotted', now);
        }
      }
    } else {
      // Zwischen den Prüfungen: Positionen der sichtbaren Gegner nachführen
      for (const v of u.visible) {
        const q = m.players[v.id];
        if (!q?.alive) continue;
        v.pos = { x: q.pose.x, y: q.pose.y, z: q.pose.z };
        v.dist = Math.hypot(v.pos.x - u.body.pose.x, v.pos.y - u.body.pose.y, v.pos.z - u.body.pose.z);
      }
      u.visible = u.visible.filter((v) => m.players[v.id]?.alive);
    }
    u.hearT -= dt;
    if (u.hearT <= 0) {
      u.hearT = 0.3;
      for (const q of Object.values(m.players)) {
        if (!q.alive || q.team === p.team) continue;
        const speed = this.motion.get(q.id)?.speed ?? 0;
        const crouch = this.units.get(q.id)?.body.crouch ?? w.crouching(q.id);
        const r = footstepRange(speed, crouch);
        if (r <= 0) continue;
        const d = Math.hypot(q.pose.x - u.body.pose.x, q.pose.z - u.body.pose.z);
        if (d > r || u.visible.some((v) => v.id === q.id)) continue;
        const heard = heardPosition(u.body.pose, q.pose, u.rnd);
        u.brain.onHeard(heard, now);
        report(k, sighting(info, q.id, heard, now, 'heard'));
      }
    }
  }

  /** Statistik/Debug: will der Bot sich bewegen (oder muss er etwas aufheben), tut es aber nicht? */
  activity(id: string): { wantsMove: boolean; task: string | null; engaged: boolean; using: boolean } | null {
    const u = this.units.get(id);
    if (!u) return null;
    const coach = u.team === 'T' ? this.coachT : this.coachCT;
    const it = u.intent;
    return { wantsMove: !!it && (!!it.goal || !!it.strafe) && it.speed !== 'stop', task: coach?.tasks.get(id)?.kind ?? null, engaged: u.brain.engaged || !!it?.throwNade, using: u.eHeld };
  }

  /** Statistik/Debug: aktuelle Route/Plan der T. */
  tPlan(): { kind: TPlanKind; site: SiteId; target: SiteId } | null {
    return this.coachT ? { kind: this.coachT.plan.kind, site: this.coachT.plan.site, target: this.coachT.target } : null;
  }
}
