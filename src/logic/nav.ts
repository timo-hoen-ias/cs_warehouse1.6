import { COL, MAX_WALK_SLOPE, rampSlope, topAt, type Collider } from './collision';
import { PLAYER } from './move';

/**
 * 3D-Navigation (pure): Knoten-Raster auf allen begehbaren Oberflächen (Böden,
 * Plattformen, Laufstege, Rampen, Treppen-Clips, Containerdächer …) in mehreren
 * Höhen, verbunden über physikalische Begehbarkeit (dieselbe Boden-/Wandlogik wie
 * die Spielerbewegung). Abwärts-Kanten über Kanten sind einseitig (Herunterspringen).
 * A* mit Binär-Heap, Pfadglättung per Sichtlinie (String Pulling), nächster Knoten
 * über ein Raster-Hash, Callout-Bereiche als Knoten-Annotation + Bereichsgraph.
 */
export const NAV = {
  /** Rasterabstand (m). Durchgänge sollten ≥ 2 m breit sein. */
  spacing: 1,
  /** Freiraum-Radius der Knoten (etwas größer als der Spielerradius). */
  radius: 0.4,
  /** Größte Fallhöhe für Abwärts-Kanten (m). */
  maxDrop: 6,
  /** Höhe beim Ducken (Knoten nur geduckt erreichbar). */
  crouchHeight: 1.2,
  /** Hash-Zelle (m) für die Knotensuche. */
  cell: 4,
  /**
   * Wandabstand: Aufschlag auf die Kantenkosten beim Betreten eines Knotens am Rand der begehbaren
   * Fläche (Wand, Kiste, Plattformkante) bzw. eine Reihe dahinter. Wege laufen so durch die Mitte von
   * Gängen und Türen und nehmen Ecken weiter, statt an Wänden entlangzuschrammen.
   */
  wallCost: [0.6, 0.2] as readonly number[],
  /** Freiraum der geglätteten Wegstrecken (m): Abkürzungen streifen keine Kistenecken mehr. */
  smoothRadius: 0.6,
} as const;

export const NAV_FLAG = { cover: 1, choke: 2, high: 4, crouch: 8 } as const;
export const EDGE = { walk: 1, drop: 2 } as const;

export type XYZ = { x: number; y: number; z: number };

export type NavAreaDef = { name: string; min: [number, number, number]; max: [number, number, number] };

export type NavArea = {
  id: number;
  name: string;
  /** Repräsentativer Knoten nahe dem Schwerpunkt. */
  center: XYZ;
  centerNode: number;
  nodeCount: number;
  /** Benachbarte Bereiche (über Kanten verbunden). */
  neighbors: number[];
  min: [number, number, number];
  max: [number, number, number];
};

export type NavGraph = {
  count: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  flags: Uint8Array;
  /** Abstand zum Rand der begehbaren Fläche in Knotenreihen (0 = Randknoten, gedeckelt bei `NAV.wallCost.length`). */
  rim: Uint8Array;
  /** Bereichs-Index je Knoten (−1 = keiner). */
  area: Int16Array;
  edgeStart: Int32Array;
  edgeTo: Int32Array;
  edgeCost: Float32Array;
  edgeKind: Uint8Array;
  areas: NavArea[];
  /** Raster-Hash (CSR) für nearestNode. */
  hashMinX: number;
  hashMinZ: number;
  hashNx: number;
  hashNz: number;
  hashStart: Int32Array;
  hashNodes: Int32Array;
};

const STEP = PLAYER.step;
const BODY_R = PLAYER.radius;

/**
 * Begehbarkeit a → b nach den Bewegungsregeln: kleine Schritte entlang der Strecke,
 * Boden je Schritt (Stufen/Rampen), Wände blockieren; fällt die Strecke über eine Kante
 * ab, ist es eine Abwärts-Kante. 0 = nicht begehbar.
 */
export function traverse(col: Collider, a: XYZ, b: XYZ, height: number = PLAYER.height, radius: number = BODY_R): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const n = Math.max(2, Math.ceil(dist / 0.25));
  let feet = a.y;
  let kind: number = EDGE.walk;
  for (let i = 1; i <= n; i++) {
    const x = a.x + (dx * i) / n;
    const z = a.z + (dz * i) / n;
    if (col.blockedAt(x, z, feet, radius, height, STEP)) return 0;
    const g = col.groundHeight(x, z, feet, BODY_R, STEP);
    if (g < feet - STEP - 1e-6) {
      if (feet - g > NAV.maxDrop) return 0;
      kind = EDGE.drop;
    }
    feet = g;
  }
  return Math.abs(feet - b.y) < 0.2 ? kind : 0;
}

