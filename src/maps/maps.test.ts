import { describe, expect, it } from 'vitest';
import { MAPS, loadMapData, mapById } from './index';
import { compileMap, inBuyZoneBox, siteAt } from '../logic/mapcompile';
import { astar, nearestNode, reachableFrom, routeLength, type NavGraph } from '../logic/nav';
import { PLAYER } from '../logic/move';
import { analyzeMap, portalHoldSpots, routesTo, siteEntrances } from '../logic/botMap';
import { solveThrow } from '../logic/botThrow';

/**
 * Karten-Validator: jede registrierte Karte muss spielbar sein (Spawns, Spots,
 * Erreichbarkeit, CS-Laufzeiten, Callouts). Referenztempo = Sprint (≈ CS-Lauftempo).
 */
const RUN = PLAYER.sprintSpeed;
const T_SITE = [18, 25.5] as const;
const CT_SITE = [6, 15] as const;

/** Rückwärts-Erreichbarkeit: Knoten, von denen aus `target` erreichbar ist. */
function canReach(g: NavGraph, target: number): Uint8Array {
  const rev: number[][] = Array.from({ length: g.count }, () => []);
  for (let i = 0; i < g.count; i++) for (let k = g.edgeStart[i]!; k < g.edgeStart[i + 1]!; k++) rev[g.edgeTo[k]!]!.push(i);
  const seen = new Uint8Array(g.count);
  const q = [target];
  seen[target] = 1;
  while (q.length) {
    const c = q.pop()!;
    for (const p of rev[c]!) if (!seen[p]) { seen[p] = 1; q.push(p); }
  }
  return seen;
}

