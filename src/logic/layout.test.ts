import { describe, expect, it } from 'vitest';
import type { Lagerort, Lagerplatz } from '../shared/types';
import {
  FRAME_CLEAR,
  SLOT,
  TOP_H,
  TOP_OVERHANG,
  cellLocalPosition,
  cellSize,
  gangPlätze,
  layoutRacks,
  rackBounds,
  rackFrame,
  rackMetrics,
  technikFlat,
} from './layout';

const ort = (dims: { d1: number; d2: number; d3: number }, plaetze: Lagerplatz[] = [], lagertechnik = 'LTD3HR'): Lagerort => ({
  lagerkennung: 'X',
  bezeichnung: '',
  lagertechnik,
  dims,
  plaetze,
});

const platz = (platzId: number, dim: { d1: number; d2: number; d3: number }, masse?: Partial<Lagerplatz['masse']>): Lagerplatz => ({
  platzId,
  dim,
  ebene: 0,
  kurz: '',
  platzbezeichnung: '',
  masse: { hoehe: 0, breite: 0, laenge: 0, ...masse },
  maxGewicht: 0,
  bestaende: [],
});

describe('technikFlat', () => {
  it('0D/1D/2D-Techniken sind flach, 3D-Hochregal nicht', () => {
    expect(technikFlat('LTD0ST')).toBe(true);
    expect(technikFlat('LTD1UF')).toBe(true);
    expect(technikFlat('LTD1BL')).toBe(true);
    expect(technikFlat('LTD2SF')).toBe(true);
    expect(technikFlat('LTD3HR')).toBe(false);
  });
});

describe('cellSize', () => {
  it('nutzt echte Maße in Metern und deckelt auf den 1-m-Slot', () => {
    const s = cellSize(platz(1, { d1: 1, d2: 1, d3: 1 }, { breite: 90, laenge: 80, hoehe: 60 }));
    expect(s.w).toBeCloseTo(0.9, 5);
    expect(s.d).toBeCloseTo(0.8, 5);
    expect(s.h).toBeCloseTo(0.6, 5);
    expect(s.w).toBeLessThanOrEqual(SLOT);
  });

  it('deckelt überbreite Zellen auf den 1-m-Slot', () => {
    const s = cellSize(platz(1, { d1: 1, d2: 1, d3: 1 }, { breite: 150, laenge: 200 }));
    expect(s.w).toBeCloseTo(SLOT - 0.05, 5);
    expect(s.d).toBeCloseTo(SLOT - 0.05, 5);
  });

  it('fällt ohne Maße auf Standardgröße zurück', () => {
    const s = cellSize(platz(1, { d1: 1, d2: 1, d3: 1 }));
    expect(s.h).toBeGreaterThan(0);
    expect(s.w).toBeGreaterThan(0);
  });
});

describe('rackMetrics', () => {
  it('3D-Hochregal: Gänge aus d1, Ebenen aus d2, Fächer aus d3', () => {
    const m = rackMetrics(ort({ d1: 4, d2: 2, d3: 5 }));
    expect(m.kind).toBe('rack');
    expect(m.count).toBe(4);
    expect(m.cols).toBe(1);
    expect(m.levels).toBe(2);
    expect(m.depth).toBe(5);
    expect(m.flat).toBe(false);
    expect(m.size.w).toBeCloseTo(1 * SLOT, 5);
    expect(m.size.d).toBeCloseTo(5 * SLOT, 5);
    expect(m.size.h).toBeGreaterThan(2 * 0.6);
  });

  it('2D-Flächenlager: Reihen aus d1, Plätze aus d2, flach', () => {
    const m = rackMetrics(ort({ d1: 5, d2: 10, d3: 0 }, [], 'LTD2SF'));
    expect(m.kind).toBe('row');
    expect(m.count).toBe(5);
    expect(m.levels).toBe(1);
    expect(m.depth).toBe(10);
    expect(m.flat).toBe(true);
    expect(m.size.h).toBeLessThanOrEqual(m.cellH);
  });

  it('1D/0D: einzelne Reihe bzw. Einzelblock', () => {
    expect(rackMetrics(ort({ d1: 100, d2: 0, d3: 0 }))).toMatchObject({ kind: 'line', cols: 100, levels: 1, depth: 1 });
    expect(rackMetrics(ort({ d1: 0, d2: 0, d3: 0 }))).toMatchObject({ kind: 'single', cols: 1, levels: 1, depth: 1 });
  });
});

describe('rackFrame', () => {
  it('Top-Box liegt mit Abstand über den obersten Zellen und den Pfosten (kein Z-Fighting)', () => {
    for (const dims of [{ d1: 4, d2: 2, d3: 5 }, { d1: 2, d2: 1, d3: 0 }, { d1: 1, d2: 1, d3: 1 }]) {
      const m = rackMetrics(ort(dims));
      const f = rackFrame(m.size);
      const cellTop = m.size.h - TOP_H;
      const postTop = f.post.pos[1] + f.post.size[1] / 2;
      const topBottom = f.top.pos[1] - f.top.size[1] / 2;
      expect(topBottom - cellTop).toBeCloseTo(FRAME_CLEAR, 5);
      expect(topBottom - postTop).toBeCloseTo(FRAME_CLEAR, 5);
    }
  });

  it('Top-Box überragt die Regalaußenkanten, Pfosten enden unter der Top-Box', () => {
    const m = rackMetrics(ort({ d1: 3, d2: 2, d3: 2 }));
    const f = rackFrame(m.size);
    expect(f.top.size[0]).toBe(m.size.w + 2 * TOP_OVERHANG);
    expect(f.top.size[2]).toBe(m.size.d + 2 * TOP_OVERHANG);
    expect(f.post.size[1]).toBe(m.size.h - TOP_H - FRAME_CLEAR);
    expect(f.post.pos[1] - f.post.size[1] / 2).toBeCloseTo(FRAME_CLEAR, 5);
  });
});

