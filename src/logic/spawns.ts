import type { Bounds2D, Vec3 } from '../shared/level';
import type { SolidBox } from './level';
import { PLAYER, pointFree } from './move';

/**
 * Spawnpunkte um eine Zone: deterministische Spirale aus Ring-Punkten, nur freie
 * Positionen (Abstand zu Solids) innerhalb der begehbaren Fläche. Pure & getestet.
 */
export function spawnPoints(center: Vec3, count: number, solids: SolidBox[], inner: Bounds2D, clearance = PLAYER.radius + 0.4): Vec3[] {
  const out: Vec3[] = [];
  if (count <= 0) return out;
  const cx = center[0];
  const cz = center[2];
  const tryAdd = (x: number, z: number): void => {
    if (out.length >= count) return;
    if (x < inner.minX + clearance || x > inner.maxX - clearance || z < inner.minZ + clearance || z > inner.maxZ - clearance) return;
    if (!pointFree(x, z, solids, clearance)) return;
    // Mindestabstand zu bereits gewählten Punkten
    for (const p of out) if (Math.hypot(p[0] - x, p[2] - z) < 1.2) return;
    out.push([Math.round(x * 100) / 100, 0, Math.round(z * 100) / 100]);
  };
  tryAdd(cx, cz);
  for (let ring = 1; ring <= 8 && out.length < count; ring++) {
    const r = ring * 1.4;
    const n = 6 * ring;
    for (let i = 0; i < n && out.length < count; i++) {
      const a = (i / n) * Math.PI * 2;
      tryAdd(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
  }
  return out;
}

/** Blickwinkel (Yaw) vom Spawn in Richtung eines Zielpunkts (Kamera: yaw 0 = -Z). */
export function yawTowards(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
}
