import { describe, expect, it } from 'vitest';
import { fallbackAcoustics } from './ambientFallback';
import { emitterGain, roomAt } from './acoustics';
import { AMBIENT_SAMPLE } from './soundBank';
import { mulberry32 } from './rng';

const inner = { minX: -40, maxX: 40, minZ: -60, maxZ: 60 };

describe('fallbackAcoustics', () => {
  it('Halle als Zone, außerhalb draußen', () => {
    const { zones } = fallbackAcoustics(inner, 12, [], mulberry32(1));
    expect(roomAt(zones, 0, 1.6, 0)).toBe('hall');
    expect(roomAt(zones, 0, 1.6, 80)).toBe('outdoor');
  });
  it('verteilt Quellen innerhalb der Halle; jede hat ein Sample', () => {
    const { emitters } = fallbackAcoustics(inner, 12, [{ x: 10, z: 61 }], mulberry32(2));
    expect(emitters.length).toBeGreaterThan(8);
    for (const e of emitters) {
      expect(AMBIENT_SAMPLE[e.sound]).toBeDefined();
      expect(e.radius).toBeGreaterThan(0);
      expect(e.pos[1]).toBeLessThanOrEqual(12);
    }
    expect(emitters.filter((e) => e.sound === 'ventilation').length).toBe(3 * 4);
    expect(emitters.some((e) => e.sound === 'forklift' && e.pos[0] === 10)).toBe(true);
  });
  it('irgendwo in der Halle ist immer etwas zu hören', () => {
    const { emitters } = fallbackAcoustics(inner, 12, [], mulberry32(3));
    for (let x = -36; x <= 36; x += 12) {
      for (let z = -56; z <= 56; z += 14) {
        const sum = emitters.reduce((s, e) => s + emitterGain(e, x, 1.6, z), 0);
        expect(sum, `${x},${z}`).toBeGreaterThan(0);
      }
    }
  });
  it('deterministisch und robust bei leerer Halle', () => {
    expect(fallbackAcoustics(inner, 12, [], mulberry32(5))).toEqual(fallbackAcoustics(inner, 12, [], mulberry32(5)));
    expect(fallbackAcoustics({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, 0, [], mulberry32(5)).emitters).toEqual([]);
  });
});
