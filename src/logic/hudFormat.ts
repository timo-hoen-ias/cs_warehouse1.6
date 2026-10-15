import type { Team } from './economy';
import { AMMO_PRICE, GRENADE_MAX } from './loadout';
import { BUY_CATEGORIES, EQUIPMENT, WEAPONS, teamCanUse, type BuyCategory, type WeaponDef } from './weapons';

/**
 * Anzeige-Logik des HUDs (framework-frei): Zeit-/Geldformate, Phasen- und
 * Rundenende-Texte, Kill-Feed-Einträge, Todesinfo, Kaufmenü-Zustände und
 * Waffenwerte für die Kaufkarten. Das DOM-HUD rendert nur, was hier entsteht.
 */

export const TEAM_NAME: Record<Team, string> = { T: 'Terroristen', CT: 'Counter-Terroristen' };
export const TEAM_SHORT: Record<Team, string> = { T: 'T', CT: 'CT' };

/** Sekunden → „m:ss“ (aufgerundet, nie negativ). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Geld wie in CS: „$ 800“, „$ 16000“. */
export function formatMoney(amount: number): string {
  return `$ ${Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0))}`;
}

/** Geldänderung als Text („+300“/„-650“), null bei 0. */
export function formatMoneyDelta(prev: number, next: number): string | null {
  const d = Math.round(next - prev);
  if (!Number.isFinite(d) || d === 0) return null;
  return d > 0 ? `+${d}` : `-${Math.abs(d)}`;
}

export function phaseLabel(phase: string): string {
  return ({ warmup: 'Aufwärmen', freeze: 'Kaufphase', live: 'Runde läuft', bomb: 'Bombe gelegt', roundEnd: 'Rundenende' } as Record<string, string>)[phase] ?? phase;
}

/** Lebenspunkte-Stufe für die Farbe. */
export function hpLevel(hp: number): 'ok' | 'warn' | 'crit' {
  return hp > 50 ? 'ok' : hp > 20 ? 'warn' : 'crit';
}

/** Magazin knapp (≤ 20 % bzw. ≤ 1 bei kleinen Magazinen)? */
export function ammoLow(mag: number, magSize: number): boolean {
  if (!Number.isFinite(mag) || !Number.isFinite(magSize) || magSize <= 0) return false;
  return mag <= Math.max(1, Math.floor(magSize * 0.2));
}

export type RoundOutcomeView = { winner: Team | null; title: string; subtitle: string };

/** Rundenende-Banner wie in CS 1.6. */
export function roundOutcome(outcome: string, reason: string): RoundOutcomeView {
  switch (outcome) {
    case 't_win': return { winner: 'T', title: 'Terroristen gewinnen', subtitle: reason || 'Runde gewonnen' };
    case 't_win_explode': return { winner: 'T', title: 'Terroristen gewinnen', subtitle: 'Ziel erfolgreich zerstört' };
    case 'ct_win': return { winner: 'CT', title: 'Counter-Terroristen gewinnen', subtitle: reason || 'Runde gewonnen' };
    case 'ct_win_defuse': return { winner: 'CT', title: 'Counter-Terroristen gewinnen', subtitle: 'Die Bombe wurde entschärft' };
    default: return { winner: null, title: 'Runde beendet', subtitle: reason };
  }
}

/** Einzeiliger Rundenende-Text (Kompatibilität, Chat/Log). */
export function outcomeText(outcome: string, reason: string): string {
  const v = roundOutcome(outcome, reason);
  return v.winner ? `${v.title} — ${v.subtitle}` : v.title;
}

type NamedPlayer = { name: string; team: Team };
export type KillEventLike = { killer: string | null; victim: string; weapon: string; hs: boolean };

export type KillFeedView = {
  killer: NamedPlayer | null;
  victim: NamedPlayer;
  /** Waffen-ID fürs Symbol. */
  weapon: string;
  weaponName: string;
  headshot: boolean;
  suicide: boolean;
  /** Lokaler Spieler beteiligt → hervorgehoben (wie in CS). */
  self: 'killer' | 'victim' | null;
};

function weaponName(id: string): string {
  if (id === 'c4') return 'C4-Explosion';
  if (id === 'fall') return 'Sturz';
  if (id === 'knife_stab') return WEAPONS.knife?.name ?? 'Messer';
  return WEAPONS[id]?.name ?? id;
}

/** Normalisiert Waffen-IDs fürs Symbol (Messerstich = Messer). */
export function iconWeapon(id: string): string {
  return id === 'knife_stab' ? 'knife' : id;
}

