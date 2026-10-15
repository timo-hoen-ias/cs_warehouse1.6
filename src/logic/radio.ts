/**
 * Funkbefehle wie in CS 1.6 (Z/X/C öffnen je ein Menü, Ziffer wählt). Reine Daten +
 * Auswahlhilfe; der Driver schickt den Text als Team-Funkspruch.
 */
export type RadioMenu = { key: 'KeyZ' | 'KeyX' | 'KeyC'; title: string; items: string[] };

export const RADIO_MENUS: RadioMenu[] = [
  {
    key: 'KeyZ',
    title: 'Funk: Befehle',
    items: ['Deckung!', 'Nimm den Punkt ein!', 'Formation halten!', 'Regroup, Team!', 'Folgt mir!', 'Ich brauche Unterstützung!'],
  },
  {
    key: 'KeyX',
    title: 'Funk: Gruppe',
    items: ['Los, los, los!', 'Team, zurückfallen!', 'Zusammenbleiben!', 'Stellung halten!', 'Vorrücken und angreifen!', 'Bericht erstatten!'],
  },
  {
    key: 'KeyC',
    title: 'Funk: Meldungen',
    items: ['Verstanden!', 'Gegner gesichtet!', 'Brauche Verstärkung!', 'Gebiet gesichert.', 'Ich bin in Position.', 'Bericht: alles ruhig.', 'Bombe gesichtet!', 'Negativ.', 'Gegner ausgeschaltet.'],
  },
];

/** Menü zu einer Taste (oder null). */
export function radioMenuFor(code: string): RadioMenu | null {
  return RADIO_MENUS.find((m) => m.key === code) ?? null;
}

/** Text für Ziffer 1..9 im Menü (oder null bei ungültiger Wahl). */
export function radioPick(menu: RadioMenu, digit: number): string | null {
  return Number.isInteger(digit) && digit >= 1 && digit <= menu.items.length ? menu.items[digit - 1]! : null;
}

/**
 * Funksprüche der Bots: möglichst dieselben Texte wie im Funkmenü (Spieler erkennen
 * sie wieder); „Bombe gelegt“ und „Ich entschärfe“ sind Bot-Meldungen ohne Menüeintrag.
 */
export const BOT_RADIO = {
  enemySpotted: 'Gegner gesichtet!',
  needBackup: 'Brauche Verstärkung!',
  bombSpotted: 'Bombe gesichtet!',
  bombPlanted: 'Bombe gelegt!',
  go: 'Los, los, los!',
  inPosition: 'Ich bin in Position.',
  enemyDown: 'Gegner ausgeschaltet.',
  regroup: 'Regroup, Team!',
  cover: 'Deckung!',
  fallBack: 'Team, zurückfallen!',
  holdPosition: 'Stellung halten!',
  sectorClear: 'Gebiet gesichert.',
  followMe: 'Folgt mir!',
  defusing: 'Ich entschärfe — gebt mir Deckung!',
} as const;

export type BotRadioKey = keyof typeof BOT_RADIO;

/** Mindestabstand (s) zwischen zwei Bot-Funksprüchen derselben Art im selben Team. */
export const BOT_RADIO_COOLDOWN: Record<BotRadioKey, number> = {
  enemySpotted: 10, needBackup: 20, bombSpotted: 20, bombPlanted: 60, go: 20, inPosition: 25, enemyDown: 8,
  regroup: 20, cover: 15, fallBack: 20, holdPosition: 25, sectorClear: 25, followMe: 25, defusing: 20,
};

/**
 * Darf ein Team jetzt funken? Höchstens ein Spruch je `gap` Sekunden im Team und
 * dieselbe Art erst nach ihrer Abklingzeit — Bots sollen informieren, nicht spammen.
 * Trägt den Spruch bei Erfolg ein.
 */
export function radioAllowed(log: Map<string, number>, key: BotRadioKey, now: number, gap = 4): boolean {
  const last = log.get('*') ?? -Infinity;
  const lastKey = log.get(key) ?? -Infinity;
  if (now - last < gap || now - lastKey < BOT_RADIO_COOLDOWN[key]) return false;
  log.set('*', now);
  log.set(key, now);
  return true;
}
