import type { Brush, MapData } from './mapkit';
import type { NavGraph } from './nav';

/**
 * Draufsicht einer Karte als RGBA-Raster (pure): Höhen farbcodiert, Wände dunkel,
 * Rampen mit Verlauf + Pfeil, Tunnel als Overlay, Spots, Spawns, Callout-Namen.
 * Genutzt vom Übersichts-Werkzeug (PNG) und vom Radar im HUD.
 */
export type Raster = { w: number; h: number; data: Uint8ClampedArray; pxPerM: number; minX: number; minZ: number };

export type OverviewOpts = {
  pxPerM?: number;
  /** Callout-Namen, Spawns, Kaufzonen und Legende zeichnen (Werkzeug). */
  labels?: boolean;
  /** Navigationsknoten als Punkte (Debug). */
  nav?: NavGraph;
  /** Radar-Stil: transparenter Hintergrund, dunkle Wände, kühle Bodenfarben, Bombenspots getönt (Beschriftung zeichnet das HUD). */
  radar?: boolean;
  /**
   * Radar: Fußhöhe des Spielers (Höhenband). Nur Brushes dieser Ebene werden voll gezeichnet,
   * Flächen anderer Ebenen nur als blasse Silhouette (Karten mit übereinanderliegenden Ebenen).
   */
  bandY?: number;
};

type RGB = [number, number, number];

const RADAR_WALL: RGB = [10, 16, 20];
const RADAR_COVER: RGB = [38, 58, 64];
const RADAR_DIM: RGB = [96, 128, 138];

/** Höhenfarbe: tief = violett/blau, Boden = grün-grau, oben = gelb → rot. */
export function heightColor(y: number): RGB {
  const stops: [number, RGB][] = [[-5, [70, 60, 140]], [-1.5, [70, 110, 150]], [0, [92, 122, 96]], [1.5, [150, 160, 90]], [3, [200, 170, 70]], [5, [215, 120, 60]], [8, [200, 70, 70]]];
  if (y <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [y1, c1] = stops[i]!;
    const [y0, c0] = stops[i - 1]!;
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1]![1];
}

/** Radar-Bodenfarbe nach Höhe: Keller bläulich, Erdgeschoss grau-türkis, oben wärmer/heller. */
export function radarFloorColor(y: number): RGB {
  const stops: [number, RGB][] = [[-5, [54, 82, 116]], [-1.5, [62, 102, 124]], [0, [80, 122, 124]], [2, [106, 140, 128]], [4, [138, 150, 126]], [8, [168, 160, 130]]];
  if (y <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [y1, c1] = stops[i]!;
    const [y0, c0] = stops[i - 1]!;
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1]![1];
}

/** Brushes, die in der Draufsicht erscheinen (kein Dach, keine Clips, keine reine Deko). */
export function overviewBrushes(map: MapData): Brush[] {
  return map.brushes.filter((b) => b.tag !== 'roof' && b.tag !== 'clip' && (b.collide ?? 'all') !== 'none');
}

function isWall(b: Brush): boolean {
  const w = b.max[0] - b.min[0];
  const d = b.max[2] - b.min[2];
  return b.max[1] - b.min[1] >= 2.2 && Math.min(w, d) <= 1.2 && !b.ramp;
}

/** Undurchdringliche Masse in der Draufsicht: Gebäudeblock oder dünne hohe Wand/Säule. */
function isMass(b: Brush): boolean {
  return b.tag === 'building' || isWall(b);
}

/** Ebenen-Toleranzen fürs Radar-Höhenband (m, relativ zur Fußhöhe des Spielers). */
const BAND = { below: 1.0, above: 1.2, bodyLo: 0.2, bodyHi: 1.8, obstacleBase: 0.8 };