type Cand = { x: number; y: number; z: number; ix: number; iz: number; flags: number };

/** Baut den Navigationsgraphen aus allen begehbaren Oberflächen des Colliders. */
export function buildNav(col: Collider, areaDefs: NavAreaDef[] = []): NavGraph {
  const S = NAV.spacing;
  const columns = new Map<number, number[]>();
  const nodes: Cand[] = [];
  const key = (ix: number, iz: number): number => (ix + 32768) * 65536 + (iz + 32768);

  // 1) Kandidaten je begehbarer Oberfläche
  for (const it of col.items) {
    if (!(it.mask & COL.move) || it.noNav) continue;
    if (it.ramp && rampSlope(it) > MAX_WALK_SLOPE) continue;
    if (it.maxX - it.minX < 0.3 || it.maxZ - it.minZ < 0.3) continue;
    const ix0 = Math.ceil(it.minX / S - 0.5);
    const ix1 = Math.floor(it.maxX / S - 0.5);
    const iz0 = Math.ceil(it.minZ / S - 0.5);
    const iz1 = Math.floor(it.maxZ / S - 0.5);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = (ix + 0.5) * S;
        const z = (iz + 0.5) * S;
        const h = topAt(it, x, z);
        const k = key(ix, iz);
        const col0 = columns.get(k);
        if (col0?.some((i) => Math.abs(nodes[i]!.y - h) < 0.3)) continue;
        const g = col.groundHeight(x, z, h + 0.01, BODY_R, STEP);
        if (Math.abs(g - h) > 0.06) continue;
        let flags = 0;
        if (col.blockedAt(x, z, h, NAV.radius, PLAYER.height, STEP)) {
          if (col.blockedAt(x, z, h, NAV.radius, NAV.crouchHeight, STEP)) continue;
          flags |= NAV_FLAG.crouch;
        }
        const id = nodes.length;
        nodes.push({ x, y: h, z, ix, iz, flags });
        if (col0) col0.push(id);
        else columns.set(k, [id]);
      }
    }
  }

  // 2) Kanten (8er-Nachbarschaft, alle Höhen der Nachbarspalte)
  const adj: { to: number; cost: number; kind: number }[][] = nodes.map(() => []);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    const height = a.flags & NAV_FLAG.crouch ? NAV.crouchHeight : PLAYER.height;
    for (const [dx, dz] of dirs) {
      const list = columns.get(key(a.ix + dx, a.iz + dz));
      if (!list) continue;
      for (const j of list) {
        const b = nodes[j]!;
        if (b.y > a.y + STEP + S * 1.5 * MAX_WALK_SLOPE || b.y < a.y - NAV.maxDrop) continue;
        const kind = traverse(col, a, b, (b.flags & NAV_FLAG.crouch) ? NAV.crouchHeight : height);
        if (!kind) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const cost = kind === EDGE.drop ? d + 1.5 + (a.y - b.y) * 0.3 : d * (b.flags & NAV_FLAG.crouch ? 2.5 : 1);
        adj[i]!.push({ to: j, cost, kind });
      }
    }
  }

  const count = nodes.length;
  const g: NavGraph = {
    count,
    x: Float32Array.from(nodes, (n) => n.x),
    y: Float32Array.from(nodes, (n) => n.y),
    z: Float32Array.from(nodes, (n) => n.z),
    flags: Uint8Array.from(nodes, (n) => n.flags),
    rim: new Uint8Array(count),
    area: new Int16Array(count).fill(-1),
    edgeStart: new Int32Array(count + 1),
    edgeTo: new Int32Array(adj.reduce((s, l) => s + l.length, 0)),
    edgeCost: new Float32Array(adj.reduce((s, l) => s + l.length, 0)),
    edgeKind: new Uint8Array(adj.reduce((s, l) => s + l.length, 0)),
    areas: [],
    hashMinX: 0, hashMinZ: 0, hashNx: 1, hashNz: 1, hashStart: new Int32Array(2), hashNodes: new Int32Array(0),
  };
  let e = 0;
  for (let i = 0; i < count; i++) {
    g.edgeStart[i] = e;
    for (const ed of adj[i]!) {
      g.edgeTo[e] = ed.to;
      g.edgeCost[e] = ed.cost;
      g.edgeKind[e] = ed.kind;
      e++;
    }
  }
  g.edgeStart[count] = e;
  computeRim(g);
  buildHash(g);
  annotate(g, col);
  assignAreas(g, areaDefs);
  return g;
}

