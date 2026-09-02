import { hitDamage, type WeaponDef } from './weapons';

/** Einfacher HP-Zustand einer Schadens-Entität (Spieler, Ziel, Bot). */
export type Health = { hp: number; max: number; alive: boolean };

export function makeHealth(max: number): Health {
  return { hp: max, max, alive: true };
}

/** Wendet Schaden an; liefert true, wenn die Entität dabei gestorben ist. */
export function applyDamage(h: Health, dmg: number): boolean {
  if (!h.alive) return false;
  h.hp = Math.max(0, h.hp - dmg);
  if (h.hp <= 0) {
    h.alive = false;
    return true;
  }
  return false;
}

/** Heilung (z. B. Medipack später); clamt auf max. */
export function heal(h: Health, amount: number): void {
  if (!h.alive) return;
  h.hp = Math.min(h.max, h.hp + amount);
}

/** Berechnet Schaden auf Teil 'head'|'body' und wendet ihn an. */
export function hitEntity(h: Health, def: WeaponDef, part: 'head' | 'body'): { dmg: number; killed: boolean } {
  const dmg = hitDamage(def, part);
  const killed = applyDamage(h, dmg);
  return { dmg, killed };
}
