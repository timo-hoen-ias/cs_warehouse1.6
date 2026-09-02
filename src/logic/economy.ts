/** Economy-Regeln (CS-angelehnt, de_-Modus). Preise/Boni als justierbare Daten. */

export type Team = 'T' | 'CT';
export type EconomyEvent =
  | { kind: 'kill' }
  | { kind: 'win'; team: Team }
  | { kind: 'loss'; team: Team }
  | { kind: 'plant' }
  | { kind: 'defuse' }
  | { kind: 'roundStart'; team: Team };

export const PRICES = {
  glock: 400, usp: 500, mp5: 1500, ak47: 2700, m4a1: 3100, awp: 4750,
  armor: 650, defuseKit: 200,
} as const;

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
    const bonus = Math.min(ECONOMY.lossBonusCap, ECONOMY.lossBonusStart + m.lossStreak * ECONOMY.lossBonusStep);
    m.amount += bonus;
    m.lossStreak += 1;
  }
  clampMoney(m);
}

export function addMoney(m: Money, amount: number): void {
  m.amount += amount;
  clampMoney(m);
}

export function priceOf(weaponId: keyof typeof PRICES): number {
  return PRICES[weaponId];
}
