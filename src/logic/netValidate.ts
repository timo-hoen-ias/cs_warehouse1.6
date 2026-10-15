import type { Team } from './economy';
import { EQUIPMENT, WEAPONS, type GrenadeKind } from './weapons';
import { sanitizePublicLobby } from './lobby';
import { cleanText } from './serverList';
import { sanitizeName, type GameEvent, type NetMsg, type PlayerSnap, type PoseMsg, type Snapshot } from './net';
import type { RoundPhase, RoundState } from './round';
import type { BombPhase } from './bombs';

/**
 * Strikte Prüfung aller Netz-Nachrichten (pure). Der öffentliche Needle-Server stempelt
 * keine Absender: jedes `id`/`h`-Feld ist nur behauptet, jede Zahl kann NaN/Infinity,
 * jeder String HTML sein. Alles, was aus dem Netz kommt, läuft erst hier durch; danach
 * haben alle Felder die erwarteten Typen, Wertebereiche und Aufzählungswerte (kein
 * Absturz, kein XSS, keine Prototyp-Verschmutzung, kein NaN in Spielzuständen).
 */

export const NET_LIMITS = {
  /** Betrag jeder Weltkoordinate (m). */
  coord: 10000,
  /** Spieler im Snapshot. */
  players: 64,
  /** Strahlen eines Schusses (Schrot: Pellets). */
  rays: 16,
  /** Posen in einer Sammelnachricht. */
  poses: 64,
  nades: 64,
  smokes: 64,
  drops: 256,
  /** Chattext (Zeichen). */
  chat: 120,
  /** Höchste Snapshot-Sequenz (Zahlen darüber verlieren Genauigkeit). */
  seq: 1e12,
} as const;

/** Spieler-/Verbindungs-IDs: Buchstaben, Ziffern, `_ . : -`, 1–64 Zeichen, kein Prototyp-Schlüssel. */
const ID_RE = /^[\w.:-]{1,64}$/;

export function isNetId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v) && !(v in Object.prototype);
}

/** Mensch-IDs dürfen nicht wie Bot-IDs aussehen (sonst Kollision mit `bot-N`). */
export function isHumanId(v: unknown): v is string {
  return isNetId(v) && !v.startsWith('bot-');
}

export function isWeaponId(v: unknown): v is string {
  return typeof v === 'string' && Object.hasOwn(WEAPONS, v);
}

/** Kaufbarer Artikel (Waffe oder Ausrüstung). */
export function isBuyItem(v: unknown): v is string {
  return typeof v === 'string' && (Object.hasOwn(WEAPONS, v) || Object.hasOwn(EQUIPMENT, v));
}

export function isTeam(v: unknown): v is Team {
  return v === 'T' || v === 'CT';
}

const NADE_KINDS: readonly GrenadeKind[] = ['he', 'flash', 'smoke'];
export function isGrenadeKind(v: unknown): v is GrenadeKind {
  return typeof v === 'string' && (NADE_KINDS as readonly string[]).includes(v);
}

const ROUND_PHASES: readonly RoundPhase[] = ['warmup', 'freeze', 'live', 'bomb', 'roundEnd'];
const BOMB_PHASES: readonly BombPhase[] = ['none', 'planting', 'planted', 'defusing', 'exploded', 'defused'];
const OUTCOMES = ['ct_win', 't_win', 't_win_explode', 'ct_win_defuse'] as const;
const BOMB_WHAT = ['planted', 'defused', 'exploded', 'planting', 'defusing'] as const;
const MAP_ID = /^[a-z0-9_]{1,32}$/;
const SHORT_KEY = /^[\w-]{1,32}$/;

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Endliche Zahl mit |v| ≤ lim, sonst null. */
export function num(v: unknown, lim: number = NET_LIMITS.coord): number | null {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : null;
}

/** Endliche Zahl, in [lo, hi] geklemmt (optional gerundet); sonst `def`. */
export function clampNum(v: unknown, lo: number, hi: number, def: number, round = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  const x = Math.min(hi, Math.max(lo, v));
  return round ? Math.round(x) : x;
}

/** Ganzzahl (z. B. Granaten-/Drop-ID) mit |v| ≤ 2^31, sonst null. */
function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 2 ** 31 ? v : null;
}

