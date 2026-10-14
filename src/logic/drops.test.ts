import { describe, expect, it } from 'vitest';
import { newMoney } from './economy';
import { buyItem, defaultLoadout, giveWeapon } from './loadout';
import { DROP_THROW, MAX_DROPS, PICKUP_RADIUS, canPickup, capDrops, dropActive, dropOnDeath, droppedBomb, tryPickup, type DroppedItem } from './drops';
import { WEAPONS } from './weapons';

let n = 100;
const id = () => n++;
const at = { x: 1, y: 0, z: 2 };

describe('dropOnDeath', () => {
  it('Primärwaffe (mit Munitionsstand) und C4 fallen, Pistole bleibt im (verworfenen) Inventar', () => {
    const lo = defaultLoadout('T');
    buyItem(lo, newMoney(5000), 'ak47', 'T');
    lo.guns['ak47']!.mag = 7;
    giveWeapon(lo, 'c4');
    const items = dropOnDeath(lo, at, id);
    expect(items.map((i) => i.weapon).sort()).toEqual(['ak47', 'c4']);
    expect(items.find((i) => i.weapon === 'ak47')!.gun!.mag).toBe(7);
    expect(lo.primary).toBeNull();
    expect(lo.bomb).toBe(false);
  });

  it('ohne Primärwaffe fällt die Pistole; ohne alles nichts', () => {
    const lo = defaultLoadout('CT');
    expect(dropOnDeath(lo, at, id).map((i) => i.weapon)).toEqual(['usp']);
    expect(lo.secondary).toBeNull();
    expect(dropOnDeath(lo, at, id)).toEqual([]);
  });
});

describe('dropActive (G)', () => {
  it('wirft die gehaltene Waffe in Blickrichtung (yaw 0 = −Z)', () => {
    const lo = defaultLoadout('T');
    buyItem(lo, newMoney(5000), 'awp', 'T');
    const d = dropActive(lo, 'awp', { x: 0, y: 0, z: 0 }, 0, id)!;
    expect(d.weapon).toBe('awp');
    expect(d.z).toBeCloseTo(-DROP_THROW);
    expect(d.x).toBeCloseTo(0);
    expect(lo.primary).toBeNull();
  });

  it('C4 lässt sich werfen, Messer/Granaten nicht', () => {
    const lo = defaultLoadout('T');
    giveWeapon(lo, 'c4');
    expect(dropActive(lo, 'c4', at, 0, id)?.weapon).toBe('c4');
    expect(lo.bomb).toBe(false);
    expect(dropActive(lo, 'knife', at, 0, id)).toBeNull();
    expect(dropActive(lo, 'hegrenade', at, 0, id)).toBeNull();
    expect(dropActive(lo, 'c4', at, 0, id)).toBeNull();
  });
});

describe('Aufheben', () => {
  const item = (weapon: string, x = 0, z = 0, y = 0): DroppedItem => ({ id: id(), weapon, x, y, z, gun: WEAPONS[weapon]?.mode === 'hit' ? { mag: 3, reserve: 10, cooldown: 0, reloadLeft: 0, heat: 0 } : undefined });

  it('nimmt Primärwaffe in freien Slot mit Munitionsstand', () => {
    const lo = defaultLoadout('CT');
    const it = item('ak47');
    expect(tryPickup(lo, 'CT', [it], { x: 0.5, y: 0, z: 0.3 })).toBe(it);
    expect(lo.primary).toBe('ak47');
    expect(lo.guns['ak47']!.mag).toBe(3);
  });

  it('belegter Slot, zu weit weg oder falsche Höhe → nichts', () => {
    const lo = defaultLoadout('CT');
    expect(tryPickup(lo, 'CT', [item('usp')], at)).toBeNull(); // Pistole schon vorhanden
    expect(tryPickup(lo, 'CT', [item('m4a1', PICKUP_RADIUS + 0.5)], { x: 0, y: 0, z: 0 })).toBeNull();
    expect(tryPickup(lo, 'CT', [item('m4a1', 0, 0, 3)], { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('C4 nur für Terroristen', () => {
    const c4 = item('c4');
    expect(canPickup(defaultLoadout('CT'), 'CT', c4)).toBe(false);
    const t = defaultLoadout('T');
    expect(tryPickup(t, 'T', [c4], { x: 0, y: 0, z: 0 })).toBe(c4);
    expect(t.bomb).toBe(true);
    expect(canPickup(t, 'T', c4)).toBe(false);
  });

  it('ohne gespeicherten Munitionsstand gibt es ein volles Magazin', () => {
    const lo = defaultLoadout('T');
    tryPickup(lo, 'T', [{ id: 1, weapon: 'mp5', x: 0, y: 0, z: 0 }], { x: 0, y: 0, z: 0 });
    expect(lo.guns['mp5']!.mag).toBe(WEAPONS['mp5']!.magSize);
  });
});

describe('capDrops / droppedBomb', () => {
  it('älteste Waffen fliegen raus, C4 bleibt', () => {
    const items: DroppedItem[] = [{ id: 1, weapon: 'c4', x: 0, y: 0, z: 0 }];
    for (let i = 0; i < MAX_DROPS + 5; i++) items.push({ id: 10 + i, weapon: 'glock', x: 0, y: 0, z: 0 });
    const capped = capDrops(items);
    expect(capped).toHaveLength(MAX_DROPS);
    expect(droppedBomb(capped)?.id).toBe(1);
    expect(capped[1]!.id).toBe(10 + 6);
    expect(capDrops(items.slice(0, 3))).toHaveLength(3);
    expect(droppedBomb([])).toBeNull();
  });
});
