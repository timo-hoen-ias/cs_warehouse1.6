import { describe, expect, it } from 'vitest';
import { analyzeMap, routesTo, siteInfo, type BotMapInfo } from './botMap';
import { newKnowledge, report, sighting } from './botKnowledge';
import {
  assignTGroups, chooseExecuteSite, ctSetup, ctSlots, pickTPlan, RETAKE_PATH, retakePlan, retakeStaging, routeFrom, segmentPointDist, viaBetween, type TPlanKind,
} from './botStrategy';
import { buildBotTestMap } from './botTestMap';
import { compileMap } from './mapcompile';
import { mulberry32 } from './rng';
import { nearestNode } from './nav';
import { loadMapData } from '../maps';

const m = compileMap(buildBotTestMap());
const info: BotMapInfo = analyzeMap({ nav: m.nav, collider: m.collider, sites: m.sites, spawns: m.spawns });
const name = (z: number) => info.zones[z]!.name;

describe('T-Plan je Runde', () => {
  it('Eco-Kasse → meist Eco; Vollkauf → alle Planarten; letzter Plan seltener', () => {
    const rnd = mulberry32(5);
    const eco = Array.from({ length: 200 }, () => pickTPlan(info, 'eco', 5, rnd).kind);
    expect(eco.filter((k) => k === 'eco').length).toBeGreaterThan(140);
    const full = new Set<TPlanKind>(Array.from({ length: 300 }, () => pickTPlan(info, 'full', 5, rnd).kind));
    expect(full).toEqual(new Set(['default', 'split', 'rush', 'fake']));
    const again = Array.from({ length: 400 }, () => pickTPlan(info, 'full', 5, rnd, 'default').kind).filter((k) => k === 'default').length;
    const fresh = Array.from({ length: 400 }, () => pickTPlan(info, 'full', 5, rnd).kind).filter((k) => k === 'default').length;
    expect(again).toBeLessThan(fresh);
  });

  it('wenige Spieler: kein Split/Fake; Zeitpunkte passen zur Planart', () => {
    const rnd = mulberry32(9);
    for (let i = 0; i < 100; i++) {
      const p = pickTPlan(info, 'full', 2, rnd);
      expect(['rush', 'default']).toContain(p.kind);
      if (p.kind === 'rush') expect(p.executeAt).toBe(0);
      else expect(p.executeAt).toBeGreaterThanOrEqual(40);
    }
    const f = Array.from({ length: 200 }, () => pickTPlan(info, 'full', 5, rnd)).find((p) => p.kind === 'fake')!;
    expect(f.fakeSite).not.toBeNull();
    expect(f.fakeSite).not.toBe(f.site);
  });
});

describe('T-Gruppen', () => {
  const ids = ['t0', 't1', 't2', 't3', 't4'];
  it('Split: zwei Gruppen über verschiedene Eingänge zum selben Spot, Träger nicht vorn', () => {
    const { groups, roles } = assignTGroups(info, { kind: 'split', site: 'a', fakeSite: null, executeAt: 30 }, ids, 't0', mulberry32(1));
    expect(groups).toHaveLength(2);
    expect(groups[0]!.route.site).toBe('a');
    expect(groups[1]!.route.site).toBe('a');
    expect(groups[0]!.route.entry).not.toBe(groups[1]!.route.entry);
    expect(groups.flatMap((g) => g.members).sort()).toEqual([...ids].sort());
    const carrierGroup = groups.find((g) => g.members.includes('t0'))!;
    expect(carrierGroup.members[0]).not.toBe('t0');
    expect(roles.get('t0')).toBe('support');
    expect([...roles.values()]).toContain('entry');
  });

  it('Default: über verschiedene Kontrollpunkte verteilt, Träger auf einer Route zum Plan-Spot', () => {
    const { groups } = assignTGroups(info, { kind: 'default', site: 'b', fakeSite: null, executeAt: 50 }, ids, 't2', mulberry32(2));
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.find((g) => g.members.includes('t2'))!.route.site).toBe('b');
    expect(new Set(groups.map((g) => g.route.site)).size).toBe(2);
  });

  it('Fake: Hauptgruppe zum Fake-Spot, ein Lurker zum echten Spot', () => {
    const { groups, roles } = assignTGroups(info, { kind: 'fake', site: 'a', fakeSite: 'b', executeAt: 35 }, ids, 't0', mulberry32(3));
    expect(groups[0]!.route.site).toBe('b');
    const lurker = [...roles].find(([, r]) => r === 'lurker')![0];
    expect(lurker).not.toBe('t0');
    expect(groups.find((g) => g.members.includes(lurker))!.route.site).toBe('a');
  });

  it('Rush/Eco: eine Gruppe', () => {
    expect(assignTGroups(info, { kind: 'rush', site: 'a', fakeSite: null, executeAt: 0 }, ids, null, mulberry32(4)).groups).toHaveLength(1);
    expect(assignTGroups(info, { kind: 'eco', site: 'b', fakeSite: null, executeAt: 60 }, ids, null, mulberry32(4)).groups[0]!.members).toHaveLength(5);
  });
});

