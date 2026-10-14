/**
 * Karten-Registry: jede Karte ist ein Lager (Demo-Profil oder echte DB-Kennung),
 * gebacken nach levels/<id>.json. Alle Karten sind Lager-Themen (de_-Modus).
 */
export type LayoutProfile = 'mix' | 'hochregal' | 'block' | 'kommission' | 'rampe';

export type MapDef = {
  id: string;
  name: string;
  description: string;
  /** Demo-Generator: Anzahl Lagerorte, Seed, Layout-Profil. */
  orte: number;
  seed: number;
  layout: LayoutProfile;
  /** Anzahl Requisiten (Deckung). */
  props: number;
};

export const MAPS: MapDef[] = [
  {
    id: 'de_kommission',
    name: 'Kommissionierhalle',
    description: 'Gemischtes Lager: Hochregale, Flächenlager und Blockplätze. Der Klassiker.',
    orte: 16, seed: 1, layout: 'mix', props: 18,
  },
  {
    id: 'de_hochregal',
    name: 'Hochregallager',
    description: 'Lange, enge Regalgassen — Sniper-Linien und schnelle Flanken.',
    orte: 14, seed: 3, layout: 'hochregal', props: 12,
  },
  {
    id: 'de_blocklager',
    name: 'Blocklager',
    description: 'Offene Flächen mit Palettenstapeln und Containern als Deckung.',
    orte: 12, seed: 5, layout: 'block', props: 30,
  },
  {
    id: 'de_rampe',
    name: 'Verladerampe',
    description: 'Kompakte Halle: kurze Wege, viele Kisten — Nahkampf.',
    orte: 8, seed: 9, layout: 'rampe', props: 22,
  },
];

export const DEFAULT_MAP = MAPS[0]!.id;

export function mapById(id: string | null | undefined): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]!;
}
