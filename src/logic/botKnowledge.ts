import type { Team } from './economy';
import type { XYZ } from './nav';
import { routesTo, siteInfo, zoneAt, type BotMapInfo, type SiteId } from './botMap';

/**
 * Team-Wissen der Bots (pure „Blackboard“): zuletzt bekannte Gegnerpositionen mit
 * Zeitstempel und Quelle (gesehen, gehört, Schuss, Treffer, Funk), Zerfall mit der
 * Zeit, gefallene Kameraden, Bombenzustand. Daraus: Druck auf einen Spot (für
 * Rotationen der CT bzw. die Spotwahl der T).
 */
export type Source = 'seen' | 'heard' | 'shot' | 'damage';

export type Sighting = { id: string; pos: XYZ; t: number; source: Source; zone: number };

export type TeamKnowledge = {
  team: Team;
  enemies: Map<string, Sighting>;
  dead: Set<string>;
  mateDeaths: { pos: XYZ; t: number; zone: number }[];
  /** Bombe gesehen/gehört: Position, Zeit, Zustand. */
  bomb: { pos: XYZ; t: number; state: 'carried' | 'dropped' | 'planted' | 'defusing' } | null;
};

export const KNOW = {
  /** Vergessen nach (s). */
  forgetSeen: 22,
  forgetHeard: 12,
  /** Zeitkonstante der Zuverlässigkeit (s). */
  tauSeen: 8,
  tauHeard: 4,
  /** Fenster für „frische“ Informationen (s). */
  fresh: 10,
} as const;

const RANK: Record<Source, number> = { seen: 3, damage: 2, shot: 2, heard: 1 };

export function newKnowledge(team: Team): TeamKnowledge {
  return { team, enemies: new Map(), dead: new Set(), mateDeaths: [], bomb: null };
}

/** Neue Runde: alles vergessen. */
export function resetKnowledge(k: TeamKnowledge): void {
  k.enemies.clear();
  k.dead.clear();
  k.mateDeaths.length = 0;
  k.bomb = null;
}

/**
 * Meldung eintragen. Neuere Sichtungen ersetzen ältere; eine schwächere Quelle
 * (gehört) ersetzt eine stärkere (gesehen) nur, wenn diese > 1.5 s alt ist.
 * Liefert true, wenn es eine *neue* Information ist (Gegner vorher unbekannt oder
 * > 6 s nicht gemeldet) — Anlass für einen Funkspruch.
 */
export function report(k: TeamKnowledge, s: Sighting): boolean {
  if (k.dead.has(s.id)) return false;
  const old = k.enemies.get(s.id);
  if (old && s.t < old.t) return false;
  if (old && RANK[s.source] < RANK[old.source] && s.t - old.t < 1.5) return false;
  k.enemies.set(s.id, s);
  return !old || s.t - old.t > 6;
}

export function markDead(k: TeamKnowledge, id: string): void {
  k.dead.add(id);
  k.enemies.delete(id);
}

/** Alte Einträge entfernen. */
export function decay(k: TeamKnowledge, now: number): void {
  for (const [id, s] of k.enemies) {
    const age = now - s.t;
    if (age > (s.source === 'seen' ? KNOW.forgetSeen : KNOW.forgetHeard)) k.enemies.delete(id);
  }
  while (k.mateDeaths.length && now - k.mateDeaths[0]!.t > 30) k.mateDeaths.shift();
}

/** Zuverlässigkeit 0..1 einer Sichtung. */
export function confidence(s: Sighting, now: number): number {
  return Math.exp(-(now - s.t) / (s.source === 'seen' ? KNOW.tauSeen : KNOW.tauHeard));
}

/** Bekannte Gegner (nicht älter als maxAge), neueste zuerst. */
export function known(k: TeamKnowledge, now: number, maxAge: number = KNOW.fresh): Sighting[] {
  return [...k.enemies.values()].filter((s) => now - s.t <= maxAge).sort((a, b) => b.t - a.t);
}

/** Nächste bekannte Gegnerposition zu pos (oder null). */
export function nearestThreat(k: TeamKnowledge, pos: XYZ, now: number, maxAge: number = KNOW.fresh): Sighting | null {
  let best: Sighting | null = null;
  let bd = Infinity;
  for (const s of k.enemies.values()) {
    if (now - s.t > maxAge) continue;
    const d = Math.hypot(s.pos.x - pos.x, s.pos.y - pos.y, s.pos.z - pos.z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/**
 * Zonen-Gewichte für den Druck auf einen Spot: Spot-Zonen 1.0, die letzten Zonen der
 * T-Routen dorthin 0.8/0.5 (geteilte Zonen, etwa die Mitte, zählen nur halb).
 */
export function approachWeights(info: BotMapInfo, site: SiteId): Map<number, number> {
  const key = `approach|${site}`;
  const cached = info.cache.get(key) as Map<number, number> | undefined;
  if (cached) return cached;
  const w = new Map<number, number>();
  const s = siteInfo(info, site);
  if (s) for (const z of s.zones) w.set(z, 1);
  const other: SiteId = site === 'a' ? 'b' : 'a';
  const otherZones = new Set(routesTo(info, 'T', other).flatMap((r) => r.zones.slice(-3)));
  for (const r of routesTo(info, 'T', site)) {
    const zs = r.zones.filter((z) => !w.has(z) || w.get(z)! < 1);
    const last = zs.slice(-2).reverse();
    last.forEach((z, i) => {
      const base = i === 0 ? 0.8 : 0.5;
      const val = otherZones.has(z) ? base * 0.5 : base;
      if ((w.get(z) ?? 0) < val) w.set(z, val);
    });
  }
  info.cache.set(key, w);
  return w;
}

/** Druck auf einen Spot: gewichtete Summe frischer Gegnermeldungen in seinen Zonen (+ Bombe). */
export function sitePressure(k: TeamKnowledge, info: BotMapInfo, site: SiteId, now: number, window: number = KNOW.fresh): number {
  const w = approachWeights(info, site);
  let p = 0;
  for (const s of k.enemies.values()) {
    if (now - s.t > window) continue;
    p += (w.get(s.zone) ?? 0) * (s.source === 'seen' ? 1 : 0.6);
  }
  for (const d of k.mateDeaths) if (now - d.t <= window) p += (w.get(d.zone) ?? 0) * 0.8;
  if (k.bomb && now - k.bomb.t <= window * 2) {
    const z = zoneAt(info, k.bomb.pos);
    p += (w.get(z) ?? 0) * 2;
  }
  return p;
}

/** Kurzform: Sichtung mit Zone erzeugen. */
export function sighting(info: BotMapInfo, id: string, pos: XYZ, t: number, source: Source): Sighting {
  return { id, pos: { ...pos }, t, source, zone: zoneAt(info, pos) };
}