describe('CT-Aufstellung', () => {
  it('Slots: jeder Angriffseingang + vorgeschobene Punkte', () => {
    const slots = ctSlots(info);
    expect(slots.filter((s) => s.kind === 'site' && s.site === 'a')).toHaveLength(2);
    expect(slots.filter((s) => s.kind === 'site' && s.site === 'b')).toHaveLength(2);
    expect(slots.some((s) => s.kind === 'forward')).toBe(true);
    for (const s of slots) expect(s.spots.length).toBeGreaterThan(0);
  });

  it('5 Spieler: beide Spots besetzt, je Spot ein Anker, verschiedene Positionen', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const a = ctSetup(info, ['c0', 'c1', 'c2', 'c3', 'c4'], mulberry32(seed));
      expect(a.size).toBe(5);
      const sites = [...a.values()].map((x) => x.site);
      expect(sites).toContain('a');
      expect(sites).toContain('b');
      const anchors = [...a.values()].filter((x) => x.anchor);
      expect(new Set(anchors.map((x) => x.site))).toEqual(new Set(['a', 'b']));
      const spots = [...a.values()].map((x) => x.spot.pos);
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThanOrEqual(2.9);
    }
  });

  it('2 Spieler: 1-1; Scharfschütze bekommt die längste Sicht', () => {
    const a = ctSetup(info, ['c0', 'c1'], mulberry32(7), 'c1');
    expect(new Set([...a.values()].map((x) => x.site))).toEqual(new Set(['a', 'b']));
    const awp = a.get('c1')!;
    const maxDist = Math.max(...[...ctSlots(info)].flatMap((s) => s.spots.map((x) => x.dist)));
    expect(awp.spot.dist).toBeGreaterThan(maxDist * 0.6);
  });
});

