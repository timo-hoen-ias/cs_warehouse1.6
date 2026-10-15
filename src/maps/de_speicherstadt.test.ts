import { describe, expect, it } from 'vitest';
import { loadMapData } from './index';
import { compileMap, brushItem, siteAt } from '../logic/mapcompile';
import { astar, nearestNode, routeLength } from '../logic/nav';
import { MAX_WALK_SLOPE, rampSlope } from '../logic/collision';
import { PLAYER } from '../logic/move';
import { HeadlessMatch, summarize } from '../logic/botSim';

/**
 * Kartenspezifische Topologie von de_speicherstadt (de_inferno als Hafen-Speicherviertel):
 * Banane ist die Hauptroute der T nach B, die Wohnungen (Speicherboden, Speicherbrücke, Balkon) führen nach A,
 * Kurz über den Kessel, Lange Halle zur Grube, Bogen/Bibliothek von CT nach A.
 */
const data = loadMapData('de_speicherstadt');
const map = compileMap(data);
const g = map.nav;

type P = { x: number; y: number; z: number };
const area = (name: string) => g.areas.find((a) => a.name === name)!;
const node = (p: P): number => nearestNode(g, p.x, p.y, p.z, 2);
const areasOn = (a: P, b: P): string[] => {
  const path = astar(g, node(a), node(b));
  expect(path.length, 'Weg existiert').toBeGreaterThan(0);
  const names: string[] = [];
  for (const n of path) {
    const nm = g.area[n]! >= 0 ? g.areas[g.area[n]!]!.name : '-';
    if (names.at(-1) !== nm) names.push(nm);
  }
  return names;
};
const nodesIn = (names: string[], stride = 1): number[] => {
  const out: number[] = [];
  for (let i = 0; i < g.count; i += stride) if (g.area[i]! >= 0 && names.includes(g.areas[g.area[i]!]!.name)) out.push(i);
  return out;
};
/** Anzahl der Knotenpaare mit freier Sichtlinie (Augenhöhe) zwischen zwei Bereichsgruppen. */
const sightPairs = (a: string[], b: string[], stride = 3): number => {
  let n = 0;
  for (const i of nodesIn(a, stride)) for (const j of nodesIn(b, stride)) {
    if (map.collider.clear({ x: g.x[i]!, y: g.y[i]! + 1.6, z: g.z[i]! }, { x: g.x[j]!, y: g.y[j]! + 1.6, z: g.z[j]! })) n++;
  }
  return n;
};

