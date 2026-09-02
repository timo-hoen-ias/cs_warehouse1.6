/** Headbob-Parameter (subtiler CS-Light-Stil). */
export const BOB = {
  /** Radiant Phase pro gelaufenem Meter (Schritttempo folgt Geschwindigkeit). */
  freq: 2.4,
  /** Maximale vertikale Auslenkung (m) beim Laufen. */
  amp: 0.022,
  /** Maximale seitliche Auslenkung (m). */
  side: 0.006,
  /** Maximale Roll-Neigung der Kamera (rad). */
  roll: 0.0016,
  /** Dämpfungsfaktor fürs Ducken (weniger Bob). */
  crouchFactor: 0.35,
  /** Speed-Schwelle (m/s), unter der kein Bob zählt. */
  minSpeed: 0.35,
  /** Über-Sprint-Faktor (Bob wächst leicht über den Normalwert). */
  sprintBoost: 1.35,
};

export type BobOffsets = {
  x: number;
  y: number;
  roll: number;
};

/** Zählt die Bob-Phase weiter (nur bei Bewegung). Phase in Radiant. */
export function advanceBob(phase: number, speed: number, dt: number): number {
  if (speed <= BOB.minSpeed || dt <= 0) return phase;
  return phase + speed * BOB.freq * dt;
}

/** Bob-Stärke (0..~1.35) aus Tempo + Ducken. */
export function bobScale(speed: number, walk: number, crouched: boolean): number {
  if (speed <= BOB.minSpeed) return 0;
  const s = Math.min(BOB.sprintBoost, speed / Math.max(walk, 0.01));
  return s * (crouched ? BOB.crouchFactor : 1);
}

/** Sicht-Offsets (m / rad) zur aktuellen Phase; scale aus bobScale. */
export function bobOffset(phase: number, scale: number): BobOffsets {
  return {
    x: Math.sin(phase * 0.5) * BOB.side * scale,
    y: Math.sin(phase) * BOB.amp * scale,
    roll: Math.sin(phase * 0.5) * BOB.roll * scale,
  };
}
