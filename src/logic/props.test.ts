import { describe, expect, it } from 'vitest';
import { generateLagerDaten } from './demo';
import { computeSolids, suggestZones } from './level';
import { pointFree } from './move';
import { PROP_MIN_DIST, PROP_ZONE_CLEAR, generateProps, propSolid, solidsWithProps } from './props';

const lager = generateLagerDaten(8, 1, 'mix');
const zones = suggestZones(lager);

describe('propSolid', () => {
  it('Box um den Fußpunkt; Drehung tauscht Breite/Tiefe', () => {
    const s = propSolid({ kind: 'pallet', pos: [10, 0, 5], size: [1.2, 1.1, 0.8], rot: 0 });
    expect(s).toMatchObject({ kind: 'prop', minX: 9.4, maxX: 10.6, minY: 0, maxY: 1.1, minZ: 4.6, maxZ: 5.4 });
    const r = propSolid({ kind: 'pallet', pos: [10, 0, 5], size: [1.2, 1.1, 0.8], rot: 1 });
    expect(r.maxX - r.minX).toBeCloseTo(0.8);
    expect(r.maxZ - r.minZ).toBeCloseTo(1.2);
  });
});

describe('generateProps', () => {
  const props = generateProps(lager, zones, 15, 7);

  it('ist deterministisch und liefert die gewünschte Anzahl', () => {
    expect(props.length).toBe(15);
    expect(generateProps(lager, zones, 15, 7)).toEqual(props);
    expect(generateProps(lager, zones, 15, 8)).not.toEqual(props);
  });

  it('kollidiert nicht mit Regalen/Wänden und blockiert keine Zonen', () => {
    const base = computeSolids(lager);
    for (const p of props) {
      expect(pointFree(p.pos[0], p.pos[2], base, 0.6)).toBe(true);
      for (const z of [zones.t, zones.ct, zones.a, zones.b]) {
        expect(Math.hypot(z[0] - p.pos[0], z[2] - p.pos[2])).toBeGreaterThanOrEqual(PROP_ZONE_CLEAR);
      }
    }
  });

  it('hält Abstand untereinander', () => {
    for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) {
      const a = props[i]!;
      const b = props[j]!;
      expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2])).toBeGreaterThanOrEqual(PROP_MIN_DIST);
    }
  });

  it('solidsWithProps hängt Prop-Boxen an', () => {
    const all = solidsWithProps(lager, props);
    expect(all.filter((s) => s.kind === 'prop')).toHaveLength(props.length);
    expect(all.filter((s) => s.kind === 'wall')).toHaveLength(4);
  });
});

describe('suggestZones (CS-Dramaturgie)', () => {
  it('T und CT an gegenüberliegenden Stirnseiten, Spots an den Flanken dazwischen', () => {
    expect(zones.t[2]).toBeLessThan(zones.ct[2]);
    expect(zones.a[0]).toBeLessThan(zones.b[0]);
    for (const s of [zones.a, zones.b]) {
      expect(s[2]).toBeGreaterThan(zones.t[2]);
      expect(s[2]).toBeLessThan(zones.ct[2]);
    }
    expect(Math.hypot(zones.a[0] - zones.b[0], zones.a[2] - zones.b[2])).toBeGreaterThan(15);
  });
});
