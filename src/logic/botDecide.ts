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

/** CS-Bot-Namen (Lager-Thema). */
export const BOT_NAMES = [
  'Stapler-Steve', 'Kommissionier-Kai', 'Paletten-Paul', 'Inventur-Ines', 'Gabel-Gabi', 'Hochregal-Hans',
  'Wareneingang-Willi', 'Versand-Vera', 'Scanner-Sven', 'Container-Conny', 'Rampen-Rudi', 'Lagerleiter-Lena',
  'Picker-Pia', 'Etiketten-Emil', 'Folien-Fritz', 'Gitterbox-Gerd', 'Zoll-Zoe', 'Schicht-Sascha',
];