describe('Spotwahl, Routen ab Position, Retake', () => {
  it('Ausführen dort, wo weniger CT bekannt sind', () => {
    const k = newKnowledge('T');
    expect(chooseExecuteSite(info, k, 10, 'a')).toBe('a');
    report(k, sighting(info, 'c1', { x: 10, y: 0, z: 18 }, 8, 'seen'));
    report(k, sighting(info, 'c2', { x: 14, y: 0, z: 15 }, 9, 'seen'));
    expect(chooseExecuteSite(info, k, 10, 'a')).toBe('b');
    expect(chooseExecuteSite(info, k, 10, 'b')).toBe('b');
  });

  it('Route ab der aktuellen Position und restliche Wegpunkte', () => {
    const inLang = { x: 3, y: 0, z: 50 };
    const r = routeFrom(info, 'a', inLang)!;
    expect(r.label).toContain('Lang');
    const via = viaBetween(info, r, inLang);
    expect(via).toHaveLength(1); // nur noch das Portal Lang → Spot A
    const mid = routesTo(info, 'T', 'a').find((q) => q.label.includes('Mitte'))!;
    expect(viaBetween(info, mid, info.spawn.T)).toHaveLength(mid.via.length);
    expect(viaBetween(info, mid, info.spawn.T, mid.staging).length).toBeLessThan(mid.via.length);
  });

  it('Retake: mehrere CT kommen über verschiedene Eingänge, Sammelpunkt vor dem Eingang', () => {
    const plan = retakePlan(info, 'a', [
      { id: 'c1', pos: { x: 40, y: 0, z: 5 } },
      { id: 'c2', pos: { x: 30, y: 0, z: 18 } },
      { id: 'c3', pos: { x: 3, y: 0, z: 40 } },
    ]);
    expect(plan.size).toBe(3);
    expect(new Set([...plan.values()].map((p) => p.entry)).size).toBeGreaterThanOrEqual(2);
    const a = siteInfo(info, 'a')!;
    for (const p of plan.values()) {
      expect(a.entrances).toContain(p.entry);
      expect(info.zones[info.zoneOf[info.portals[p.entry]!.fromNode]!]!.site).toBeNull();
      expect(Math.hypot(p.staging.x - info.portals[p.entry]!.pos.x, p.staging.z - info.portals[p.entry]!.pos.z)).toBeLessThan(14);
    }
    expect(name(info.portals[plan.get('c3')!.entry]!.from)).toBe('Lang');
  });

  it('Retake: wer schon im Spot ist, bleibt versteckt dort; Sammelwege führen nicht quer an der Bombe vorbei', () => {
    const a = siteInfo(info, 'a')!;
    const inSite = { x: a.plant.x + 1, y: a.plant.y, z: a.plant.z + 1 };
    const plan = retakePlan(info, 'a', [{ id: 'c1', pos: inSite }, { id: 'c2', pos: info.spawn.CT }], a.plant);
    expect(Math.hypot(plan.get('c1')!.staging.x - inSite.x, plan.get('c1')!.staging.z - inSite.z)).toBeLessThan(3.5);
    const c2 = plan.get('c2')!;
    const clearOnes = a.entrances.filter((pid) => segmentPointDist(info.spawn.CT, retakeStaging(info, a, pid), a.plant) >= RETAKE_PATH.bombClear);
    if (clearOnes.length) expect(segmentPointDist(info.spawn.CT, c2.staging, a.plant)).toBeGreaterThanOrEqual(RETAKE_PATH.bombClear);
    // Strecken-Abstand
    expect(segmentPointDist({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 5, y: 0, z: 3 })).toBeCloseTo(3, 5);
    expect(segmentPointDist({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: -4, y: 0, z: 3 })).toBeCloseTo(5, 5);
  });

  it('Retake-Sammelpunkt liegt außen vor dem Eingang, ohne Sicht in den Spot (nicht durch die Tür abschießbar)', () => {
    let n = 0;
    let hidden = 0;
    for (const site of info.sites) {
      for (const pid of site.entrances) {
        const st = retakeStaging(info, site, pid);
        const p = info.portals[pid]!;
        const eye = { x: st.x, y: st.y + 1.6, z: st.z };
        expect(Math.hypot(st.x - p.pos.x, st.z - p.pos.z)).toBeLessThan(14.5);
        expect((st.x - p.pos.x) * p.dir.x + (st.z - p.pos.z) * p.dir.z).toBeLessThan(0);
        expect(site.zones).not.toContain(info.zoneOf[nearestNode(info.nav, st.x, st.y, st.z, 2)]!);
        expect(info.col.clear(eye, { x: site.plant.x, y: site.plant.y + 1.2, z: site.plant.z })).toBe(false);
        n++;
        // hinter der Ecke: auch der Bereich direkt hinter dem Eingang ist nicht einsehbar (lange gerade Gänge haben keine solche Ecke)
        if (!info.col.clear(eye, { x: p.pos.x + p.dir.x * 4, y: p.pos.y + 1.2, z: p.pos.z + p.dir.z * 4 })) hidden++;
      }
    }
    expect(hidden).toBeGreaterThanOrEqual(Math.ceil(n * 0.6));
  });
});

describe('CT-Aufstellung de_lagerstaub', () => {
  const l = compileMap(loadMapData('de_lagerstaub'));
  const li = analyzeMap({ nav: l.nav, collider: l.collider, sites: l.sites, spawns: l.spawns });
  it('5 CT verteilen sich auf A, B (und Mitte), Halte-Positionen im bzw. am Spot', () => {
    const a = ctSetup(li, ['c0', 'c1', 'c2', 'c3', 'c4'], mulberry32(11));
    const by = new Map<string, number>();
    for (const x of a.values()) by.set(String(x.site), (by.get(String(x.site)) ?? 0) + 1);
    expect(by.get('a')).toBeGreaterThanOrEqual(1);
    expect(by.get('b')).toBeGreaterThanOrEqual(1);
  });
});