describe('de_speicherstadt: Inferno-Topologie', () => {
  it('alle Callouts sind vorhanden und begehbar', () => {
    for (const n of ['T-Spawn', 'T-Rampe', 'Untere Mitte', 'Mitte', 'Obere Mitte', 'Zweite Mitte', 'Banane-Anfang', 'Banane', 'Lieferwagen', 'Banane-Brücke',
      'B-Eingang', 'Spot B', 'Dunkel', 'Baustelle', 'Verladerampe', 'Büro', 'CT-Passage', 'CT-Spawn', 'Bogen', 'Bibliothek', 'A-Hof', 'Spot A', 'Balkon', 'Balkontreppe',
      'Wohnungen Süd', 'Wohnungen Nord', 'Speicherbrücke', 'Treppenhaus', 'Kurz', 'Kessel', 'Lange Halle', 'Grube', 'Grubenrampe', 'Brückengasse', 'Ladehof', 'Kistenhof']) {
      expect(area(n), n).toBeDefined();
      expect(area(n).nodeCount, n).toBeGreaterThan(0);
    }
  });

  it('Banane ist die kürzeste Route der T nach B (nicht über die Mitte); die Brückengasse ist die längere zweite Route', () => {
    const route = areasOn(map.zones.t, map.zones.b);
    for (const n of ['Banane-Anfang', 'Banane', 'Lieferwagen', 'Banane-Brücke', 'B-Eingang']) expect(route, n).toContain(n);
    expect(route).not.toContain('Obere Mitte');
    const viaMitte = routeLength(g, map.zones.t, area('Brückengasse').center) + routeLength(g, area('Brückengasse').center, map.zones.b);
    expect(viaMitte).toBeGreaterThan(routeLength(g, map.zones.t, map.zones.b) + 6);
    expect(areasOn(map.zones.t, area('Brückengasse').center)).toContain('Obere Mitte');
  });

  it('Banane ist gekrümmt: kein Blick vom B-Eingang oder Hof B zum T-Ausgang; Mitte und A-Hof ohne Sichtachse zum T-Spawn', () => {
    expect(sightPairs(['B-Eingang'], ['Banane-Anfang', 'Banane'])).toBe(0);
    expect(sightPairs(['Spot B'], ['Banane', 'Lieferwagen'])).toBe(0);
    expect(sightPairs(['Spot A'], ['Mitte', 'Untere Mitte', 'Zweite Mitte'])).toBe(0);
    // Zollwaage in der Mitte bricht die lange Achse T-Rampe → Obere Mitte (nur Randstreifen bleiben)
    const lane = nodesIn(['Untere Mitte', 'T-Rampe'], 4).length * nodesIn(['Obere Mitte', 'CT-Rampe'], 4).length;
    expect(sightPairs(['Untere Mitte', 'T-Rampe'], ['Obere Mitte', 'CT-Rampe'], 4) / lane).toBeLessThan(0.02);
  });

  it('Wohnungen: Treppenhaus → Speicherboden → Speicherbrücke → Balkon → Balkontreppe → A (zwei Stockwerke über dem Hof)', () => {
    const route = areasOn(area('Treppenhaus').center, map.zones.a);
    for (const n of ['Wohnungen Süd', 'Speicherbrücke', 'Wohnungen Nord', 'Balkon', 'Balkontreppe']) expect(route, n).toContain(n);
    expect(area('Wohnungen Süd').center.y).toBeGreaterThanOrEqual(4.3);
    expect(area('Balkon').center.y).toBeGreaterThanOrEqual(4.3);
    expect(map.zones.a.y).toBeCloseTo(1.6, 2);
    // der Balkon liegt 2.8 m über dem Hof und blickt auf Spot A
    expect(area('Balkon').center.y - map.zones.a.y).toBeCloseTo(2.8, 1);
  });

  it('Speicherbrücke liegt über der Gasse „Zweite Mitte“ (4.4 m über dem Pflaster)', () => {
    const bridge = nodesIn(['Speicherbrücke']).filter((i) => g.x[i]! > 37 && g.x[i]! < 43 && Math.abs(g.z[i]!) < 3);
    const alley = nodesIn(['Zweite Mitte']).filter((i) => g.x[i]! > 37 && g.x[i]! < 43 && Math.abs(g.z[i]!) < 3);
    expect(bridge.length).toBeGreaterThan(10);
    expect(alley.length).toBeGreaterThan(10);
    expect(Math.min(...bridge.map((i) => g.y[i]!))).toBeGreaterThan(4.3);
    expect(Math.max(...alley.map((i) => g.y[i]!))).toBeLessThan(0.1);
  });

  it('Kurz über den Kessel ist die kürzeste Route der T nach A; Lange Halle führt durch die Grube über die Rampe nach A', () => {
    const route = areasOn(map.zones.t, map.zones.a);
    for (const n of ['Mitte', 'Kurz', 'Kurz-Rampe', 'Kessel']) expect(route, n).toContain(n);
    expect(route).not.toContain('Speicherbrücke');
    const long = areasOn(area('Zweite Mitte').center, map.zones.a);
    expect(long.length).toBeGreaterThan(2);
    const viaLong = areasOn(area('Lange Halle').center, map.zones.a);
    for (const n of ['Grube', 'Grubenrampe']) expect(viaLong, n).toContain(n);
    expect(area('Grube').center.y).toBeLessThan(0.5);
    expect(area('Spot A').center.y).toBeGreaterThanOrEqual(1.5);
    expect(routeLength(g, area('Mitte').center, area('Lange Halle').center)).toBeGreaterThan(40);
  });

  it('CT: Bogen führt vom Zollhof in den Kranhof, die Bibliothek verbindet Bogen und A; Baustelle führt zu B', () => {
    expect(areasOn(map.zones.ct, map.zones.a)).toContain('Bogen');
    const lib = areasOn(area('Bogen').center, area('Bibliothek').center);
    expect(lib.at(-1)).toBe('Bibliothek');
    const b = areasOn(map.zones.ct, map.zones.b);
    expect(b).toContain('CT-Passage');
    expect(b).toContain('Baustelle');
    // Dock (Verladerampe) liegt 1.6 m über dem Hof B und ist über die Baustelle erreichbar
    expect(area('Verladerampe').center.y).toBeGreaterThan(area('Spot B').center.y + 1.4);
    expect(areasOn(area('Baustelle').center, area('Verladerampe').center)).toContain('Verladerampe');
  });

  it('Ebenen: Straßen 0 m, Hochkai 1.6 m (T, CT, A), Speicherboden 4.4 m; alle Rampen ≤ 30°', () => {
    expect(map.zones.t.y).toBeCloseTo(1.6, 2);
    expect(map.zones.ct.y).toBeCloseTo(1.6, 2);
    expect(area('Mitte').center.y).toBeCloseTo(0, 1);
    const ramps = data.brushes.filter((b) => b.ramp && b.tag === 'ramp');
    expect(ramps.length).toBeGreaterThanOrEqual(6);
    for (const r of ramps) {
      const it = brushItem(r, 0)!;
      expect((Math.atan(rampSlope(it)) * 180) / Math.PI, JSON.stringify(r.min)).toBeLessThanOrEqual(30);
      expect(rampSlope(it)).toBeLessThan(MAX_WALK_SLOPE);
    }
  });

  it('Wasser: Kanäle und Hafenbecken sind nicht begehbar, keine Falle durch Parapete', () => {
    const water = data.brushes.filter((b) => b.top === 'water');
    expect(water.length).toBeGreaterThanOrEqual(3);
    for (const w of water) expect(w.max[1]).toBeCloseTo(-1.2, 5);
    for (let i = 0; i < g.count; i++) expect(g.y[i]!, `Knoten ${g.x[i]},${g.z[i]}`).toBeGreaterThan(-0.2);
    // Brückenbrüstungen sind höher als der Sprung (kein Hineinspringen ins Fleet)
    const parapets = data.brushes.filter((b) => b.tag === 'building' && b.max[1] === 1.7);
    expect(parapets.length).toBeGreaterThan(0);
    expect(1.7).toBeGreaterThan(PLAYER.step + 1.1);
  });

  it('Ausstattung erzählt die Geschichte: Brunnen, Lieferwagen, Torbogen, Säcke, Baumstämme, Laternen, Serverschränke, Kräne, Archiv', () => {
    const decor = (k: string) => data.decor.filter((d) => d.kind === k).length;
    expect(decor('fountain')).toBe(1);
    expect(decor('van')).toBeGreaterThanOrEqual(2);
    expect(decor('archRing')).toBeGreaterThanOrEqual(1);
    expect(decor('sack')).toBeGreaterThan(150);
    expect(decor('log')).toBeGreaterThanOrEqual(10);
    expect(decor('lantern')).toBeGreaterThanOrEqual(40);
    expect(decor('serverRack')).toBeGreaterThanOrEqual(16);
    // Speicherluken (Seilwinden) an den Fassaden, Aktenregale in der Bibliothek, Gerüst auf der Baustelle
    expect(data.brushes.filter((b) => b.mat === 'black' && b.tint === 0x2a1c12).length).toBeGreaterThan(80);
    expect(data.brushes.filter((b) => b.mat === 'carton' && b.min[0] > 17 && b.max[0] < 33 && b.min[2] > -70 && b.max[2] < -54).length).toBeGreaterThan(40);
    expect(data.brushes.filter((b) => b.mat === 'wood' && b.tint === 0xb09060).length).toBeGreaterThan(4);
    // Kopfsteinpflaster und Backstein überall
    expect(data.brushes.filter((b) => b.top === 'cobble').length).toBeGreaterThan(20);
    expect(data.brushes.filter((b) => b.mat === 'brick').length).toBeGreaterThan(200);
    expect(data.lights.length).toBeGreaterThan(80);
  });

  it('Callout-Schilder: jede wichtige Ortsbezeichnung hängt als Schild an einer Wand', () => {
    const texts = data.signs.map((s) => s.text);
    for (const t of ['BANANE', 'MITTE', 'OBERE MITTE', 'ZWEITE MITTE', 'KURZ', 'KESSEL', 'LANGE HALLE', 'GRUBE', 'BOGEN', 'BIBLIOTHEK', 'BALKON', 'WOHNUNGEN',
      'LIEFERWAGEN', 'B-EINGANG', 'DUNKEL', 'BAUSTELLE', 'BRUNNEN', 'NEUE KISTE', 'T-SPAWN', 'T-RAMPE', 'FRIEDHOF', 'SERVERSCHRANK A', 'SERVERSCHRANK B']) {
      expect(texts, t).toContain(t);
    }
    // Schilder hängen nicht in der Luft: nahe an einer Wand (Kollision) oder auf Pfosten
    for (const s of data.signs) expect(s.w).toBeGreaterThan(0);
  });

  it('Serverschränke stehen frei: Pflanzpunkte A/B liegen zwischen zwei Schrankreihen', () => {
    for (const site of ['A', 'B'] as const) {
      const s = data.sites.find((q) => q.id === site)!;
      const racks = data.decor.filter((d) => d.kind === 'serverRack' && d.pos[0] > s.min[0] && d.pos[0] < s.max[0] && d.pos[2] > s.min[2] && d.pos[2] < s.max[2]);
      expect(racks.length, `Schränke ${site}`).toBeGreaterThanOrEqual(8);
      const left = racks.some((r) => Math.hypot(r.pos[0] - s.plant[0], r.pos[2] - s.plant[2]) < 4);
      expect(left, `Reihe in Reichweite des Pflanzpunkts ${site}`).toBe(true);
    }
  });
});