/**
 * Randabstand je Knoten: Randknoten haben nicht alle acht Nachbarn über ebene Lauf-Kanten
 * (Wand, Hindernis, Kante); von dort per Breitensuche über Lauf-Kanten weiter nach innen.
 */
export function computeRim(g: NavGraph): void {
  const cap = NAV.wallCost.length;
  g.rim.fill(cap);
  const queue = new Int32Array(g.count);
  let head = 0, tail = 0;
  for (let i = 0; i < g.count; i++) {
    let n = 0;
    for (let k = g.edgeStart[i]!; k < g.edgeStart[i + 1]!; k++) if (g.edgeKind[k] === EDGE.walk) n++;
    if (n < 8) {
      g.rim[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const cur = queue[head++]!;
    const r = g.rim[cur]! + 1;
    if (r >= cap) continue;
    for (let k = g.edgeStart[cur]!; k < g.edgeStart[cur + 1]!; k++) {
      const nb = g.edgeTo[k]!;
      if (g.edgeKind[k] !== EDGE.walk || g.rim[nb]! <= r) continue;
      g.rim[nb] = r;
      queue[tail++] = nb;
    }
  }
}

function buildHash(g: NavGraph): void {
  if (!g.count) return;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < g.count; i++) {
    minX = Math.min(minX, g.x[i]!); maxX = Math.max(maxX, g.x[i]!);
    minZ = Math.min(minZ, g.z[i]!); maxZ = Math.max(maxZ, g.z[i]!);
  }
  g.hashMinX = minX - 1;
  g.hashMinZ = minZ - 1;
  g.hashNx = Math.max(1, Math.ceil((maxX + 1 - g.hashMinX) / NAV.cell));
  g.hashNz = Math.max(1, Math.ceil((maxZ + 1 - g.hashMinZ) / NAV.cell));
  const counts = new Int32Array(g.hashNx * g.hashNz + 1);
  const cellOf = (i: number): number => Math.floor((g.z[i]! - g.hashMinZ) / NAV.cell) * g.hashNx + Math.floor((g.x[i]! - g.hashMinX) / NAV.cell);
  for (let i = 0; i < g.count; i++) counts[cellOf(i) + 1]! += 1;
  for (let i = 1; i < counts.length; i++) counts[i]! += counts[i - 1]!;
  g.hashStart = counts;
  g.hashNodes = new Int32Array(g.count);
  const fill = counts.slice(0, -1);
  for (let i = 0; i < g.count; i++) g.hashNodes[fill[cellOf(i)]!++] = i;
}

/** Ruft cb für alle Knoten im XZ-Umkreis r auf. */
export function forNodesNear(g: NavGraph, x: number, z: number, r: number, cb: (i: number) => void): void {
  if (!g.count) return;
  const cx0 = Math.max(0, Math.floor((x - r - g.hashMinX) / NAV.cell));
  const cx1 = Math.min(g.hashNx - 1, Math.floor((x + r - g.hashMinX) / NAV.cell));
  const cz0 = Math.max(0, Math.floor((z - r - g.hashMinZ) / NAV.cell));
  const cz1 = Math.min(g.hashNz - 1, Math.floor((z + r - g.hashMinZ) / NAV.cell));
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = cz * g.hashNx + cx;
      for (let k = g.hashStart[c]!; k < g.hashStart[c + 1]!; k++) {
        const i = g.hashNodes[k]!;
        if ((g.x[i]! - x) ** 2 + (g.z[i]! - z) ** 2 <= r * r) cb(i);
      }
    }
  }
}

/**
 * Nächster Knoten zu einer Position (bevorzugt gleiche Höhe; Knoten deutlich über dem
 * Kopf zählen kaum). −1, wenn im Umkreis maxDist keiner liegt.
 */
