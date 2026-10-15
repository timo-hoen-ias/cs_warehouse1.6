import { describe, expect, it } from 'vitest';
import { MapBuilder } from './mapkit';
import { prop, propFootprint, type PropKind } from './mapprops';
import { brushItem } from './mapcompile';

const ENV = { sunDir: [0, 1, 0] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };
const mk = () => new MapBuilder({ id: 'de_p', name: 'P', description: '', bounds: { min: [-50, -5, -50], max: [50, 20, 50] }, env: ENV });

const ALL: PropKind[] = [
  'pallet', 'palletStack', 'palletGoods', 'crate', 'crateStack', 'gitterbox', 'container', 'container40', 'trailer', 'truck', 'forklift',
  'barrel', 'barrelGroup', 'drum', 'rack', 'shelf', 'serverRack', 'serverRow', 'ups', 'cooler', 'conveyor', 'cartons', 'ibc', 'desk',
  'bumper', 'lampPost', 'fence', 'handTruck', 'cableTray', 'locker', 'generator', 'rollerDoor', 'acUnit', 'electricBox', 'cones', 'doorSteel',
];

describe('Requisiten', () => {
  it('jede Art erzeugt Brushes oder Deko mit gültigen Maßen, deterministisch', () => {
    for (const kind of ALL) {
      const a = mk();
      prop(a, kind, 3, 1, -2, { rot: 1 });
      const b = mk();
      prop(b, kind, 3, 1, -2, { rot: 1 });
      expect(a.data.brushes.length + a.data.decor.length, kind).toBeGreaterThan(0);
      expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
      for (const br of a.data.brushes) for (let k = 0; k < 3; k++) expect(br.max[k]!, kind).toBeGreaterThan(br.min[k]!);
    }
  });

  it('Drehung um 90° tauscht die Grundfläche (Container 6 m entlang Z)', () => {
    const b = mk();
    prop(b, 'container', 0, 0, 0, { rot: 1, tint: 0xff0000 });
    const body = b.data.brushes.find((x) => x.mat === 'container')!;
    expect(body.max[0] - body.min[0]).toBeCloseTo(2.44, 2);
    expect(body.max[2] - body.min[2]).toBeCloseTo(6.06, 2);
    expect(propFootprint('container', 1)).toEqual([2.44, 6.1]);
  });

  it('blockierende Requisiten kollidieren; hohe Oberseiten sind kein Navigationsboden', () => {
    const b = mk();
    prop(b, 'forklift', 0, 0, 0);
    const col = b.data.brushes.map((x, i) => brushItem(x, i)).filter(Boolean);
    expect(col.length).toBe(1);
    expect(col[0]!.noNav).toBe(true); // 2.1 m hoch
    const c = mk();
    prop(c, 'crate', 0, 0, 0, { h: 1.2 });
    expect(brushItem(c.data.brushes[0]!, 0)!.noNav).toBeFalsy();
  });

  it('Serverreihe: eine Kollisionsbox + je Schrank eine Deko-Instanz', () => {
    const b = mk();
    prop(b, 'serverRow', 0, 0, 0, { n: 5 });
    expect(b.data.decor.filter((d) => d.kind === 'serverRack')).toHaveLength(5);
    expect(b.data.brushes.filter((x) => (x.collide ?? 'all') === 'all')).toHaveLength(1);
  });

  it('Rolltor liegt vor der Wand (lokal +Z), Zaun blockiert nur Bewegung', () => {
    const b = mk();
    prop(b, 'rollerDoor', 0, 0, 10, { rot: 2 });
    const gate = b.data.brushes.find((x) => x.mat === 'gate')!;
    expect(gate.max[2]).toBeLessThanOrEqual(10 + 1e-9);
    expect(gate.uvFit).toBe(true);
    const f = mk();
    prop(f, 'fence', 0, 0, 0, { len: 6 });
    expect(f.data.brushes[0]!.collide).toBe('move');
  });
});