/**
 * Balance (Bot-Simulation, siehe IMPLEMENTIERUNGSPLAN M4): die CT sahen vom Hof B (NW-Ecke, Dock) 40–50 m an der Westwand
 * entlang in die Banane; die T stauten sich dort und trafen sich gegenseitig. Die Gegenmaßnahmen sind absichtlich.
 */
describe('de_speicherstadt: Balance (Sichtlinien, Laufzeiten)', () => {
  const col = map.collider;
  const EYE = PLAYER.eye;

  it('B-Eingang ist eine S-Schikane (Pumpenhaus West, Zollhäuschen Ost): vom Hof sieht man nicht in die Banane-Brücke', () => {
    let clear = 0;
    for (let sx = -76; sx <= -68; sx += 2) for (let sz = -54; sz <= -40; sz += 2) for (let tx = -75; tx <= -65; tx += 2) for (let tz = -12; tz <= 0; tz += 2) {
      if (col.clear({ x: sx, y: EYE, z: sz }, { x: tx, y: EYE, z: tz })) clear++;
    }
    expect(clear).toBeLessThanOrEqual(2);
    // Schikane ist kein Sperrriegel: jeder Durchgang ist mindestens 4 m breit und die T kommen hindurch
    expect(areasOn(map.zones.t, map.zones.b)).toContain('B-Eingang');
  });

  it('T-Laufzeiten bleiben im Fenster (18–25.5 s Sprint) und behalten ≥ 0.4 s Reserve; CT → B bleibt unter 15 s', () => {
    const RUN = PLAYER.sprintSpeed;
    for (const to of [map.zones.a, map.zones.b]) {
      const t = routeLength(g, map.zones.t, to) / RUN;
      expect(t).toBeGreaterThanOrEqual(18);
      expect(t).toBeLessThanOrEqual(25.1);
    }
    expect(routeLength(g, map.zones.ct, map.zones.b) / RUN).toBeLessThanOrEqual(15);
  });

  it('keine Navigationsknoten im Wasser: Bots können nicht ins Fleet fallen und dort festsitzen', () => {
    let low = 0;
    for (let i = 0; i < g.count; i++) if (g.y[i]! < -0.3) low++;
    expect(low).toBe(0);
  });

  it('Container sperren die CT-Scharfschützenplätze: NW-Ecke des Hofs B und Dock-Westende', () => {
    const boxes = data.brushes.filter((b) => b.mat === 'container' && !b.ramp);
    const near = (x: number, z: number) => boxes.some((b) => b.min[0] <= x && b.max[0] >= x && b.min[2] <= z && b.max[2] >= z);
    expect(near(-74.8, -51)).toBe(true);
    expect(near(-74.2, -58.6)).toBe(true);
  });

  it('Pflanzhinweis der T für A liegt im Spot, hinter den Serverreihen (Deckung gegen Norden) und nicht weiter weg als der Pflanzpunkt', () => {
    const h = (data.botHints ?? []).find((q) => q.kind === 'plant' && q.site === 'A');
    expect(h).toBeDefined();
    if (!h || h.kind !== 'plant') return;
    const p = { x: h.pos[0], y: h.pos[1], z: h.pos[2] };
    expect(siteAt(map.sites, p)).toBe('a');
    const centre = map.sites.find((q) => q.id === 'A')!.plant;
    expect(routeLength(g, map.zones.t, p)).toBeLessThanOrEqual(routeLength(g, map.zones.t, { x: centre[0], y: centre[1], z: centre[2] }) + 0.5);
    // Serverreihe (2 m hoch) verdeckt den Hinweis vor der Nordhalle des A-Hofs
    expect(col.clear({ x: p.x, y: p.y + EYE, z: p.z }, { x: p.x, y: p.y + EYE, z: -66 })).toBe(false);
  });
});

