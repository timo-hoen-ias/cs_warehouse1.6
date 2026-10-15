import { describe, expect, it } from 'vitest';
import { analyzeMap, siteInfo, type BotMapInfo } from './botMap';
import {
  KNOW, approachWeights, confidence, decay, known, markDead, nearestThreat, newKnowledge, report, resetKnowledge, sighting, sitePressure,
} from './botKnowledge';
import { buildBotTestMap } from './botTestMap';
import { compileMap } from './mapcompile';

const data = buildBotTestMap();
const m = compileMap(data);
const info: BotMapInfo = analyzeMap({ nav: m.nav, collider: m.collider, sites: m.sites, spawns: m.spawns });
const P = (x: number, z: number) => ({ x, y: 0, z });

describe('Team-Wissen (Blackboard)', () => {
  it('neue Information, Rang der Quellen, ältere Meldungen werden ignoriert', () => {
    const k = newKnowledge('CT');
    expect(report(k, sighting(info, 'e1', P(3, 40), 10, 'seen'))).toBe(true);
    // gleiche Person kurz darauf nur gehört: verdrängt die Sichtung nicht
    expect(report(k, sighting(info, 'e1', P(3, 45), 10.5, 'heard'))).toBe(false);
    expect(k.enemies.get('e1')!.pos.z).toBe(40);
    // später gehört: ersetzt, aber keine „neue“ Information (< 6 s)
    report(k, sighting(info, 'e1', P(3, 30), 13, 'heard'));
    expect(k.enemies.get('e1')!.pos.z).toBe(30);
    // ältere Meldung ignoriert
    expect(report(k, sighting(info, 'e1', P(3, 60), 5, 'seen'))).toBe(false);
    // lange nichts gehört → wieder neu (Funkspruch)
    expect(report(k, sighting(info, 'e1', P(3, 30), 25, 'seen'))).toBe(true);
  });

  it('Tote werden vergessen und nicht mehr gemeldet', () => {
    const k = newKnowledge('T');
    report(k, sighting(info, 'c1', P(10, 5), 1, 'seen'));
    markDead(k, 'c1');
    expect(k.enemies.has('c1')).toBe(false);
    expect(report(k, sighting(info, 'c1', P(10, 5), 2, 'seen'))).toBe(false);
  });

  it('Zerfall: Zuverlässigkeit sinkt, alte Einträge verschwinden; Rundenstart leert alles', () => {
    const k = newKnowledge('CT');
    const s = sighting(info, 'e', P(3, 40), 0, 'seen');
    const h = sighting(info, 'f', P(40, 40), 0, 'heard');
    report(k, s);
    report(k, h);
    expect(confidence(s, 0)).toBe(1);
    expect(confidence(s, KNOW.tauSeen)).toBeCloseTo(Math.exp(-1));
    expect(confidence(h, 2)).toBeLessThan(confidence(s, 2));
    decay(k, KNOW.forgetHeard + 1);
    expect(k.enemies.has('f')).toBe(false);
    expect(k.enemies.has('e')).toBe(true);
    decay(k, KNOW.forgetSeen + 1);
    expect(k.enemies.size).toBe(0);
    report(k, s);
    k.mateDeaths.push({ pos: P(0, 0), t: 0, zone: 0 });
    resetKnowledge(k);
    expect(k.enemies.size + k.mateDeaths.length + k.dead.size).toBe(0);
  });

  it('bekannte und nächste Bedrohung', () => {
    const k = newKnowledge('CT');
    report(k, sighting(info, 'a', P(3, 40), 1, 'seen'));
    report(k, sighting(info, 'b', P(40, 50), 5, 'heard'));
    expect(known(k, 6).map((s) => s.id)).toEqual(['b', 'a']);
    expect(known(k, 20, 5).map((s) => s.id)).toEqual([]);
    expect(nearestThreat(k, P(5, 35), 6)!.id).toBe('a');
    expect(nearestThreat(k, P(5, 35), 30, 3)).toBeNull();
  });

  it('Druck auf einen Spot: Sichtungen im Spot und auf seinen Zugängen, Tote, Bombe', () => {
    const k = newKnowledge('CT');
    expect(sitePressure(k, info, 'a', 0)).toBe(0);
    report(k, sighting(info, 'e1', P(10, 18), 1, 'seen')); // im Spot A
    report(k, sighting(info, 'e2', P(3, 45), 1, 'seen')); // im Lang-Gang (Zugang zu A)
    const pa = sitePressure(k, info, 'a', 2);
    const pb = sitePressure(k, info, 'b', 2);
    expect(pa).toBeGreaterThan(1.5);
    expect(pb).toBe(0);
    k.mateDeaths.push({ pos: P(70, 18), t: 2, zone: siteInfo(info, 'b')!.zones[0]! });
    expect(sitePressure(k, info, 'b', 2)).toBeGreaterThan(0.5);
    // nach dem Fenster zählt nichts mehr
    expect(sitePressure(k, info, 'a', 40)).toBe(0);
  });

  it('Zugangszonen: Spot 1.0, letzte Zone davor 0.8; Mitte zählt für beide Spots nur halb', () => {
    const wa = approachWeights(info, 'a');
    const name = (z: number) => info.zones[z]!.name;
    const byName = new Map([...wa].map(([z, w]) => [name(z), w]));
    expect(byName.get('Spot A')).toBe(1);
    expect(byName.get('Lang')).toBe(0.8);
    expect(byName.get('Tür A')).toBe(0.8);
    // Halle liegt auf Routen zu A und B → halbes Gewicht
    expect(byName.get('Halle')).toBe(0.25);
  });
});