/**
 * Gehört ein Brush zur Ebene des Spielers (Fußhöhe `y`)? Wände/Massen: wenn sie in Körperhöhe
 * stehen. Rampen: wenn ihre Spanne die Fußhöhe berührt. Sonst: Standfläche (Oberkante knapp
 * um die Fußhöhe) oder Hindernis, das auf dieser Ebene steht und höher aufragt (Container).
 * Flächen darüber/darunter (Obergeschoss, Keller) gehören nicht dazu.
 */
export function brushInBand(b: Brush, y: number): boolean {
  const lo = b.min[1];
  const hi = b.max[1];
  if (isMass(b)) return lo < y + BAND.bodyHi && hi > y + BAND.bodyLo;
  if (b.ramp) return lo <= y + BAND.above && hi >= y - BAND.below;
  if (hi >= y - BAND.below && hi <= y + BAND.above) return true;
  return lo <= y + BAND.obstacleBase && hi > y + BAND.above;
}

/** Tags von Brushes, deren Oberkante eine begehbare Ebene bildet (für die Stapel-Erkennung). */
const WALK_TAGS = new Set(['floor', 'platform', 'stairs', 'tunnel']);
/** Mindestabstand zweier Ebenen im selben Grundriss-Feld und Mindestfläche (Zellen à 2 m), ab der Karten Höhenbänder brauchen. */
const STACK = { cell: 2, gap: 3, cells: 150 };

/** Anzahl 2-m-Zellen, in denen begehbare Flächen mindestens 3 m übereinanderliegen (Keller unter Erdgeschoss, Dach über Halle). */
export function stackedCells(map: MapData): number {
  const tops = new Map<number, number[]>();
  const nx = Math.ceil((map.bounds.max[0] - map.bounds.min[0]) / STACK.cell) + 1;
  for (const b of overviewBrushes(map)) {
    if (isMass(b)) continue;
    if (b.tag !== undefined && !WALK_TAGS.has(b.tag) && !b.ramp) continue;
    const top = b.max[1];
    const x0 = Math.floor((b.min[0] - map.bounds.min[0]) / STACK.cell);
    const x1 = Math.max(x0, Math.ceil((b.max[0] - map.bounds.min[0]) / STACK.cell) - 1);
    const z0 = Math.floor((b.min[2] - map.bounds.min[2]) / STACK.cell);
    const z1 = Math.max(z0, Math.ceil((b.max[2] - map.bounds.min[2]) / STACK.cell) - 1);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const k = z * nx + x;
        const list = tops.get(k);
        if (list) list.push(top);
        else tops.set(k, [top]);
      }
    }
  }
  let stacked = 0;
  for (const list of tops.values()) {
    if (Math.max(...list) - Math.min(...list) >= STACK.gap) stacked++;
  }
  return stacked;
}

/**
 * Hat die Karte übereinanderliegende begehbare Ebenen auf nennenswerter Fläche? Nur dann lohnt das
 * Höhenband im Radar — bei Karten mit nur kleinen Höhenunterschieden (Rampen, Plattformen) zeigt
 * ein einziges Bild mit Höhenfarben mehr.
 */
export function radarNeedsBands(map: MapData): boolean {
  return stackedCells(map) >= STACK.cells;
}

/** Höhenband-Schlüssel (Radar-Raster werden je Band zwischengespeichert): Fußhöhe auf 1.5 m gerundet. */
export const BAND_STEP = 1.5;
export function radarBand(y: number): number {
  const q = Math.round(y / BAND_STEP) * BAND_STEP;
  return Object.is(q, -0) ? 0 : q;
}

