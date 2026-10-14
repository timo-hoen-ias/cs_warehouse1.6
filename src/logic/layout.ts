import type { Lagerort, Lagerplatz } from '../shared/types';

export const SLOT = 1.0;
export const CELL_W = 0.9;
export const CELL_H = 0.6;
export const CELL_D = 0.9;
export const LEVEL_GAP = 0.1;
export const BASE_H = 0.25;
export const TOP_H = 0.25;
export const MAX_ROW_WIDTH = 55;
export const AISLE_X = 2.5;
export const GANG_GAP = 2.0;
export const AISLE_Z = 8;
export const POST = 0.08;
export const FRAME_CLEAR = 0.03;
export const TOP_OVERHANG = 0.1;
export const MASSE_TO_M = 0.01; // DB-Maße (Hoehe/Breite/Laenge) in cm → Meter

export type RackKind = 'rack' | 'row' | 'line' | 'single';

export type RackPlacement = {
  key: string;
  ort: Lagerort;
  kind: RackKind;
  gang: number; // 0-basierter Index der Instanz beim selben Ort
  cols: number;
  levels: number;
  depth: number;
  flat: boolean;
  cellH: number;
  size: { w: number; h: number; d: number };
  origin: [number, number, number];
};

/** Der Gesamtlager-Platz (0;0;0) existiert bei jedem Lagerort. */
export function isCatchAll(platz: Lagerplatz): boolean {
  return platz.dim.d1 === 0 && platz.dim.d2 === 0 && platz.dim.d3 === 0;
}

/** Flache Lagertechniken (Bodenlager) ohne Regalrahmen. */
export function technikFlat(technik: string): boolean {
  return !technik.startsWith('LTD3');
}

/** Sichtbare Zellbox aus den echten DB-Maßen (cm→m). */
export function cellSize(platz: Lagerplatz, clamp = true): { w: number; h: number; d: number } {
  const breite = platz.masse.breite > 0 ? platz.masse.breite * MASSE_TO_M : CELL_W;
  const laenge = platz.masse.laenge > 0 ? platz.masse.laenge * MASSE_TO_M : CELL_D;
  const hoehe = platz.masse.hoehe > 0 ? platz.masse.hoehe * MASSE_TO_M : CELL_H;
  if (!clamp) return { w: breite, h: hoehe, d: laenge };
  return {
    w: Math.min(breite, SLOT - 0.05),
    h: hoehe,
    d: Math.min(laenge, SLOT - 0.05),
  };
}

export function maxCellSize(ort: Lagerort, clamp = true): { w: number; h: number; d: number } {
  const zellen = ort.plaetze.length <= 1 ? ort.plaetze : ort.plaetze.filter((p) => !isCatchAll(p));
  let w = 0;
  let h = 0;
  let d = 0;
  for (const p of zellen) {
    const s = cellSize(p, clamp);
    w = Math.max(w, s.w);
    h = Math.max(h, s.h);
    d = Math.max(d, s.d);
  }
  return { w: w || CELL_W, h: h || CELL_H, d: d || CELL_D };
}

export type RackStructure = {
  kind: RackKind;
  count: number;
  cols: number;
  levels: number;
  depth: number;
  flat: boolean;
  cellH: number;
  size: { w: number; h: number; d: number };
};

/** Leitet die Regalstruktur ausschließlich aus den DB-Feldern ab. */
export function rackStructure(ort: Lagerort): RackStructure {
  const { d1, d2, d3 } = ort.dims;
  const cell = maxCellSize(ort, false);
  if (d3 > 0) {
    // Hochregal: d1=Gänge, d2=Ebenen, d3=Fächer → pro Gang ein Regal
    const cols = 1;
    const levels = Math.max(1, d2);
    const depth = d3;
    return {
      kind: 'rack',
      count: Math.max(1, d1),
      cols,
      levels,
      depth,
      flat: false,
      cellH: cell.h,
      size: { w: cols * SLOT, h: BASE_H + levels * cell.h + (levels - 1) * LEVEL_GAP + TOP_H, d: depth * SLOT },
    };
  }
  if (d2 > 0) {
    // Strukturiertes Flächenlager: d1=Reihen, d2=Plätze → pro Reihe ein flaches Regal
    const cols = 1;
    const depth = d2;
    return {
      kind: 'row',
      count: Math.max(1, d1),
      cols,
      levels: 1,
      depth,
      flat: true,
      cellH: cell.h,
      size: { w: cols * SLOT, h: cell.h, d: depth * SLOT },
    };
  }
  if (d1 > 0) {
    // Freilager/Blocklager: nur d1=Plätze/Blöcke entlang einer Reihe
    const cols = d1;
    return {
      kind: 'line',
      count: 1,
      cols,
      levels: 1,
      depth: 1,
      flat: true,
      cellH: cell.h,
      size: { w: cols * SLOT, h: cell.h, d: SLOT },
    };
  }
  // Standardlager (0D): nur der Gesamtlager-Platz, Größe direkt aus masse
  return {
    kind: 'single',
    count: 1,
    cols: 1,
    levels: 1,
    depth: 1,
    flat: true,
    cellH: cell.h,
    size: { w: cell.w, h: cell.h, d: cell.d },
  };
}

export function rackMetrics(ort: Lagerort): RackStructure {
  return rackStructure(ort);
}

export type RackFrame = {
  post: { size: [number, number, number]; pos: [number, number, number] };
  top: { size: [number, number, number]; pos: [number, number, number] };
};

