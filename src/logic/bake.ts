import type { Brush, MapEnv, MapLight } from './mapkit';

/**
 * Licht-Backen (pure): Die Karte wird grob voxelisiert (Belegungsraster), dann wird je
 * Oberflächenpunkt Licht gesammelt — Sonne mit Schatten, Himmel mit Verdeckung, Lampen
 * mit Schatten und Abfall, Umgebungslicht und Ambient Occlusion. Ergebnis ist eine
 * lineare RGB-Bestrahlung, die als Vertexfarbe in die Levelgeometrie geht (CS-artige
 * Lightmap ohne Laufzeitkosten).
 */
export type RGB = [number, number, number];
export type V3 = [number, number, number];

export type Voxels = { minX: number; minY: number; minZ: number; cell: number; nx: number; ny: number; nz: number; data: Uint8Array };

/** Belegungsraster aus verdeckenden Brushes (Quader + Rampen). */
export function buildVoxels(brushes: readonly Brush[], bounds: { min: V3; max: V3 }, cell = 0.5): Voxels {
  const minX = bounds.min[0], minY = bounds.min[1], minZ = bounds.min[2];
  const nx = Math.ceil((bounds.max[0] - minX) / cell);
  const ny = Math.ceil((bounds.max[1] - minY) / cell);
  const nz = Math.ceil((bounds.max[2] - minZ) / cell);
  const data = new Uint8Array(nx * ny * nz);
  const eps = 0.02;
  for (const b of brushes) {
    const x0 = Math.max(0, Math.floor((b.min[0] + eps - minX) / cell));
    const x1 = Math.min(nx - 1, Math.floor((b.max[0] - eps - minX) / cell));
    const y0 = Math.max(0, Math.floor((b.min[1] + eps - minY) / cell));
    const y1 = Math.min(ny - 1, Math.floor((b.max[1] - eps - minY) / cell));
    const z0 = Math.max(0, Math.floor((b.min[2] + eps - minZ) / cell));
    const z1 = Math.min(nz - 1, Math.floor((b.max[2] - eps - minZ) / cell));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        let top = y1;
        if (b.ramp) {
          // Keil: Spalte nur bis zur Schräge (Voxelmitte)
          const cx = minX + (x + 0.5) * cell;
          const cz = minZ + (z + 0.5) * cell;
          const f = rampFrac(b, cx, cz);
          const h = b.min[1] + (b.max[1] - b.min[1]) * f;
          top = Math.min(y1, Math.floor((h - eps - minY) / cell));
        }
        for (let y = y0; y <= top; y++) data[(y * nz + z) * nx + x] = 1;
      }
    }
  }
  return { minX, minY, minZ, cell, nx, ny, nz, data };
}

function rampFrac(b: Brush, x: number, z: number): number {
  const cl = (v: number) => Math.max(0, Math.min(1, v));
  switch (b.ramp) {
    case 'px': return cl((x - b.min[0]) / (b.max[0] - b.min[0]));
    case 'nx': return cl((b.max[0] - x) / (b.max[0] - b.min[0]));
    case 'pz': return cl((z - b.min[2]) / (b.max[2] - b.min[2]));
    case 'nz': return cl((b.max[2] - z) / (b.max[2] - b.min[2]));
    default: return 1;
  }
}

/** Ist der Punkt belegt? Außerhalb des Rasters: unten belegt, sonst frei. */
export function occupied(v: Voxels, x: number, y: number, z: number): boolean {
  const ix = Math.floor((x - v.minX) / v.cell);
  const iy = Math.floor((y - v.minY) / v.cell);
  const iz = Math.floor((z - v.minZ) / v.cell);
  if (iy < 0) return true;
  if (ix < 0 || iz < 0 || ix >= v.nx || iy >= v.ny || iz >= v.nz) return false;
  return v.data[(iy * v.nz + iz) * v.nx + ix] === 1;
}

