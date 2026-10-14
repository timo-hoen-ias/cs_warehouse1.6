import type { LagerDaten } from '../shared/types';
import type { Bounds2D, LevelZones, Vec3 } from '../shared/level';
import { layoutRacks, rackBounds, type RackPlacement } from './layout';

/** Solider, achsenparalleler Quader in Weltmetern (für Kollision + Rendering). */
export type SolidBox = {
  kind: 'rack' | 'wall' | 'prop' | 'platform' | 'step' | 'pillar' | 'rail' | 'dock';
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  label: string;
};

export const WALL_MARGIN = 12; // Abstand Außenwand zu den äußersten Regalen: offene Flächen für Spawns, Zwischenebenen, Laderampe
export const WALL_THICK = 0.5;
export const WALL_HEIGHT = 8; // Hallenhöhe bis Unterkante Dach (Platz für Fachwerkbinder, Strahler, Hochregale)

/** Abstand eines Regals zur Wand, eingeplant als Gang (Perimeter-Umlauf). */
export const PERIMETER_WALK = 1.5;

/** Baut aus einem Regal-Placement den soliden Kollisions-Quader (volle Regalhöhe ab Boden). */
export function rackSolid(rack: RackPlacement): SolidBox {
  const x = rack.origin[0];
  const z = rack.origin[2];
  return {
    kind: 'rack',
    minX: x - rack.size.w / 2,
    minY: 0,
    minZ: z - rack.size.d / 2,
    maxX: x + rack.size.w / 2,
    maxY: rack.size.h,
    maxZ: z + rack.size.d / 2,
    label: rack.key,
  };
}

/** Vier Außenwände als solide Quader um die Regal-Bounds (Umlauf-Gang dazwischen). */
export function wallSolids(bounds: Bounds2D, height = WALL_HEIGHT, margin = WALL_MARGIN): SolidBox[] {
  const m = { minX: bounds.minX - margin, maxX: bounds.maxX + margin, minZ: bounds.minZ - margin, maxZ: bounds.maxZ + margin };
  const t = WALL_THICK;
  return [
    { kind: 'wall', minX: m.minX, maxX: m.maxX, minZ: m.minZ, maxZ: m.minZ + t, minY: 0, maxY: height, label: 'wand-nord' },
    { kind: 'wall', minX: m.minX, maxX: m.maxX, minZ: m.maxZ - t, maxZ: m.maxZ, minY: 0, maxY: height, label: 'wand-sued' },
    { kind: 'wall', minX: m.minX, maxX: m.minX + t, minZ: m.minZ, maxZ: m.maxZ, minY: 0, maxY: height, label: 'wand-west' },
    { kind: 'wall', minX: m.maxX - t, maxX: m.maxX, minZ: m.minZ, maxZ: m.maxZ, minY: 0, maxY: height, label: 'wand-ost' },
  ];
}

/** Begehbare Innenfläche (Innenkante der Wände). */
export function innerBounds(bounds: Bounds2D, margin = WALL_MARGIN): Bounds2D {
  return { minX: bounds.minX - margin, maxX: bounds.maxX + margin, minZ: bounds.minZ - margin, maxZ: bounds.maxZ + margin };
}

/** Alle soliden Boxen eines Lagers: Regale (voll) + Außenwände. */
export function computeSolids(lager: LagerDaten): SolidBox[] {
  const racks = layoutRacks(lager.lagerorte);
  const bounds = rackBounds(racks);
  if (!bounds) return [];
  return [...racks.map(rackSolid), ...wallSolids(bounds)];
}

/**
 * Findet freie Bodenpunkte: Raster über die Innenfläche, alle Punkte mit Abstand
 * > clearance zu jeder Regal-Solidbox. Regale selbst sind unpassierbar.
 */
export function freeSpots(lager: LagerDaten, clearance = 1.0, stride = 1.0): Vec3[] {
  const racks = layoutRacks(lager.lagerorte);
  const bounds = rackBounds(racks);
  if (!bounds) return [];
  const inner = innerBounds(bounds);
  const solids = racks.map(rackSolid);
  const out: Vec3[] = [];
  const cx0 = inner.minX + clearance;
  const cx1 = inner.maxX - clearance;
  const cz0 = inner.minZ + clearance;
  const cz1 = inner.maxZ - clearance;
  for (let x = cx0; x <= cx1; x += stride) {
    for (let z = cz0; z <= cz1; z += stride) {
      const free = solids.every((b) => x <= b.minX - clearance || x >= b.maxX + clearance || z <= b.minZ - clearance || z >= b.maxZ + clearance);
      if (free) out.push([Math.round(x * 10) / 10, 0, Math.round(z * 10) / 10]);
    }
  }
  return out;
}

/**
 * Zonen-Vorschlag (CS-Dramaturgie): T-Spawn an der Nordwand, CT-Spawn an der Südwand,
 * Bombenspots A (West) und B (Ost) auf halber Tiefe zwischen den Spawns — beide
 * Teams haben ähnlich lange Wege, die Spots liegen an den Flanken.
 */
export function suggestZones(lager: LagerDaten): LevelZones {
  const spots = freeSpots(lager, 1.2, 1.0);
  const fallback: LevelZones = { t: [0, 0, 0], ct: [0, 0, 0], a: [0, 0, 0], b: [0, 0, 0] };
  if (spots.length === 0) return fallback;
  const minZ = Math.min(...spots.map((p) => p[2]));
  const maxZ = Math.max(...spots.map((p) => p[2]));
  const minX = Math.min(...spots.map((p) => p[0]));
  const maxX = Math.max(...spots.map((p) => p[0]));
  const midZ = (minZ + maxZ) / 2;
  const midX = (minX + maxX) / 2;
  // Spawns: mittig an der jeweiligen Stirnseite
  const t = nearestSpot(spots, midX, minZ);
  const ct = nearestSpot(spots, midX, maxZ);
  // Spots: Flanken, leicht Richtung CT (A) bzw. T (B) versetzt → asymmetrische Wege wie in CS
  const a = nearestSpot(spots, minX + (maxX - minX) * 0.12, midZ + (maxZ - minZ) * 0.15);
  const b = nearestSpot(spots, maxX - (maxX - minX) * 0.12, midZ - (maxZ - minZ) * 0.15);
  return { t, ct, a, b };
}

function nearestSpot(spots: Vec3[], x: number, z: number): Vec3 {
  return spots.reduce((best, p) => (Math.hypot(p[0] - x, p[2] - z) < Math.hypot(best[0] - x, best[2] - z) ? p : best), spots[0]!);
}

/** Kürzeste Distanz (XZ) von (x,z) zu einer Solid-Box (0 = innerhalb). */
export function nearestSolidXz(x: number, z: number, solids: SolidBox[]): number {
  let best = Infinity;
  for (const s of solids) {
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return 0;
    const dx = Math.max(s.minX - x, 0, x - s.maxX);
    const dz = Math.max(s.minZ - z, 0, z - s.maxZ);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}
