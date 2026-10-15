import { describe, expect, it } from 'vitest';
import {
  ammoLow, buyCategoryItems, buyStateText, buyTopLevel, deathInfo, escapeHtml, intText, formatClock, formatMoney, formatMoneyDelta, helmetPrice,
  hpLevel, iconWeapon, killFeedEntry, outcomeText, phaseLabel, pingText, roundOutcome, weaponStatBars, type BuyContext,
} from './hudFormat';
import { WEAPONS, weaponsInCategory } from './weapons';

describe('Formate', () => {
  it('formatClock: m:ss, aufgerundet, nie negativ', () => {
    expect(formatClock(115)).toBe('1:55');
    expect(formatClock(59.2)).toBe('1:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
    expect(formatClock(600)).toBe('10:00');
  });

  it('formatMoney wie CS', () => {
    expect(formatMoney(800)).toBe('$ 800');
    expect(formatMoney(16000)).toBe('$ 16000');
    expect(formatMoney(-5)).toBe('$ 0');
  });

  it('formatMoneyDelta', () => {
    expect(formatMoneyDelta(800, 1100)).toBe('+300');
    expect(formatMoneyDelta(800, 150)).toBe('-650');
    expect(formatMoneyDelta(800, 800)).toBeNull();
  });

  it('Phasen, HP-Stufen, Munition knapp', () => {
    expect(phaseLabel('freeze')).toBe('Kaufphase');
    expect(phaseLabel('xyz')).toBe('xyz');
    expect(hpLevel(100)).toBe('ok');
    expect(hpLevel(40)).toBe('warn');
    expect(hpLevel(15)).toBe('crit');
    expect(ammoLow(6, 30)).toBe(true);
    expect(ammoLow(7, 30)).toBe(false);
    expect(ammoLow(1, 5)).toBe(true);
    expect(ammoLow(Infinity, Infinity)).toBe(false);
  });

  it('Ping-Anzeige', () => {
    expect(pingText(true, 0)).toBe('BOT');
    expect(pingText(false, -1)).toBe('–');
    expect(pingText(false, Number.NaN)).toBe('–');
    expect(pingText(false, 0)).toBe('0');
    expect(pingText(false, 42.4)).toBe('42');
  });

  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('intText: Zahlen fürs innerHTML sind immer Ganzzahlen (kein HTML aus gefälschten Werten)', () => {
    expect(intText(7)).toBe('7');
    expect(intText(-3.9)).toBe('-3');
    expect(intText('<img src=x onerror=alert(1)>')).toBe('0');
    expect(intText('12')).toBe('0');
    expect(intText(NaN)).toBe('0');
    expect(intText(Infinity)).toBe('0');
    expect(intText(null)).toBe('0');
    expect(intText({ toString: () => '<b>' })).toBe('0');
  });
});

describe('Rundenende', () => {
  it('Sieger, Titel und Grund', () => {
    expect(roundOutcome('t_win', 'Counter-Terroristen eliminiert')).toEqual({ winner: 'T', title: 'Terroristen gewinnen', subtitle: 'Counter-Terroristen eliminiert' });
    expect(roundOutcome('t_win_explode', '')).toMatchObject({ winner: 'T', subtitle: 'Ziel erfolgreich zerstört' });
    expect(roundOutcome('ct_win', 'Zeit abgelaufen')).toMatchObject({ winner: 'CT', title: 'Counter-Terroristen gewinnen' });
    expect(roundOutcome('ct_win_defuse', '')).toMatchObject({ winner: 'CT', subtitle: 'Die Bombe wurde entschärft' });
    expect(roundOutcome('??', 'x').winner).toBeNull();
  });

  it('Einzeiliger Text', () => {
    expect(outcomeText('ct_win', 'Zeit abgelaufen')).toBe('Counter-Terroristen gewinnen — Zeit abgelaufen');
    expect(outcomeText('', '')).toBe('Runde beendet');
  });
});

describe('Kill-Feed', () => {
  const players = { a: { name: 'Anna', team: 'T' as const, hp: 37 }, b: { name: 'Bert', team: 'CT' as const, hp: 0 } };

  it('baut einen Eintrag mit Teams, Waffe und Kopfschuss', () => {
    const v = killFeedEntry({ killer: 'a', victim: 'b', weapon: 'ak47', hs: true }, players, null);
    expect(v).toMatchObject({ killer: { name: 'Anna', team: 'T' }, victim: { name: 'Bert', team: 'CT' }, weapon: 'ak47', weaponName: 'AK-47', headshot: true, suicide: false, self: null });
  });

  it('markiert Beteiligung des lokalen Spielers', () => {
    expect(killFeedEntry({ killer: 'a', victim: 'b', weapon: 'ak47', hs: false }, players, 'a').self).toBe('killer');
    expect(killFeedEntry({ killer: 'a', victim: 'b', weapon: 'ak47', hs: false }, players, 'b').self).toBe('victim');
  });

  it('Welt-/Selbsttod ohne Killer; Messerstich zeigt Messer', () => {
    const w = killFeedEntry({ killer: null, victim: 'b', weapon: 'c4', hs: false }, players, null);
    expect(w).toMatchObject({ killer: null, suicide: true, weaponName: 'C4-Explosion' });
    expect(killFeedEntry({ killer: 'a', victim: 'a', weapon: 'hegrenade', hs: false }, players, 'a')).toMatchObject({ suicide: true, self: 'victim' });
    expect(killFeedEntry({ killer: 'a', victim: 'b', weapon: 'knife_stab', hs: false }, players, null).weapon).toBe('knife');
    expect(iconWeapon('awp')).toBe('awp');
  });

  it('unbekannte Spieler fallen auf die ID zurück', () => {
    expect(killFeedEntry({ killer: 'x', victim: 'y', weapon: 'awp', hs: false }, {}, null)).toMatchObject({ killer: { name: 'x' }, victim: { name: 'y' } });
  });
});

describe('Todesinfo', () => {
  const players = { a: { name: 'Anna', team: 'T' as const, hp: 37 }, me: { name: 'Ich', team: 'CT' as const, hp: 0 } };

  it('„Getötet von X mit AWP (Kopfschuss)“ inkl. Rest-HP des Gegners', () => {
    expect(deathInfo({ killer: 'a', victim: 'me', weapon: 'awp', hs: true }, players, 'me')).toEqual({
      title: 'Getötet von Anna', detail: 'mit AWP (Kopfschuss)', killerTeam: 'T', killerHp: 37, weapon: 'awp',
    });
  });

  it('nur für den lokalen Spieler', () => {
    expect(deathInfo({ killer: 'me', victim: 'a', weapon: 'awp', hs: false }, players, 'me')).toBeNull();
  });

  it('Sturz: eigener Titel', () => {
    expect(deathInfo({ killer: null, victim: 'me', weapon: 'fall', hs: false }, players, 'me')).toMatchObject({ title: 'Zu tief gefallen', detail: 'Sturzschaden', killerTeam: null });
  });

  it('Bombe und Selbsttod', () => {
    expect(deathInfo({ killer: null, victim: 'me', weapon: 'c4', hs: false }, players, 'me')?.title).toBe('Von der Bombe getötet');
    expect(deathInfo({ killer: 'me', victim: 'me', weapon: 'hegrenade', hs: false }, players, 'me')).toMatchObject({ title: 'Selbst ausgeschaltet', detail: 'mit HE-Granate' });
  });
});

describe('Kaufmenü', () => {
  const ctx = (o: Partial<BuyContext> = {}): BuyContext => ({
    team: 'T', money: 2700, primary: null, secondary: 'glock', armor: 0, helmet: false, kit: false, nades: { he: 0, flash: 0, smoke: 0 }, ...o,
  });

  it('oberste Ebene: 1–5 Waffen, 6/7 Munition, 8 Ausrüstung', () => {
    expect(buyTopLevel().map((e) => e.key)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(buyTopLevel().find((e) => e.key === 8)?.id).toBe('equipment');
    expect(buyTopLevel().find((e) => e.key === 6)?.price).toBeGreaterThan(0);
  });

  it('Tasten entsprechen weaponsInCategory (Tastatur-Kauf bleibt gleich)', () => {
    for (const team of ['T', 'CT'] as const) {
      for (const cat of ['pistol', 'shotgun', 'smg', 'rifle', 'mg'] as const) {
        const items = buyCategoryItems(cat, ctx({ team }));
        const keyed = items.filter((i) => i.key !== null);
        expect(keyed.map((i) => i.id)).toEqual(weaponsInCategory(cat, team).map((w) => w.id));
        expect(keyed.map((i) => i.key)).toEqual(keyed.map((_, i) => i + 1));
      }
    }
  });

  it('Waffen des anderen Teams erscheinen gesperrt ohne Taste', () => {
    const rifles = buyCategoryItems('rifle', ctx({ team: 'T' }));
    const m4 = rifles.find((i) => i.id === 'm4a1')!;
    expect(m4).toMatchObject({ key: null, state: 'team', team: 'CT' });
    expect(buyStateText(m4.state, m4.team)).toBe('Nur CT');
  });

  it('Zustände: leistbar, zu teuer, im Besitz', () => {
    const rifles = buyCategoryItems('rifle', ctx({ money: 2500, primary: 'galil' }));
    expect(rifles.find((i) => i.id === 'ak47')?.state).toBe('ok');
    expect(rifles.find((i) => i.id === 'awp')?.state).toBe('money');
    expect(rifles.find((i) => i.id === 'galil')?.state).toBe('owned');
    expect(buyCategoryItems('pistol', ctx()).find((i) => i.id === 'glock')?.state).toBe('owned');
  });

  it('Ausrüstung: Weste/Helm/Granaten-Limit/Kit nur CT', () => {
    const eq = buyCategoryItems('equipment', ctx({ armor: 100, nades: { he: 1, flash: 1, smoke: 0 } }));
    expect(eq.map((i) => i.id)).toEqual(['kevlar', 'helmet', 'flashbang', 'hegrenade', 'smokegrenade', 'defusekit']);
    expect(eq.find((i) => i.id === 'kevlar')?.state).toBe('owned');
    expect(eq.find((i) => i.id === 'helmet')).toMatchObject({ price: 350, state: 'ok' });
    expect(eq.find((i) => i.id === 'hegrenade')?.state).toBe('full');
    expect(eq.find((i) => i.id === 'flashbang')?.state).toBe('ok');
    expect(eq.find((i) => i.id === 'defusekit')?.state).toBe('team');
    const ct = buyCategoryItems('equipment', ctx({ team: 'CT', kit: true }));
    expect(ct.find((i) => i.id === 'defusekit')?.state).toBe('owned');
    expect(helmetPrice(0)).toBe(1000);
  });
});

describe('weaponStatBars', () => {
  it('liefert Werte in 0..1 für alle kaufbaren Waffen', () => {
    for (const w of Object.values(WEAPONS)) {
      if (w.price <= 0 || w.type === 'grenade') continue;
      const s = weaponStatBars(w);
      for (const v of [s.damage, s.rate, s.accuracy, s.penetration]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(s.mag).toMatch(/\d+ \/ \d+/);
    }
  });

  it('AWP trifft härter als die Glock, P90 feuert schneller als die Deagle', () => {
    expect(weaponStatBars(WEAPONS.awp!).damage).toBeGreaterThan(weaponStatBars(WEAPONS.glock!).damage);
    expect(weaponStatBars(WEAPONS.p90!).rate).toBeGreaterThan(weaponStatBars(WEAPONS.deagle!).rate);
  });
});
