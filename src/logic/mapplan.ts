import type { RoomKind } from './acoustics';
import type { MapBuilder, MaterialId } from './mapkit';

/**
 * Grundriss-Raster für handgebaute Karten (pure): Spielbereiche werden als Rechtecke
 * mit einem Zeichen „gemalt“ (2-m-Zellen), alles Ungemalte wird Gebäudemasse. Daraus
 * entstehen Bodenplatten, Dächer, Gebäudeblöcke, Fensterwände, automatische Stürze über
 * Öffnungen (Innenraum → höherer Raum/außen) und Akustik-Zonen. Rampen, Treppen, Türen
 * und Requisiten setzt die Karte danach explizit mit dem MapBuilder.
 */
export type CellKind = {
  /** Oberkante des Bodens (fehlt = Gebäude). */
  floor?: number;
  mat?: MaterialId;
  /** Material der Bodenoberseite. */
  top?: MaterialId;
  tint?: number;
  /** Innenraum: Unterkante des Dachs. */
  roof?: number;
  /** Oberkante des Dachs (Standard roof + 0.5). */
  roofTop?: number;
  roofMat?: MaterialId;
  /** Gebäude: Höhe und Fassadenmaterial. */
  building?: { h: number; mat: MaterialId; tint?: number };
  /** Fensterwand (Gebäudezelle mit Öffnung zwischen sill und lintel). */
  window?: { sill: number; lintel: number };
  /** Bodenplatte als Tunnel markieren (Radar-Overlay). */
  tunnel?: boolean;
  /** Akustik-Raumtyp. */
  room?: RoomKind;
  /** Keine Bodenplatte (Rampe/Treppe kommt explizit) — Boden auf Höhe floor dennoch als Unterbau. */
  ramp?: boolean;
};

export type Rect = { x0: number; z0: number; x1: number; z1: number };

export class CellPlan {
  readonly cols: number;
  readonly rows: number;
  private readonly cells: string[];

  constructor(readonly minX: number, readonly minZ: number, maxX: number, maxZ: number, readonly cell = 2, readonly fill = '#') {
    this.cols = Math.round((maxX - minX) / cell);
    this.rows = Math.round((maxZ - minZ) / cell);
    this.cells = new Array(this.cols * this.rows).fill(fill);
  }

  /** Rechteck (Meter, auf Zellen gerundet) mit Zeichen füllen. */
  rect(ch: string, x0: number, z0: number, x1: number, z1: number): this {
    const c0 = Math.round((Math.min(x0, x1) - this.minX) / this.cell);
    const c1 = Math.round((Math.max(x0, x1) - this.minX) / this.cell);
    const r0 = Math.round((Math.min(z0, z1) - this.minZ) / this.cell);
    const r1 = Math.round((Math.max(z0, z1) - this.minZ) / this.cell);
    for (let r = Math.max(0, r0); r < Math.min(this.rows, r1); r++) {
      for (let c = Math.max(0, c0); c < Math.min(this.cols, c1); c++) this.cells[r * this.cols + c] = ch;
    }
    return this;
  }

  get(c: number, r: number): string {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return this.fill;
    return this.cells[r * this.cols + c]!;
  }

