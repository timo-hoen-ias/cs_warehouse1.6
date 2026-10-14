import { attachBestaende, groupLagerorte } from './query';
import type { LagerDaten } from '../shared/types';

// Deterministischer Demo-Lagergenerator (mulberry32, gleicher Seed → identische Daten).
// Port von ias.warehouse-map (src/server/perf/generate.ts), verkleinert fürs Spiel.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARTIKEL = ['Tischplatte', 'Schublade', 'Regalboden', 'Seitenwand', 'Rückwand', 'Gleitbrett', 'Scharnier', 'Griff', 'Sockel', 'Fachboden'];
const EINHEITEN = ['Stück', 'kg', 'm', 'm²', 'l'];

export type OrtMeta = { mandant: number; kennung: string; technik: string; dims: { d1: number; d2: number; d3: number }; platzIds: number[] };

type Spec = { technik: string; d1: number; d2: number; d3: number; masse: { hoehe: number; breite: number; laenge: number } };

export type LayoutProfile = 'mix' | 'hochregal' | 'block' | 'kommission' | 'rampe';

// Kleinere Spielkarte: Mischung aus Hochregal-Gängen, Flächenlager und Freilager.
// Das Profil bestimmt den Mix (jede Karte ein anderes Lager-Thema).
export function specFor(i: number, layout: LayoutProfile = 'mix'): Spec {
  const hoch = (gaenge: number, ebenen: number, faecher: number): Spec => ({ technik: 'LTD3HR', d1: gaenge, d2: ebenen, d3: faecher, masse: { hoehe: 60, breite: 110, laenge: 160 } });
  const flaeche = (reihen: number, plaetze: number): Spec => ({ technik: 'LTD2SF', d1: reihen, d2: plaetze, d3: 0, masse: { hoehe: 40, breite: 110, laenge: 110 } });
  const block = (bloecke: number): Spec => ({ technik: 'LTD1UF', d1: bloecke, d2: 0, d3: 0, masse: { hoehe: 30, breite: 100, laenge: 200 } });
  switch (layout) {
    case 'hochregal':
      return i % 3 === 2 ? hoch(2, 6, 12) : hoch(3, 5, 10);
    case 'block':
      return i % 3 === 0 ? block(14) : i % 3 === 1 ? flaeche(2, 10) : hoch(1, 3, 6);
    case 'rampe':
      return i % 2 === 0 ? block(10) : hoch(2, 4, 6);
    case 'kommission':
      return i % 2 === 0 ? hoch(2, 4, 8) : flaeche(2, 12);
    default:
      break;
  }
  switch (i % 4) {
    case 1:
      return { technik: 'LTD2SF', d1: 2, d2: 16, d3: 0, masse: { hoehe: 40, breite: 110, laenge: 110 } };
    case 2:
      return { technik: 'LTD1UF', d1: 18, d2: 0, d3: 0, masse: { hoehe: 30, breite: 100, laenge: 200 } };
    case 3:
      return { technik: 'LTD3HR', d1: 2, d2: 3, d3: 10, masse: { hoehe: 60, breite: 110, laenge: 160 } };
    default:
      return { technik: 'LTD3HR', d1: 2, d2: 5, d3: 8, masse: { hoehe: 60, breite: 110, laenge: 160 } };
  }
}

/** Erzeugt Platz-Inventar-Zeilen (Shape von PLAETZE_SQL) inkl. Catch-all je Ort. */
export function generatePlatzRows(orte: number, layout: LayoutProfile = 'mix'): { rows: Record<string, unknown>[]; orte: OrtMeta[] } {
  const rows: Record<string, unknown>[] = [];
  const metas: OrtMeta[] = [];
  let platzId = 1;
  for (let i = 0; i < orte; i++) {
    const { technik, d1, d2, d3, masse } = specFor(i, layout);
    const kennung = `DEMO-${String(i + 1).padStart(3, '0')}`;
    const dims = { d1, d2, d3 };
    const platzIds: number[] = [];
    const push = (dd1: number, dd2: number, dd3: number) => {
      platzIds.push(platzId);
      rows.push({
        Mandant: 1,
        Lagerkennung: kennung,
        Bezeichnung: `Demo-Lager ${i + 1}`,
        Lagertechnik: technik,
        AnzahlDimension1: d1,
        AnzahlDimension2: d2,
        AnzahlDimension3: d3,
        PlatzID: platzId,
        Dimension1: dd1,
        Dimension2: dd2,
        Dimension3: dd3,
        Dimensionsebene: 0,
        Kurzbezeichnung: `${kennung};${dd1};${dd2};${dd3}`,
        Platzbezeichnung: '',
        Hoehe: masse.hoehe,
        Breite: masse.breite,
        Laenge: masse.laenge,
        Tragkraft: 500,
      });
      platzId++;
    };
    push(0, 0, 0);
    if (d3 > 0) {
      for (let g = 1; g <= d1; g++) for (let e = 1; e <= d2; e++) for (let f = 1; f <= d3; f++) push(g, e, f);
    } else if (d2 > 0) {
      for (let g = 1; g <= d1; g++) for (let p = 1; p <= d2; p++) push(g, p, 0);
    } else {
      for (let b = 1; b <= d1; b++) push(b, 0, 0);
    }
    metas.push({ mandant: 1, kennung, technik, dims, platzIds });
  }
  return { rows, orte: metas };
}

/** Erzeugt Bestands-Zeilen (Shape von LAGER_SQL): ~70 % der Plätze mit 1–2 Artikeln. */
export function generateBestandRows(orte: OrtMeta[], seed = 2): Record<string, unknown>[] {
  const rnd = mulberry32(seed);
  const rows: Record<string, unknown>[] = [];
  for (const ort of orte) {
    for (const platzId of ort.platzIds) {
      if (rnd() < 0.3) continue;
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        rows.push({
          Mandant: ort.mandant,
          Lagerkennung: ort.kennung,
          PlatzID: platzId,
          Artikelnummer: String(100000 + Math.floor(rnd() * 900000)),
          Bezeichnung1: ARTIKEL[Math.floor(rnd() * ARTIKEL.length)],
          Matchcode: '',
          AuspraegungID: 0,
          Eigenmasse: 1 + Math.floor(rnd() * 50),
          Lagermengeneinheit: EINHEITEN[Math.floor(rnd() * EINHEITEN.length)],
          Gewicht: 0,
          GewichtLME: 0,
          Bestand: 1 + Math.floor(rnd() * 999),
          Verfuegbarkeit: 0,
        });
      }
    }
  }
  return rows;
}

/** LagerDaten über denselben Pfad wie die DB-Queries (groupLagerorte + attachBestaende). */
export function generateLagerDaten(orte = 16, seed = 1, layout: LayoutProfile = 'mix'): LagerDaten {
  const { rows: platzRows, orte: metas } = generatePlatzRows(orte, layout);
  const daten = groupLagerorte(platzRows, 1);
  attachBestaende(daten, generateBestandRows(metas, seed + 1), 1);
  return daten;
}
