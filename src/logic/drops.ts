import type { Team } from './economy';
import type { GunState } from './fire';
import { makeGun } from './fire';
import type { Loadout } from './loadout';
import { WEAPONS } from './weapons';
import { switchTeam, type MatchState } from './match';

/**
 * Am Boden liegende Waffen und die C4 (pure). CS-Regeln: Beim Tod fällt die beste
 * Schusswaffe (Primär, sonst Pistole) und die Bombe; G wirft die gehaltene
 * Primär-/Sekundärwaffe oder die C4. Drüberlaufen hebt auf, wenn der Slot frei ist
 * (C4 nur für Terroristen). Munitionsstand wandert mit.
 */
export type DroppedItem = {
  id: number;
  weapon: string;
  x: number;
  y: number;
  z: number;
  /** Magazin/Reserve der Waffe (nicht bei C4). */
  gun?: GunState;
};

export const PICKUP_RADIUS = 1.1;
/** Wurfweite beim Fallenlassen (G). */
export const DROP_THROW = 1.4;
/** Maximale Anzahl liegender Waffen (älteste verschwinden zuerst, C4 nie). */
export const MAX_DROPS = 24;

let seq = 1;
/** Neue eindeutige Drop-ID (Host). */
export function nextDropId(): number {
  return seq++;
}

/** Beim Tod: beste Schusswaffe + C4 fallen lassen (Inventar wird geleert). */
export function dropOnDeath(lo: Loadout, at: { x: number; y: number; z: number }, newId: () => number = nextDropId): DroppedItem[] {
  const out: DroppedItem[] = [];
  const best = lo.primary ?? lo.secondary;
  if (best) {
    out.push({ id: newId(), weapon: best, x: at.x, y: at.y, z: at.z, gun: lo.guns[best] ? { ...lo.guns[best]!, reloadLeft: 0, cooldown: 0 } : undefined });
    if (lo.primary === best) lo.primary = null;
    else lo.secondary = null;
    delete lo.guns[best];
  }
  if (lo.bomb) {
    lo.bomb = false;
    out.push({ id: newId(), weapon: 'c4', x: at.x + 0.4, y: at.y, z: at.z + 0.3 });
  }
  return out;
}

/**
 * Gehaltene Waffe fallen lassen (G). Nur Primär, Sekundär und C4 — Messer und
 * Granaten bleiben. Landet DROP_THROW Meter in Blickrichtung.
 */
export function dropActive(lo: Loadout, weaponId: string, at: { x: number; y: number; z: number }, yaw: number, newId: () => number = nextDropId): DroppedItem | null {
  const dx = -Math.sin(yaw) * DROP_THROW;
  const dz = -Math.cos(yaw) * DROP_THROW;
  const pos = { x: at.x + dx, y: at.y, z: at.z + dz };
  if (weaponId === 'c4') {
    if (!lo.bomb) return null;
    lo.bomb = false;
    return { id: newId(), weapon: 'c4', ...pos };
  }
  const slot = lo.primary === weaponId ? 'primary' : lo.secondary === weaponId ? 'secondary' : null;
  if (!slot) return null;
  const gun = lo.guns[weaponId];
  lo[slot] = null;
  delete lo.guns[weaponId];
  return { id: newId(), weapon: weaponId, ...pos, gun: gun ? { ...gun, reloadLeft: 0, cooldown: 0 } : undefined };
}

/** Darf dieser Spieler das Item aufheben (Slot frei, Team passt)? */
export function canPickup(lo: Loadout, team: Team, item: DroppedItem): boolean {
  if (item.weapon === 'c4') return team === 'T' && !lo.bomb;
  const def = WEAPONS[item.weapon];
  if (!def) return false;
  if (def.slot === 1) return lo.primary === null;
  if (def.slot === 2) return lo.secondary === null;
  return false;
}

/**
 * Aufheben beim Drüberlaufen: erstes passendes Item im Radius (XZ, Höhenunterschied
 * < 1.2 m). Legt es ins Inventar und liefert es zurück (Aufrufer entfernt es aus der Liste).
 */
export function tryPickup(lo: Loadout, team: Team, items: readonly DroppedItem[], at: { x: number; y: number; z: number }): DroppedItem | null {
  for (const it of items) {
    if (Math.hypot(it.x - at.x, it.z - at.z) > PICKUP_RADIUS) continue;
    if (Math.abs(it.y - at.y) > 1.2) continue;
    if (!canPickup(lo, team, it)) continue;
    if (it.weapon === 'c4') {
      lo.bomb = true;
      return it;
    }
    const def = WEAPONS[it.weapon]!;
    if (def.slot === 1) lo.primary = it.weapon;
    else lo.secondary = it.weapon;
    lo.guns[it.weapon] = it.gun ? { ...it.gun } : makeGun(def);
    return it;
  }
  return null;
}

/** Liste begrenzen: älteste Waffen fallen weg, die C4 bleibt immer liegen. */
export function capDrops(items: DroppedItem[], max: number = MAX_DROPS): DroppedItem[] {
  if (items.length <= max) return items;
  const out = [...items];
  while (out.length > max) {
    const i = out.findIndex((d) => d.weapon !== 'c4');
    if (i < 0) break;
    out.splice(i, 1);
  }
  return out;
}

/** Position der liegenden C4 (für Bots/Radar), sonst null. */
export function droppedBomb(items: readonly DroppedItem[]): DroppedItem | null {
  return items.find((d) => d.weapon === 'c4') ?? null;
}

/**
 * Teamwechsel eines Spielers (Host): ein lebender Spieler lässt vorher wie beim Tod seine
 * beste Waffe und die C4 fallen — sonst verschwände die Bombe mit dem alten Inventar.
 * Liefert die liegenden Gegenstände (leer, wenn tot, unbekannt oder schon im Team).
 */
export function switchTeamDropping(m: MatchState, id: string, team: Team, newId: () => number = nextDropId): DroppedItem[] {
  const p = Object.hasOwn(m.players, id) ? m.players[id] : undefined;
  if (!p || p.team === team) return [];
  const out = p.alive ? dropOnDeath(p.loadout, { x: p.pose.x, y: p.pose.y, z: p.pose.z }, newId) : [];
  switchTeam(m, id, team);
  return out;
}
