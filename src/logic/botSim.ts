import { analyzeMap, zoneAt, type BotMapInfo } from './botMap';
import { BotSystem } from './botSystem';
import { COL } from './collision';
import { humanPartBoxes } from './hitbox';
import { resolveRay, type ShotTarget } from './combat';
import { capDrops, dropOnDeath, droppedBomb, tryPickup, type DroppedItem } from './drops';
import type { Team } from './economy';
import { GRENADE, flashStrength, heDamageAt, stepGrenade, throwGrenade, type GrenadeState, type Smoke } from './grenade';
import { bombInput } from './hostRules';
import { consumeGrenade, bestWeapon } from './loadout';
import type { CompiledMap } from './mapcompile';
import { siteAt } from './mapcompile';
import {
  addPlayer, aliveCounts, applyExplosion, applyHit, beginRound, finishRound, newMatch, rewardAction, type MatchPlayer, type MatchState, type Pose,
} from './match';
import { PLAYER } from './move';
import { nearestNode, type XYZ } from './nav';
import { mulberry32 } from './rng';
import { tickRound } from './round';
import { WEAPONS } from './weapons';

/**
 * Headless-Simulation (pure, ohne Darstellung): ein Host, der dieselben Regeln wie der
 * MatchDriver anwendet (Runde, Bombe, Treffer, Granaten, Drops, Economy) und nur Bots
 * spielen lässt — für schnelle Bot-gegen-Bot-Runden im Zeitraffer (Tests, Balancing).
 * Prüft nebenbei, dass kein Bot durch Wände läuft oder aus der Karte fällt.
 */
export type RoundStats = {
  round: number;
  outcome: string;
  reason: string;
  /** Spielzeit von Rundenstart (live) bis Rundenende (s). */
  duration: number;
  planted: boolean;
  plantSite: 'a' | 'b' | null;
  plantAt: number;
  defused: boolean;
  exploded: boolean;
  tPlan: string;
  tSite: string;
  /** Zonen, aus denen T einen Spot betreten haben (Eingänge). */
  entries: string[];
  /** Zonen, die T in dieser Runde betreten haben. */
  tZones: string[];
  kills: number;
  /** Längste Festsitz-Zeit eines Bots (s). */
  maxStuck: number;
  /** Längste Zeit ohne Bewegung eines lebenden Bots während der Runde (s). */
  maxIdle: number;
  /** Zustand beim längsten Leerlauf (Debug). */
  idleState: string;
  /** Wo/wer saß am längsten fest (Debug). */
  stuckAt: string;
  wallViolations: number;
  fallViolations: number;
  radio: number;
  nades: number;
};

export type SimOpts = { perTeam: number; skill: number; seed: number; dt?: number };

export class HeadlessMatch {
  readonly map: CompiledMap;
  readonly info: BotMapInfo;
  readonly bots: BotSystem;
  readonly match: MatchState;
  smokes: Smoke[] = [];
  nades: { g: GrenadeState }[] = [];
  drops: DroppedItem[] = [];
  bombPos: XYZ | null = null;
  readonly rnd: () => number;
  readonly dt: number;
  readonly stats: RoundStats[] = [];
  radioLog: string[] = [];
  private cur: RoundStats | null = null;
  private liveAt = -1;
  private lastRound = 0;
  private prev = new Map<string, XYZ>();
  private idle = new Map<string, number>();
  private zoneSeen = new Map<string, number>();
  private dropSeq = 1;

  constructor(map: CompiledMap, opts: SimOpts) {
    this.map = map;
    this.info = analyzeMap({ nav: map.nav, collider: map.collider, sites: map.sites, spawns: map.spawns, hints: map.data.botHints });
    this.bots = new BotSystem(this.info, { skill: opts.skill, seed: opts.seed });
    this.rnd = mulberry32(opts.seed * 977 + 3);
    this.dt = opts.dt ?? 0.05;
    this.match = newMatch();
    for (let i = 0; i < opts.perTeam * 2; i++) {
      const p = addPlayer(this.match, `bot-${i}`, `Bot ${i}`, { bot: true, team: i % 2 === 0 ? 'T' : 'CT' });
      this.bots.add(p);
    }
    // Aufwärmphase überspringen: direkt Runde 1
    this.match.round.timer = 0;
  }

  private spawnPose = (team: Team, i: number): Pose => {
    const list = this.map.spawns[team];
    const s = list[i % Math.max(1, list.length)]!;
    return { x: s.pos[0], y: s.pos[1], z: s.pos[2], yaw: s.yaw, pitch: 0 };
  };