/** Rahmenbauteile mit klarem Abstand zu den Zellen und zueinander (kein Z-Fighting). */
export function rackFrame(size: { w: number; h: number; d: number }): RackFrame {
  const postH = size.h - TOP_H - FRAME_CLEAR;
  return {
    post: { size: [POST, postH, POST], pos: [0, FRAME_CLEAR + postH / 2, 0] },
    top: {
      size: [size.w + 2 * TOP_OVERHANG, TOP_H, size.d + 2 * TOP_OVERHANG],
      pos: [0, size.h - TOP_H / 2 + FRAME_CLEAR, 0],
    },
  };
}

function instanceKey(ort: Lagerort, count: number, gang: number): string {
  return count > 1 ? `${ort.lagerkennung}#${gang}` : ort.lagerkennung;
}

export function layoutRacks(orte: Lagerort[]): RackPlacement[] {
  const out: RackPlacement[] = [];
  let x = 0;
  let rowZ = 0;
  let rowMaxD = 0;
  for (const ort of orte) {
    const st = rackStructure(ort);
    const totalW = st.count * st.size.w + Math.max(0, st.count - 1) * GANG_GAP;
    if (x > 0 && x + totalW > MAX_ROW_WIDTH) {
      x = 0;
      rowZ += rowMaxD + AISLE_Z;
      rowMaxD = 0;
    }
    for (let g = 0; g < st.count; g++) {
      const originX = x + g * (st.size.w + GANG_GAP) + st.size.w / 2;
      out.push({
        key: instanceKey(ort, st.count, g),
        ort,
        kind: st.kind,
        gang: g,
        cols: st.cols,
        levels: st.levels,
        depth: st.depth,
        flat: st.flat,
        cellH: st.cellH,
        size: st.size,
        origin: [originX, 0, rowZ + st.size.d / 2],
      });
    }
    x += totalW + AISLE_X;
    rowMaxD = Math.max(rowMaxD, st.size.d);
  }
  return centerRacks(out);
}

/** Verschiebt alle Racks, sodass der Schwerpunkt der Bounding-Box bei (0,0) liegt. */
export function centerRacks(placements: RackPlacement[]): RackPlacement[] {
  const b = rackBounds(placements);
  if (!b) return placements;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  if (cx === 0 && cz === 0) return placements;
  return placements.map((p) => ({ ...p, origin: [p.origin[0] - cx, 0, p.origin[2] - cz] }));
}

export function rackBounds(placements: RackPlacement[]): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (placements.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of placements) {
    minX = Math.min(minX, p.origin[0] - p.size.w / 2);
    maxX = Math.max(maxX, p.origin[0] + p.size.w / 2);
    minZ = Math.min(minZ, p.origin[2] - p.size.d / 2);
    maxZ = Math.max(maxZ, p.origin[2] + p.size.d / 2);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Plätze, die zu einer Regal-Instanz gehören (Gang/Reihe). Catch-all im ersten Gang; 0D-Lager immer, sonst nur bei Bestand. */
export function gangPlätze(ort: Lagerort, kind: RackKind, gang: number): Lagerplatz[] {
  return ort.plaetze.filter((p) => {
    if (isCatchAll(p)) return gang === 0 && (kind === 'single' || p.bestaende.length > 0);
    if (kind === 'rack' || kind === 'row') return p.dim.d1 === gang + 1;
    return true; // line/single
  });
}

export function cellLocalPosition(
  platz: Lagerplatz,
  rack: Pick<RackPlacement, 'cols' | 'levels' | 'depth' | 'flat' | 'cellH' | 'kind' | 'gang'>,
): [number, number, number] {
  const box = cellSize(platz);
  const catchAll = isCatchAll(platz);

  let ix: number;
  let iy: number;
  let iz: number;
  if (catchAll && rack.kind === 'single') {
    ix = 0;
    iy = 0;
    iz = 0;
  } else if (catchAll) {
    // Gesamtlager-Platz: vor dem ersten Gang platzieren (z bleibt Regalmitte)
    ix = 0;
    iy = 0;
    iz = rack.depth; // hinter die letzte Reihe hinaus → vorne am Regal
  } else if (rack.kind === 'rack') {
    // Hochregal: dim.d1=Gang (Zuordnung erfolgt im Rack-Filter), d2=Ebene, d3=Fach
    ix = 0;
    iy = Math.max(1, platz.dim.d2) - 1;
    iz = Math.max(0, platz.dim.d3) - 1;
  } else if (rack.kind === 'row') {
    // Flächenlager: dim.d2 = Platz in der Reihe
    ix = 0;
    iy = 0;
    iz = Math.max(1, platz.dim.d2) - 1;
  } else if (rack.kind === 'line') {
    // Freilager/Blocklager: dim.d1 = Platz/Block entlang der Reihe
    ix = Math.max(0, platz.dim.d1) - 1;
    iy = 0;
    iz = 0;
  } else {
    ix = 0;
    iy = 0;
    iz = 0;
  }

  const lx = (ix - (rack.cols - 1) / 2) * SLOT;
  const lz = (iz - (rack.depth - 1) / 2) * SLOT;
  const ly = (rack.flat ? 0 : BASE_H) + iy * (rack.cellH + LEVEL_GAP) + box.h / 2;

  if (catchAll && rack.kind !== 'single') {
    return [lx, ly, -(rack.depth / 2) * SLOT - box.d - 0.25];
  }
  return [lx, ly, lz];
}
