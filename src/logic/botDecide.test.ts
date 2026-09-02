import { describe, expect, it } from 'vitest';
import { decideBotMove, type SightInput } from './botDecide';
import type { PartBox } from './hitbox';

const empty: PartBox[] = [];

function input(over: Partial<SightInput>): SightInput {
  return {
    from: { x: 0, z: 0 },
    player: null,
    goal: { x: 50, z: 0 },
    maxRange: 30,
    solids: empty,
    ...over,
  };
}

describe('decideBotMove', () => {
  it('kein Spieler → Ziel (goal)', () => {
    const d = decideBotMove(input({}));
    expect(d.canSee).toBe(false);
    expect(d.target).toEqual({ x: 50, z: 0 });
  });

  it('Spieler in Reichweite & Sichtlinie → jagt Spieler', () => {
    const d = decideBotMove(input({ player: { x: 10, z: 0 } }));
    expect(d.canSee).toBe(true);
    expect(d.target).toEqual({ x: 10, z: 0 });
  });

  it('Spieler außer Reichweite → goal', () => {
    const d = decideBotMove(input({ player: { x: 100, z: 0 } }));
    expect(d.canSee).toBe(false);
    expect(d.target).toEqual({ x: 50, z: 0 });
  });

  it('Wand zwischen Bot und Spieler blockiert Sicht', () => {
    const wall: PartBox = { part: 'body', box: { minX: -1, minY: 0, minZ: 4, maxX: 1, maxY: 4, maxZ: 6 } };
    const d = decideBotMove(input({ player: { x: 0, z: 10 }, solids: [wall] }));
    expect(d.canSee).toBe(false);
    expect(d.target).toEqual({ x: 50, z: 0 });
  });

  it('Spieler hinter Wand, aber Wand entfernt → sieht ihn', () => {
    // Wand bei z=4..6, Spieler bei z=10, Sicht geht darüber? Wand ist hoch (maxY 4) — blockiert.
    // Stattdessen: niedrige Wand (Hüfthöhe), Strahl auf Augenhöhe 1.2 drüber
    const lowWall: PartBox = { part: 'body', box: { minX: -5, minY: 0, minZ: 4, maxX: 5, maxY: 0.8, maxZ: 6 } };
    const d = decideBotMove(input({ player: { x: 0, z: 10 }, solids: [lowWall] }));
    expect(d.canSee).toBe(true);
  });
});