describe('cellLocalPosition', () => {
  const rack = { ...rackMetrics(ort({ d1: 4, d2: 2, d3: 5 })), origin: [0,0,0] as [number, number, number], gang: 0 };

  it('platziert 3D-Zellen zentriert im 1-m-Raster nach Dimension', () => {
    const [x, y, z] = cellLocalPosition(platz(2, { d1: 1, d2: 1, d3: 1 }), rack);
    expect(x).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(-(4 / 2) * SLOT, 5);
    expect(y).toBeCloseTo(0.25 + 0.6 / 2, 5);
  });

  it('setzt den 0/0/0-Auffangplatz vor das Regal', () => {
    const [x, y, z] = cellLocalPosition(platz(1, { d1: 0, d2: 0, d3: 0 }), rack);
    expect(z).toBeLessThan(0);
    expect(y).toBeGreaterThan(0);
  });

  it('flache Lagertechnik sitzt direkt am Boden', () => {
    const flatRack = { ...rackMetrics(ort({ d1: 4, d2: 1, d3: 0 }, [], 'LTD2SF')), origin: [0,0,0] as [number, number, number], gang: 0 };
    const [, y] = cellLocalPosition(platz(2, { d1: 1, d2: 1, d3: 0 }), flatRack);
    expect(y).toBeCloseTo(0.6 / 2, 5);
  });
});

describe('gangPlätze', () => {
  it('ordnet Hochregal-Plätze dem Gang zu, Catch-all nur im ersten Gang mit Bestand', () => {
    const plätze = [
      platz(1, { d1: 0, d2: 0, d3: 0 }, {}),
      platz(2, { d1: 1, d2: 1, d3: 1 }, {}),
      platz(3, { d1: 2, d2: 1, d3: 1 }, {}),
    ];
    plätze[0]!.bestaende = [{ artikelnummer: 'A', bezeichnung1: '', matchcode: '', bestand: 5, verfuegbarkeit: 5, gewicht: 0 }];
    const o = ort({ d1: 2, d2: 1, d3: 1 }, plätze);
    expect(gangPlätze(o, 'rack', 0).map((p) => p.platzId)).toEqual([1, 2]);
    expect(gangPlätze(o, 'rack', 1).map((p) => p.platzId)).toEqual([3]);
  });

  it('0D-Lager zeigt den Catch-all auch ohne Bestände (Lager selbst sichtbar)', () => {
    const o = ort({ d1: 0, d2: 0, d3: 0 }, [platz(1, { d1: 0, d2: 0, d3: 0 }, {})], 'LTD0ST');
    expect(gangPlätze(o, 'single', 0)).toHaveLength(1);
  });
});

describe('rackBounds', () => {
  it('liefert null für leere Platzierungen', () => {
    expect(rackBounds([])).toBeNull();
  });

  it('berechnet Bounding-Box über alle Rack-Fußabdrücke', () => {
    const placed = layoutRacks([ort({ d1: 2, d2: 1, d3: 1 }, []), ort({ d1: 4, d2: 2, d3: 2 }, [])]);
    const b = rackBounds(placed)!;
    expect(b.minX).toBeLessThan(b.maxX);
    expect(b.minZ).toBeLessThanOrEqual(b.maxZ);
    expect(b.maxX).toBeGreaterThan(b.minX);
  });
});

describe('layoutRacks', () => {
  it('erzeugt pro Gang ein Regal und ordnet Gänge einer Zeile zu', () => {
    const hr = ort({ d1: 40, d2: 1, d3: 0 });
    const small = ort({ d1: 2, d2: 2, d3: 2 });
    const placed = layoutRacks([hr, small, small, small, small]);
    expect(placed.length).toBe(48); // 40 + 2 + 2 + 2 + 2
    expect(placed[0]!.key).toBe('X#0');
    expect(placed[39]!.key).toBe('X#39');
    expect(placed[1]!.origin[2]).toBe(placed[2]!.origin[2]);
    expect(placed[1]!.origin[2]).toBe(placed[0]!.origin[2]);
  });

  it('nutzt die Lagerkennung als Key bei einem einzelnen Regal', () => {
    const placed = layoutRacks([ort({ d1: 2, d2: 0, d3: 0 }, [], 'LTD1UF')]);
    expect(placed[0]!.key).toBe('X');
  });

  it('zentriert das Layout um den Ursprung', () => {
    const placed = layoutRacks([ort({ d1: 2, d2: 2, d3: 2 }, []), ort({ d1: 3, d2: 2, d3: 4 }, [])]);
    const b = rackBounds(placed)!;
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 5);
    expect((b.minZ + b.maxZ) / 2).toBeCloseTo(0, 5);
  });
});
