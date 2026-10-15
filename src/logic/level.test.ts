import { describe, expect, it } from 'vitest';
import { nearestSolidXz, type SolidBox } from './level';

describe('nearestSolidXz', () => {
  const box: SolidBox = { kind: 'wall', minX: 0, maxX: 2, minY: 0, maxY: 3, minZ: 0, maxZ: 1, label: 'w' };
  it('0 innerhalb, sonst XZ-Abstand zur nächsten Box', () => {
    expect(nearestSolidXz(1, 0.5, [box])).toBe(0);
    expect(nearestSolidXz(5, 0.5, [box])).toBe(3);
    expect(nearestSolidXz(5, 5, [box])).toBeCloseTo(5);
    expect(nearestSolidXz(5, 5, [])).toBe(Infinity);
  });
});
