import type { P3, WeaponGeom } from './weaponGeom';

/**
 * Ruhelage des Viewmodels im Kameraraum (rein rechnerisch, ohne three):
 * Der Halter sitzt bei `pos`, ist um `rot` gedreht (Euler-Reihenfolge YXZ wie in ViewModel.ts) und
 * um `scale` verkleinert. Ein Modellpunkt [x, y, f] (f = vorwärts) liegt im Kameraraum bei
 * pos + R · scale · (x, y, −f). Die Kamera blickt entlang −z, das Fadenkreuz liegt auf (0, 0, −d).
 */
export type V3 = { x: number; y: number; z: number };
export type ViewPlace = { pos: V3; rot: V3; scale: number };

/** Entfernung (m), in der die Laufachse das Fadenkreuz trifft (CS-Look: fast parallel, leicht eingedreht). */
export const AIM_DISTANCE = 10;

function rotateYXZ(v: V3, r: V3): V3 {
  // R = Ry · Rx · Rz (zuerst Rz auf den Vektor)
  const cz = Math.cos(r.z);
  const sz = Math.sin(r.z);
  let x = v.x * cz - v.y * sz;
  let y = v.x * sz + v.y * cz;
  let z = v.z;
  const cx = Math.cos(r.x);
  const sx = Math.sin(r.x);
  const y2 = y * cx - z * sx;
  const z2 = y * sx + z * cx;
  y = y2;
  z = z2;
  const cy = Math.cos(r.y);
  const sy = Math.sin(r.y);
  const x2 = x * cy + z * sy;
  const z3 = -x * sy + z * cy;
  x = x2;
  z = z3;
  return { x, y, z };
}

/** Modellpunkt [x, y, f] → Kameraraum (Ruhelage). */
export function viewPoint(place: ViewPlace, p: P3): V3 {
  const r = rotateYXZ({ x: p[0] * place.scale, y: p[1] * place.scale, z: -p[2] * place.scale }, place.rot);
  return { x: place.pos.x + r.x, y: place.pos.y + r.y, z: place.pos.z + r.z };
}

/** Richtung der Laufachse (Modell +f) im Kameraraum, normiert. */
export function viewAxis(place: ViewPlace): V3 {
  return rotateYXZ({ x: 0, y: 0, z: -1 }, place.rot);
}

/** Winkel (rad) zwischen zwei Vektoren. */
export function angleBetween(a: V3, b: V3): number {
  const d = a.x * b.x + a.y * b.y + a.z * b.z;
  const l = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  return Math.acos(Math.max(-1, Math.min(1, d / (l || 1))));
}

/**
 * Winkel (rad) zwischen der Laufachse und der Linie Mündung → Fadenkreuz-Punkt in `dist` Metern.
 * 0 = die Laufachse läuft genau auf das Fadenkreuz zu.
 */
export function aimError(place: ViewPlace, geom: Pick<WeaponGeom, 'muzzle'>, dist = AIM_DISTANCE): number {
  const m = viewPoint(place, geom.muzzle);
  return angleBetween(viewAxis(place), { x: -m.x, y: -m.y, z: -dist - m.z });
}

/** Winkel (rad) der Sichtlinie (Kimme → Korn) zum Fadenkreuz-Punkt: Kimme als Ausgangspunkt. */
export function sightError(place: ViewPlace, geom: Pick<WeaponGeom, 'sightRear' | 'sightFront'>, dist = AIM_DISTANCE): number {
  if (!geom.sightRear || !geom.sightFront) return 0;
  const a = viewPoint(place, geom.sightRear);
  const b = viewPoint(place, geom.sightFront);
  return angleBetween({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, { x: -a.x, y: -a.y, z: -dist - a.z });
}

/**
 * Drehung (YXZ, rad), bei der die Laufachse durch die Mündung auf das Fadenkreuz in `dist` Metern zeigt.
 * `roll` (Drehung um die Laufachse) bleibt frei wählbar (Handhaltungs-Stil).
 */
export function aimRotation(pos: V3, scale: number, geom: Pick<WeaponGeom, 'muzzle'>, roll = 0, dist = AIM_DISTANCE): V3 {
  let rot: V3 = { x: 0, y: 0, z: roll };
  for (let i = 0; i < 6; i++) {
    const m = viewPoint({ pos, rot, scale }, geom.muzzle);
    const d = { x: -m.x, y: -m.y, z: -dist - m.z };
    const l = Math.hypot(d.x, d.y, d.z);
    rot = { x: Math.asin(d.y / l), y: Math.atan2(-d.x, -d.z), z: roll };
  }
  return rot;
}
