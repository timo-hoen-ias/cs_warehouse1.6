import { describe, expect, it } from 'vitest';
import { WEAPONS } from './weapons';
import { CROUCH_SPREAD_MULT, finishReload, fireSpread, makeGun, startReload, tickGun, tryShoot } from './fire';

const ak = WEAPONS['ak47']!;
const usp = WEAPONS['usp']!;

describe('tryShoot', () => {
  it('verbraucht Munition und setzt Cooldown bei auto', () => {
    const s = makeGun(ak);
    const r = tryShoot(s, ak);
    expect(r.ok).toBe(true);
    expect(s.mag).toBe(ak.magSize - 1);
    expect(s.cooldown).toBeGreaterThan(0);
  });

  it('semi-Waffe feuert ohne Cooldown (Klickbegrenzung durch Aufrufer)', () => {
    const s = makeGun(usp);
    const r = tryShoot(s, usp);
    expect(r.ok).toBe(true);
    expect(s.cooldown).toBe(0);
  });

  it('leeres Magazin → empty', () => {
    const s = makeGun(ak);
    s.mag = 0;
    const r = tryShoot(s, ak);
    expect(r).toEqual({ ok: false, reason: 'empty' });
  });

  it('beim Nachladen → reloading', () => {
    const s = makeGun(ak);
    s.mag = 1; // nicht voll → Reload möglich
    expect(startReload(s, ak)).toBe(true);
    const r = tryShoot(s, ak);
    expect(r).toEqual({ ok: false, reason: 'reloading' });
  });

  it('Cooldown blockiert (auto)', () => {
    const s = makeGun(ak);
    s.cooldown = 0.1;
    const r = tryShoot(s, ak);
    expect(r.ok).toBe(false);
  });

  it('meldet emptyAfter beim letzten Schuss', () => {
    const s = makeGun(usp);
    s.mag = 1;
    const r = tryShoot(s, usp);
    expect(r.ok).toBe(true);
    expect(r.ok && r.emptyAfter).toBe(true);
  });
});

describe('reload', () => {
  it('startet nur wenn sinnvoll', () => {
    const full = makeGun(ak);
    expect(startReload(full, ak)).toBe(false);
    full.mag = 5;
    full.reserve = 0;
    expect(startReload(full, ak)).toBe(false);
  });

  it('finishReload füllt Magazin aus Reserve', () => {
    const s = makeGun(usp);
    s.mag = 3;
    s.reserve = 10;
    startReload(s, usp);
    expect(s.reloadLeft).toBeGreaterThan(0);
    finishReload(s, usp);
    expect(s.mag).toBe(usp.magSize);
    expect(s.reserve).toBe(10 - (usp.magSize - 3));
    expect(s.reloadLeft).toBe(0);
  });

  it('tickGun lässt reloadLeft ablaufen und verrechnet beim Abschluss', () => {
    const s = makeGun(usp);
    s.mag = 0;
    startReload(s, usp);
    const full = s.reloadLeft;
    tickGun(s, usp, full + 0.1);
    expect(s.reloadLeft).toBe(0);
    expect(s.mag).toBe(usp.magSize); // Verrechnung beim Abschluss
  });
});

describe('fireSpread', () => {
  it('steigt mit Wärme und Bewegung', () => {
    const s = makeGun(ak);
    s.heat = 5;
    expect(fireSpread(ak, s, false)).toBeGreaterThan(fireSpread(ak, makeGun(ak), false));
    expect(fireSpread(ak, s, true)).toBeGreaterThan(fireSpread(ak, s, false));
  });

  it('Wärme klingt mit tickGun ab', () => {
    const s = makeGun(ak);
    tryShoot(s, ak);
    s.heat = 5;
    tickGun(s, ak, 0.5);
    expect(s.heat).toBeLessThan(5);
  });

  it('Ducken senkt die Streuung um CROUCH_SPREAD_MULT (~40 %)', () => {
    const s = makeGun(ak);
    s.heat = 3;
    const standing = fireSpread(ak, s, false);
    expect(fireSpread(ak, s, false, true)).toBeCloseTo(standing * CROUCH_SPREAD_MULT, 10);
  });

  it('Ducken senkt die Streuung unter den Bewegungs-Stehwert', () => {
    const s = makeGun(ak);
    s.heat = 3;
    const standingMoving = fireSpread(ak, s, true);
    const crouchMoving = fireSpread(ak, s, true, true);
    expect(crouchMoving).toBeLessThan(standingMoving);
  });

  it('geduckt bewegen ist nur wenig ungenauer als geduckt stehen', () => {
    const s = makeGun(ak);
    s.heat = 3;
    const crouchStand = fireSpread(ak, s, false, true);
    const crouchMove = fireSpread(ak, s, true, true);
    const extra = crouchMove - crouchStand;
    expect(extra).toBeGreaterThanOrEqual(0);
    expect(extra).toBeLessThan(ak.moveSpread); // Penalty stark abgeschwächt
  });

  it('ohne Ducken bleibt die bisherige Formel unverändert', () => {
    const s = makeGun(ak);
    s.heat = 2;
    expect(fireSpread(ak, s, false)).toBe(ak.spreadBase + 2 * ak.spreadPerShot);
    expect(fireSpread(ak, s, true)).toBe(ak.spreadBase + 2 * ak.spreadPerShot + ak.moveSpread);
  });
});
