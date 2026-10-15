import { describe, expect, it } from 'vitest';
import { BOT, BOT_NAMES, aimError, firstSight, reactionTime } from './botDecide';

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

  it('Erstsicht: Vorzielen (still, Blick auf den Gegner) reagiert schneller und trifft früher; Überraschung von der Seite langsamer', () => {
    const base = reactionTime(0.6, rnd);
    const pre = firstSight(0.6, rnd, 0.05, 1);
    expect(pre.reaction).toBeCloseTo(base * BOT.preaimReaction, 5);
    expect(pre.sightTime).toBe(BOT.preaimSettled);
    expect(aimError(pre.sightTime, 0.6)).toBeLessThan(aimError(0, 0.6));
    // in Bewegung oder nicht genau dorthin geschaut: kein Vorteil
    expect(firstSight(0.6, rnd, 0.05, 0.1)).toEqual({ reaction: base, sightTime: 0 });
    expect(firstSight(0.6, rnd, 0.3, 1)).toEqual({ reaction: base, sightTime: 0 });
    // von der Seite (> 30°): Überraschung
    expect(firstSight(0.6, rnd, 1, 1).reaction).toBeCloseTo(base * BOT.surprise, 5);
  });

  it('genug eindeutige Bot-Namen', () => {
    expect(new Set(BOT_NAMES).size).toBe(BOT_NAMES.length);
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(10);
  });
});
