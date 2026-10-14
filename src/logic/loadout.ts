import { EQUIPMENT, WEAPONS, teamCanUse, type EquipmentId, type GrenadeKind, type WeaponDef, type WeaponSlot } from './weapons';
import type { Team } from './economy';
import { buy as payFor, type Money } from './economy';
import { makeGun, type GunState } from './fire';

/**
 * Inventar eines Spielers (CS-Slots): Primärwaffe, Pistole, Messer, Granaten, C4.
 * Pure Logik — der Shooter liest nur, welche Waffe wo liegt.
 */
export type Loadout = {
  /** Waffen-ID je Slot (Slot 3 = immer Messer). */
  primary: string | null;
  secondary: string | null;
  /** Granaten-Bestand je Art (CS: 1 HE, 2 Flash, 1 Smoke). */
  grenades: Record<GrenadeKind, number>;
  bomb: boolean;
  armor: number;
  helmet: boolean;
  defuseKit: boolean;
  /** Munitions-/Magazinzustand je getragener Schusswaffe. */
  guns: Record<string, GunState>;
};

export const GRENADE_MAX: Record<GrenadeKind, number> = { he: 1, flash: 2, smoke: 1 };

export const GRENADE_ID: Record<GrenadeKind, string> = { he: 'hegrenade', flash: 'flashbang', smoke: 'smokegrenade' };

/** Start-Inventar einer Runde: Messer + Team-Pistole. */
export function defaultLoadout(team: Team): Loadout {
  const pistol = team === 'T' ? 'glock' : 'usp';
  return {
    primary: null,
    secondary: pistol,
    grenades: { he: 0, flash: 0, smoke: 0 },
    bomb: false,
    armor: 0,
    helmet: false,
    defuseKit: false,
    guns: { [pistol]: makeGun(WEAPONS[pistol]!) },
  };
}

/** Kaufergebnis. */
export type BuyResult = { ok: true; spent: number } | { ok: false; reason: 'money' | 'team' | 'unknown' | 'full' | 'owned' };

/**
 * Waffe oder Ausrüstung kaufen (nur Kaufphase — prüft der Aufrufer). Ersetzt eine
 * Waffe im selben Slot (CS: alte wird fallen gelassen). Granaten bis zum Maximum.
 */
export function buyItem(lo: Loadout, money: Money, itemId: string, team: Team): BuyResult {
  const eq = (EQUIPMENT as Record<string, { id: string; price: number; team: 'T' | 'CT' | 'both' }>)[itemId];
  if (eq) {
    if (!teamCanUse(eq, team)) return { ok: false, reason: 'team' };
    if (itemId === 'kevlar') {
      if (lo.armor >= 100) return { ok: false, reason: 'owned' };
      if (!payFor(money, eq.price)) return { ok: false, reason: 'money' };
      lo.armor = 100;
      return { ok: true, spent: eq.price };
    }
    if (itemId === 'helmet') {
      if (lo.armor >= 100 && lo.helmet) return { ok: false, reason: 'owned' };
      // Nur Helm nachkaufen, wenn die Weste schon voll ist (CS: 350 $)
      const price = lo.armor >= 100 ? EQUIPMENT.helmet.price - EQUIPMENT.kevlar.price : eq.price;
      if (!payFor(money, price)) return { ok: false, reason: 'money' };
      lo.armor = 100;
      lo.helmet = true;
      return { ok: true, spent: price };
    }
    if (itemId === 'defusekit') {
      if (lo.defuseKit) return { ok: false, reason: 'owned' };
      if (!payFor(money, eq.price)) return { ok: false, reason: 'money' };
      lo.defuseKit = true;
      return { ok: true, spent: eq.price };
    }
    return { ok: false, reason: 'unknown' };
  }

  const def = WEAPONS[itemId];
  if (!def || def.price <= 0) return { ok: false, reason: 'unknown' };
  if (!teamCanUse(def, team)) return { ok: false, reason: 'team' };
  if (def.type === 'grenade') {
    const kind = def.grenadeKind!;
    if (lo.grenades[kind] >= GRENADE_MAX[kind]) return { ok: false, reason: 'full' };
    if (!payFor(money, def.price)) return { ok: false, reason: 'money' };
    lo.grenades[kind] += 1;
    return { ok: true, spent: def.price };
  }
  if (def.slot === 1 && lo.primary === itemId) return { ok: false, reason: 'owned' };
  if (def.slot === 2 && lo.secondary === itemId) return { ok: false, reason: 'owned' };
  if (!payFor(money, def.price)) return { ok: false, reason: 'money' };
  giveWeapon(lo, itemId);
  return { ok: true, spent: def.price };
}

/** Waffe ins Inventar legen (Kauf, Aufheben); ersetzt die Waffe im selben Slot. */
export function giveWeapon(lo: Loadout, weaponId: string): string | null {
  const def = WEAPONS[weaponId];
  if (!def) return null;
  let dropped: string | null = null;
  if (def.slot === 1) {
    dropped = lo.primary;
    lo.primary = weaponId;
  } else if (def.slot === 2) {
    dropped = lo.secondary;
    lo.secondary = weaponId;
  } else if (def.slot === 5) {
    lo.bomb = true;
    return null;
  } else return null;
  if (dropped && dropped !== weaponId) delete lo.guns[dropped];
  if (!lo.guns[weaponId]) lo.guns[weaponId] = makeGun(def);
  return dropped;
}

/** Waffe aus einem Slot entfernen (Drop/Tod). Liefert die entfernte ID. */
export function removeWeapon(lo: Loadout, slot: WeaponSlot): string | null {
  let id: string | null = null;
  if (slot === 1) { id = lo.primary; lo.primary = null; }
  else if (slot === 2) { id = lo.secondary; lo.secondary = null; }
  else if (slot === 5) { id = lo.bomb ? 'c4' : null; lo.bomb = false; }
  if (id) delete lo.guns[id];
  return id;
}

