import { describe, expect, it } from 'vitest';
import {
  OCCLUSION, STEP, advanceStep, airLowpass, beepPitch, busGains, distanceGain, earRing, flybyCheck, flybyGain, isBounce,
  asSurface, keypadPresses, nearFarMix, segmentBlocked, newVertical, pickVariant, randomPitch, reverbSend, stepGain, stepStride, trackVertical, type StepState,
} from './audioMix';
import { mulberry32 } from './rng';

describe('busGains', () => {
  it('klemmt und biegt die Kanäle quadratisch', () => {
    const g = busGains({ volume: 0.5, volumeEffects: 1, volumeAmbience: 2, volumeUi: -1 });
    expect(g.master).toBeCloseTo(0.25);
    expect(g.effects).toBe(1);
    expect(g.ambience).toBe(1);
    expect(g.ui).toBe(0);
  });
  it('NaN wird stumm statt kaputt', () => {
    expect(busGains({ volume: NaN, volumeEffects: 1, volumeAmbience: 1, volumeUi: 1 }).master).toBe(0);
  });
});

describe('pickVariant', () => {
  it('wiederholt nie direkt dieselbe Variante', () => {
    const rnd = mulberry32(7);
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const v = pickVariant(4, last, rnd);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      expect(v).not.toBe(last);
      seen.add(v);
      last = v;
    }
    expect(seen.size).toBe(4);
  });
  it('eine Variante → immer 0, auch bei rnd = 1', () => {
    expect(pickVariant(1, 0, () => 0.99)).toBe(0);
    expect(pickVariant(3, -1, () => 0.9999999)).toBe(2);
    expect(pickVariant(2, 1, () => 0.9999999)).toBe(0);
  });
});

describe('randomPitch', () => {
  it('liegt im Bereich', () => {
    expect(randomPitch([0.9, 1.1], () => 0)).toBeCloseTo(0.9);
    expect(randomPitch([0.9, 1.1], () => 1)).toBeCloseTo(1.1);
    expect(randomPitch([1, 1], () => 0.5)).toBe(1);
  });
});