  /** Spielt, bis `n` Runden beendet sind (oder das Match entschieden ist). */
  runRounds(n: number, maxSteps = 1e7): RoundStats[] {
    const target = this.stats.length + n;
    for (let i = 0; i < maxSteps && this.stats.length < target && !this.match.winner; i++) this.step();
    return this.stats;
  }

  step(): void {
    const m = this.match;
    const dt = this.dt;
    m.time += dt;
    const actions = {
      fire: (id: string, w: string, o: XYZ, dirs: XYZ[]) => this.fire(id, w, o, dirs),
      throwNade: (id: string, kind: 'he' | 'flash' | 'smoke', o: XYZ, d: XYZ, s: number) => {
        const p = m.players[id];
        if (!p?.alive || p.loadout.grenades[kind] <= 0) return;
        consumeGrenade(p.loadout, kind);
        this.nades.push({ g: throwGrenade(kind, o, d, id, s) });
        if (this.cur) this.cur.nades++;
      },
      radio: (id: string, text: string) => {
        this.radioLog.push(`${m.round.round}:${id}:${text}`);
        if (this.cur) this.cur.radio++;
      },
    };
    const dropped = droppedBomb(this.drops);
    this.bots.tick({ match: m, smokes: this.smokes, bombPos: this.bombPos, dropped: dropped ? { x: dropped.x, y: dropped.y, z: dropped.z } : null, crouching: () => false }, dt, actions);
    this.pickups();
    this.checkBodies(dt);

    const inp = bombInput(m, { siteAt: (p) => siteAt(this.map.sites, p), eHeld: (id) => this.bots.eHeld(id), bombPos: this.bombPos, spotCenter: (s) => this.map.zones[s] });
    const before = m.round.bomb.phase;
    const result = m.winner ? null : tickRound(m.round, { alive: aliveCounts(m), bombAction: { plant: inp.plant, defuse: inp.defuse }, inSpot: inp.inSpot, hasKit: inp.hasKit }, dt);
    if (m.round.bomb.phase !== before) {
      if (m.round.bomb.phase === 'planted' && before === 'planting' && inp.planter) {
        rewardAction(m, inp.planter, 'plant');
        const pl = m.players[inp.planter]!;
        pl.loadout.bomb = false;
        pl.weapon = bestWeapon(pl.loadout);
        this.bombPos = { x: pl.pose.x, y: pl.pose.y + 0.15, z: pl.pose.z };
        if (this.cur) {
          this.cur.planted = true;
          this.cur.plantSite = m.round.bomb.spot;
          this.cur.plantAt = m.time - this.liveAt;
        }
      } else if (m.round.bomb.phase === 'defused') {
        if (inp.defuser) rewardAction(m, inp.defuser, 'defuse');
        if (this.cur) this.cur.defused = true;
      } else if (m.round.bomb.phase === 'exploded') {
        if (this.cur) this.cur.exploded = true;
        if (this.bombPos) {
          for (const p of Object.values(m.players)) {
            if (!p.alive) continue;
            const dmg = heDamageAt(this.bombPos, { x: p.pose.x, y: p.pose.y + 1, z: p.pose.z }, [], 18, 300);
            if (dmg > 0) {
              const r = applyExplosion(m, p.id, null, dmg, 1);
              if (r?.killed) this.onKill(p, null);
            }
          }
        }
      }
    }
    if ((m.round.phase === 'live' || m.round.phase === 'bomb') && this.liveAt < 0) this.liveAt = m.time;
    if (result) {
      const planted = result.outcome === 't_win_explode' || result.outcome === 'ct_win_defuse' || m.round.bomb.phase !== 'none';
      finishRound(m, result.outcome, planted);
      if (this.cur) {
        this.cur.outcome = result.outcome;
        this.cur.reason = result.reason;
        this.cur.duration = m.time - this.liveAt;
        this.stats.push(this.cur);
        this.cur = null;
      }
    }
    if (!m.winner && m.round.round !== this.lastRound && m.round.phase === 'freeze') {
      this.lastRound = m.round.round;
      this.startRound();
    }
    this.tickGrenades(dt);
    for (const s of this.smokes) s.timeLeft -= dt;
    this.smokes = this.smokes.filter((s) => s.timeLeft > 0);
  }

  private startRound(): void {
    const m = this.match;
    beginRound(m, this.spawnPose, this.rnd);
    this.nades = [];
    this.smokes = [];
    this.drops = [];
    this.bombPos = null;
    this.liveAt = -1;
    this.prev.clear();
    this.idle.clear();
    this.zoneSeen.clear();
    this.bots.roundStart(m);
    const plan = this.bots.tPlan();
    this.cur = {
      round: m.round.round, outcome: '', reason: '', duration: 0, planted: false, plantSite: null, plantAt: 0, defused: false, exploded: false,
      tPlan: plan?.kind ?? '-', tSite: plan?.site ?? '-', entries: [], tZones: [], kills: 0, maxStuck: 0, maxIdle: 0, idleState: '', stuckAt: '',
      wallViolations: 0, fallViolations: 0, radio: 0, nades: 0,
    };
  }

