import { describe, expect, it } from 'vitest';
import { IDENTITY_STRETCH, stretchMap } from './stretch';

describe('stretchMap (Längsstauchung)', () => {
  const m = stretchMap([[-0.4, -0.3], [0, 0], [0.2, 0.2], [0.8, 0.5]]);

  it('trifft die Stützstellen exakt', () => {
    expect(m.map(-0.4)).toBeCloseTo(-0.3, 12);
    expect(m.map(0)).toBeCloseTo(0, 12);
    expect(m.map(0.2)).toBeCloseTo(0.2, 12);
    expect(m.map(0.8)).toBeCloseTo(0.5, 12);
  });

  it('interpoliert linear zwischen den Stützstellen', () => {
    expect(m.map(-0.2)).toBeCloseTo(-0.15, 12);
    expect(m.map(0.5)).toBeCloseTo(0.2 + 0.15, 12);
    expect(m.map(0.1)).toBeCloseTo(0.1, 12); // Identität im Griffbereich
  });

  it('verschiebt außerhalb mit Steigung 1', () => {
    expect(m.map(-0.5)).toBeCloseTo(-0.4, 12);
    expect(m.map(0.9)).toBeCloseTo(0.6, 12);
    expect(m.slope(-0.5)).toBe(1);
    expect(m.slope(0.9)).toBe(1);
  });

  it('Steigung je Abschnitt (Stauchung < 1, Griffbereich 1)', () => {
    expect(m.slope(-0.2)).toBeCloseTo(0.75, 12);
    expect(m.slope(0.1)).toBeCloseTo(1, 12);
    expect(m.slope(0.5)).toBeCloseTo(0.5, 12);
  });

  it('ist streng monoton (keine Faltung)', () => {
    let prev = -Infinity;
    for (let f = -0.6; f <= 1; f += 0.01) {
      const v = m.map(f);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('lehnt ungültige Stützstellen ab', () => {
    expect(() => stretchMap([[0, 0]])).toThrow();
    expect(() => stretchMap([[0, 0], [0, 1]])).toThrow();
    expect(() => stretchMap([[0, 1], [1, 0.5]])).toThrow();
  });

  it('Identität', () => {
    expect(IDENTITY_STRETCH.map(0.37)).toBe(0.37);
    expect(IDENTITY_STRETCH.slope(0.37)).toBe(1);
  });
});
