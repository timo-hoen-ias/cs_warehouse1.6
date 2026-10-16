import { describe, expect, it } from 'vitest';
import { CROUCH_DROP, FALL_TIME, LEG, fallPose, legHeading, LEG_TURN_MAX, solveLegAngles, solveTwoBone, walkPose } from './soldierAnim';

/** Vorwärts-Kinematik: Knöchelposition (y, z) relativ zur Hüfte; rotation.x dreht ein Abwärts-Segment nach (−cos, −sin). */
function ankle(drop: number) {
  const { thigh, shin } = solveLegAngles(drop);
  const abs = thigh + shin;
  const y = -LEG.thigh * Math.cos(thigh) - LEG.shin * Math.cos(abs);
  const z = -LEG.thigh * Math.sin(thigh) - LEG.shin * Math.sin(abs);
  return { y: LEG.hipY - drop + y, z };
}

describe('solveLegAngles', () => {
  it('steht gestreckt ohne Absenkung', () => {
    const a = solveLegAngles(0);
    expect(a.thigh).toBeCloseTo(0, 1);
    expect(a.shin).toBeCloseTo(0, 1);
  });
  it('Ducken: Knie nach vorn, Unterschenkel angewinkelt', () => {
    const a = solveLegAngles(CROUCH_DROP);
    expect(a.thigh).toBeLessThan(-0.5);
    expect(a.shin).toBeGreaterThan(0.5);
  });
  it('Fuß bleibt beim Ducken am Boden und unter der Hüfte', () => {
    for (const drop of [0.1, 0.25, CROUCH_DROP]) {
      const p = ankle(drop);
      expect(p.y).toBeCloseTo(LEG.ankle, 2);
      expect(Math.abs(p.z)).toBeLessThan(0.01);
    }
  });
  it('wird bei übergroßer Absenkung nicht NaN', () => {
    const a = solveLegAngles(5);
    expect(Number.isFinite(a.thigh) && Number.isFinite(a.shin)).toBe(true);
  });
});

describe('walkPose', () => {
  it('ohne Amplitude keine Bewegung', () => {
    const w = walkPose(1.3, 0);
    expect(w.swing).toBe(0);
    expect(w.bob).toBe(0);
    expect(w.kneeL + w.kneeR).toBe(0);
  });
  it('Beine schwingen gegenläufig, Knie nie negativ', () => {
    for (let p = 0; p < 6.3; p += 0.3) {
      const w = walkPose(p, 0.6);
      expect(w.kneeL).toBeGreaterThanOrEqual(0);
      expect(w.kneeR).toBeGreaterThanOrEqual(0);
      expect(Math.abs(w.swing)).toBeLessThanOrEqual(0.6);
    }
    expect(walkPose(Math.PI / 2, 0.6).swing).toBeCloseTo(0.6);
  });
});

describe('solveTwoBone', () => {
  const s = { x: 0, y: 0, z: 0 };
  it('Segmentlängen bleiben erhalten und Hand wird erreicht', () => {
    const h = { x: 0.2, y: -0.1, z: 0.4 };
    const e = solveTwoBone(s, h, 0.3, 0.3, { x: 0, y: -1, z: 0 });
    expect(Math.hypot(e.x, e.y, e.z)).toBeCloseTo(0.3, 5);
    expect(Math.hypot(h.x - e.x, h.y - e.y, h.z - e.z)).toBeCloseTo(0.3, 5);
  });
  it('Ellbogen weicht zum Pol aus (nach unten)', () => {
    const e = solveTwoBone(s, { x: 0, y: 0, z: 0.4 }, 0.3, 0.3, { x: 0, y: -1, z: 0 });
    expect(e.y).toBeLessThan(0);
  });
  it('zu weites Ziel: Arm gestreckt statt NaN', () => {
    const e = solveTwoBone(s, { x: 0, y: 0, z: 5 }, 0.3, 0.3, { x: 0, y: -1, z: 0 });
    expect(Number.isFinite(e.x + e.y + e.z)).toBe(true);
    expect(e.z).toBeCloseTo(0.3, 2);
  });
  it('Ziel = Schulter liefert endlichen Wert', () => {
    const e = solveTwoBone(s, s, 0.3, 0.3, { x: 0, y: -1, z: 0 });
    expect(e.y).toBeCloseTo(-0.3);
  });
});

describe('fallPose', () => {
  it('Start steht, Ende liegt (90°) und bleibt dort', () => {
    expect(fallPose(0, 1).rotX).toBe(0);
    const end = fallPose(FALL_TIME, -1, 0.2);
    expect(end.rotX).toBeCloseTo(-Math.PI / 2);
    expect(end.rotZ).toBeCloseTo(0.2);
    expect(fallPose(10, -1).rotX).toBeCloseTo(-Math.PI / 2);
    expect(fallPose(10, 1).t).toBe(1);
  });
  it('monoton steigend', () => {
    let prev = -1;
    for (let t = 0; t <= FALL_TIME; t += 0.04) {
      const f = fallPose(t, 1).rotX;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

describe('legHeading', () => {
  it('vorwärts: Beine wie der Oberkörper', () => {
    expect(legHeading(0.3, 0.3)).toEqual({ offset: 0, dir: 1 });
  });

  it('seitwärts: Hüfte dreht in die Laufrichtung (gedeckelt)', () => {
    const left = legHeading(Math.PI / 2, 0);
    expect(left.dir).toBe(1);
    expect(left.offset).toBeCloseTo(Math.min(Math.PI / 2, LEG_TURN_MAX));
    expect(legHeading(-0.5, 0).offset).toBeCloseTo(-0.5);
  });

  it('rückwärts: Beine nach vorn, Gehzyklus rückwärts', () => {
    expect(legHeading(Math.PI, 0)).toEqual({ offset: 0, dir: -1 });
    const diag = legHeading(Math.PI - 0.4, 0);
    expect(diag.dir).toBe(-1);
    expect(diag.offset).toBeCloseTo(-0.4);
  });

  it('über die ±π-Grenze hinweg', () => {
    const r = legHeading(-Math.PI + 0.1, Math.PI - 0.1);
    expect(r).toEqual({ offset: expect.closeTo(0.2, 5), dir: 1 });
  });
});