  private targets(ignore: string): ShotTarget[] {
    const out: ShotTarget[] = [];
    for (const p of Object.values(this.match.players)) {
      if (!p.alive || p.id === ignore) continue;
      out.push({ id: p.id, parts: humanPartBoxes({ x: p.pose.x, y: p.pose.y, z: p.pose.z }, this.bots.crouching(p.id) ? 0.75 : 1) });
    }
    return out;
  }

  private fire(id: string, weapon: string, origin: XYZ, dirs: XYZ[]): void {
    const m = this.match;
    const def = WEAPONS[weapon];
    const shooter = m.players[id];
    if (!def || !shooter?.alive || m.round.phase === 'freeze') return;
    this.bots.notify({ k: 'shot', id, pos: { x: shooter.pose.x, y: shooter.pose.y, z: shooter.pose.z }, weapon }, m);
    const targets = this.targets(id);
    for (const dir of dirs) {
      const hit = resolveRay(origin, dir, def.range, this.map.collider, targets, id);
      if (hit.kind !== 'target') continue;
      const victim = m.players[hit.id];
      if (!victim) continue;
      const r = applyHit(m, hit.id, id, def, hit.part, hit.dist);
      if (!r) continue;
      this.bots.notify({ k: 'hit', victim: hit.id, attacker: id, from: origin }, m);
      if (r.killed) this.onKill(victim, id);
    }
  }

  private onKill(victim: MatchPlayer, killer: string | null): void {
    const m = this.match;
    if (this.cur) this.cur.kills++;
    this.bots.notify({ k: 'kill', victim: victim.id, killer, pos: { x: victim.pose.x, y: victim.pose.y, z: victim.pose.z } }, m);
    for (const item of dropOnDeath(victim.loadout, { x: victim.pose.x, y: victim.pose.y, z: victim.pose.z }, () => this.dropSeq++)) {
      item.y = this.map.collider.groundHeight(item.x, item.z, item.y + 0.6, PLAYER.radius, 0.1);
      this.drops = capDrops([...this.drops, item]);
    }
  }

  private pickups(): void {
    if (!this.drops.length) return;
    for (const p of Object.values(this.match.players)) {
      if (!p.alive) continue;
      const got = tryPickup(p.loadout, p.team, this.drops, { x: p.pose.x, y: p.pose.y, z: p.pose.z });
      if (!got) continue;
      this.drops = this.drops.filter((d) => d.id !== got.id);
      if (got.weapon !== 'c4') p.weapon = bestWeapon(p.loadout);
    }
  }

  private tickGrenades(dt: number): void {
    const m = this.match;
    for (const n of [...this.nades]) {
      if (!stepGrenade(n.g, dt, this.map.collider)) continue;
      const at = { ...n.g.pos };
      this.nades = this.nades.filter((x) => x !== n);
      this.bots.notify({ k: 'boom', pos: at }, m);
      if (n.g.kind === 'he') {
        for (const p of Object.values(m.players)) {
          if (!p.alive) continue;
          const dmg = heDamageAt(at, { x: p.pose.x, y: p.pose.y + 1, z: p.pose.z }, this.map.collider);
          if (dmg <= 0) continue;
          const r = applyExplosion(m, p.id, n.g.owner, dmg);
          if (r) this.bots.notify({ k: 'hit', victim: p.id, attacker: n.g.owner, from: at }, m);
          if (r?.killed) this.onKill(p, n.g.owner);
        }
      } else if (n.g.kind === 'smoke') {
        this.smokes.push({ pos: at, radius: GRENADE.smokeRadius, timeLeft: GRENADE.smokeDuration });
      } else {
        for (const p of Object.values(m.players)) {
          if (!p.alive) continue;
          const pose = this.bots.pose(p.id) ?? p.pose;
          const dir = { x: -Math.sin(pose.yaw) * Math.cos(pose.pitch), y: Math.sin(pose.pitch), z: -Math.cos(pose.yaw) * Math.cos(pose.pitch) };
          const s = flashStrength({ x: pose.x, y: pose.y + PLAYER.eye, z: pose.z }, dir, at, this.map.collider);
          if (s > 0.1) this.bots.blind(p.id, GRENADE.flashDuration * s);
        }
      }
    }
  }