/** Freie Sicht von p in Richtung d bis maxDist (wachsende Schritte)? */
export function visible(v: Voxels, p: V3, d: V3, maxDist: number, first = 0.35): boolean {
  let t = first;
  let step = v.cell * 0.6;
  while (t < maxDist) {
    if (occupied(v, p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t)) return false;
    t += step;
    step = Math.min(step * 1.12, 2.5);
  }
  return true;
}

export type BakeLight = { pos: V3; color: RGB; intensity: number; range: number; kind: MapLight['kind']; dir?: V3; cosAngle?: number };

/** Hex → lineares RGB. */
export function linearRgb(hex: number): RGB {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

export function bakeLights(lights: readonly MapLight[]): BakeLight[] {
  return lights.map((l) => ({
    pos: l.pos, color: linearRgb(l.color), intensity: l.intensity, range: l.range, kind: l.kind,
    dir: l.dir, cosAngle: l.angle !== undefined ? Math.cos(l.angle) : undefined,
  }));
}

/** Lichter in einem XZ-Raster (schnelles „welche Lampen erreichen diesen Punkt“). */
export class LightGrid {
  private readonly cells = new Map<number, BakeLight[]>();
  constructor(readonly lights: BakeLight[], readonly cell = 16) {
    for (const l of lights) {
      const x0 = Math.floor((l.pos[0] - l.range) / cell), x1 = Math.floor((l.pos[0] + l.range) / cell);
      const z0 = Math.floor((l.pos[2] - l.range) / cell), z1 = Math.floor((l.pos[2] + l.range) / cell);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const k = x * 4096 + z;
        const list = this.cells.get(k);
        if (list) list.push(l);
        else this.cells.set(k, [l]);
      }
    }
  }
  near(x: number, z: number): BakeLight[] {
    return this.cells.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell)) ?? [];
  }
}

export type BakeEnv = {
  sunDir: V3;
  sun: RGB;
  sky: RGB;
  ambient: RGB;
};

export function bakeEnv(env: MapEnv): BakeEnv {
  const l = Math.hypot(...env.sunDir);
  const sun = linearRgb(env.sunColor).map((c) => c * env.sunIntensity) as RGB;
  const sky = linearRgb(env.skyTop).map((c, i) => (c * 0.6 + linearRgb(env.skyHorizon)[i]! * 0.4) * env.skyIntensity) as RGB;
  const ambient = [env.ambient * 1.0, env.ambient * 0.95, env.ambient * 0.88] as RGB;
  return { sunDir: [env.sunDir[0] / l, env.sunDir[1] / l, env.sunDir[2] / l], sun, sky, ambient };
}

/** Himmels-Richtungen (Zenit + zwei Ringe), normiert. */
const SKY_DIRS: V3[] = (() => {
  const out: V3[] = [[0, 1, 0]];
  for (const [elev, n] of [[0.95, 6], [0.4, 8]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + elev;
      out.push([Math.cos(a) * Math.cos(elev), Math.sin(elev), Math.sin(a) * Math.cos(elev)]);
    }
  }
  return out;
})();

export type BakeQuality = { skyRays: number; skyDist: number; sunDist: number; ao: boolean };
export const BAKE_HIGH: BakeQuality = { skyRays: SKY_DIRS.length, skyDist: 36, sunDist: 90, ao: true };
export const BAKE_LOW: BakeQuality = { skyRays: 7, skyDist: 24, sunDist: 60, ao: false };

/**
 * Lineare Bestrahlung an einem Oberflächenpunkt p mit Normale n.
 * Sonne (Schatten) + Himmel (Verdeckung) + Lampen (Abstand, Winkel, Schatten) + Umgebung, × AO.
 */
