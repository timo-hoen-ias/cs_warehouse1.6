import { describe, expect, it } from 'vitest';
import { CEILING, ceilingBox, floorLight, lampGrid, spread, trussPositions } from './ceiling';

const inner = { minX: -30, maxX: 30, minZ: -40, maxZ: 40 };

describe('spread', () => {
  it('verteilt mittig mit Abstand ≈ step', () => {
    expect(spread(0, 10, 5)).toEqual([2.5, 7.5]);
    expect(spread(0, 7, 5)).toEqual([3.5]);
    expect(spread(5, 5, 2)).toEqual([]);
    expect(spread(0, 10, 0)).toEqual([]);
  });
});

describe('ceilingBox', () => {
  it('überdeckt die ganze Halle auf Dachhöhe', () => {
    const b = ceilingBox(inner, 8);
    expect(b.minY).toBe(8);
    expect(b.maxY).toBeCloseTo(8 + CEILING.thickness);
    expect(b.minX).toBeLessThan(inner.minX);
    expect(b.maxZ).toBeGreaterThan(inner.maxZ);
  });
});

describe('Binder und Strahler', () => {
  it('Binder liegen innerhalb der Halle, Abstand ≈ trussSpacing', () => {
    const xs = trussPositions(inner);
    expect(xs.length).toBe(Math.floor(60 / CEILING.trussSpacing));
    for (const x of xs) {
      expect(x).toBeGreaterThan(inner.minX);
      expect(x).toBeLessThan(inner.maxX);
    }
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(CEILING.trussSpacing - 1e-9);
  });

  it('Strahler hängen an Bindern (gleiche X-Werte) und decken die Halle ab', () => {
    const lamps = lampGrid(inner);
    const xs = new Set(trussPositions(inner));
    expect(lamps.length).toBe(xs.size * Math.floor(80 / CEILING.lampSpacingZ));
    for (const l of lamps) expect(xs.has(l.x)).toBe(true);
  });
});

describe('floorLight', () => {
  const lamps = [{ x: 0, z: 0 }];
  it('hell unter der Lampe, Grundhelligkeit weit weg, gedeckelt auf 1', () => {
    expect(floorLight(0, 0, lamps)).toBe(1); // 0.32 + 0.75 gedeckelt
    expect(floorLight(0, 0, lamps) <= 1).toBe(true);
    expect(floorLight(100, 0, lamps)).toBeCloseTo(0.32);
    expect(floorLight(3, 0, lamps)).toBeGreaterThan(floorLight(5, 0, lamps));
    expect(floorLight(0, 0, [{ x: 0, z: 0 }, { x: 1, z: 0 }], 0.32)).toBe(1);
  });
});
