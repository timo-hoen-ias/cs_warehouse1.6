import { describe, expect, it } from 'vitest';
import { WEAPONS } from './weapons';
import { CROUCH_SPREAD_MULT, NOSCOPE_SPREAD, SPREAD_SPEED, finishReload, fireSpread, makeGun, movePenalty, startReload, tickGun, tryShoot } from './fire';
import { PLAYER } from './move';
import { weaponSpeed } from './weapons';

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

  it('semi-Waffe: Cooldown = Abzugszeit (cycle), ohne cycle 0', () => {
    const s = makeGun(usp);
    const r = tryShoot(s, usp);
    expect(r.ok).toBe(true);
    expect(s.cooldown).toBe(usp.cycle);
    const plain = { ...usp, cycle: undefined };
    const s2 = makeGun(plain);
    tryShoot(s2, plain);
    expect(s2.cooldown).toBe(0);
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

describe('Zielfernrohr (Noscope-Streuung)', () => {
  it('Sniper ungezoomt deutlich ungenauer als gezoomt; andere Waffen unbeeinflusst', () => {
    const awp = WEAPONS['awp']!;
    const g = makeGun(awp);
    expect(fireSpread(awp, g, false, false, false)).toBeCloseTo(awp.spreadBase + NOSCOPE_SPREAD, 10);
    expect(fireSpread(awp, g, false, false, true)).toBeCloseTo(awp.spreadBase, 10);
    const ak = WEAPONS['ak47']!;
    const ga = makeGun(ak);
    expect(fireSpread(ak, ga, false, false, false)).toBe(fireSpread(ak, ga, false, false, true));
  });
});

describe('Repetierzeit (cycle)', () => {
  it('AWP kann erst nach der Repetierzeit erneut feuern', () => {
    const awp = WEAPONS['awp']!;
    const g = makeGun(awp);
    expect(tryShoot(g, awp).ok).toBe(true);
    expect(tryShoot(g, awp)).toEqual({ ok: false, reason: 'cooldown' });
    tickGun(g, awp, 1.0);
    expect(tryShoot(g, awp).ok).toBe(false);
    tickGun(g, awp, 0.5);
    expect(tryShoot(g, awp).ok).toBe(true);
  });
});

describe('Streuung nach echter Bewegung (CS-Gefühl)', () => {
  const awp = WEAPONS['awp']!;
  const scout = WEAPONS['scout']!;
  const knife = WEAPONS['knife']!;
  const run = (def: typeof ak): number => weaponSpeed(def);
  const walk = (def: typeof ak): number => weaponSpeed(def) * 0.52;
  const at = (def: typeof ak, speed: number, air = false, crouched = false, scoped = false): number =>
    fireSpread(def, makeGun(def), { speed, air }, crouched, scoped);

  it('Gewehr: Stehen genau, Schleichen (Shift) praktisch genauso, Rennen ≈ 6× ungenauer', () => {
    const stand = at(ak, 0);
    expect(stand).toBeCloseTo(ak.spreadBase, 10);
    expect(at(ak, walk(ak))).toBeCloseTo(stand, 10);
    expect(at(ak, run(ak))).toBeGreaterThan(stand * 5);
    expect(at(ak, run(ak))).toBeCloseTo(ak.spreadBase + ak.moveSpread, 10);
  });

  it('alle Schusswaffen: Schleichen unter der Schwelle, Rennen darüber', () => {
    for (const w of Object.values(WEAPONS)) {
      if (w.mode !== 'hit' || w.type === 'sniper') continue;
      expect(movePenalty(w, weaponSpeed(w) * 0.52), w.id).toBe(0);
      expect(movePenalty(w, weaponSpeed(w)), w.id).toBe(1);
    }
  });

  it('weich: Penalty wächst monoton zwischen den Schwellen, 0 darunter, 1 darüber', () => {
    expect(movePenalty(ak, SPREAD_SPEED.from - 0.01)).toBe(0);
    expect(movePenalty(ak, SPREAD_SPEED.full + 0.01)).toBe(1);
    let last = 0;
    for (let v = 0; v <= 6.5; v += 0.1) {
      const p = movePenalty(ak, v);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    const mid = movePenalty(ak, (SPREAD_SPEED.from + SPREAD_SPEED.full) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it('Counter-Strafe: nach dem Abbremsen unter die Schwelle ist die Genauigkeit zurück', () => {
    expect(at(ak, 5.4)).toBeGreaterThan(at(ak, 3.0) * 4);
    expect(at(ak, 3.0)).toBeCloseTo(at(ak, 0), 10);
  });

  it('Springen ist katastrophal, auch geduckt', () => {
    expect(at(ak, 0, true)).toBeCloseTo(ak.spreadBase + (ak.airSpread ?? 0), 10);
    expect(at(ak, 0, true)).toBeGreaterThan(at(ak, run(ak)));
    expect(at(ak, 0, true)).toBeGreaterThan(at(ak, 0) * 10);
    expect(at(ak, 0, true, true)).toBeGreaterThan(at(ak, run(ak)));
    for (const w of Object.values(WEAPONS)) {
      if (w.mode !== 'hit') continue;
      expect(at(w, 0, true), w.id).toBeGreaterThan(at(w, weaponSpeed(w)));
    }
  });

  it('AWP: ohne Zielfernrohr schlecht, gezoomt im Stand fast perfekt, schon leichte Bewegung stört', () => {
    expect(at(awp, 0, false, false, false)).toBeGreaterThan(0.07);
    expect(at(awp, 0, false, false, true)).toBeLessThan(0.002);
    expect(at(awp, 0.6, false, false, true)).toBeGreaterThan(at(awp, 0, false, false, true) * 5);
    expect(at(awp, run(awp), false, false, true)).toBeGreaterThan(at(awp, 0.6, false, false, true));
    expect(at(awp, 0, true, false, true)).toBeGreaterThan(0.25);
  });

  it('Scout/AWP springend ohne Zoom: völlig unbrauchbar (> 20°)', () => {
    expect(at(scout, 0, true)).toBeGreaterThan(0.3);
    expect(at(awp, 0, true)).toBeGreaterThan(0.3);
  });

  it('Messer/Granaten: keine Streuung egal wie bewegt', () => {
    expect(at(knife, run(knife))).toBe(0);
    expect(at(knife, 0, true)).toBe(0);
  });

  it('Ducken: ruhig und geduckt-gehend genau, Lauftempo mit Ducken nur wenig schlechter', () => {
    expect(at(ak, PLAYER.crouchSpeed, false, true)).toBeCloseTo(at(ak, 0, false, true), 10);
    expect(at(ak, 0, false, true)).toBeLessThan(at(ak, 0));
  });

  it('boolean-Kompatibilität (Bots): true = voll bewegt, false = still', () => {
    const g = makeGun(ak);
    expect(fireSpread(ak, g, true)).toBeCloseTo(ak.spreadBase + ak.moveSpread, 10);
    expect(fireSpread(ak, g, false)).toBeCloseTo(ak.spreadBase, 10);
    expect(fireSpread(awp, g, true, false, true)).toBeCloseTo(awp.spreadBase + awp.moveSpread, 10);
  });

  it('erster Schuss nach einer Pause wieder genau: Wärme verfliegt in unter einer Sekunde', () => {
    const s = makeGun(ak);
    for (let i = 0; i < 10; i++) {
      s.cooldown = 0;
      tryShoot(s, ak);
    }
    const hot = at(ak, 0);
    s.cooldown = 0;
    const withHeat = fireSpread(ak, s, { speed: 0, air: false });
    expect(withHeat).toBeGreaterThan(ak.spreadBase);
    tickGun(s, ak, 1.0);
    expect(fireSpread(ak, s, { speed: 0, air: false })).toBeCloseTo(ak.spreadBase, 10);
    void hot;
  });
});
