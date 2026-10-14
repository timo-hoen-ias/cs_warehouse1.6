/** Pure Hitbox-Mathematik für Schadens-Ziele (Mensch-Proxy). Kein three-Import. */

export type Aabb = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
export type Vec3 = { x: number; y: number; z: number };
export type BodyPart = 'head' | 'body';
export type PartBox = { part: BodyPart; box: Aabb };

export const BODY = { w: 0.62, d: 0.34, h: 1.35 } as const;
export const HEAD = { r: 0.2, h: 0.24 } as const;

/**
 * Mensch-Proxy aus zwei Boxen, zentriert auf (feetX, feetZ), Fußpunkt feetY.
 * body: 0 … BODY.h hoch, Kopf sitzt auf dem Körper.
 */
export function humanPartBoxes(feet: Vec3, scale = 1): PartBox[] {
  const halfW = (BODY.w * scale) / 2;
  const halfD = (BODY.d * scale) / 2;
  const bodyH = BODY.h * scale;
  const headR = HEAD.r * scale;
  const headH = HEAD.h * scale;
  const headY = bodyH - headH * 0.2; // leicht überlappend, kein Spalt
  const body: PartBox = {
    part: 'body',
    box: { minX: feet.x - halfW, minY: feet.y, minZ: feet.z - halfD, maxX: feet.x + halfW, maxY: feet.y + bodyH, maxZ: feet.z + halfD },
  };
  const head: PartBox = {
    part: 'head',
    box: {
      minX: feet.x - headR, minY: feet.y + headY, minZ: feet.z - headR,
      maxX: feet.x + headR, maxY: feet.y + headY + headH, maxZ: feet.z + headR,
    },
  };
  return [body, head];
}

/** Slab-Verfahren: Schnittdistanz Strahl–Box, oder null. */
export function rayIntersectAabb(origin: Vec3, dir: Vec3, box: Aabb): number | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  const axes: ['x' | 'y' | 'z', number, number][] = [
    ['x', box.minX, box.maxX],
    ['y', box.minY, box.maxY],
    ['z', box.minZ, box.maxZ],
  ];
  for (const [axis, lo, hi] of axes) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const inv = 1 / d;
    let t0 = (lo - o) * inv;
    let t1 = (hi - o) * inv;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
    if (tMax < tMin) return null;
  }
  if (tMax < 0) return null;
  return tMin >= 0 ? tMin : tMax;
}

/** Entfernung zum nächsten getroffenen AABB entlang des Strahls (oder max). */
export function nearestAabbDistance(origin: Vec3, dir: Vec3, boxes: Aabb[], max = Infinity): number {
  let best = max;
  for (const box of boxes) {
    const t = rayIntersectAabb(origin, dir, box);
    if (t !== null && t > 0.02 && t < best) best = t;
  }
  return best;
}

export type PartHit = { part: BodyPart; dist: number };

/** Schießt einen Strahl auf alle Part-Boxen und liefert den nächsten Treffer (nächste Distanz). */
export function castParts(origin: Vec3, dir: Vec3, parts: PartBox[]): PartHit | null {
  let best: PartHit | null = null;
  for (const { part, box } of parts) {
    const t = rayIntersectAabb(origin, dir, box);
    if (t === null) continue;
    if (!best || t < best.dist) best = { part, dist: t };
  }
  return best;
}

/**
 * Nach außen gerichtete Flächennormale der Box, auf deren Oberfläche der Punkt liegt
 * (Abstand zu einer min/max-Fläche ≤ eps). Für flach aufliegende Decals an Trefferpunkten.
 */
export function boxSurfaceNormal(box: Aabb, point: Vec3, eps = 0.02): Vec3 | null {
  const checks: { axis: 'x' | 'y' | 'z'; onMin: boolean; dist: number; n: Vec3 }[] = [
    { axis: 'x', onMin: true, dist: point.x - box.minX, n: { x: -1, y: 0, z: 0 } },
    { axis: 'x', onMin: false, dist: box.maxX - point.x, n: { x: 1, y: 0, z: 0 } },
    { axis: 'y', onMin: true, dist: point.y - box.minY, n: { x: 0, y: -1, z: 0 } },
    { axis: 'y', onMin: false, dist: box.maxY - point.y, n: { x: 0, y: 1, z: 0 } },
    { axis: 'z', onMin: true, dist: point.z - box.minZ, n: { x: 0, y: 0, z: -1 } },
    { axis: 'z', onMin: false, dist: box.maxZ - point.z, n: { x: 0, y: 0, z: 1 } },
  ];
  let best: Vec3 | null = null;
  let bestDist = Infinity;
  for (const c of checks) {
    if (c.dist <= eps && c.dist < bestDist) {
      bestDist = c.dist;
      best = c.n;
    }
  }
  return best;
}

/** Oberflächennormale der ersten Box, auf deren Fläche der Punkt liegt. */
export function surfaceNormalOnBoxes(boxes: Aabb[], point: Vec3, eps = 0.02): Vec3 | null {
  for (const box of boxes) {
    const n = boxSurfaceNormal(box, point, eps);
    if (n) return n;
  }
  return null;
}

/**
 * Normale der Fläche, durch die ein Strahl in die Box EINtritt (deterministisch).
 * Anders als boxSurfaceNormal kein eps-Raten: die Eintrittsfläche ist diejenige,
 * deren Ebenen-Distanz t = (plane − origin)/dir minimal und ≥ 0 ist. Die Normale
 * zeigt nach außen (zur Strahl-Quelle). Liefert null nur, wenn der Strahl die Box
 * gar nicht trifft.
 */
export function rayEntryNormal(box: Aabb, origin: Vec3, dir: Vec3): Vec3 | null {
  if (rayIntersectAabb(origin, dir, box) === null) return null;
  // Slab-Verfahren: der Strahl ist erst IN der Box, wenn er alle Eintritts-Ebenen
  // passiert hat → die Eintrittsfläche ist die mit der GRÖSSTEN Eintritts-Distanz.
  let bestT = -Infinity;
  let best: Vec3 | null = null;
  const axes: ['x' | 'y' | 'z', number, number][] = [
    ['x', box.minX, box.maxX],
    ['y', box.minY, box.maxY],
    ['z', box.minZ, box.maxZ],
  ];
  for (const [axis, lo, hi] of axes) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-9) continue;
    // Eintritts-Ebene: bei positiver Richtung min, bei negativer Richtung max.
    const plane = d > 0 ? lo : hi;
    const t = (plane - o) / d;
    if (t >= 0 && t > bestT) {
      bestT = t;
      const s = d > 0 ? -1 : 1; // nach außen weisend
      best = axis === 'x' ? { x: s, y: 0, z: 0 } : axis === 'y' ? { x: 0, y: s, z: 0 } : { x: 0, y: 0, z: s };
    }
  }
  return best;
}