describe('distanceGain', () => {
  it('voll bis ref, monoton fallend, 0 ab maxDist', () => {
    expect(distanceGain(0, 4, 160)).toBe(1);
    expect(distanceGain(4, 4, 160)).toBe(1);
    let prev = 1;
    for (let d = 5; d < 170; d += 5) {
      const g = distanceGain(d, 4, 160);
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
    expect(distanceGain(160, 4, 160)).toBe(0);
    expect(distanceGain(500, 4, 160)).toBe(0);
  });
  it('Gewehrschuss ist auf 100 m noch deutlich hörbar (CS-Gefühl)', () => {
    expect(distanceGain(100, 4, 170)).toBeGreaterThan(0.04);
  });
});

describe('airLowpass / nearFarMix / reverbSend', () => {
  it('Höhen verschwinden mit Abstand, aber nie unter 1.5 kHz', () => {
    expect(airLowpass(0)).toBe(22000);
    expect(airLowpass(30)).toBeLessThan(15000);
    expect(airLowpass(100)).toBeLessThan(airLowpass(30));
    expect(airLowpass(10000)).toBe(1500);
  });
  it('Nah/Fern überblendet mit konstanter Leistung', () => {
    expect(nearFarMix(0)).toEqual({ near: 1, far: 0 });
    const m = nearFarMix(30);
    expect(m.near ** 2 + m.far ** 2).toBeCloseTo(1);
    expect(nearFarMix(100).near).toBeCloseTo(0);
    expect(nearFarMix(100).far).toBeCloseTo(1);
  });
  it('ferne Quellen bekommen mehr Hall', () => {
    expect(reverbSend(40, 0.5, 1)).toBeGreaterThan(reverbSend(1, 0.5, 1));
    expect(reverbSend(10, 0, 1)).toBe(0);
  });
  it('Verdeckung dämpft und filtert', () => {
    expect(OCCLUSION.gain).toBeLessThan(1);
    expect(OCCLUSION.cutoff).toBeLessThan(2000);
  });
});

describe('Schritte', () => {
  it('geduckt oder langsam lautlos, Sprint lauter als Gehen', () => {
    expect(stepGain(5, true)).toBe(0);
    expect(stepGain(2, false)).toBe(0);
    expect(stepGain(4.2, false)).toBeGreaterThan(0);
    // Shift-Schleichen mit dem Messer (52 % von 6.2 m/s) ist lautlos, Rennen nicht
    expect(stepGain(6.2 * 0.52, false)).toBe(0);
    expect(stepGain(6.2, false)).toBeGreaterThan(0);
    expect(stepGain(6.2, false)).toBeGreaterThan(stepGain(4.2, false));
    expect(stepGain(6.2, false)).toBeCloseTo(1);
  });
  it('Schrittlänge wächst mit Tempo; Takt wechselt die Füße', () => {
    expect(stepStride(6)).toBeGreaterThan(stepStride(3));
    const s: StepState = { acc: 0, foot: 0 };
    const dt = 1 / 60;
    const speed = 4.2;
    let steps = 0;
    const feet: number[] = [];
    for (let i = 0; i < 60 * 4; i++) {
      if (advanceStep(s, speed * dt, speed, false)) {
        steps += 1;
        feet.push(s.foot);
      }
    }
    // 4 s × 4.2 m/s ≈ 16.8 m / ~1.65 m ≈ 10 Schritte
    expect(steps).toBeGreaterThanOrEqual(9);
    expect(steps).toBeLessThanOrEqual(11);
    expect(feet[0]).not.toBe(feet[1]);
  });
  it('Teleport und Ducken zählen nicht', () => {
    const s: StepState = { acc: 0, foot: 0 };
    expect(advanceStep(s, 5, 4, false)).toBe(false);
    expect(advanceStep(s, 3, 4, true)).toBe(false);
    expect(s.acc).toBe(0);
    expect(STEP.minSpeed).toBeGreaterThan(PLAYER_CROUCH);
  });
});
const PLAYER_CROUCH = 2.4;

describe('flybyCheck', () => {
  const o = { x: 0, y: 1.6, z: 0 };
  it('erkennt Kugel, die knapp vorbeizischt', () => {
    const f = flybyCheck(o, { x: 0, y: 1.6, z: -60 }, { x: 1, y: 1.6, z: -30 });
    expect(f).not.toBeNull();
    expect(f!.dist).toBeCloseTo(1);
    expect(f!.point.z).toBeCloseTo(-30);
    expect(flybyGain(f!.dist)).toBeGreaterThan(flybyGain(1.9));
  });
  it('zu weit weg, Schütze selbst oder Kugel endet vorher → nichts', () => {
    expect(flybyCheck(o, { x: 0, y: 1.6, z: -60 }, { x: 5, y: 1.6, z: -30 })).toBeNull();
    expect(flybyCheck(o, { x: 0, y: 1.6, z: -60 }, { x: 0.5, y: 1.6, z: -1 })).toBeNull();
    expect(flybyCheck(o, { x: 0, y: 1.6, z: -10 }, { x: 0.5, y: 1.6, z: -30 })).toBeNull();
    expect(flybyCheck(o, { x: 0, y: 1.6, z: -30.2 }, { x: 0.5, y: 1.6, z: -30 })).toBeNull();
  });
});

describe('earRing', () => {
  it('stärker geblendet → länger, lauter, dumpfer', () => {
    expect(earRing(0.05).duration).toBe(0);
    const w = earRing(0.3);
    const s = earRing(1);
    expect(s.duration).toBeGreaterThan(w.duration);
    expect(s.gain).toBeGreaterThan(w.gain);
    expect(s.cutoff).toBeLessThan(w.cutoff);
    expect(s.duck).toBeLessThan(w.duck);
    expect(s.duration).toBeCloseTo(5.5);
    expect(earRing(NaN).duration).toBe(0);
  });
});

describe('trackVertical', () => {
  const simulate = (ys: number[], dt = 1 / 60) => {
    const s = newVertical();
    return ys.map((y) => trackVertical(s, y, dt)).filter((e) => e !== null);
  };
  it('Sprung und Landung', () => {
    // Parabel: v0 = 7, g = 20 → ~0.7 s Flug
    const ys: number[] = [0, 0, 0];
    for (let t = 1 / 60; t < 0.7; t += 1 / 60) ys.push(Math.max(0, 7 * t - 10 * t * t));
    ys.push(0, 0, 0, 0);
    const ev = simulate(ys);
    expect(ev[0]).toEqual({ kind: 'jump' });
    expect(ev[1]?.kind).toBe('land');
    expect(ev.length).toBe(2);
  });
  it('Treppenstufe löst nichts aus', () => {
    expect(simulate([0, 0, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0])).toEqual([]);
  });
  it('Fall von einer Kante: nur Landung, kräftig', () => {
    const ys = [2, 2];
    let y = 2;
    let v = 0;
    while (y > 0) {
      v -= 20 / 60;
      y = Math.max(0, y + v / 60);
      ys.push(y);
    }
    ys.push(0, 0, 0);
    const ev = simulate(ys);
    expect(ev.length).toBe(1);
    expect(ev[0]!.kind).toBe('land');
    expect((ev[0] as { strength: number }).strength).toBeGreaterThan(0.4);
  });
});

describe('isBounce', () => {
  it('Aufprall am Boden und an Wänden', () => {
    expect(isBounce({ x: 3, y: -5, z: 0 }, { x: 2, y: 3, z: 0 })).toBe(true);
    expect(isBounce({ x: 8, y: 0, z: 0 }, { x: -4, y: 0, z: 0 })).toBe(true);
  });
  it('normaler Flug und Liegen ist kein Abpraller', () => {
    expect(isBounce({ x: 8, y: 2, z: 0 }, { x: 8, y: 1.6, z: 0 })).toBe(false);
    expect(isBounce({ x: 0.2, y: -0.5, z: 0 }, { x: 0, y: 0.3, z: 0 })).toBe(false);
  });
});

describe('keypadPresses / beepPitch', () => {
  it('7 Tastendrücke über das ganze Legen, erster sofort', () => {
    let prev = -1;
    let total = 0;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      total += keypadPresses(prev, p, 7);
      prev = p;
    }
    expect(total).toBe(7);
    expect(keypadPresses(-1, 0, 7)).toBe(1);
    expect(keypadPresses(0.5, 0.4)).toBe(0);
  });
  it('Piepen wird am Ende höher', () => {
    expect(beepPitch(30)).toBe(1);
    expect(beepPitch(3)).toBeGreaterThan(1);
    expect(beepPitch(1)).toBeGreaterThan(beepPitch(3));
  });
});

describe('asSurface / segmentBlocked', () => {
  it('unbekannte Oberflächen werden Beton', () => {
    expect(asSurface('metal')).toBe('metal');
    expect(asSurface('lava')).toBe('concrete');
    expect(asSurface(undefined)).toBe('concrete');
  });
  it('Wand zwischen Hörer und Quelle verdeckt, freie Sicht nicht', () => {
    const wall = { minX: 4, maxX: 5, minY: 0, maxY: 4, minZ: -5, maxZ: 5 };
    const a = { x: 0, y: 1.6, z: 0 };
    expect(segmentBlocked(a, { x: 10, y: 1.6, z: 0 }, [wall])).toBe(true);
    expect(segmentBlocked(a, { x: 10, y: 1.6, z: 20 }, [wall])).toBe(false);
    expect(segmentBlocked(a, { x: 3, y: 1.6, z: 0 }, [wall])).toBe(false);
    // Quelle direkt an der Wand (Einschlag) gilt nicht als verdeckt
    expect(segmentBlocked(a, { x: 3.9, y: 1.6, z: 0 }, [wall])).toBe(false);
  });
});
