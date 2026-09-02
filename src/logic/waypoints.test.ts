import { describe, expect, it } from 'vitest';
import type { LagerDaten } from '../shared/types';
import { bfsPath, buildWaypoints, nearestWaypoint } from './waypoints';

// Zwei Lagerorte nebeneinander → dazwischen freier Gang (Korridor)
const lager: LagerDaten = {
  mandant: 1,
  lagerorte: [
    {
      lagerkennung: 'A1', bezeichnung: 'Lager A', lagertechnik: 'LTD3HR',
      dims: { d1: 1, d2: 2, d3: 3 },
      plaetze: [
        { platzId: 1, dim: { d1: 0, d2: 0, d3: 0 }, ebene: 0, kurz: 'C', platzbezeichnung: 'g', masse: { hoehe: 0, breite: 0, laenge: 0 }, maxGewicht: 0, bestaende: [] },
        { platzId: 2, dim: { d1: 1, d2: 1, d3: 1 }, ebene: 0, kurz: 'P', platzbezeichnung: 'p', masse: { hoehe: 60, breite: 110, laenge: 160 }, maxGewicht: 500, bestaende: [] },
        { platzId: 3, dim: { d1: 1, d2: 2, d3: 3 }, ebene: 0, kurz: 'Q', platzbezeichnung: 'q', masse: { hoehe: 60, breite: 110, laenge: 160 }, maxGewicht: 500, bestaende: [] },
      ],
    },
    {
      lagerkennung: 'B1', bezeichnung: 'Lager B', lagertechnik: 'LTD3HR',
      dims: { d1: 1, d2: 2, d3: 3 },
      plaetze: [
        { platzId: 10, dim: { d1: 0, d2: 0, d3: 0 }, ebene: 0, kurz: 'C', platzbezeichnung: 'g', masse: { hoehe: 0, breite: 0, laenge: 0 }, maxGewicht: 0, bestaende: [] },
        { platzId: 11, dim: { d1: 1, d2: 1, d3: 1 }, ebene: 0, kurz: 'P', platzbezeichnung: 'p', masse: { hoehe: 60, breite: 110, laenge: 160 }, maxGewicht: 500, bestaende: [] },
        { platzId: 12, dim: { d1: 1, d2: 2, d3: 3 }, ebene: 0, kurz: 'Q', platzbezeichnung: 'q', masse: { hoehe: 60, breite: 110, laenge: 160 }, maxGewicht: 500, bestaende: [] },
      ],
    },
  ],
};

describe('buildWaypoints', () => {
  it('erzeugt Wegpunkte außerhalb der Regale', () => {
    const g = buildWaypoints(lager);
    expect(g.points.length).toBeGreaterThan(10);
    // alle Punkte haben 0-4 Nachbarn (keine Duplikate)
    for (const p of g.points) {
      expect(new Set(p.neighbors).size).toBe(p.neighbors.length);
      expect(p.neighbors.every((n) => n >= 0 && n < g.points.length)).toBe(true);
    }
  });
});

describe('bfsPath', () => {
  it('findet Pfad zwischen zwei erreichbaren Punkten', () => {
    const g = buildWaypoints(lager);
    expect(g.points.length).toBeGreaterThanOrEqual(2);
    const a = 0;
    // nehme einen Punkt weit weg
    const last = g.points.length - 1;
    const path = bfsPath(g, a, last);
    expect(path.length).toBeGreaterThan(1);
    expect(path[0]).toBe(a);
    expect(path[path.length - 1]).toBe(last);
    // Konsekutive Punkte sind verbunden
    for (let i = 0; i < path.length - 1; i++) {
      expect(g.points[path[i]]!.neighbors).toContain(path[i + 1]);
    }
  });

  it('Start==Ziel → einzelner Punkt', () => {
    const g = buildWaypoints(lager);
    expect(bfsPath(g, 3, 3)).toEqual([3]);
  });
});

describe('nearestWaypoint', () => {
  it('liefert Index eines existierenden Punktes', () => {
    const g = buildWaypoints(lager);
    const p = g.points[Math.floor(g.points.length / 2)]!;
    const id = nearestWaypoint(g, p.pos[0], p.pos[2]);
    expect(id).toBe(p.id);
  });
});
