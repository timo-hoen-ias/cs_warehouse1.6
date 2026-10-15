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
  /**
   * Größte vom Host bei fremden Clients verrechnete Geschwindigkeit: knapp unter `fatal`, damit eine
   * (gefälschte) Meldung allein nie tötet (≈ 87 Schaden).
   */
  maxAccept: 24,
  /** Zeitfenster der Posen-Historie, in dem der Host den Fall sehen muss (s). */
  window: 2.5,
  /** Toleranz der beobachteten Fallhöhe (m): Posen kommen mit 20 Hz, die Landung kann zwischen zwei Posen liegen. */
  slackHeight: 1.0,
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

/** Höhen-Stichprobe einer Pose (Spielzeit s, Fuß-Höhe m) für die Sturzprüfung des Hosts. */
export type HeightSample = { t: number; y: number };

/**
 * Aus den empfangenen Posen beobachtete Aufprallgeschwindigkeit (m/s): größter Höhenverlust
 * (Hochpunkt → späterer Tiefpunkt) im Fenster vor `now`, plus Toleranz. 0 = kein Fall sichtbar.
 */
export function observedFallSpeed(samples: readonly HeightSample[], now: number, gravity = 20, window: number = FALL.window): number {
  let top = -Infinity;
  let drop = 0;
  for (const s of samples) {
    if (now - s.t > window || !Number.isFinite(s.y)) continue;
    if (s.y > top) top = s.y;
    else drop = Math.max(drop, top - s.y);
  }
  return drop > 0 ? Math.sqrt(2 * gravity * (drop + FALL.slackHeight)) : 0;
}

/**
 * Host-Prüfung einer Sturzmeldung eines fremden Clients: verwirft sie in Aufwärm-/Kaufphase, bei
 * kaputten Werten, zu dichter Folge oder ohne passenden Fall in der Posen-Historie; die verrechnete
 * Geschwindigkeit ist durch Beobachtung und `maxAccept` gedeckelt. `null` = verwerfen, sonst Schaden.
 */
export function hostFallDamage(speed: unknown, sinceLast: number, observed: number, phase: string): number | null {
  if (phase === 'warmup' || phase === 'freeze') return null;
  if (typeof speed !== 'number' || !Number.isFinite(speed) || !(observed > 0)) return null;
  if (sinceLast < FALL.minGap) return null;
  const dmg = fallDamage(Math.min(speed, observed, FALL.maxAccept));
  return dmg > 0 ? dmg : null;
}
