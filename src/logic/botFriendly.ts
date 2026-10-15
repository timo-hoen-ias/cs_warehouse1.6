import { GRENADE } from './grenade';
import type { XYZ } from './nav';
import type { GrenadeKind } from './weapons';

/**
 * Rücksicht auf Teamkameraden (pure), wie die „Freund im Schussfeld“-Prüfung der CS-Bots:
 * - **Schussfeld**: liegt ein lebender Kamerad nahe der Schusslinie bis zum Ziel (Körperachse,
 *   Sicherheitsrand + Streuungskegel), hält der Bot das Feuer und tritt zur Seite — in engen
 *   Gassen schossen die Bots sonst durch ihre Vordermänner (Teamkills, bei ausgeschaltetem
 *   Friendly Fire vergeudete Schüsse),
 * - **nicht im Weg stehen**: wer direkt vor einem zielenden Kameraden steht, weicht seitlich aus,
 * - **Granaten**: HE und Blendgranaten landen nicht bei Kameraden.
 * Gilt unabhängig von der Server-Option Friendly Fire (wie in CS: Bots zielen nie auf Freunde).
 */
export const FRIENDLY = {
  /** Mindestabstand Schusslinie ↔ Körperachse des Kameraden (m): Körperradius ≈ 0.3 + Rand. */
  lineRadius: 0.6,
  /** Obergrenze des Abstands samt Streuungskegel (m). */
  lineMax: 0.8,
  /** Streuung (rad), mindestens eingerechnet. */
  minSpread: 0.012,
  /** Körperachse eines Kameraden: Füße + Fußhöhe … Kopf (m). */
  axisBottom: 0.05,
  axisTop: 1.75,
  /** Ein Kamerad hinter dem Ziel (oder neben ihm) zählt nicht: so weit vor dem Ziel endet die Prüfung (m). */
  beforeTarget: 0.5,
  /** Abstand zur Schusslinie eines zielenden Kameraden, ab dem man ausweicht (m). */
  yieldRadius: 0.8,
  /** Seitenschritt beim Ausweichen: Dauer (s), in der die Richtung beibehalten wird. */
  sideHold: 0.45,
  /** Granaten: HE-Zone um den Zündpunkt (Anteil am Splitterradius, ≥ ~30 % Schaden) und Blend-Zone (m). */
  heRadius: GRENADE.heRadius * 0.7,
  flashRadius: 8,
} as const;

/**
 * Streuungskegel (rad) für die Schusslinien-Prüfung: Zielfehler des Bots (zur Hälfte) plus
 * Waffenstreuung (Wärme, Bewegung, Ducken; zu 60 %) — die Kegelränder treffen selten, der Rand
 * bleibt durch `lineMax` begrenzt.
 */
export function shotSpread(aimErr: number, weaponSpread: number): number {
  return aimErr * 0.5 + weaponSpread * 0.6;
}

type V = XYZ;
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Kleinster Abstand zweier Strecken P(s)=p+s·d, s∈[0,1] und Q(u)=q+u·e, u∈[0,1];
 * liefert den Abstand und den Parameter s auf der ersten Strecke.
 */
export function segmentDistance(p: V, p2: V, q: V, q2: V): { dist: number; s: number } {
  const d = sub(p2, p);
  const e = sub(q2, q);
  const r = sub(p, q);
  const a = dot(d, d);
  const c = dot(e, e);
  const f = dot(e, r);
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  let s: number;
  let u: number;
  if (a < 1e-12 && c < 1e-12) {
    s = 0;
    u = 0;
  } else if (a < 1e-12) {
    s = 0;
    u = clamp(f / c);
  } else {
    const g = dot(d, r);
    if (c < 1e-12) {
      u = 0;
      s = clamp(-g / a);
    } else {
      const b = dot(d, e);
      const den = a * c - b * b;
      s = den > 1e-12 ? clamp((b * f - g * c) / den) : 0;
      u = (b * s + f) / c;
      if (u < 0) {
        u = 0;
        s = clamp(-g / a);
      } else if (u > 1) {
        u = 1;
        s = clamp((b - g) / a);
      }
    }
  }
  const cp = { x: p.x + d.x * s - (q.x + e.x * u), y: p.y + d.y * s - (q.y + e.y * u), z: p.z + d.z * s - (q.z + e.z * u) };
  return { dist: Math.hypot(cp.x, cp.y, cp.z), s };
}

export type LineBlock = {
  /** Der störende Kamerad (Füße). */
  mate: XYZ;
  /** Abstand der Schusslinie zur Körperachse (m) und erlaubter Mindestabstand an dieser Stelle. */
  dist: number;
  limit: number;
  /** Seitenschritt (XZ, normiert, senkrecht zur Schusslinie), der den Kameraden aus der Linie nimmt. */
  escape: { x: number; z: number };
};

