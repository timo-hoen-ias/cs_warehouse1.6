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
