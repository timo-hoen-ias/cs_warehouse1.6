import type { GrenadeKind } from './weapons';
import type { Team } from './economy';
import type { MatchPlayer, MatchState, Pose } from './match';
import type { RoundState } from './round';
import type { Smoke } from './grenade';
import { defaultLoadout } from './loadout';
import { makeGun } from './fire';
import { WEAPONS } from './weapons';
import type { DroppedItem } from './drops';

/**
 * Netzwerk-Protokoll (pure Typen + Helfer). Transport: Needle `context.connection`
 * (JSON-Broadcast an alle im Raum). Host = kleinste Verbindungs-ID im Raum
 * (deterministisch auf allen Clients berechenbar, ohne Server-Logik).
 *
 * Autorität: Bewegung simuliert jeder Client selbst und sendet Posen
 * (CS-artige Prediction ohne Korrektur); Treffer, HP, Runde, Economy, Bombe,
 * Granaten und Bots rechnet der Host und verteilt Snapshots + Ereignisse.
 */
export type PoseMsg = { t: 'pose'; id: string; x: number; y: number; z: number; yaw: number; pitch: number; w: string; c: boolean; m: boolean; e: boolean };
export type HelloMsg = { t: 'hello'; id: string; name: string; team: Team | 'auto' };
export type FireMsg = { t: 'fire'; id: string; w: string; o: [number, number, number]; d: [number, number, number][]; seq: number };
export type ThrowMsg = { t: 'throw'; id: string; kind: GrenadeKind; o: [number, number, number]; d: [number, number, number]; s: number };
export type BuyMsg = { t: 'buy'; id: string; item: string };
export type AmmoMsg = { t: 'ammo'; id: string; slot: 1 | 2 };
export type TeamMsg = { t: 'team'; id: string; team: Team };
export type ChatMsg = { t: 'chat'; id: string; name: string; text: string; team: Team | null };
export type ReloadMsg = { t: 'reload'; id: string; w: string };
export type DropMsg = { t: 'dropreq'; id: string; w: string };
/** `h` = Absender-Host-ID: Clients verwerfen Snapshots/Ereignisse von Nicht-Hosts. */
export type SnapMsg = { t: 'snap'; s: Snapshot; h?: string };
export type EventMsg = { t: 'ev'; e: GameEvent; h?: string };
export type PosesMsg = { t: 'poses'; p: PoseMsg[] };

export type NetMsg = PoseMsg | HelloMsg | FireMsg | ThrowMsg | BuyMsg | AmmoMsg | TeamMsg | ChatMsg | ReloadMsg | DropMsg | SnapMsg | EventMsg | PosesMsg;

/** Ereignisse vom Host (einmalig, nicht im Snapshot). */
export type GameEvent =
  | { k: 'kill'; killer: string | null; victim: string; weapon: string; hs: boolean }
  | { k: 'hit'; victim: string; attacker: string | null; dmg: number; part: 'head' | 'body'; from: [number, number, number]; at: [number, number, number] }
  | { k: 'spawn'; id: string; x: number; z: number; yaw: number; fresh?: boolean }
  | { k: 'shot'; id: string; w: string; o: [number, number, number]; ends: [number, number, number][]; walls: [number, number, number][] }
  | { k: 'nade'; id: number; kind: GrenadeKind; owner: string; o: [number, number, number]; v: [number, number, number] }
  | { k: 'boom'; id: number; kind: GrenadeKind; at: [number, number, number] }
  | { k: 'bomb'; what: 'planted' | 'defused' | 'exploded' | 'planting' | 'defusing'; by: string | null; spot: 'a' | 'b' | null }
  | { k: 'round'; what: 'start' | 'end'; round: number; outcome?: string; reason?: string }
  | { k: 'buy'; id: string; item: string; ok: boolean; reason?: string }
  | { k: 'match'; winner: Team }
  | { k: 'drop'; item: DroppedItem; by: string | null }
  | { k: 'pickup'; id: number; by: string; weapon: string }
  | { k: 'join'; id: string; name: string; team: Team }
  | { k: 'leave'; id: string; name: string };

/** Kompakter Spieler-Snapshot. */
export type PlayerSnap = {
  id: string;
  name: string;
  team: Team;
  bot: boolean;
  hp: number;
  alive: boolean;
  money: number;
  kills: number;
  deaths: number;
  weapon: string;
  armor: number;
  helmet: boolean;
  bomb: boolean;
  kit: boolean;
  primary: string | null;
  secondary: string | null;
  nades: [number, number, number];
  ping: number;
  /** Hat die letzte Runde überlebt (für Host-Migration: Inventar-Übertrag). */
  survived?: boolean;
};

export type Snapshot = {
  seq: number;
  time: number;
  round: RoundState;
  players: PlayerSnap[];
  lossStreak: Record<Team, number>;
  winner: Team | null;
  matchEndTimer: number;
  nades: { id: number; kind: GrenadeKind; p: [number, number, number] }[];
  smokes: { p: [number, number, number]; r: number; t: number }[];
  bombPos: [number, number, number] | null;
  /** Liegende Waffen/C4 (ohne Munitionsstand). */
  drops?: { id: number; weapon: string; p: [number, number, number] }[];
};

