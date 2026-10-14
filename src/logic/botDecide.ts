import { canSee, type Smoke } from './grenade';
import type { PartBox } from './hitbox';
import type { Team } from './economy';
import type { BombPhase } from './bombs';

/**
 * Bot-Entscheidung (pure, pro Tick): Sicht → kämpfen, Erinnerung → jagen, sonst
 * Rolle (Bombe legen, Spot halten, Bombe verteidigen/entschärfen). Bewegung und
 * Schuss führt der Host aus (Wegpunkte + Kampfauflösung).
 */
export const BOT = {
  /** Sichtweite (m). */
  sight: 70,
  /** Augenhöhe für Sichtlinien. */
  eye: 1.5,
  /** Reaktionszeit nach Sichtkontakt (s), skaliert mit (1 - skill). */
  reactionMin: 0.15,
  reactionMax: 0.7,
  /** Erinnerung an zuletzt gesehenen Gegner (s). */
  memory: 6,
  /** Zielfehler (rad) bei Erstsicht bzw. nach längerem Zielen. */
  aimErrorStart: 0.07,
  aimErrorSettled: 0.012,
  aimSettleTime: 1.6,
  /** Dauerfeuer-Rhythmus (Burst/Pause in s). */
  burstOn: 0.35,
  burstOff: 0.3,
  /** Ab dieser Distanz hält der Bot an und schießt, darunter läuft er weiter (Nahkampf-Druck). */
  standAndShoot: 6,
  /** Radius, in dem Bots „am Ziel“ sind. */
  arrive: 1.6,
  /** Bombenspot-Radius (wie zones.spotAt). */
  spotRadius: 2.0,
} as const;

export type XZ = { x: number; z: number };

export type BotMemory = {
  reaction: number;
  targetId: string | null;
  sightTime: number;
  lastSeen: XZ | null;
  lastSeenAge: number;
  burst: number;
  /** Zufällige Wartezeit an einer Position (Camping). */
  holdTimer: number;
  /** Zufällig gewählter Versatz um das Ziel, damit Bots nicht stapeln. */
  jitter: XZ;
};

export function newBotMemory(rnd: () => number = Math.random): BotMemory {
  return {
    reaction: 0,
    targetId: null,
    sightTime: 0,
    lastSeen: null,
    lastSeenAge: 0,
    burst: 0,
    holdTimer: 0,
    jitter: { x: (rnd() - 0.5) * 5, z: (rnd() - 0.5) * 5 },
  };
}

export type BotWorld = {
  self: { id: string; team: Team; pos: XZ; hasBomb: boolean; weaponRange: number; auto: boolean; skill: number; index: number };
  enemies: { id: string; pos: XZ }[];
  solids: PartBox[];
  smokes: Smoke[];
  zones: { a: XZ; b: XZ; t: XZ; ct: XZ };
  bomb: { phase: BombPhase; spot: 'a' | 'b' | null; pos: XZ | null };
  phase: 'warmup' | 'freeze' | 'live' | 'bomb' | 'roundEnd';
  /** Team-Plan dieser Runde: Ziel-Spot der T. */
  plan: 'a' | 'b';
};

export type BotDecision = {
  moveTo: XZ | null;
  lookAt: XZ | null;
  fire: boolean;
  plant: boolean;
  defuse: boolean;
  target: string | null;
  /** Rolle fürs Debug/HUD. */
  role: 'fight' | 'hunt' | 'plant' | 'defuse' | 'goal' | 'hold';
};

const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Nächster sichtbarer Gegner (Sichtlinie über Solids + Rauch). */
export function visibleEnemy(w: BotWorld): { id: string; pos: XZ; dist: number } | null {
  let best: { id: string; pos: XZ; dist: number } | null = null;
  const eye = { x: w.self.pos.x, y: BOT.eye, z: w.self.pos.z };
  for (const e of w.enemies) {
    const d = dist(w.self.pos, e.pos);
    if (d > BOT.sight) continue;
    if (best && d >= best.dist) continue;
    if (!canSee(eye, { x: e.pos.x, y: BOT.eye - 0.3, z: e.pos.z }, w.solids, w.smokes)) continue;
    best = { id: e.id, pos: e.pos, dist: d };
  }
  return best;
}

/** Zielfehler (rad): sinkt mit Zielzeit, steigt mit (1 - skill). */
export function aimError(sightTime: number, skill: number): number {
  const t = Math.min(1, Math.max(0, sightTime / BOT.aimSettleTime));
  const base = BOT.aimErrorStart + (BOT.aimErrorSettled - BOT.aimErrorStart) * t;
  return base * (1.4 - 0.9 * Math.min(1, Math.max(0, skill)));
}

/** Reaktionszeit nach Sichtkontakt. */
export function reactionTime(skill: number, rnd: () => number): number {
  const k = Math.min(1, Math.max(0, skill));
  return BOT.reactionMin + (BOT.reactionMax - BOT.reactionMin) * (1 - k) * (0.5 + rnd() * 0.5);
}