/** [x, y, z] aus endlichen, begrenzten Zahlen, sonst null. */
export function vec3(v: unknown, lim: number = NET_LIMITS.coord): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const x = num(v[0], lim), y = num(v[1], lim), z = num(v[2], lim);
  return x === null || y === null || z === null ? null : [x, y, z];
}

/** Richtungsvektor: endlich, Länge 0.5–1.5 (Rundung beim Senden), wird exakt normalisiert. Sonst null. */
export function unitDir(v: unknown): [number, number, number] | null {
  const d = vec3(v, 2);
  if (!d) return null;
  const l = Math.hypot(d[0], d[1], d[2]);
  if (!(l >= 0.5 && l <= 1.5)) return null;
  return [d[0] / l, d[1] / l, d[2] / l];
}

/** Winkel auf (-π, π] falten (Gierwinkel wächst beim Drehen unbegrenzt). */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let r = a % t;
  if (r > Math.PI) r -= t;
  else if (r <= -Math.PI) r += t;
  return r;
}

function optId(v: unknown): string | undefined | null {
  if (v === undefined) return undefined;
  return isNetId(v) ? v : null;
}

function idOrNull(v: unknown): string | null | false {
  if (v === null) return null;
  return isNetId(v) ? v : false;
}

/** Name: nur String, ohne HTML-Zeichen, gekürzt (net.ts sanitizeName). */
function name(v: unknown, fallback = 'Spieler'): string {
  return typeof v === 'string' ? sanitizeName(v.slice(0, 64), fallback) : fallback;
}

/** Chattext: Steuerzeichen raus, getrimmt, gekürzt; leer → null. (Anzeige escapt zusätzlich.) */
export function chatText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.slice(0, 1000).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, NET_LIMITS.chat).trim();
  return s.length ? s : null;
}

// ---------------------------------------------------------------- Posen

export function parsePose(raw: unknown): PoseMsg | null {
  const r = obj(raw);
  if (!r || !isNetId(r.id)) return null;
  const x = num(r.x), y = num(r.y), z = num(r.z);
  const yaw = num(r.yaw, 1e6), pitch = num(r.pitch, 1e3);
  if (x === null || y === null || z === null || yaw === null || pitch === null || !isWeaponId(r.w)) return null;
  return {
    t: 'pose', id: r.id, x, y, z,
    yaw: wrapAngle(yaw),
    pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)),
    w: r.w, c: r.c === true, m: r.m === true, e: r.e === true,
  };
}

/** Pose innerhalb der Kartengrenzen (mit Rand, z. B. Fallen/Springen über die Kante)? */
export function poseInBounds(p: { x: number; y: number; z: number }, b: { min: readonly [number, number, number]; max: readonly [number, number, number] }, margin = 10): boolean {
  return p.x >= b.min[0] - margin && p.x <= b.max[0] + margin
    && p.y >= b.min[1] - margin * 3 && p.y <= b.max[1] + margin
    && p.z >= b.min[2] - margin && p.z <= b.max[2] + margin;
}

// ---------------------------------------------------------------- Snapshot

function parseRound(raw: unknown): RoundState | null {
  const r = obj(raw);
  const b = obj(r?.bomb);
  if (!r || !b) return null;
  const phase = oneOf(ROUND_PHASES, r.phase);
  const bphase = oneOf(BOMB_PHASES, b.phase);
  if (!phase || !bphase) return null;
  const res = obj(r.result);
  const outcome = res ? oneOf(OUTCOMES, res.outcome) : null;
  return {
    phase,
    timer: clampNum(r.timer, 0, 1000, 0),
    round: clampNum(r.round, 0, 999, 0, true),
    ctRounds: clampNum(r.ctRounds, 0, 99, 0, true),
    tRounds: clampNum(r.tRounds, 0, 99, 0, true),
    bomb: {
      phase: bphase,
      progress: clampNum(b.progress, 0, 1, 0),
      fuseLeft: clampNum(b.fuseLeft, 0, 120, 0),
      spot: b.spot === 'a' || b.spot === 'b' ? b.spot : null,
      hasKit: b.hasKit === true,
    },
    result: outcome ? { outcome, reason: cleanText(res!.reason, 80) } : null,
  };
}

