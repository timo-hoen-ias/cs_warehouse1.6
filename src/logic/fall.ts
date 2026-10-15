import { u2m } from './units';

/**
 * Landung und Sturzschaden (CS 1.6, PM_CheckFalling): Aufprallgeschwindigkeit (m/s, nach unten)
 * bestimmt Sicht-Ruck, Tempoverlust und Schaden.
 *  - ab 350 u/s: harte Landung (Kameraruck, Tempoverlust),
 *  - ab 580 u/s: Schaden, linear bis 100 HP bei 1024 u/s.
 * Mit g = 20 m/s² sind das ≈ 3.8 m (hart), ≈ 5.2 m (Schaden) und ≈ 16 m (tödlich) Fallhöhe.
 */
export const FALL = {
  /** Ab hier harte Landung (Kameraruck + Tempoverlust). */
  hard: u2m(350),
  /** Bis hier harmlos; darüber Schaden. */
  safe: u2m(580),
  /** Ab hier tödlich (100 Schaden). */
  fatal: u2m(1024),
  /** Größte vom Host akzeptierte gemeldete Aufprallgeschwindigkeit (Plausibilitätsgrenze, m/s). */
  maxReport: 40,
  /** Mindestabstand zweier akzeptierter Sturzmeldungen eines Spielers (s). */
  minGap: 0.4,
} as const;

/** Sturzschaden in HP (ganzzahlig, 0 = keiner). Rüstung schützt nicht (wie in CS). */
export function fallDamage(speed: number): number {
  if (!(speed > FALL.safe)) return 0;
  const s = Math.min(speed, FALL.maxReport);
  return Math.max(1, Math.min(100, Math.round(((s - FALL.safe) * 100) / (FALL.fatal - FALL.safe))));
}

/** Aufprallgeschwindigkeit aus der Fallhöhe (m) bei Schwerkraft g. */
export function fallSpeedFromHeight(height: number, gravity = 20): number {
  return Math.sqrt(2 * gravity * Math.max(0, height));
}

/** Fallhöhe (m), ab der Schaden entsteht. */
export function damageHeight(gravity = 20): number {
  return (FALL.safe * FALL.safe) / (2 * gravity);
}

/**
 * Stärke des Landeruckes der Kamera (0 = keiner, 1 ≈ Fall knapp unter der Schadensgrenze).
 * Normale Sprünge (≈ 6.7 m/s) geben ein leises Nicken, Stürze ein deutliches Eintauchen.
 */
export function landPunch(speed: number): number {
  if (speed <= 4) return 0;
  return Math.min(1.4, (speed - 4) / (FALL.safe - 4));
}

/** Faktor auf das Horizontaltempo nach der Landung: 1 bis zur harten Landung, danach bis 0.5 bei Schadensgrenze. */
export function landSlow(speed: number): number {
  if (speed <= FALL.hard) return 1;
  const t = Math.min(1, (speed - FALL.hard) / (FALL.safe - FALL.hard));
  return 1 - 0.5 * t;
}

/**
 * Host-Prüfung einer gemeldeten Landung eines Clients: `null` = verwerfen, sonst Schaden (> 0).
 * `sinceLast` = Sekunden seit der letzten akzeptierten Meldung dieses Spielers (Infinity beim ersten Mal).
 */
export function acceptFallReport(speed: unknown, sinceLast: number): number | null {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return null;
  if (sinceLast < FALL.minGap) return null;
  const dmg = fallDamage(speed);
  return dmg > 0 ? dmg : null;
}
