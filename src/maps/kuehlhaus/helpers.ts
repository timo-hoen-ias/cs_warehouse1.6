import type { MapBuilder } from '../../logic/mapkit';
import { prop, type PropKind, type PropOpts } from '../../logic/mapprops';

export type B = MapBuilder;
/** Fassadenverkleidung + Sockel: Wandanbauten liegen davor. */
export const F = 0.12;

/** Reihe gleicher Requisiten von (x0, z0) nach (x1, z1) mit n Stück. */
export function line(b: B, kind: PropKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number, o: PropOpts = {}): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    prop(b, kind, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, { ...o, seed: (o.seed ?? 7) + i * 13 });
  }
}

/** Reifwolke am Boden (Bodenmarkierung). */
export function frost(b: B, x: number, y: number, z: number, w: number, d: number, rot = 0): void {
  b.decal({ kind: 'frost', pos: [x, y + 0.02, z], size: [w, d], rot });
}

/** Schneehaufen/Schneerand (flach, nur Optik). */
export function snow(b: B, x0: number, z0: number, x1: number, z1: number, y: number, h = 0.3): void {
  b.box([x0, y, z0], [x1, y + h, z1], 'frost', { collide: 'none', noNav: true, occlude: false, tint: 0xf4f9ff, tag: 'prop' });
}

/** Absperrband zwischen zwei Pfosten (rot-weiß, nur Optik). */
export function tape(b: B, x0: number, z0: number, x1: number, z1: number, y: number): void {
  for (const [x, z] of [[x0, z0], [x1, z1]] as const) b.box([x - 0.04, y, z - 0.04], [x + 0.04, y + 1.0, z + 0.04], 'metal', { collide: 'none', tint: 0xd8d8d8, noNav: true, occlude: false });
  b.box([Math.min(x0, x1) - 0.01, y + 0.92, Math.min(z0, z1) - 0.01], [Math.max(x0, x1) + 0.01, y + 0.97, Math.max(z0, z1) + 0.01], 'hazard', { collide: 'none', tint: 0xff4040, noNav: true, occlude: false });
}

/** Abgehängtes, beidseitiges Schild mit zwei Aufhängungen. */
export function hangSign(b: B, text: string, x: number, y: number, z: number, color: number, sub?: string, w = 4.2): void {
  b.sign(text, [x, y, z + 0.03], 'pz', w, 1.0, { color, sub });
  b.sign(text, [x, y, z - 0.03], 'nz', w, 1.0, { color, sub });
  for (const dx of [-w * 0.38, w * 0.38]) b.box([x + dx - 0.02, y + 0.5, z - 0.02], [x + dx + 0.02, y + 2.2, z + 0.02], 'metal', { collide: 'none', tint: 0x404448, noNav: true, occlude: false });
}

/** Gelb-schwarze Kante (flach, nur Optik). */
export function edge(b: B, x0: number, z0: number, x1: number, z1: number, y: number): void {
  b.box([x0, y, z0], [x1, y + 0.03, z1], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 1 });
}

