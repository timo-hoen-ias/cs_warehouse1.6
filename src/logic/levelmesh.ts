import { BAKE_HIGH, BAKE_LOW, LightGrid, bakeEnv, bakeLights, bakePoint, buildVoxels, linearRgb, type BakeEnv, type BakeQuality, type RGB, type V3, type Voxels } from './bake';
import { COL, Collider, topAt, type ColItem } from './collision';
import { MATERIALS, type Brush, type MapData, type MaterialId } from './mapkit';

/**
 * Level-Geometrie (pure): Brushes → Dreiecksnetze je Material und Kachel (wenige
 * Draw-Calls, Frustum-Culling je Kachel). Verdeckte Flächenstücke (an andere Brushes
 * angrenzend) werden weggelassen, Flächen werden fein unterteilt und je Vertex mit dem
 * gebackenen Licht (bake.ts) eingefärbt. UVs in Weltkoordinaten (nahtlose Kachelung).
 */
export type MeshPart = {
  mat: MaterialId;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  center: V3;
  radius: number;
};

export type LevelMeshOpts = {
  /** Unterteilungslänge (m) der Flächen fürs Vertex-Licht. */
  seg: number;
  bake: BakeQuality;
  /** Kachelgröße (m) fürs Zusammenfassen. */
  chunk: number;
  voxelCell: number;
};

export const LEVEL_HIGH: LevelMeshOpts = { seg: 1.25, bake: BAKE_HIGH, chunk: 32, voxelCell: 0.5 };
export const LEVEL_LOW: LevelMeshOpts = { seg: 2.5, bake: BAKE_LOW, chunk: 40, voxelCell: 0.5 };

/** Durchsichtige/dünne Brushes verdecken nichts (Gitter, Geländer, Zäune). */
export function isOpaque(b: Brush): boolean {
  return b.visible !== false && b.mat !== 'cage' && b.tag !== 'rail' && b.tag !== 'fence';
}

/** Verdeckungs-Test: liegt der Punkt in einem undurchsichtigen, sichtbaren Brush? */
export class Occluders {
  private readonly col: Collider;
  private readonly tmp: ColItem[] = [];
  constructor(brushes: readonly Brush[]) {
    const items: ColItem[] = [];
    for (const b of brushes) {
      if (!isOpaque(b)) continue;
      items.push({ minX: b.min[0], minY: b.min[1], minZ: b.min[2], maxX: b.max[0], maxY: b.max[1], maxZ: b.max[2], mask: COL.all, ramp: b.ramp });
    }
    this.col = new Collider(items, { floorY: -1e9, cell: 4 });
  }
  inside(x: number, y: number, z: number, self?: Brush): boolean {
    for (const it of this.col.query(x, z, x, z, COL.all, this.tmp)) {
      if (x <= it.minX || x >= it.maxX || z <= it.minZ || z >= it.maxZ || y <= it.minY || y >= it.maxY) continue;
      if (self && it.minX === self.min[0] && it.maxX === self.max[0] && it.minY === self.min[1] && it.maxY === self.max[1] && it.minZ === self.min[2] && it.maxZ === self.max[2]) continue;
      if (it.ramp && y > topAt(it, x, z)) continue;
      return true;
    }
    return false;
  }
}

type Builder = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[]; mat: MaterialId; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };

export type LevelBake = { voxels: Voxels; grid: LightGrid; env: BakeEnv; q: BakeQuality };

export function prepareBake(map: MapData, opts: LevelMeshOpts): LevelBake {
  const occ = map.brushes.filter((b) => b.occlude ?? (b.visible !== false && b.tag !== 'rail' && b.tag !== 'fence' && b.mat !== 'cage'));
  const voxels = buildVoxels(occ, map.bounds, opts.voxelCell);
  return { voxels, grid: new LightGrid(bakeLights(map.lights)), env: bakeEnv(map.env), q: opts.bake };
}

/** Licht an einem Punkt (für Deko-Instanzen, Schilder, Lichtsonden). */
export function sampleLight(bake: LevelBake, p: V3, n: V3 = [0, 1, 0]): RGB {
  return bakePoint(bake.voxels, bake.grid, bake.env, p, n, bake.q);
}

