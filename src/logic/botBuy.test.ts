import { describe, expect, it } from 'vitest';
import { BUY, applyBuy, botBuyList, teamBuyKind } from './botBuy';
import { newMoney, priceOf } from './economy';
import { defaultLoadout, giveWeapon } from './loadout';

const rnd = (v: number) => () => v;

describe('Team-Kauf der Bots', () => {
  it('Pistolenrunde, Vollkauf, Eco (nächste Runde reicht), Force', () => {
    expect(teamBuyKind('T', [800, 800, 800], 1, 0, rnd(0.5))).toBe('pistol');
    expect(teamBuyKind('T', [5000, 4000, 3800, 1000], 3, 0, rnd(0.5))).toBe('full');
    // wenig Geld, aber nächste Runde mit Verlustbonus genug → sparen
    expect(teamBuyKind('CT', [1900, 2100, 1800], 3, 2, rnd(0.9))).toBe('eco');
    // knapp unter Vollkauf, nächste Runde reicht es auch mit Bonus nicht → Force/Halb
    expect(['force', 'half']).toContain(teamBuyKind('CT', [2500, 2600, 2400], 4, 0, rnd(0.1)));
    // T mit 2300 und frischem Sieg: nächste Runde reicht es (Bonus 1400) → sparen
    expect(teamBuyKind('T', [2300, 2400, 2200], 4, 0, rnd(0.1))).toBe('eco');
    expect(teamBuyKind('T', [900, 1000, 800], 4, 0, rnd(0.5))).toBe('eco');
    expect(BUY.full.CT).toBeGreaterThan(BUY.full.T);
  });

  it('Vollkauf: Gewehr, Helm, Kit (CT), Granaten nach Rolle; nie mehr Geld als vorhanden', () => {
    const lo = defaultLoadout('CT');
    const list = botBuyList(lo, 6000, 'CT', 'full', 'support', 0.6, rnd(0.9));
    expect(list[0]).toBe('m4a1');
    expect(list).toContain('helmet');
    expect(list).toContain('defusekit');
    expect(list).toContain('smokegrenade');
    expect(list.reduce((s, id) => s + (id === 'helmet' && lo.armor >= 100 ? 350 : priceOf(id)), 0)).toBeLessThanOrEqual(6000);
    const t = botBuyList(defaultLoadout('T'), 5000, 'T', 'full', 'entry', 0.6, rnd(0.9));
    expect(t[0]).toBe('ak47');
    expect(t.filter((x) => x === 'flashbang').length).toBeGreaterThanOrEqual(1);
    expect(t).not.toContain('defusekit');
  });

  it('Scharfschütze kauft die AWP, wenn genug Geld da ist', () => {
    expect(botBuyList(defaultLoadout('CT'), 7000, 'CT', 'full', 'awp', 0.8, rnd(0.9))[0]).toBe('awp');
    expect(botBuyList(defaultLoadout('CT'), 4500, 'CT', 'full', 'awp', 0.8, rnd(0.9))[0]).not.toBe('awp');
  });

  it('Eco kauft nichts (höchstens eine Deagle mit Restgeld), Force nimmt SMG/Galil + Weste', () => {
    expect(botBuyList(defaultLoadout('T'), 1500, 'T', 'eco', 'support', 0.6, rnd(0.1))).toEqual([]);
    const f = botBuyList(defaultLoadout('T'), 2200, 'T', 'force', 'support', 0.6, rnd(0.1));
    expect(['galil', 'ump45', 'mp5', 'mac10']).toContain(f[0]);
    expect(f.some((x) => x === 'kevlar' || x === 'helmet')).toBe(true);
  });

  it('Halbkauf: Famas/Galil + Weste, wenn es reicht (statt SMG), sonst SMG', () => {
    const ct = botBuyList(defaultLoadout('CT'), 3300, 'CT', 'half', 'rotator', 0.6, rnd(0.5));
    expect(ct[0]).toBe('famas');
    expect(ct.some((x) => x === 'kevlar' || x === 'helmet')).toBe(true);
    const t = botBuyList(defaultLoadout('T'), 2900, 'T', 'half', 'support', 0.6, rnd(0.5));
    expect(t[0]).toBe('galil');
    const poor = botBuyList(defaultLoadout('CT'), 2400, 'CT', 'half', 'rotator', 0.6, rnd(0.5));
    expect(['ump45', 'mp5', 'tmp']).toContain(poor[0]);
  });

  it('vorhandene Primärwaffe wird behalten (Überlebende)', () => {
    const lo = defaultLoadout('T');
    giveWeapon(lo, 'ak47');
    expect(botBuyList(lo, 5000, 'T', 'full', 'support', 0.6, rnd(0.9))).not.toContain('ak47');
  });

  it('Einkauf über die Kaufregeln: Geld wird abgezogen, Inventar gefüllt', () => {
    const lo = defaultLoadout('CT');
    const money = newMoney(5000);
    const got = applyBuy(lo, money, 'CT', ['m4a1', 'helmet', 'defusekit', 'awp']);
    expect(got).toEqual(['m4a1', 'helmet', 'defusekit']);
    expect(lo.primary).toBe('m4a1');
    expect(lo.helmet && lo.defuseKit).toBe(true);
    expect(money.amount).toBe(5000 - 3100 - 1000 - 200);
  });
});
