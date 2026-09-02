import { describe, expect, it } from 'vitest';
import { inRadius, spotAt } from './zones';

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