export function buildLevelMesh(map: MapData, opts: LevelMeshOpts = LEVEL_HIGH, bake: LevelBake = prepareBake(map, opts)): { parts: MeshPart[]; bake: LevelBake; stats: { faces: number; culled: number; verts: number } } {
  const occ = new Occluders(map.brushes);
  const builders = new Map<string, Builder>();
  const stats = { faces: 0, culled: 0, verts: 0 };
  const tintCache = new Map<number, RGB>();
  const tintOf = (t: number | undefined): RGB => {
    if (t === undefined) return [1, 1, 1];
    let c = tintCache.get(t);
    if (!c) {
      c = linearRgb(t);
      tintCache.set(t, c);
    }
    return c;
  };

  const get = (mat: MaterialId, cx: number, cz: number): Builder => {
    const key = `${mat}|${Math.floor(cx / opts.chunk)}|${Math.floor(cz / opts.chunk)}`;
    let b = builders.get(key);
    if (!b) {
      b = { pos: [], nor: [], uv: [], col: [], idx: [], mat, minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
      builders.set(key, b);
    }
    return b;
  };

  /**
   * Viereck-Gitter: Ecke o, Kanten eu (Länge lu) und ev (Länge lv), Normale n.
   * hv(u) = Höhenfunktion für Rampen-Seiten (Anteil 0..1 der v-Kante je u).
   */
  const quadGrid = (br: Brush, mat: MaterialId, o: V3, eu: V3, lu: number, ev: V3, lv: number, n: V3, uvWorld: (p: V3) => [number, number], hv?: (fu: number) => number): void => {
    // Eingepasste UVs (Fenster, Tore): Textur genau einmal je Fläche; Spiegelung je nach Blickseite ausgleichen
    const fitFlip = eu[0] * n[2] - eu[2] * n[0] < 0;
    const uvOf = br.uvFit ? (_p: V3, fu = 0, fv = 0): [number, number] => [fitFlip ? 1 - fu : fu, fv] : (p: V3): [number, number] => uvWorld(p);
    stats.faces++;
    const nu = Math.max(1, Math.min(64, Math.ceil(lu / opts.seg)));
    const nv = Math.max(1, Math.min(64, Math.ceil(lv / opts.seg)));
    const P = (iu: number, iv: number): V3 => {
      const fu = iu / nu;
      const fv = (iv / nv) * (hv ? hv(fu) : 1);
      return [o[0] + eu[0] * lu * fu + ev[0] * lv * fv, o[1] + eu[1] * lu * fu + ev[1] * lv * fv, o[2] + eu[2] * lu * fu + ev[2] * lv * fv];
    };
    // Sichtbare Teilflächen bestimmen (Mitte + Ecken knapp außerhalb in Normalenrichtung)
    const vis: boolean[] = [];
    let any = false;
    for (let iv = 0; iv < nv; iv++) {
      for (let iu = 0; iu < nu; iu++) {
        let hidden = true;
        for (const [a, c] of [[0.5, 0.5], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]] as const) {
          const fu = (iu + a) / nu;
          const fv = ((iv + c) / nv) * (hv ? hv(fu) : 1);
          const x = o[0] + eu[0] * lu * fu + ev[0] * lv * fv + n[0] * 0.04;
          const y = o[1] + eu[1] * lu * fu + ev[1] * lv * fv + n[1] * 0.04;
          const z = o[2] + eu[2] * lu * fu + ev[2] * lv * fv + n[2] * 0.04;
          if (!occ.inside(x, y, z, br)) {
            hidden = false;
            break;
          }
        }
        vis.push(!hidden);
        if (!hidden) any = true;
      }
    }
    if (!any) {
      stats.culled++;
      return;
    }
    const cx = o[0] + eu[0] * lu * 0.5 + ev[0] * lv * 0.5;
    const cz = o[2] + eu[2] * lu * 0.5 + ev[2] * lv * 0.5;
    const B = get(mat, cx, cz);
    const base = B.pos.length / 3;
    const tint = tintOf(br.tint);
    const glow = mat === 'emissive' || mat === 'skylight';
    const used = new Uint8Array((nu + 1) * (nv + 1));
    for (let iv = 0; iv < nv; iv++) {
      for (let iu = 0; iu < nu; iu++) {
        if (!vis[iv * nu + iu]) continue;
        const a = iv * (nu + 1) + iu;
        used[a] = used[a + 1] = used[a + nu + 1] = used[a + nu + 2] = 1;
      }
    }
    for (let iv = 0; iv <= nv; iv++) {
      for (let iu = 0; iu <= nu; iu++) {
        const p = P(iu, iv);
        B.pos.push(p[0], p[1], p[2]);
        B.nor.push(n[0], n[1], n[2]);
        const [u, v] = uvOf(p, iu / nu, iv / nv);
        B.uv.push(u, v);
        const L = !used[iv * (nu + 1) + iu] ? ([0, 0, 0] as RGB) : glow ? ([1.6, 1.6, 1.6] as RGB) : bakePoint(bake.voxels, bake.grid, bake.env, p, n, bake.q);
        B.col.push(L[0] * tint[0], L[1] * tint[1], L[2] * tint[2]);
        B.minX = Math.min(B.minX, p[0]); B.maxX = Math.max(B.maxX, p[0]);
        B.minY = Math.min(B.minY, p[1]); B.maxY = Math.max(B.maxY, p[1]);
        B.minZ = Math.min(B.minZ, p[2]); B.maxZ = Math.max(B.maxZ, p[2]);
      }
    }
    // Wicklung: (eu × ev) muss in Normalenrichtung zeigen, sonst Dreiecke umdrehen
    const cr: V3 = [eu[1] * ev[2] - eu[2] * ev[1], eu[2] * ev[0] - eu[0] * ev[2], eu[0] * ev[1] - eu[1] * ev[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    for (let iv = 0; iv < nv; iv++) {
      for (let iu = 0; iu < nu; iu++) {
        if (!vis[iv * nu + iu]) continue;
        const a = base + iv * (nu + 1) + iu;
        const b2 = a + 1;
        const c = a + (nu + 1);
        const d = c + 1;
        if (flip) B.idx.push(a, c, b2, b2, c, d);
        else B.idx.push(a, b2, c, b2, d, c);
      }
    }
  };

  for (const br of map.brushes) {
    if (br.visible === false) continue;
    const [x0, y0, z0] = br.min;
    const [x1, y1, z1] = br.max;
    const s = br.uv ?? MATERIALS[br.mat].uv;
    const topMat = br.top ?? br.mat;
    const st = br.uv ?? MATERIALS[topMat].uv;
    const uvXZ = (p: V3): [number, number] => [p[0] / st, p[2] / st];
    const uvZY = (p: V3): [number, number] => [p[2] / s, p[1] / s];
    const uvXY = (p: V3): [number, number] => [p[0] / s, p[1] / s];
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (!br.ramp) {
      quadGrid(br, topMat, [x0, y1, z0], [1, 0, 0], w, [0, 0, 1], d, [0, 1, 0], uvXZ);
      quadGrid(br, br.mat, [x0, y0, z0], [1, 0, 0], w, [0, 0, 1], d, [0, -1, 0], (p) => [p[0] / s, p[2] / s]);
      quadGrid(br, br.mat, [x1, y0, z0], [0, 0, 1], d, [0, 1, 0], h, [1, 0, 0], uvZY);
      quadGrid(br, br.mat, [x0, y0, z0], [0, 0, 1], d, [0, 1, 0], h, [-1, 0, 0], uvZY);
      quadGrid(br, br.mat, [x0, y0, z1], [1, 0, 0], w, [0, 1, 0], h, [0, 0, 1], uvXY);
      quadGrid(br, br.mat, [x0, y0, z0], [1, 0, 0], w, [0, 1, 0], h, [0, 0, -1], uvXY);
      continue;
    }
    // Rampe (Keil): Schräge, Boden, hohe Stirnseite, zwei Dreiecks-Seiten
    const along = br.ramp === 'px' || br.ramp === 'nx';
    const run = along ? w : d;
    const len = Math.hypot(run, h);
    const sx = br.ramp === 'px' ? 1 : br.ramp === 'nx' ? -1 : 0;
    const sz = br.ramp === 'pz' ? 1 : br.ramp === 'nz' ? -1 : 0;
    const nTop: V3 = (() => { const v: V3 = [-sx * h, run, -sz * h]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
    // tiefes Ende (Startkante) und Richtung hinauf
    const lowX = sx > 0 ? x0 : sx < 0 ? x1 : x0;
    const lowZ = sz > 0 ? z0 : sz < 0 ? z1 : z0;
    const up: V3 = [sx * run / len, h / len, sz * run / len];
    const uvSlope = (p: V3): [number, number] => (along ? [p[2] / st, (Math.abs(p[0] - lowX) * len) / run / st] : [p[0] / st, (Math.abs(p[2] - lowZ) * len) / run / st]);
    if (along) quadGrid(br, topMat, [lowX, y0, z0], [0, 0, 1], d, up, len, nTop, uvSlope);
    else quadGrid(br, topMat, [x0, y0, lowZ], [1, 0, 0], w, up, len, nTop, uvSlope);
    quadGrid(br, br.mat, [x0, y0, z0], [1, 0, 0], w, [0, 0, 1], d, [0, -1, 0], (p) => [p[0] / s, p[2] / s]);
    // hohe Stirnseite
    if (br.ramp === 'px') quadGrid(br, br.mat, [x1, y0, z0], [0, 0, 1], d, [0, 1, 0], h, [1, 0, 0], uvZY);
    if (br.ramp === 'nx') quadGrid(br, br.mat, [x0, y0, z0], [0, 0, 1], d, [0, 1, 0], h, [-1, 0, 0], uvZY);
    if (br.ramp === 'pz') quadGrid(br, br.mat, [x0, y0, z1], [1, 0, 0], w, [0, 1, 0], h, [0, 0, 1], uvXY);
    if (br.ramp === 'nz') quadGrid(br, br.mat, [x0, y0, z0], [1, 0, 0], w, [0, 1, 0], h, [0, 0, -1], uvXY);
    // Seiten: v-Höhe wächst linear entlang der Anstiegsrichtung
    if (along) {
      const hvx = (fu: number) => (sx > 0 ? fu : 1 - fu);
      quadGrid(br, br.mat, [x0, y0, z0], [1, 0, 0], w, [0, 1, 0], h, [0, 0, -1], uvXY, hvx);
      quadGrid(br, br.mat, [x0, y0, z1], [1, 0, 0], w, [0, 1, 0], h, [0, 0, 1], uvXY, hvx);
    } else {
      const hvz = (fu: number) => (sz > 0 ? fu : 1 - fu);
      quadGrid(br, br.mat, [x0, y0, z0], [0, 0, 1], d, [0, 1, 0], h, [-1, 0, 0], uvZY, hvz);
      quadGrid(br, br.mat, [x1, y0, z0], [0, 0, 1], d, [0, 1, 0], h, [1, 0, 0], uvZY, hvz);
    }
  }

  const parts: MeshPart[] = [];
  for (const B of builders.values()) {
    if (!B.idx.length) continue;
    stats.verts += B.pos.length / 3;
    const center: V3 = [(B.minX + B.maxX) / 2, (B.minY + B.maxY) / 2, (B.minZ + B.maxZ) / 2];
    parts.push({
      mat: B.mat,
      positions: new Float32Array(B.pos),
      normals: new Float32Array(B.nor),
      uvs: new Float32Array(B.uv),
      colors: new Float32Array(B.col),
      indices: new Uint32Array(B.idx),
      center,
      radius: Math.hypot(B.maxX - B.minX, B.maxY - B.minY, B.maxZ - B.minZ) / 2,
    });
  }
  return { parts, bake, stats };
}

export { BAKE_HIGH, BAKE_LOW };
