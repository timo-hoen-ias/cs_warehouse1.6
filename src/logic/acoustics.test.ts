import { describe, expect, it } from 'vitest';
import { emitterGain, roomAt, type AcousticZone } from './acoustics';

const zones: AcousticZone[] = [
  { kind: 'hall', min: [0, 0, 0], max: [100, 12, 100] },
  { kind: 'room', min: [10, 0, 10], max: [20, 4, 20] },
];

describe('roomAt', () => {
  it('nimmt die kleinste umschließende Zone', () => {
    expect(roomAt(zones, 15, 1, 15)).toBe('room');
    expect(roomAt(zones, 50, 1, 50)).toBe('hall');
  });
  it('liefert außerhalb den Fallback', () => {
    expect(roomAt(zones, -5, 1, 0)).toBe('outdoor');
    expect(roomAt(zones, -5, 1, 0, 'tunnel')).toBe('tunnel');
  });
});

describe('emitterGain', () => {
  const e = { sound: 'machine' as const, pos: [0, 0, 0] as [number, number, number], radius: 10, volume: 0.5 };
  it('ist am Ort maximal und fällt bis zum Radius auf 0', () => {
    expect(emitterGain(e, 0, 0, 0)).toBeCloseTo(0.5);
    expect(emitterGain(e, 5, 0, 0)).toBeCloseTo(0.125);
    expect(emitterGain(e, 10, 0, 0)).toBe(0);
    expect(emitterGain(e, 30, 0, 0)).toBe(0);
  });
});