/** Munition für eine Waffe nachkaufen (CS-Tasten 6/7): füllt die Reserve, 1 Magazin je Kauf. */
export const AMMO_PRICE = { primary: 60, secondary: 25 } as const;
export function buyAmmo(lo: Loadout, money: Money, slot: 1 | 2): BuyResult {
  const id = slot === 1 ? lo.primary : lo.secondary;
  if (!id) return { ok: false, reason: 'unknown' };
  const def = WEAPONS[id]!;
  const gun = lo.guns[id]!;
  if (gun.reserve >= def.reserve) return { ok: false, reason: 'full' };
  const price = slot === 1 ? AMMO_PRICE.primary : AMMO_PRICE.secondary;
  if (!payFor(money, price)) return { ok: false, reason: 'money' };
  gun.reserve = Math.min(def.reserve, gun.reserve + def.magSize);
  return { ok: true, spent: price };
}

/** Waffen-ID im Slot (Granaten-Slot: erste vorhandene Art in CS-Reihenfolge). */
export function weaponInSlot(lo: Loadout, slot: WeaponSlot): string | null {
  switch (slot) {
    case 1: return lo.primary;
    case 2: return lo.secondary;
    case 3: return 'knife';
    case 4: return firstGrenade(lo);
    case 5: return lo.bomb ? 'c4' : null;
  }
}

export function firstGrenade(lo: Loadout): string | null {
  for (const kind of ['he', 'flash', 'smoke'] as GrenadeKind[]) if (lo.grenades[kind] > 0) return GRENADE_ID[kind];
  return null;
}

/** Alle tragbaren Waffen-IDs in Slot-Reihenfolge (fürs Durchschalten per Mausrad/Q). */
export function carriedWeapons(lo: Loadout): string[] {
  const out: string[] = [];
  if (lo.primary) out.push(lo.primary);
  if (lo.secondary) out.push(lo.secondary);
  out.push('knife');
  for (const kind of ['he', 'flash', 'smoke'] as GrenadeKind[]) if (lo.grenades[kind] > 0) out.push(GRENADE_ID[kind]);
  if (lo.bomb) out.push('c4');
  return out;
}

/** Nächste/vorige Waffe relativ zur aktuellen (zyklisch). */
export function cycleWeapon(lo: Loadout, current: string, dir: 1 | -1): string {
  const list = carriedWeapons(lo);
  const i = list.indexOf(current);
  if (i < 0) return list[0] ?? 'knife';
  return list[(i + dir + list.length) % list.length]!;
}

/** Granate verbraucht (nach Wurf); liefert die nächste Waffe zum Anzeigen. */
export function consumeGrenade(lo: Loadout, kind: GrenadeKind): void {
  lo.grenades[kind] = Math.max(0, lo.grenades[kind] - 1);
}

/** Beste Waffe zum Auto-Wechsel (Primär > Pistole > Messer). */
export function bestWeapon(lo: Loadout): string {
  return lo.primary ?? lo.secondary ?? 'knife';
}

/**
 * Rundenwechsel-Regel (CS): Überlebende behalten ihr Inventar (Granaten/Kit inklusive),
 * Tote starten mit Messer + Pistole. Die Bombe wird jede Runde neu vergeben.
 */
export function carryOver(lo: Loadout, survived: boolean, team: Team): Loadout {
  if (!survived) return defaultLoadout(team);
  const next: Loadout = { ...lo, grenades: { ...lo.grenades }, guns: { ...lo.guns }, bomb: false };
  // Team-Pistole sicherstellen, falls keine Pistole mehr (sollte nicht passieren)
  if (!next.secondary) {
    next.secondary = team === 'T' ? 'glock' : 'usp';
    next.guns[next.secondary] = makeGun(WEAPONS[next.secondary]!);
  }
  return next;
}

/** Bot-Kauf-Heuristik: teuerste erschwingliche Primärwaffe, dann Weste, dann Granaten. */
export function botBuy(lo: Loadout, money: Money, team: Team, rnd: () => number = Math.random): string[] {
  const bought: string[] = [];
  const primaries = Object.values(WEAPONS)
    .filter((w) => w.slot === 1 && w.price > 0 && teamCanUse(w, team))
    .sort((a, b) => b.price - a.price);
  if (!lo.primary) {
    // Erst sparen, wenn nicht mal eine günstige Primärwaffe + Weste drin ist (Eco-Runde)
    const budget = money.amount - (rnd() < 0.5 ? 650 : 0);
    const pick = primaries.find((w) => w.price <= budget && w.type !== 'mg' && w.type !== 'shotgun' && w.id !== 'scout');
    if (pick && buyItem(lo, money, pick.id, team).ok) bought.push(pick.id);
  }
  if (lo.armor < 100 && money.amount >= 1000 && buyItem(lo, money, 'helmet', team).ok) bought.push('helmet');
  else if (lo.armor < 100 && buyItem(lo, money, 'kevlar', team).ok) bought.push('kevlar');
  if (team === 'CT' && !lo.defuseKit && money.amount >= 400 && buyItem(lo, money, 'defusekit', team).ok) bought.push('defusekit');
  if (money.amount >= 800 && buyItem(lo, money, 'hegrenade', team).ok) bought.push('hegrenade');
  if (money.amount >= 1200 && buyItem(lo, money, 'flashbang', team).ok) bought.push('flashbang');
  return bought;
}

export type { WeaponDef, EquipmentId };
