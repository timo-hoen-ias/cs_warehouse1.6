import { describe, expect, it } from 'vitest';
import { eitherSite, HINT_FADE_MS, HINT_SHOW_MS, HintFader, objectiveHint, siteNoun, sitesPlural, type HintInput } from './hudHint';

const names = { a: 'Serverschrank A', b: 'Serverschrank B' };
const base: HintInput = {
  phase: 'live', team: 'T', alive: true, hasBomb: false, bombDropped: false, bombPhase: 'none', bombSpot: null,
  inSite: null, canDefuse: false, hasKit: false, siteNames: names,
};
const hint = (o: Partial<HintInput>) => objectiveHint({ ...base, ...o });

describe('Spotnamen', () => {
  it('gemeinsames Hauptwort', () => {
    expect(siteNoun('Serverschrank A', 'Serverschrank B')).toBe('Serverschrank');
    expect(siteNoun('Große Halle A', 'Große Halle B')).toBe('Große Halle');
    expect(siteNoun('Halle', 'Rampe')).toBe('');
    expect(siteNoun('Halle A', 'Rampe B')).toBe('');
  });
  it('„A oder B“ bzw. Mehrzahl', () => {
    expect(eitherSite(names)).toBe('Serverschrank A oder B');
    expect(eitherSite({ a: 'Halle', b: 'Rampe' })).toBe('Halle oder Rampe');
    expect(sitesPlural(names)).toBe('Serverschränke');
    expect(sitesPlural({ a: 'Halle', b: 'Rampe' })).toBe('Bombenspots');
  });
});

describe('objectiveHint', () => {
  it('T mit Bombe: zu einem der Spots bringen', () => {
    expect(hint({ hasBomb: true })).toEqual({ text: 'Bombe zu Serverschrank A oder B bringen', sticky: false });
  });
  it('T mit Bombe im Spot: Taste halten (bleibt stehen)', () => {
    expect(hint({ hasBomb: true, inSite: 'b' })).toEqual({ text: 'E halten: Bombe legen (Serverschrank B)', sticky: true });
  });
  it('T ohne Bombe: Träger unterstützen; liegt die C4 am Boden: aufheben', () => {
    expect(hint({})?.text).toBe('Bombenträger unterstützen');
    expect(hint({ bombDropped: true })?.text).toBe('Bombe aufheben');
  });
  it('CT vor dem Legen: Spots verteidigen', () => {
    expect(hint({ team: 'CT' })).toEqual({ text: 'Serverschränke verteidigen', sticky: false });
  });
  it('nach dem Legen: CT entschärfen (mit Spot), T bewachen; Taste nur in Reichweite', () => {
    const planted = { bombPhase: 'planted', bombSpot: 'a', phase: 'bomb' } as const;
    expect(hint({ ...planted, team: 'CT' })?.text).toBe('Bombe bei Serverschrank A entschärfen!');
    expect(hint({ ...planted, team: 'CT', canDefuse: true })).toEqual({ text: 'E halten: Bombe entschärfen', sticky: true });
    expect(hint({ ...planted, team: 'CT', canDefuse: true, hasKit: true })?.text).toBe('E halten: Bombe entschärfen (Kit)');
    expect(hint({ ...planted, team: 'T' })?.text).toBe('Bombe bei Serverschrank A bewachen');
    // T-Träger-Status spielt nach dem Legen keine Rolle mehr
    expect(hint({ ...planted, team: 'T', hasBomb: true })?.text).toBe('Bombe bei Serverschrank A bewachen');
  });
  it('beim Entschärfen bleibt der Hinweis; ohne Spot nur „Bombe“', () => {
    expect(hint({ team: 'CT', bombPhase: 'defusing', bombSpot: 'b', phase: 'bomb' })?.text).toBe('Bombe bei Serverschrank B entschärfen!');
    expect(hint({ team: 'CT', bombPhase: 'planted', phase: 'bomb' })?.text).toBe('Bombe entschärfen!');
  });
  it('während des Legens gilt noch der Vor-Plant-Hinweis', () => {
    expect(hint({ team: 'CT', bombPhase: 'planting' })?.text).toBe('Serverschränke verteidigen');
  });
  it('keine Hinweise für Tote, Aufwärmen, Kaufphase und Rundenende', () => {
    expect(hint({ alive: false })).toBeNull();
    for (const phase of ['warmup', 'freeze', 'roundEnd'] as const) expect(hint({ phase })).toBeNull();
  });
});

describe('HintFader', () => {
  it('zeigt einen Ziel-Hinweis voll und blendet ihn danach aus', () => {
    const f = new HintFader();
    const h = { text: 'Serverschränke verteidigen', sticky: false };
    expect(f.update(h, 1000)).toEqual({ text: h.text, alpha: 1 });
    expect(f.update(h, 1000 + HINT_SHOW_MS - 1)?.alpha).toBe(1);
    const mid = f.update(h, 1000 + HINT_SHOW_MS + HINT_FADE_MS / 2);
    expect(mid?.alpha).toBeCloseTo(0.5);
    expect(f.update(h, 1000 + HINT_SHOW_MS + HINT_FADE_MS)).toBeNull();
    expect(f.update(h, 1000 + HINT_SHOW_MS * 3)).toBeNull(); // bleibt weg
  });

  it('neuer Text startet die Anzeige neu', () => {
    const f = new HintFader();
    f.update({ text: 'A', sticky: false }, 0);
    expect(f.update({ text: 'A', sticky: false }, HINT_SHOW_MS * 2)).toBeNull();
    expect(f.update({ text: 'B', sticky: false }, HINT_SHOW_MS * 2 + 10)?.alpha).toBe(1);
  });

  it('null setzt zurück: derselbe Text erscheint in der nächsten Runde wieder', () => {
    const f = new HintFader();
    const h = { text: 'A', sticky: false };
    f.update(h, 0);
    expect(f.update(h, HINT_SHOW_MS * 2)).toBeNull();
    f.update(null, HINT_SHOW_MS * 2 + 1);
    expect(f.update(h, HINT_SHOW_MS * 3)?.alpha).toBe(1);
  });

  it('Tastenhinweise bleiben immer voll; der Ziel-Hinweis davor beginnt danach nicht von vorn', () => {
    const f = new HintFader();
    const goal = { text: 'Bombe zu X bringen', sticky: false };
    f.update(goal, 0);
    expect(f.update({ text: 'E halten: Bombe legen (A)', sticky: true }, HINT_SHOW_MS * 5)).toEqual({ text: 'E halten: Bombe legen (A)', alpha: 1 });
    expect(f.update(goal, HINT_SHOW_MS * 5 + 100)).toBeNull();
  });
});
