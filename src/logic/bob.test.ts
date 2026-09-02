import { describe, expect, it } from 'vitest';
import { BOB, advanceBob, bobOffset, bobScale } from './bob';

describe('advanceBob', () => {
  it('zählt Phase proportional zu Tempo und dt', () => {
    const p0 = advanceBob(0, 4, 0.25);
    expect(p0).toBeCloseTo(4 * BOB.freq * 0.25);
    const p1 = advanceBob(0, 4, 0.5);
    expect(p1).toBeCloseTo(p0 * 2);
  });

  it('steht (Speed 0) → Phase bleibt unverändert', () => {
    expect(advanceBob(1.3, 0, 1)).toBe(1.3);
  });

  it('kriecht (unter minSpeed) → Phase bleibt unverändert', () => {
    const p = advanceBob(0.5, BOB.minSpeed * 0.5, 1);
    expect(p).toBe(0.5);
  });
});

describe('bobScale', () => {
  it('keine Auslenkung ohne Bewegung', () => {
    expect(bobScale(0, 4.2, false)).toBe(0);
  });

  it('Laufen auf walkSpeed → Faktor 1', () => {
    expect(bobScale(4.2, 4.2, false)).toBeCloseTo(1);
  });

  it('geduckt ist der Bob deutlich reduziert', () => {
    expect(bobScale(4.2, 4.2, true)).toBeLessThan(bobScale(4.2, 4.2, false));
    expect(bobScale(4.2, 4.2, true)).toBeCloseTo(BOB.crouchFactor);
  });

  it('Sprint wächst höchstens auf sprintBoost', () => {
    expect(bobScale(100, 4.2, false)).toBeCloseTo(BOB.sprintBoost);
  });
});

describe('bobOffset', () => {
  it('bleibt immer im definierten Maximalbereich', () => {
    for (let p = 0; p < Math.PI * 6; p += 0.1) {
      const o = bobOffset(p, 1);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(BOB.amp + 1e-9);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(BOB.side + 1e-9);
      expect(Math.abs(o.roll)).toBeLessThanOrEqual(BOB.roll + 1e-9);
    }
  });

  it('Skalierung wirkt linear (Skalierung 0 → 0)', () => {
    expect(bobOffset(1.2, 0)).toEqual({ x: 0, y: 0, roll: 0 });
  });

  it('volle Periode kehrt an denselben Punkt zurück', () => {
    const a = bobOffset(0, 1);
    const b = bobOffset(2 * Math.PI, 1);
    expect(a.y).toBeCloseTo(b.y);
    expect(a.x).toBeCloseTo(b.x);
  });
});
