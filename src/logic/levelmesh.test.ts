import { describe, expect, it } from 'vitest';
import { LEVEL_LOW, Occluders, buildLevelMesh, sampleLight } from './levelmesh';
import type { MapData } from './mapkit';

const base = (brushes: MapData['brushes']): MapData => ({
  id: 'de_m', name: 'M', description: '', bounds: { min: [-10, -2, -10], max: [10, 8, 10] }, brushes, decor: [], decals: [], signs: [],
  lights: [], areas: [], sites: [], spawns: [], buyZones: [], acoustics: { zones: [], emitters: [] },
  env: { sunDir: [0.3, 0.8, 0.2], sunColor: 0xffffff, sunIntensity: 1.2, skyTop: 0x6080c0, skyHorizon: 0xc0c8d0, skyIntensity: 0.5, ambient: 0.05, fogColor: 0x999999, fogNear: 50, fogFar: 200 },
});

const tris = (r: ReturnType<typeof buildLevelMesh>) => r.parts.reduce((s, p) => s + p.indices.length / 3, 0);

describe('Levelgeometrie', () => {
  it('ein freistehender Quader hat 6 Flächen, Farben und Normalen', () => {
    const r = buildLevelMesh(base([{ min: [0, 0, 0], max: [1, 1, 1], mat: 'crate' }]), { ...LEVEL_LOW, seg: 10 });
    expect(tris(r)).toBe(12);
    const p = r.parts[0]!;
    expect(p.positions.length).toBe(p.normals.length);
    expect(p.uvs.length / 2).toBe(p.positions.length / 3);
    expect(Math.max(...p.colors)).toBeGreaterThan(0);
  });

  it('aneinanderliegende Flächen werden weggelassen (Boden unter einer Kiste, Kontaktflächen)', () => {
    const one = buildLevelMesh(base([{ min: [0, 0, 0], max: [2, 1, 2], mat: 'crate' }, { min: [2, 0, 0], max: [4, 1, 2], mat: 'crate' }]), { ...LEVEL_LOW, seg: 10 });
    // 2 × 6 Flächen − 2 Kontaktflächen = 10 Flächen
    expect(tris(one)).toBe(20);
    const floor = buildLevelMesh(base([{ min: [-4, -1, -4], max: [4, 0, 4], mat: 'concrete' }, { min: [-1, 0, -1], max: [1, 2, 1], mat: 'crate' }]), { ...LEVEL_LOW, seg: 1 });
    // Bodenoberseite 8×8 Teilflächen, davon 2×2 unter der Kiste verdeckt; Kistenboden verdeckt
    const top = floor.parts.filter((p) => p.mat === 'concrete');
    expect(top.length).toBeGreaterThan(0);
    expect(floor.stats.culled).toBeGreaterThanOrEqual(1);
  });

  it('Materialien werden getrennt, Oberseite nutzt top-Material', () => {
    const r = buildLevelMesh(base([{ min: [0, 0, 0], max: [1, 1, 1], mat: 'steel', top: 'grating' }]), { ...LEVEL_LOW, seg: 10 });
    expect(r.parts.map((p) => p.mat).sort()).toEqual(['grating', 'steel']);
  });

  it('Rampen erzeugen eine geneigte Oberseite mit Normalen nach oben/hinten', () => {
    const r = buildLevelMesh(base([{ min: [0, 0, 0], max: [4, 2, 2], mat: 'concrete', ramp: 'px' }]), { ...LEVEL_LOW, seg: 10 });
    const ns = r.parts.flatMap((p) => Array.from({ length: p.normals.length / 3 }, (_, i) => [p.normals[i * 3]!, p.normals[i * 3 + 1]!]));
    expect(ns.some(([nx, ny]) => nx < -0.3 && ny > 0.8)).toBe(true);
    // 5 Flächen: Schräge, Boden, Stirn, zwei Seiten
    expect(r.stats.faces).toBe(5);
  });

  it('unsichtbare Brushes werden nicht gerendert, Verdecker ignorieren Gitter', () => {
    const r = buildLevelMesh(base([{ min: [0, 0, 0], max: [1, 1, 1], mat: 'crate', visible: false }]), LEVEL_LOW);
    expect(r.parts).toHaveLength(0);
    const occ = new Occluders([{ min: [0, 0, 0], max: [1, 1, 1], mat: 'cage' }, { min: [2, 0, 0], max: [3, 1, 1], mat: 'crate' }]);
    expect(occ.inside(0.5, 0.5, 0.5)).toBe(false);
    expect(occ.inside(2.5, 0.5, 0.5)).toBe(true);
  });

  it('sampleLight liefert draußen Licht', () => {
    const r = buildLevelMesh(base([{ min: [-10, -1, -10], max: [10, 0, 10], mat: 'concrete' }]), LEVEL_LOW);
    const L = sampleLight(r.bake, [0, 0.5, 0]);
    expect(L[0]).toBeGreaterThan(0.3);
  });
});
