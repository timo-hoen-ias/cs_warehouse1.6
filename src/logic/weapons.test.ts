import { describe, expect, it } from 'vitest';
import { WEAPONS, currentSpread, hitDamage, reloadAmount, reloadDuration, shotInterval } from './weapons';

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

  it('semi/sniper ohne rpm → 0 (manueller Klick)', () => {
    expect(shotInterval(usp)).toBe(0);
    expect(shotInterval(awp)).toBe(0);
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
      expect(w.damage).toBeGreaterThan(0);
      expect(w.headFactor).toBeGreaterThanOrEqual(1);
      expect(w.reloadTime).toBeGreaterThanOrEqual(0);
      expect(w.spreadBase).toBeGreaterThanOrEqual(0);
      expect(w.range).toBeGreaterThan(0);
      expect(['hit', 'melee']).toContain(w.mode);
      expect(w.recoil.recovery).toBeGreaterThan(0);
      expect(w.recoil.cap).toBeGreaterThanOrEqual(0);
    }
  });

  it('Messer hat keinen Recoil; Schusswaffen haben Recoil-Parameter', () => {
    expect(WEAPONS['knife']!.recoil.up).toBe(0);
    for (const w of Object.values(WEAPONS)) {
      if (w.mode === 'melee') continue;
      expect(w.recoil.up).toBeGreaterThan(0);
      expect(w.recoil.cap).toBeGreaterThanOrEqual(w.recoil.up);
    }
  });

  it('Magazin- und Reserve sind konsistent (full mag ≤ reserve falls endlich)', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!Number.isFinite(w.magSize)) continue;
      expect(w.reserve).toBeGreaterThanOrEqual(w.magSize);
    }
  });

  it('Schusswaffen haben ein Modell; Messer keins (prozedural)', () => {
    for (const w of Object.values(WEAPONS)) {
      if (w.mode === 'melee') {
        expect(w.visual.model).toBe('');
        continue;
      }
      expect(w.visual.model.length).toBeGreaterThan(0);
    }
  });

  it('Viewmodel-Offsets zeigen vor die Kamera (z negativ) und Mündung davor', () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.visual.scale).toBeGreaterThan(0);
      expect(w.visual.pos.z).toBeLessThan(0);
      expect(w.visual.muzzle.z).toBeLessThan(w.visual.pos.z);
    }
  });
});
