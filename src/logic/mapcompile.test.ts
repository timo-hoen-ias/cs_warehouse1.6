import { describe, expect, it } from 'vitest';
import { COL } from './collision';
import { brushItem, brushSurface, colliderFromMap } from './mapcompile';
import type { MapData } from './mapkit';

describe('Brush → Kollision', () => {
  it('Masken je collide-Art, keine Kollision für Deko', () => {
    expect(brushItem({ min: [0, 0, 0], max: [1, 1, 1], mat: 'crate' }, 0)!.mask).toBe(COL.all);
    expect(brushItem({ min: [0, 0, 0], max: [1, 1, 1], mat: 'metal', collide: 'move' }, 0)!.mask).toBe(COL.move);
    expect(brushItem({ min: [0, 0, 0], max: [1, 1, 1], mat: 'metal', collide: 'shot' }, 0)!.mask).toBe(COL.shot);
    expect(brushItem({ min: [0, 0, 0], max: [1, 1, 1], mat: 'metal', collide: 'none' }, 0)).toBeNull();
  });
  it('Wände, Dächer, Türen sind kein Navigationsboden; Rampen bleiben Rampen', () => {
    for (const tag of ['wall', 'building', 'roof', 'door', 'pillar']) expect(brushItem({ min: [0, 0, 0], max: [1, 1, 1], mat: 'brick', tag }, 3)!.noNav).toBe(true);
    const r = brushItem({ min: [0, 0, 0], max: [4, 1, 1], mat: 'concrete', ramp: 'nz' }, 7)!;
    expect(r.ramp).toBe('nz');
    expect(r.id).toBe(7);
    expect(r.noNav).toBeFalsy();
  });
  it('Oberfläche: explizit, sonst Oberseiten- bzw. Grundmaterial', () => {
    expect(brushSurface({ min: [0, 0, 0], max: [1, 1, 1], mat: 'steel', top: 'grating' })).toBe('grate');
    expect(brushSurface({ min: [0, 0, 0], max: [1, 1, 1], mat: 'crate' })).toBe('wood');
    expect(brushSurface({ min: [0, 0, 0], max: [1, 1, 1], mat: 'crate', surface: 'metal' })).toBe('metal');
  });
  it('Collider der Karte: Fallboden unter der Kartengrenze, Oberflächen abrufbar', () => {
    const data = {
      bounds: { min: [0, -3, 0], max: [10, 10, 10] },
      brushes: [{ min: [0, -1, 0], max: [10, 0, 10], mat: 'concrete', top: 'grating' }],
    } as unknown as MapData;
    const c = colliderFromMap(data);
    expect(c.floorY).toBe(-5);
    expect(c.surfaceAt(5, 0, 5)).toBe('grate');
  });
});
