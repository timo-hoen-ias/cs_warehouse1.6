import { describe, expect, it } from 'vitest';
import {
  COMBAT, aimPoint, chooseWeapon, combatTick, counterStrafeTime, effectiveRange, engage, firePattern, headChance, needsReload, newCombat, onShot,
  shouldRetreat,
} from './botCombat';
import { makeGun } from './fire';
import { defaultLoadout, giveWeapon } from './loadout';
import { WEAPONS } from './weapons';

const ak = WEAPONS['ak47']!;
const awp = WEAPONS['awp']!;
const usp = WEAPONS['usp']!;
const rnd = () => 0.5;

describe('Kampf-Mikro', () => {
  it('Feuerkontrolle nach Distanz: weit Einzelschüsse, mittel Bursts, nah Sprühen', () => {
    const far = firePattern(ak, 40, 0.6);
    const mid = firePattern(ak, 18, 0.6);
    const near = firePattern(ak, 6, 0.6);
    expect(far.burst).toBe(1);
    expect(mid.burst).toBe(3);
    expect(near.burst).toBeGreaterThanOrEqual(6);
    expect(far.stop && mid.stop && near.stop).toBe(true);
    expect(firePattern(ak, 3, 0.6).stop).toBe(false); // Nahkampf: in Bewegung weiter
    expect(far.crouch).toBe(true); // lange Distanz geduckt
    expect(firePattern(awp, 10, 0.6)).toMatchObject({ burst: 1, stop: true });
    expect(firePattern(usp, 30, 0.6).pause).toBeGreaterThan(firePattern(usp, 5, 0.6).pause);
    // Gute Bots schießen schneller nach
    expect(firePattern(ak, 18, 1).pause).toBeLessThan(firePattern(ak, 18, 0).pause);
  });

  it('Gegenlenken: erst anhalten, dann schießen; gute Bots brauchen weniger Stillstand', () => {
    expect(counterStrafeTime(1)).toBeLessThan(counterStrafeTime(0));
    const st = newCombat();
    engage(st, 'e', { def: ak, dist: 20, skill: 0.6, rnd });
    const moving = combatTick(st, { def: ak, dist: 20, skill: 0.6, ready: true, stillFor: 0, dt: 0.05, rnd });
    expect(moving).toMatchObject({ fire: false, move: 'stop' });
    const still = combatTick(st, { def: ak, dist: 20, skill: 0.6, ready: true, stillFor: 0.3, dt: 0.05, rnd });
    expect(still.fire).toBe(true);
    // vor Ablauf der Reaktionszeit kein Schuss
    expect(combatTick(st, { def: ak, dist: 20, skill: 0.6, ready: false, stillFor: 1, dt: 0.05, rnd }).fire).toBe(false);
  });

  it('Feuerstöße: nach 3 Schüssen Pause, dann wieder Feuer', () => {
    const st = newCombat();
    const ctx = { def: ak, dist: 18, skill: 0.6, rnd };
    engage(st, 'e', ctx);
    const fires: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      const out = combatTick(st, { ...ctx, ready: true, stillFor: 1, dt: 0.05 });
      fires.push(out.fire);
      if (out.fire) onShot(st, ctx);
    }
    expect(fires.slice(0, 3)).toEqual([true, true, true]);
    expect(fires[3]).toBe(false);
    expect(fires.slice(4)).toContain(true);
  });

  it('Kopf-Wahrscheinlichkeit und Zielpunkte', () => {
    expect(headChance(1)).toBeGreaterThan(headChance(0));
    const feet = { x: 1, y: 2, z: 3 };
    expect(aimPoint(feet, false, true).y).toBeCloseTo(3.53);
    expect(aimPoint(feet, false, false).y).toBeLessThan(aimPoint(feet, false, true).y);
    expect(aimPoint(feet, true, true).y).toBeLessThan(aimPoint(feet, false, true).y);
    expect(effectiveRange(awp)).toBeGreaterThan(effectiveRange(usp));
  });

  it('Waffenwahl: leeres Magazin im Gefecht → Pistole, Schrot auf Distanz → Pistole, ohne Munition → Messer', () => {
    const lo = defaultLoadout('T');
    giveWeapon(lo, 'ak47');
    expect(chooseWeapon(lo, null)).toBe('ak47');
    lo.guns['ak47']!.mag = 0;
    expect(chooseWeapon(lo, 10)).toBe('glock');
    expect(chooseWeapon(lo, 40)).toBe('ak47'); // weit weg: nachladen statt Pistole
    expect(chooseWeapon(lo, null)).toBe('ak47');
    const sg = defaultLoadout('CT');
    giveWeapon(sg, 'm3');
    expect(chooseWeapon(sg, 30)).toBe('usp');
    expect(chooseWeapon(sg, 5)).toBe('m3');
    const empty = defaultLoadout('CT');
    empty.guns['usp']!.mag = 0;
    empty.guns['usp']!.reserve = 0;
    expect(chooseWeapon(empty, 5)).toBe('knife');
  });

  it('Nachladen: leer immer, halbleer nur in Sicherheit, nie ohne Reserve', () => {
    const g = makeGun(ak);
    expect(needsReload(g, ak, true)).toBe(false);
    g.mag = 10;
    expect(needsReload(g, ak, false)).toBe(false);
    expect(needsReload(g, ak, true)).toBe(true);
    g.mag = 0;
    expect(needsReload(g, ak, false)).toBe(true);
    g.reserve = 0;
    expect(needsReload(g, ak, true)).toBe(false);
    expect(COMBAT.reloadBelow).toBeLessThan(1);
  });

  it('Rückzug: wenig HP im Gefecht, Überzahl mit angeschlagenen HP, Nachladen unter Druck', () => {
    expect(shouldRetreat(100, 0, false, null)).toBe(false);
    expect(shouldRetreat(25, 1, false, 20)).toBe(true);
    expect(shouldRetreat(50, 2, false, 20)).toBe(true);
    expect(shouldRetreat(80, 1, false, 20)).toBe(false);
    expect(shouldRetreat(80, 1, true, 10)).toBe(true);
  });
});
