import { describe, expect, it } from 'vitest';
import { BUY_ZONE_RADIUS, beepInterval, inBuyZone, inRadius, spotAt } from './zones';

const spots = { a: { x: 10, z: 0 }, b: { x: -10, z: 0 } };

describe('inRadius', () => {
  it('innen/außen', () => {
    expect(inRadius(10.5, 0, spots.a, 2)).toBe(true);
    expect(inRadius(13, 0, spots.a, 2)).toBe(false);
  });
});

describe('spotAt', () => {
  it('erkennt Spot a und b', () => {
    expect(spotAt(10, 0, spots)).toBe('a');
    expect(spotAt(-10, 0, spots)).toBe('b');
  });

  it('außerhalb → null', () => {
    expect(spotAt(0, 0, spots)).toBeNull();
  });

  it('a hat Vorrang bei Überlappung', () => {
    expect(spotAt(0, 0, { a: { x: 1, z: 0 }, b: { x: -1, z: 0 } })).toBe('a');
  });
});

describe('Kaufzone / Bomben-Piepen', () => {
  const zones = { t: { x: 0, z: -40 }, ct: { x: 0, z: 40 } };
  it('nur nahe dem eigenen Spawn kaufen', () => {
    expect(inBuyZone(0, -35, 'T', zones)).toBe(true);
    expect(inBuyZone(0, -35, 'CT', zones)).toBe(false);
    expect(inBuyZone(0, 40 - BUY_ZONE_RADIUS - 1, 'CT', zones)).toBe(false);
    expect(inBuyZone(3, 38, 'CT', zones)).toBe(true);
  });
  it('Piep-Intervall: 1 s bei voller Zeit, monoton fallend bis 0.1 s', () => {
    expect(beepInterval(40)).toBeCloseTo(1);
    expect(beepInterval(0)).toBeCloseTo(0.1);
    expect(beepInterval(20)).toBeLessThan(beepInterval(30));
    expect(beepInterval(99)).toBeCloseTo(1);
  });
});