function slotWeapon(v: unknown, slot: 1 | 2): string | null {
  return isWeaponId(v) && WEAPONS[v]!.slot === slot ? v : null;
}

export function parsePlayerSnap(raw: unknown): PlayerSnap | null {
  const r = obj(raw);
  if (!r || !isNetId(r.id) || !isTeam(r.team)) return null;
  const n = Array.isArray(r.nades) ? r.nades : [];
  const p: PlayerSnap = {
    id: r.id,
    name: name(r.name),
    team: r.team,
    bot: r.bot === true,
    hp: clampNum(r.hp, 0, 100, 0, true),
    alive: r.alive === true,
    money: clampNum(r.money, 0, 65535, 0, true),
    kills: clampNum(r.kills, -9999, 9999, 0, true),
    deaths: clampNum(r.deaths, 0, 9999, 0, true),
    weapon: isWeaponId(r.weapon) ? r.weapon : 'knife',
    armor: clampNum(r.armor, 0, 100, 0, true),
    helmet: r.helmet === true,
    bomb: r.bomb === true,
    kit: r.kit === true,
    primary: slotWeapon(r.primary, 1),
    secondary: slotWeapon(r.secondary, 2),
    nades: [clampNum(n[0], 0, 5, 0, true), clampNum(n[1], 0, 5, 0, true), clampNum(n[2], 0, 5, 0, true)],
    ping: clampNum(r.ping, -1, 99999, -1, true),
  };
  if (typeof r.survived === 'boolean') p.survived = r.survived;
  return p;
}

/** Array mit höchstens `max` Einträgen, sonst null (riesige Arrays komplett verwerfen). */
function arr(v: unknown, max: number): unknown[] | null {
  return Array.isArray(v) && v.length <= max ? v : null;
}

