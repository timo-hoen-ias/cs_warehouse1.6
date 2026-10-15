import { lossBonus, priceOf, type Money, type Team } from './economy';
import { buyItem, type Loadout } from './loadout';
import { WEAPONS } from './weapons';

/**
 * Kauf-Entscheidungen der Bots (pure), wie ein CS-Team:
 * - **Team-Entscheidung** je Runde: Pistolenrunde, Eco (sparen), Force (alles, was
 *   geht), Halb oder Voll — aus dem Geld aller Teammitglieder und dem Verlustbonus
 *   (reicht es *nächste* Runde für einen Vollkauf, wenn wir jetzt sparen?).
 * - **Einkaufsliste je Bot** nach Rolle: Scharfschütze (AWP), Entry (Blendgranaten),
 *   Support (Rauch), Anker (HE/Rauch), plus Weste/Helm und Kit für CT.
 */
export type BuyKind = 'pistol' | 'eco' | 'force' | 'half' | 'full';
export type BotRole = 'entry' | 'support' | 'awp' | 'lurker' | 'anchor' | 'rotator';

export const BUY = {
  /** Geld für einen Vollkauf (Gewehr + Helm + 1–2 Granaten). */
  full: { T: 3700, CT: 4300 } as Record<Team, number>,
  /** Ab hier lohnt ein Force-Buy (SMG/Galil/Famas + Weste). */
  force: 2000,
  /** Anteil des Teams, der voll kaufen können muss. */
  quorum: 0.6,
} as const;

/** Team-Kaufentscheidung (alle Spieler des Teams, Menschen eingeschlossen). */
export function teamBuyKind(team: Team, moneys: readonly number[], round: number, lossStreak: number, rnd: () => number): BuyKind {
  if (round <= 1) return 'pistol';
  const n = Math.max(1, moneys.length);
  const avg = moneys.reduce((s, m) => s + m, 0) / n;
  const full = BUY.full[team];
  const rich = moneys.filter((m) => m >= full).length;
  if (rich >= Math.ceil(n * BUY.quorum)) return 'full';
  // Sparen lohnt, wenn es nächste Runde (mit Verlustbonus) für alle reicht
  const nextRound = avg + lossBonus(lossStreak);
  if (nextRound >= full) {
    if (avg >= 2600 && rnd() < 0.25) return 'force';
    return avg >= 2900 ? 'half' : 'eco';
  }
  if (avg >= BUY.force) return lossStreak >= 2 || rnd() < 0.6 ? 'force' : 'half';
  return 'eco';
}

const GRENADES_BY_ROLE: Record<BotRole, string[]> = {
  entry: ['flashbang', 'flashbang', 'hegrenade'],
  support: ['smokegrenade', 'flashbang', 'hegrenade'],
  awp: ['flashbang', 'smokegrenade'],
  lurker: ['flashbang', 'smokegrenade'],
  anchor: ['hegrenade', 'smokegrenade', 'flashbang'],
  rotator: ['smokegrenade', 'flashbang', 'hegrenade'],
};

/** Beste erschwingliche Waffe aus einer Wunschliste (Preis ≤ budget). */
function pick(list: string[], budget: number): string | null {
  for (const id of list) if (WEAPONS[id] && WEAPONS[id]!.price <= budget) return id;
  return null;
}

/**
 * Einkaufsliste eines Bots (verändert nichts). Reihenfolge = Kaufreihenfolge;
 * `applyBuy` kauft, solange das Geld reicht.
 */
export function botBuyList(lo: Loadout, money: number, team: Team, kind: BuyKind, role: BotRole, skill: number, rnd: () => number): string[] {
  const out: string[] = [];
  let left = money;
  const take = (id: string, price = priceOf(id)): boolean => {
    if (price <= 0 || price > left) return false;
    out.push(id);
    left -= price;
    return true;
  };
  const armor = (): void => {
    if (lo.armor >= 100 && lo.helmet) return;
    if (left >= 1000 + 200 && !take('helmet', lo.armor >= 100 ? 350 : 1000)) return;
    if (!out.includes('helmet') && lo.armor < 100) take('kevlar');
  };
  const nades = (max: number): void => {
    let n = 0;
    for (const id of GRENADES_BY_ROLE[role]) {
      if (n >= max) break;
      if (take(id)) n++;
    }
  };
  const rifles = team === 'T' ? ['ak47', 'galil'] : ['m4a1', 'famas'];
  const richRifles = team === 'T' ? ['sg552', 'ak47'] : ['aug', 'm4a1'];
  const forceGuns = team === 'T' ? ['galil', 'ump45', 'mp5', 'mac10'] : ['famas', 'ump45', 'mp5', 'tmp'];

  switch (kind) {
    case 'pistol': {
      const r = rnd();
      if (r < 0.55) take('kevlar');
      else if (r < 0.8) { take(team === 'T' ? 'flashbang' : 'defusekit'); take('hegrenade'); }
      else take(team === 'CT' ? 'fiveseven' : 'p228');
      break;
    }
    case 'eco':
      // Sparen; mit viel Rest-Geld eine Deagle (CS-Eco mit Pistole)
      if (money >= 2400 && skill > 0.5 && lo.secondary !== 'deagle' && rnd() < 0.4) take('deagle');
      break;
    case 'force':
    case 'half': {
      if (!lo.primary) {
        const reserve = kind === 'half' ? 650 + 400 : 650;
        const gun = pick(kind === 'half' ? forceGuns.slice(1) : forceGuns, left - reserve) ?? pick(forceGuns, left);
        if (gun) take(gun);
      }
      armor();
      if (team === 'CT' && !lo.defuseKit && left >= 600) take('defusekit');
      nades(kind === 'half' ? 2 : 1);
      break;
    }
    case 'full': {
      if (!lo.primary || (role === 'awp' && lo.primary !== 'awp')) {
        let gun: string | null = null;
        if (role === 'awp' && left >= 4750 + 1000) gun = 'awp';
        else if (left >= 6500 && rnd() < 0.2) gun = pick(richRifles, left - 1000);
        gun ??= pick(rifles, left - 1000) ?? pick(rifles, left - 650) ?? pick(forceGuns, left - 650);
        if (gun && gun !== lo.primary) take(gun);
      }
      armor();
      if (team === 'CT' && !lo.defuseKit) take('defusekit');
      nades(3);
      if (left >= 1500 && skill > 0.4 && lo.secondary !== 'deagle' && rnd() < 0.3) take('deagle');
      break;
    }
  }
  return out;
}

/** Einkaufsliste ausführen (über die normalen Kaufregeln); liefert die gekauften Artikel. */
export function applyBuy(lo: Loadout, money: Money, team: Team, items: readonly string[]): string[] {
  const done: string[] = [];
  for (const id of items) if (buyItem(lo, money, id, team).ok) done.push(id);
  return done;
}
