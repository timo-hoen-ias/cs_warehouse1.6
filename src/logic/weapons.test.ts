import { describe, expect, it } from 'vitest';
import { BUY_CATEGORIES, EQUIPMENT, TYPE_VISUAL, WEAPONS, currentSpread, hitDamage, nextZoomLevel, rangeFalloff, reloadAmount, reloadDuration, shotInterval, teamCanUse, weaponsInCategory, zoomFov } from './weapons';

const ak = WEAPONS['ak47']!;
const awp = WEAPONS['awp']!;
const usp = WEAPONS['usp']!;

describe('hitDamage', () => {
  it('Kopfschuss = damage × headFactor (gerundet)', () => {
    expect(hitDamage(ak, 'body')).toBe(ak.damage);
    expect(hitDamage(ak, 'head')).toBe(ak.damage * ak.headFactor);
    expect(hitDamage(usp, 'head')).toBe(usp.damage * usp.headFactor);
  });

  it('Messer: kein Kopf-Bonus', () => {
    const knife = WEAPONS['knife']!;
    expect(hitDamage(knife, 'head')).toBe(knife.damage);
  });
});

describe('shotInterval', () => {
  it('auto-Waffe: 600 rpm → 0.1 s', () => {
    expect(shotInterval(ak)).toBeCloseTo(0.1);
  });

  it('semi/sniper ohne rpm → Repetierzeit (cycle), sonst 0', () => {
    expect(shotInterval(usp)).toBe(usp.cycle);
    expect(shotInterval(awp)).toBeCloseTo(1.45);
    expect(shotInterval(WEAPONS['m3']!)).toBeCloseTo(60 / 70);
  });
});

describe('currentSpread', () => {
  it('ohne Schüsse und still = Basis-Streuung', () => {
    expect(currentSpread(usp, 0, false)).toBe(usp.spreadBase);
  });

  it('steigt mit jedem Schuss und mit Bewegung', () => {
    expect(currentSpread(ak, 3, false)).toBeGreaterThan(currentSpread(ak, 0, false));
    expect(currentSpread(ak, 0, true)).toBeGreaterThan(currentSpread(ak, 0, false));
    expect(currentSpread(ak, 5, true)).toBeGreaterThan(currentSpread(ak, 5, false));
  });
});

describe('reload', () => {
  it('leeres Magazin dauert länger', () => {
    expect(reloadDuration(ak, true)).toBeGreaterThan(reloadDuration(ak, false));
  });

  it('lädt höchstens so viel nach, wie Magazin + Reserve hergeben', () => {
    expect(reloadAmount(ak, 5, 30)).toBe(25);
    expect(reloadAmount(ak, 5, 10)).toBe(10);
    expect(reloadAmount(ak, 30, 30)).toBe(0);
  });
});

describe('Datenkonsistenz', () => {
  it('alle Waffen haben gültige Felder', () => {
    for (const w of Object.values(WEAPONS)) {
      if (w.mode === 'hit' || w.mode === 'melee') expect(w.damage).toBeGreaterThan(0);
      expect(w.headFactor).toBeGreaterThanOrEqual(1);
      expect(w.reloadTime).toBeGreaterThanOrEqual(0);
      expect(w.spreadBase).toBeGreaterThanOrEqual(0);
      expect(w.range).toBeGreaterThan(0);
      expect(['hit', 'melee', 'throw', 'plant']).toContain(w.mode);
      expect([1, 2, 3, 4, 5]).toContain(w.slot);
      expect(['T', 'CT', 'both']).toContain(w.team);
      expect(w.armorPen).toBeGreaterThanOrEqual(0);
      expect(w.armorPen).toBeLessThanOrEqual(1);
      expect(w.pellets).toBeGreaterThanOrEqual(1);
      expect(w.recoil.recovery).toBeGreaterThan(0);
      expect(w.recoil.cap).toBeGreaterThanOrEqual(0);
    }
  });

  it('Messer hat keinen Recoil; Schusswaffen haben Recoil-Parameter', () => {
    expect(WEAPONS['knife']!.recoil.up).toBe(0);
    for (const w of Object.values(WEAPONS)) {
      if (w.mode !== 'hit') continue;
      expect(w.recoil.up).toBeGreaterThan(0);
      expect(w.recoil.cap).toBeGreaterThanOrEqual(w.recoil.up);
    }
  });

  it('Magazin- und Reserve sind konsistent (full mag ≤ reserve falls endlich)', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!Number.isFinite(w.magSize) || w.mode !== 'hit') continue;
      expect(w.reserve).toBeGreaterThanOrEqual(w.magSize);
    }
  });

  it('Jede Waffe hat ein eigenes prozedurales Modell; der Messerstich nutzt das Messer', () => {
    for (const w of Object.values(WEAPONS)) {
      if (w.id === 'knife_stab') expect(w.visual.model).toBe('knife');
      else expect(w.visual.model).toBe(w.id);
    }
  });

  it('CS-1.6-Arsenal vollständig: Slots, Teams, Granaten, C4', () => {
    const ids = Object.keys(WEAPONS);
    for (const id of ['glock', 'usp', 'deagle', 'm3', 'mp5', 'p90', 'ak47', 'm4a1', 'awp', 'scout', 'm249', 'hegrenade', 'flashbang', 'smokegrenade', 'c4']) {
      expect(ids).toContain(id);
    }
    expect(WEAPONS['ak47']!.team).toBe('T');
    expect(WEAPONS['m4a1']!.team).toBe('CT');
    expect(WEAPONS['ak47']!.slot).toBe(1);
    expect(WEAPONS['glock']!.slot).toBe(2);
    expect(WEAPONS['knife']!.slot).toBe(3);
    expect(WEAPONS['hegrenade']!.slot).toBe(4);
    expect(WEAPONS['hegrenade']!.grenadeKind).toBe('he');
    expect(WEAPONS['c4']!.slot).toBe(5);
    expect(WEAPONS['m3']!.pellets).toBeGreaterThan(1);
    expect(WEAPONS['knife']!.price).toBe(0);
    expect(WEAPONS['awp']!.price).toBe(4750);
  });

  it('Viewmodel-Haltung: Griff unten rechts vor der Kamera, nur leicht gedreht', () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.visual.pos.z).toBeLessThan(0);
      expect(w.visual.pos.z).toBeGreaterThan(-0.5);
      expect(w.visual.pos.y).toBeLessThan(0);
      expect(w.visual.pos.x).toBeGreaterThan(0);
      for (const a of [w.visual.rot.x, w.visual.rot.y, w.visual.rot.z]) expect(Math.abs(a)).toBeLessThan(0.6);
    }
  });

  it('Viewmodel-Defaults je Typ werden gefüllt (JSON darf überschreiben)', () => {
    expect(WEAPONS['mp5']!.visual.pos).toEqual(TYPE_VISUAL.smg.pos);
    // Schusswaffen: Rollwinkel vom Typ, Drehung x/y aus Position + Mündung berechnet (siehe weaponGeom.test.ts)
    expect(WEAPONS['awp']!.visual.rot.z).toBe(TYPE_VISUAL.sniper.rot.z);
    expect(WEAPONS['awp']!.visual.rot.y).toBeGreaterThan(0);
    // Messer/Granaten/C4 behalten die feste Drehung des Typs
    expect(WEAPONS['knife']!.visual.rot).toEqual(TYPE_VISUAL.knife.rot);
    expect(WEAPONS['hegrenade']!.visual.rot).toEqual(TYPE_VISUAL.grenade.rot);
    // Bullpups halten weiter vorn (Überschreibung nur der Position)
    expect(WEAPONS['famas']!.visual.pos.z).toBeLessThan(TYPE_VISUAL.rifle.pos.z);
  });
});

