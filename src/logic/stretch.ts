/**
 * Stückweise lineare Längsstauchung (Modell-Anpassung): bildet gebaute Koordinaten f (vorwärts, m)
 * auf endgültige ab. Stützstellen `[gebaut, endgültig]` aufsteigend; außerhalb der ersten/letzten
 * Stelle gilt Steigung 1 (reine Verschiebung). Damit lassen sich Waffen auf ihre echte Länge
 * bringen, ohne Querschnitte (Griff, Magazin, Gehäusehöhe) zu verzerren.
 */
export type Knots = readonly (readonly [number, number])[];

export type StretchMap = {
  /** gebaute f → endgültige f. */
  map(f: number): number;
  /** Steigung df'/df an der Stelle f (für Normalen). */
  slope(f: number): number;
};

export const IDENTITY_STRETCH: StretchMap = { map: (f) => f, slope: () => 1 };

/** Prüft Stützstellen (mind. 2, streng aufsteigend in beiden Spalten) und baut die Abbildung. */
export function stretchMap(knots: Knots): StretchMap {
  if (knots.length < 2) throw new Error('stretchMap: mindestens zwei Stützstellen');
  for (let i = 1; i < knots.length; i++) {
    if (!(knots[i]![0] > knots[i - 1]![0]) || !(knots[i]![1] > knots[i - 1]![1])) throw new Error('stretchMap: Stützstellen müssen streng aufsteigen');
  }
  const last = knots.length - 1;
  const seg = (f: number): number => {
    for (let i = 1; i <= last; i++) if (f < knots[i]![0]) return i - 1;
    return last - 1;
  };
  return {
    map(f) {
      if (f <= knots[0]![0]) return knots[0]![1] + (f - knots[0]![0]);
      if (f >= knots[last]![0]) return knots[last]![1] + (f - knots[last]![0]);
      const i = seg(f);
      const [a0, b0] = knots[i]!;
      const [a1, b1] = knots[i + 1]!;
      return b0 + ((f - a0) * (b1 - b0)) / (a1 - a0);
    },
    slope(f) {
      if (f <= knots[0]![0] || f >= knots[last]![0]) return 1;
      const i = seg(f);
      const [a0, b0] = knots[i]!;
      const [a1, b1] = knots[i + 1]!;
      return (b1 - b0) / (a1 - a0);
    },
  };
}
