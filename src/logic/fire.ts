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
  // Automatik: 60/rpm; Semi: Repetier-/Abzugszeit (cycle), sonst Begrenzung per Klick
  const interval = def.rpm > 0 ? 60 / def.rpm : (def.cycle ?? 0);
  s.cooldown = interval;
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

/** Zusatz-Streuung für Scharfschützengewehre ohne Zielfernrohr (CS: Noscope ist Glückssache). */
export const NOSCOPE_SPREAD = 0.075;

/**
 * Bewegungs-Schwellen der Streuung (m/s): CS bestraft ab 140 u/s (3.47 m/s) — Schleichen (52 %) bleibt
 * genau, Rennen voll ungenau; dazwischen weich überblendet (Anlaufen/Counter-Strafe bauen Genauigkeit
 * in Sekundenbruchteilen ab bzw. auf).
 */
export const SPREAD_SPEED = { from: 3.47, full: 4.2, sniperFrom: 0.25, sniperFull: 1.0 } as const;

/** Tatsächliche Bewegung des Schützen: Horizontaltempo (m/s) und ob er in der Luft ist. */
export type MoveSpreadState = { speed: number; air: boolean };

function smooth(from: number, to: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * Anteil (0..1) der Bewegungs-Streuung bei Tempo `speed` (m/s). Scharfschützengewehre sind schon bei
 * leichter Bewegung ungenau (CS: AWP > 10 u/s), der Rest erst im Lauf.
 */
export function movePenalty(def: WeaponDef, speed: number): number {
  const run = smooth(SPREAD_SPEED.from, SPREAD_SPEED.full, speed);
  if (def.type !== 'sniper') return run;
  return 0.4 * smooth(SPREAD_SPEED.sniperFrom, SPREAD_SPEED.sniperFull, speed) + 0.6 * run;
}

/**
 * Aktuelle Streuung (Radiant) aus Waffe + Wärme + Bewegung (+ Ducken, + Zielfernrohr).
 * `move`: `true`/`false` = voll bewegt bzw. still (Bots), oder echtes Tempo + Luft (Spieler).
 * In der Luft gilt `airSpread` (Sprung = katastrophal, auch geduckt).
 */
export function fireSpread(def: WeaponDef, s: GunState, move: boolean | MoveSpreadState, crouched = false, scoped = false): number {
  const noscope = def.type === 'sniper' && !scoped ? NOSCOPE_SPREAD : 0;
  const base = def.spreadBase + s.heat * def.spreadPerShot + noscope;
  const state: MoveSpreadState = typeof move === 'boolean' ? { speed: move ? Infinity : 0, air: false } : move;
  if (state.air) return base + (def.airSpread ?? def.moveSpread * 2);
  const f = movePenalty(def, state.speed);
  if (!crouched) return base + def.moveSpread * f;
  // Geduckt: Waffe enger; Bewegung fast ohne Effekt (CS-Feeling).
  return (base + def.moveSpread * CROUCH_MOVE_MULT * f) * CROUCH_SPREAD_MULT;
}
