import type { Facing, MapBuilder } from '../../logic/mapkit';
import { prop, type PropKind, type PropOpts } from '../../logic/mapprops';

export type B = MapBuilder;
/** Abstand von Wandanbauten zur Gebäudekante (Fassadenverkleidung + Pilaster liegen bis 0.28 m davor). */
export const F = 0.32;

/** Reihe gleicher Requisiten von (x0, z0) nach (x1, z1) mit n Stück. */
export function line(b: B, kind: PropKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number, o: PropOpts = {}): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    prop(b, kind, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, { ...o, seed: (o.seed ?? 7) + i * 13 });
  }
}

/** Viertelumdrehung, bei der die lokale Front (+Z) in diese Richtung zeigt. */
export const ROT: Record<Facing, 0 | 1 | 2 | 3> = { pz: 0, nx: 1, nz: 2, px: 3 };

/** Nach außen zeigende Normale einer Fassadenrichtung. */
const OUT: Record<Facing, [number, number]> = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] };

/**
 * Seilwinden-Erker (Speicherluken) entlang einer Fassade: `wall` = Koordinate der Gebäudekante
 * (z für Wände entlang X, x für Wände entlang Z), `a0..a1` = Strecke, `y` = Höhe der Luken-Schwelle.
 * `face` = Richtung, in die die Fassade schaut (zur Gasse).
 */
export function hoists(b: B, face: Facing, wall: number, a0: number, a1: number, y: number, every: number, o: { h?: number; len?: number; load?: number; tint?: number; first?: number } = {}): void {
  const [nx] = OUT[face];
  const alongZ = nx !== 0;
  const n = Math.max(1, Math.floor((a1 - a0) / every));
  const pad = (a1 - a0 - (n - 1) * every) / 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + pad + i * every + (o.first ?? 0);
    const out = F * 0.6;
    const wx = alongZ ? wall + OUT[face][0] * out : a;
    const wz = alongZ ? a : wall + OUT[face][1] * out;
    prop(b, 'hoist', wx, y, wz, { rot: ROT[face], h: o.h, len: o.len, n: (o.load ?? 3) > 0 && i % (o.load ?? 3) === 0 ? 1 : 0, tint: o.tint });
  }
}

/** Straßenschild (blau-weißes Emailleschild) mit Callout-Namen. */
export function plate(b: B, text: string, x: number, y: number, z: number, face: Facing, sub?: string, w = 2.8): void {
  b.sign(text, [x, y, z], face, w, sub ? 0.85 : 0.7, { color: 0xf2f2ec, bg: 0x1d3f73, sub });
}

/** Handgemaltes Firmenschild (hell auf dunklem Holz). */
export function shop(b: B, text: string, x: number, y: number, z: number, face: Facing, sub?: string, w = 3.4, color = 0xf0d9a0, bg = 0x2e1e14): void {
  b.sign(text, [x, y, z], face, w, sub ? 1.0 : 0.8, { color, bg, sub });
}

/** Markise (nur Optik): gestreifte Streifen, `face` = Richtung nach außen, Kante an der Wand bei `wall`. */
export function awning(b: B, face: Facing, wall: number, a0: number, a1: number, y: number, colors: [number, number] = [0xb23a2c, 0xe8dcc0]): void {
  const alongZ = OUT[face][0] !== 0;
  const sgn = alongZ ? OUT[face][0] : OUT[face][1];
  const n = Math.max(2, Math.round((a1 - a0) / 0.45));
  for (let i = 0; i < n; i++) {
    const s0 = a0 + ((a1 - a0) * i) / n;
    const s1 = a0 + ((a1 - a0) * (i + 1)) / n;
    for (let k = 0; k < 3; k++) {
      const d0 = F + k * 0.42;
      const d1 = d0 + 0.42;
      const yy = y - k * 0.14;
      const lo = sgn > 0 ? wall + d0 : wall - d1;
      const hi = sgn > 0 ? wall + d1 : wall - d0;
      const tint = colors[i % 2]!;
      if (alongZ) b.box([lo, yy, s0], [hi, yy + 0.05, s1], 'wrap', { collide: 'none', noNav: true, occlude: false, tint });
      else b.box([s0, yy, lo], [s1, yy + 0.05, hi], 'wrap', { collide: 'none', noNav: true, occlude: false, tint });
    }
  }
}

/** Gelb-schwarze Kante (flach, nur Optik). */
export function edge(b: B, x0: number, z0: number, x1: number, z1: number, y: number): void {
  b.box([x0, y, z0], [x1, y + 0.03, z1], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 1 });
}

