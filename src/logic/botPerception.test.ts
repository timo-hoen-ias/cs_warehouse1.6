import { describe, expect, it } from 'vitest';
import { SENSE, bodyPoints, canSeePlayer, footstepRange, heardPosition, inFov, shotRange, viewAngle } from './botPerception';
import { colliderFor } from './collision';
import { STEP } from './audioMix';

const floor = { minX: -60, maxX: 60, minY: -1, maxY: 0, minZ: -60, maxZ: 60 };
const wall = { minX: 9.8, maxX: 10.2, minY: 0, maxY: 4, minZ: -2, maxZ: 2 };
const crate = { minX: 4.5, maxX: 5.5, minY: 0, maxY: 1.35, minZ: 5, maxZ: 9 };
const col = colliderFor([floor, wall, crate]);
const eye = { x: 0, y: 1.6, z: 0 };
// yaw so, dass der Blick nach +x zeigt (Kamera-Konvention: Vorwärts = (−sin yaw, −cos yaw))
const lookX = -Math.PI / 2;

describe('Bot-Wahrnehmung', () => {
  it('Blickfeld: vorne ja, hinten nein', () => {
    expect(inFov(lookX, eye, { x: 10, y: 0, z: 1 })).toBe(true);
    expect(inFov(lookX, eye, { x: 10, y: 0, z: 8 })).toBe(true); // ~39°
    expect(inFov(lookX, eye, { x: -10, y: 0, z: 0 })).toBe(false);
    expect(inFov(lookX, eye, { x: 0, y: 0, z: 10 })).toBe(false); // 90° seitlich
  });

  it('Blickwinkel zum Ziel (horizontal)', () => {
    expect(viewAngle(lookX, eye, { x: 10, y: 3, z: 0 })).toBeCloseTo(0, 5);
    expect(viewAngle(lookX, eye, { x: 0, y: 0, z: 10 })).toBeCloseTo(Math.PI / 2, 5);
    expect(viewAngle(lookX, eye, { x: -10, y: 0, z: 0 })).toBeCloseTo(Math.PI, 5);
    expect(viewAngle(lookX, eye, { x: 10, y: 0, z: 10 })).toBeCloseTo(Math.PI / 4, 5);
  });

  it('Sicht: Wand blockiert, Rauch blockiert, ganz nah auch ohne Blickfeld, Reichweite', () => {
    expect(canSeePlayer(col, [], eye, lookX, { x: 6, y: 0, z: -5 }, false)).toBe(true);
    expect(canSeePlayer(col, [], eye, lookX, { x: 14, y: 0, z: 0 }, false)).toBe(false);
    const smoke = [{ pos: { x: 3, y: 1.4, z: -2.5 }, radius: 2, timeLeft: 5 }];
    expect(canSeePlayer(col, smoke, eye, lookX, { x: 6, y: 0, z: -5 }, false)).toBe(false);
    expect(canSeePlayer(col, [], eye, lookX, { x: -2, y: 0, z: 0 }, false)).toBe(true);
    expect(canSeePlayer(col, [], eye, lookX, { x: -6, y: 0, z: 0 }, false)).toBe(false);
    expect(canSeePlayer(col, [], eye, lookX, { x: SENSE.sight + 5, y: 0, z: 0 }, false)).toBe(false);
  });

  it('geduckt hinter einer Kiste unsichtbar, stehend sichtbar (Kopf ragt drüber)', () => {
    const behind = { x: 7, y: 0, z: 10 };
    const look = Math.atan2(-7, -10);
    expect(canSeePlayer(col, [], eye, look, behind, false)).toBe(true);
    expect(canSeePlayer(col, [], eye, look, behind, true)).toBe(false);
    expect(bodyPoints(behind, true)[0]!.y).toBeLessThan(bodyPoints(behind, false)[0]!.y);
  });

  it('Schritte: Ducken und Schleichen lautlos, Gehen leiser als Rennen', () => {
    expect(footstepRange(6.2, true)).toBe(0);
    expect(footstepRange(STEP.minSpeed - 0.1, false)).toBe(0);
    expect(footstepRange(4.2, false)).toBeCloseTo(SENSE.stepsWalk);
    expect(footstepRange(6.2, false)).toBeCloseTo(SENSE.stepsRun);
    expect(footstepRange(5, false)).toBeGreaterThan(SENSE.stepsWalk);
  });

  it('Schüsse: Schalldämpfer leiser, Messer kaum hörbar', () => {
    expect(shotRange('ak47')).toBe(SENSE.shot);
    expect(shotRange('usp')).toBe(SENSE.shotSuppressed);
    expect(shotRange('knife')).toBeLessThan(10);
  });

  it('gehörte Position: Unschärfe wächst mit der Entfernung, höchstens 4 m', () => {
    let k = 0;
    const rnd = () => ((k = (k * 9301 + 49297) % 233280), k / 233280);
    for (const d of [5, 30, 120]) {
      for (let i = 0; i < 20; i++) {
        const h = heardPosition({ x: 0, y: 0, z: 0 }, { x: d, y: 0, z: 0 }, rnd);
        const blur = Math.min(4, d * 0.08);
        expect(Math.abs(h.x - d)).toBeLessThanOrEqual(blur + 1e-9);
        expect(Math.abs(h.z)).toBeLessThanOrEqual(blur + 1e-9);
      }
    }
  });
});
