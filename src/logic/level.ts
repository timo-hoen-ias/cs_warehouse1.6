/**
 * Solider, achsenparalleler Quader in Weltmetern (Altform für Tests und den
 * Viewmodel-Wandabstand). Karten nutzen `mapkit.ts` + `collision.ts`.
 */
export type SolidBox = {
  kind: 'rack' | 'wall' | 'prop' | 'platform' | 'step' | 'pillar' | 'rail' | 'dock';
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  label: string;
};

/** Kürzeste Distanz (XZ) von (x,z) zu einer Solid-Box (0 = innerhalb). */
export function nearestSolidXz(x: number, z: number, solids: SolidBox[]): number {
  let best = Infinity;
  for (const s of solids) {
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return 0;
    const dx = Math.max(s.minX - x, 0, x - s.maxX);
    const dz = Math.max(s.minZ - z, 0, z - s.maxZ);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}
