import type { Surface } from './acoustics';

/**
 * Kollisionswelt (pure, framework-frei): achsenparallele Quader und Rampen (Keile)
 * in einem gleichmäßigen XZ-Raster als Beschleunigungsstruktur. Liefert Bodenhöhe,
 * Wand-Auflösung und Kopf-Kollision für die Bewegung (`move.ts`) sowie Strahltests
 * (Schüsse, Sichtlinien, Granaten) über ein 2D-DDA durch das Raster.
 */

/** Richtung, in die eine Rampe ansteigt (+X, −X, +Z, −Z). */
export type RampDir = 'px' | 'nx' | 'pz' | 'nz';

/** Kollisionsmasken: Bewegung blockieren und/oder Strahlen (Schüsse, Sicht, Granaten). */
export const COL = { move: 1, shot: 2, all: 3 } as const;

export type ColItem = {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  /** Bitmaske aus COL. */
  mask: number;
  /** Rampe: Oberseite steigt in diese Richtung von minY auf maxY (Keil mit flacher Unterseite). */
  ramp?: RampDir;
  /** Oberfläche für Schritte/Einschläge. */
  surface?: Surface;
  /** Rückverweis (z. B. Brush-Index). */
  id?: number;
  /** Oberseite ist kein Navigationsboden (Regaldächer, Geländer, Stufen unter Clip-Rampen). */
  noNav?: boolean;
};

export type V3 = { x: number; y: number; z: number };
export type RayHit = { t: number; normal: V3; item: ColItem | null };

/** Steilste begehbare Rampe (tan 40°). Steilere Rampen wirken wie Wände. */
export const MAX_WALK_SLOPE = Math.tan((40 * Math.PI) / 180);

/** Steigung (Höhe je Meter) einer Rampe. */
export function rampSlope(b: ColItem): number {
  const run = b.ramp === 'px' || b.ramp === 'nx' ? b.maxX - b.minX : b.maxZ - b.minZ;
  return (b.maxY - b.minY) / Math.max(1e-6, run);
}

/** Anstiegsanteil 0..1 einer Rampe am Punkt (x,z), auf die Grundfläche geklemmt. */
function rampT(b: ColItem, x: number, z: number): number {
  const cx = Math.min(b.maxX, Math.max(b.minX, x));
  const cz = Math.min(b.maxZ, Math.max(b.minZ, z));
  switch (b.ramp) {
    case 'px': return (cx - b.minX) / Math.max(1e-6, b.maxX - b.minX);
    case 'nx': return (b.maxX - cx) / Math.max(1e-6, b.maxX - b.minX);
    case 'pz': return (cz - b.minZ) / Math.max(1e-6, b.maxZ - b.minZ);
    case 'nz': return (b.maxZ - cz) / Math.max(1e-6, b.maxZ - b.minZ);
    default: return 1;
  }
}

/** Oberkante eines Elements am Punkt (x,z) (Quader: maxY, Rampe: Keilhöhe, geklemmt). */
export function topAt(b: ColItem, x: number, z: number): number {
  if (!b.ramp) return b.maxY;
  return b.minY + (b.maxY - b.minY) * rampT(b, x, z);
}

/**
 * Teil einer Rampe, der höher als `y` ist, als Quader (die Höhe steigt monoton,
 * also ist dieser Teil wieder achsenparallel). null, wenn die Rampe überall ≤ y ist.
 */
export function rampAbove(b: ColItem, y: number): ColItem | null {
  if (!b.ramp) return y < b.maxY ? b : null;
  if (y >= b.maxY) return null;
  if (y <= b.minY) return b;
  const f = (y - b.minY) / (b.maxY - b.minY);
  const out = { ...b, ramp: undefined };
  switch (b.ramp) {
    case 'px': out.minX = b.minX + (b.maxX - b.minX) * f; break;
    case 'nx': out.maxX = b.maxX - (b.maxX - b.minX) * f; break;
    case 'pz': out.minZ = b.minZ + (b.maxZ - b.minZ) * f; break;
    case 'nz': out.maxZ = b.maxZ - (b.maxZ - b.minZ) * f; break;
  }
  return out;
}

/** Beschleunigungsraster + Abfragen über alle Kollisionselemente. */
export class Collider {
  readonly items: ColItem[];
  /** Impliziter Boden (alte Hallenkarten: 0) — darunter fällt nichts. */
  readonly floorY: number;
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly nx: number;
  readonly nz: number;
  private readonly cellStart: Int32Array;
  private readonly cellItems: Int32Array;
  private readonly stamps: Uint32Array;
  private stamp = 0;
  private readonly brute: boolean;