describe.each(MAPS.map((m) => m.id))('Karte %s', (id) => {
  const data = loadMapData(id);
  const map = compileMap(data);
  const g = map.nav;
  const col = map.collider;

  it('Registry und Metadaten', () => {
    expect(mapById(id).id).toBe(id);
    expect(id.startsWith('de_')).toBe(true);
    expect(data.name.length).toBeGreaterThan(2);
    expect(data.sites.map((s) => s.id).sort()).toEqual(['A', 'B']);
  });

  it('mindestens 8 Spawns je Team, auf begehbarem Boden, frei, in der Kaufzone, mit Navigationsknoten', () => {
    for (const team of ['T', 'CT'] as const) {
      const list = map.spawns[team];
      expect(list.length).toBeGreaterThanOrEqual(8);
      for (const s of list) {
        const [x, y, z] = s.pos;
        expect(col.groundHeight(x, z, y + 0.3, PLAYER.radius, PLAYER.step), `${team}-Spawn ${x},${z} Boden`).toBeCloseTo(y, 2);
        expect(col.blockedAt(x, z, y, PLAYER.radius, PLAYER.height, PLAYER.step), `${team}-Spawn ${x},${z} frei`).toBe(false);
        expect(inBuyZoneBox(map.buyZones, team, { x, y, z }), `${team}-Spawn in Kaufzone`).toBe(true);
        const n = nearestNode(g, x, y, z, 2);
        expect(n, `${team}-Spawn hat Knoten`).toBeGreaterThanOrEqual(0);
      }
      // Spawns überlappen nicht
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        expect(Math.hypot(list[i]!.pos[0] - list[j]!.pos[0], list[i]!.pos[2] - list[j]!.pos[2])).toBeGreaterThan(PLAYER.radius * 2);
      }
    }
  });

  it('Bombenspots: begehbar, Pflanzpunkt am Boden und im Spot', () => {
    for (const s of map.sites) {
      const [x, y, z] = s.plant;
      expect(col.groundHeight(x, z, y + 0.3, PLAYER.radius, PLAYER.step)).toBeCloseTo(y, 2);
      expect(col.blockedAt(x, z, y, PLAYER.radius, PLAYER.height, PLAYER.step)).toBe(false);
      expect(siteAt(map.sites, { x, y, z })).toBe(s.id === 'A' ? 'a' : 'b');
      let inside = 0;
      for (let i = 0; i < g.count; i++) if (siteAt(map.sites, { x: g.x[i]!, y: g.y[i]!, z: g.z[i]! })) inside++;
      expect(inside).toBeGreaterThan(60);
    }
  });

  it('beide Spots von beiden Spawns erreichbar, CS-Laufzeiten (Sprint) eingehalten, CT schneller als T', () => {
    const times: Record<string, number> = {};
    for (const team of ['T', 'CT'] as const) {
      for (const site of ['a', 'b'] as const) {
        const from = map.zones[team === 'T' ? 't' : 'ct'];
        const len = routeLength(g, from, map.zones[site]);
        expect(len, `${team} → ${site}`).toBeLessThan(Infinity);
        times[`${team}${site}`] = len / RUN;
      }
    }
    for (const site of ['a', 'b']) {
      expect(times[`T${site}`]!, `T → ${site}`).toBeGreaterThanOrEqual(T_SITE[0]);
      expect(times[`T${site}`]!, `T → ${site}`).toBeLessThanOrEqual(T_SITE[1]);
      expect(times[`CT${site}`]!, `CT → ${site}`).toBeGreaterThanOrEqual(CT_SITE[0]);
      expect(times[`CT${site}`]!, `CT → ${site}`).toBeLessThanOrEqual(CT_SITE[1]);
      expect(times[`CT${site}`]! + 5).toBeLessThan(times[`T${site}`]!);
    }
  });

  it('keine Fallen und keine großen unerreichbaren Flächen', () => {
    const t = nearestNode(g, map.zones.t.x, map.zones.t.y, map.zones.t.z);
    const ct = nearestNode(g, map.zones.ct.x, map.zones.ct.y, map.zones.ct.z);
    const fromT = reachableFrom(g, t);
    const toT = canReach(g, t);
    expect(fromT[ct]).toBe(1);
    let traps = 0;
    for (let i = 0; i < g.count; i++) if (fromT[i] && !toT[i]) traps++;
    expect(traps, 'Knoten ohne Rückweg').toBe(0);
    // unerreichbare Komponenten (z. B. Kistendächer nur per Sprung) bleiben klein
    const seen = new Uint8Array(g.count);
    let largest = 0;
    for (let i = 0; i < g.count; i++) {
      if (fromT[i] || seen[i]) continue;
      const comp = reachableFrom(g, i);
      let n = 0;
      for (let j = 0; j < g.count; j++) if (comp[j] && !fromT[j]) { seen[j] = 1; n++; }
      largest = Math.max(largest, n);
    }
    expect(largest, 'größte unerreichbare Fläche (Knoten ≈ m²)').toBeLessThan(40);
  });

  it('Callouts: alle Bereiche haben Knoten und Nachbarn; Mitte von beiden Seiten umkämpft', () => {
    expect(g.areas.length).toBeGreaterThanOrEqual(10);
    for (const a of g.areas) {
      expect(a.nodeCount, a.name).toBeGreaterThan(0);
      expect(a.neighbors.length, a.name).toBeGreaterThan(0);
    }
    const mid = g.areas.find((a) => a.name === 'Mitte')!;
    const tMid = routeLength(g, map.zones.t, mid.center) / RUN;
    const ctMid = routeLength(g, map.zones.ct, mid.center) / RUN;
    expect(Math.abs(tMid - ctMid)).toBeLessThan(5);
  });

  it('mehrere begehbare Höhenebenen (Vertikalität)', () => {
    const levels = new Set<number>();
    for (let i = 0; i < g.count; i++) levels.add(Math.round(g.y[i]!));
    expect(levels.size).toBeGreaterThanOrEqual(5);
    const t = nearestNode(g, map.zones.t.x, map.zones.t.y, map.zones.t.z);
    let high = 0;
    for (let i = 0; i < g.count; i++) if (g.y[i]! >= 3.4 && astar(g, t, i).length) high++;
    expect(high, 'erreichbare Knoten ≥ 3.4 m').toBeGreaterThan(100);
  });

  it('Größe: deutlich größer als die alten Hallen (Fläche ≥ 8000 m² begehbar)', () => {
    expect(g.count).toBeGreaterThan(8000);
    const w = data.bounds.max[0] - data.bounds.min[0];
    const d = data.bounds.max[2] - data.bounds.min[2];
    expect(Math.max(w, d)).toBeGreaterThanOrEqual(150);
  });

  it('deterministisch: zweimal kompiliert = identisch', () => {
    const again = compileMap(mapById(id).build());
    expect(again.nav.count).toBe(g.count);
    expect(again.data.brushes.length).toBe(data.brushes.length);
    expect(Array.from(again.nav.y.slice(0, 200))).toEqual(Array.from(g.y.slice(0, 200)));
  });

  it('alle Brushes, Lichter und Spawns liegen in den Kartengrenzen', () => {
    const { min, max } = data.bounds;
    const inside = (p: readonly number[]) => p[0]! >= min[0] - 1e-6 && p[0]! <= max[0] + 1e-6 && p[1]! >= min[1] - 1e-6 && p[1]! <= max[1] + 1e-6 && p[2]! >= min[2] - 1e-6 && p[2]! <= max[2] + 1e-6;
    for (const b of data.brushes) {
      expect(inside(b.min) && inside(b.max), JSON.stringify(b)).toBe(true);
      for (let k = 0; k < 3; k++) expect(b.max[k]!).toBeGreaterThan(b.min[k]!);
    }
    for (const l of data.lights) expect(inside(l.pos)).toBe(true);
  });

  it('Bots: jede Seite hat T-Routen, jeder Angriffseingang CT-Halte-Positionen; Bot-Hinweise sind gültig', () => {
    const info = analyzeMap({ nav: g, collider: col, sites: map.sites, spawns: map.spawns, hints: data.botHints });
    for (const s of info.sites) {
      expect(routesTo(info, 'T', s.id).length, `T-Routen zu ${s.id}`).toBeGreaterThanOrEqual(1);
      for (const pid of siteEntrances(info, s, 'attack')) expect(portalHoldSpots(info, pid, 'CT').length, `Halten ${s.id}`).toBeGreaterThanOrEqual(1);
    }
    for (const h of data.botHints ?? []) {
      if (h.kind === 'smoke') {
        const eye = { x: h.from[0], y: h.from[1] + 1.6, z: h.from[2] };
        expect(solveThrow(col, 'smoke', eye, { x: h.target[0], y: h.target[1], z: h.target[2] }), `Rauch ${JSON.stringify(h)}`).not.toBeNull();
        continue;
      }
      const n = nearestNode(g, h.pos[0], h.pos[1], h.pos[2], 1.6);
      expect(n, `Hinweis auf Navigation ${JSON.stringify(h)}`).toBeGreaterThanOrEqual(0);
      expect(Math.abs(g.y[n]! - h.pos[1])).toBeLessThan(1);
      if (h.kind === 'plant') expect(siteAt(map.sites, { x: h.pos[0], y: h.pos[1], z: h.pos[2] })).toBe(h.site.toLowerCase());
    }
  });
});
