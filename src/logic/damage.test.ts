import { describe, expect, it } from 'vitest';
import { WEAPONS } from './weapons';
import { armoredDamage, noArmor, applyDamage, heal, hitEntity, makeHealth } from './damage';

describe('applyDamage', () => {
  it('reduziert HP und clampt bei 0', () => {
    const h = makeHealth(100);
    applyDamage(h, 30);
    expect(h.hp).toBe(70);
    expect(h.alive).toBe(true);
    applyDamage(h, 200);
    expect(h.hp).toBe(0);
    expect(h.alive).toBe(false);
  });

  it('tote Entität nimmt keinen Schaden mehr', () => {
    const h = makeHealth(10);
    applyDamage(h, 10);
    expect(h.alive).toBe(false);
    const before = h.hp;
    applyDamage(h, 5);
    expect(h.hp).toBe(before);
  });
});

describe('heal', () => {
  it('heilt bis max, nicht darüber', () => {
    const h = makeHealth(100);
    applyDamage(h, 60);
    heal(h, 30);
    expect(h.hp).toBe(70);
    heal(h, 50);
    expect(h.hp).toBe(100);
  });
});

describe('hitEntity', () => {
  it('Kopfschuss mit AWP tötet bei 100 HP', () => {
    const h = makeHealth(100);
    const { dmg, killed } = hitEntity(h, WEAPONS['awp']!, 'head');
    expect(dmg).toBeGreaterThanOrEqual(100);
    expect(killed).toBe(true);
    expect(h.alive).toBe(false);
  });

  it('Körpertreffer mit Pistole tötet nicht bei 100 HP', () => {
    const h = makeHealth(100);
    const { killed } = hitEntity(h, WEAPONS['usp']!, 'body');
    expect(killed).toBe(false);
    expect(h.alive).toBe(true);
  });

  it('Rückgabe meldet kill genau beim Tod', () => {
    const h = makeHealth(35);
    const r = hitEntity(h, WEAPONS['ak47']!, 'body');
    expect(r.dmg).toBe(36);
    expect(r.killed).toBe(true);
  });
});

describe('armoredDamage (Kevlar/Helm)', () => {
  it('ohne Rüstung voller Schaden', () => {
    expect(armoredDamage(36, 0.775, 'body', noArmor())).toEqual({ dmg: 36, armorLeft: 0 });
  });

  it('Weste reduziert Körperschaden auf armorPen-Anteil und nutzt sich ab', () => {
    const r = armoredDamage(100, 0.5, 'body', { armor: 100, helmet: false });
    expect(r.dmg).toBe(50);
    expect(r.armorLeft).toBe(75);
  });

  it('Kopf ohne Helm ist ungeschützt, mit Helm geschützt', () => {
    expect(armoredDamage(100, 0.5, 'head', { armor: 100, helmet: false }).dmg).toBe(100);
    expect(armoredDamage(100, 0.5, 'head', { armor: 100, helmet: true }).dmg).toBe(50);
  });

  it('fast aufgebrauchte Weste lässt den Rest durch', () => {
    const r = armoredDamage(100, 0.5, 'body', { armor: 10, helmet: false });
    // absorbiert 50, Verschleiß wäre 25 > 10 → 15 Rest ×2 = 30 extra
    expect(r.dmg).toBe(80);
    expect(r.armorLeft).toBe(0);
  });
});
