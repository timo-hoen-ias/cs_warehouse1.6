import { describe, expect, it } from 'vitest';
import { MapBuilder } from '../../logic/mapkit';
import { dockRow, lampGrid, line, parcelPile, pillars, stripe, tubeRow } from './common';

const ENV = { sunDir: [0, 1, 0] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };
const mk = () => new MapBuilder({ id: 'de_c', name: 'C', description: '', bounds: { min: [-60, -5, -60], max: [60, 20, 60] }, env: ENV });

describe('Umschlag-Kartenhelfer', () => {
  it('dockRow: nummerierte Buchten im Abstand, Schilder zeigen in Blickrichtung der Buchten', () => {
    for (const [facing, axis] of [['pz', 'z'], ['nz', 'z'], ['px', 'x'], ['nx', 'x']] as const) {
      const b = mk();
      dockRow(b, axis, 10, -12, 12, facing, { step: 6, n0: 5 });
      expect(b.data.signs.map((s) => s.text), facing).toEqual(['5', '6', '7', '8', '9']);
      expect(b.data.signs.every((s) => s.facing === facing)).toBe(true);
    }
    // Rückseite liegt an der Wand (hier z = 10): Buchten mit Front nach −Z ragen nur nach −Z
    const b = mk();
    dockRow(b, 'z', 10, 0, 0, 'nz', {});
    expect(Math.max(...b.data.brushes.map((x) => x.max[2]))).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('dockRow: Position entlang der Wand und Starthöhe', () => {
    const b = mk();
    dockRow(b, 'x', 14, 4, 16, 'nx', { step: 6, y: 2 });
    const xs = b.data.signs.map((s) => s.pos[2]);
    expect(xs).toHaveLength(3);
    expect(xs[1]! - xs[0]!).toBeCloseTo(6, 3);
    expect(b.data.brushes.every((x) => x.min[1] >= 2 - 1e-9)).toBe(true);
  });

  it('line verteilt n Requisiten gleichmäßig (n = 1: Startpunkt), Samen unterscheiden sich', () => {
    const b = mk();
    line(b, 'locker', 0, 0, 0, 8, 0, 5, { rot: 0 });
    const lockers = b.data.brushes.filter((x) => x.mat === 'metal');
    expect(lockers).toHaveLength(5);
    const cx = lockers.map((x) => (x.min[0] + x.max[0]) / 2);
    expect(cx[4]! - cx[0]!).toBeCloseTo(8, 5);
    const one = mk();
    line(one, 'locker', 3, 0, 3, 9, 3, 1, {});
    expect((one.data.brushes[0]!.min[0] + one.data.brushes[0]!.max[0]) / 2).toBeCloseTo(3, 5);
  });

  it('lampGrid: nx × nz Leuchten mit Licht; tubeRow: n Röhren; pillars: ein Pfeiler je Punkt', () => {
    const b = mk();
    lampGrid(b, -6, -6, 6, 6, 3, 2, 8);
    expect(b.data.lights).toHaveLength(6);
    expect(b.data.decor.filter((d) => d.kind === 'lampHall')).toHaveLength(6);
    const c = mk();
    tubeRow(c, 0, 0, 10, 0, 4, 3, true);
    expect(c.data.lights).toHaveLength(4);
    const d = mk();
    pillars(d, [[0, 0], [5, 5], [-5, 3]], 0, 4);
    expect(d.data.brushes).toHaveLength(3);
    expect(d.data.brushes.every((x) => x.tag === 'pillar')).toBe(true);
  });

  it('stripe: Linie liegt in Längsrichtung; parcelPile ist deterministisch und erzeugt Ware', () => {
    const b = mk();
    stripe(b, 0, -10, 0, 10, 0);
    stripe(b, -10, 0, 10, 0, 0);
    const [alongZ, alongX] = b.data.decals;
    expect(alongZ!.size[1]).toBeCloseTo(20, 5);
    expect(alongX!.size[0]).toBeCloseTo(20, 5);
    const p = mk();
    const q = mk();
    parcelPile(p, 1, 0, 2, 1, 5);
    parcelPile(q, 1, 0, 2, 1, 5);
    expect(JSON.stringify(p.data)).toBe(JSON.stringify(q.data));
    expect(p.data.brushes.length).toBeGreaterThan(2);
  });
});
