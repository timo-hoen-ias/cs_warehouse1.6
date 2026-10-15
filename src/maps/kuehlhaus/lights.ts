import type { B } from './helpers';

type LampOpts = { color?: number; intensity?: number; range?: number };

/** Hallenleuchten im Raster (Deko + Licht), y = Aufhängehöhe der Leuchte (Stab reicht 1.4 m darüber). */
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