/** Absperrband/Kette zwischen zwei Pollern (nur Optik). */
export function chain(b: B, x0: number, z0: number, x1: number, z1: number, y: number): void {
  for (const [x, z] of [[x0, z0], [x1, z1]] as const) b.box([x - 0.05, y, z - 0.05], [x + 0.05, y + 0.9, z + 0.05], 'metal', { collide: 'none', tint: 0x30343a, noNav: true, occlude: false });
  b.box([Math.min(x0, x1) - 0.02, y + 0.78, Math.min(z0, z1) - 0.02], [Math.max(x0, x1) + 0.02, y + 0.82, Math.max(z0, z1) + 0.02], 'hazard', { collide: 'none', noNav: true, occlude: false });
}

/** Poller am Kai (nur Optik, klein). */
export function bollard(b: B, x: number, y: number, z: number): void {
  b.decor('barrel', [x, y, z], 0, [0.5, 0.55, 0.5], 0x30343a);
}

/** Lastkahn im Kanal/Hafen (nur Optik): Rumpf, Aufbau, Ladung; `rot` 0 = Längsachse entlang X. */
export function barge(b: B, x: number, y: number, z: number, len: number, wide: number, o: { hull?: number; cabin?: boolean; cargo?: boolean; alongZ?: boolean } = {}): void {
  const a = o.alongZ ? [wide, len] : [len, wide];
  const hx = a[0]! / 2;
  const hz = a[1]! / 2;
  const fx = { collide: 'none' as const, noNav: true, occlude: true };
  b.box([x - hx, y - 0.6, z - hz], [x + hx, y + 0.7, z + hz], 'black', { ...fx, tint: o.hull ?? 0x2c3a40 });
  b.box([x - hx - 0.04, y + 0.45, z - hz - 0.04], [x + hx + 0.04, y + 0.62, z + hz + 0.04], 'metal', { ...fx, tint: 0x8a2a22 });
  if (o.cabin) {
    const cx0 = o.alongZ ? x - hx * 0.7 : x + hx * 0.35;
    const cx1 = o.alongZ ? x + hx * 0.7 : x + hx * 0.9;
    const cz0 = o.alongZ ? z + hz * 0.35 : z - hz * 0.7;
    const cz1 = o.alongZ ? z + hz * 0.9 : z + hz * 0.7;
    b.box([cx0, y + 0.7, cz0], [cx1, y + 2.4, cz1], 'plaster', { ...fx, tint: 0xe8e2d2 });
    b.box([cx0 - 0.1, y + 2.4, cz0 - 0.1], [cx1 + 0.1, y + 2.55, cz1 + 0.1], 'roof', { ...fx, tint: 0x6a4a3a });
    b.box([(cx0 + cx1) / 2 - 0.15, y + 2.55, (cz0 + cz1) / 2 - 0.15], [(cx0 + cx1) / 2 + 0.15, y + 3.6, (cz0 + cz1) / 2 + 0.15], 'steel', { ...fx, tint: 0x30343a });
  }
  if (o.cargo) {
    const lx = o.alongZ ? [x - hx * 0.8, x + hx * 0.8] : [x - hx * 0.8, x + hx * 0.2];
    const lz = o.alongZ ? [z - hz * 0.8, z + hz * 0.2] : [z - hz * 0.8, z + hz * 0.8];
    b.box([lx[0]!, y + 0.7, lz[0]!], [lx[1]!, y + 1.6, lz[1]!], 'crate', { ...fx, uv: 1.4 });
    b.box([lx[0]! + 0.3, y + 1.6, lz[0]! + 0.3], [lx[1]! - 0.3, y + 2.2, lz[1]! - 0.3], 'wrap', { ...fx, tint: 0x3c6a8a });
  }
}

/** Anlehnbare Holzleiter (nur Optik) an einer Wand; `face` = Richtung der Wandnormalen. */
export function ladder(b: B, face: Facing, wall: number, a: number, y: number, h: number): void {
  const alongZ = OUT[face][0] !== 0;
  const sgn = alongZ ? OUT[face][0] : OUT[face][1];
  const d0 = F + 0.05;
  const lo = sgn > 0 ? wall + d0 : wall - d0 - 0.06;
  const hi = lo + 0.06;
  const fx = { collide: 'none' as const, noNav: true, occlude: false, tint: 0x8a6a44 };
  const boxA = (s0: number, y0: number, s1: number, y1: number): void => {
    if (alongZ) b.box([lo, y0, s0], [hi, y1, s1], 'wood', fx);
    else b.box([s0, y0, lo], [s1, y1, hi], 'wood', fx);
  };
  boxA(a - 0.25, y, a - 0.21, y + h);
  boxA(a + 0.21, y, a + 0.25, y + h);
  for (let ly = y + 0.3; ly < y + h; ly += 0.3) boxA(a - 0.25, ly, a + 0.25, ly + 0.04);
}

/** Wandleuchte mit warmem Gaslicht. */
export function lamp(b: B, x: number, y: number, z: number, face: Facing, intensity = 0.9, range = 11): void {
  b.wallLamp(x, y, z, face, { color: 0xffbf78, intensity, range });
}
