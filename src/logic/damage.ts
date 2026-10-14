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

/** Berechnet Schaden auf Teil 'head'|'body' und wendet ihn an (ohne Rüstung). */
export function hitEntity(h: Health, def: WeaponDef, part: 'head' | 'body'): { dmg: number; killed: boolean } {
  const dmg = hitDamage(def, part);
  const killed = applyDamage(h, dmg);
  return { dmg, killed };
}

/** Rüstungszustand eines Spielers (CS: Kevlar 0..100, Helm schützt den Kopf). */
export type Armor = { armor: number; helmet: boolean };

export function noArmor(): Armor {
  return { armor: 0, helmet: false };
}

/**
 * CS-Rüstungsformel: trifft der Schuss eine gepanzerte Stelle (Körper mit Weste,
 * Kopf nur mit Helm), geht nur armorPen × Schaden durch; die Weste nimmt die
 * Hälfte des absorbierten Schadens als Verschleiß. Reicht die Weste nicht,
 * geht der Rest ungebremst durch.
 */
export function armoredDamage(raw: number, armorPen: number, part: 'head' | 'body', armor: Armor): { dmg: number; armorLeft: number } {
  const protectedPart = armor.armor > 0 && (part === 'body' || armor.helmet);
  if (!protectedPart) return { dmg: Math.round(raw), armorLeft: armor.armor };
  let dmg = raw * armorPen;
  let wear = (raw - dmg) * 0.5;
  if (wear > armor.armor) {
    // Weste durchgeschlagen: nicht absorbierter Rest geht durch
    dmg += (wear - armor.armor) * 2;
    wear = armor.armor;
  }
  return { dmg: Math.round(dmg), armorLeft: Math.max(0, Math.round(armor.armor - wear)) };
}