export function nearestNode(g: NavGraph, x: number, y: number, z: number, maxDist = 8): number {
  let best = -1;
  let bestScore = Infinity;
  forNodesNear(g, x, z, maxDist, (i) => {
    const dy = g.y[i]! - y;
    const vertical = dy > 1.2 ? dy * 10 : dy < -0.6 ? -dy * 3 : Math.abs(dy);
    const s = (g.x[i]! - x) ** 2 + (g.z[i]! - z) ** 2 + vertical * vertical;
    if (s < bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

/** Flags: Deckung (Hindernis auf Körperhöhe daneben), Engstelle, erhöhte Position. */
function annotate(g: NavGraph, col: Collider): void {
  const d8 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let i = 0; i < g.count; i++) {
    const x = g.x[i]!, y = g.y[i]!, z = g.z[i]!;
    for (const [dx, dz] of d8) {
      if (col.blockedAt(x + dx * 1.0, z + dz * 1.0, y, 0.35, 1.3, STEP)) {
        g.flags[i]! |= NAV_FLAG.cover;
        break;
      }
    }
    // Engstelle: freie Breite entlang X bzw. Z (zusammenhängende Knoten gleicher Höhe) ≤ 3 m bei langer Gegenrichtung
    const run = (dx: number, dz: number): number => {
      let n = 0;
      for (let k = 1; k <= 6; k++) {
        let found = false;
        forNodesNear(g, x + dx * k * NAV.spacing, z + dz * k * NAV.spacing, 0.2, (j) => {
          if (Math.abs(g.y[j]! - y) < 0.4) found = true;
        });
        if (!found) break;
        n++;
      }
      return n;
    };
    const wx = 1 + run(1, 0) + run(-1, 0);
    const wz = 1 + run(0, 1) + run(0, -1);
    let lowest = y;
    forNodesNear(g, x, z, 6, (j) => {
      lowest = Math.min(lowest, g.y[j]!);
    });
    if (Math.min(wx, wz) <= 3 && Math.max(wx, wz) >= 5) g.flags[i]! |= NAV_FLAG.choke;
    if (y - lowest >= 1.5) g.flags[i]! |= NAV_FLAG.high;
  }
}

function assignAreas(g: NavGraph, defs: NavAreaDef[]): void {
  const vol = (d: NavAreaDef): number => (d.max[0] - d.min[0]) * (d.max[1] - d.min[1]) * (d.max[2] - d.min[2]);
  for (let i = 0; i < g.count; i++) {
    let best = -1;
    for (let a = 0; a < defs.length; a++) {
      const d = defs[a]!;
      const x = g.x[i]!, y = g.y[i]! + 0.5, z = g.z[i]!;
      if (x < d.min[0] || x > d.max[0] || y < d.min[1] || y > d.max[1] || z < d.min[2] || z > d.max[2]) continue;
      if (best < 0 || vol(d) < vol(defs[best]!)) best = a;
    }
    g.area[i] = best;
  }
  // Knoten ohne Bereich: vom Nachbarn übernehmen (Wellenfront über Kanten)
  if (defs.length) {
    let changed = true;
    for (let pass = 0; changed && pass < 64; pass++) {
      changed = false;
      for (let i = 0; i < g.count; i++) {
        if (g.area[i]! >= 0) continue;
        for (let k = g.edgeStart[i]!; k < g.edgeStart[i + 1]!; k++) {
          const a = g.area[g.edgeTo[k]!]!;
          if (a >= 0) {
            g.area[i] = a;
            changed = true;
            break;
          }
        }
      }
    }
  }
  const sums = defs.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
  const nb = defs.map(() => new Set<number>());
  for (let i = 0; i < g.count; i++) {
    const a = g.area[i]!;
    if (a < 0) continue;
    const s = sums[a]!;
    s.x += g.x[i]!; s.y += g.y[i]!; s.z += g.z[i]!; s.n++;
    for (let k = g.edgeStart[i]!; k < g.edgeStart[i + 1]!; k++) {
      const b = g.area[g.edgeTo[k]!]!;
      if (b >= 0 && b !== a) nb[a]!.add(b);
    }
  }
  g.areas = defs.map((d, id) => {
    const s = sums[id]!;
    const c = s.n ? { x: s.x / s.n, y: s.y / s.n, z: s.z / s.n } : { x: (d.min[0] + d.max[0]) / 2, y: d.min[1], z: (d.min[2] + d.max[2]) / 2 };
    // Zentrum = Knoten des Bereichs, der dem Schwerpunkt am nächsten liegt
    let centerNode = -1;
    let bd = Infinity;
    for (let i = 0; i < g.count; i++) {
      if (g.area[i] !== id) continue;
      const dd = (g.x[i]! - c.x) ** 2 + (g.y[i]! - c.y) ** 2 * 4 + (g.z[i]! - c.z) ** 2;
      if (dd < bd) {
        bd = dd;
        centerNode = i;
      }
    }
    const center = centerNode >= 0 ? { x: g.x[centerNode]!, y: g.y[centerNode]!, z: g.z[centerNode]! } : c;
    return { id, name: d.name, center, centerNode, nodeCount: s.n, neighbors: [...nb[id]!].sort((p, q) => p - q), min: d.min, max: d.max };
  });
}

/** Bereich (Callout) an einer Position: Name oder null. */
export function areaAt(g: NavGraph, pos: XYZ): NavArea | null {
  const n = nearestNode(g, pos.x, pos.y, pos.z, 6);
  if (n < 0) return null;
  const a = g.area[n]!;
  return a >= 0 ? g.areas[a] ?? null : null;
}

/** Ausweich-Zone: Knoten im Radius kosten extra (z. B. bekannte Gegnerposition, Rauch). */
export type Avoid = { x: number; y: number; z: number; r: number; cost: number };
export type PathOpts = {
  avoid?: Avoid[];
  allowCrouch?: boolean;
  maxExpand?: number;
  /** Kürzester Knotenweg ohne Wandabstand (Laufzeit-Messungen der Kartenregeln). */
  hugWalls?: boolean;
};
export type NavPath = { nodes: number[]; points: XYZ[]; length: number };

// Wiederverwendbare Suchpuffer je Graph
const buffers = new WeakMap<NavGraph, { g: Float32Array; f: Float32Array; from: Int32Array; stamp: Uint32Array; closed: Uint32Array; gen: number; heap: Int32Array }>();

/** A* (Binär-Heap) zwischen zwei Knoten. Leeres Array, wenn nicht erreichbar. */
export function astar(g: NavGraph, start: number, goal: number, opts: PathOpts = {}): number[] {
  if (start < 0 || goal < 0) return [];
  if (start === goal) return [start];
  let buf = buffers.get(g);
  if (!buf) {
    buf = { g: new Float32Array(g.count), f: new Float32Array(g.count), from: new Int32Array(g.count), stamp: new Uint32Array(g.count), closed: new Uint32Array(g.count), gen: 0, heap: new Int32Array(Math.max(16, g.count)) };
    buffers.set(g, buf);
  }
  const B = buf;
  B.gen += 1;
  const gen = B.gen;
  const gx = g.x[goal]!, gy = g.y[goal]!, gz = g.z[goal]!;
  const h = (i: number): number => Math.hypot(g.x[i]! - gx, (g.y[i]! - gy) * 1.2, g.z[i]! - gz);
  const avoid = opts.avoid ?? [];
  const extra = (i: number): number => {
    let c = 0;
    for (const a of avoid) {
      const d = Math.hypot(g.x[i]! - a.x, g.y[i]! - a.y, g.z[i]! - a.z);
      if (d < a.r) c += a.cost * (1 - d / a.r);
    }
    return c;
  };
  const wall = opts.hugWalls ? [] : NAV.wallCost;
  let size = 0;
  const less = (a: number, b: number): boolean => B.f[a]! < B.f[b]!;
  const push = (i: number): void => {
    if (size >= B.heap.length) {
      const bigger = new Int32Array(B.heap.length * 2);
      bigger.set(B.heap);
      B.heap = bigger;
      return push(i);
    }
    let k = size++;
    B.heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!less(B.heap[k]!, B.heap[p]!)) break;
      const t = B.heap[k]!;
      B.heap[k] = B.heap[p]!;
      B.heap[p] = t;
      k = p;
    }
  };
  const pop = (): number => {
    const H = B.heap;
    const top = H[0]!;
    H[0] = H[--size]!;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < size && less(H[l]!, H[m]!)) m = l;
      if (r < size && less(H[r]!, H[m]!)) m = r;
      if (m === k) break;
      const t = H[k]!;
      H[k] = H[m]!;
      H[m] = t;
      k = m;
    }
    return top;
  };
  B.stamp[start] = gen;
  B.g[start] = 0;
  B.f[start] = h(start);
  B.from[start] = -1;
  push(start);
  let expanded = 0;
  const maxExpand = opts.maxExpand ?? g.count;
  while (size > 0) {
    const cur = pop();
    if (B.closed[cur] === gen) continue;
    B.closed[cur] = gen;
    if (cur === goal) {
      const out: number[] = [];
      for (let i = goal; i >= 0; i = B.from[i]!) out.push(i);
      return out.reverse();
    }
    if (++expanded > maxExpand) break;
    for (let k = g.edgeStart[cur]!; k < g.edgeStart[cur + 1]!; k++) {
      const nb = g.edgeTo[k]!;
      if (B.closed[nb] === gen) continue;
      if (!opts.allowCrouch && (g.flags[nb]! & NAV_FLAG.crouch)) continue;
      const ec = g.edgeCost[k]!;
      const cost = B.g[cur]! + ec * (1 + (wall[g.rim[nb]!] ?? 0)) + (avoid.length ? extra(nb) : 0);
      if (B.stamp[nb] === gen && cost >= B.g[nb]!) continue;
      B.stamp[nb] = gen;
      B.g[nb] = cost;
      B.f[nb] = cost + h(nb);
      B.from[nb] = cur;
      push(nb);
    }
  }
  return [];
}

