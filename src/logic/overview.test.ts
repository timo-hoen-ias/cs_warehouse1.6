import { describe, expect, it } from 'vitest';
import { heightColor, overviewBrushes, renderOverview } from './overview';
import type { MapData } from './mapkit';

const map: MapData = {
  id: 'de_o', name: 'O', description: '', bounds: { min: [0, -2, 0], max: [20, 10, 10] },
  brushes: [
    { min: [0, -1, 0], max: [20, 0, 10], mat: 'concrete' },
    { min: [8, 0, 0], max: [8.4, 4, 10], mat: 'brick', tag: 'wall' },
    { min: [0, 6, 0], max: [20, 6.4, 10], mat: 'roof', tag: 'roof' },
    { min: [12, 0, 2], max: [16, 2, 4], mat: 'concrete', ramp: 'px' },
  ],
  decor: [], decals: [], signs: [], lights: [], areas: [{ name: 'Mitte', min: [0, -5, 0], max: [8, 5, 10] }],
  sites: [{ id: 'A', name: 'A', min: [1, -1, 1], max: [5, 3, 5], plant: [3, 0, 3] }],
  spawns: [{ team: 'T', pos: [18, 0, 8], yaw: 0 }], buyZones: [], acoustics: { zones: [], emitters: [] },
  env: { sunDir: [0, 1, 0], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0, skyHorizon: 0, skyIntensity: 0, ambient: 0, fogColor: 0, fogNear: 1, fogFar: 2 },
};

describe('Übersicht', () => {
  it('Rastergröße aus Kartengrenzen und Auflösung', () => {
    const r = renderOverview(map, { pxPerM: 4 });
    expect(r.w).toBe(80);
    expect(r.h).toBe(40);
    expect(r.data.length).toBe(80 * 40 * 4);
  });

  it('Dächer erscheinen nicht, Wände dunkel, Boden nach Höhe gefärbt', () => {
    expect(overviewBrushes(map).some((b) => b.tag === 'roof')).toBe(false);
    const r = renderOverview(map, { pxPerM: 4 });
    const px = (x: number, z: number) => {
      const i = (Math.floor(z * 4) * r.w + Math.floor(x * 4)) * 4;
      return Array.from(r.data.slice(i, i + 3));
    };
    const wall = px(8.2, 7);
    expect(Math.max(...wall)).toBeLessThan(40);
    const ground = px(10.5, 8);
    const c = heightColor(0);
    expect(Math.abs(ground[1]! - c[1])).toBeLessThan(40);
  });

  it('Höhenfarben unterscheiden Ebenen', () => {
    expect(heightColor(-3)).not.toEqual(heightColor(0));
    expect(heightColor(4)[0]).toBeGreaterThan(heightColor(0)[0]);
    expect(heightColor(100)).toEqual(heightColor(8));
  });

  it('Radar-Stil: transparenter Hintergrund außerhalb der Brushes', () => {
    const empty: MapData = { ...map, brushes: [], sites: [] };
    const r = renderOverview(empty, { pxPerM: 2, radar: true });
    expect(r.data[3]).toBe(0);
    const r2 = renderOverview(empty, { pxPerM: 2, labels: true });
    expect(r2.data[3]).toBe(255);
  });
});