  constructor(items: ColItem[], opts: { floorY?: number; cell?: number } = {}) {
    this.items = items;
    this.floorY = opts.floorY ?? 0;
    this.cell = opts.cell ?? 4;
    this.stamps = new Uint32Array(items.length);
    this.brute = items.length < 24;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const b of items) {
      minX = Math.min(minX, b.minX); minZ = Math.min(minZ, b.minZ);
      maxX = Math.max(maxX, b.maxX); maxZ = Math.max(maxZ, b.maxZ);
    }
    if (!items.length) { minX = minZ = 0; maxX = maxZ = 1; }
    this.minX = minX - 1;
    this.minZ = minZ - 1;
    this.nx = Math.max(1, Math.ceil((maxX + 1 - this.minX) / this.cell));
    this.nz = Math.max(1, Math.ceil((maxZ + 1 - this.minZ) / this.cell));
    // CSR-Raster: erst zählen, dann füllen
    const counts = new Int32Array(this.nx * this.nz + 1);
    const span = (b: ColItem): [number, number, number, number] => [
      this.cx(b.minX), this.cx(b.maxX), this.cz(b.minZ), this.cz(b.maxZ),
    ];
    for (const b of items) {
      const [x0, x1, z0, z1] = span(b);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) counts[z * this.nx + x + 1]! += 1;
    }
    for (let i = 1; i < counts.length; i++) counts[i]! += counts[i - 1]!;
    this.cellStart = counts;
    this.cellItems = new Int32Array(counts[counts.length - 1]!);
    const fill = counts.slice(0, -1);
    items.forEach((b, i) => {
      const [x0, x1, z0, z1] = span(b);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.cellItems[fill[z * this.nx + x]!++] = i;
    });
  }

  private cx(x: number): number {
    return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
  }
  private cz(z: number): number {
    return Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
  }

  private nextStamp(): number {
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
    return this.stamp;
  }

  /** Alle Elemente (Maske), deren XZ-Fläche das Rechteck berührt. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, mask: number = COL.all, out: ColItem[] = []): ColItem[] {
    out.length = 0;
    if (this.brute) {
      for (const b of this.items) {
        if ((b.mask & mask) && b.maxX >= minX && b.minX <= maxX && b.maxZ >= minZ && b.minZ <= maxZ) out.push(b);
      }
      return out;
    }
    const s = this.nextStamp();
    const x0 = this.cx(minX), x1 = this.cx(maxX), z0 = this.cz(minZ), z1 = this.cz(maxZ);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const c = z * this.nx + x;
        for (let k = this.cellStart[c]!; k < this.cellStart[c + 1]!; k++) {
          const i = this.cellItems[k]!;
          if (this.stamps[i] === s) continue;
          this.stamps[i] = s;
          const b = this.items[i]!;
          if ((b.mask & mask) && b.maxX >= minX && b.minX <= maxX && b.maxZ >= minZ && b.minZ <= maxZ) out.push(b);
        }
      }
    }
    return out;
  }

  private readonly tmp: ColItem[] = [];

  /**
   * Bodenhöhe unter (x,z): höchste begehbare Oberkante im (verkleinerten) Fußabdruck,
   * die als Stufe erreichbar ist (≤ feetY + step). Sonst floorY.
   */
  groundHeight(x: number, z: number, feetY: number, radius: number, step: number): number {
    let ground = this.floorY;
    const r = radius * 0.6;
    for (const b of this.query(x - r, z - r, x + r, z + r, COL.move, this.tmp)) {
      if (x <= b.minX - r || x >= b.maxX + r || z <= b.minZ - r || z >= b.maxZ + r) continue;
      let top = topAt(b, x, z);
      // Zu steile Rampen: nur dort stehen, wo man ohnehin schon steht
      if (b.ramp && rampSlope(b) > MAX_WALK_SLOPE && top > feetY + 0.05) continue;
      if (b.ramp && top > b.maxY) top = b.maxY;
      if (top <= ground || top > feetY + step) continue;
      ground = top;
    }
    return ground;
  }

  /**
   * Blockierender Anteil eines Elements für einen Spieler mit Fußhöhe feetY
   * (Stufen ≤ step und Dinge über dem Kopf blockieren nicht). null = frei.
   */
  blocker(b: ColItem, feetY: number, height: number, step: number): ColItem | null {
    if (b.minY >= feetY + height - 1e-6) return null;
    const stepUp = b.ramp && rampSlope(b) > MAX_WALK_SLOPE ? 0.02 : step;
    return rampAbove(b, feetY + stepUp);
  }

  /** Schiebt die Position (XZ) aus allen blockierenden Elementen heraus (kleinste Eindringtiefe). */
  resolve(pos: { x: number; z: number }, radius: number, feetY: number, height: number, step: number): void {
    const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, COL.move, this.tmp).slice();
    for (const item of list) {
      const b = this.blocker(item, feetY, height, step);
      if (!b) continue;
      const minX = b.minX - radius, maxX = b.maxX + radius, minZ = b.minZ - radius, maxZ = b.maxZ + radius;
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        const dl = pos.x - minX, dr = maxX - pos.x, dt = pos.z - minZ, db = maxZ - pos.z;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) pos.x = minX;
        else if (m === dr) pos.x = maxX;
        else if (m === dt) pos.z = minZ;
        else pos.z = maxZ;
      }
    }
  }

  /** Unterkante des niedrigsten Hindernisses über den Füßen (Kopf-Kollision), sonst Infinity. */
  ceilingAbove(x: number, z: number, feetY: number, radius: number): number {
    let ceil = Infinity;
    const r = radius * 0.9;
    for (const b of this.query(x - r, z - r, x + r, z + r, COL.move, this.tmp)) {
      if (x <= b.minX - r || x >= b.maxX + r || z <= b.minZ - r || z >= b.maxZ + r) continue;
      if (b.minY > feetY + 0.3 && b.minY < ceil) ceil = b.minY;
    }
    return ceil;
  }

  /** Steht ein Zylinder (Radius, Höhe) an dieser Stelle in einem blockierenden Element? */
  blockedAt(x: number, z: number, feetY: number, radius: number, height: number, step: number): boolean {
    for (const item of this.query(x - radius, z - radius, x + radius, z + radius, COL.move, this.tmp)) {
      const b = this.blocker(item, feetY, height, step);
      if (!b) continue;
      if (x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius) return true;
    }
    return false;
  }

  /**
   * Strahl gegen alle Elemente der Maske (2D-DDA durch das XZ-Raster). Startet der
   * Strahl in einem Element, zählt dieses nicht. Liefert den nächsten Treffer ≤ maxT.
   */
  raycast(o: V3, d: V3, maxT: number, mask: number = COL.shot): RayHit | null {
    let best: RayHit | null = null;
    const test = (b: ColItem): void => {
      if (!(b.mask & mask)) return;
      const h = rayItem(o, d, b, best ? best.t : maxT);
      if (h) best = { t: h.t, normal: h.normal, item: b };
    };
    if (this.brute) {
      for (const b of this.items) test(b);
    } else {
      const s = this.nextStamp();
      // Strahl auf das Raster klemmen (XZ)
      const gx0 = this.minX, gz0 = this.minZ, gx1 = this.minX + this.nx * this.cell, gz1 = this.minZ + this.nz * this.cell;
      let t0 = 0, t1 = maxT;
      for (const [oo, dd, lo, hi] of [[o.x, d.x, gx0, gx1], [o.z, d.z, gz0, gz1]] as const) {
        if (Math.abs(dd) < 1e-12) {
          if (oo < lo || oo > hi) return null;
        } else {
          let a = (lo - oo) / dd, b = (hi - oo) / dd;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
        }
      }
      if (t0 > t1) return null;
      const px = o.x + d.x * t0, pz = o.z + d.z * t0;
      let ix = this.cx(px), iz = this.cz(pz);
      const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
      const tdx = Math.abs(d.x) > 1e-12 ? this.cell / Math.abs(d.x) : Infinity;
      const tdz = Math.abs(d.z) > 1e-12 ? this.cell / Math.abs(d.z) : Infinity;
      const nextX = this.minX + (ix + (stepX > 0 ? 1 : 0)) * this.cell;
      const nextZ = this.minZ + (iz + (stepZ > 0 ? 1 : 0)) * this.cell;
      let tmx = Math.abs(d.x) > 1e-12 ? (nextX - o.x) / d.x : Infinity;
      let tmz = Math.abs(d.z) > 1e-12 ? (nextZ - o.z) / d.z : Infinity;
      for (let guard = 0; guard < 4096; guard++) {
        const c = iz * this.nx + ix;
        for (let k = this.cellStart[c]!; k < this.cellStart[c + 1]!; k++) {
          const i = this.cellItems[k]!;
          if (this.stamps[i] === s) continue;
          this.stamps[i] = s;
          test(this.items[i]!);
        }
        const tExit = Math.min(tmx, tmz);
        if ((best && (best as RayHit).t <= tExit) || tExit > t1) break;
        if (tmx < tmz) {
          ix += stepX;
          tmx += tdx;
          if (ix < 0 || ix >= this.nx) break;
        } else {
          iz += stepZ;
          tmz += tdz;
          if (iz < 0 || iz >= this.nz) break;
        }
      }
    }
    // Impliziter Boden
    if (d.y < -1e-9 && o.y >= this.floorY) {
      const t = (this.floorY - o.y) / d.y;
      if (t >= 0 && t <= maxT && (!best || t < (best as RayHit).t)) best = { t, normal: { x: 0, y: 1, z: 0 }, item: null };
    }
    return best;
  }

  /** Freie Strecke a→b (keine Strahl-Kollision dazwischen)? */
  clear(a: V3, b: V3, mask: number = COL.shot): boolean {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const hit = this.raycast(a, { x: dx / len, y: dy / len, z: dz / len }, len, mask);
    return !hit || hit.t >= len - 1e-4;
  }

  /** Strahl-Schnittstelle für Kampf/Granaten (Treffer-Distanz + Normale). */
  castRay(o: V3, d: V3, maxT: number): { t: number; normal: V3 } | null {
    return this.raycast(o, d, maxT, COL.shot);
  }

  /** Oberfläche unter einem Punkt (Strahl nach unten, max. 3 m). */
  surfaceAt(x: number, y: number, z: number): Surface | null {
    const hit = this.raycast({ x, y: y + 0.2, z }, { x: 0, y: -1, z: 0 }, 3, COL.move | COL.shot);
    return hit?.item?.surface ?? null;
  }
}

