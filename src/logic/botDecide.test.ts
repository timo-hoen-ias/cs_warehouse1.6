import { describe, expect, it } from 'vitest';
import { BOT, BOT_NAMES, aimError, reactionTime } from './botDecide';

const rnd = () => 0.5;

describe('Bot-Grundwerte', () => {
  it('Zielfehler sinkt mit Zielzeit und Skill', () => {
    expect(aimError(0, 1)).toBeGreaterThan(aimError(BOT.aimSettleTime, 1));
    expect(aimError(0, 0)).toBeGreaterThan(aimError(0, 1));
    expect(aimError(10, 1)).toBeCloseTo(BOT.aimErrorSettled * 0.5, 5);
  });

  it('Reaktionszeit liegt im Band; hoher Skill = Minimum', () => {
    expect(reactionTime(1, rnd)).toBeCloseTo(BOT.reactionMin, 5);
    const r = reactionTime(0, rnd);
    expect(r).toBeGreaterThan(BOT.reactionMin);
    expect(r).toBeLessThanOrEqual(BOT.reactionMax);
  });

  it('genug eindeutige Bot-Namen', () => {
    expect(new Set(BOT_NAMES).size).toBe(BOT_NAMES.length);
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(10);
  });
});
