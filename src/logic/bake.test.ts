import { describe, expect, it } from 'vitest';
import { BAKE_HIGH, LightGrid, bakeEnv, bakeLights, bakePoint, buildVoxels, linearRgb, luminance, occupied, visible } from './bake';
import type { Brush, MapEnv } from './mapkit';

const env: MapEnv = { sunDir: [0, 1, 0], sunColor: 0xffffff, sunIntensity: 1.5, skyTop: 0x6080c0, skyHorizon: 0xc0c8d0, skyIntensity: 0.5, ambient: 0.05, fogColor: 0x999999, fogNear: 50, fogFar: 200 };
const bounds = { min: [-20, -2, -20] as [number, number, number], max: [20, 12, 20] as [number, number, number] };
const floor: Brush = { min: [-20, -1, -20], max: [20, 0, 20], mat: 'concrete' };
const roof: Brush = { min: [-5, 4, -5], max: [5, 4.5, 5], mat: 'roof' };
const ramp: Brush = { min: [10, 0, -2], max: [14, 2, 2], mat: 'concrete', ramp: 'px' };

describe('Voxel-Belegung', () => {
  const v = buildVoxels([floor, roof, ramp], bounds, 0.5);
  it('Quader und Keil werden belegt, Luft bleibt frei', () => {
    expect(occupied(v, 0, -0.5, 0)).toBe(true);
    expect(occupied(v, 0, 0.25, 0)).toBe(false);
    expect(occupied(v, 0, 4.25, 0)).toBe(true);
    expect(occupied(v, 13.7, 1.6, 0)).toBe(true); // hohes Rampenende
    expect(occupied(v, 10.3, 1.6, 0)).toBe(false); // über dem tiefen Ende
    expect(occupied(v, 0, -10, 0)).toBe(true); // unter dem Raster gilt belegt
    expect(occupied(v, 100, 3, 0)).toBe(false);
  });
  it('Sichtstrahlen werden vom Dach blockiert', () => {
    expect(visible(v, [0, 0.3, 0], [0, 1, 0], 20)).toBe(false);
    expect(visible(v, [8, 0.3, 0], [0, 1, 0], 20)).toBe(true);
  });
});

describe('bakePoint', () => {
  const v = buildVoxels([floor, roof], bounds, 0.5);
  const e = bakeEnv(env);
  const noLights = new LightGrid([]);
  it('unter dem Dach dunkler als in der Sonne', () => {
    const sun = luminance(bakePoint(v, noLights, e, [10, 0, 10], [0, 1, 0], BAKE_HIGH));
    const shade = luminance(bakePoint(v, noLights, e, [0, 0, 0], [0, 1, 0], BAKE_HIGH));
    expect(sun).toBeGreaterThan(1);
    expect(shade).toBeLessThan(sun * 0.4);
  });
  it('eine Lampe erhellt ihre Umgebung, aber nicht jenseits ihrer Reichweite', () => {
    const lamps = new LightGrid(bakeLights([{ kind: 'lamp', pos: [0, 3.5, 0], color: 0xffffff, intensity: 2, range: 8 }]));
    const lit = luminance(bakePoint(v, lamps, e, [1, 0, 0], [0, 1, 0], BAKE_HIGH));
    const dark = luminance(bakePoint(v, noLights, e, [1, 0, 0], [0, 1, 0], BAKE_HIGH));
    expect(lit).toBeGreaterThan(dark + 0.3);
    const far = luminance(bakePoint(v, lamps, e, [4.9, 0, 4.9], [0, 1, 0], BAKE_HIGH)) - luminance(bakePoint(v, noLights, e, [4.9, 0, 4.9], [0, 1, 0], BAKE_HIGH));
    expect(far).toBeLessThan(lit - dark);
  });
  it('Lampe hinter einer Wand wirft (fast) kein Licht durch', () => {
    const wall: Brush = { min: [2, 0, -5], max: [2.5, 4, 5], mat: 'brick' };
    const vw = buildVoxels([floor, roof, wall], bounds, 0.5);
    const lamps = new LightGrid(bakeLights([{ kind: 'lamp', pos: [0, 2, 0], color: 0xffffff, intensity: 2, range: 10 }]));
    const behind = luminance(bakePoint(vw, lamps, e, [4, 0, 0], [0, 1, 0], BAKE_HIGH));
    const front = luminance(bakePoint(vw, lamps, e, [1, 0, 0], [0, 1, 0], BAKE_HIGH));
    expect(behind).toBeLessThan(front * 0.4);
  });
});

describe('Hilfen', () => {
  it('linearRgb: sRGB → linear', () => {
    expect(linearRgb(0xffffff)).toEqual([1, 1, 1]);
    expect(linearRgb(0x000000)).toEqual([0, 0, 0]);
    expect(linearRgb(0x808080)[0]).toBeCloseTo(0.216, 2);
  });
  it('LightGrid findet nur Lampen in Reichweite', () => {
    const g = new LightGrid(bakeLights([{ kind: 'lamp', pos: [0, 3, 0], color: 0xffffff, intensity: 1, range: 5 }, { kind: 'lamp', pos: [100, 3, 100], color: 0xffffff, intensity: 1, range: 5 }]));
    expect(g.near(1, 1)).toHaveLength(1);
    expect(g.near(100, 100)).toHaveLength(1);
    expect(g.near(50, 50)).toHaveLength(0);
  });
});