export function parseSnapshot(raw: unknown): Snapshot | null {
  const r = obj(raw);
  if (!r) return null;
  const seq = num(r.seq, NET_LIMITS.seq);
  const time = num(r.time, 1e9);
  const round = parseRound(r.round);
  const players = arr(r.players, NET_LIMITS.players);
  if (seq === null || !Number.isInteger(seq) || seq < 0 || time === null || !round || !players) return null;
  const nades = arr(r.nades ?? [], NET_LIMITS.nades);
  const smokes = arr(r.smokes ?? [], NET_LIMITS.smokes);
  const drops = r.drops === undefined ? undefined : arr(r.drops, NET_LIMITS.drops);
  if (!nades || !smokes || drops === null) return null;
  const seen = new Set<string>();
  const ps: PlayerSnap[] = [];
  for (const raw of players) {
    const p = parsePlayerSnap(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    ps.push(p);
  }
  const ls = obj(r.lossStreak);
  const snap: Snapshot = {
    seq,
    time,
    round,
    players: ps,
    lossStreak: { T: clampNum(ls?.T, 0, 20, 0, true), CT: clampNum(ls?.CT, 0, 20, 0, true) },
    winner: isTeam(r.winner) ? r.winner : null,
    matchEndTimer: clampNum(r.matchEndTimer, 0, 60, 0),
    nades: nades.flatMap((x) => {
      const o = obj(x);
      const id = int(o?.id), p = vec3(o?.p);
      return o && id !== null && p && isGrenadeKind(o.kind) ? [{ id, kind: o.kind, p }] : [];
    }),
    smokes: smokes.flatMap((x) => {
      const o = obj(x);
      const p = vec3(o?.p);
      return o && p ? [{ p, r: clampNum(o.r, 0, 20, 0), t: clampNum(o.t, 0, 60, 0) }] : [];
    }),
    bombPos: r.bombPos === null || r.bombPos === undefined ? null : vec3(r.bombPos),
    ff: r.ff === true,
  };
  if (drops) {
    snap.drops = drops.flatMap((x) => {
      const o = obj(x);
      const id = int(o?.id), p = vec3(o?.p);
      return o && id !== null && p && isWeaponId(o.weapon) ? [{ id, weapon: o.weapon, p }] : [];
    });
  }
  if (r.lobby !== undefined) snap.lobby = r.lobby === null ? null : sanitizePublicLobby(r.lobby);
  return snap;
}

// ---------------------------------------------------------------- Ereignisse

export function parseEvent(raw: unknown): GameEvent | null {
  const r = obj(raw);
  if (!r) return null;
  switch (r.k) {
    case 'kill': {
      const killer = idOrNull(r.killer);
      if (killer === false || !isNetId(r.victim) || typeof r.weapon !== 'string' || !SHORT_KEY.test(r.weapon)) return null;
      return { k: 'kill', killer, victim: r.victim, weapon: r.weapon, hs: r.hs === true };
    }
    case 'hit': {
      const attacker = idOrNull(r.attacker);
      const from = vec3(r.from), at = vec3(r.at);
      if (attacker === false || !isNetId(r.victim) || !from || !at) return null;
      const e: GameEvent = { k: 'hit', victim: r.victim, attacker, dmg: clampNum(r.dmg, 0, 1000, 0), part: r.part === 'head' ? 'head' : 'body', from, at };
      if (r.fall === true) e.fall = true;
      return e;
    }
    case 'spawn': {
      const x = num(r.x), z = num(r.z), yaw = num(r.yaw, 1e6);
      if (!isNetId(r.id) || x === null || z === null || yaw === null) return null;
      const e: GameEvent = { k: 'spawn', id: r.id, x, z, yaw: wrapAngle(yaw), fresh: r.fresh === true };
      const y = num(r.y);
      if (y !== null) e.y = y;
      return e;
    }
    case 'shot': {
      const o = vec3(r.o);
      const ends = arr(r.ends, NET_LIMITS.rays), walls = arr(r.walls, NET_LIMITS.rays);
      if (!isNetId(r.id) || !isWeaponId(r.w) || !o || !ends || !walls) return null;
      const e3 = ends.map((v) => vec3(v)), w3 = walls.map((v) => vec3(v));
      if (e3.some((v) => !v) || w3.some((v) => !v)) return null;
      return { k: 'shot', id: r.id, w: r.w, o, ends: e3 as [number, number, number][], walls: w3 as [number, number, number][] };
    }
    case 'nade': {
      const id = int(r.id), o = vec3(r.o), v = vec3(r.v, 200);
      if (id === null || !o || !v || !isGrenadeKind(r.kind) || !isNetId(r.owner)) return null;
      return { k: 'nade', id, kind: r.kind, owner: r.owner, o, v };
    }
    case 'boom': {
      const id = int(r.id), at = vec3(r.at);
      if (id === null || !at || !isGrenadeKind(r.kind)) return null;
      return { k: 'boom', id, kind: r.kind, at };
    }
    case 'bomb': {
      const what = oneOf(BOMB_WHAT, r.what);
      const by = idOrNull(r.by ?? null);
      if (!what || by === false) return null;
      return { k: 'bomb', what, by, spot: r.spot === 'a' || r.spot === 'b' ? r.spot : null };
    }
    case 'round': {
      if (r.what !== 'start' && r.what !== 'end') return null;
      const e: GameEvent = { k: 'round', what: r.what, round: clampNum(r.round, 0, 999, 0, true) };
      const outcome = oneOf(OUTCOMES, r.outcome);
      if (outcome) e.outcome = outcome;
      if (r.reason !== undefined) e.reason = cleanText(r.reason, 80);
      return e;
    }
    case 'buy': {
      if (!isNetId(r.id) || typeof r.item !== 'string' || !SHORT_KEY.test(r.item)) return null;
      const e: GameEvent = { k: 'buy', id: r.id, item: r.item, ok: r.ok === true };
      if (r.reason !== undefined) e.reason = cleanText(r.reason, 64);
      return e;
    }
    case 'match':
      return isTeam(r.winner) ? { k: 'match', winner: r.winner } : null;
    case 'drop': {
      const it = obj(r.item);
      const by = idOrNull(r.by ?? null);
      const id = int(it?.id), x = num(it?.x), y = num(it?.y), z = num(it?.z);
      if (!it || by === false || id === null || x === null || y === null || z === null || !isWeaponId(it.weapon)) return null;
      return { k: 'drop', item: { id, weapon: it.weapon, x, y, z }, by };
    }
    case 'pickup': {
      const id = int(r.id);
      if (id === null || !isNetId(r.by) || !isWeaponId(r.weapon)) return null;
      return { k: 'pickup', id, by: r.by, weapon: r.weapon };
    }
    case 'join':
      return isNetId(r.id) && isTeam(r.team) ? { k: 'join', id: r.id, name: name(r.name), team: r.team } : null;
    case 'leave':
      return isNetId(r.id) ? { k: 'leave', id: r.id, name: name(r.name) } : null;
    case 'kick': {
      if (!isNetId(r.id) || typeof r.reason !== 'string' || !/^[a-z]{1,16}$/.test(r.reason)) return null;
      const e: GameEvent = { k: 'kick', id: r.id, reason: r.reason };
      if (typeof r.map === 'string' && MAP_ID.test(r.map)) e.map = r.map;
      return e;
    }
    case 'auth':
      return isNetId(r.id) && typeof r.nonce === 'string' && /^[0-9a-f]{16}$/.test(r.nonce) ? { k: 'auth', id: r.id, nonce: r.nonce } : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Nachrichten

/**
 * Einstieg für alle empfangenen Nachrichten: geprüfte, bereinigte Kopie oder null.
 * Unbekannte Felder (z. B. vom Relay gestempeltes `from`) fallen weg.
 */
export function parseNetMsg(raw: unknown): NetMsg | null {
  const r = obj(raw);
  if (!r) return null;
  switch (r.t) {
    case 'pose':
      return parsePose(r);
    case 'poses': {
      const list = arr(r.p, NET_LIMITS.poses);
      const h = optId(r.h);
      if (!list || h === null) return null;
      const p = list.map(parsePose).filter((x): x is PoseMsg => !!x);
      return h === undefined ? { t: 'poses', p } : { t: 'poses', p, h };
    }
    case 'hello': {
      if (!isNetId(r.id)) return null;
      const team = r.team === 'auto' || isTeam(r.team) ? r.team : null;
      if (!team) return null;
      const m: NetMsg = { t: 'hello', id: r.id, name: name(r.name), team };
      if (typeof r.v === 'string') m.v = cleanText(r.v, 16, '?');
      if (typeof r.map === 'string' && MAP_ID.test(r.map)) m.map = r.map;
      // Antwort auf die Passwort-Anfrage: fehlt = erste Meldung; alles Ungültige zählt als „kein Passwort“
      if (r.pr !== undefined) m.pr = typeof r.pr === 'string' && /^[0-9a-f]{16}$/.test(r.pr) ? r.pr : null;
      return m;
    }
    case 'fire': {
      const o = vec3(r.o);
      const d = arr(r.d, NET_LIMITS.rays);
      if (!isNetId(r.id) || !isWeaponId(r.w) || !o || !d || !d.length) return null;
      const dirs = d.map(unitDir);
      if (dirs.some((x) => !x)) return null;
      return { t: 'fire', id: r.id, w: r.w, o, d: dirs as [number, number, number][], seq: clampNum(r.seq, 0, NET_LIMITS.seq, 0, true) };
    }
    case 'throw': {
      const o = vec3(r.o), d = unitDir(r.d), s = num(r.s, 1e3);
      if (!isNetId(r.id) || !isGrenadeKind(r.kind) || !o || !d || s === null) return null;
      return { t: 'throw', id: r.id, kind: r.kind, o, d, s: Math.max(0, Math.min(1, s)) };
    }
    case 'buy':
      return isNetId(r.id) && isBuyItem(r.item) ? { t: 'buy', id: r.id, item: r.item } : null;
    case 'ammo':
      return isNetId(r.id) && (r.slot === 1 || r.slot === 2) ? { t: 'ammo', id: r.id, slot: r.slot } : null;
    case 'team':
      return isNetId(r.id) && isTeam(r.team) ? { t: 'team', id: r.id, team: r.team } : null;
    case 'chat': {
      const text = chatText(r.text);
      if (!isNetId(r.id) || !text) return null;
      return { t: 'chat', id: r.id, name: name(r.name), text, team: isTeam(r.team) ? r.team : null, teamOnly: r.teamOnly === true };
    }
    case 'reload':
      return isNetId(r.id) && isWeaponId(r.w) ? { t: 'reload', id: r.id, w: r.w } : null;
    case 'dropreq':
      return isNetId(r.id) && isWeaponId(r.w) ? { t: 'dropreq', id: r.id, w: r.w } : null;
    case 'fall': {
      const v = num(r.v, 1e4);
      return isNetId(r.id) && v !== null ? { t: 'fall', id: r.id, v } : null;
    }
    case 'snap': {
      const s = parseSnapshot(r.s);
      const h = optId(r.h);
      if (!s || h === null) return null;
      return h === undefined ? { t: 'snap', s } : { t: 'snap', s, h };
    }
    case 'ev': {
      const e = parseEvent(r.e);
      const h = optId(r.h);
      if (!e || h === null) return null;
      return h === undefined ? { t: 'ev', e } : { t: 'ev', e, h };
    }
    case 'ping': {
      const h = optId(r.h);
      const n = num(r.n, 1e9);
      if (n === null || !Number.isInteger(n) || h === null) return null;
      return h === undefined ? { t: 'ping', n } : { t: 'ping', n, h };
    }
    case 'pong': {
      const n = num(r.n, 1e9);
      return isNetId(r.id) && n !== null && Number.isInteger(n) ? { t: 'pong', id: r.id, n } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Absender

/** Nachrichten, die nur der Host senden darf. */
const HOST_ONLY = new Set<NetMsg['t']>(['snap', 'ev', 'ping', 'poses']);

/**
 * Darf diese Nachricht von diesem Absender kommen? `from` = vom Relay gestempelte
 * Verbindungs-ID (null beim Needle-Server: dann ist nur die Host-Kennung `h` prüfbar).
 * Host-Nachrichten brauchen `h` = aktueller Host; Client-Nachrichten müssen von der ID
 * kommen, die sie behaupten (Ausnahme: der Host spricht für seine Bots).
 * Client-Nachrichten (außer Chat) im Namen eines Bots oder des Hosts sind immer falsch:
 * Host und Bots handeln nur lokal auf dem Host — und ihre Eingaben prüft der Host nicht.
 */
export function senderAllowed(msg: NetMsg, from: string | null, hostId: string): boolean {
  if (HOST_ONLY.has(msg.t)) {
    const h = (msg as { h?: string }).h;
    if (!hostId || h !== hostId) return false;
    return from === null || from === hostId;
  }
  const id = (msg as { id: string }).id;
  if (msg.t !== 'chat' && (id.startsWith('bot-') || id === hostId)) return false;
  if (from === null) return true;
  if (from === id) return true;
  return msg.t === 'chat' && from === hostId && id.startsWith('bot-');
}

// ---------------------------------------------------------------- Snapshot-Reihenfolge

export const SNAP_SEQ = {
  /** Größter akzeptierter Sprung nach vorn (10 Hz → 60 s). */
  maxJump: 600,
  /** Ohne akzeptierten Snapshot so lange (s) → neu synchronisieren (nächste Sequenz gilt). */
  resync: 1.0,
} as const;

/**
 * Snapshot-Reihenfolge des Clients: nur neuere Sequenzen in einem plausiblen Fenster.
 * Ein gefälschter Riesenwert (z. B. 1e15) friert den Client so nicht ein: kommt eine
 * Sekunde lang nichts Gültiges an, gilt die nächste Sequenz als neuer Anfang.
 */
export class SnapSeqGate {
  last = -1;
  private lastAt = -Infinity;

  accept(seq: number, now: number): boolean {
    if (!Number.isFinite(seq) || seq < 0) return false;
    const fresh = this.last < 0 || now - this.lastAt > SNAP_SEQ.resync;
    if (!fresh && !(seq > this.last && seq <= this.last + SNAP_SEQ.maxJump)) return false;
    this.last = seq;
    this.lastAt = now;
    return true;
  }

  /** Neuer Host → Zählung beginnt neu. */
  reset(): void {
    this.last = -1;
    this.lastAt = -Infinity;
  }
}
