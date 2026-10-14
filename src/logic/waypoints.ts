import type { LagerDaten } from '../shared/types';
import type { Vec3 } from '../shared/level';
import { layoutRacks, rackBounds } from './layout';
import { computeSolids, innerBounds, type SolidBox } from './level';
import { PLAYER, pointFree } from './move';

/**
 * Generiert Wegpunkte für Bots aus der Regal-Struktur: Raster über die freie
 * Innenfläche, verbunden zu einem einfachen Graphen (4er-Nachbarschaft).
 * Wird in src/logic berechnet (framework-frei, testbar) und beim Spielstart
 * einmalig erzeugt. Bewusst simple: kein A*, Gang-Folgen reichen für Bots in M2.
 */
export type Waypoint = {
  id: number;
  pos: Vec3;
  neighbors: number[];
};

export type WaypointGraph = {
  points: Waypoint[];
  /** Begehbare Bounds (für Debug/Clamp). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
};

const GRID = 2; // Rasterabstand in Metern — klein genug für Gänge

/** Erzeugt Wegpunkt-Raster aus freien Punkten. */
export function buildWaypoints(lager: LagerDaten, clearance: number = PLAYER.radius + 0.2, extraSolids: SolidBox[] = []): WaypointGraph {
  const racks = layoutRacks(lager.lagerorte);
  const bounds = rackBounds(racks);
  const solids = [...computeSolids(lager), ...extraSolids];
  // Regale + Requisiten blockieren Bots (Wände sind Grenzen des Innenraums)
  const rackSolids = solids.filter((s) => s.kind !== 'wall');
  if (!bounds) return { points: [], bounds: null };

  const inner = innerBounds(bounds);
  const margin = clearance;
  const points: Waypoint[] = [];
  let id = 0;

  for (let x = inner.minX + margin; x <= inner.maxX - margin; x += GRID) {
    for (let z = inner.minZ + margin; z <= inner.maxZ - margin; z += GRID) {
      if (!pointFree(x, z, rackSolids, clearance)) continue;
      points.push({ id: id++, pos: [x, 0, z], neighbors: [] });
    }
  }

  // Nachbarschaft: verbinde jeden Punkt mit den bis zu 4 Punkten im GRID-Abstand.
  // Effizient über Map von gerundeten Koordinaten.
  const byKey = new Map<string, number>();
  for (const p of points) byKey.set(gridKey(p.pos[0], p.pos[2]), p.id);

  for (const p of points) {
    const dirs: [number, number][] = [
      [GRID, 0],
      [-GRID, 0],
      [0, GRID],
      [0, -GRID],
    ];
    for (const [dx, dz] of dirs) {
      const n = byKey.get(gridKey(p.pos[0] + dx, p.pos[2] + dz));
      if (n !== undefined && n !== p.id) p.neighbors.push(n);
    }
  }
  return { points, bounds };
}

function gridKey(x: number, z: number): string {
  return `${Math.round(x * 10) / 10},${Math.round(z * 10) / 10}`;
}

/**
 * BFS im Wegpunkt-Graph: kürzester Pfad (Anzahl Kanten) von Start nach Ziel.
 * Rückgabe: Folge von Punkt-Indizes inkl. Start; leeres Array wenn nicht erreichbar.
 */
export function bfsPath(g: WaypointGraph, fromId: number, toId: number): number[] {
  if (!g.points.length) return [];
  if (fromId === toId) return [fromId];
  const prev = new Map<number, number | null>();
  const visited = new Set<number>([fromId]);
  const queue = [fromId];
  prev.set(fromId, null);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of g.points[cur]?.neighbors ?? []) {
      if (visited.has(n)) continue;
      visited.add(n);
      prev.set(n, cur);
      if (n === toId) {
        const path: number[] = [];
        let step: number | null = n;
        while (step !== null) {
          path.unshift(step);
          step = prev.get(step) ?? null;
        }
        return path;
      }
      queue.push(n);
    }
  }
  return [];
}

/** Findet den Wegpunkt, der einer Position am nächsten liegt. */
export function nearestWaypoint(g: WaypointGraph, x: number, z: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (const p of g.points) {
    const d = Math.hypot(p.pos[0] - x, p.pos[2] - z);
    if (d < bestDist) {
      bestDist = d;
      best = p.id;
    }
  }
  return best;
}
