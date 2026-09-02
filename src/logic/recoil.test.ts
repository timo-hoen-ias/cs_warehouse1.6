import { describe, expect, it } from 'vitest';
import { makeRecoil, fireRecoil, tickRecoil, RAMP_RESET_IDLE } from './recoil';
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
