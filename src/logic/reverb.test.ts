import { describe, expect, it } from 'vitest';
import { REVERB, buildImpulse, impulseLength } from './reverb';
import { mulberry32 } from './rng';
import type { RoomKind } from './acoustics';

const SR = 8000;
const energy = (d: Float32Array, a: number, b: number): number => {
  let e = 0;
  for (let i = Math.floor(a); i < Math.min(d.length, Math.floor(b)); i++) e += d[i]! * d[i]!;
  return e;
};

describe('REVERB-Tabelle', () => {
  it('deckt alle Raumarten ab, Halle hallt am längsten, draußen am kürzesten', () => {
    const kinds: RoomKind[] = ['outdoor', 'hall', 'room', 'tunnel', 'cold'];
    for (const k of kinds) {
      const s = REVERB[k];
      expect(s.decay).toBeGreaterThan(0);
      expect(s.wet).toBeGreaterThan(0);
      expect(s.damping).toBeLessThanOrEqual(s.brightness);
    }
    expect(REVERB.hall.decay).toBe(Math.max(...kinds.map((k) => REVERB[k].decay)));
    expect(REVERB.outdoor.decay).toBe(Math.min(...kinds.map((k) => REVERB[k].decay)));
    expect(REVERB.tunnel.flutter).toBeDefined();
    expect(REVERB.cold.damping).toBeLessThan(REVERB.hall.damping);
  });
});

describe('buildImpulse', () => {
  it('Länge = Vorverzögerung + RT60, gedeckelt', () => {
    const [l, r] = buildImpulse(REVERB.room, SR, mulberry32(1));
    expect(l.length).toBe(impulseLength(REVERB.room, SR));
    expect(r.length).toBe(l.length);
    expect(impulseLength(REVERB.hall, SR, 1)).toBe(SR);
  });
  it('ist deterministisch, normiert und stereo verschieden', () => {
    const a = buildImpulse(REVERB.hall, SR, mulberry32(5));
    const b = buildImpulse(REVERB.hall, SR, mulberry32(5));
    expect(Array.from(a[0].slice(0, 500))).toEqual(Array.from(b[0].slice(0, 500)));
    let peak = 0;
    for (const ch of a) for (const v of ch) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(1);
    expect(Array.from(a[0].slice(300, 400))).not.toEqual(Array.from(a[1].slice(300, 400)));
  });
  it('klingt ab: späte Energie ≪ frühe Energie', () => {
    for (const k of ['hall', 'tunnel', 'room', 'cold', 'outdoor'] as RoomKind[]) {
      const [l] = buildImpulse(REVERB[k], SR, mulberry32(3));
      const n = l.length;
      expect(energy(l, n * 0.75, n)).toBeLessThan(energy(l, 0, n * 0.25) * 0.05);
    }
  });
  it('Tunnel hat periodische Flatterechos', () => {
    const spec = REVERB.tunnel;
    const [l] = buildImpulse({ ...spec, diffuse: 0 }, SR, mulberry32(9));
    const step = Math.round(spec.flutter!.period * SR);
    const pre = Math.round(spec.preDelay * SR);
    // Spitzen exakt im Flatter-Raster
    expect(Math.abs(l[pre + step * 3]!)).toBeGreaterThan(0.05);
    expect(Math.abs(l[pre + step * 3 + Math.floor(step / 2)]!)).toBeLessThan(0.01);
  });
});
