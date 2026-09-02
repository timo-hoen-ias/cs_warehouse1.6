import { describe, expect, it } from 'vitest';
import { attachBestaende, groupLagerorte } from './query';

const platzRow = (over: Record<string, unknown>) => ({
  Mandant: 123,
  Lagerkennung: 'LAG',
  Bezeichnung: 'Testlager',
  Lagertechnik: 'LTD3HR',
  AnzahlDimension1: 2,
  AnzahlDimension2: 2,
  AnzahlDimension3: 2,
  PlatzID: 1,
  Dimension1: 0,
  Dimension2: 0,
  Dimension3: 0,
  Dimensionsebene: 0,
  Kurzbezeichnung: 'LAG;0;0;0',
  Platzbezeichnung: '',
  Hoehe: 0,
  Breite: 0,
  Laenge: 0,
  Tragkraft: 0,
  ...over,
});

const bestandRow = (over: Record<string, unknown>) => ({
  Mandant: 123,
  Lagerkennung: 'LAG',
  PlatzID: 1,
  Artikelnummer: 'A1',
  Bezeichnung1: 'Artikel Eins',
  Matchcode: 'Artikel Eins',
  AuspraegungID: 0,
  Eigenmasse: 0,
  Lagermengeneinheit: 'Stk',
  Gewicht: 0,
  GewichtLME: null,
  Bestand: 10,
  Verfuegbarkeit: 1,
  ...over,
});

describe('groupLagerorte', () => {
  it('gruppiert Orte und Plätze aus dem vollständigen Platz-Inventar', () => {
    const data = groupLagerorte([
      platzRow({}),
      platzRow({ PlatzID: 2, Dimension1: 1, Dimension2: 0, Dimension3: 0, Kurzbezeichnung: 'LAG;1;0;0' }),
      platzRow({ Lagerkennung: 'KUEHL', Lagertechnik: 'LTD3HR', AnzahlDimension1: 4, AnzahlDimension2: 2, AnzahlDimension3: 5 }),
    ]);

    expect(data.mandant).toBe(123);
    expect(data.lagerorte).toHaveLength(2);
    const kuehl = data.lagerorte[0]!;
    expect(kuehl.lagerkennung).toBe('KUEHL');
    expect(kuehl.dims).toEqual({ d1: 4, d2: 2, d3: 5 });

    const lag = data.lagerorte[1]!;
    expect(lag.plaetze).toHaveLength(2);
    expect(lag.plaetze[0]).toMatchObject({ platzId: 1, dim: { d1: 0, d2: 0, d3: 0 } });
  });

  it('filtert bei mandant-Angabe auf den gewünschten Mandanten', () => {
    const data = groupLagerorte([platzRow({}), platzRow({ Mandant: 456, Lagerkennung: 'ANDERE' })], 456);
    expect(data.lagerorte).toHaveLength(1);
    expect(data.lagerorte[0]!.lagerkennung).toBe('ANDERE');
  });
});

describe('attachBestaende', () => {
  it('summiert Bestände je Artikel pro Platz, lässt unbekannte Plätze außen vor', () => {
    const data = groupLagerorte([platzRow({})]);
    attachBestaende(data, [
      bestandRow({}),
      bestandRow({ Bestand: 5 }),
      bestandRow({ Artikelnummer: 'B2', Bezeichnung1: 'B Zwei', Bestand: 3 }),
      bestandRow({ PlatzID: 999 }),
    ]);

    const platz = data.lagerorte[0]!.plaetze[0]!;
    expect(platz.bestaende).toHaveLength(2);
    expect(platz.bestaende.find((b) => b.artikelnummer === 'A1')).toMatchObject({ bestand: 15, matchcode: 'Artikel Eins' });
    expect(platz.bestaende.find((b) => b.artikelnummer === 'B2')).toMatchObject({ bestand: 3, bezeichnung1: 'B Zwei' });
  });

  it('übernimmt Gewicht je Lagermengeneinheit (GewichtLME vor Gewicht vor Eigenmasse)', () => {
    const data = groupLagerorte([platzRow({})]);
    attachBestaende(data, [
      bestandRow({ GewichtLME: 1.2 }),
      bestandRow({ Artikelnummer: 'B2', Gewicht: 2, Eigenmasse: 5 }),
      bestandRow({ Artikelnummer: 'C3', Gewicht: 0, Eigenmasse: 0 }),
    ]);

    const platz = data.lagerorte[0]!.plaetze[0]!;
    expect(platz.bestaende.find((b) => b.artikelnummer === 'A1')!.gewicht).toBe(1.2);
    expect(platz.bestaende.find((b) => b.artikelnummer === 'B2')!.gewicht).toBe(2);
    expect(platz.bestaende.find((b) => b.artikelnummer === 'C3')!.gewicht).toBe(0);
  });
});
