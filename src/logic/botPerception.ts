import { segmentHitsSmoke, type Smoke } from './grenade';
import type { Collider } from './collision';
import type { XYZ } from './nav';
import { STEP } from './audioMix';

/**
 * Wahrnehmung der Bots (pure): Sichtkegel + Sichtlinie (Wände, Rauch) auf Kopf/Brust,
 * Hören von Schritten (abhängig vom Tempo: Schleichen/Ducken lautlos wie im Spiel-Audio),
 * Schüssen (Schalldämpfer leiser) und Explosionen. Der Bot-Takt prüft die Sicht
 * gestaffelt (nicht jeden Frame jeden Gegner).
 */
export const SENSE = {
  /** Sichtkegel (rad, gesamt) — Rand des Blickfelds. */
  fov: (125 * Math.PI) / 180,
  /** Sichtweite (m). */
  sight: 90,
  /** In diesem Abstand bemerkt man Gegner auch außerhalb des Blickfelds. */
  aware: 3,
  /** Hörweite der Schritte (m) beim Sprint bzw. normalem Gehen. */
  stepsRun: 24,
  stepsWalk: 11,
  /** Hörweite von Schüssen (m), gedämpft. */
  shot: 95,
  shotSuppressed: 20,
  /** Hörweite von Explosionen/Granaten (m). */
  boom: 110,
  /** Prüfintervall der Sicht je Bot (s). */
  interval: 0.1,
  /** Augenhöhe stehend/geduckt über dem Fußpunkt. */
  eye: 1.6,
  crouchEye: 1.1,
} as const;

/** Waffen mit Schalldämpfer (CS: USP, M4A1 mit Aufsatz, TMP). */
const SUPPRESSED = new Set(['usp', 'tmp']);

/** Liegt `to` im horizontalen Sichtkegel eines Blicks (yaw, Kamera-Konvention)? */
export function inFov(yaw: number, from: XYZ, to: XYZ, fov: number = SENSE.fov): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return true;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return (dx * fx + dz * fz) / l >= Math.cos(fov / 2);
}

/** Zielpunkte an einem Spieler (Kopf, Brust) je nach Haltung. */
export function bodyPoints(feet: XYZ, crouch: boolean): XYZ[] {
  return crouch
    ? [{ x: feet.x, y: feet.y + 1.12, z: feet.z }, { x: feet.x, y: feet.y + 0.75, z: feet.z }]
    : [{ x: feet.x, y: feet.y + 1.52, z: feet.z }, { x: feet.x, y: feet.y + 1.05, z: feet.z }];
}

/**
 * Sieht ein Bot (Augenpunkt, Blick) einen Spieler? Sichtweite, Blickfeld (außer
 * ganz nah), Sichtlinie zu Kopf oder Brust, Rauch blockiert.
 */
export function canSeePlayer(col: Collider, smokes: readonly Smoke[], eye: XYZ, yaw: number, feet: XYZ, crouch: boolean, range: number = SENSE.sight): boolean {
  const d = Math.hypot(feet.x - eye.x, feet.z - eye.z);
  if (d > range) return false;
  if (d > SENSE.aware && !inFov(yaw, eye, feet)) return false;
  for (const p of bodyPoints(feet, crouch)) {
    if (col.clear(eye, p) && !segmentHitsSmoke(eye, p, smokes as Smoke[])) return true;
  }
  return false;
}

/** Hörweite der Schritte eines Spielers (0 = lautlos: Ducken oder Schleichen < STEP.minSpeed). */
export function footstepRange(speed: number, crouch: boolean): number {
  if (crouch || speed < STEP.minSpeed) return 0;
  const t = Math.min(1, Math.max(0, (speed - 4.2) / (STEP.sprintSpeed - 4.2)));
  return SENSE.stepsWalk + (SENSE.stepsRun - SENSE.stepsWalk) * t;
}

/** Hörweite eines Schusses. */
export function shotRange(weapon: string): number {
  if (weapon === 'knife' || weapon === 'knife_stab') return 6;
  return SUPPRESSED.has(weapon) ? SENSE.shotSuppressed : SENSE.shot;
}

/**
 * Gehörte Position mit Unschärfe: je weiter weg, desto ungenauer (Richtung stimmt,
 * Entfernung ± 15 %) — Bots wissen ungefähr, *wo* etwas war.
 */
export function heardPosition(listener: XYZ, source: XYZ, rnd: () => number): XYZ {
  const d = Math.hypot(source.x - listener.x, source.z - listener.z);
  const blur = Math.min(4, d * 0.08);
  return { x: source.x + (rnd() - 0.5) * 2 * blur, y: source.y, z: source.z + (rnd() - 0.5) * 2 * blur };
}
