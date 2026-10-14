import { describe, expect, it } from 'vitest';
import { newMoney } from './economy';
import {
  AMMO_PRICE, GRENADE_MAX, bestWeapon, botBuy, buyAmmo, buyItem, carriedWeapons, carryOver, consumeGrenade,
  cycleWeapon, defaultLoadout, giveWeapon, removeWeapon, weaponInSlot,
} from './loadout';
import { WEAPONS } from './weapons';

describe('defaultLoadout', () => {
  it('T startet mit Glock, CT mit USP, beide mit Messer', () => {
    const t = defaultLoadout('T');
    const ct = defaultLoadout('CT');
    expect(t.secondary).toBe('glock');
    expect(ct.secondary).toBe('usp');
    expect(weaponInSlot(t, 3)).toBe('knife');
    expect(t.primary).toBeNull();
    expect(t.guns['glock']!.mag).toBe(WEAPONS['glock']!.magSize);
  });
});

describe('buyItem', () => {
  it('kauft eine Primärwaffe und zieht den Preis ab', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(5000);
    const r = buyItem(lo, m, 'ak47', 'T');
    expect(r.ok).toBe(true);
    expect(lo.primary).toBe('ak47');
    expect(m.amount).toBe(5000 - 2500);
    expect(lo.guns['ak47']).toBeDefined();
  });

  it('Team-Beschränkung: CT kann keine AK kaufen', () => {
    const lo = defaultLoadout('CT');
    const m = newMoney(5000);
    expect(buyItem(lo, m, 'ak47', 'CT')).toEqual({ ok: false, reason: 'team' });
    expect(m.amount).toBe(5000);
  });

  it('zu wenig Geld → kein Kauf', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(100);
    expect(buyItem(lo, m, 'ak47', 'T')).toEqual({ ok: false, reason: 'money' });
    expect(lo.primary).toBeNull();
  });

  it('ersetzt die Waffe im selben Slot und entfernt den alten Munitionsstand', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(16000);
    buyItem(lo, m, 'mp5', 'T');
    buyItem(lo, m, 'ak47', 'T');
    expect(lo.primary).toBe('ak47');
    expect(lo.guns['mp5']).toBeUndefined();
    buyItem(lo, m, 'deagle', 'T');
    expect(lo.secondary).toBe('deagle');
    expect(lo.guns['glock']).toBeUndefined();
  });

  it('dieselbe Waffe doppelt → owned', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(16000);
    buyItem(lo, m, 'ak47', 'T');
    expect(buyItem(lo, m, 'ak47', 'T')).toEqual({ ok: false, reason: 'owned' });
  });

  it('Granaten bis zum Maximum (1 HE, 2 Flash, 1 Smoke)', () => {
    const lo = defaultLoadout('CT');
    const m = newMoney(16000);
    expect(buyItem(lo, m, 'hegrenade', 'CT').ok).toBe(true);
    expect(buyItem(lo, m, 'hegrenade', 'CT')).toEqual({ ok: false, reason: 'full' });
    expect(buyItem(lo, m, 'flashbang', 'CT').ok).toBe(true);
    expect(buyItem(lo, m, 'flashbang', 'CT').ok).toBe(true);
    expect(buyItem(lo, m, 'flashbang', 'CT')).toEqual({ ok: false, reason: 'full' });
    expect(lo.grenades).toEqual({ he: 1, flash: 2, smoke: 0 });
    expect(GRENADE_MAX.smoke).toBe(1);
  });

  it('Kevlar/Helm/Kit: Preise, Helm-Nachkauf 350, Kit nur CT', () => {
    const lo = defaultLoadout('CT');
    const m = newMoney(3000);
    expect(buyItem(lo, m, 'kevlar', 'CT')).toEqual({ ok: true, spent: 650 });
    expect(lo.armor).toBe(100);
    expect(buyItem(lo, m, 'kevlar', 'CT')).toEqual({ ok: false, reason: 'owned' });
    expect(buyItem(lo, m, 'helmet', 'CT')).toEqual({ ok: true, spent: 350 });
    expect(lo.helmet).toBe(true);
    expect(buyItem(lo, m, 'defusekit', 'CT').ok).toBe(true);
    expect(lo.defuseKit).toBe(true);
    expect(m.amount).toBe(3000 - 650 - 350 - 200);
    const t = defaultLoadout('T');
    expect(buyItem(t, newMoney(1000), 'defusekit', 'T')).toEqual({ ok: false, reason: 'team' });
  });

  it('unbekannte oder nicht kaufbare Items', () => {
    const lo = defaultLoadout('T');
    expect(buyItem(lo, newMoney(1000), 'knife', 'T')).toEqual({ ok: false, reason: 'unknown' });
    expect(buyItem(lo, newMoney(1000), 'laserkanone', 'T')).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('Munition', () => {
  it('Munitionskauf füllt ein Magazin in die Reserve bis zum Maximum', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(2000);
    buyItem(lo, m, 'mac10', 'T');
    const gun = lo.guns['mac10']!;
    gun.reserve = 10;
    expect(buyAmmo(lo, m, 1)).toEqual({ ok: true, spent: AMMO_PRICE.primary });
    expect(gun.reserve).toBe(40);
    gun.reserve = WEAPONS['mac10']!.reserve;
    expect(buyAmmo(lo, m, 1)).toEqual({ ok: false, reason: 'full' });
    expect(buyAmmo(lo, newMoney(0), 2)).toEqual({ ok: false, reason: 'full' }); // Pistole voll
    lo.guns['glock']!.reserve = 0;
    expect(buyAmmo(lo, newMoney(0), 2)).toEqual({ ok: false, reason: 'money' });
  });
});

describe('Slots & Durchschalten', () => {
  it('weaponInSlot / carriedWeapons in CS-Reihenfolge', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(16000);
    buyItem(lo, m, 'ak47', 'T');
    buyItem(lo, m, 'flashbang', 'T');
    buyItem(lo, m, 'hegrenade', 'T');
    giveWeapon(lo, 'c4');
    expect(weaponInSlot(lo, 1)).toBe('ak47');
    expect(weaponInSlot(lo, 2)).toBe('glock');
    expect(weaponInSlot(lo, 4)).toBe('hegrenade');
    expect(weaponInSlot(lo, 5)).toBe('c4');
    expect(carriedWeapons(lo)).toEqual(['ak47', 'glock', 'knife', 'hegrenade', 'flashbang', 'c4']);
    expect(bestWeapon(lo)).toBe('ak47');
  });

  it('cycleWeapon ist zyklisch in beide Richtungen', () => {
    const lo = defaultLoadout('CT');
    expect(cycleWeapon(lo, 'usp', 1)).toBe('knife');
    expect(cycleWeapon(lo, 'knife', 1)).toBe('usp');
    expect(cycleWeapon(lo, 'usp', -1)).toBe('knife');
    expect(cycleWeapon(lo, 'nichts', 1)).toBe('usp');
  });

  it('Granate verbrauchen: Slot 4 leer → null', () => {
    const lo = defaultLoadout('T');
    buyItem(lo, newMoney(1000), 'smokegrenade', 'T');
    expect(weaponInSlot(lo, 4)).toBe('smokegrenade');
    consumeGrenade(lo, 'smoke');
    expect(weaponInSlot(lo, 4)).toBeNull();
    consumeGrenade(lo, 'smoke');
    expect(lo.grenades.smoke).toBe(0);
  });

  it('removeWeapon leert Slot und Munition; Bombe abgeben', () => {
    const lo = defaultLoadout('T');
    buyItem(lo, newMoney(5000), 'ak47', 'T');
    giveWeapon(lo, 'c4');
    expect(removeWeapon(lo, 1)).toBe('ak47');
    expect(lo.primary).toBeNull();
    expect(lo.guns['ak47']).toBeUndefined();
    expect(removeWeapon(lo, 5)).toBe('c4');
    expect(lo.bomb).toBe(false);
    expect(removeWeapon(lo, 1)).toBeNull();
  });
});

