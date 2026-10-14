import { describe, expect, it } from 'vitest';
import { MapBuilder } from './mapkit';
import { CellPlan, type CellKind } from './mapplan';

const ENV = { sunDir: [0, 1, 0] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };

describe('CellPlan', () => {
  it('malt Rechtecke auf 2-m-Zellen und liest sie zurück', () => {
    const p = new CellPlan(-10, -10, 10, 10, 2, '#');
    expect(p.cols).toBe(10);
    expect(p.rows).toBe(10);
    p.rect('.', -4, -4, 4, 4).rect('h', 0, 0, 2, 2);
    expect(p.at(-3, -3)).toBe('.');
    expect(p.at(1, 1)).toBe('h');
    expect(p.at(9, 9)).toBe('#');
    expect(p.get(-1, 0)).toBe('#');
    expect(p.ascii()[5]).toBe('###..h.###');
  });

  it('merged: Rechtecke decken genau die Zellen ab (keine Überlappung)', () => {
    const p = new CellPlan(0, 0, 20, 20, 2, '#');
    p.rect('.', 0, 0, 12, 6).rect('.', 4, 6, 8, 14).rect('.', 14, 14, 20, 20);
    const rects = p.merged('.');
    const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    expect(area).toBe(12 * 6 + 4 * 8 + 6 * 6);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!, b = rects[j]!;
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
      expect(overlap).toBe(false);
    }
    expect(p.merged('#').length).toBeGreaterThan(0);
  });

  it('build: Böden, Gebäude, Dächer, Stürze, Fensterwand, Akustik, Fassaden', () => {
    const p = new CellPlan(0, 0, 20, 12, 2, '#');
    p.rect('.', 2, 2, 10, 10).rect('h', 10, 2, 18, 10).rect('w', 10, 0, 12, 2);
    const legend: Record<string, CellKind> = {
      '#': { building: { h: 8, mat: 'brick' } },
      w: { building: { h: 8, mat: 'brick' }, window: { sill: 1, lintel: 2 } },
      '.': { floor: 0, mat: 'asphalt', room: 'outdoor' },
      h: { floor: 0.5, mat: 'concrete', roof: 5, room: 'hall' },
    };
    const b = new MapBuilder({ id: 'de_p', name: 'P', description: '', bounds: { min: [0, -5, 0], max: [20, 10, 12] }, env: ENV });
    p.build(b, legend, { floorBottom: -2, lintelTop: 8, facades: { '@#': { mat: 'plaster', plinth: { h: 1, mat: 'concrete' }, windows: { y: 2, h: 1, w: 1.5, every: 3 } }, h: { mat: 'corrugated' } } });
    const br = b.data.brushes;
    const floors = br.filter((x) => x.tag === 'floor');
    expect(floors.some((f) => f.max[1] === 0)).toBe(true);
    expect(floors.some((f) => f.max[1] === 0.5)).toBe(true);
    expect(br.some((x) => x.tag === 'roof' && x.min[1] === 5)).toBe(true);
    // Sturz zwischen Halle (Dach 5) und Hof: Wand von 5 bis 8 an x = 10 auf der Hallenseite
    const lintel = br.find((x) => x.tag === 'wall' && x.min[1] === 5 && x.max[1] === 8);
    expect(lintel).toBeDefined();
    expect(lintel!.min[0]).toBeGreaterThanOrEqual(10 - 1e-9);
    // Fensterwand: Brüstung bis 1 und Sturz ab 2
    expect(br.some((x) => x.max[1] === 1 && x.min[2] === 0 && x.min[0] === 10)).toBe(true);
    expect(br.some((x) => x.min[1] === 2 && x.min[2] === 0 && x.min[0] === 10)).toBe(true);
    // Akustik-Zonen
    expect(b.data.acoustics.zones.map((z) => z.kind).sort()).toEqual(['hall', 'outdoor']);
    // Fassaden liegen auf der begehbaren Seite (Hof x 2..10 → Verkleidung bei x ≥ 2 an der Westwand)
    const clad = br.filter((x) => x.tag === 'facade' && x.mat === 'plaster');
    expect(clad.length).toBeGreaterThan(0);
    const west = clad.find((x) => x.max[0] - x.min[0] < 0.1 && x.min[0] >= 2 - 1e-9 && x.max[0] <= 2.1);
    expect(west).toBeDefined();
    expect(br.some((x) => x.mat === 'window' && x.uvFit)).toBe(true);
    expect(br.some((x) => x.tag === 'facade' && x.mat === 'corrugated')).toBe(true);
    // Verkleidung kollidiert nicht
    expect(clad.every((x) => x.collide === 'none')).toBe(true);
  });
});
