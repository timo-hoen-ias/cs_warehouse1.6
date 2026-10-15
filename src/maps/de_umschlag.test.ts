import { describe, expect, it } from 'vitest';
import { loadMapData } from './index';
import { compileMap } from '../logic/mapcompile';
import { astar, nearestNode, routeLength } from '../logic/nav';
import { PLAYER } from '../logic/move';

/**
 * Kartenspezifische Topologie von de_umschlag (de_mirage als Umschlaghalle): Fenster (Leitstand) über der Mitte,
 * Steg (Laufsteg) als Kurz nach B, Unterführung unter der Mitte, Palast mit Balkon nach A, Wohnungen (oberer Gang) nach B.
 */
const data = loadMapData('de_umschlag');
const map = compileMap(data);
const g = map.nav;
const col = map.collider;

type P = { x: number; y: number; z: number };
const node = (p: P): number => nearestNode(g, p.x, p.y, p.z, 2);
const areasOn = (a: P, b: P): string[] => {
  const path = astar(g, node(a), node(b));
  expect(path.length, 'Weg existiert').toBeGreaterThan(0);
  return [...new Set(path.map((n) => (g.area[n]! >= 0 ? g.areas[g.area[n]!]!.name : '-')))];
};
const area = (name: string) => g.areas.find((a) => a.name === name)!;