export type LineOpts = {
  /** Streuung/Zielfehler (rad), wächst als Kegel mit dem Schussweg. */
  spread?: number;
  /** Mindestabstand (m) statt `FRIENDLY.lineRadius`. */
  radius?: number;
};

/**
 * Liegt ein Kamerad in der Schusslinie `origin → aim`? Gemessen wird der Abstand der Linie zur
 * senkrechten Körperachse des Kameraden; erlaubt ist `radius + spread · Schussweg` (höchstens
 * `lineMax`). Kameraden hinter dem Ziel zählen nicht. Liefert den knappsten Fall samt Seitenschritt.
 */
export function mateInLineOfFire(origin: XYZ, aim: XYZ, mates: readonly XYZ[], opts: LineOpts = {}): LineBlock | null {
  const len = Math.hypot(aim.x - origin.x, aim.y - origin.y, aim.z - origin.z);
  if (len < 0.05 || !mates.length) return null;
  const spread = Math.max(FRIENDLY.minSpread, opts.spread ?? 0);
  const radius = opts.radius ?? FRIENDLY.lineRadius;
  const dx = (aim.x - origin.x) / len;
  const dz = (aim.z - origin.z) / len;
  let best: LineBlock | null = null;
  let bestMargin = Infinity;
  for (const m of mates) {
    const { dist, s } = segmentDistance(origin, aim, { x: m.x, y: m.y + FRIENDLY.axisBottom, z: m.z }, { x: m.x, y: m.y + FRIENDLY.axisTop, z: m.z });
    const along = s * len;
    if (along > len - FRIENDLY.beforeTarget && len > 2 * FRIENDLY.beforeTarget) continue;
    const limit = Math.min(FRIENDLY.lineMax, radius + spread * along);
    if (dist >= limit) continue;
    const margin = dist - limit;
    if (margin >= bestMargin) continue;
    bestMargin = margin;
    // Senkrechte zur Schussrichtung in der Waagrechten; weg vom Kameraden (bei Gleichstand nach links)
    let px = -dz;
    let pz = dx;
    const hl = Math.hypot(px, pz);
    if (hl < 1e-6) {
      px = 1;
      pz = 0;
    } else {
      px /= hl;
      pz /= hl;
    }
    const side = (m.x - origin.x) * px + (m.z - origin.z) * pz;
    const sign = side > 0.02 ? -1 : 1;
    best = { mate: m, dist, limit, escape: { x: px * sign, z: pz * sign } };
  }
  return best;
}

/**
 * Steht `me` in der Schusslinie `from → to` eines Kameraden (der deshalb das Feuer hält)? Liefert den
 * Seitenschritt aus der Linie heraus (zur eigenen Seite hin, also entgegengesetzt zum Ausweichen des
 * Schützen — beide gehen auseinander) oder null.
 */
export function yieldStep(me: XYZ, lines: readonly { from: XYZ; to: XYZ }[], opts: LineOpts = {}): { x: number; z: number } | null {
  let best: LineBlock | null = null;
  for (const l of lines) {
    const b = mateInLineOfFire(l.from, l.to, [me], { radius: FRIENDLY.yieldRadius, ...opts });
    if (b && (!best || b.dist - b.limit < best.dist - best.limit)) best = b;
  }
  return best ? { x: -best.escape.x, z: -best.escape.z } : null;
}

/**
 * Würde eine Granate, die bei `land` zündet, Kameraden schwer treffen? HE: Kamera nahe dem Zündpunkt
 * mit Sichtlinie (Splitter), Blendgranate: in Blend-Nähe mit Sichtlinie (wohin sie schauen, ist unbekannt →
 * schlimmster Fall). Rauch ist harmlos. `clear` = Sichtlinie in der Kollisionswelt (ohne: nur Abstand).
 */
export function nadeHurtsMates(kind: GrenadeKind, land: XYZ, mates: readonly XYZ[], clear?: (a: XYZ, b: XYZ) => boolean): boolean {
  if (kind === 'smoke') return false;
  const radius = kind === 'he' ? FRIENDLY.heRadius : FRIENDLY.flashRadius;
  const from = { x: land.x, y: land.y + 0.15, z: land.z };
  for (const m of mates) {
    const chest = { x: m.x, y: m.y + 1.3, z: m.z };
    if (Math.hypot(chest.x - land.x, chest.y - land.y, chest.z - land.z) >= radius) continue;
    if (!clear || clear(from, chest)) return true;
  }
  return false;
}
