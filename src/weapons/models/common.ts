import type { Builder, P2, P3 } from './builder';

/** Farbpalette (sRGB-Hex, three wandelt in linear). */
export const C = {
  black: 0x222428,
  gun: 0x34373c,
  gunLight: 0x4a4e55,
  steel: 0x6a7078,
  silver: 0xb2b7bd,
  chrome: 0xd4d8dd,
  brass: 0xc79c42,
  wood: 0x93582a,
  woodDark: 0x5c3519,
  woodRed: 0x7a3a1c,
  poly: 0x2c2e32,
  polyGrey: 0x4b4f55,
  polyLight: 0x6b7077,
  olive: 0x5c6240,
  od: 0x55613d,
  tan: 0xa68b62,
  sand: 0xc3ab7e,
  orange: 0xc8642a,
  red: 0xb22a22,
  green: 0x3c6a33,
  lens: 0x1d3c4c,
  white: 0xdcdedf,
  amber: 0x9a6a2a,
  rubber: 0x141414,
} as const;

/** Rahmen-Hilfen für Hand-Anker (Achsen in [x, y, f]). */
export function gripAxis(rake = 0.26): P3 {
  return [0, Math.cos(rake), Math.sin(rake)];
}

/** Linke Hand unter einem Handschutz: Achse nach vorn, Handrücken nach unten-links. */
export function foreBack(angle = 0.55): P3 {
  return [-Math.sin(angle), -Math.cos(angle), 0];
}

/** Rechteck-Profil [f0..f1] × [y0..y1] mit optional abgeschrägten Ecken (c). */
export function rect(f0: number, f1: number, y0: number, y1: number, c = 0): P2[] {
  if (c <= 0) return [[f0, y0], [f1, y0], [f1, y1], [f0, y1]];
  return [[f0 + c, y0], [f1 - c, y0], [f1, y0 + c], [f1, y1 - c], [f1 - c, y1], [f0 + c, y1], [f0, y1 - c], [f0, y0 + c]];
}

/** Abzugsbügel (Ring mit Loch) + Abzug; f0 hinten (am Griff), f1 vorn, y = Oberkante. */
export function triggerGroup(b: Builder, f0: number, f1: number, y: number, drop: number, color: number, o: { width?: number; x?: number; trigger?: number } = {}): void {
  const w = o.width ?? 0.011;
  const t = 0.0045;
  const outer: P2[] = [[f0, y], [f1, y], [f1 + 0.003, y - drop * 0.45], [f1 - 0.008, y - drop], [f0 - 0.002, y - drop]];
  const inner: P2[] = [[f0 + t, y - 0.001], [f1 - t, y - 0.001], [f1 - t + 0.001, y - drop * 0.45], [f1 - 0.01, y - drop + t], [f0 + t, y - drop + t]];
  b.ext(outer, w, color, { x: o.x, holes: [inner], bevel: 0.001 });
  const ft = f0 + (f1 - f0) * (o.trigger ?? 0.42);
  b.ext([[ft - 0.003, y], [ft + 0.004, y], [ft + 0.001, y - drop * 0.55], [ft - 0.006, y - drop * 0.72], [ft - 0.007, y - drop * 0.62]], 0.006, C.black, { x: o.x, bevel: 0.0008, d: true });
}

/** Picatinny-Schiene von f0 bis f1 (Oberkante y). */
export function rail(b: Builder, f0: number, f1: number, y: number, color: number, o: { x?: number; w?: number; side?: boolean } = {}): void {
  const w = o.w ?? 0.021;
  const len = f1 - f0;
  if (o.side) {
    b.box([0.006, w, len], [o.x ?? 0, y, (f0 + f1) / 2], color);
    return;
  }
  b.box([w, 0.006, len], [o.x ?? 0, y - 0.003, (f0 + f1) / 2], color);
  const n = Math.floor(len / 0.0105);
  for (let i = 0; i < n; i++) b.box([w + 0.002, 0.0035, 0.0052], [o.x ?? 0, y + 0.0012, f0 + 0.006 + i * 0.0105], color, { d: true });
}

/** Lauf entlang f (Mitte bei y, x). */
export function barrel(b: Builder, f0: number, f1: number, r: number, y: number, color: number, x = 0, sides = 10): void {
  b.cyl(r, r, f1 - f0, [x, y, (f0 + f1) / 2], color, { sides });
}

/** Zielfernrohr: Okular hinten (f0), Objektiv vorn (f1), Rohr r, Glas an beiden Enden. */
export function scope(b: Builder, f0: number, f1: number, y: number, r: number, rObj: number, rEye: number, color: number, o: { mounts?: number[]; mountY?: number; turrets?: boolean } = {}): void {
  const L = f1 - f0;
  if (!b.view) {
    // Welt-LOD: Rohr + Objektiv als einfache Zylinder
    b.cyl(r, r, L * 0.7, [0, y, f0 + L * 0.35], color, { sides: 8 });
    b.cyl(rObj, rObj, L * 0.3, [0, y, f1 - L * 0.15], color, { sides: 8 });
    for (const f of o.mounts ?? []) if (o.mountY !== undefined) b.box([r * 1.4, y - r - o.mountY, 0.016], [0, (y - r + o.mountY) / 2, f], C.black);
    return;
  }
  b.lathe([
    [rEye * 0.82, 0], [rEye, 0.004], [rEye, L * 0.12], [r * 1.05, L * 0.22], [r, L * 0.26],
    [r, L * 0.62], [r * 1.05, L * 0.66], [rObj, L * 0.8], [rObj, L - 0.004], [rObj * 0.9, L],
  ], [0, y, f0], color, { sides: 14 });
  b.cyl(rEye * 0.8, rEye * 0.8, 0.003, [0, y, f0 + 0.002], C.lens, { m: 'glass', sides: 14 });
  b.cyl(rObj * 0.86, rObj * 0.86, 0.003, [0, y, f1 - 0.003], C.lens, { m: 'glass', sides: 14 });
  if (o.turrets ?? true) {
    const fm = f0 + L * 0.44;
    b.cyl(r * 0.62, r * 0.62, r * 1.5, [0, y + r * 1.1, fm], color, { axis: 'y', sides: 10 });
    b.cyl(r * 0.62, r * 0.62, r * 1.5, [r * 1.1, y, fm], color, { axis: 'x', sides: 10 });
    b.cyl(r * 0.7, r * 0.7, r * 0.3, [0, y + r * 1.8, fm], C.gunLight, { axis: 'y', sides: 10, d: true });
  }
  const my = o.mountY;
  for (const f of o.mounts ?? []) {
    b.cyl(r * 1.18, r * 1.18, 0.016, [0, y, f], C.black, { sides: 12 });
    if (my !== undefined) b.box([r * 1.4, y - r - my, 0.016], [0, (y - r + my) / 2, f], C.black);
  }
}

/** AK-artiges gebogenes Magazin als Profil (oben an fTop, Breite w). */
export function curvedMag(f0: number, f1: number, yTop: number, len: number, curve: number): P2[] {
  const n = 5;
  const back: P2[] = [];
  const front: P2[] = [];
  const depth = f1 - f0;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const y = yTop - u * len;
    const off = curve * u * u;
    back.push([f0 + off, y]);
    front.push([f0 + depth * (1 + 0.18 * u) + off, y]);
  }
  return [...back, ...front.reverse()];
}
