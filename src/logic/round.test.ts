import { describe, expect, it } from 'vitest';
import { ROUND, canBuy, matchWon, newRoundState, tickRound, type RoundResult, type RoundState } from './round';
import type { RoundInput } from './round';

const idle: RoundInput = { alive: { T: 5, CT: 5 }, bombAction: { plant: false, defuse: false }, inSpot: null, hasKit: false };

/** Fast-Forward in 0.1-s-Schritten (tickRound clamp dt). */
function advance(s: RoundState, input: RoundInput, seconds: number): void {
  let t = 0;
  while (t < seconds - 1e-9) {
    const step = Math.min(0.1, seconds - t);
    tickRound(s, input, step);
    t += step;
  }
}

describe('Phasenablauf', () => {
  it('warmup → freeze → live', () => {
    const s = newRoundState();
    expect(s.phase).toBe('warmup');
    advance(s, idle, ROUND.warmupTime + 0.5);
    expect(s.phase).toBe('freeze');
    expect(s.round).toBe(1);
    advance(s, idle, ROUND.freezeTime + 0.5);
    expect(s.phase).toBe('live');
  });

  it('während freeze kann man kaufen, in live nicht', () => {
    const s = newRoundState();
    advance(s, idle, ROUND.warmupTime + 0.5);
    expect(canBuy(s)).toBe(true);
    advance(s, idle, ROUND.freezeTime + 0.5);
    expect(canBuy(s)).toBe(false);
  });
});

describe('Rundenende', () => {
  function toLive(): RoundState {
    const s = newRoundState();
    advance(s, idle, ROUND.warmupTime + 0.5);
    advance(s, idle, ROUND.freezeTime + 0.5);
    return s;
  }

  it('Eliminierung von T → CT gewinnt', () => {
    const s = toLive();
    const r = tickRound(s, { ...idle, alive: { T: 0, CT: 4 } }, 0.1);
    expect(r?.outcome).toBe('ct_win');
    expect(s.ctRounds).toBe(1);
    expect(s.phase).toBe('roundEnd');
  });

  it('Eliminierung von CT → T gewinnt', () => {
    const s = toLive();
    const r = tickRound(s, { ...idle, alive: { T: 4, CT: 0 } }, 0.1);
    expect(r?.outcome).toBe('t_win');
    expect(s.tRounds).toBe(1);
  });

  it('Zeitablauf in live → CT gewinnt (Bombe nie gepflanzt)', () => {
    const s = toLive();
    const r = advanceAndGet(s, ROUND.roundTime + 0.5);
    expect(r?.outcome).toBe('ct_win');
  });
});

function advanceAndGet(s: RoundState, seconds: number): RoundResult {
  let result: RoundResult = null;
  let t = 0;
  while (t < seconds - 1e-9 && s.phase !== 'roundEnd') {
    const step = Math.min(0.1, seconds - t);
    const r = tickRound(s, idle, step);
    if (r) result = r;
    t += step;
  }
  return result;
}

describe('Bombe im Rundenkontext', () => {
  function toLive(): RoundState {
    const s = newRoundState();
    advance(s, idle, ROUND.warmupTime + 0.5);
    advance(s, idle, ROUND.freezeTime + 0.5);
    return s;
  }

  it('Plant überführt live → bomb', () => {
    const s = toLive();
    advance(s, { ...idle, bombAction: { plant: true, defuse: false }, inSpot: 'a' }, 4);
    expect(s.phase).toBe('bomb');
    expect(s.bomb.spot).toBe('a');
  });

  it('Explosion → T gewinnt', () => {
    const s = toLive();
    advance(s, { ...idle, bombAction: { plant: true, defuse: false }, inSpot: 'a' }, 4);
    const r = advanceAndGet(s, 60);
    expect(r?.outcome).toBe('t_win_explode');
    expect(s.tRounds).toBe(1);
  });

  it('Defuse → CT gewinnt', () => {
    const s = toLive();
    advance(s, { ...idle, bombAction: { plant: true, defuse: false }, inSpot: 'a' }, 4);
    // CT defused mit Kit — kein Ablauf der Zündschnur abwarten, direkt defusen
    let r: RoundResult = null;
    let t = 0;
    while (t < 15 && s.phase !== 'roundEnd') {
      r = tickRound(s, { ...idle, bombAction: { plant: false, defuse: true }, inSpot: 'a', hasKit: true }, 0.1);
      t += 0.1;
    }
    expect(r?.outcome).toBe('ct_win_defuse');
    expect(s.ctRounds).toBe(1);
  });
});

describe('Match-Sieg', () => {
  it('16 Runden reichen', () => {
    const s = newRoundState();
    s.ctRounds = ROUND.scoreToWin - 1;
    s.tRounds = 3;
    expect(matchWon(s)).toBeNull();
    s.ctRounds += 1;
    expect(matchWon(s)).toBe('CT');
  });
});
