import { describe, expect, it } from 'vitest';
import { hitPoint, tracerDir } from './fx';

describe('hitPoint', () => {
  it('berechnet Trefferpunkt korrekt', () => {
    const p = hitPoint({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 5);
    expect(p).toEqual({ x: 0, y: 0, z: 5 });
  });

  it('funktioniert mit schräger Richtung', () => {
    const dir = { x: 1, y: 0, z: 0 };
    const p = hitPoint({ x: 1, y: 2, z: 3 }, dir, 4);
    expect(p).toEqual({ x: 5, y: 2, z: 3 });
  });
});

describe('tracerDir', () => {
  it('normalisiert Richtung', () => {
    const d = tracerDir({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 });
    expect(d.z).toBeCloseTo(1);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
  });

  it('handhabt identische Punkte (len 0) ohne NaN', () => {
    const d = tracerDir({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 });
    expect(Number.isFinite(d.x)).toBe(true);
  });
});