export function bakePoint(v: Voxels, grid: LightGrid, env: BakeEnv, p: V3, n: V3, q: BakeQuality = BAKE_HIGH): RGB {
  const o: V3 = [p[0] + n[0] * 0.12, p[1] + n[1] * 0.12, p[2] + n[2] * 0.12];
  let r = env.ambient[0], g = env.ambient[1], b = env.ambient[2];
  // Himmel
  let skySum = 0;
  let skyW = 0;
  for (let i = 0; i < Math.min(q.skyRays, SKY_DIRS.length); i++) {
    const d = SKY_DIRS[i]!;
    const w = Math.max(0, d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) + 0.15;
    skyW += w;
    if (visible(v, o, d, q.skyDist)) skySum += w;
  }
  const skyVis = skyW > 0 ? skySum / skyW : 0;
  const skyK = skyVis * (0.55 + 0.45 * Math.max(0, n[1]));
  r += env.sky[0] * skyK; g += env.sky[1] * skyK; b += env.sky[2] * skyK;
  // Indirektes Licht draußen (vom sonnigen Boden/Wänden zurückgeworfen) — proportional zur Himmelssicht
  const bounce = skyVis * 0.22;
  r += env.sun[0] * bounce * 0.5; g += env.sun[1] * bounce * 0.45; b += env.sun[2] * bounce * 0.38;
  // Sonne
  const ndl = n[0] * env.sunDir[0] + n[1] * env.sunDir[1] + n[2] * env.sunDir[2];
  if (ndl > 0 && visible(v, o, env.sunDir, q.sunDist, 0.2)) {
    r += env.sun[0] * ndl; g += env.sun[1] * ndl; b += env.sun[2] * ndl;
  }
  // Lampen
  for (const l of grid.near(p[0], p[2])) {
    const dx = l.pos[0] - o[0], dy = l.pos[1] - o[1], dz = l.pos[2] - o[2];
    const d = Math.hypot(dx, dy, dz);
    if (d >= l.range || d < 1e-3) continue;
    const L: V3 = [dx / d, dy / d, dz / d];
    const lambert = L[0] * n[0] + L[1] * n[1] + L[2] * n[2];
    const wrap = l.kind === 'window' ? 0.35 : 0.12;
    const nl = Math.max(0, (lambert + wrap) / (1 + wrap));
    if (nl <= 0) continue;
    let cone = 1;
    if (l.dir && l.cosAngle !== undefined) {
      const c = -(L[0] * l.dir[0] + L[1] * l.dir[1] + L[2] * l.dir[2]);
      if (c < l.cosAngle) continue;
      cone = Math.min(1, (c - l.cosAngle) / 0.15);
    }
    const att = (1 - d / l.range) ** 2 * (1 / (1 + 0.08 * d * d)) * 4;
    let k = l.intensity * att * nl * cone;
    if (k < 0.004) continue;
    if (!visible(v, o, L, d - 0.4, 0.15)) k *= 0.06;
    r += l.color[0] * k; g += l.color[1] * k; b += l.color[2] * k;
  }
  // Ambient Occlusion (kurze Proben neben/über der Fläche)
  if (q.ao) {
    let occ = 0;
    const t1: V3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const t2: V3 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
    const t3: V3 = [n[1] * t2[2] - n[2] * t2[1], n[2] * t2[0] - n[0] * t2[2], n[0] * t2[1] - n[1] * t2[0]];
    for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (const s of [0.45, 0.9]) {
        const x = o[0] + (t2[0] * a + t3[0] * c) * s + n[0] * 0.25;
        const y = o[1] + (t2[1] * a + t3[1] * c) * s + n[1] * 0.25;
        const z = o[2] + (t2[2] * a + t3[2] * c) * s + n[2] * 0.25;
        if (occupied(v, x, y, z)) occ += s < 0.6 ? 1 : 0.6;
      }
    }
    const ao = 1 - Math.min(0.55, occ * 0.09);
    r *= ao; g *= ao; b *= ao;
  }
  return [r, g, b];
}

/** Grobe Helligkeit (Luminanz) — für Lichtsonden dynamischer Objekte. */
export function luminance(c: RGB): number {
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
