import type { WeaponDef } from './weapons';

/** Magazin-/Feuer-Zustand einer Waffe (pur, tickbar). */
export type GunState = {
  mag: number;
  reserve: number;
  /** Restzeit bis zum nächsten Schuss (s). */
  cooldown: number;
  /** Rest-Nachladezeit (s); 0 = nicht am Laden. */
  reloadLeft: number;
  /** Recoil-Wärme: zählt Schüsse; klingt mit der Zeit ab → Spread steigt kurz. */
  heat: number;
};

export function makeGun(def: WeaponDef): GunState {
  return { mag: def.magSize, reserve: def.reserve, cooldown: 0, reloadLeft: 0, heat: 0 };
}

export const HEAT_DECAY = 12; // Wärme-Einheiten pro Sekunde, die abklingen
export const HEAT_CAP = 10;

/** Ein Frame fortschreiben (dt in s). Beendet ein abgelaufenes Nachladen automatisch. */
export function tickGun(s: GunState, def: WeaponDef, dt: number): void {
  if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
  s.heat = Math.max(0, s.heat - HEAT_DECAY * dt);
  if (s.reloadLeft > 0) {
    s.reloadLeft = Math.max(0, s.reloadLeft - dt);
    if (s.reloadLeft === 0 && s.mag < def.magSize && s.reserve > 0) {
      finishReload(s, def);
      s.cooldown = 0;
    }
  }
}

export type ShootResult =
  | { ok: true; emptyAfter: boolean }
  | { ok: false; reason: 'reloading' | 'cooldown' | 'empty' | 'noAmmo' };

/**
 * Versucht einen Schuss. Ruft tick nicht auf (macht der Aufrufer vorab).
 * Semi-Waffen (rpm 0) feuern pro Klick — Steuerung übernimmt der Aufrufer.
 */
export function tryShoot(s: GunState, def: WeaponDef): ShootResult {
  if (s.reloadLeft > 0) return { ok: false, reason: 'reloading' };
  if (s.cooldown > 0) return { ok: false, reason: 'cooldown' };
  if (s.mag <= 0) return { ok: false, reason: 'empty' };
  s.mag -= 1;
  s.heat = Math.min(HEAT_CAP, s.heat + 1);
  const interval = def.rpm > 0 ? 60 / def.rpm : 0;
  s.cooldown = interval; // semi: 0 → Aufrufer begrenzt per Klick
  return { ok: true, emptyAfter: s.mag === 0 };
}

/** Startet Nachladen, wenn möglich; returns true wenn gestartet. */
export function startReload(s: GunState, def: WeaponDef): boolean {
  if (s.reloadLeft > 0 || s.mag >= def.magSize || s.reserve <= 0) return false;
  s.reloadLeft = def.reloadTime + (s.mag === 0 ? 0.35 : 0);
  return true;
}

/** Verrechnet Nachladen sofort (Waffenwechsel oder automatischer Reload-Abschluss). */
export function finishReload(s: GunState, def: WeaponDef): void {
  if (s.mag >= def.magSize || s.reserve <= 0) return;
  const need = Math.min(def.magSize - s.mag, s.reserve);
  s.mag += need;
  s.reserve -= need;
  s.reloadLeft = 0;
}

/** Streuungs-Faktor beim Ducken (~40 % enger, CS-nah). */
export const CROUCH_SPREAD_MULT = 0.6;
/** Restlicher Bewegungspenalty beim Ducken (0.25 = fast wie Stillstand). */
export const CROUCH_MOVE_MULT = 0.25;

/** Aktuelle Streuung (Radiant) aus Waffe + Wärme + Bewegung (+ Ducken). */
export function fireSpread(def: WeaponDef, s: GunState, moving: boolean, crouched = false): number {
  const base = def.spreadBase + s.heat * def.spreadPerShot;
  if (!crouched) return base + (moving ? def.moveSpread : 0);
  // Geduckt: Waffe enger; Bewegung fast ohne Effekt (CS-Feeling).
  return (base + (moving ? def.moveSpread * CROUCH_MOVE_MULT : 0)) * CROUCH_SPREAD_MULT;
}