/** Länge einer Punktfolge (3D). */
export function pathLength(points: XYZ[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y, points[i]!.z - points[i - 1]!.z);
  return s;
}

/**
 * Glättet eine Knotenfolge (String Pulling): von jedem Ankerpunkt aus wird der
 * weiteste noch direkt begehbare Knoten angesteuert (Suchweite halbiert sich).
 * Abkürzungen brauchen den Freiraum `NAV.smoothRadius`, damit sie Ecken nicht streifen.
 */
export function smoothPath(g: NavGraph, col: Collider, nodes: number[], from?: XYZ): XYZ[] {
  const P = (i: number): XYZ => ({ x: g.x[i]!, y: g.y[i]!, z: g.z[i]! });
  if (!nodes.length) return [];
  const out: XYZ[] = [];
  let anchor = from ?? P(nodes[0]!);
  let i = 0;
  while (i < nodes.length - 1) {
    let step = Math.min(16, nodes.length - 1 - i);
    let next = i + 1;
    while (step >= 1) {
      const j = i + step;
      if (traverse(col, anchor, P(nodes[j]!), PLAYER.height, step > 1 ? NAV.smoothRadius : BODY_R) === EDGE.walk) {
        next = j;
        break;
      }
      step = step === 1 ? 0 : Math.max(1, Math.floor(step / 2));
    }
    // Abwärts-Kanten nicht abkürzen
    const p = P(nodes[next]!);
    out.push(p);
    anchor = p;
    i = next;
  }
  if (!out.length) out.push(P(nodes[0]!));
  return out;
}

