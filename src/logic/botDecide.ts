/**
 * Bot-Grundwerte (pure): Reaktionszeit und Zielfehler nach Skill, Bot-Namen. Das taktische
 * Verhalten (Strategie, Aufträge, Kampf, Bewegung) steckt in botSystem/botCoach/botBrain/botBody.
 */
export const BOT = {
  /** Reaktionszeit nach Sichtkontakt (s), skaliert mit (1 - skill). */
  reactionMin: 0.15,
  reactionMax: 0.7,
  /** Zielfehler (rad) bei Erstsicht bzw. nach längerem Zielen. */
  aimErrorStart: 0.07,
  aimErrorSettled: 0.012,
  aimSettleTime: 1.6,
  /** Überraschung: Gegner außerhalb von ±30° des Blicks → Reaktion × Faktor. */
  surprise: 1.35,
  /**
   * Vorzielen (Fadenkreuz-Platzierung wie in CS): wer still steht (≥ preaimStill s) und schon dorthin schaut,
   * wo der Gegner auftaucht (±preaimCone rad), reagiert schneller und hat das Ziel schon halb „eingeschwungen“.
   * Das ist der Vorteil des Halters gegenüber dem, der um die Ecke kommt (gilt für beide Teams).
   */
  preaimStill: 0.3,
  preaimCone: (7 * Math.PI) / 180,
  preaimReaction: 0.5,
  preaimSettled: 0.8,
} as const;

/** Zielfehler (rad): sinkt mit Zielzeit, steigt mit (1 - skill). */
export function aimError(sightTime: number, skill: number): number {
  const t = Math.min(1, Math.max(0, sightTime / BOT.aimSettleTime));
  const base = BOT.aimErrorStart + (BOT.aimErrorSettled - BOT.aimErrorStart) * t;
  return base * (1.4 - 0.9 * Math.min(1, Math.max(0, skill)));
}

/** Reaktionszeit nach Sichtkontakt. */
export function reactionTime(skill: number, rnd: () => number): number {
  const k = Math.min(1, Math.max(0, skill));
  return BOT.reactionMin + (BOT.reactionMax - BOT.reactionMin) * (1 - k) * (0.5 + rnd() * 0.5);
}

/**
 * Erstsicht eines Gegners: Reaktionszeit und Start-Zielzeit (für den Zielfehler).
 * `offAngle` = Winkel (rad) zwischen Blickrichtung und Gegner, `stillFor` = Sekunden ohne Bewegung.
 */
export function firstSight(skill: number, rnd: () => number, offAngle: number, stillFor: number): { reaction: number; sightTime: number } {
  const reaction = reactionTime(skill, rnd) * (offAngle <= Math.PI / 6 ? 1 : BOT.surprise);
  if (stillFor >= BOT.preaimStill && offAngle <= BOT.preaimCone) return { reaction: reaction * BOT.preaimReaction, sightTime: BOT.preaimSettled };
  return { reaction, sightTime: 0 };
}

/** CS-Bot-Namen (Lager-Thema). */
export const BOT_NAMES = [
  'Stapler-Steve', 'Kommissionier-Kai', 'Paletten-Paul', 'Inventur-Ines', 'Gabel-Gabi', 'Hochregal-Hans',
  'Wareneingang-Willi', 'Versand-Vera', 'Scanner-Sven', 'Container-Conny', 'Rampen-Rudi', 'Lagerleiter-Lena',
  'Picker-Pia', 'Etiketten-Emil', 'Folien-Fritz', 'Gitterbox-Gerd', 'Zoll-Zoe', 'Schicht-Sascha',
];
