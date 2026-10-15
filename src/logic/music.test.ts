import { describe, expect, it } from 'vitest';
import { MENU_TRACKS, fadeFactor, musicGain, nextTrackIndex } from './music';
import { mulberry32 } from './demo';

describe('MENU_TRACKS', () => {
  it('1–3 Titel, alle mit Datei, Autor, Lizenz und Quelle', () => {
    expect(MENU_TRACKS.length).toBeGreaterThanOrEqual(1);
    expect(MENU_TRACKS.length).toBeLessThanOrEqual(3);
    for (const t of MENU_TRACKS) {
      expect(t.file).toMatch(/^assets\/audio\/music\/[a-z0-9_]+\.ogg$/);
      expect(t.author).toContain('Stegall');
      expect(t.license).toBe('CC BY-SA');
      expect(t.source).toMatch(/^https:\/\//);
    }
    expect(new Set(MENU_TRACKS.map((t) => t.id)).size).toBe(MENU_TRACKS.length);
  });
});

describe('nextTrackIndex', () => {
  it('wiederholt nie denselben Titel direkt', () => {
    const rnd = mulberry32(7);
    let cur = 0;
    for (let i = 0; i < 200; i++) {
      const n = nextTrackIndex(cur, 3, rnd);
      expect(n).not.toBe(cur);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(3);
      cur = n;
    }
  });

  it('erreicht alle Titel', () => {
    const rnd = mulberry32(3);
    const seen = new Set<number>();
    let cur = -1;
    for (let i = 0; i < 50; i++) seen.add((cur = nextTrackIndex(cur, 3, rnd)));
    expect(seen.size).toBe(3);
  });

  it('Sonderfälle: leer, ein Titel, Start ohne aktuellen Titel, rnd = 0.9999', () => {
    expect(nextTrackIndex(0, 0)).toBe(-1);
    expect(nextTrackIndex(0, 1)).toBe(0);
    expect(nextTrackIndex(-1, 3, () => 0.99999)).toBe(2);
    expect(nextTrackIndex(1, 2, () => 0.99999)).toBe(0);
  });
});

describe('musicGain', () => {
  it('Gesamt × Musik, stumm = 0, geklemmt', () => {
    expect(musicGain({ volume: 0.5, musicVolume: 0.5, musicMuted: false })).toBe(0.25);
    expect(musicGain({ volume: 1, musicVolume: 1, musicMuted: true })).toBe(0);
    expect(musicGain({ volume: 3, musicVolume: 1, musicMuted: false })).toBe(1);
    expect(musicGain({ volume: NaN, musicVolume: 1, musicMuted: false })).toBe(0);
  });
});

describe('fadeFactor', () => {
  it('Einblenden steigt von 0 auf 1, Ausblenden fällt von 1 auf 0', () => {
    expect(fadeFactor(0, 2, 'in')).toBe(0);
    expect(fadeFactor(2, 2, 'in')).toBe(1);
    expect(fadeFactor(0, 2, 'out')).toBe(1);
    expect(fadeFactor(2, 2, 'out')).toBeCloseTo(0, 9);
  });

  it('gleiche Leistung in der Mitte (in² + out² = 1)', () => {
    const a = fadeFactor(1, 2, 'in');
    const b = fadeFactor(1, 2, 'out');
    expect(a * a + b * b).toBeCloseTo(1, 9);
  });

  it('klemmt Zeit und behandelt Dauer 0', () => {
    expect(fadeFactor(-5, 2, 'in')).toBe(0);
    expect(fadeFactor(9, 2, 'in')).toBe(1);
    expect(fadeFactor(0, 0, 'in')).toBe(1);
  });
});
