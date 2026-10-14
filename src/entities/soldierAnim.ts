/** Pure Animations-Mathematik des Soldaten (kein three-Import, testbar). */

export type V3 = { x: number; y: number; z: number };

/** Segmentlängen des Beins (m): Hüfte → Knie → Knöchel (+ Stiefelhöhe bis zum Boden). */
export const LEG = { hipY: 0.85, thigh: 0.4, shin: 0.35, ankle: 0.1 } as const;
/** Maximale Absenkung der Hüfte beim Ducken (passt zur Hitbox-Skalierung 0.75). */
export const CROUCH_DROP = 0.42;
/** Dauer des Umfallens in Sekunden. */
export const FALL_TIME = 0.4;

/**
 * Beinwinkel (rotation.x, Radiant) bei fest am Boden stehendem Fuß und um `drop` abgesenkter Hüfte.
 * thigh: Absolutwinkel des Oberschenkels (negativ = Knie nach vorn, +Z),
 * shin: Winkel des Unterschenkels RELATIV zum Oberschenkel (positiv = Knie angewinkelt).
 */
export function solveLegAngles(drop: number): { thigh: number; shin: number } {
  const l1: number = LEG.thigh;
  const l2: number = LEG.shin;
  const reach = LEG.hipY - LEG.ankle; // Hüfte → Knöchel gestreckt
  const d = Math.min(Math.max(reach - drop, 0.25), l1 + l2 - 1e-4);
  const cosHip = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const hip = Math.acos(Math.min(1, Math.max(-1, cosHip))); // Beugung des Oberschenkels nach vorn
  const sinShin = Math.min(1, (l1 * Math.sin(hip)) / l2); // Fuß liegt senkrecht unter der Hüfte
  const shinAbs = Math.asin(sinShin); // Unterschenkel zeigt nach hinten
  return { thigh: -hip, shin: shinAbs + hip };
}

export type WalkPose = {
  /** Schwingen der Oberschenkel (links; rechts = −). */
  swing: number;
  /** Zusätzliche Kniebeugung links/rechts (>= 0). */
  kneeL: number;
  kneeR: number;
  /** Vertikales Wippen des Oberkörpers (m). */
  bob: number;
  /** Verdrehen des Oberkörpers um Y (rad). */
  twist: number;
  /** Arm-Pendeln (rad, links; rechts = −). */
  armSway: number;
};

/** Gehzyklus aus Phase und Amplitude (0 … 0.6 wie das alte `swing`). */
export function walkPose(phase: number, amp: number): WalkPose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const k = amp / 0.6; // 0..1
  return {
    swing: s * amp,
    // Das Bein hebt den Fuß, solange es nach vorn schwingt (links: Winkel fällt = cos < 0).
    kneeL: Math.max(0, -c) * 0.9 * amp,
    kneeR: Math.max(0, c) * 0.9 * amp,
    bob: Math.abs(s) * 0.025 * k,
    twist: s * 0.07 * k,
    armSway: c * 0.05 * k,
  };
}

/**
 * Zwei-Knochen-IK: Ellbogenposition für Schulter S, Hand H, Segmentlängen l1/l2.
 * `pole` gibt die Richtung vor, in die der Ellbogen ausweicht.
 * Ist das Ziel zu weit weg, wird der Arm gestreckt (Hand bleibt dann kürzer).
 */
export function solveTwoBone(s: V3, h: V3, l1: number, l2: number, pole: V3): V3 {
  const dx = h.x - s.x;
  const dy = h.y - s.y;
  const dz = h.z - s.z;
  const dist = Math.min(Math.hypot(dx, dy, dz), l1 + l2 - 1e-4);
  if (dist < 1e-6) return { x: s.x, y: s.y - l1, z: s.z };
  const n = { x: dx / Math.hypot(dx, dy, dz), y: dy / Math.hypot(dx, dy, dz), z: dz / Math.hypot(dx, dy, dz) };
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // Pol-Vektor senkrecht zur Armachse
  const dot = pole.x * n.x + pole.y * n.y + pole.z * n.z;
  let px = pole.x - n.x * dot;
  let py = pole.y - n.y * dot;
  let pz = pole.z - n.z * dot;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  return { x: s.x + n.x * a + px * hgt, y: s.y + n.y * a + py * hgt, z: s.z + n.z * a + pz * hgt };
}

export type FallPose = { rotX: number; rotZ: number; lift: number; slide: number; t: number };

/**
 * Umfallen: t 0 → 1 über FALL_TIME (ease-in, Aufprall am Ende). `dir` = +1 vorwärts, −1 rückwärts.
 * lift hebt den liegenden Körper über den Boden (Rotation um den Fußpunkt).
 */
export function fallPose(elapsedSec: number, dir: 1 | -1, roll = 0): FallPose {
  const t = Math.min(1, Math.max(0, elapsedSec / FALL_TIME));
  const e = t * t * (1.6 - 0.6 * t); // ease-in, endet bei 1
  return {
    rotX: dir * (Math.PI / 2) * e,
    rotZ: roll * e,
    lift: (dir > 0 ? 0.2 : 0.3) * e,
    slide: -dir * 0.15 * e,
    t,
  };
}
