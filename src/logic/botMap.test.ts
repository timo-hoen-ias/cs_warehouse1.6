import { describe, expect, it } from 'vitest';
import {
  analyzeMap, buildZones, distanceField, holdSpots, plantSpot, portalApproach, portalHoldSpots, routesTo, siteEntrances, siteInfo,
  spreadSpots, threatPoints, zoneAt, type BotMapInfo,
} from './botMap';
import { buildBotTestMap } from './botTestMap';
import { compileMap } from './mapcompile';
import { nearestNode } from './nav';
import { loadMapData } from '../maps';
import type { MapData } from './mapkit';

function infoFor(data: MapData): BotMapInfo {
  const m = compileMap(data);
  return analyzeMap({ nav: m.nav, collider: m.collider, sites: m.sites, spawns: m.spawns, hints: data.botHints });
}

const zoneName = (info: BotMapInfo, z: number): string => info.zones[z]!.name;

describe('Karten-Analyse – Testkarte', () => {
  const info = infoFor(buildBotTestMap());

  it('Zonen = Callouts, Portale mit Richtung von „from“ nach „to“', () => {
    expect(info.zones.map((z) => z.name)).toContain('Lang');
    const lang = info.zones.find((z) => z.name === 'Lang')!.id;
    const spotA = info.zones.find((z) => z.name === 'Spot A')!.id;
    const p = info.portals.find((q) => q.from === lang && q.to === spotA)!;
    expect(p).toBeDefined();
    // Lang liegt südlich (z groß) von Spot A → Durchgang zeigt nach −z
    expect(p.dir.z).toBeLessThan(-0.7);
    expect(p.width).toBeGreaterThanOrEqual(4);
    expect(zoneAt(info, p.pos)).toBe(spotA);
  });

  it('ohne Callouts: automatische Zonen, jeder Knoten hat eine Zone', () => {
    const m = compileMap(buildBotTestMap({ areas: false }));
    const { zoneOf, names } = buildZones(m.nav);
    expect(names.length).toBeGreaterThan(5);
    expect([...zoneOf].every((z) => z >= 0)).toBe(true);
    const auto = analyzeMap({ nav: m.nav, collider: m.collider, sites: m.sites, spawns: m.spawns });
    expect(routesTo(auto, 'T', 'a').length).toBeGreaterThanOrEqual(1);
    expect(routesTo(auto, 'T', 'b').length).toBeGreaterThanOrEqual(1);
  });

  it('Distanzfelder: 0 am Spawn, wachsen mit dem Weg, CT sind schneller an den Spots', () => {
    const t = nearestNode(info.nav, 40, 0, 74, 4); // T-Spawnpunkt
    expect(info.dist.T[t]).toBe(0);
    const a = siteInfo(info, 'a')!.plantNode;
    expect(info.dist.T[a]!).toBeGreaterThan(60);
    expect(info.dist.CT[a]!).toBeLessThan(info.dist.T[a]! - 20);
    // Einzelner Startknoten: direkter Nachbar 1 m, diagonal √2, weit weg ≈ Luftlinie
    const f = distanceField(info.nav, [t]);
    const x = info.nav.x[t]!, z = info.nav.z[t]!;
    expect(f[nearestNode(info.nav, x + 1, 0, z, 0.2)]!).toBeCloseTo(1, 3);
    expect(f[nearestNode(info.nav, x + 1, 0, z + 1, 0.2)]!).toBeCloseTo(Math.SQRT2, 3);
    expect(f[nearestNode(info.nav, x + 20, 0, z, 0.2)]!).toBeCloseTo(20, 1);
  });

  it('Spots: Zonen, Eingänge, Angriffs- und Verteidigungsseite', () => {
    const a = siteInfo(info, 'a')!;
    expect(a.zones.map((z) => zoneName(info, z))).toEqual(['Spot A']);
    const from = a.entrances.map((p) => zoneName(info, info.portals[p]!.from)).sort();
    expect(from).toEqual(['CT-Spawn', 'Lang', 'Tür A']);
    const attack = siteEntrances(info, a, 'attack').map((p) => zoneName(info, info.portals[p]!.from)).sort();
    expect(attack).toEqual(['Lang', 'Tür A']);
    expect(siteEntrances(info, a, 'defend').map((p) => zoneName(info, info.portals[p]!.from))).toContain('CT-Spawn');
  });

  it('verschiedene Routen je Spot (Lang und Mitte), nie durch den CT-Spawn', () => {
    const toA = routesTo(info, 'T', 'a');
    expect(toA.length).toBeGreaterThanOrEqual(2);
    const labels = toA.map((r) => r.label);
    expect(labels.some((l) => l.includes('Lang'))).toBe(true);
    expect(labels.some((l) => l.includes('Mitte') && l.includes('Tür A'))).toBe(true);
    for (const r of toA) {
      expect(r.label).not.toContain('CT-Spawn');
      expect(r.via.length).toBe(r.portals.length);
      expect(siteInfo(info, 'a')!.entrances).toContain(r.entry);
      // Bereitstellung außerhalb des Spots, nicht weit vor dem Eingang
      expect(info.zones[zoneAt(info, r.staging)]!.site).toBeNull();
      expect(Math.hypot(r.staging.x - info.portals[r.entry]!.pos.x, r.staging.z - info.portals[r.entry]!.pos.z)).toBeLessThan(26);
    }
    expect(new Set(toA.map((r) => r.entry)).size).toBe(toA.length);
  });

  it('umkämpfter Punkt liegt auf der Route, Kontrollpunkt auf der T-Seite davor', () => {
    const mid = routesTo(info, 'T', 'a').find((r) => r.label.includes('Mitte'))!;
    expect(mid.contested).not.toBeNull();
    const c = nearestNode(info.nav, mid.contested!.x, mid.contested!.y, mid.contested!.z);
    expect(info.dist.T[c]! + 6.2).toBeGreaterThanOrEqual(info.dist.CT[c]!);
    const k = nearestNode(info.nav, mid.control!.x, mid.control!.y, mid.control!.z);
    expect(info.dist.T[k]!).toBeLessThan(info.dist.T[c]!);
  });

  it('Halte-Positionen: Sicht auf den Eingang, nicht auf der Anlaufseite, Abstand untereinander', () => {
    const a = siteInfo(info, 'a')!;
    const lang = siteEntrances(info, a, 'attack').find((p) => zoneName(info, info.portals[p]!.from) === 'Lang')!;
    const spots = portalHoldSpots(info, lang, 'CT');
    expect(spots.length).toBeGreaterThanOrEqual(3);
    const portal = info.portals[lang]!;
    const from = portalApproach(info, lang);
    for (const s of spots) {
      expect(info.col.clear({ x: s.pos.x, y: s.pos.y + 1.6, z: s.pos.z }, { x: portal.pos.x, y: portal.pos.y + 1.2, z: portal.pos.z })).toBe(true);
      expect(Math.hypot(s.pos.x - from.x, s.pos.z - from.z)).toBeGreaterThan(Math.hypot(portal.pos.x - from.x, portal.pos.z - from.z));
      expect(s.pos.z).toBeLessThan(25.5); // nicht im Lang-Gang
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      expect(Math.hypot(spots[i]!.pos.x - spots[j]!.pos.x, spots[i]!.pos.z - spots[j]!.pos.z)).toBeGreaterThanOrEqual(3);
    }
    expect(spots.map((s) => s.score)).toEqual([...spots.map((s) => s.score)].sort((p, q) => q - p));
    // Cache: identische Anfrage → identisches Objekt
    expect(portalHoldSpots(info, lang, 'CT')).toBe(spots);
  });

  it('Karten-Hinweis „hold“ zieht eine Position nach vorn; „plant“ setzt den Pflanzplatz', () => {
    const a = siteInfo(info, 'a')!;
    const lang = siteEntrances(info, a, 'attack').find((p) => zoneName(info, info.portals[p]!.from) === 'Lang')!;
    const plain = portalHoldSpots(info, lang, 'CT');
    const pick = plain[3]!.pos;
    const data = buildBotTestMap();
    data.botHints = [{ kind: 'hold', pos: [pick.x, pick.y, pick.z], team: 'CT' }, { kind: 'plant', pos: [12.5, 0, 18.5], site: 'A' }];
    const hinted = infoFor(data);
    const spots = portalHoldSpots(hinted, lang, 'CT');
    expect(Math.hypot(spots[0]!.pos.x - pick.x, spots[0]!.pos.z - pick.z)).toBeLessThan(1.6);
    expect(spots[0]!.score).toBeGreaterThan(plain[0]!.score);
    const ps = plantSpot(hinted, siteInfo(hinted, 'a')!, () => 0);
    expect(Math.hypot(ps.x - 12.5, ps.z - 18.5)).toBeLessThan(1);
    expect(plantSpot(info, a, () => 0)).toEqual(a.plant);
  });

  it('Halte-Positionen ohne Anlaufpunkt nutzen das Distanzfeld (eigene Seite)', () => {
    const r = routesTo(info, 'T', 'a').find((q) => q.contested)!;
    const spots = holdSpots(info, r.contested!, 'CT', { min: 4, max: 25 });
    const c = nearestNode(info.nav, r.contested!.x, r.contested!.y, r.contested!.z);
    for (const s of spots) expect(info.dist.T[s.node]!).toBeGreaterThanOrEqual(info.dist.T[c]! + 2);
  });

  it('Stehplätze verteilen Gruppen (Abstand, gleiche Ebene, nicht näher am Spot)', () => {
    const r = routesTo(info, 'T', 'a')[0]!;
    const plant = siteInfo(info, 'a')!.plant;
    const spots = spreadSpots(info, r.staging, 4, { awayFrom: plant });
    expect(spots).toHaveLength(4);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThanOrEqual(2.2);
    const base = Math.hypot(spots[0]!.x - plant.x, spots[0]!.z - plant.z);
    for (const s of spots) expect(Math.hypot(s.x - plant.x, s.z - plant.z)).toBeGreaterThanOrEqual(base - 1);
  });

  it('Gefahrenpunkte: im Spot zielen T auf die Lieblingsplätze der CT vor', () => {
    const spotA = info.zones.find((z) => z.name === 'Spot A')!.id;
    const pts = threatPoints(info, spotA, 'T');
    const a = siteInfo(info, 'a')!;
    const ctSpots = siteEntrances(info, a, 'attack').flatMap((p) => portalHoldSpots(info, p, 'CT', { limit: 3 }).slice(0, 2).map((s) => s.pos));
    expect(ctSpots.length).toBeGreaterThan(0);
    for (const s of ctSpots) expect(pts).toContainEqual(s);
    // In der Mitte: Gefahr kommt aus der Halle (CT-Seite)
    const mitte = info.zones.find((z) => z.name === 'Mitte')!.id;
    const halle = info.zones.find((z) => z.name === 'Halle')!.id;
    const mp = threatPoints(info, mitte, 'T');
    expect(mp.some((p) => zoneAt(info, p) === mitte && info.portals.some((q) => q.from === halle && q.to === mitte && q.pos === p))).toBe(true);
  });
});