export function killFeedEntry(e: KillEventLike, players: Record<string, NamedPlayer | undefined>, localId: string | null): KillFeedView {
  const victim = players[e.victim] ?? { name: e.victim, team: 'CT' as Team };
  const killer = e.killer ? players[e.killer] ?? { name: e.killer, team: 'T' as Team } : null;
  const suicide = !e.killer || e.killer === e.victim;
  return {
    killer: suicide ? null : killer,
    victim,
    weapon: iconWeapon(e.weapon),
    weaponName: weaponName(e.weapon),
    headshot: e.hs,
    suicide,
    self: localId && e.killer === localId && !suicide ? 'killer' : localId && e.victim === localId ? 'victim' : null,
  };
}

export type DeathInfo = { title: string; detail: string; killerTeam: Team | null; killerHp: number | null; weapon: string };

/** „Getötet von X mit AWP (Kopfschuss)“ für den lokalen Spieler, sonst null. */
export function deathInfo(e: KillEventLike, players: Record<string, (NamedPlayer & { hp?: number }) | undefined>, localId: string): DeathInfo | null {
  if (e.victim !== localId) return null;
  const w = weaponName(e.weapon);
  if (!e.killer || e.killer === localId) {
    const title = e.weapon === 'c4' ? 'Von der Bombe getötet' : e.weapon === 'fall' ? 'Zu tief gefallen' : 'Selbst ausgeschaltet';
    const detail = e.weapon === 'c4' ? 'Zu nah an der Explosion' : e.weapon === 'fall' ? 'Sturzschaden' : `mit ${w}`;
    return { title, detail, killerTeam: null, killerHp: null, weapon: iconWeapon(e.weapon) };
  }
  const k = players[e.killer];
  return {
    title: `Getötet von ${k?.name ?? e.killer}`,
    detail: `mit ${w}${e.hs ? ' (Kopfschuss)' : ''}`,
    killerTeam: k?.team ?? null,
    killerHp: typeof k?.hp === 'number' ? Math.max(0, Math.round(k.hp)) : null,
    weapon: iconWeapon(e.weapon),
  };
}

// ---------------------------------------------------------------- Kaufmenü

export type BuyState = 'ok' | 'money' | 'team' | 'owned' | 'full';

export type BuyContext = {
  team: Team;
  money: number;
  primary: string | null;
  secondary: string | null;
  armor: number;
  helmet: boolean;
  kit: boolean;
  nades: { he: number; flash: number; smoke: number };
};

export type BuyItemView = {
  /** Taste 1–9 (null = nicht per Taste wählbar, z. B. Waffe des anderen Teams). */
  key: number | null;
  id: string;
  name: string;
  price: number;
  state: BuyState;
  /** Team-Beschränkung für das Abzeichen. */
  team: 'T' | 'CT' | 'both';
};

export type BuyTopEntry = { key: number; kind: 'category' | 'ammo'; id: BuyCategory | 'ammo1' | 'ammo2'; name: string; price: number | null };

/** Oberste Ebene wie in CS 1.6: 1–5 Waffen, 6/7 Munition, 8 Ausrüstung. */
export function buyTopLevel(): BuyTopEntry[] {
  const cats = BUY_CATEGORIES.filter((c) => c.id !== 'equipment').map((c): BuyTopEntry => ({ key: c.key, kind: 'category', id: c.id, name: c.name, price: null }));
  return [
    ...cats,
    { key: 6, kind: 'ammo', id: 'ammo1', name: 'Munition Primärwaffe', price: AMMO_PRICE.primary },
    { key: 7, kind: 'ammo', id: 'ammo2', name: 'Munition Pistole', price: AMMO_PRICE.secondary },
    { key: 8, kind: 'category', id: 'equipment', name: 'Ausrüstung', price: null },
  ];
}

/** Ausrüstungs-Reihenfolge (Taste 1–6). */
export const EQUIPMENT_ORDER = ['kevlar', 'helmet', 'flashbang', 'hegrenade', 'smokegrenade', 'defusekit'] as const;

function stateFor(price: number, money: number, team: 'T' | 'CT' | 'both', myTeam: Team, owned: boolean, full = false): BuyState {
  if (!teamCanUse({ team }, myTeam)) return 'team';
  if (owned) return 'owned';
  if (full) return 'full';
  return price <= money ? 'ok' : 'money';
}