/** Rollen-Ziel ohne Feindkontakt. */
function roleGoal(w: BotWorld, mem: BotMemory): { moveTo: XZ | null; plant: boolean; defuse: boolean; role: BotDecision['role'] } {
  const self = w.self;
  const spot = (s: 'a' | 'b'): XZ => (s === 'a' ? w.zones.a : w.zones.b);
  const planted = w.bomb.phase === 'planted' || w.bomb.phase === 'defusing';
  const bombPos = w.bomb.pos ?? (w.bomb.spot ? spot(w.bomb.spot) : null);

  if (self.team === 'T') {
    if (planted && bombPos) {
      // Bombe verteidigen: Position mit Versatz um die Bombe halten
      const hold = { x: bombPos.x + mem.jitter.x * 1.5, z: bombPos.z + mem.jitter.z * 1.5 };
      return { moveTo: dist(self.pos, hold) > BOT.arrive ? hold : null, plant: false, defuse: false, role: 'hold' };
    }
    const target = spot(w.plan);
    if (self.hasBomb) {
      if (dist(self.pos, target) <= BOT.spotRadius * 0.8) return { moveTo: null, plant: true, defuse: false, role: 'plant' };
      return { moveTo: target, plant: false, defuse: false, role: 'goal' };
    }
    // Begleiter: Spot sichern, leicht versetzt
    const hold = { x: target.x + mem.jitter.x, z: target.z + mem.jitter.z };
    return { moveTo: dist(self.pos, hold) > BOT.arrive ? hold : null, plant: false, defuse: false, role: dist(self.pos, hold) > BOT.arrive ? 'goal' : 'hold' };
  }

  // CT
  if (planted && bombPos) {
    if (dist(self.pos, bombPos) <= BOT.spotRadius * 0.8) return { moveTo: null, plant: false, defuse: true, role: 'defuse' };
    return { moveTo: bombPos, plant: false, defuse: false, role: 'goal' };
  }
  // Vor dem Plant: abwechselnd A/B bewachen
  const guard = spot(self.index % 2 === 0 ? 'a' : 'b');
  const hold = { x: guard.x + mem.jitter.x, z: guard.z + mem.jitter.z };
  return { moveTo: dist(self.pos, hold) > BOT.arrive ? hold : null, plant: false, defuse: false, role: dist(self.pos, hold) > BOT.arrive ? 'goal' : 'hold' };
}

/**
 * Entscheidung pro Tick. Reihenfolge: Freeze → stehen; Sichtkontakt → kämpfen;
 * Erinnerung → jagen; sonst Rolle. rnd nur für Reaktionszeit.
 */
export function decideBot(w: BotWorld, mem: BotMemory, dt: number, rnd: () => number = Math.random): BotDecision {
  const none: BotDecision = { moveTo: null, lookAt: null, fire: false, plant: false, defuse: false, target: null, role: 'hold' };
  if (w.phase === 'freeze' || w.phase === 'warmup' || w.phase === 'roundEnd') {
    mem.targetId = null;
    mem.sightTime = 0;
    return none;
  }

  const seen = visibleEnemy(w);
  if (seen) {
    if (mem.targetId !== seen.id) {
      mem.targetId = seen.id;
      mem.sightTime = 0;
      mem.reaction = reactionTime(w.self.skill, rnd);
      mem.burst = BOT.burstOn;
    } else {
      mem.sightTime += dt;
      mem.reaction = Math.max(0, mem.reaction - dt);
    }
    mem.lastSeen = { ...seen.pos };
    mem.lastSeenAge = 0;
    // Burst-Rhythmus für Dauerfeuer
    let fire = mem.reaction <= 0 && seen.dist <= w.self.weaponRange;
    if (fire && w.self.auto) {
      mem.burst -= dt;
      if (mem.burst <= -BOT.burstOff) mem.burst = BOT.burstOn;
      fire = mem.burst > 0;
    }
    const close = seen.dist < BOT.standAndShoot;
    const role = roleGoal(w, mem);
    // Beim Pflanzen/Entschärfen unter Feuer: Aktion abbrechen (CS-Bot-Verhalten), außer Gegner ist weit weg
    const keepAction = (role.plant || role.defuse) && seen.dist > 25;
    return {
      moveTo: close ? seen.pos : keepAction ? null : null,
      lookAt: seen.pos,
      fire,
      plant: keepAction && role.plant,
      defuse: keepAction && role.defuse,
      target: seen.id,
      role: 'fight',
    };
  }

  mem.targetId = null;
  mem.sightTime = 0;
  if (mem.lastSeen) {
    mem.lastSeenAge += dt;
    if (mem.lastSeenAge < BOT.memory && dist(w.self.pos, mem.lastSeen) > BOT.arrive) {
      return { moveTo: mem.lastSeen, lookAt: mem.lastSeen, fire: false, plant: false, defuse: false, target: null, role: 'hunt' };
    }
    mem.lastSeen = null;
  }

  const g = roleGoal(w, mem);
  return { moveTo: g.moveTo, lookAt: g.moveTo, fire: false, plant: g.plant, defuse: g.defuse, target: null, role: g.role };
}

/** CS-Bot-Namen (Lager-Thema). */
export const BOT_NAMES = [
  'Stapler-Steve', 'Kommissionier-Kai', 'Paletten-Paul', 'Inventur-Ines', 'Gabel-Gabi', 'Hochregal-Hans',
  'Wareneingang-Willi', 'Versand-Vera', 'Scanner-Sven', 'Container-Conny', 'Rampen-Rudi', 'Lagerleiter-Lena',
  'Picker-Pia', 'Etiketten-Emil', 'Folien-Fritz', 'Gitterbox-Gerd', 'Zoll-Zoe', 'Schicht-Sascha',
];
