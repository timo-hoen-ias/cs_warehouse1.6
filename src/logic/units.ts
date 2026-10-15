/**
 * Einheitenumrechnung CS 1.6 (GoldSrc) → Meter.
 * 1 Einheit ≈ 2,54 cm; hier 2,48 cm, damit das Messer-Lauftempo (250 u/s) genau
 * 6,2 m/s ergibt — der Maßstab, auf dem alle Kartenlaufzeiten (docs/KARTENFORMAT.md) beruhen.
 */
export const UNIT = 0.0248;

/** CS-Einheiten (u bzw. u/s bzw. u/s²) in Meter (bzw. m/s, m/s²). */
export function u2m(u: number): number {
  return u * UNIT;
}