/** Pfad von Position zu Position (nächste Knoten, A*, Glättung). null = unerreichbar. */
export function findPath(g: NavGraph, col: Collider, from: XYZ, to: XYZ, opts: PathOpts = {}): NavPath | null {
  const a = nearestNode(g, from.x, from.y, from.z);
  const b = nearestNode(g, to.x, to.y, to.z);
  if (a < 0 || b < 0) return null;
  const nodes = astar(g, a, b, opts);
  if (!nodes.length) return null;
  const points = smoothPath(g, col, nodes, from);
  return { nodes, points, length: pathLength([from, ...points]) };
}

/** Knotenweg-Länge (ohne Glättung) zwischen zwei Positionen — für Zeitmessungen. */
export function routeLength(g: NavGraph, from: XYZ, to: XYZ, opts: PathOpts = {}): number {
  const a = nearestNode(g, from.x, from.y, from.z);
  const b = nearestNode(g, to.x, to.y, to.z);
  const nodes = astar(g, a, b, { hugWalls: true, ...opts });
  if (!nodes.length) return Infinity;
  const pts = nodes.map((i) => ({ x: g.x[i]!, y: g.y[i]!, z: g.z[i]! }));
  return pathLength(pts);
}

/** Alle von einem Knoten aus erreichbaren Knoten (BFS über gerichtete Kanten). */
export function reachableFrom(g: NavGraph, start: number): Uint8Array {
  const seen = new Uint8Array(g.count);
  if (start < 0) return seen;
  const queue = new Int32Array(g.count);
  let head = 0, tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const cur = queue[head++]!;
    for (let k = g.edgeStart[cur]!; k < g.edgeStart[cur + 1]!; k++) {
      const nb = g.edgeTo[k]!;
      if (!seen[nb]) {
        seen[nb] = 1;
        queue[tail++] = nb;
      }
    }
  }
  return seen;
}
