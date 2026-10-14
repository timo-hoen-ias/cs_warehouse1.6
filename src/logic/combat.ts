import { castBlockers, castParts, type Blockers, type BodyPart, type PartBox, type Vec3 } from './hitbox';
import type { WeaponDef } from './weapons';

/**
 * Kampfauflösung (pure): Streuung auf den Strahl anwenden, Strahl gegen Level-Solids
 * und alle Ziel-Hitboxen schießen, nächsten Treffer bestimmen. Läuft auf dem Host
 * für Menschen (gemeldete Strahlen) und Bots gleichermaßen.
 */
export type ShotTarget = { id: string; parts: PartBox[] };

export type ShotHit =
  | { kind: 'target'; id: string; part: BodyPart; dist: number; point: Vec3 }
  | { kind: 'wall'; dist: number; point: Vec3; normal: Vec3 }
  | { kind: 'none'; dist: number; point: Vec3 };

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Orthonormale Basis (right, up) zu einer Blickrichtung. */
function basis(dir: Vec3): { right: Vec3; up: Vec3 } {
  const worldUp = Math.abs(dir.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = normalize({ x: dir.y * worldUp.z - dir.z * worldUp.y, y: dir.z * worldUp.x - dir.x * worldUp.z, z: dir.x * worldUp.y - dir.y * worldUp.x });
  const up = { x: right.y * dir.z - right.z * dir.y, y: right.z * dir.x - right.x * dir.z, z: right.x * dir.y - right.y * dir.x };
  return { right, up };
}

/** Streuung (Radiant, Kegelradius) zufällig auf eine Richtung anwenden. */
export function spreadDir(dir: Vec3, spread: number, rnd: () => number = Math.random): Vec3 {
  const d = normalize(dir);
  if (spread <= 0) return d;
  const { right, up } = basis(d);
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(rnd()) * spread;
  const ox = Math.cos(a) * r;
  const oy = Math.sin(a) * r;
  return normalize({ x: d.x + right.x * ox + up.x * oy, y: d.y + right.y * ox + up.y * oy, z: d.z + right.z * ox + up.z * oy });
}

/** Alle Projektil-Richtungen eines Schusses (Schrot: pellets Strahlen). */
export function shotDirs(def: WeaponDef, aim: Vec3, spread: number, rnd: () => number = Math.random): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < Math.max(1, def.pellets); i++) out.push(spreadDir(aim, spread, rnd));
  return out;
}

/**
 * Ein Strahl gegen Level + Ziele. Ziele hinter der nächsten Wand zählen nicht;
 * `ignoreId` = Schütze selbst.
 */
export function resolveRay(origin: Vec3, dir: Vec3, range: number, solids: Blockers, targets: ShotTarget[], ignoreId?: string): ShotHit {
  const wall = castBlockers(solids, origin, dir, range);
  const wallDist = wall ? wall.t : Infinity;
  let best: { id: string; part: BodyPart; dist: number } | null = null;
  for (const tg of targets) {
    if (tg.id === ignoreId) continue;
    const hit = castParts(origin, dir, tg.parts);
    if (!hit || hit.dist <= 0.02) continue;
    if (!best || hit.dist < best.dist) best = { id: tg.id, part: hit.part, dist: hit.dist };
  }
  const point = (d: number): Vec3 => ({ x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d });
  if (best && best.dist <= range && best.dist < wallDist) return { kind: 'target', id: best.id, part: best.part, dist: best.dist, point: point(best.dist) };
  if (wall && wallDist <= range) return { kind: 'wall', dist: wallDist, point: point(wallDist), normal: wall.normal };
  return { kind: 'none', dist: range, point: point(range) };
}

/** Nahkampf: trifft das nächste Ziel innerhalb der Messer-Reichweite (Strahl aus Augenhöhe). */
export function resolveMelee(origin: Vec3, dir: Vec3, def: WeaponDef, solids: Blockers, targets: ShotTarget[], ignoreId?: string): ShotHit {
  return resolveRay(origin, dir, def.range, solids, targets, ignoreId);
}

/** Richtung von a nach b (normalisiert) + Distanz. */
export function aimAt(from: Vec3, to: Vec3): { dir: Vec3; dist: number } {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const dist = Math.hypot(d.x, d.y, d.z);
  return { dir: dist > 1e-9 ? { x: d.x / dist, y: d.y / dist, z: d.z / dist } : { x: 0, y: 0, z: -1 }, dist };
}

/** Yaw/Pitch (Kamera-Konvention: yaw 0 = -Z, pitch + = hoch) aus einer Richtung. */
export function dirToYawPitch(dir: Vec3): { yaw: number; pitch: number } {
  return { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))) };
}

/** Richtung aus Yaw/Pitch. */
export function yawPitchToDir(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

/** Richtung um Winkel-Versatz drehen (pitch nach oben, yaw nach rechts positiv). */
export function offsetDir(dir: Vec3, dPitch: number, dYaw: number): Vec3 {
  const yp = dirToYawPitch(dir);
  const pitch = Math.max(-Math.PI / 2 + 1e-4, Math.min(Math.PI / 2 - 1e-4, yp.pitch + dPitch));
  // Kamera-Konvention: positiver Yaw dreht nach links → "rechts" = −Yaw
  return yawPitchToDir(yp.yaw - dYaw, pitch);
}