/** Helm-Preis: 350 $ Nachkauf bei voller Weste, sonst Weste + Helm. */
export function helmetPrice(armor: number): number {
  return armor >= 100 ? EQUIPMENT.helmet.price - EQUIPMENT.kevlar.price : EQUIPMENT.helmet.price;
}

/**
 * Einträge einer Kategorie mit Kaufzustand. Eigene Team-Waffen bekommen Tasten 1..n
 * (nach Preis, wie `weaponsInCategory`), Waffen des anderen Teams folgen gesperrt.
 */
export function buyCategoryItems(cat: BuyCategory, ctx: BuyContext): BuyItemView[] {
  if (cat === 'equipment') {
    return EQUIPMENT_ORDER.map((id, i): BuyItemView => {
      if (id === 'kevlar') return { key: i + 1, id, name: EQUIPMENT.kevlar.name, price: EQUIPMENT.kevlar.price, team: 'both', state: stateFor(EQUIPMENT.kevlar.price, ctx.money, 'both', ctx.team, ctx.armor >= 100) };
      if (id === 'helmet') { const p = helmetPrice(ctx.armor); return { key: i + 1, id, name: EQUIPMENT.helmet.name, price: p, team: 'both', state: stateFor(p, ctx.money, 'both', ctx.team, ctx.armor >= 100 && ctx.helmet) }; }
      if (id === 'defusekit') return { key: i + 1, id, name: EQUIPMENT.defusekit.name, price: EQUIPMENT.defusekit.price, team: 'CT', state: stateFor(EQUIPMENT.defusekit.price, ctx.money, 'CT', ctx.team, ctx.kit) };
      const def = WEAPONS[id]!;
      const kind = def.grenadeKind!;
      return { key: i + 1, id, name: def.name, price: def.price, team: def.team, state: stateFor(def.price, ctx.money, def.team, ctx.team, false, ctx.nades[kind] >= GRENADE_MAX[kind]) };
    });
  }
  const types = cat === 'rifle' ? ['rifle', 'sniper'] : [cat];
  const all = Object.values(WEAPONS)
    .filter((w) => types.includes(w.type) && w.price > 0)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  const mine = all.filter((w) => teamCanUse(w, ctx.team));
  const other = all.filter((w) => !teamCanUse(w, ctx.team));
  const owned = (w: WeaponDef): boolean => (w.slot === 1 ? ctx.primary === w.id : ctx.secondary === w.id);
  return [
    ...mine.map((w, i): BuyItemView => ({ key: i + 1, id: w.id, name: w.name, price: w.price, team: w.team, state: stateFor(w.price, ctx.money, w.team, ctx.team, owned(w)) })),
    ...other.map((w): BuyItemView => ({ key: null, id: w.id, name: w.name, price: w.price, team: w.team, state: 'team' })),
  ];
}

/** Kurztext zum Kaufzustand (Tooltip/Karte). */
export function buyStateText(s: BuyState, team: 'T' | 'CT' | 'both'): string {
  switch (s) {
    case 'ok': return '';
    case 'money': return 'Zu teuer';
    case 'owned': return 'Bereits im Besitz';
    case 'full': return 'Maximum erreicht';
    case 'team': return team === 'CT' ? 'Nur CT' : team === 'T' ? 'Nur T' : 'Gesperrt';
  }
}

export type WeaponStatBars = { damage: number; rate: number; accuracy: number; penetration: number; mag: string };

/** Normalisierte Waffenwerte (0..1) für die Balken auf der Kaufkarte. */
export function weaponStatBars(def: WeaponDef): WeaponStatBars {
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));
  const dmg = def.damage * Math.max(1, def.pellets);
  const rpm = def.rpm > 0 ? def.rpm : def.cycle ? 60 / def.cycle : 300;
  return {
    damage: clamp(dmg / 160),
    rate: clamp(rpm / 1000),
    accuracy: clamp(1 - (def.spreadBase + def.spreadPerShot * 3) / 0.08),
    penetration: clamp(def.armorPen),
    mag: Number.isFinite(def.magSize) ? `${def.magSize} / ${Number.isFinite(def.reserve) ? def.reserve : '∞'}` : '–',
  };
}

/** HTML-Escaping für fremde Texte (Namen, Chat). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

/** Ping-Anzeige im Scoreboard. */
export function pingText(bot: boolean, ping: number): string {
  if (bot) return 'BOT';
  return Number.isFinite(ping) && ping > 0 ? String(Math.round(ping)) : '–';
}