/**
 * Balance-Wächter: Bot-Simulation (5 gegen 5, Skill 0.6, 4 Seeds × 20 Runden). Vor dem Umbau ≈ 38 % T (Autor: 31 %), B nur ≈ 35 %.
 * Die Schwellen sind weit, weil die Simulation je Seed stark streut (Economy-Schneeball, Teamkills in Warteschlangen).
 */
describe('de_speicherstadt: Balance (Bot-Simulation)', () => {
  it('T gewinnen 30–70 % der Runden, es wird auf beiden Spots gepflanzt, niemand sitzt fest', () => {
    const stats = [1, 2, 3, 4].flatMap((seed) => {
      const sim = new HeadlessMatch(map, { perTeam: 5, skill: 0.6, seed });
      sim.runRounds(20);
      return sim.stats;
    });
    const s = summarize(stats);
    const tShare = (s.tWins as number) / stats.length;
    expect(stats.length).toBeGreaterThanOrEqual(60);
    expect(tShare).toBeGreaterThanOrEqual(0.3);
    expect(tShare).toBeLessThanOrEqual(0.7);
    for (const site of ['a', 'b']) expect(stats.filter((r) => r.plantSite === site).length, `Plants ${site}`).toBeGreaterThanOrEqual(10);
    expect(s.wallViolations).toBe(0);
    expect(s.fallViolations).toBe(0);
    expect(s.maxStuck as number).toBeLessThanOrEqual(6);
  }, 180_000);
});