/**
 * Host = wer am längsten im Raum ist. `ids` muss in Beitrittsreihenfolge vorliegen
 * (so liefert sie der Raum-Server; alle Clients sehen dieselbe Reihenfolge). Damit wird
 * ein neu Beitretender nie Host und übernimmt kein leeres Match.
 */
export function electHost(ids: readonly string[]): string | null {
  return ids.length ? ids[0]! : null;
}

export function packPlayer(p: MatchPlayer): PlayerSnap {
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    bot: p.bot,
    hp: p.hp,
    alive: p.alive,
    money: p.money.amount,
    kills: p.kills,
    deaths: p.deaths,
    weapon: p.weapon,
    armor: p.loadout.armor,
    helmet: p.loadout.helmet,
    bomb: p.loadout.bomb,
    kit: p.loadout.defuseKit,
    primary: p.loadout.primary,
    secondary: p.loadout.secondary,
    nades: [p.loadout.grenades.he, p.loadout.grenades.flash, p.loadout.grenades.smoke],
    ping: p.ping,
    survived: p.survived,
  };
}

export function packSnapshot(m: MatchState, seq: number, extra: { nades: Snapshot['nades']; smokes: Smoke[]; bombPos: Snapshot['bombPos']; drops?: Snapshot['drops'] }): Snapshot {
  return {
    seq,
    time: m.time,
    round: { ...m.round, bomb: { ...m.round.bomb } },
    players: Object.values(m.players).map(packPlayer),
    lossStreak: { ...m.lossStreak },
    winner: m.winner,
    matchEndTimer: m.matchEndTimer,
    nades: extra.nades,
    smokes: extra.smokes.map((s) => ({ p: [s.pos.x, s.pos.y, s.pos.z], r: s.radius, t: s.timeLeft })),
    bombPos: extra.bombPos,
    drops: extra.drops ?? [],
  };
}

/**
 * Snapshot in einen (Client-)Match-Zustand übernehmen. Spieler werden angelegt/
 * entfernt; Inventar nur soweit nötig (Anzeige + Host-Migration).
 */
export function applySnapshot(m: MatchState, s: Snapshot): void {
  m.time = s.time;
  m.round = { ...s.round, bomb: { ...s.round.bomb } };
  m.lossStreak = { ...s.lossStreak };
  m.winner = s.winner;
  m.matchEndTimer = s.matchEndTimer;
  const seen = new Set<string>();
  for (const ps of s.players) {
    seen.add(ps.id);
    let p = m.players[ps.id];
    if (!p) {
      p = {
        id: ps.id,
        name: ps.name,
        team: ps.team,
        bot: ps.bot,
        hp: ps.hp,
        alive: ps.alive,
        money: { amount: ps.money, lossStreak: 0 },
        loadout: defaultLoadout(ps.team),
        weapon: ps.weapon,
        kills: ps.kills,
        deaths: ps.deaths,
        pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
        survived: false,
        ping: ps.ping,
      };
      m.players[ps.id] = p;
    }
    p.name = ps.name;
    p.team = ps.team;
    p.bot = ps.bot;
    p.hp = ps.hp;
    p.alive = ps.alive;
    p.money.amount = ps.money;
    p.kills = ps.kills;
    p.deaths = ps.deaths;
    p.weapon = ps.weapon;
    p.ping = ps.ping;
    p.survived = ps.survived ?? p.survived;
    const lo = p.loadout;
    lo.armor = ps.armor;
    lo.helmet = ps.helmet;
    lo.bomb = ps.bomb;
    lo.defuseKit = ps.kit;
    lo.grenades = { he: ps.nades[0], flash: ps.nades[1], smoke: ps.nades[2] };
    for (const [slot, id] of [['primary', ps.primary], ['secondary', ps.secondary]] as const) {
      if (lo[slot] !== id) {
        if (lo[slot]) delete lo.guns[lo[slot]!];
        lo[slot] = id;
        if (id && !lo.guns[id] && WEAPONS[id]) lo.guns[id] = makeGun(WEAPONS[id]!);
      }
    }
  }
  for (const id of Object.keys(m.players)) if (!seen.has(id)) delete m.players[id];
}

/** Lineare Pose-Interpolation (Yaw kürzester Weg). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  t = Math.max(0, Math.min(1, t));
  let dy = b.yaw - a.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + dy * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
}

/** Pose → Nachricht. */
export function poseMsg(id: string, p: Pose, weapon: string, crouch: boolean, moving: boolean, eHeld: boolean): PoseMsg {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { t: 'pose', id, x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(p.yaw), pitch: r(p.pitch), w: weapon, c: crouch, m: moving, e: eHeld };
}

/** Zufälliger, gut lesbarer Raumcode (ohne 0/O/1/I). */
export function roomCode(rnd: () => number = Math.random, len = 5): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(rnd() * chars.length)];
  return s;
}

/** Sichere Kürzung von Chat-/Namenstext. */
export function sanitizeName(name: string, fallback = 'Spieler'): string {
  const s = name.replace(/[<>&"'`]/g, '').trim().slice(0, 16);
  return s.length ? s : fallback;
}