/**
 * Strahl gegen Quader bzw. Keil (Kay-Kajiya über Ebenen). Liefert Eintritts-Distanz
 * (≥ 0, ≤ maxT) und Außennormale der Eintrittsfläche; null bei Fehlschuss oder wenn
 * der Ursprung im Element liegt.
 */
export function rayItem(o: V3, d: V3, b: ColItem, maxT: number): { t: number; normal: V3 } | null {
  let tEnter = -Infinity;
  let tExit = Infinity;
  let n: V3 = { x: 0, y: 1, z: 0 };
  const slab = (oo: number, dd: number, lo: number, hi: number, axis: 'x' | 'y' | 'z'): boolean => {
    if (Math.abs(dd) < 1e-12) return oo >= lo && oo <= hi;
    let a = (lo - oo) / dd, c = (hi - oo) / dd;
    let sign = -1;
    if (a > c) {
      [a, c] = [c, a];
      sign = 1;
    }
    if (a > tEnter) {
      tEnter = a;
      n = axis === 'x' ? { x: sign, y: 0, z: 0 } : axis === 'y' ? { x: 0, y: sign, z: 0 } : { x: 0, y: 0, z: sign };
    }
    if (c < tExit) tExit = c;
    return tEnter <= tExit;
  };
  if (!slab(o.x, d.x, b.minX, b.maxX, 'x')) return null;
  if (!slab(o.y, d.y, b.minY, b.maxY, 'y')) return null;
  if (!slab(o.z, d.z, b.minZ, b.maxZ, 'z')) return null;
  if (b.ramp) {
    // Schräge Ebene: y − minY − s·u ≤ 0 (u = Weg in Anstiegsrichtung)
    const h = b.maxY - b.minY;
    let nx = 0, nz = 0, run: number, base: number;
    switch (b.ramp) {
      case 'px': run = b.maxX - b.minX; nx = -h / run; base = -nx * b.minX; break;
      case 'nx': run = b.maxX - b.minX; nx = h / run; base = -nx * b.maxX; break;
      case 'pz': run = b.maxZ - b.minZ; nz = -h / run; base = -nz * b.minZ; break;
      default: run = b.maxZ - b.minZ; nz = h / run; base = -nz * b.maxZ; break;
    }
    // Ebene f(p) = nx·x + y + nz·z − minY + base = 0 (f > 0 = über der Schräge)
    const f0 = nx * o.x + o.y + nz * o.z - b.minY + base;
    const fd = nx * d.x + d.y + nz * d.z;
    const len = Math.hypot(nx, 1, nz);
    if (Math.abs(fd) < 1e-12) {
      if (f0 > 0) return null;
    } else {
      const t = -f0 / fd;
      if (fd < 0) {
        if (t > tEnter) {
          tEnter = t;
          n = { x: nx / len, y: 1 / len, z: nz / len };
        }
      } else if (t < tExit) tExit = t;
    }
    if (tEnter > tExit) return null;
  }
  if (tExit < 0 || tEnter < 0 || tEnter > maxT) return null;
  return { t: tEnter, normal: n };
}

/** Legacy-Hilfe: Quaderliste (alte SolidBox/Aabb-Form) als Collider (alles blockiert). */
const legacyCache = new WeakMap<object, Collider>();
export function colliderFor(boxes: readonly { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; kind?: string }[]): Collider {
  const hit = legacyCache.get(boxes);
  if (hit && hit.items.length === boxes.length) return hit;
  const c = new Collider(boxes.map((b) => ({ minX: b.minX, minY: b.minY, minZ: b.minZ, maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ, mask: b.kind === 'rail' ? COL.move : COL.all })), { floorY: 0 });
  legacyCache.set(boxes, c);
  return c;
}
