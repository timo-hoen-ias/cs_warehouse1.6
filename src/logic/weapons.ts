import type { RecoilSpec } from './recoil';
import rawWeapons from './weapons.json';

export type { RecoilSpec };

/** Waffen-Typen (Gameplay-Gruppen). */
export type WeaponType = 'knife' | 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun';

/** Modell-/Anzeige-Metadaten einer Waffe. */
export type WeaponVisual = {
  /** OBJ-Datei ohne Endung, relativ zu assets/weapons/obj/. leer = prozedural. */
  model: string;
  /** Skalierung auf Viewmodel-Größe. */
  scale: number;
  /** Kamera-lokaler Offset (rechts-unten vor der Kamera). */
  pos: { x: number; y: number; z: number };
  /** Mündungsposition im Modell-Koordinatensystem (für Mündungsfeuer). */
  muzzle: { x: number; y: number; z: number };
};

/** Schadens-/Feuer-Parameter einer Waffe. Werte CS-angelehnt, im JSON justierbar. */
export type WeaponDef = {
  id: string;
  name: string;
  type: WeaponType;
  /** Schaden pro Körpertreffer. */
  damage: number;
  /** Kopfschuss-Multiplikator (CS: ~4). */
  headFactor: number;
  /** Schüsse pro Minute (auto). Bei 0 = semi-automatisch (ein Schuss pro Klick). */
  rpm: number;
  /** Magazingröße. Infinity = unbegrenzt (Messer). */
  magSize: number;
  /** Reserve-Munition (max). */
  reserve: number;
  /** Nachladezeit in Sekunden. */
  reloadTime: number;
  /** Basis-Streuung in Radiant (beim Zielen aus dem Stand). */
  spreadBase: number;
  /** Streuungs-Zuwachs pro abgegebenem Schuss (Radiant). */
  spreadPerShot: number;
  /** Extra-Streuung bei Bewegung (Radiant). */
  moveSpread: number;
  /** Max. effektive Reichweite in Metern. */
  range: number;
  /** Schadenstyp: 'hit' (Hitscan) oder 'melee' (Nahkampf-Ray). */
  mode: 'hit' | 'melee';
  /** Dynamischer Rückstoß (Kamera + Viewmodel). */
  recoil: RecoilSpec;
  /** Sichtbares Modell + Viewmodel-Offset. */
  visual: WeaponVisual;
};

/** JSON-Zwischenform: null = unbegrenzt (Messer-Magazin). */
type RawWeapon = Omit<WeaponDef, 'magSize' | 'reserve'> & {
  magSize: number | null;
  reserve: number | null;
};

function normalize(raw: Record<string, RawWeapon>): Record<string, WeaponDef> {
  const out: Record<string, WeaponDef> = {};
  for (const [id, w] of Object.entries(raw)) {
    out[id] = {
      ...w,
      id,
      magSize: w.magSize ?? Infinity,
      reserve: w.reserve ?? Infinity,
    };
  }
  return out;
}

/** Waffen-Tabelle aus src/logic/weapons.json (einzige Datenquelle für Balance). */
export const WEAPONS: Record<string, WeaponDef> = normalize(rawWeapons as unknown as Record<string, RawWeapon>);

/** Schaden an Kopf/Körper. */
export function hitDamage(def: WeaponDef, part: 'head' | 'body'): number {
  return Math.round(def.damage * (part === 'head' ? def.headFactor : 1));
}

/** Sekunden zwischen zwei Schüssen (auto); bei semi 0 → manuell pro Klick. */
export function shotInterval(def: WeaponDef): number {
  if (def.rpm <= 0) return 0;
  return 60 / def.rpm;
}

/** Aktuelle Streuung (Radiant) aus Basis + Schüssen + Bewegung. */
export function currentSpread(def: WeaponDef, shotsFired: number, moving: boolean): number {
  const base = def.spreadBase + shotsFired * def.spreadPerShot;
  return base + (moving ? def.moveSpread : 0);
}

/** Nachlade-Dauer: bei leerem Magazin ggf. leicht länger (CS-Feeling). */
export function reloadDuration(def: WeaponDef, magEmpty: boolean): number {
  return def.reloadTime + (magEmpty ? 0.35 : 0);
}

/** Maximale Kugeln, die nachgeladen werden (Magazin bis voll). */
export function reloadAmount(def: WeaponDef, magNow: number, reserveNow: number): number {
  const need = def.magSize - magNow;
  return Math.min(need, reserveNow);
}