export function renderOverview(map: MapData, opts: OverviewOpts = {}): Raster {
  const ppm = opts.pxPerM ?? 4;
  const minX = map.bounds.min[0];
  const minZ = map.bounds.min[2];
  const w = Math.ceil((map.bounds.max[0] - minX) * ppm);
  const h = Math.ceil((map.bounds.max[2] - minZ) * ppm);
  const data = new Uint8ClampedArray(w * h * 4);
  const bg: [number, number, number, number] = opts.radar ? [0, 0, 0, 0] : [24, 27, 32, 255];
  for (let i = 0; i < w * h; i++) data.set(bg, i * 4);

  const px = (x: number): number => Math.round((x - minX) * ppm);
  const pz = (z: number): number => Math.round((z - minZ) * ppm);
  const put = (x: number, y: number, c: RGB, a = 1): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    // „Over“-Komposition mit gerader (nicht vormultiplizierter) Alpha — auch auf transparentem Grund (Radar)
    const da = data[i + 3]! / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    const k = da * (1 - a);
    data[i] = (c[0] * a + data[i]! * k) / oa;
    data[i + 1] = (c[1] * a + data[i + 1]! * k) / oa;
    data[i + 2] = (c[2] * a + data[i + 2]! * k) / oa;
    data[i + 3] = oa * 255;
  };
  const rect = (x0: number, z0: number, x1: number, z1: number, color: (fx: number, fz: number) => RGB, a = 1, border?: RGB): void => {
    const X0 = px(x0), X1 = Math.max(px(x1), X0 + 1), Z0 = pz(z0), Z1 = Math.max(pz(z1), Z0 + 1);
    for (let y = Z0; y < Z1; y++) {
      for (let x = X0; x < X1; x++) {
        const edge = border && (x === X0 || x === X1 - 1 || y === Z0 || y === Z1 - 1);
        put(x, y, edge ? border! : color((x - X0 + 0.5) / (X1 - X0), (y - Z0 + 0.5) / (Z1 - Z0)), a);
      }
    }
  };

  const band = opts.radar ? opts.bandY : undefined;
  // Tunnel liegen unter der Oberfläche: ohne Höhenband nur als Overlay, mit Band als eigene Ebene (Boden = Oberkante)
  const brushes = overviewBrushes(map).filter((b) => b.tag !== 'tunnel' || band !== undefined).sort((p, q) => p.max[1] - q.max[1]);
  if (band !== undefined) {
    // andere Ebenen: nur blasse Silhouette der begehbaren Flächen (keine Wände/Massen)
    for (const b of brushes) {
      if (isMass(b) || brushInBand(b, band)) continue;
      rect(b.min[0], b.min[2], b.max[0], b.max[2], () => RADAR_DIM, 0.2);
    }
  }
  for (const b of brushes) {
    if (band !== undefined && !brushInBand(b, band)) continue;
    if (opts.radar) {
      drawRadarBrush(b, band);
      continue;
    }
    if (b.tag === 'building' || isWall(b)) {
      rect(b.min[0], b.min[2], b.max[0], b.max[2], () => [12, 13, 15]);
      continue;
    }
    if (b.ramp) {
      const lo = b.min[1], hi = b.max[1];
      rect(b.min[0], b.min[2], b.max[0], b.max[2], (fx, fz) => {
        const t = b.ramp === 'px' ? fx : b.ramp === 'nx' ? 1 - fx : b.ramp === 'pz' ? fz : 1 - fz;
        return heightColor(lo + (hi - lo) * t);
      }, 1, [30, 30, 30]);
      arrow(b);
      continue;
    }
    const c = heightColor(b.max[1]);
    rect(b.min[0], b.min[2], b.max[0], b.max[2], () => c, 1, [Math.max(0, c[0] - 45), Math.max(0, c[1] - 45), Math.max(0, c[2] - 45)]);
  }
  // Tunnel als halbtransparentes Overlay (ohne Höhenband)
  if (band === undefined) {
    for (const b of overviewBrushes(map).filter((q) => q.tag === 'tunnel')) rect(b.min[0], b.min[2], b.max[0], b.max[2], () => [120, 90, 170], opts.radar ? 0.3 : 0.45);
  }

  /** Radar-Stil: Wände/Massen/Hindernisse fast schwarz, Deckung dunkel, Boden nach Höhe, Rampen mit Verlauf. */
  function drawRadarBrush(b: Brush, bandY: number | undefined): void {
    const obstacle = bandY !== undefined && !b.ramp && b.max[1] > bandY + BAND.above;
    if (isMass(b) || obstacle) {
      rect(b.min[0], b.min[2], b.max[0], b.max[2], () => RADAR_WALL);
    } else if (b.ramp) {
      const lo = b.min[1], hi = b.max[1];
      rect(b.min[0], b.min[2], b.max[0], b.max[2], (fx, fz) => {
        const t = b.ramp === 'px' ? fx : b.ramp === 'nx' ? 1 - fx : b.ramp === 'pz' ? fz : 1 - fz;
        return radarFloorColor(lo + (hi - lo) * t);
      });
    } else if ((b.tag === 'prop' || b.tag === 'door') && b.max[1] - b.min[1] >= 0.5) {
      rect(b.min[0], b.min[2], b.max[0], b.max[2], () => RADAR_COVER);
    } else {
      const c = radarFloorColor(b.max[1]);
      rect(b.min[0], b.min[2], b.max[0], b.max[2], () => c);
    }
  }

  function arrow(b: Brush): void {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const len = Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2], 4) * 0.4 + 0.6;
    const [dx, dz] = b.ramp === 'px' ? [1, 0] : b.ramp === 'nx' ? [-1, 0] : b.ramp === 'pz' ? [0, 1] : [0, -1];
    for (let t = -len; t <= len; t += 0.5 / ppm) put(px(cx + dx * t), pz(cz + dz * t), [255, 255, 255]);
    for (let t = 0; t <= len * 0.6; t += 0.5 / ppm) {
      put(px(cx + dx * (len - t) - dz * t * 0.6), pz(cz + dz * (len - t) + dx * t * 0.6), [255, 255, 255]);
      put(px(cx + dx * (len - t) + dz * t * 0.6), pz(cz + dz * (len - t) - dx * t * 0.6), [255, 255, 255]);
    }
  }

  // Bombenspots
  for (const s of map.sites) {
    const red: RGB = s.id === 'A' ? [235, 70, 60] : [240, 150, 40];
    // Radar: nur getönt, wenn der Spot zur Ebene des Spielers gehört (Buchstabe + Rahmen zeichnet das HUD)
    if (opts.radar && band !== undefined && (s.plant[1] < band - 2.5 || s.plant[1] > band + 2.5)) continue;
    rect(s.min[0], s.min[2], s.max[0], s.max[2], () => red, opts.radar ? 0.2 : 0.22, red);
    if (!opts.radar) text(s.id, (s.min[0] + s.max[0]) / 2, (s.min[2] + s.max[2]) / 2, red, Math.max(2, Math.round(ppm * 1.4)));
  }
  if (opts.labels) {
    for (const z of map.buyZones) {
      const c: RGB = z.team === 'T' ? [230, 160, 80] : [110, 160, 240];
      rect(z.min[0], z.min[2], z.max[0], z.max[2], () => c, 0.08, c);
    }
    for (const sp of map.spawns) {
      const c: RGB = sp.team === 'T' ? [255, 170, 60] : [90, 160, 255];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) put(px(sp.pos[0]) + dx, pz(sp.pos[2]) + dy, c);
    }
    if (opts.nav) {
      const g = opts.nav;
      for (let i = 0; i < g.count; i++) put(px(g.x[i]!), pz(g.z[i]!), [255, 255, 255], 0.35);
    }
    // Beschriftungen: kleine Bereiche zuerst, bei Überlappung nach unten ausweichen
    const placed: [number, number, number, number][] = [];
    const sc = Math.max(1, Math.round(ppm / 3));
    const sorted = [...map.areas].sort((p, q) => (p.max[0] - p.min[0]) * (p.max[2] - p.min[2]) - (q.max[0] - q.min[0]) * (q.max[2] - q.min[2]));
    for (const a of sorted) {
      const label = a.name.toUpperCase();
      const cx = (a.min[0] + a.max[0]) / 2;
      let cz = (a.min[2] + a.max[2]) / 2;
      const wPx = label.length * 6 * sc;
      const hPx = 9 * sc;
      for (let k = 0; k < 6; k++) {
        const x0 = px(cx) - wPx / 2, y0 = pz(cz) - hPx / 2;
        if (!placed.some(([a0, b0, a1, b1]) => x0 < a1 && x0 + wPx > a0 && y0 < b1 && y0 + hPx > b0)) break;
        cz += hPx / ppm;
      }
      placed.push([px(cx) - wPx / 2, pz(cz) - hPx / 2, px(cx) + wPx / 2, pz(cz) + hPx / 2]);
      text(label, cx, cz, [255, 255, 255], sc);
    }
  }

  function text(s: string, cx: number, cz: number, c: RGB, scale: number): void {
    const width = s.length * 6 * scale;
    let x0 = Math.max(1, Math.min(w - width - 1, px(cx) - Math.floor(width / 2)));
    const y0 = pz(cz) - Math.floor((8 * scale) / 2);
    for (const ch of s) {
      const glyph = FONT[ch] ?? FONT['?']!;
      for (let r = 0; r < 7; r++) {
        for (let col = 0; col < 5; col++) {
          if (!((glyph[r]! >> (4 - col)) & 1)) continue;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
            // dunkler Rand für Lesbarkeit
            put(x0 + col * scale + sx + 1, y0 + r * scale + sy + 1, [0, 0, 0], 0.7);
          }
        }
      }
      for (let r = 0; r < 7; r++) {
        for (let col = 0; col < 5; col++) {
          if (!((glyph[r]! >> (4 - col)) & 1)) continue;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(x0 + col * scale + sx, y0 + r * scale + sy, c);
        }
      }
      x0 += 6 * scale;
    }
  }

  if (opts.radar) rimLight(data, w, h);
  return { w, h, data, pxPerM: ppm, minX, minZ };
}

