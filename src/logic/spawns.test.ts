import { describe, expect, it } from 'vitest';
import type { SolidBox } from './level';
import { pointFree } from './move';
import { spawnPoints, yawTowards } from './spawns';

const inner = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const rack: SolidBox = { kind: 'rack', minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: -6, maxZ: 6, label: 'r' };

describe('spawnPoints', () => {
  it('liefert die gewünschte Anzahl freier, verschiedener Punkte', () => {
    const pts = spawnPoints([5, 0, 0], 10, [rack], inner);
    expect(pts).toHaveLength(10);
    for (const p of pts) expect(pointFree(p[0], p[2], [rack], 0.7)).toBe(true);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![2] - pts[j]![2])).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('erster Punkt ist das Zentrum, wenn frei; blockiertes Zentrum wird übersprungen', () => {
    expect(spawnPoints([5, 0, 0], 1, [rack], inner)[0]).toEqual([5, 0, 0]);
    const pts = spawnPoints([0, 0, 0], 3, [rack], inner);
    expect(pts).toHaveLength(3);
    for (const p of pts) expect(Math.abs(p[0])).toBeGreaterThan(1);
  });

  it('bleibt innerhalb der Innenfläche und ist deterministisch', () => {
    const a = spawnPoints([19, 0, 19], 12, [], inner);
    const b = spawnPoints([19, 0, 19], 12, [], inner);
    expect(a).toEqual(b);
    for (const p of a) {
      expect(p[0]).toBeLessThanOrEqual(inner.maxX);
      expect(p[2]).toBeLessThanOrEqual(inner.maxZ);
    }
    expect(spawnPoints([0, 0, 0], 0, [], inner)).toEqual([]);
  });
});

describe('yawTowards', () => {
  it('Blick nach -Z = 0, nach -X = +90°', () => {
    expect(yawTowards([0, 0, 0], [0, 0, -5])).toBeCloseTo(0);
    expect(yawTowards([0, 0, 0], [-5, 0, 0])).toBeCloseTo(Math.PI / 2);
  });
});
