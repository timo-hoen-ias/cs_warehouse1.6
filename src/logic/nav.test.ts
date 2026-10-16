import { describe, expect, it } from 'vitest';
import { MapBuilder } from './mapkit';
import { colliderFromMap, compileMap, inBuyZoneBox, siteAt } from './mapcompile';
import { EDGE, NAV, NAV_FLAG, areaAt, astar, findPath, nearestNode, pathLength, reachableFrom, routeLength, traverse } from './nav';

const ENV = { sunDir: [0.3, 0.8, 0.2] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };

/**
 * Testkarte: Erdgeschoss 30×20 m, Wand mit 3-m-Tür bei x=15, Obergeschoss (y=4) über
 * x 20..30 mit Treppe (x 10..18 hinauf in +x) — nein: Treppe innen an der Nordwand —
 * Rampe zu einer 1.5-m-Plattform und eine Kante zum Herunterspringen.
 */
function testMap() {
  const b = new MapBuilder({ id: 'de_test', name: 'Test', description: '', bounds: { min: [-1, -1, -1], max: [31, 10, 21] }, env: ENV });
  b.floor(0, 0, 30, 20, 0, 'concrete');
  b.wallX(0, 30, 0, 0, 6, 'brick');
  b.wallX(0, 30, 20, 0, 6, 'brick');
  b.wallZ(0, 20, 0, 0, 6, 'brick');
  b.wallZ(0, 20, 30, 0, 6, 'brick');
  // Trennwand bei x=15 mit Tür (z 8..11)
  b.wallZ(0, 20, 15, 0, 6, 'wallPaint', [{ from: 8, to: 11, bottom: 0, top: 2.6 }]);
  // Obergeschoss rechts (x 22..30, z 0..8), Treppe von z 16 bis 8 hinauf Richtung −z (nz), x 22..24.5
  b.floor(22, 0.2, 29.8, 8, 4, 'grating');
  b.stairs(22, 8, 24.5, 16, 0, 4, 'nz', 'steel');
  // Rampe links auf eine Plattform 1.5 m (x 2..8 Rampe in +x, Plattform x 8..12)
  b.ramp(2, 14, 8, 18, 0, 1.5, 'px', 'concrete');
  b.box([8, 0, 14], [12, 1.5, 18], 'concrete');
  b.area('Links', 0, 0, 15, 20);
  b.area('Rechts', 15, 0, 30, 20);
  b.area('Oben', 22, 0, 30, 8, 3, 10);
  b.site('A', 'Spot A', [24, 3.5, 1], [29, 7, 7], [27, 4, 4]);
  b.spawn('T', 3, 0, 3, 0);
  b.spawn('CT', 27, 0, 12, 0);
  b.buy('T', 0, 0, 8, 8);
  return b.data;
}

