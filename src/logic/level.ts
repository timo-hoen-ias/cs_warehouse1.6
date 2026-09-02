import type { LagerDaten } from '../shared/types';
import type { Bounds2D, LevelZones, Vec3 } from '../shared/level';
import { layoutRacks, rackBounds, type RackPlacement } from './layout';

/** Solider, achsenparalleler Quader in Weltmetern (für Kollision + Rendering). */
export type SolidBox = {
  kind: 'rack' | 'wall';
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  label: string;
};

export const WALL_MARGIN = 4; // Abstand Außenwand zu den äußersten Regalen (wie warehouse-map)
export const WALL_THICK = 0.5;
export const WALL_HEIGHT = 6; // Hallenhöhe (über Kopfhöhe)

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

/** Wählt aus freien Punkten die an den vier Seitenflanken liegenden als Zonen-Vorschlag. */
export function suggestZones(lager: LagerDaten): LevelZones {
  const spots = freeSpots(lager);
  const fallback: LevelZones = { t: [0, 0, 0], ct: [0, 0, 0], a: [0, 0, 0], b: [0, 0, 0] };
  if (spots.length === 0) return fallback;

  // Terroristen nahe der Nordwand, CT nahe der Südwand
  const t = pickExtreme(spots, (p) => p[2]); // min z
  const ct = pickExtreme(spots, (p) => -p[2]); // max z

  // Bombenspots: weit auseinanderliegend, möglichst in anderer Raumecke
  const rest = spots.filter((p) => p !== t && p !== ct);
  const a = pickFarthest(rest, [t, ct], (p) => p[0]); // westlich
  const b = pickFarthest(rest, [t, ct], (p) => -p[0]); // östlich
  return { t, ct, a, b };
}

function pickExtreme(spots: Vec3[], key: (p: Vec3) => number): Vec3 {
  return spots.reduce((best, p) => (key(p) < key(best) ? p : best), spots[0]!);
}

function pickFarthest(spots: Vec3[], from: Vec3[], key: (p: Vec3) => number): Vec3 {
  if (spots.length === 0) return from[0] ?? [0, 0, 0];
  return spots.reduce((best, p) => {
    const dist = from.reduce((s, f) => s + dist2(p, f), 0);
    const bestDist = from.reduce((s, f) => s + dist2(best, f), 0);
    // bevorzuge zusätzlich extreme x-Seite, wenn Distanz fast gleich
    const score = dist - bestDist + key(p) * 0.001;
    return score > 0 ? p : best;
  }, spots[0]!);
}

const dist2 = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[2] - a[2]);

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
