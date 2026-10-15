import type { AcousticZone, AmbientEmitter, Surface } from './acoustics';
import { COL, Collider, type ColItem } from './collision';
import type { Team } from './economy';
import { MATERIALS, type Brush, type BuyZone, type MapData, type Site, type Spawn } from './mapkit';
import { buildNav, type NavGraph } from './nav';

/**
 * Karten-Compiler (pure, deterministisch): MapData → Kollisionswelt (Quader + Rampen
 * im Raster), Navigationsgraph, Spots/Spawns/Kaufzonen, Akustik. Alle Clients
 * rechnen aus demselben Code dasselbe Ergebnis — kein Bake-Schritt nötig.
 */
export type P3 = { x: number; y: number; z: number };

export type CompiledMap = {
  data: MapData;
  collider: Collider;
  nav: NavGraph;
  sites: Site[];
  spawns: Record<Team, Spawn[]>;
  buyZones: BuyZone[];
  /** Mittelpunkte (Altformat für Bots/HUD): Spots = Pflanzpunkte, Spawns = Schwerpunkt. */
  zones: { a: P3; b: P3; t: P3; ct: P3 };
  acoustics: { zones: AcousticZone[]; emitters: AmbientEmitter[] };
};

/** Gruppen, deren Oberseite nie Navigationsboden ist. */
const NO_NAV_TAGS = new Set(['wall', 'building', 'roof', 'door', 'pillar', 'rail', 'fence']);

const MASK: Record<string, number> = { all: COL.all, move: COL.move, shot: COL.shot, none: 0 };

/** Kollisions-Element eines Brushes (null = keine Kollision). */
export function brushItem(b: Brush, id: number): ColItem | null {
  const mask = MASK[b.collide ?? 'all'] ?? COL.all;
  if (!mask) return null;
  return {
    minX: b.min[0], minY: b.min[1], minZ: b.min[2], maxX: b.max[0], maxY: b.max[1], maxZ: b.max[2],
    mask, ramp: b.ramp, surface: brushSurface(b), id, noNav: b.noNav || NO_NAV_TAGS.has(b.tag ?? ''),
  };
}

/** Schrittklang eines Brushes (explizit, sonst aus Ober- bzw. Grundmaterial). */
export function brushSurface(b: Brush): Surface {
  return b.surface ?? MATERIALS[b.top ?? b.mat].surface;
}

export function colliderFromMap(data: MapData): Collider {
  const items: ColItem[] = [];
  data.brushes.forEach((b, i) => {
    const it = brushItem(b, i);
    if (it) items.push(it);
  });
  return new Collider(items, { floorY: data.bounds.min[1] - 2, cell: 4 });
}

const inBox = (p: P3, min: readonly number[], max: readonly number[]): boolean =>
  p.x >= min[0]! && p.x <= max[0]! && p.y >= min[1]! && p.y <= max[1]! && p.z >= min[2]! && p.z <= max[2]!;

export function compileMap(data: MapData): CompiledMap {
  const collider = colliderFromMap(data);
  const nav = buildNav(collider, data.areas);
  const spawns: Record<Team, Spawn[]> = { T: data.spawns.filter((s) => s.team === 'T'), CT: data.spawns.filter((s) => s.team === 'CT') };
  const centroid = (list: Spawn[]): P3 => {
    const n = Math.max(1, list.length);
    return { x: list.reduce((s, p) => s + p.pos[0], 0) / n, y: list.reduce((s, p) => s + p.pos[1], 0) / n, z: list.reduce((s, p) => s + p.pos[2], 0) / n };
  };
  const plant = (id: 'A' | 'B'): P3 => {
    const s = data.sites.find((q) => q.id === id);
    return s ? { x: s.plant[0], y: s.plant[1], z: s.plant[2] } : { x: 0, y: 0, z: 0 };
  };
  return {
    data,
    collider,
    nav,
    sites: data.sites,
    spawns,
    buyZones: data.buyZones,
    zones: { a: plant('A'), b: plant('B'), t: centroid(spawns.T), ct: centroid(spawns.CT) },
    acoustics: data.acoustics,
  };
}

/** Bombenspot an einer Position (Fußpunkt) oder null. */
export function siteAt(sites: readonly Site[], p: P3): 'a' | 'b' | null {
  for (const s of sites) if (inBox({ x: p.x, y: p.y + 0.5, z: p.z }, s.min, s.max)) return s.id === 'A' ? 'a' : 'b';
  return null;
}

/** Steht der Spieler (Fußpunkt) in einer Kaufzone seines Teams? */
export function inBuyZoneBox(zones: readonly BuyZone[], team: Team, p: P3): boolean {
  return zones.some((z) => z.team === team && inBox({ x: p.x, y: p.y + 0.5, z: p.z }, z.min, z.max));
}
