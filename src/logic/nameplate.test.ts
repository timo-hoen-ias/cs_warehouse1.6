import { describe, expect, it } from 'vitest';
import { nameplateVisible } from './nameplate';

describe('nameplateVisible', () => {
  it('zeigt Schilder lebender Kameraden', () => {
    expect(nameplateVisible('T', 'T', true)).toBe(true);
    expect(nameplateVisible('CT', 'CT', true)).toBe(true);
  });

  it('zeigt nie Schilder von Gegnern (sonst durch Wände zu orten)', () => {
    expect(nameplateVisible('T', 'CT', true)).toBe(false);
    expect(nameplateVisible('CT', 'T', true)).toBe(false);
  });

  it('keine Schilder für Tote und ohne eigenes Team', () => {
    expect(nameplateVisible('T', 'T', false)).toBe(false);
    expect(nameplateVisible(undefined, 'T', true)).toBe(false);
    expect(nameplateVisible(null, 'CT', true)).toBe(false);
  });
});