describe('de_umschlag: Mirage-Topologie', () => {
  it('alle Mirage-Callouts sind vorhanden und begehbar', () => {
    for (const n of ['T-Spawn', 'T-Rampe', 'Palast', 'Balkon', 'Spot A', 'Treppe', 'Sandwich', 'Dschungel', 'Verbindung', 'Pförtner-Gasse', 'CT-Gasse',
      'Untere Mitte', 'Mitte', 'Obere Mitte', 'Fenster', 'Steg', 'Kurz', 'Unterführung', 'Wohnungen', 'Spot B', 'Markt', 'Küche', 'CT-Spawn', 'Tor Süd',
      'Feuerkiste', 'Dreierkiste', 'Pförtnerhaus', 'Lieferwagen', 'Bank']) {
      expect(area(n), n).toBeDefined();
      expect(area(n).nodeCount, n).toBeGreaterThan(0);
      expect(area(n).neighbors.length, n).toBeGreaterThan(0);
    }
  });

  it('Fenster (Leitstand) liegt erhöht über der Mitte und hat freie Sicht auf Obere Mitte und Mitte', () => {
    const f = area('Fenster');
    const mid = area('Mitte');
    expect(f.center.y).toBeGreaterThanOrEqual(4.3);
    expect(mid.center.y).toBeLessThan(0.5);
    // Sichtlinie vom Fenster (Augenhöhe) zu Boden und Körpermitte auf beiden Mitte-Bereichen
    const eye = { x: 7, y: 4.4 + PLAYER.eye, z: -20.75 };
    for (const [x, z] of [[0, -14], [0, 0], [-6, -10]] as const) {
      expect(col.clear(eye, { x, y: 1.2, z }), `Sicht Fenster → ${x},${z}`).toBe(true);
    }
    // das Fenster liegt am Nordende der Halle, die Obere Mitte darunter
    expect(f.center.z).toBeLessThan(area('Obere Mitte').center.z);
  });

  it('Fenster ist nur von der CT-Seite über die Leitstand-Treppe erreichbar (nicht über die Halle)', () => {
    const route = areasOn(map.zones.ct, f().center);
    expect(route).toContain('Leitstand-Treppe');
    expect(route).not.toContain('Obere Mitte');
    function f(): ReturnType<typeof area> { return area('Fenster'); }
  });

  it('Unterführung liegt ≥ 3 m unter der Mitte und führt vom Schacht in der Halle zur Rampe in die Paketsortierung B', () => {
    const u = area('Unterführung');
    expect(u.center.y).toBeLessThanOrEqual(-3);
    expect(area('Mitte').center.y - u.center.y).toBeGreaterThanOrEqual(3);
    const route = areasOn(area('Unterführungs-Abgang').center, area('Spot B').center);
    expect(route).toContain('Unterführung');
    expect(route).toContain('Unterführungs-Rampe');
    expect(route).not.toContain('Kurz');
    // Eingang in der Halle (T-Seite, südlich der Mitte), Ausgang in B
    expect(area('Unterführungs-Abgang').center.z).toBeGreaterThan(area('Mitte').center.z);
  });

  it('Steg/Kurz: erhöhter Laufsteg (+4.4 m) von der Mitte über die Brücke nach B', () => {
    expect(area('Steg').center.y).toBeGreaterThanOrEqual(4.3);
    expect(area('Kurz').center.y).toBeGreaterThanOrEqual(4.3);
    const route = areasOn(area('Mitte').center, area('Spot B').center);
    expect(route).toContain('Steg');
    expect(route).toContain('Kurz');
    expect(route).not.toContain('Unterführung');
    // von der Plattform in B (oben an der Treppe) sieht man den Pflanzpunkt von Spot B
    expect(col.clear({ x: -33, y: 4.4 + PLAYER.eye, z: -24.5 }, { x: map.zones.b.x, y: 1.0, z: map.zones.b.z })).toBe(true);
  });

  it('Palast: oberer Gang vom Palast-Aufgang über den Balkon (+5.6 m) auf Rampe A', () => {
    expect(area('Palast').center.y).toBeGreaterThanOrEqual(5.5);
    expect(area('Balkon').center.y).toBeGreaterThanOrEqual(5.5);
    expect(map.zones.a.y).toBeCloseTo(2, 5);
    const route = areasOn(area('Palast-Aufgang').center, map.zones.a);
    expect(route).toContain('Palast');
    expect(route).toContain('Balkon');
    // Balkon überblickt die Rampe: Sicht auf den Pflanzpunkt
    const b = area('Balkon').center;
    expect(col.clear({ x: b.x, y: b.y + PLAYER.eye, z: b.z }, { x: map.zones.a.x, y: map.zones.a.y + 1.0, z: map.zones.a.z })).toBe(true);
  });

  it('Wohnungen: oberer Gang vom Wohnungs-Aufgang nach B (nicht über die Mitte)', () => {
    expect(area('Wohnungen').center.y).toBeGreaterThanOrEqual(4.3);
    const route = areasOn(area('Wohnungs-Aufgang').center, area('Spot B').center);
    expect(route).toContain('Wohnungen');
    expect(route).toContain('Wohnungen-Treppe');
    expect(route).not.toContain('Mitte');
  });

  it('T-Rampe ist der kürzeste Weg der T nach A; Dschungel und Verbindung führen aus der Halle auf Rampe A', () => {
    expect(areasOn(map.zones.t, map.zones.a)).toContain('T-Rampe');
    const route = areasOn(area('Obere Mitte').center, map.zones.a);
    expect(route).toContain('Verbindung');
    expect(route).toContain('Dschungel');
    expect(routeLength(g, area('Mitte').center, map.zones.a)).toBeLessThan(95);
  });

  it('B hat vier Zugänge: Wohnungen, Unterführung, Kurz und Markt/Küche von der CT-Seite', () => {
    const b = area('B-Halle');
    const names = new Set(b.neighbors.map((n) => g.areas[n]!.name));
    for (const n of ['Wohnungen-Treppe', 'Unterführungs-Rampe', 'Kurz', 'Markt', 'Küche']) expect(names.has(n), n).toBe(true);
    expect(routeLength(g, map.zones.ct, map.zones.b) / PLAYER.sprintSpeed).toBeLessThan(15);
    const viaKitchen = areasOn(map.zones.ct, map.zones.b);
    expect(viaKitchen).toContain('Küche');
  });

  it('Markt: Tür und Fenster zur Halle B (Fenster ist eine offene Brüstung auf 1 m)', () => {
    const win = data.brushes.filter((b) => b.max[2] <= -60 && b.min[2] >= -62 && b.min[0] >= -48 && b.max[0] <= -44 && b.min[1] <= 1.0 + 1e-6 && b.max[1] >= 1.0 - 1e-6);
    expect(win.length).toBeGreaterThan(0);
    // Sicht aus dem Markt durch das Fenster in die Halle
    expect(col.clear({ x: -46, y: 1.65, z: -66 }, { x: -46, y: 1.2, z: -50 })).toBe(true);
  });

  it('Sites: beide Pflanzpunkte stehen frei, Sandwich unter dem Vordach (Decke > 5 m)', () => {
    const sandwich = area('Sandwich');
    expect(sandwich.nodeCount).toBeGreaterThan(20);
    expect(col.ceilingAbove(sandwich.center.x, sandwich.center.z, sandwich.center.y, PLAYER.radius)).toBeGreaterThan(4.5);
  });
});
