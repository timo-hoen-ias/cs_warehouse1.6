import type { Bounds2D } from '../shared/level';
import type { Aabb } from './hitbox';

/**
 * Hallendach (pure): Deckenplatte als Kollisionsbox (Granaten prallen ab, Schüsse treffen),
 * Raster der Hallenstrahler und Positionen der Dachbinder. Die Darstellung baut LevelView
 * aus denselben Zahlen, damit Lichtkegel, Licht-Map und Leuchten übereinstimmen.
 */
export const CEILING = {
  /** Dicke der Dachplatte (m). */
  thickness: 0.4,
  /** Abstand der Dachbinder (Fachwerkträger) entlang X (m). */
  trussSpacing: 8,
  /** Bauhöhe eines Binders unter dem Dach (m). */
  trussDepth: 1.4,
  /** Lampenraster (m) und Abhängehöhe unter dem Dach. */
  lampSpacingX: 8,
  lampSpacingZ: 10,
  lampDrop: 1.9,
  /** Radius des hellen Lichtflecks am Boden (m). */
  lampPool: 7,
} as const;

/** Deckenplatte über der ganzen Halle (inkl. Wandstärke-Überstand). */
export function ceilingBox(inner: Bounds2D, height: number, pad = 1): Aabb {
  return {
    minX: inner.minX - pad,
    maxX: inner.maxX + pad,
    minY: height,
    maxY: height + CEILING.thickness,
    minZ: inner.minZ - pad,
    maxZ: inner.maxZ + pad,
  };
}

/** Gleichmäßig verteilte Positionen in [lo, hi] mit Abstand ≈ step, mittig ausgerichtet. */
export function spread(lo: number, hi: number, step: number): number[] {
  const len = hi - lo;
  if (len <= 0 || step <= 0) return [];
  const n = Math.max(1, Math.floor(len / step));
  const gap = len / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(lo + gap * (i + 0.5));
  return out;
}

/** X-Positionen der Dachbinder (quer zur Halle, spannen über Z). */
export function trussPositions(inner: Bounds2D): number[] {
  return spread(inner.minX, inner.maxX, CEILING.trussSpacing);
}

/** Hallenstrahler: hängen an den Bindern, Raster entlang Z. */
export function lampGrid(inner: Bounds2D): { x: number; z: number }[] {
  const xs = trussPositions(inner);
  const zs = spread(inner.minZ, inner.maxZ, CEILING.lampSpacingZ);
  const out: { x: number; z: number }[] = [];
  for (const x of xs) for (const z of zs) out.push({ x, z });
  return out;
}

/**
 * Helligkeit des Hallenbodens (0..1) an (x,z) aus allen Strahlern: weicher Abfall bis
 * lampPool, Grundhelligkeit `base`. Wird in eine Licht-Map-Textur gebacken.
 */
export function floorLight(x: number, z: number, lamps: readonly { x: number; z: number }[], base = 0.32, pool: number = CEILING.lampPool): number {
  let sum = base;
  for (const l of lamps) {
    const d = Math.hypot(l.x - x, l.z - z);
    if (d >= pool) continue;
    const t = 1 - d / pool;
    sum += 0.75 * t * t;
  }
  return Math.min(1, sum);
}