describe('Kauf-Kategorien', () => {
  it('Team-Filter: T sieht AK, CT sieht M4; beide sehen AWP', () => {
    const t = weaponsInCategory('rifle', 'T').map((w) => w.id);
    const ct = weaponsInCategory('rifle', 'CT').map((w) => w.id);
    expect(t).toContain('ak47');
    expect(t).not.toContain('m4a1');
    expect(ct).toContain('m4a1');
    expect(ct).not.toContain('ak47');
    expect(t).toContain('awp');
    expect(ct).toContain('awp');
  });

  it('Kategorien sind nach Preis sortiert und enthalten keine Gratis-Items', () => {
    for (const cat of BUY_CATEGORIES) {
      const list = weaponsInCategory(cat.id, 'T');
      for (let i = 1; i < list.length; i++) expect(list[i]!.price).toBeGreaterThanOrEqual(list[i - 1]!.price);
      for (const w of list) expect(w.price).toBeGreaterThan(0);
    }
    expect(weaponsInCategory('equipment', 'CT').map((w) => w.id)).toEqual(['flashbang', 'hegrenade', 'smokegrenade']);
  });

  it('teamCanUse: Kit nur CT, Kevlar beide', () => {
    expect(teamCanUse(EQUIPMENT.defusekit, 'CT')).toBe(true);
    expect(teamCanUse(EQUIPMENT.defusekit, 'T')).toBe(false);
    expect(teamCanUse(EQUIPMENT.kevlar, 'T')).toBe(true);
  });
});

describe('rangeFalloff', () => {
  it('Nahdistanz = voller Schaden, Ferne weniger; Sniper ohne Abfall', () => {
    expect(rangeFalloff(ak, 0)).toBe(1);
    expect(rangeFalloff(ak, 50)).toBeLessThan(1);
    expect(rangeFalloff(ak, 50)).toBeGreaterThan(rangeFalloff(usp, 50));
    expect(rangeFalloff(awp, 200)).toBe(1);
    expect(rangeFalloff(WEAPONS['m3']!, 20)).toBeLessThan(0.6);
  });
});

describe('Zoom', () => {
  it('AWP hat zwei Stufen, Gewehre ohne Zielfernrohr keine; Stufen zyklisch', () => {
    const awpZ = WEAPONS['awp']!;
    expect(nextZoomLevel(awpZ, 0)).toBe(1);
    expect(nextZoomLevel(awpZ, 1)).toBe(2);
    expect(nextZoomLevel(awpZ, 2)).toBe(0);
    expect(nextZoomLevel(WEAPONS['ak47']!, 0)).toBe(0);
    expect(nextZoomLevel(WEAPONS['aug']!, 0)).toBe(1);
    expect(nextZoomLevel(WEAPONS['aug']!, 1)).toBe(0);
  });
  it('zoomFov liefert Ziel-FOV, Stufe 0 = Basis', () => {
    expect(zoomFov(WEAPONS['awp']!, 0, 75)).toBe(75);
    expect(zoomFov(WEAPONS['awp']!, 1, 75)).toBe(40);
    expect(zoomFov(WEAPONS['awp']!, 2, 75)).toBe(15);
    expect(zoomFov(WEAPONS['ak47']!, 1, 75)).toBe(75);
  });
  it('Messerstich ist stärker und kürzer als der normale Hieb', () => {
    expect(WEAPONS['knife_stab']!.damage).toBeGreaterThan(WEAPONS['knife']!.damage);
    expect(WEAPONS['knife_stab']!.range).toBeLessThanOrEqual(WEAPONS['knife']!.range);
  });
});