  /** Plausibilität der Körper: nicht in Wänden, nicht durch Wände, nicht aus der Karte; Leerlauf/Festsitzen messen. */
  private checkBodies(dt: number): void {
    const m = this.match;
    const cur = this.cur;
    if (!cur) return;
    const live = m.round.phase === 'live' || m.round.phase === 'bomb';
    const col = this.map.collider;
    const minY = this.map.data.bounds.min[1] - 1;
    for (const p of Object.values(m.players)) {
      if (!p.alive) {
        this.prev.delete(p.id);
        continue;
      }
      const pos = { x: p.pose.x, y: p.pose.y, z: p.pose.z };
      const prev = this.prev.get(p.id);
      if (prev && live) {
        if (!col.clear({ x: prev.x, y: prev.y + 1.3, z: prev.z }, { x: pos.x, y: pos.y + 1.3, z: pos.z }, COL.move) && Math.abs(prev.y - pos.y) < 0.3) cur.wallViolations++;
        const moved = Math.hypot(pos.x - prev.x, pos.z - prev.z);
        // Leerlauf: will laufen (oder muss etwas aufheben), bewegt sich aber nicht
        const st = this.bots.state(p.id);
        const act = this.bots.activity(p.id);
        const idleNow = !!act && moved < 0.02 && !act.using && !act.engaged && (act.wantsMove || act.task === 'pickup');
        const idle = idleNow ? (this.idle.get(p.id) ?? 0) + dt : 0;
        this.idle.set(p.id, idle);
        if (idle > cur.maxIdle) {
          cur.maxIdle = idle;
          cur.idleState = `${p.id}: ${st?.state} / ${st?.task}`;
        }
      }
      if (col.blockedAt(pos.x, pos.z, pos.y, 0.2, 1.4, PLAYER.step) || pos.y < minY || nearestNode(this.map.nav, pos.x, pos.y, pos.z, 3) < 0) cur.fallViolations++;
      this.prev.set(p.id, pos);
      // Eingänge der T in Spots (Zone vor der ersten Spot-Zone)
      if (p.team === 'T' && live) {
        const z = zoneAt(this.info, pos);
        if (z >= 0) {
          const name = this.info.zones[z]!.name;
          if (!cur.tZones.includes(name)) cur.tZones.push(name);
          const last = this.zoneSeen.get(p.id);
          if (last !== undefined && last !== z && this.info.zones[z]!.site && !this.info.zones[last]!.site) {
            const from = this.info.zones[last]!.name;
            if (!cur.entries.includes(from)) cur.entries.push(from);
          }
          this.zoneSeen.set(p.id, z);
        }
      }
    }
    // Festsitzen über die Körper-Statistik
    for (const id of this.bots.ids()) {
      const b = this.bots.body(id);
      if (b && b.stuckMax > cur.maxStuck) {
        cur.maxStuck = b.stuckMax;
        const p = m.players[id];
        cur.stuckAt = p ? `${id}@${p.pose.x.toFixed(0)},${p.pose.y.toFixed(1)},${p.pose.z.toFixed(0)} ${this.bots.state(id)?.state}` : id;
      }
    }
  }
}

/** Zusammenfassung mehrerer Runden (für Tests und `scripts/bot-sim.ts`). */
export function summarize(stats: readonly RoundStats[]): Record<string, number | string> {
  const n = Math.max(1, stats.length);
  const tWins = stats.filter((s) => s.outcome.startsWith('t_')).length;
  const plants = stats.filter((s) => s.planted).length;
  const entries = new Set(stats.flatMap((s) => s.entries));
  const plans = new Set(stats.map((s) => s.tPlan));
  return {
    rounds: stats.length,
    tWins,
    ctWins: stats.length - tWins,
    plants,
    plantRate: +(plants / n).toFixed(2),
    defused: stats.filter((s) => s.defused).length,
    exploded: stats.filter((s) => s.exploded).length,
    timeouts: stats.filter((s) => s.reason === 'Zeit abgelaufen').length,
    avgDuration: +(stats.reduce((a, s) => a + s.duration, 0) / n).toFixed(1),
    avgKills: +(stats.reduce((a, s) => a + s.kills, 0) / n).toFixed(1),
    maxStuck: +Math.max(0, ...stats.map((s) => s.maxStuck)).toFixed(1),
    maxIdle: +Math.max(0, ...stats.map((s) => s.maxIdle)).toFixed(1),
    wallViolations: stats.reduce((a, s) => a + s.wallViolations, 0),
    fallViolations: stats.reduce((a, s) => a + s.fallViolations, 0),
    entries: [...entries].join(', '),
    plans: [...plans].join(', '),
    radioPerRound: +(stats.reduce((a, s) => a + s.radio, 0) / n).toFixed(1),
    nadesPerRound: +(stats.reduce((a, s) => a + s.nades, 0) / n).toFixed(1),
  };
}
