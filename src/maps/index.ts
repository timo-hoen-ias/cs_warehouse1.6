import type { MapData } from '../logic/mapkit';
import { buildLagerstaub } from './de_lagerstaub';
import { buildKuehlhaus } from './de_kuehlhaus';
import { buildSpeicherstadt } from './de_speicherstadt';

/**
 * Karten-Registry (pure): handgebaute Karten als Module. Die Lobby listet sie, der Host
 * wählt per ID; alle Clients bauen dieselbe Karte deterministisch aus dem Code.
 */
export type MapEntry = { id: string; name: string; description: string; build: () => MapData };

export const MAPS: MapEntry[] = [
  {
    id: 'de_lagerstaub',
    name: 'Lagerstaub',
    description: 'Logistikzentrum im Abendlicht: Lang A durchs Hallentor, Kurz A über den Steg, Tunnel zum Serverraum B.',
    build: buildLagerstaub,
  },
  {
    id: 'de_kuehlhaus',
    name: 'Kühlhaus',
    description: 'Tiefkühl-Logistikzentrum (de_nuke): Silos und Haupteingang, Halle A mit Himmel und Hölle, B direkt darunter im Keller – Rampenraum, Lüftung und Geheimgang verbinden die Ebenen.',
    build: buildKuehlhaus,
  },
  {
    id: 'de_speicherstadt',
    name: 'Speicherstadt',
    description: 'Hafen-Speicherviertel (de_inferno): Banane mit Lieferwagen nach B, Wohnungen und Speicherbrücke zum Balkon über A, Kurz über den Kessel, Lange Halle zur Grube.',
    build: buildSpeicherstadt,
  },
];

export const DEFAULT_MAP = MAPS[0]!.id;

export function mapById(id: string | null | undefined): MapEntry {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]!;
}

const cache = new Map<string, MapData>();
/** Kartendaten (einmal gebaut, danach gecacht). */
export function loadMapData(id: string | null | undefined): MapData {
  const entry = mapById(id);
  let data = cache.get(entry.id);
  if (!data) {
    data = entry.build();
    cache.set(entry.id, data);
  }
  return data;
}