describe('carryOver', () => {
  it('Überlebende behalten Inventar (ohne Bombe), Tote starten neu', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(16000);
    buyItem(lo, m, 'ak47', 'T');
    buyItem(lo, m, 'kevlar', 'T');
    buyItem(lo, m, 'hegrenade', 'T');
    giveWeapon(lo, 'c4');
    const kept = carryOver(lo, true, 'T');
    expect(kept.primary).toBe('ak47');
    expect(kept.armor).toBe(100);
    expect(kept.grenades.he).toBe(1);
    expect(kept.bomb).toBe(false);
    const fresh = carryOver(lo, false, 'T');
    expect(fresh.primary).toBeNull();
    expect(fresh.secondary).toBe('glock');
    expect(fresh.armor).toBe(0);
  });
});

describe('botBuy', () => {
  it('mit viel Geld: Primärwaffe + Helm + Granaten; CT kauft Kit', () => {
    const lo = defaultLoadout('CT');
    const m = newMoney(16000);
    const bought = botBuy(lo, m, 'CT', () => 0.9);
    expect(lo.primary).not.toBeNull();
    expect(WEAPONS[lo.primary!]!.team).not.toBe('T');
    expect(lo.helmet).toBe(true);
    expect(lo.defuseKit).toBe(true);
    expect(bought).toContain('hegrenade');
    expect(m.amount).toBeLessThan(16000);
  });

  it('mit 800 $: nur Pistole/Weste, keine Primärwaffe für Phantasiepreise', () => {
    const lo = defaultLoadout('T');
    const m = newMoney(800);
    botBuy(lo, m, 'T', () => 0.9);
    expect(lo.primary).toBeNull();
    expect(m.amount).toBeGreaterThanOrEqual(0);
  });
});