  /** Zeichen an einer Weltposition. */
  at(x: number, z: number): string {
    return this.get(Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell));
  }

  /** Gierige Zerlegung aller Zellen eines Zeichens in möglichst große Rechtecke (Meter). */
  merged(ch: string): Rect[] {
    const used = new Uint8Array(this.cols * this.rows);
    const out: Rect[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (used[i] || this.cells[i] !== ch) continue;
        let w = 1;
        while (c + w < this.cols && !used[i + w] && this.cells[i + w] === ch) w++;
        let h = 1;
        outer: while (r + h < this.rows) {
          for (let k = 0; k < w; k++) {
            const j = (r + h) * this.cols + c + k;
            if (used[j] || this.cells[j] !== ch) break outer;
          }
          h++;
        }
        for (let dr = 0; dr < h; dr++) for (let k = 0; k < w; k++) used[(r + dr) * this.cols + c + k] = 1;
        out.push({ x0: this.minX + c * this.cell, z0: this.minZ + r * this.cell, x1: this.minX + (c + w) * this.cell, z1: this.minZ + (r + h) * this.cell });
      }
    }
    return out;
  }

  /** Grundriss als Text (eine Zeile je Zellreihe, Norden oben). */
  ascii(): string[] {
    const out: string[] = [];
    for (let r = 0; r < this.rows; r++) out.push(this.cells.slice(r * this.cols, (r + 1) * this.cols).join(''));
    return out;
  }

  /**
   * Erzeugt alle Grundriss-Brushes. legend: Zeichen → Zellart; unbekannte Zeichen
   * gelten als Gebäude (`fill`-Eintrag der Legende).
   */
  build(b: MapBuilder, legend: Record<string, CellKind>, opts: { floorBottom?: number; lintelTop?: number } = {}): void {
    const bottom = opts.floorBottom ?? -4;
    const lintelTop = opts.lintelTop ?? 9;
    const kindOf = (ch: string): CellKind => legend[ch] ?? legend[this.fill] ?? { building: { h: 9, mat: 'brick' } };
    const chars = new Set(this.cells);
    for (const ch of chars) {
      const k = kindOf(ch);
      for (const r of this.merged(ch)) {
        if (k.building) {
          const bmat = k.building.mat;
          if (k.window) {
            b.box([r.x0, bottom, r.z0], [r.x1, k.window.sill, r.z1], bmat, { tag: 'wall', tint: k.building.tint, noNav: true });
            b.box([r.x0, k.window.lintel, r.z0], [r.x1, k.building.h, r.z1], bmat, { tag: 'building', tint: k.building.tint, noNav: true, top: 'roof' });
          } else {
            b.box([r.x0, bottom, r.z0], [r.x1, k.building.h, r.z1], bmat, { tag: 'building', top: 'roof', tint: k.building.tint, noNav: true });
          }
          continue;
        }
        if (k.floor === undefined) continue;
        b.box([r.x0, bottom, r.z0], [r.x1, k.floor, r.z1], k.mat ?? 'concrete', { top: k.top, tint: k.tint, tag: k.tunnel ? 'tunnel' : 'floor' });
        if (k.roof !== undefined) {
          b.box([r.x0, k.roof, r.z0], [r.x1, k.roofTop ?? k.roof + 0.5, r.z1], k.roofMat ?? 'roof', { tag: 'roof', noNav: true });
        }
        if (k.room) b.room(k.room, [r.x0, k.floor - 0.5, r.z0], [r.x1, k.roof ?? k.floor + 40, r.z1]);
      }
    }
    // Stürze: Innenraum-Zelle grenzt an Außenbereich oder höheren Innenraum → Wand vom Dach aufwärts
    type Seg = { axis: 'x' | 'z'; line: number; a: number; bnd: number; y0: number; y1: number; side: number };
    const segs: Seg[] = [];
    const T = 0.3;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const k = kindOf(this.get(c, r));
        if (k.building || k.roof === undefined) continue;
        const nbs: [number, number, 'x' | 'z', number][] = [[c + 1, r, 'z', 1], [c - 1, r, 'z', -1], [c, r + 1, 'x', 1], [c, r - 1, 'x', -1]];
        for (const [nc, nr, axis, side] of nbs) {
          const n = kindOf(this.get(nc, nr));
          if (n.building) continue;
          const top = n.roof === undefined ? Math.max(lintelTop, k.roofTop ?? k.roof + 0.5) : n.roof;
          if (top <= k.roof + 1e-6) continue;
          // axis 'z': Wand entlang Z an der Ost/West-Kante; 'x': entlang X an der Nord/Süd-Kante
          if (axis === 'z') {
            const line = this.minX + (side > 0 ? c + 1 : c) * this.cell;
            segs.push({ axis, line, a: this.minZ + r * this.cell, bnd: this.minZ + (r + 1) * this.cell, y0: k.roof, y1: top, side });
          } else {
            const line = this.minZ + (side > 0 ? r + 1 : r) * this.cell;
            segs.push({ axis, line, a: this.minX + c * this.cell, bnd: this.minX + (c + 1) * this.cell, y0: k.roof, y1: top, side });
          }
        }
      }
    }
    segs.sort((p, q) => (p.axis < q.axis ? -1 : p.axis > q.axis ? 1 : p.line - q.line || p.side - q.side || p.y0 - q.y0 || p.y1 - q.y1 || p.a - q.a));
    for (let i = 0; i < segs.length; ) {
      const s = segs[i]!;
      let end = s.bnd;
      let j = i + 1;
      while (j < segs.length) {
        const t = segs[j]!;
        if (t.axis !== s.axis || t.line !== s.line || t.side !== s.side || t.y0 !== s.y0 || t.y1 !== s.y1 || Math.abs(t.a - end) > 1e-6) break;
        end = t.bnd;
        j++;
      }
      // Wand auf der Innenseite der Kante (ragt nicht in den Nachbarbereich)
      const inner = s.side > 0 ? s.line - T : s.line;
      const outer = s.side > 0 ? s.line : s.line + T;
      if (s.axis === 'z') b.box([inner, s.y0, s.a], [outer, s.y1, end], 'corrugated', { tag: 'wall', noNav: true });
      else b.box([s.a, s.y0, inner], [end, s.y1, outer], 'corrugated', { tag: 'wall', noNav: true });
      i = j;
    }
  }
}