describe('Navigation', () => {
  const data = testMap();
  const map = compileMap(data);
  const g = map.nav;
  const col = map.collider;

  it('erzeugt Knoten auf mehreren Ebenen (Boden, Plattform, Rampe, Obergeschoss)', () => {
    const ys = new Set<number>();
    for (let i = 0; i < g.count; i++) ys.add(Math.round(g.y[i]! * 2) / 2);
    expect(ys.has(0)).toBe(true);
    expect(ys.has(1.5)).toBe(true);
    expect(ys.has(4)).toBe(true);
    expect([...ys].some((y) => y > 0.2 && y < 1.3)).toBe(true); // Rampe
    // keine Knoten in Wänden
    expect(nearestNode(g, 15, 0, 4, 0.6)).toBe(-1);
  });

  it('findet den Weg durch die Tür und die Treppe hinauf ins Obergeschoss', () => {
    const p = findPath(g, col, { x: 3, y: 0, z: 3 }, { x: 27, y: 4, z: 4 })!;
    expect(p).not.toBeNull();
    expect(p.points.at(-1)!.y).toBeCloseTo(4, 1);
    // durch die Tür (z 8..11 bei x=15)
    const nodes = p.nodes.map((i) => ({ x: g.x[i]!, z: g.z[i]! }));
    const atDoor = nodes.filter((n) => Math.abs(n.x - 15) < 0.6);
    expect(atDoor.length).toBeGreaterThan(0);
    for (const n of atDoor) expect(n.z).toBeGreaterThan(8);
    // geglättet: deutlich weniger Punkte als Knoten, Länge ~ Luftlinie + Umweg
    expect(p.points.length).toBeLessThan(p.nodes.length / 2);
    expect(p.length).toBeGreaterThan(30);
    expect(p.length).toBeLessThan(60);
  });

  it('Kante: herunterspringen ja, hinaufspringen nein (einseitige Abwärts-Kante)', () => {
    const top = nearestNode(g, 11.5, 1.5, 16);
    const below = nearestNode(g, 12.5, 0, 16);
    expect(g.y[top]!).toBeCloseTo(1.5);
    expect(g.y[below]!).toBeCloseTo(0);
    let down = 0;
    for (let k = g.edgeStart[top]!; k < g.edgeStart[top + 1]!; k++) if (g.edgeTo[k] === below) down = g.edgeKind[k]!;
    expect(down).toBe(EDGE.drop);
    let up = false;
    for (let k = g.edgeStart[below]!; k < g.edgeStart[below + 1]!; k++) if (g.edgeTo[k] === top) up = true;
    expect(up).toBe(false);
    expect(traverse(col, { x: 11.5, y: 1.5, z: 16 }, { x: 12.5, y: 0, z: 16 })).toBe(EDGE.drop);
  });

  it('nearestNode bevorzugt die eigene Ebene', () => {
    const upper = nearestNode(g, 26, 4, 4);
    const lower = nearestNode(g, 26, 0, 4);
    expect(g.y[upper]!).toBeCloseTo(4);
    expect(g.y[lower]!).toBeCloseTo(0);
  });

  it('Randabstand: Knoten an Wänden sind Rand, in der Raummitte nicht', () => {
    const wall = nearestNode(g, 0, 0, 10); // erster Knoten an der Außenwand
    expect(g.rim[wall]).toBe(0);
    expect(g.rim[nearestNode(g, g.x[wall]! + 1, 0, 10)]).toBe(1);
    expect(g.rim[nearestNode(g, 15, 0, 4)]).toBe(0); // an der Trennwand
    expect(g.rim[nearestNode(g, 5.5, 0, 10)]).toBe(NAV.wallCost.length); // frei
  });

  it('Wege halten Abstand zu Wänden: mittig durch die Tür, Abkürzungen mit Freiraum', () => {
    // Start und Ziel dicht an der Südwand: der kürzeste Weg schrammte an der Wand entlang zur Türkante
    const from = { x: 3.5, y: 0, z: 1.5 }, to = { x: 27.5, y: 0, z: 18.5 };
    const nodes = astar(g, nearestNode(g, from.x, 0, from.z), nearestNode(g, to.x, 0, to.z));
    const door = nodes.filter((i) => Math.abs(g.x[i]! - 15) < 0.6);
    expect(door.length).toBeGreaterThan(0);
    for (const i of door) expect(g.z[i]!).toBeCloseTo(9.5); // Türmitte (Tür z 8..11)
    // Anteil der Randknoten auf dem Weg klein (nur Start/Ziel-Nähe und die Tür selbst)
    const rimShare = nodes.filter((i) => g.rim[i] === 0).length / nodes.length;
    expect(rimShare).toBeLessThan(0.3);
    // ohne Wandabstand (Laufzeit-Messung) bleibt es der kürzeste Knotenweg
    const hug = astar(g, nearestNode(g, from.x, 0, from.z), nearestNode(g, to.x, 0, to.z), { hugWalls: true });
    expect(routeLength(g, from, to)).toBeCloseTo(pathLength(hug.map((i) => ({ x: g.x[i]!, y: g.y[i]!, z: g.z[i]! }))));
    // geglättete Strecken: Freiraum ≥ smoothRadius bis auf den Knoten-Anschluss
    const p = findPath(g, col, from, to)!;
    let tight = 0, samples = 0;
    let prev = from;
    for (const q of p.points) {
      const n = Math.max(2, Math.ceil(Math.hypot(q.x - prev.x, q.z - prev.z) / 0.25));
      for (let k = 1; k < n; k++) {
        const x = prev.x + ((q.x - prev.x) * k) / n, z = prev.z + ((q.z - prev.z) * k) / n;
        samples++;
        if (col.blockedAt(x, z, 0, NAV.smoothRadius - 0.05, 1.8, 0.45)) tight++;
      }
      prev = q;
    }
    expect(tight / samples).toBeLessThan(0.15);
  });

  it('traverse: größerer Freiraum blockiert Strecken dicht an der Wand', () => {
    const a = { x: 3, y: 0, z: 0.8 }, b = { x: 10, y: 0, z: 0.8 };
    expect(traverse(col, a, b)).toBe(EDGE.walk);
    expect(traverse(col, a, b, 1.8, 0.9)).toBe(0);
  });

  it('A*: Ausweichzonen verlängern den Weg, unerreichbar → leer', () => {
    const a = nearestNode(g, 3, 0, 10);
    const b = nearestNode(g, 27, 0, 15);
    const plain = astar(g, a, b);
    const avoid = astar(g, a, b, { avoid: [{ x: 15, y: 0, z: 9.5, r: 3, cost: 50 }] });
    expect(plain.length).toBeGreaterThan(0);
    expect(avoid.length).toBeGreaterThan(0); // einzige Tür → Umweg unmöglich, aber erreichbar
    expect(astar(g, a, -1)).toEqual([]);
    expect(routeLength(g, { x: 3, y: 0, z: 10 }, { x: 27, y: 0, z: 15 })).toBeGreaterThan(24);
  });

  it('Bereiche: Callouts, Zentren und Bereichsgraph', () => {
    const names = g.areas.map((a) => a.name);
    expect(names).toEqual(['Links', 'Rechts', 'Oben']);
    expect(areaAt(g, { x: 5, y: 0, z: 5 })!.name).toBe('Links');
    expect(areaAt(g, { x: 26, y: 4, z: 4 })!.name).toBe('Oben');
    expect(areaAt(g, { x: 26, y: 0, z: 4 })!.name).toBe('Rechts');
    const links = g.areas[0]!;
    expect(links.neighbors).toContain(1);
    expect(g.areas[2]!.neighbors).toContain(1);
    for (const a of g.areas) expect(a.nodeCount).toBeGreaterThan(5);
  });

  it('Flags: Deckung an Wänden, erhöhte Position oben an der Kante', () => {
    const wallNode = nearestNode(g, 14.5, 0, 4);
    expect(g.flags[wallNode]! & NAV_FLAG.cover).toBeTruthy();
    const edge = nearestNode(g, 11.5, 1.5, 16);
    expect(g.flags[edge]! & NAV_FLAG.high).toBeTruthy();
    const door = nearestNode(g, 15, 0, 9.5);
    expect(g.flags[door]! & NAV_FLAG.choke).toBeTruthy();
  });

  it('alles ist vom Spawn aus erreichbar', () => {
    const seen = reachableFrom(g, nearestNode(g, 3, 0, 3));
    let n = 0;
    for (let i = 0; i < g.count; i++) n += seen[i]!;
    expect(n).toBeGreaterThan(g.count * 0.95);
  });

  it('Spots und Kaufzonen als Boxen', () => {
    expect(siteAt(map.sites, { x: 27, y: 4, z: 4 })).toBe('a');
    expect(siteAt(map.sites, { x: 27, y: 0, z: 4 })).toBeNull();
    expect(inBuyZoneBox(map.buyZones, 'T', { x: 3, y: 0, z: 3 })).toBe(true);
    expect(inBuyZoneBox(map.buyZones, 'CT', { x: 3, y: 0, z: 3 })).toBe(false);
    expect(map.zones.a).toEqual({ x: 27, y: 4, z: 4 });
  });

  it('pathLength', () => {
    expect(pathLength([{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }])).toBe(5);
  });

  it('Collider aus Karte: Clip-Rampe der Treppe ist begehbar, Stufen blockieren Schüsse', () => {
    const c = colliderFromMap(data);
    expect(c.groundHeight(23, 12, 2.5, 0.35, 0.55)).toBeGreaterThan(1.5);
    expect(c.clear({ x: 23, y: 0.3, z: 17 }, { x: 23, y: 0.3, z: 9 })).toBe(false);
  });
});
