import { describe, expect, it } from 'vitest';
import { MapBuilder } from './mapkit';
import { brushItem, colliderFromMap } from './mapcompile';
import { HUB, HUB_KINDS, hubFootprint, isHubKind } from './hubprops';
import { prop, propFootprint } from './mapprops';
import { PLAYER } from './move';

const ENV = { sunDir: [0, 1, 0] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };
const mk = () => new MapBuilder({ id: 'de_h', name: 'H', description: '', bounds: { min: [-60, -5, -60], max: [60, 20, 60] }, env: ENV });

describe('Umschlag-Requisiten', () => {
  it('jede Art ist erkannt, erzeugt gültige Maße und ist deterministisch', () => {
    for (const kind of HUB_KINDS) {
      expect(isHubKind(kind)).toBe(true);
      const a = mk();
      prop(a, kind, 3, 0, -2, { rot: 1, n: 7 });
      const c = mk();
      prop(c, kind, 3, 0, -2, { rot: 1, n: 7 });
      expect(a.data.brushes.length + a.data.decor.length, kind).toBeGreaterThan(0);
      expect(JSON.stringify(a.data)).toBe(JSON.stringify(c.data));
      for (const br of a.data.brushes) for (let k = 0; k < 3; k++) expect(br.max[k]!, kind).toBeGreaterThan(br.min[k]!);
    }
    expect(isHubKind('crate')).toBe(false);
    expect(isHubKind('boxcar')).toBe(false);
  });

  it('Fußabdruck: propFootprint folgt hubFootprint, Drehung tauscht Breite und Tiefe', () => {
    expect(propFootprint('van', 0)).toEqual([HUB.vanLength, HUB.vanWidth]);
    expect(propFootprint('van', 1)).toEqual([HUB.vanWidth, HUB.vanLength]);
    expect(hubFootprint('table', 0, { len: 3 })).toEqual([3, 1.4]);
    expect(hubFootprint('gantryConveyor', 3, { len: 10 })).toEqual([1.1, 10]);
  });

  it('Lieferwagen: Karosserie kollidiert und ist höher als die Sprungkante; Rad-Deko an allen vier Ecken', () => {
    const b = mk();
    prop(b, 'van', 0, 0, 0, { tint: 0xffffff });
    const solid = b.data.brushes.filter((x) => (x.collide ?? 'all') === 'all');
    const top = Math.max(...solid.map((x) => x.max[1]));
    expect(top).toBeCloseTo(HUB.vanHeight, 5);
    expect(b.data.decor.filter((d) => d.kind === 'wheel')).toHaveLength(4);
    // Länge entlang X (rot 0), entlang Z bei rot 1
    const body = solid.find((x) => x.max[1] === HUB.vanHeight)!;
    expect(body.max[0] - body.min[0]).toBeGreaterThan(body.max[2] - body.min[2]);
    const c = mk();
    prop(c, 'van', 0, 0, 0, { rot: 1 });
    const body1 = c.data.brushes.find((x) => x.max[1] === HUB.vanHeight)!;
    expect(body1.max[2] - body1.min[2]).toBeGreaterThan(body1.max[0] - body1.min[0]);
  });

  it('Rolltor-Bucht: liegt vor der Wand (lokal +Z), blockiert nichts, Nummernschild nur mit n', () => {
    const b = mk();
    prop(b, 'dockBay', 0, 0, 10, { rot: 2, n: 12 });
    expect(b.data.brushes.every((x) => x.collide === 'none')).toBe(true);
    // rot 2: Front nach −Z, die Rückseite liegt an z = 10, alles ragt nach −Z
    expect(Math.max(...b.data.brushes.map((x) => x.max[2]))).toBeLessThanOrEqual(10 + 1e-9);
    expect(Math.min(...b.data.brushes.map((x) => x.min[2]))).toBeLessThan(10 - 0.3);
    expect(b.data.signs).toHaveLength(1);
    expect(b.data.signs[0]!.text).toBe('12');
    expect(b.data.signs[0]!.facing).toBe('nz');
    const c = mk();
    prop(c, 'dockBay', 0, 0, 10, {});
    expect(c.data.signs).toHaveLength(0);
  });

  it('Pflanze: nur der Topf kollidiert, das Blattwerk ist Optik', () => {
    const b = mk();
    prop(b, 'plant', 0, 0, 0, { h: 1.6 });
    const solid = b.data.brushes.filter((x) => (x.collide ?? 'all') === 'all');
    expect(solid).toHaveLength(1);
    expect(solid[0]!.max[1]).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(b.data.brushes.filter((x) => x.mat === 'foliage').length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...b.data.brushes.map((x) => x.max[1]))).toBeLessThanOrEqual(1.6 + 1e-9);
  });

  it('Sortierförderer: man geht darunter hindurch (Bandunterkante > Spielerhöhe), Stützen kollidieren', () => {
    const b = mk();
    b.box([-20, -1, -20], [20, 0, 20], 'concrete');
    prop(b, 'gantryConveyor', 0, 0, 0, { len: 12 });
    const col = colliderFromMap(b.data);
    const free = (x: number, z: number): boolean => !col.blockedAt(x, z, 0, PLAYER.radius, PLAYER.height, PLAYER.step);
    expect(free(0, 0)).toBe(true);
    expect(free(2.5, 0.1)).toBe(true);
    const belt = b.data.brushes.find((x) => x.mat === 'steel' && x.max[1] === HUB.gantryBelt)!;
    expect(belt.min[1]).toBeGreaterThan(PLAYER.height + 0.5);
    const posts = b.data.brushes.filter((x) => x.mat === 'steel' && x.min[1] === 0 && (x.collide ?? 'all') === 'all');
    expect(posts.length).toBeGreaterThanOrEqual(6);
    // Ware (Pakete) obendrauf ist Optik
    expect(b.data.brushes.filter((x) => x.mat === 'carton').every((x) => x.collide === 'none')).toBe(true);
  });

  it('Pförtnerhaus: massiver Kasten mit Fenster (Optik) nach +Z', () => {
    const b = mk();
    prop(b, 'gatehouse', 0, 0, 0, {});
    const items = b.data.brushes.map((x, i) => brushItem(x, i)).filter(Boolean);
    expect(items.length).toBeGreaterThanOrEqual(2);
    const win = b.data.brushes.find((x) => x.mat === 'window')!;
    expect(win.max[2]).toBeGreaterThan(0);
    expect(win.collide).toBe('none');
  });

  it('Bank, Tisch und Pult: Sitzfläche begehbar niedrig, Tisch mit unsichtbarer Kollision, Pult mit Monitoren', () => {
    const b = mk();
    prop(b, 'bench', 0, 0, 0, {});
    const seat = b.data.brushes.find((x) => x.mat === 'wood' && (x.collide ?? 'all') === 'all')!;
    expect(seat.max[1]).toBeLessThanOrEqual(PLAYER.step + 1e-9);
    const c = mk();
    prop(c, 'console', 0, 0, 0, { len: 3 });
    const screens = c.data.brushes.filter((x) => x.mat === 'emissive');
    expect(screens.length).toBeGreaterThanOrEqual(3);
    expect(screens.every((x) => x.collide === 'none')).toBe(true);
    const d = mk();
    prop(d, 'table', 0, 0, 0, { len: 2.4 });
    expect(d.data.brushes.some((x) => x.visible === false)).toBe(true);
  });
});
