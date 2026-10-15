import { describe, expect, it } from 'vitest';
import { DROP_CLEARANCE, dropRest, restedBounds, rotatedBounds, type Bounds } from './dropRest';

const GUN: Bounds = { min: [-0.014, -0.081, -0.7], max: [0.014, 0.08, 0.2] };

describe('Ruhelage liegender Waffen', () => {
  it('rotatedBounds: Drehung um z um 90° vertauscht x und y', () => {
    const r = rotatedBounds({ min: [-1, -2, -3], max: [1, 2, 3] }, Math.PI / 2);
    expect(r.min[0]).toBeCloseTo(-2, 9);
    expect(r.max[0]).toBeCloseTo(2, 9);
    expect(r.min[1]).toBeCloseTo(-1, 9);
    expect(r.max[1]).toBeCloseTo(1, 9);
    expect(r.min[2]).toBe(-3);
    expect(r.max[2]).toBe(3);
  });

  it('auf der Seite liegende Waffe: Unterkante genau auf dem Boden, Mitte bei x/z = 0', () => {
    const p = dropRest(GUN, 'side');
    expect(p.rotZ).toBeCloseTo(Math.PI / 2, 9);
    const r = restedBounds(GUN, p);
    expect(r.min[1]).toBeCloseTo(DROP_CLEARANCE, 9);
    expect((r.min[0] + r.max[0]) / 2).toBeCloseTo(0, 9);
    expect((r.min[2] + r.max[2]) / 2).toBeCloseTo(0, 9);
    // liegt flach: Höhe = Waffenbreite (x), nicht Waffenhöhe
    expect(r.max[1] - r.min[1]).toBeCloseTo(0.028, 9);
    expect(r.max[0] - r.min[0]).toBeCloseTo(0.161, 9);
  });

  it('stehende Granate: Unterkante auf dem Boden, nicht gedreht', () => {
    const nade: Bounds = { min: [-0.044, -0.04, -0.034], max: [0.032, 0.058, 0.034] };
    const p = dropRest(nade, 'upright');
    expect(p.rotZ).toBe(0);
    const r = restedBounds(nade, p);
    expect(r.min[1]).toBeCloseTo(DROP_CLEARANCE, 9);
    expect(r.max[1]).toBeCloseTo(0.098 + DROP_CLEARANCE, 9);
  });

  it('flache C4: liegt flach (Höhe = Modellhöhe)', () => {
    const c4: Bounds = { min: [-0.123, -0.029, -0.14], max: [-0.007, 0.049, 0.061] };
    const r = restedBounds(c4, dropRest(c4, 'flat'));
    expect(r.min[1]).toBeCloseTo(DROP_CLEARANCE, 9);
    expect(r.max[1] - r.min[1]).toBeCloseTo(0.078, 9);
  });

  it('eigener Abstand (clearance) wird eingehalten', () => {
    const r = restedBounds(GUN, dropRest(GUN, 'side', 0.02));
    expect(r.min[1]).toBeCloseTo(0.02, 9);
  });
});
