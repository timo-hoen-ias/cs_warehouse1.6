/** Economy-Regeln (CS-angelehnt, de_-Modus). Preise liegen bei den Waffen (weapons.json). */
import { EQUIPMENT, WEAPONS } from './weapons';

export type Team = 'T' | 'CT';
export type EconomyEvent =
  | { kind: 'kill' }
  | { kind: 'win'; team: Team }
  | { kind: 'loss'; team: Team }
  | { kind: 'plant' }
  | { kind: 'defuse' }
  | { kind: 'roundStart'; team: Team };

export const ECONOMY = {
  startMoney: 800,
  maxMoney: 16000,
  killReward: 300,
  plantReward: 300,
  defuseReward: 300,
  winReward: 3250,
  /** Verlust-Bonus, steigt mit aufeinanderfolgenden Verlusten (Stufe 0 = 1400). */
  lossBonusStart: 1400,
  lossBonusStep: 500,
  lossBonusCap: 3400,
  armorCost: 650,
  defuseKitCost: 200,
} as const;

export type Money = { amount: number; lossStreak: number };

export function newMoney(start: number = ECONOMY.startMoney): Money {
  return { amount: start, lossStreak: 0 };
}

function clampMoney(m: Money): void {
  m.amount = Math.max(0, Math.min(ECONOMY.maxMoney, m.amount));
}

/** Zahlt Kauf; returns true wenn genug Geld da war. */
export function buy(m: Money, price: number): boolean {
  if (m.amount < price) return false;
  m.amount -= price;
  return true;
}

/** Rundenabschluss verrechnen (Win/Loss/Streak). */
export function endRound(m: Money, won: boolean): void {
  if (won) {
    m.amount += ECONOMY.winReward;
    m.lossStreak = 0;
  } else {
    m.amount += lossBonus(m.lossStreak);
    m.lossStreak += 1;
  }
  clampMoney(m);
}

export function addMoney(m: Money, amount: number): void {
  m.amount += amount;
  clampMoney(m);
}

/** Preis einer Waffe oder Ausrüstung (0 = unbekannt/nicht kaufbar). */
export function priceOf(itemId: string): number {
  return WEAPONS[itemId]?.price ?? (EQUIPMENT as Record<string, { price: number }>)[itemId]?.price ?? 0;
}

/** Team-weiter Verlust-Bonus (CS: steigt je Niederlagenserie, Cap 3400). */
export function lossBonus(lossStreak: number): number {
  return Math.min(ECONOMY.lossBonusCap, ECONOMY.lossBonusStart + lossStreak * ECONOMY.lossBonusStep);
}
