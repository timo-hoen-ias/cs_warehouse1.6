import { describe, expect, it } from 'vitest';
import type { LagerDaten } from '../shared/types';
import { computeSolids, freeSpots, nearestSolidXz, suggestZones } from './level';

// Kleines Testlager: ein Hochregal (1 Gang, 2 Ebenen, 3 Fächer) → 6 Zellen + catch-all.
function makeLager(): LagerDaten {
  return {
    mandant: 1,
    lagerorte: [
      {
        lagerkennung: 'TST1',
        bezeichnung: 'Testlager',
        lagertechnik: 'LTD3HR',
        dims: { d1: 1, d2: 2, d3: 3 },
        plaetze: [
          { platzId: 1, dim: { d1: 0, d2: 0, d3: 0 }, ebene: 0, kurz: 'All', platzbezeichnung: 'gesamt', masse: { hoehe: 0, breite: 0, laenge: 0 }, maxGewicht: 0, bestaende: [] },
          { platzId: 2, dim: { d1: 1, d2: 1, d3: 1 }, ebene: 0, kurz: 'P1', platzbezeichnung: 'Platz 1', masse: { hoehe: 60, breite: 110, laenge: 160 }, maxGewicht: 500, bestaende: [] },
          { platzId: 3, dim: { d1: 1, d2: 1, d3: 2 }, ebene: 0, kurz: 'P2', platzbezeichnung: 'Platz 2', masse: { hoehe: 60, breite: 110, laenge: 160 }, maxGewicht: 500, bestaende: [] },
          { platzId: 4, dim: { d1: 1, d2: 2, d3: 3 }, ebene: 1, kurz: 'P3', platzbezeichnung: 'Platz 3', masse: { hoehe: 60, breite: 110, laenge: 160 }, maxGewicht: 500, bestaende: [] },
        ],
      },
    ],
  };
}

describe('computeSolids', () => {
  it('liefert mindestens ein Regal und vier Wände', () => {
    const solids = computeSolids(makeLager());
    const racks = solids.filter((s) => s.kind === 'rack');
    const walls = solids.filter((s) => s.kind === 'wall');
    expect(racks.length).toBeGreaterThan(0);
    expect(walls.length).toBe(4);
  });

  it('Regal-Box steht auf dem Boden (minY 0)', () => {
    const rack = computeSolids(makeLager()).find((s) => s.kind === 'rack')!;
    expect(rack.minY).toBe(0);
    expect(rack.maxY).toBeGreaterThan(1);
  });

  it('Wände umschließen die Regale', () => {
    const solids = computeSolids(makeLager());
    const racks = solids.filter((s) => s.kind === 'rack');
    const rackMinX = Math.min(...racks.map((r) => r.minX));
    const rackMaxX = Math.max(...racks.map((r) => r.maxX));
    const wallsWest = solids.find((s) => s.kind === 'wall' && s.label === 'wand-west')!;
    const wallsOst = solids.find((s) => s.kind === 'wall' && s.label === 'wand-ost')!;
    expect(wallsWest.maxX).toBeLessThan(rackMinX);
    expect(wallsOst.minX).toBeGreaterThan(rackMaxX);
  });
});

describe('freeSpots', () => {
  it('findet freie Punkte außerhalb der Regale', () => {
    const spots = freeSpots(makeLager());
    expect(spots.length).toBeGreaterThan(0);
    const solids = computeSolids(makeLager());
    for (const [x, , z] of spots) {
      const blocked = solids.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
      expect(blocked).toBe(false);
    }
  });
});

describe('suggestZones', () => {
  it('liefert vier verschiedene, freie Punkte', () => {
    const z = suggestZones(makeLager());
    const pts = [z.t, z.ct, z.a, z.b];
    const solids = computeSolids(makeLager());
    for (const p of pts) {
      const blocked = solids.some((b) => p[0] > b.minX && p[0] < b.maxX && p[2] > b.minZ && p[2] < b.maxZ);
      expect(blocked).toBe(false);
    }
    // mindestens drei räumlich getrennt
    const unique = new Set(pts.map((p) => `${p[0]},${p[2]}`));
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
});

describe('nearestSolidXz', () => {
  const solids = computeSolids(makeLager());
  const rack = solids.find((s) => s.kind === 'rack')!;

  it('Distanz 0 innerhalb eines Regals', () => {
    const x = (rack.minX + rack.maxX) / 2;
    const z = (rack.minZ + rack.maxZ) / 2;
    expect(nearestSolidXz(x, z, solids)).toBe(0);
  });

  it('misst den Abstand zur nächsten Box', () => {
    // Punkt links (westlich) des Regals im Abstand d
    const d = 0.35;
    const z = (rack.minZ + rack.maxZ) / 2;
    expect(nearestSolidXz(rack.minX - d, z, solids)).toBeCloseTo(d, 5);
  });

  it('frei weit draußen → großer Wert', () => {
    const far = nearestSolidXz(9999, 9999, solids);
    expect(far).toBeGreaterThan(10);
  });
});
