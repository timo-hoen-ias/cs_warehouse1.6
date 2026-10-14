import { describe, expect, it } from 'vitest';
import { makeRecoil, fireRecoil, tickRecoil, RAMP_RESET_IDLE, sprayOffset, defaultSpray, VIEW_PUNCH_SHARE } from './recoil';
import type { RecoilSpec } from './recoil';

const spec: RecoilSpec = { up: 0.02, side: 0.004, ramp: 0.2, cap: 0.05, recovery: 0.4 };
const zeroRnd = () => 0.5; // yaw-neutral

describe('fireRecoil', () => {
  it('ein Schuss kippt um up nach oben', () => {
    const s = makeRecoil();
    const kick = fireRecoil(spec, s, zeroRnd);
    expect(kick.pitch).toBeCloseTo(spec.up);
    expect(s.pitch).toBeCloseTo(spec.up);
  });

  it('Dauerfeuer baut mit Ramp auf und deckelt bei cap', () => {
    const s = makeRecoil();
    for (let i = 0; i < 20; i++) fireRecoil(spec, s, zeroRnd);
    expect(s.pitch).toBeLessThanOrEqual(spec.cap);
    expect(s.shots).toBe(20);
  });

  it('später Schuss hat höheren Kick (Ramp) als der erste', () => {
    const s = makeRecoil();
    const first = fireRecoil(spec, s, zeroRnd).pitch;
    const last = fireRecoil(spec, s, zeroRnd).pitch;
    expect(last).toBeGreaterThan(first);
  });

  it('lateraler Anteil bleibt im ±side-Bereich', () => {
    const s = makeRecoil();
    fireRecoil(spec, s, () => 0); // min
    expect(s.yaw).toBeLessThanOrEqual(0);
    fireRecoil(spec, s, () => 1); // max
    expect(s.yaw).toBeGreaterThanOrEqual(-spec.side);
    expect(s.yaw).toBeLessThanOrEqual(spec.side);
  });
});

describe('tickRecoil / Recovery', () => {
  it('während firing bleibt der Offset bestehen', () => {
    const s = makeRecoil();
    fireRecoil(spec, s, zeroRnd);
    const p = s.pitch;
    tickRecoil(spec, s, 0.1, true);
    expect(s.pitch).toBeCloseTo(p);
  });

  it('nach Schusspause klingt der Offset ab Richtung 0', () => {
    const s = makeRecoil();
    fireRecoil(spec, s, zeroRnd);
    // Erholung beginnt erst nach RECOVERY_DELAY Pause
    tickRecoil(spec, s, 0.2, false);
    tickRecoil(spec, s, 0.4, false);
    expect(s.pitch).toBeLessThan(spec.up);
    expect(s.pitch).toBeGreaterThanOrEqual(0);
  });

  it('lange Pause setzt den Ramp (shots) zurück', () => {
    const s = makeRecoil();
    fireRecoil(spec, s, zeroRnd);
    fireRecoil(spec, s, zeroRnd);
    tickRecoil(spec, s, RAMP_RESET_IDLE + 0.1, false);
    expect(s.shots).toBe(0);
  });
});

describe('sprayOffset (CS-Spray-Muster)', () => {
  const shape = { climb: 0.01, climbShots: 9, sway: 0.03, swayPeriod: 14, swayDir: -1 as const };

  it('erster Schuss liegt exakt im Fadenkreuz', () => {
    expect(sprayOffset(shape, 0)).toEqual({ pitch: 0, yaw: -0 });
  });

  it('Steigphase: gerade nach oben, monoton', () => {
    let prev = -1;
    for (let i = 0; i <= 9; i++) {
      const o = sprayOffset(shape, i);
      expect(o.pitch).toBeGreaterThan(prev);
      expect(Math.abs(o.yaw)).toBeLessThanOrEqual(shape.sway * 0.15 + 1e-12);
      prev = o.pitch;
    }
    expect(sprayOffset(shape, 9).pitch).toBeCloseTo(0.09, 10);
  });

  it('danach Pendeln: erst in swayDir, dann Gegenrichtung', () => {
    const quarter = Math.round(shape.swayPeriod / 4);
    const first = sprayOffset(shape, 9 + quarter);
    const second = sprayOffset(shape, 9 + quarter * 3);
    expect(Math.sign(first.yaw)).toBe(-1);
    expect(Math.sign(second.yaw)).toBe(1);
    expect(Math.abs(first.yaw)).toBeCloseTo(shape.sway, 2);
  });

  it('deterministisch und lernbar (gleiche Eingabe → gleiches Muster)', () => {
    for (let i = 0; i < 30; i++) expect(sprayOffset(shape, i)).toEqual(sprayOffset(shape, i));
  });

  it('negative/ungerade Indizes werden sauber behandelt', () => {
    expect(sprayOffset(shape, -3)).toEqual(sprayOffset(shape, 0));
    expect(sprayOffset(shape, 4.7)).toEqual(sprayOffset(shape, 4));
  });

  it('defaultSpray: Automatikwaffen ja, Semi/Sniper nein', () => {
    expect(defaultSpray('rifle', 600)).not.toBeNull();
    expect(defaultSpray('smg', 800)).not.toBeNull();
    expect(defaultSpray('sniper', 0)).toBeNull();
    expect(defaultSpray('pistol', 0)).toBeNull();
    expect(defaultSpray('shotgun', 70)).toBeNull();
    expect(VIEW_PUNCH_SHARE).toBeGreaterThan(0);
    expect(VIEW_PUNCH_SHARE).toBeLessThan(1);
  });
});
