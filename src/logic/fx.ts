import type { Vec3 } from './hitbox';

/** Abgeleiteter Trefferpunkt aus Ray-Origin + Richtung + Distanz. */
export function hitPoint(origin: Vec3, dir: Vec3, dist: number): Vec3 {
  return {
    x: origin.x + dir.x * dist,
    y: origin.y + dir.y * dist,
    z: origin.z + dir.z * dist,
  };
}

/** Richtung eines Tracers: vom Mündungspunkt zum Trefferpunkt (normalisiert). */
export function tracerDir(from: Vec3, to: Vec3): Vec3 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / l, y: dy / l, z: dz / l };
}
