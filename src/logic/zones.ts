/** Zonen-Helfer: Radius-Tests für Bombenspots und Kaufzonen. */

export type ZonePoint = { x: number; z: number };

/** Ist ein Punkt (XZ) innerhalb eines Radius um die Zone? */
export function inRadius(px: number, pz: number, zone: ZonePoint, radius: number): boolean {
  const dx = px - zone.x;
  const dz = pz - zone.z;
  return dx * dx + dz * dz <= radius * radius;
}

/** Liefert den Spot ('a'|'b'), auf dem der Punkt steht, sonst null. */
export function spotAt(
  px: number, pz: number,
  spots: { a: ZonePoint; b: ZonePoint },
  radius = 2.0,
): 'a' | 'b' | null {
  if (inRadius(px, pz, spots.a, radius)) return 'a';
  if (inRadius(px, pz, spots.b, radius)) return 'b';
  return null;
}
