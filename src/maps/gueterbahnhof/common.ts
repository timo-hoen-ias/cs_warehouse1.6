import type { MapBuilder } from '../../logic/mapkit';

/** Abstand von Schildern/Toren vor der Fassadenverkleidung (m). */
export const F = 0.12;

/** Abgehängtes, beidseitiges Schild mit zwei Aufhängungen (Stangen reichen y + 0.5 … y + `rod`). */
export function hangSign(b: MapBuilder, text: string, x: number, y: number, z: number, color: number, sub?: string, opts: { rod?: number; w?: number; alongX?: boolean } = {}): void {
  const w = opts.w ?? 4.2;
  const rod = opts.rod ?? 2.2;
  if (opts.alongX) {
    b.sign(text, [x + 0.03, y, z], 'px', w, 1.0, { color, sub });
    b.sign(text, [x - 0.03, y, z], 'nx', w, 1.0, { color, sub });
    for (const dz of [-w * 0.38, w * 0.38]) b.box([x - 0.02, y + 0.5, z + dz - 0.02], [x + 0.02, y + rod, z + dz + 0.02], 'metal', { collide: 'none', tint: 0x404448, noNav: true, occlude: false });
    return;
  }
  b.sign(text, [x, y, z + 0.03], 'pz', w, 1.0, { color, sub });
  b.sign(text, [x, y, z - 0.03], 'nz', w, 1.0, { color, sub });
  for (const dx of [-w * 0.38, w * 0.38]) b.box([x + dx - 0.02, y + 0.5, z - 0.02], [x + dx + 0.02, y + rod, z + 0.02], 'metal', { collide: 'none', tint: 0x404448, noNav: true, occlude: false });
}

/** Absperrband zwischen zwei Pfosten (rot-weiß, nur Optik). */
export function tape(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, y: number): void {
  for (const [x, z] of [[x0, z0], [x1, z1]] as const) b.box([x - 0.04, y, z - 0.04], [x + 0.04, y + 1.0, z + 0.04], 'metal', { collide: 'none', tint: 0xd8d8d8, noNav: true, occlude: false });
  b.box([Math.min(x0, x1), y + 0.92, Math.min(z0, z1) - 0.01], [Math.max(x0, x1), y + 0.97, Math.max(z0, z1) + 0.01], 'hazard', { collide: 'none', tint: 0xff4040, noNav: true, occlude: false });
}

/** Gelb-schwarze Kante (Optik) auf Höhe y. */
export function hazardEdge(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, y: number): void {
  b.box([x0, y, z0], [x1, y + 0.03, z1], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 1 });
}

/** Gleisnummer/Hinweistafel am Boden (Markierung) — Buchstabe in Gelb. */
export function floorLabel(b: MapBuilder, text: string, x: number, y: number, z: number, size = 2.4, color = 0xe8c020, rot = 0): void {
  b.decal({ kind: 'letter', pos: [x, y + 0.02, z], size: [size, size], text, color, rot });
}

/** Stahlstütze (Pfeiler, Deckung) von y0 bis y1. */
export function column(b: MapBuilder, x: number, z: number, y0: number, y1: number, w = 0.5, tint = 0x2f5f9e): void {
  b.box([x - w / 2, y0, z - w / 2], [x + w / 2, y1, z + w / 2], 'steel', { tint, tag: 'pillar' });
}

/** Handlauf-Treppe: Treppe plus Geländer an beiden Längsseiten (entlang der Steigung gestuft, nur Optik). */
export function railedStairs(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, yLow: number, yHigh: number, dir: 'px' | 'nx' | 'pz' | 'nz', opts: { solid?: boolean; mat?: 'steel' | 'concrete'; tint?: number; railEnd?: number } = {}): void {
  b.stairs(x0, z0, x1, z1, yLow, yHigh, dir, opts.mat ?? 'steel', { top: 'grating', tint: opts.tint ?? 0x6a7480, solid: opts.solid });
  const alongX = dir === 'px' || dir === 'nx';
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(2, Math.round((yHigh - yLow) / 0.2));
  // Geländer als Folge kurzer Pfosten-Segmente, die der Steigung folgen
  for (const side of [0, 1]) {
    for (let i = 0; i < n; i += 2) {
      const f0 = i / n;
      // Geländer nur bis zum echten Ende der Treppe (Überstand auf dem Zielboden bleibt frei)
      if (f0 >= (opts.railEnd ?? 1) - 1e-9) break;
      const f1 = Math.min(1, (i + 2) / n);
      const up = dir === 'px' || dir === 'pz';
      const a0 = (alongX ? x0 : z0) + len * (up ? f0 : 1 - f1);
      const a1 = (alongX ? x0 : z0) + len * (up ? f1 : 1 - f0);
      const yTop = yLow + (yHigh - yLow) * f1;
      const t = 0.04;
      const cross = alongX ? (side ? z1 - t : z0 + t) : (side ? x1 - t : x0 + t);
      const lo = alongX ? [a0, yTop + 0.95, cross - t] : [cross - t, yTop + 0.95, a0];
      const hi = alongX ? [a1, yTop + 1.03, cross + t] : [cross + t, yTop + 1.03, a1];
      b.box(lo as [number, number, number], hi as [number, number, number], 'metal', { collide: 'none', tint: 0xd8b020, noNav: true, occlude: false, tag: 'rail' });
      // unsichtbare Bewegungssperre auf der Höhe der Stufe (verhindert das Abrutschen seitlich)
      const clipLo = alongX ? [a0, yTop - 0.02, cross - t] : [cross - t, yTop - 0.02, a0];
      const clipHi = alongX ? [a1, yTop + 1.0, cross + t] : [cross + t, yTop + 1.0, a1];
      b.box(clipLo as [number, number, number], clipHi as [number, number, number], 'metal', { collide: 'move', visible: false, occlude: false, noNav: true, tag: 'rail' });
      const [px, pz] = alongX ? [a0, cross] : [cross, a0];
      b.box([px - 0.03, yTop, pz - 0.03], [px + 0.03, yTop + 0.98, pz + 0.03], 'metal', { collide: 'none', tint: 0xd8b020, noNav: true, occlude: false, tag: 'rail' });
    }
  }
}