/**
 * Radar: begehbare Flächen an der Kante zu Wand/Leere um ~25 % aufhellen (Rand-Licht) —
 * Gänge und Räume heben sich so auch bei ähnlichen Bodenfarben klar von den Wänden ab.
 */
export function rimLight(data: Uint8ClampedArray, w: number, h: number): void {
  const lum = (i: number): number => (data[i + 3]! < 40 ? 0 : data[i]! * 0.3 + data[i + 1]! * 0.59 + data[i + 2]! * 0.11);
  const edge: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (lum(i) < RIM.floor) continue;
      const dark = (x > 0 && lum(i - 4) < RIM.wall) || (x < w - 1 && lum(i + 4) < RIM.wall) || (y > 0 && lum(i - w * 4) < RIM.wall) || (y < h - 1 && lum(i + w * 4) < RIM.wall);
      if (dark) edge.push(i);
    }
  }
  for (const i of edge) {
    data[i] = Math.min(255, data[i]! * 1.25 + 12);
    data[i + 1] = Math.min(255, data[i + 1]! * 1.25 + 12);
    data[i + 2] = Math.min(255, data[i + 2]! * 1.25 + 12);
  }
}

/** Schwellen (Helligkeit) für das Rand-Licht: ab `floor` ist es Boden, unter `wall` Wand/Leere. */
const RIM = { floor: 60, wall: 32 };

/** 5×7-Bitmap-Schrift (Großbuchstaben, Ziffern, Umlaute). */
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31], Ä: [10, 0, 14, 17, 31, 17, 17], Ö: [10, 0, 14, 17, 17, 17, 14],
  Ü: [10, 0, 17, 17, 17, 17, 14], ß: [14, 17, 17, 22, 17, 17, 22], '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31], '3': [30, 1, 1, 14, 1, 1, 30], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16], '.': [0, 0, 0, 0, 0, 12, 12],
  '?': [14, 17, 1, 2, 4, 0, 4], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
};
