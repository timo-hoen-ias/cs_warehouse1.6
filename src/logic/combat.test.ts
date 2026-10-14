import { describe, expect, it } from 'vitest';
import { aimAt, dirToYawPitch, resolveRay, shotDirs, spreadDir, yawPitchToDir } from './combat';
import { humanPartBoxes } from './hitbox';
import { WEAPONS } from './weapons';

const wall = { minX: 9, maxX: 9.5, minY: 0, maxY: 6, minZ: -5, maxZ: 5 };
const eye = { x: 0, y: 1.65, z: 0 };
const fwd = { x: 1, y: 0, z: 0 };
const targetAt = (id: string, x: number) => ({ id, parts: humanPartBoxes({ x, y: 0, z: 0 }) });

describe('spreadDir / shotDirs', () => {
  it('ohne Streuung bleibt die Richtung (normalisiert)', () => {
    expect(spreadDir({ x: 2, y: 0, z: 0 }, 0)).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('mit Streuung weicht die Richtung höchstens um den Kegelradius ab', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const d = spreadDir(fwd, 0.05, rnd);
      const ang = Math.acos(Math.min(1, d.x));
      expect(ang).toBeLessThanOrEqual(0.0501);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
    }
  });

  it('Schrot erzeugt pellets Richtungen, Gewehr eine', () => {
    expect(shotDirs(WEAPONS['m3']!, fwd, 0.05)).toHaveLength(WEAPONS['m3']!.pellets);
    expect(shotDirs(WEAPONS['ak47']!, fwd, 0.01)).toHaveLength(1);
  });
});

describe('resolveRay', () => {
  it('trifft das nächste Ziel vor der Wand, ignoriert den Schützen', () => {
    const hit = resolveRay(eye, fwd, 100, [wall], [targetAt('me', 0), targetAt('far', 7), targetAt('near', 4)], 'me');
    expect(hit.kind).toBe('target');
    if (hit.kind === 'target') {
      expect(hit.id).toBe('near');
      expect(hit.part).toBe('head'); // Augenhöhe 1.65 trifft den Kopf (Kopf ab ~1.3 m)
      expect(hit.dist).toBeCloseTo(4 - 0.2, 1);
    }
  });

  it('Ziel hinter der Wand → Wandtreffer', () => {
    const hit = resolveRay(eye, fwd, 100, [wall], [targetAt('x', 12)]);
    expect(hit.kind).toBe('wall');
    expect(hit.dist).toBeCloseTo(9, 5);
    expect(hit.point.x).toBeCloseTo(9, 5);
  });

  it('nichts in Reichweite → none am Reichweitenende', () => {
    const hit = resolveRay(eye, { x: -1, y: 0, z: 0 }, 50, [wall], [targetAt('x', 12)]);
    expect(hit.kind).toBe('none');
    expect(hit.point.x).toBeCloseTo(-50, 5);
  });

  it('Ziel außerhalb der Reichweite zählt nicht', () => {
    const hit = resolveRay(eye, fwd, 3, [], [targetAt('x', 5)]);
    expect(hit.kind).toBe('none');
  });
});

describe('Winkel-Helfer', () => {
  it('aimAt liefert normalisierte Richtung und Distanz', () => {
    const r = aimAt({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
    expect(r.dist).toBe(5);
    expect(r.dir).toEqual({ x: 0.6, y: 0.8, z: 0 });
  });

  it('yaw/pitch ↔ Richtung ist invertierbar (Kamera-Konvention: yaw 0 = -Z)', () => {
    expect(yawPitchToDir(0, 0)).toEqual({ x: -0, y: 0, z: -1 });
    for (const [yaw, pitch] of [[0.3, 0.2], [-1.2, -0.5], [2.5, 0.9]]) {
      const d = yawPitchToDir(yaw!, pitch!);
      const back = dirToYawPitch(d);
      expect(back.yaw).toBeCloseTo(yaw!, 5);
      expect(back.pitch).toBeCloseTo(pitch!, 5);
    }
  });
});
