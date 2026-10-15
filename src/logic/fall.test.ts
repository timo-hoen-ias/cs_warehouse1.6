import { describe, expect, it } from 'vitest';
import { FALL, acceptFallReport, damageHeight, fallDamage, fallSpeedFromHeight, hostFallDamage, landPunch, landSlow, observedFallSpeed, type HeightSample } from './fall';

describe('Sturzschaden (CS-Formel)', () => {
  it('bis zur sicheren Geschwindigkeit kein Schaden', () => {
    expect(fallDamage(0)).toBe(0);
    expect(fallDamage(7)).toBe(0);
    expect(fallDamage(FALL.safe)).toBe(0);
    expect(fallDamage(NaN)).toBe(0);
  });

  it('knapp über der Schwelle wenig, linear steigend, tödlich ab 1024 u/s', () => {
    expect(fallDamage(FALL.safe + 0.1)).toBeGreaterThanOrEqual(1);
    const mid = fallDamage((FALL.safe + FALL.fatal) / 2);
    expect(mid).toBeGreaterThanOrEqual(49);
    expect(mid).toBeLessThanOrEqual(51);
    expect(fallDamage(FALL.fatal)).toBe(100);
    expect(fallDamage(FALL.fatal * 2)).toBe(100);
  });

  it('monoton in der Geschwindigkeit', () => {
    let last = 0;
    for (let v = 0; v < 40; v += 0.5) {
      const d = fallDamage(v);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
  });

  it('Fallhöhen: 4 m Absatz ungefährlich, Schaden ab ≈ 5 m, tödlich ≈ 16 m (g = 20)', () => {
    expect(fallDamage(fallSpeedFromHeight(4))).toBe(0);
    expect(damageHeight()).toBeGreaterThan(4.8);
    expect(damageHeight()).toBeLessThan(5.6);
    expect(fallDamage(fallSpeedFromHeight(7))).toBeGreaterThan(0);
    expect(fallDamage(fallSpeedFromHeight(7))).toBeLessThan(40);
    expect(fallDamage(fallSpeedFromHeight(16.5))).toBe(100);
  });
});

describe('Landeruck und Tempoverlust', () => {
  it('normaler Sprung nur leises Nicken, Sturz deutlich stärker', () => {
    expect(landPunch(0)).toBe(0);
    expect(landPunch(3)).toBe(0);
    expect(landPunch(6.65)).toBeGreaterThan(0);
    expect(landPunch(6.65)).toBeLessThan(0.3);
    expect(landPunch(FALL.safe)).toBeCloseTo(1, 5);
    expect(landPunch(100)).toBeLessThanOrEqual(1.4);
  });

  it('kein Tempoverlust bei normalen Landungen, bis halbes Tempo bei hartem Aufprall', () => {
    expect(landSlow(6.65)).toBe(1);
    expect(landSlow(FALL.hard)).toBe(1);
    expect(landSlow(FALL.safe)).toBeCloseTo(0.5, 5);
    expect(landSlow(30)).toBeCloseTo(0.5, 5);
    expect(landSlow((FALL.hard + FALL.safe) / 2)).toBeLessThan(1);
    expect(landSlow((FALL.hard + FALL.safe) / 2)).toBeGreaterThan(0.5);
  });
});

describe('Host-Prüfung von Sturzmeldungen', () => {
  it('Unsinn und Spam werden verworfen', () => {
    expect(acceptFallReport('x', Infinity)).toBeNull();
    expect(acceptFallReport(NaN, Infinity)).toBeNull();
    expect(acceptFallReport(Infinity, Infinity)).toBeNull();
    expect(acceptFallReport(20, 0.1)).toBeNull();
  });

  it('harmlose Meldungen ergeben keinen Schaden', () => {
    expect(acceptFallReport(8, Infinity)).toBeNull();
    expect(acceptFallReport(-5, Infinity)).toBeNull();
  });

  it('gültige Meldung liefert Schaden, übergroße Werte werden gedeckelt', () => {
    const d = acceptFallReport(20, 5);
    expect(d).toBe(fallDamage(20));
    expect(d!).toBeGreaterThan(0);
    expect(acceptFallReport(1e9, Infinity)).toBe(fallDamage(FALL.maxReport));
    expect(acceptFallReport(1e9, Infinity)).toBeLessThanOrEqual(100);
  });
});

describe('Host-Prüfung mit Posen-Historie (fremde Clients)', () => {
  // Fall aus h Metern, mit 20 Hz abgetastet, Landung bei t = 2
  const fallTrail = (h: number, ground = 0): HeightSample[] => {
    const out: HeightSample[] = [];
    const dur = Math.sqrt((2 * h) / 20);
    for (let t = 0; t <= 2.0001; t += 0.05) {
      const tf = t - (2 - dur);
      out.push({ t, y: tf <= 0 ? ground + h : Math.max(ground, ground + h - 10 * tf * tf) });
    }
    return out;
  };

  it('beobachtete Geschwindigkeit folgt der gesehenen Fallhöhe', () => {
    const v = observedFallSpeed(fallTrail(10), 2);
    expect(v).toBeGreaterThanOrEqual(fallSpeedFromHeight(10));
    expect(v).toBeLessThan(fallSpeedFromHeight(12));
    // Kein Fall (am Boden, nur Aufwärtsbewegung) → 0
    expect(observedFallSpeed([{ t: 0, y: 0 }, { t: 0.5, y: 0 }, { t: 1, y: 1 }], 1)).toBe(0);
    expect(observedFallSpeed([], 1)).toBe(0);
    // Alte Stichproben außerhalb des Fensters zählen nicht
    expect(observedFallSpeed([{ t: 0, y: 30 }, { t: 0.1, y: 0 }], 10)).toBe(0);
    // NaN-Höhen werden ignoriert
    expect(observedFallSpeed([{ t: 0, y: NaN }, { t: 0.1, y: 0 }], 0.2)).toBe(0);
  });

  it('gefälschte Meldung ohne Fall in der Historie wird verworfen', () => {
    expect(hostFallDamage(30, Infinity, observedFallSpeed([{ t: 0, y: 0 }, { t: 1, y: 0 }], 1), 'live')).toBeNull();
  });

  it('Meldung wird auf die beobachtete Fallhöhe und unter „tödlich“ gedeckelt', () => {
    const obs = observedFallSpeed(fallTrail(8), 2);
    // Behauptet 40 m/s, gesehen wurden ~8 m → Schaden wie aus der Beobachtung
    expect(hostFallDamage(40, Infinity, obs, 'live')).toBe(fallDamage(obs));
    // Auch ein riesiger echter Sturz tötet über eine fremde Meldung nie allein
    const huge = observedFallSpeed(fallTrail(40), 2);
    const d = hostFallDamage(1e9, Infinity, huge, 'live')!;
    expect(d).toBe(fallDamage(FALL.maxAccept));
    expect(d).toBeLessThan(100);
    expect(FALL.maxAccept).toBeLessThan(FALL.fatal);
  });

  it('ignoriert Aufwärmen/Kaufphase, Unsinn und zu dichte Folge', () => {
    const obs = observedFallSpeed(fallTrail(10), 2);
    expect(hostFallDamage(20, Infinity, obs, 'warmup')).toBeNull();
    expect(hostFallDamage(20, Infinity, obs, 'freeze')).toBeNull();
    expect(hostFallDamage(NaN, Infinity, obs, 'live')).toBeNull();
    expect(hostFallDamage('20', Infinity, obs, 'live')).toBeNull();
    expect(hostFallDamage(20, 0.1, obs, 'live')).toBeNull();
    expect(hostFallDamage(20, Infinity, NaN, 'live')).toBeNull();
    expect(hostFallDamage(20, Infinity, obs, 'live')).toBe(fallDamage(Math.min(20, obs)));
  });
});
