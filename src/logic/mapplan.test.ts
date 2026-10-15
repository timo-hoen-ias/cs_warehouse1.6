import { describe, expect, it } from 'vitest';
import { MapBuilder } from './mapkit';
import { CellPlan, type CellKind } from './mapplan';
import { colliderFromMap } from './mapcompile';
import { PLAYER, stepPlayer, type PlayerMotion } from './move';

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
  it('bottom: Schacht reicht tiefer als die Platte; bare: keine Verkleidung; roofWalk: begehbares Dach', () => {
    const p = new CellPlan(0, 0, 12, 8, 2, '#');
    p.rect('h', 2, 2, 6, 6).rect('s', 6, 2, 8, 6).rect('q', 8, 2, 10, 6);
    const legend: Record<string, CellKind> = {
      '#': { building: { h: 8, mat: 'brick' } },
      q: { building: { h: 8, mat: 'brick' }, bare: true },
      h: { floor: 0, mat: 'concrete', roof: 4, roofTop: 4.4, roofWalk: true },
      s: { floor: -5, bottom: -8, mat: 'concreteDark', roof: 4 },
    };
    const b = new MapBuilder({ id: 'de_p', name: 'P', description: '', bounds: { min: [0, -9, 0], max: [12, 10, 8] }, env: ENV });
    p.build(b, legend, { floorBottom: -0.3, facades: { h: { mat: 'plaster' }, s: { mat: 'plaster' } } });
    const br = b.data.brushes;
    // Platte dünn (−0.3 … 0), Schacht bis −8
    expect(br.some((x) => x.tag === 'floor' && x.min[1] === -0.3 && x.max[1] === 0)).toBe(true);
    expect(br.some((x) => x.tag === 'floor' && x.min[1] === -8 && x.max[1] === -5)).toBe(true);
    // begehbares Dach: Tag floor statt roof
    const roof = br.find((x) => x.min[1] === 4 && x.max[1] === 4.4)!;
    expect(roof.tag).toBe('floor');
    expect(roof.noNav).toBeUndefined();
    // Verkleidung an der Schachtwand (Gebäude '#'), aber nicht an der Tunnelmund-Zelle 'q'
    const clad = br.filter((x) => x.tag === 'facade');
    expect(clad.some((x) => x.min[0] < 2.2 && x.max[0] > 2)).toBe(true);
    expect(clad.some((x) => x.min[0] >= 8 - 1e-9 && x.max[0] <= 8.2)).toBe(false);
    // Kollision: im Schacht ist man tief, auf der Halle oben, auf dem Dach höher
    const col = colliderFromMap(b.data);
    expect(col.groundHeight(7, 4, 0.5, PLAYER.radius, PLAYER.step)).toBeCloseTo(-5, 2);
    expect(col.groundHeight(4, 4, 0.5, PLAYER.radius, PLAYER.step)).toBeCloseTo(0, 2);
    expect(col.groundHeight(4, 4, 4.6, PLAYER.radius, PLAYER.step)).toBeCloseTo(4.4, 2);
  });

  it('zwei Grundrisse übereinander: Untergeschoss unter der Halle, Schacht verbindet beide', () => {
    const lower = new CellPlan(0, 0, 28, 8, 2, '#');
    lower.rect('B', 2, 2, 12, 6).rect('_', 12, 2, 24, 6); // Schacht bleibt im Untergeschoss leer
    const upper = new CellPlan(0, 0, 28, 8, 2, '#');
    upper.rect('A', 2, 2, 12, 6).rect('v', 12, 2, 24, 6);
    const b = new MapBuilder({ id: 'de_p', name: 'P', description: '', bounds: { min: [0, -9, 0], max: [28, 20, 8] }, env: ENV });
    lower.build(b, { '#': { building: { h: -0.3, mat: 'concrete' } }, _: {}, B: { floor: -5, mat: 'concreteDark', roof: -0.8, room: 'hall' } }, { floorBottom: -8, lintelTop: -0.3 });
    upper.build(b, { '#': { building: { h: 20, mat: 'brick' } }, A: { floor: 0, mat: 'concrete', roof: 12, room: 'hall' }, v: { floor: -5, bottom: -8, mat: 'concreteDark', roof: 12 } }, { floorBottom: -0.3, lintelTop: 12 });
    b.stairs(12, 2, 20, 6, -5, 0, 'nx', 'concrete');
    const col = colliderFromMap(b.data);
    // Untergeschoss und Halle liegen übereinander, Kopffreiheit im Keller
    expect(col.groundHeight(6, 4, -4.5, PLAYER.radius, PLAYER.step)).toBeCloseTo(-5, 2);
    expect(col.groundHeight(6, 4, 0.5, PLAYER.radius, PLAYER.step)).toBeCloseTo(0, 2);
    expect(col.blockedAt(6, 4, -5, PLAYER.radius, PLAYER.height, PLAYER.step)).toBe(false);
    // Treppe im Schacht führt vom Keller in die Halle (keine Decke/Wand im Weg)
    let m: PlayerMotion = { x: 22, y: -5 + PLAYER.eye, z: 4, vy: 0, grounded: true };
    for (let i = 0; i < 240; i++) m = stepPlayer(m, -4, 0, false, 1 / 60, col);
    expect(m.x).toBeLessThan(10);
    expect(m.y).toBeCloseTo(PLAYER.eye, 2);
    expect(b.data.acoustics.zones.filter((z) => z.kind === 'hall' && z.max[1] <= -0.8 + 1e-9)).toHaveLength(1);
  });
});
