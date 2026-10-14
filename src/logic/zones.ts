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

/** Radius der Kaufzone um den Team-Spawn (m). */
export const BUY_ZONE_RADIUS = 14;

/** Steht der Spieler in der Kaufzone seines Teams? */
export function inBuyZone(px: number, pz: number, team: 'T' | 'CT', zones: { t: ZonePoint; ct: ZonePoint }, radius = BUY_ZONE_RADIUS): boolean {
  return inRadius(px, pz, team === 'T' ? zones.t : zones.ct, radius);
}

/** Bomben-Piepen: Intervall (s) aus der Restzeit — 1 s am Anfang, zum Ende hin 0.1 s. */
export function beepInterval(fuseLeft: number, fuseTotal = 40): number {
  const f = Math.max(0, Math.min(1, fuseLeft / fuseTotal));
  return 0.1 + 0.9 * f * f;
}