describe('Karten-Analyse – de_lagerstaub', () => {
  const info = infoFor(loadMapData('de_lagerstaub'));

  it('T-Routen zu A über Kurz A und Lang A, zu B über Tunnel und Mitte/B-Gang', () => {
    const entryZones = (site: 'a' | 'b') => new Set(routesTo(info, 'T', site).map((r) => zoneName(info, info.portals[r.entry]!.from)));
    expect(entryZones('a')).toEqual(new Set(['Kurz A', 'A-Rampe']));
    expect(entryZones('b')).toEqual(new Set(['Oberer Tunnel', 'B-Gang']));
    for (const r of info.routes.filter((q) => q.team === 'T')) expect(r.label).not.toContain('CT-Spawn');
  });

  it('jeder Angriffseingang hat CT-Halte-Positionen mit Deckung', () => {
    for (const s of info.sites) {
      for (const pid of siteEntrances(info, s, 'attack')) {
        const spots = portalHoldSpots(info, pid, 'CT');
        expect(spots.length).toBeGreaterThanOrEqual(3);
        expect(spots.slice(0, 3).some((h) => h.cover)).toBe(true);
      }
    }
  });

  it('CT-Halte-Positionen meiden Sicht auf weitere Eingänge (nicht von der Seite erwischt werden)', () => {
    const sees = (h: { pos: { x: number; y: number; z: number } }, p: { x: number; y: number; z: number }): boolean =>
      info.col.clear({ x: h.pos.x, y: h.pos.y + 1.6, z: h.pos.z }, { x: p.x, y: p.y + 1.2, z: p.z });
    let plain = 0;
    let guarded = 0;
    for (const s of info.sites) {
      const entries = siteEntrances(info, s, 'attack');
      for (const pid of entries) {
        const others = entries.filter((q) => q !== pid).map((q) => info.portals[q]!.pos);
        if (!others.length) continue;
        const exposedCount = (list: { pos: { x: number; y: number; z: number } }[]): number => list.slice(0, 3).filter((h) => others.some((o) => sees(h, o))).length;
        plain += exposedCount(portalHoldSpots(info, pid, 'CT'));
        guarded += exposedCount(portalHoldSpots(info, pid, 'CT', { exposed: others }));
      }
    }
    expect(guarded).toBeLessThan(plain);
  });
});
