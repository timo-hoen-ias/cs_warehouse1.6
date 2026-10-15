import { describe, expect, it } from 'vitest';
import { loadMapData } from './index';
import { compileMap } from '../logic/mapcompile';
import { astar, nearestNode, routeLength } from '../logic/nav';
import { MAX_WALK_SLOPE, rampSlope } from '../logic/collision';
import { brushItem } from '../logic/mapcompile';

/**
 * Kartenspezifische Topologie von de_kuehlhaus (de_nuke als Kühlhaus): B liegt direkt UNTER A,
 * Rampenraum / Lüftung / Geheimgang / Kellertreppe / Dachweg verbinden die Ebenen.
 */
const data = loadMapData('de_kuehlhaus');
const map = compileMap(data);
const g = map.nav;

type P = { x: number; y: number; z: number };
const node = (p: P): number => nearestNode(g, p.x, p.y, p.z, 2);
const areasOn = (a: P, b: P): string[] => {
  const path = astar(g, node(a), node(b));
  expect(path.length, 'Weg existiert').toBeGreaterThan(0);
  return [...new Set(path.map((n) => (g.area[n]! >= 0 ? g.areas[g.area[n]!]!.name : '-')))];
};
const area = (name: string) => g.areas.find((a) => a.name === name)!;

describe('de_kuehlhaus: Nuke-Topologie', () => {
  it('Spot B liegt direkt unter Spot A (gleicher Grundriss, 5 m tiefer)', () => {
    const a = data.sites.find((s) => s.id === 'A')!;
    const b = data.sites.find((s) => s.id === 'B')!;
    expect(b.min[0]).toBe(a.min[0]);
    expect(b.max[2]).toBe(a.max[2]);
    expect(a.plant[0]).toBe(b.plant[0]);
    expect(a.plant[2]).toBe(b.plant[2]);
    expect(a.plant[1] - b.plant[1]).toBeCloseTo(5, 5);
    expect(b.max[1]).toBeLessThan(a.min[1]);
  });

  it('alle Nuke-Callouts sind vorhanden und begehbar', () => {
    for (const n of ['T-Spawn', 'Außenbereich', 'Silos', 'Garage', 'Haupteingang', 'Lobby', 'Mitte', 'Hütte', 'Quietschtür', 'Halle A', 'Himmel', 'Hölle',
      'Rampenraum', 'Rampe', 'Lüftung', 'Spot A', 'Spot B', 'Geheimgang', 'Kontrollraum', 'CT-Spawn', 'Mini', 'Westdach', 'Garagendach']) {
      expect(area(n), n).toBeDefined();
      expect(area(n).nodeCount, n).toBeGreaterThan(0);
    }
  });

  it('Himmel liegt über der Hölle, beide in Halle A', () => {
    const h = area('Himmel');
    const hell = area('Hölle');
    expect(h.center.y).toBeGreaterThanOrEqual(4.4);
    expect(hell.center.y).toBeLessThan(0.5);
    expect(Math.abs(h.center.x - hell.center.x)).toBeLessThan(8);
  });

  it('Lüftung verbindet A und B: Weg zwischen den Spots führt über den Schacht (< 70 m)', () => {
    const route = areasOn(map.zones.a, map.zones.b);
    expect(route).toContain('Lüftung');
    expect(routeLength(g, map.zones.a, map.zones.b)).toBeLessThan(70);
  });

  it('Rampenraum führt von der Lobby in den Keller; Rampe ist begehbar steil (≤ 30°)', () => {
    const lobby = area('Lobby').center;
    const ramp = data.brushes.filter((b) => b.ramp && b.min[1] === -5 && b.max[1] === 0 && b.min[0] === -28);
    expect(ramp).toHaveLength(1);
    const it = brushItem(ramp[0]!, 0)!;
    expect((Math.atan(rampSlope(it)) * 180) / Math.PI).toBeLessThanOrEqual(30);
    expect(rampSlope(it)).toBeLessThan(MAX_WALK_SLOPE);
    const route = areasOn(lobby, { x: -12, y: -5, z: -17 });
    expect(route).toContain('Rampenraum');
    expect(route).toContain('Rampe');
  });

  it('Geheimgang: Hof → Tunnel → Keller, ohne die Halle zu berühren', () => {
    const route = areasOn({ x: 53, y: 0, z: 52 }, map.zones.b);
    expect(route).toContain('Geheimgang-Rampe');
    expect(route).toContain('Geheimgang');
    expect(route).not.toContain('Halle A');
    expect(route).not.toContain('Lobby');
  });

  it('Kellertreppe: CT kommt aus dem Kontrollraum direkt nach B (ohne Halle A)', () => {
    const route = areasOn(map.zones.ct, map.zones.b);
    expect(route).toContain('Kontrollraum');
    expect(route).toContain('Kellertreppe');
    expect(route).not.toContain('Halle A');
  });

  it('Dachweg: Garagendach → Westdach → Himmel ist zu Fuß verbunden (+4.5 m)', () => {
    const route = areasOn(area('Garagendach').center, area('Himmel').center);
    expect(route).toContain('Westdach');
    expect(route).not.toContain('Halle A');
    expect(area('Himmel').center.y).toBeGreaterThanOrEqual(4.4);
  });

  it('Hütte (Quietschtür) ist der kürzeste Weg der T nach A, nicht der Dachweg', () => {
    const route = areasOn(map.zones.t, map.zones.a);
    expect(route).toContain('Quietschtür');
    expect(route).toContain('Hütte');
    expect(route).not.toContain('Westdach');
  });
});
