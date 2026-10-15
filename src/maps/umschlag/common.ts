import type { MapBuilder } from '../../logic/mapkit';
import { prop, type PropKind } from '../../logic/mapprops';
import type { PropOpts } from '../../logic/propgeom';

export { F, column, floorLabel, hangSign, hazardEdge, railedStairs, tape } from '../gueterbahnhof/common';

/** Ebenen (m): Unterführung, Rampe A (Außen), Obergeschoss (Wohnungen, Fenster, Steg), Palast/Balkon. */
export const LV = { under: -3.6, apron: 2, up: 4.4, palace: 5.5 } as const;

export type B = MapBuilder;

type LampOpts = { color?: number; intensity?: number; range?: number };

/** Reihe gleicher Requisiten von (x0, z0) nach (x1, z1) mit n Stück. */
export function line(b: B, kind: PropKind, x0: number, y: number, z0: number, x1: number, z1: number, n: number, o: PropOpts = {}): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    prop(b, kind, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, { ...o, seed: (o.seed ?? 7) + i * 13 });
  }
}

/** Hallenleuchten im Raster (Deko + Licht), y = Aufhängehöhe. */
export function lampGrid(b: B, x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, y: number, o: LampOpts = {}): void {
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = nx === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (nx - 1);
      const z = nz === 1 ? (z0 + z1) / 2 : z0 + ((z1 - z0) * k) / (nz - 1);
      b.hallLamp(x, y, z, { color: 0xe6f0ff, ...o });
    }
  }
}

/** Leuchtstoffröhren in einer Reihe von (x0, z0) nach (x1, z1). */
export function tubeRow(b: B, x0: number, z0: number, x1: number, z1: number, n: number, y: number, alongX: boolean, o: LampOpts = {}): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    b.tubeLamp(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, alongX, { color: 0xdceeff, ...o });
  }
}

/**
 * Reihe Rolltor-Buchten an einer Fassade (Docks): Rückseite an der Wand bei `wall` (x bei `axis` 'x', sonst z),
 * Buchten von `from` bis `to` im Abstand `step`, Nummern ab `n0`. `facing` = Richtung, in die die Buchten schauen.
 */
export function dockRow(b: B, axis: 'x' | 'z', wall: number, from: number, to: number, facing: 'px' | 'nx' | 'pz' | 'nz', o: { step?: number; n0?: number; y?: number; len?: number; h?: number } = {}): void {
  const step = o.step ?? 6;
  const rot = ({ pz: 0, nx: 1, nz: 2, px: 3 } as const)[facing];
  let n = o.n0 ?? 1;
  for (let a = from; a <= to + 1e-6; a += step) {
    const px = axis === 'x' ? wall : a;
    const pz = axis === 'x' ? a : wall;
    prop(b, 'dockBay', px, o.y ?? 0, pz, { rot, n: n++, len: o.len ?? 3.4, h: o.h ?? 3.8, seed: 5 + n });
  }
}

/** Stahlstützen in einer Reihe (Deckung, tragen Laufstege): Pfeiler von y0 bis y1. */
export function pillars(b: B, pts: [number, number][], y0: number, y1: number, tint = 0x2f5f9e, w = 0.5): void {
  for (const [x, z] of pts) b.box([x - w / 2, y0, z - w / 2], [x + w / 2, y1, z + w / 2], 'steel', { tint, tag: 'pillar' });
}

/** Bodenmarkierung: Linie von (x0, z0) nach (x1, z1) (achsparallel). */
export function stripe(b: B, x0: number, z0: number, x1: number, z1: number, y: number, color = 0xe8c020, w = 0.15): void {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const alongZ = Math.abs(z1 - z0) >= Math.abs(x1 - x0);
  b.decal({ kind: 'line', pos: [cx, y + 0.02, cz], size: alongZ ? [w, Math.abs(z1 - z0)] : [Math.abs(x1 - x0), w], color });
}

/** Paketstapel (Kartons auf Palette) als kleine Deckungsgruppe. */
export function parcelPile(b: B, x: number, y: number, z: number, rot: 0 | 1 | 2 | 3 = 0, seed = 1): void {
  prop(b, 'palletGoods', x, y, z, { rot, seed, h: 1.0 + (seed % 3) * 0.3 });
  prop(b, 'cartons', x + (rot % 2 ? 0 : 1.1), y, z + (rot % 2 ? 1.1 : 0), { seed: seed + 3 });
}
