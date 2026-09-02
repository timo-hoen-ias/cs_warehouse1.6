import { describe, expect, it } from 'vitest';
import { ECONOMY, addMoney, buy, endRound, newMoney, priceOf } from './economy';

describe('startMoney / maxMoney', () => {
  it('Start mit 800 $', () => {
    const m = newMoney();
    expect(m.amount).toBe(ECONOMY.startMoney);
  });

  it('Geld ist bei maxMoney gedeckelt', () => {
    const m = newMoney();
    addMoney(m, 20000);
    expect(m.amount).toBe(ECONOMY.maxMoney);
    endRound(m, true);
    expect(m.amount).toBe(ECONOMY.maxMoney);
  });

  it('Geld fällt nie unter 0', () => {
    const m = newMoney(0);
    buy(m, 500);
    expect(m.amount).toBe(0);
  });
});

describe('buy', () => {
  it('Kauf kostet und reduziert Guthaben', () => {
    const m = newMoney();
    expect(buy(m, priceOf('glock'))).toBe(true);
    expect(m.amount).toBe(ECONOMY.startMoney - priceOf('glock'));
  });

  it('Kauf scheitert ohne genug Geld', () => {
    const m = newMoney(100);
    expect(buy(m, priceOf('ak47'))).toBe(false);
    expect(m.amount).toBe(100);
  });
});

describe('endRound', () => {
  it('Sieg: + winReward, Streak zurückgesetzt', () => {
    const m = newMoney();
    m.lossStreak = 2;
    endRound(m, true);
    expect(m.amount).toBe(ECONOMY.startMoney + ECONOMY.winReward);
    expect(m.lossStreak).toBe(0);
  });

  it('Niederlage: Verlust-Bonus steigt mit Streak und wird gecappt', () => {
    const a = newMoney();
    endRound(a, false);
    const first = a.amount - ECONOMY.startMoney;
    expect(first).toBe(ECONOMY.lossBonusStart);
    expect(a.lossStreak).toBe(1);

    endRound(a, false);
    const second = a.amount - (ECONOMY.startMoney + first);
    expect(second).toBe(ECONOMY.lossBonusStart + ECONOMY.lossBonusStep);

    // Streak hochtreiben → Cap
    let m = newMoney(0);
    m.lossStreak = 10;
    endRound(m, false);
    expect(m.amount).toBe(ECONOMY.lossBonusCap);
  });
});
