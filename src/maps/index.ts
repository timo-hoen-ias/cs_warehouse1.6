import type { MapData } from '../logic/mapkit';
import { buildGueterbahnhof } from './de_gueterbahnhof';
import { buildLagerstaub } from './de_lagerstaub';

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
    id: 'de_gueterbahnhof',
    name: 'Güterbahnhof',
    description: 'Bahn-Logistikzentrum nach dem Vorbild de_train: Gleisfeld A unter der Kranbahn, Efeu, Z-Verbindung, Serverinsel B zwischen den Gleisen.',
    build: buildGueterbahnhof,
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
