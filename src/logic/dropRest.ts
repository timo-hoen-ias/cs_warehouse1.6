/**
 * Ruhelage liegender Waffen (rein rechnerisch): Dreh- und Verschiebewerte, damit ein Modell
 * mit seiner tiefsten Stelle genau auf dem Boden liegt (kein Einsinken, kein Schweben).
 * Modellraum wie in der Welt-Geometrie: x rechts, y oben, z = −f (Lauf zeigt nach −z).
 */
export type V3 = readonly [number, number, number];
export type Bounds = { min: V3; max: V3 };

/** Haltung am Boden: `side` = auf die linke Seite gelegt (Waffen, Messer), `upright` = stehend (Granaten), `flat` = flach (C4). */
export type Lay = 'side' | 'upright' | 'flat';

/** Abstand (m) zwischen Boden und tiefstem Punkt (gegen Z-Fighting mit dem Boden). */
export const DROP_CLEARANCE = 0.004;

export type RestPose = {
  /** Drehung des Modells um z (π/2 = auf die linke Seite: rechte Seite zeigt nach oben). */
  rotZ: number;
  /** Position des Modell-Ursprungs relativ zum Bodenpunkt: Mitte (x, z) auf 0, Unterkante auf `clearance`. */
  offset: V3;
};

/** Achsenparallele Hülle nach einer Drehung um z. */
export function rotatedBounds(b: Bounds, rotZ: number): Bounds {
  const c = Math.cos(rotZ);
  const s = Math.sin(rotZ);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [b.min[0], b.max[0]]) {
    for (const y of [b.min[1], b.max[1]]) {
      xs.push(x * c - y * s);
      ys.push(x * s + y * c);
    }
  }
  return {
    min: [Math.min(...xs), Math.min(...ys), b.min[2]],
    max: [Math.max(...xs), Math.max(...ys), b.max[2]],
  };
}

/** Ruhelage für ein Modell mit den gegebenen Grenzen. */
export function dropRest(b: Bounds, lay: Lay, clearance = DROP_CLEARANCE): RestPose {
  const rotZ = lay === 'side' ? Math.PI / 2 : 0;
  const r = rotatedBounds(b, rotZ);
  return {
    rotZ,
    offset: [-(r.min[0] + r.max[0]) / 2, clearance - r.min[1], -(r.min[2] + r.max[2]) / 2],
  };
}

/** Grenzen des Modells nach Anwendung der Ruhelage (Boden bei y = 0). */
export function restedBounds(b: Bounds, pose: RestPose): Bounds {
  const r = rotatedBounds(b, pose.rotZ);
  return {
    min: [r.min[0] + pose.offset[0], r.min[1] + pose.offset[1], r.min[2] + pose.offset[2]],
    max: [r.max[0] + pose.offset[0], r.max[1] + pose.offset[1], r.max[2] + pose.offset[2]],
  };
}
