import type { Collider } from './collision';
import type { Team } from './economy';
import type { BotHint, Site, Spawn } from './mapkit';
import { NAV_FLAG, astar, forNodesNear, nearestNode, type NavGraph, type XYZ } from './nav';
import { PLAYER } from './move';

/**
 * Karten-Analyse für taktische Bots (pure, einmal je Karte, kartenunabhängig).
 *
 * Alles wird aus Navigation, Kollision, Spots und Spawns abgeleitet:
 * - **Zonen**: die Callout-Bereiche der Karte (oder automatische Cluster, falls eine
 *   Karte keine Bereiche hat) und **Portale** (Durchgänge) zwischen ihnen,
 * - **Distanzfelder** von den T- und CT-Spawns (wer ist wo zuerst?),
 * - **Spots** mit ihren Eingängen (welche Portale führen von T- bzw. CT-Seite hinein),
 * - **Routen** je Team und Spot: mehrere *verschiedene* Wege (lang/kurz/Mitte/Tunnel)
 *   über unterschiedliche Zonen, mit Bereitstellungsraum vor dem Eingang und dem
 *   **umkämpften Punkt** (wo beide Teams etwa gleichzeitig ankommen),
 * - **Halte-Positionen**: Knoten mit Deckung und Sichtlinie auf einen Eingang/Punkt,
 *   von der eigenen Seite aus, bevorzugt erhöht und nicht im Freien.
 *
 * Optionale Karten-Hinweise (`MapData.botHints`) werten Positionen auf, sind aber nie
 * nötig. Kein three/Needle-Import.
 */

export type SiteId = 'a' | 'b';

/** Durchgang von Zone `from` nach Zone `to` (eine Öffnung; mehrere Öffnungen = mehrere Portale). */
export type Portal = {
  id: number;
  from: number;
  to: number;
  pos: XYZ;
  /** Breite (Anzahl Randknoten ≈ Meter). */
  width: number;
  /** Randknoten auf der Ausgangs- bzw. Zielseite. */
  fromNode: number;
  toNode: number;
  /** Durchgangsrichtung (XZ, normiert) von `from` nach `to`. */
  dir: { x: number; z: number };
};

export type Zone = {
  id: number;
  name: string;
  center: XYZ;
  centerNode: number;
  nodeCount: number;
  /** Ausgehende Portale. */
  out: number[];
  /** Eingehende Portale. */
  in: number[];
  site: SiteId | null;
  /** Zone enthält Spawns dieses Teams. */
  spawn: Team | null;
};

export type SiteInfo = {
  id: SiteId;
  name: string;
  plant: XYZ;
  plantNode: number;
  min: [number, number, number];
  max: [number, number, number];
  zones: number[];
  /** Portale von außen in die Spot-Zonen. */
  entrances: number[];
};

export type Route = {
  id: number;
  team: Team;
  site: SiteId;
  zones: number[];
  /** Portale in Laufreihenfolge. */
  portals: number[];
  /** Wegpunkte (Portalmitten) — der Bot plant abschnittsweise dazwischen. */
  via: XYZ[];
  /** Geschätzte Länge (m). */
  length: number;
  /** Portal in den Spot (letztes Portal), −1 falls Start im Spot. */
  entry: number;
  /** Knotenweg (nur T-Routen; für Bereitstellung und umkämpften Punkt). */
  nodes: number[];
  /** Bereitstellungsraum vor dem Eingang (Deckung, möglichst ohne Sicht vom Spot). */
  staging: XYZ;
  /** Umkämpfter Punkt (beide Teams ≈ gleichzeitig) oder null. */
  contested: XYZ | null;
  /** Von hier kommen die T zum umkämpften Punkt (Anlaufpunkt ~6 m davor). */
  contestedFrom: XYZ | null;
  /** Kontrollpunkt der eigenen Seite kurz vor dem umkämpften Punkt. */
  control: XYZ | null;
  /** Lesbarer Name (Zonennamen), z. B. „Außen Lang › Lang-Tor › … › A-Plattform“. */
  label: string;
};

export type HoldSpot = {
  node: number;
  pos: XYZ;
  score: number;
  /** Abstand zum beobachteten Punkt (m). */
  dist: number;
  /** Sicht auch geduckt frei → geduckt halten möglich. */
  crouch: boolean;
  high: boolean;
  cover: boolean;
};

export type BotMapInfo = {
  nav: NavGraph;
  col: Collider;
  /** Zone je Navigationsknoten (−1 = keine). */
  zoneOf: Int16Array;
  zones: Zone[];
  portals: Portal[];
  /** Laufdistanz (m) vom jeweiligen Spawn zu jedem Knoten (Infinity = unerreichbar). */
  dist: Record<Team, Float32Array>;
  spawn: Record<Team, XYZ>;
  sites: SiteInfo[];
  routes: Route[];
  hints: BotHint[];
  /** Caches (Halte-Positionen, Granatenwürfe …), füllen sich bei Bedarf. */
  cache: Map<string, unknown>;
};

export const BOTMAP = {
  /** Augenhöhe stehend/geduckt für Sichtprüfungen. */
  eye: PLAYER.eye - 0.05,
  crouchEye: PLAYER.crouchEye - 0.05,
  /** Zielhöhe (Brust) am beobachteten Punkt. */
  watchY: 1.2,
  /** Rasterweite automatischer Zonen (m), falls eine Karte keine Callouts hat. */
  autoCell: 14,
  /** Routen je Spot und Team (vor dem Aussortieren). */
  routeTries: 7,
  /** Routen länger als dieser Faktor × kürzeste fallen weg. */
  routeSlack: 1.75,
  /** Halteposition: Entfernung zum beobachteten Punkt (m). */
  holdMin: 5,
  holdMax: 32,
  /**
   * Halte-Position mit Sicht auf einen *weiteren* Eingang: Abzug je Eingang (man wird von der Seite/aus dem
   * Rücken erwischt — CS-Halter wählen Winkel, die nur einen Eingang zeigen).
   */
  exposedPenalty: 3.5,
  /** Sprinttempo für Zeitabschätzungen (m/s). */
  speed: PLAYER.sprintSpeed,
} as const;

const P = (g: NavGraph, i: number): XYZ => ({ x: g.x[i]!, y: g.y[i]!, z: g.z[i]! });
const d3 = (a: XYZ, b: XYZ): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const d2 = (a: XYZ, b: XYZ): number => Math.hypot(a.x - b.x, a.z - b.z);

export const enemyOf = (t: Team): Team => (t === 'T' ? 'CT' : 'T');

// ----------------------------------------------------------------------------- Zonen

/** Zonen aus den Callout-Bereichen der Navigation, sonst automatische Cluster. */
export function buildZones(g: NavGraph): { zoneOf: Int16Array; names: string[] } {
  let covered = 0;
  for (let i = 0; i < g.count; i++) if (g.area[i]! >= 0) covered++;
  if (g.areas.length >= 3 && covered >= g.count * 0.9) {
    return { zoneOf: Int16Array.from(g.area), names: g.areas.map((a) => a.name) };
  }
  // Automatisch: Rasterzelle × Höhenband, darin zusammenhängende Knoten
  const zoneOf = new Int16Array(g.count).fill(-1);
  const C = BOTMAP.autoCell;
  const keyOf = (i: number): string => `${Math.floor(g.x[i]! / C)},${Math.floor(g.z[i]! / C)},${Math.floor(g.y[i]! / 3)}`;
  const names: string[] = [];
  for (let s = 0; s < g.count; s++) {
    if (zoneOf[s]! >= 0) continue;
    const id = names.length;
    names.push(`Zone ${id + 1}`);
    const key = keyOf(s);
    const stack = [s];
    zoneOf[s] = id;
    while (stack.length) {
      const c = stack.pop()!;
      for (let k = g.edgeStart[c]!; k < g.edgeStart[c + 1]!; k++) {
        const n = g.edgeTo[k]!;
        if (zoneOf[n]! < 0 && keyOf(n) === key) {
          zoneOf[n] = id;
          stack.push(n);
        }
      }
    }
  }
  return { zoneOf, names };
}

/**
 * Portale: Kanten zwischen verschiedenen Zonen, je Zonenpaar nach Öffnungen
 * getrennt (Randknoten, die > 2.5 m auseinander liegen, sind eine andere Öffnung).
 */
export function buildPortals(g: NavGraph, zoneOf: Int16Array): Portal[] {
  const groups = new Map<string, { a: number; b: number; edges: [number, number][] }>();
  for (let i = 0; i < g.count; i++) {
    const za = zoneOf[i]!;
    if (za < 0) continue;
    for (let k = g.edgeStart[i]!; k < g.edgeStart[i + 1]!; k++) {
      const j = g.edgeTo[k]!;
      const zb = zoneOf[j]!;
      if (zb < 0 || zb === za) continue;
      const key = `${za}>${zb}`;
      let grp = groups.get(key);
      if (!grp) groups.set(key, (grp = { a: za, b: zb, edges: [] }));
      grp.edges.push([i, j]);
    }
  }
  const out: Portal[] = [];
  for (const grp of [...groups.values()].sort((p, q) => p.a - q.a || p.b - q.b)) {
    // Einfaches Single-Linkage-Clustering der Randknoten
    const srcs = [...new Set(grp.edges.map((e) => e[0]))];
    const label = new Map<number, number>();
    let nextLabel = 0;
    for (const s of srcs) {
      if (label.has(s)) continue;
      const lab = nextLabel++;
      label.set(s, lab);
      const stack = [s];
      while (stack.length) {
        const c = stack.pop()!;
        for (const o of srcs) {
          if (label.has(o)) continue;
          if (Math.hypot(g.x[o]! - g.x[c]!, g.z[o]! - g.z[c]!) <= 2.5 && Math.abs(g.y[o]! - g.y[c]!) < 1.5) {
            label.set(o, lab);
            stack.push(o);
          }
        }
      }
    }
    for (let lab = 0; lab < nextLabel; lab++) {
      const edges = grp.edges.filter((e) => label.get(e[0]) === lab);
      let x = 0, y = 0, z = 0;
      for (const [i, j] of edges) {
        x += (g.x[i]! + g.x[j]!) / 2;
        y += (g.y[i]! + g.y[j]!) / 2;
        z += (g.z[i]! + g.z[j]!) / 2;
      }
      const n = edges.length;
      const pos = { x: x / n, y: y / n, z: z / n };
      let dx = 0, dz = 0;
      for (const [i, j] of edges) {
        const l = Math.hypot(g.x[j]! - g.x[i]!, g.z[j]! - g.z[i]!) || 1;
        dx += (g.x[j]! - g.x[i]!) / l;
        dz += (g.z[j]! - g.z[i]!) / l;
      }
      const dl = Math.hypot(dx, dz) || 1;
      let fromNode = edges[0]![0], toNode = edges[0]![1], bf = Infinity, bt = Infinity;
      for (const [i, j] of edges) {
        const di = d3(P(g, i), pos);
        const dj = d3(P(g, j), pos);
        if (di < bf) { bf = di; fromNode = i; }
        if (dj < bt) { bt = dj; toNode = j; }
      }
      // Portalpunkt auf einen echten Knoten legen (Mittelwert kann in einer Säule liegen)
      out.push({ id: out.length, from: grp.a, to: grp.b, pos: P(g, toNode), width: new Set(edges.map((e) => e[0])).size, fromNode, toNode, dir: { x: dx / dl, z: dz / dl } });
    }
  }
  return out;
}

/** Dijkstra-Distanz (m, über gerichtete Kanten) von mehreren Startknoten. */
export function distanceField(g: NavGraph, starts: number[]): Float32Array {
  const dist = new Float64Array(g.count).fill(Infinity);
  // Binär-Heap mit (Knoten, Distanz); veraltete Einträge werden beim Entnehmen übersprungen
  let cap = Math.max(16, g.count);
  let hn = new Int32Array(cap);
  let hd = new Float64Array(cap);
  let size = 0;
  const push = (i: number, d: number): void => {
    if (size >= cap) {
      cap *= 2;
      const nn = new Int32Array(cap); nn.set(hn); hn = nn;
      const nd = new Float64Array(cap); nd.set(hd); hd = nd;
    }
    let k = size++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hd[p]! <= d) break;
      hn[k] = hn[p]!;
      hd[k] = hd[p]!;
      k = p;
    }
    hn[k] = i;
    hd[k] = d;
  };
  const popInto = (out: { i: number; d: number }): void => {
    out.i = hn[0]!;
    out.d = hd[0]!;
    size--;
    if (size <= 0) return;
    const li = hn[size]!, ld = hd[size]!;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = -1;
      let md = ld;
      if (l < size && hd[l]! < md) { m = l; md = hd[l]!; }
      if (r < size && hd[r]! < md) { m = r; }
      if (m < 0) break;
      hn[k] = hn[m]!;
      hd[k] = hd[m]!;
      k = m;
    }
    hn[k] = li;
    hd[k] = ld;
  };
  for (const s of starts) {
    if (s < 0) continue;
    dist[s] = 0;
    push(s, 0);
  }
  const top = { i: 0, d: 0 };
  while (size > 0) {
    popInto(top);
    const c = top.i;
    const dc = top.d;
    if (dc > dist[c]!) continue;
    for (let k = g.edgeStart[c]!; k < g.edgeStart[c + 1]!; k++) {
      const n = g.edgeTo[k]!;
      const nd = dc + g.edgeCost[k]!;
      if (nd < dist[n]!) {
        dist[n] = nd;
        push(n, nd);
      }
    }
  }
  return Float32Array.from(dist);
}

// ----------------------------------------------------------------------------- Aufbau

export type BotMapInput = {
  nav: NavGraph;
  collider: Collider;
  sites: readonly Site[];
  spawns: Record<Team, readonly Spawn[]>;
  hints?: readonly BotHint[];
};

/** Komplette Analyse (≈ 50–200 ms auf großen Karten, einmal je Karte). */
export function analyzeMap(input: BotMapInput): BotMapInfo {
  const g = input.nav;
  const { zoneOf, names } = buildZones(g);
  const portals = buildPortals(g, zoneOf);
  const spawnNodes = (t: Team): number[] => input.spawns[t].map((s) => nearestNode(g, s.pos[0], s.pos[1], s.pos[2], 4)).filter((n) => n >= 0);
  const dist = { T: distanceField(g, spawnNodes('T')), CT: distanceField(g, spawnNodes('CT')) };
  const centroid = (t: Team): XYZ => {
    const list = input.spawns[t];
    const n = Math.max(1, list.length);
    const c = { x: list.reduce((s, p) => s + p.pos[0], 0) / n, y: list.reduce((s, p) => s + p.pos[1], 0) / n, z: list.reduce((s, p) => s + p.pos[2], 0) / n };
    const node = nearestNode(g, c.x, c.y, c.z, 30);
    return node >= 0 ? P(g, node) : c;
  };
  const spawn = { T: centroid('T'), CT: centroid('CT') };

  // Zonen-Steckbriefe
  const sums = names.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
  for (let i = 0; i < g.count; i++) {
    const z = zoneOf[i]!;
    if (z < 0) continue;
    const s = sums[z]!;
    s.x += g.x[i]!; s.y += g.y[i]!; s.z += g.z[i]!; s.n++;
  }
  const centerNodes = names.map(() => -1);
  const centerDist = names.map(() => Infinity);
  for (let i = 0; i < g.count; i++) {
    const z = zoneOf[i]!;
    if (z < 0) continue;
    const s = sums[z]!;
    const dd = (g.x[i]! - s.x / s.n) ** 2 + ((g.y[i]! - s.y / s.n) * 2) ** 2 + (g.z[i]! - s.z / s.n) ** 2;
    if (dd < centerDist[z]!) {
      centerDist[z] = dd;
      centerNodes[z] = i;
    }
  }
  const zones: Zone[] = names.map((name, id) => ({
    id, name,
    centerNode: centerNodes[id]!,
    center: centerNodes[id]! >= 0 ? P(g, centerNodes[id]!) : { x: 0, y: 0, z: 0 },
    nodeCount: sums[id]!.n,
    out: portals.filter((p) => p.from === id).map((p) => p.id),
    in: portals.filter((p) => p.to === id).map((p) => p.id),
    site: null,
    spawn: null,
  }));
  for (const t of ['T', 'CT'] as Team[]) {
    for (const s of input.spawns[t]) {
      const n = nearestNode(g, s.pos[0], s.pos[1], s.pos[2], 4);
      if (n >= 0 && zoneOf[n]! >= 0) zones[zoneOf[n]!]!.spawn = t;
    }
  }

  // Spots: Zonen mit dem Pflanzpunkt oder ≥ 40 % ihrer Knoten in der Spot-Box
  const sites: SiteInfo[] = [];
  for (const s of input.sites) {
    const id: SiteId = s.id === 'A' ? 'a' : 'b';
    const plantNode = nearestNode(g, s.plant[0], s.plant[1], s.plant[2], 6);
    const inside = new Map<number, number>();
    for (let i = 0; i < g.count; i++) {
      const x = g.x[i]!, y = g.y[i]! + 0.5, z = g.z[i]!;
      if (x < s.min[0] || x > s.max[0] || y < s.min[1] || y > s.max[1] || z < s.min[2] || z > s.max[2]) continue;
      const zn = zoneOf[i]!;
      if (zn >= 0) inside.set(zn, (inside.get(zn) ?? 0) + 1);
    }
    const siteZones = new Set<number>();
    if (plantNode >= 0 && zoneOf[plantNode]! >= 0) siteZones.add(zoneOf[plantNode]!);
    for (const [zn, n] of inside) if (n >= zones[zn]!.nodeCount * 0.4) siteZones.add(zn);
    for (const zn of siteZones) zones[zn]!.site = id;
    const entrances = portals.filter((p) => siteZones.has(p.to) && !siteZones.has(p.from)).map((p) => p.id);
    sites.push({
      id, name: s.name,
      plant: plantNode >= 0 ? P(g, plantNode) : { x: s.plant[0], y: s.plant[1], z: s.plant[2] },
      plantNode,
      min: [...s.min] as [number, number, number],
      max: [...s.max] as [number, number, number],
      zones: [...siteZones].sort((a, b) => a - b),
      entrances,
    });
  }

  const info: BotMapInfo = { nav: g, col: input.collider, zoneOf, zones, portals, dist, spawn, sites, routes: [], hints: [...(input.hints ?? [])], cache: new Map() };
  for (const team of ['T', 'CT'] as Team[]) {
    for (const site of sites) info.routes.push(...findRoutes(info, team, site));
  }
  info.routes.forEach((r, i) => (r.id = i));
  return info;
}

// ----------------------------------------------------------------------------- Routen

/**
 * Verschiedene Routen vom Spawn zum Spot über den Portalgraphen: kürzester Weg,
 * danach werden benutzte Zonen verteuert und erneut gesucht (→ lang/kurz/Mitte).
 * Routen durch den gegnerischen Spawn oder den anderen Spot sind tabu.
 */
export function findRoutes(info: BotMapInfo, team: Team, site: SiteInfo): Route[] {
  const g = info.nav;
  const start = info.spawn[team];
  const startNode = nearestNode(g, start.x, start.y, start.z, 30);
  if (startNode < 0 || site.plantNode < 0) return [];
  const startZone = info.zoneOf[startNode]!;
  const siteZones = new Set(site.zones);
  const forbidden = new Set<number>();
  for (const z of info.zones) {
    if (z.spawn === enemyOf(team)) forbidden.add(z.id);
    if (z.site && z.site !== site.id) forbidden.add(z.id);
  }
  forbidden.delete(startZone);
  if (siteZones.has(startZone)) return [];
  const penalty = info.zones.map(() => 1);
  const found: { portals: number[]; cost: number }[] = [];
  for (let attempt = 0; attempt < BOTMAP.routeTries; attempt++) {
    const r = portalDijkstra(info, startZone, start, siteZones, site.plant, forbidden, penalty);
    if (!r) break;
    const key = r.portals.join(',');
    if (!found.some((f) => f.portals.join(',') === key)) found.push(r);
    // Benutzte Zwischenzonen verteuern
    for (const pid of r.portals) {
      const z = info.portals[pid]!.to;
      if (!siteZones.has(z)) penalty[z] = penalty[z]! * 2.6;
    }
  }
  if (!found.length) return [];
  // Echte Länge (ohne Strafen) schätzen, zu lange aussortieren, gleiche Zonenfolgen zusammenfassen
  const realCost = (portals: number[]): number => {
    let c = 0;
    let at = start;
    for (const pid of portals) {
      const p = info.portals[pid]!;
      c += d3(at, p.pos) * 1.12;
      at = p.pos;
    }
    return c + d3(at, site.plant);
  };
  const scored = found.map((f) => ({ ...f, cost: realCost(f.portals) })).sort((a, b) => a.cost - b.cost);
  const best = scored[0]!.cost;
  const routes: Route[] = [];
  const seenZones = new Set<string>();
  for (const f of scored) {
    if (f.cost > best * BOTMAP.routeSlack) continue;
    const zones = [startZone, ...f.portals.map((pid) => info.portals[pid]!.to)];
    const zkey = zones.join(',');
    if (seenZones.has(zkey)) continue;
    seenZones.add(zkey);
    const via = f.portals.map((pid) => info.portals[pid]!.pos);
    const entry = f.portals.length ? f.portals[f.portals.length - 1]! : -1;
    routes.push({
      id: 0, team, site: site.id, zones, portals: f.portals, via, length: f.cost, entry,
      nodes: [], staging: site.plant, contested: null, contestedFrom: null, control: null,
      label: zones.map((z) => info.zones[z]!.name).join(' › '),
    });
  }
  // Nur T-Routen brauchen den Knotenweg (Bereitstellung, Kontrollpunkt)
  if (team === 'T') for (const r of routes) refineRoute(info, r, start);
  return routes;
}

function portalDijkstra(info: BotMapInfo, startZone: number, start: XYZ, goalZones: Set<number>, goal: XYZ, forbidden: Set<number>, penalty: number[]): { portals: number[]; cost: number } | null {
  const P2 = info.portals;
  const cost = new Float64Array(P2.length).fill(Infinity);
  const prev = new Int32Array(P2.length).fill(-1);
  const done = new Uint8Array(P2.length);
  for (const pid of info.zones[startZone]!.out) {
    const p = P2[pid]!;
    if (forbidden.has(p.to)) continue;
    cost[pid] = d3(start, p.pos) * 1.12 * penalty[startZone]!;
  }
  let bestGoal = -1;
  let bestCost = Infinity;
  for (;;) {
    let cur = -1;
    let cc = Infinity;
    for (let i = 0; i < P2.length; i++) if (!done[i] && cost[i]! < cc) { cc = cost[i]!; cur = i; }
    if (cur < 0 || cc >= bestCost) break;
    done[cur] = 1;
    const p = P2[cur]!;
    if (goalZones.has(p.to)) {
      const total = cc + d3(p.pos, goal) * penalty[p.to]!;
      if (total < bestCost) {
        bestCost = total;
        bestGoal = cur;
      }
      continue;
    }
    for (const qid of info.zones[p.to]!.out) {
      const q = P2[qid]!;
      if (forbidden.has(q.to) || q.to === p.from) continue;
      const nc = cc + d3(p.pos, q.pos) * 1.12 * penalty[p.to]!;
      if (nc < cost[qid]!) {
        cost[qid] = nc;
        prev[qid] = cur;
      }
    }
  }
  if (bestGoal < 0) return null;
  const portals: number[] = [];
  for (let c = bestGoal; c >= 0; c = prev[c]!) portals.push(c);
  portals.reverse();
  return { portals, cost: bestCost };
}

/** Knotenweg, echte Länge, umkämpfter Punkt, Kontrollpunkt und Bereitstellung einer T-Route. */
function refineRoute(info: BotMapInfo, r: Route, start: XYZ): void {
  const g = info.nav;
  const pts = [start, ...r.via, info.sites.find((s) => s.id === r.site)!.plant];
  const nodes: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = nearestNode(g, pts[i - 1]!.x, pts[i - 1]!.y, pts[i - 1]!.z);
    const b = nearestNode(g, pts[i]!.x, pts[i]!.y, pts[i]!.z);
    const seg = astar(g, a, b, { allowCrouch: true });
    if (!seg.length) continue;
    if (nodes.length && nodes[nodes.length - 1] === seg[0]) seg.shift();
    nodes.push(...seg);
  }
  if (nodes.length < 2) return;
  r.nodes = nodes;
  const cum = [0];
  for (let i = 1; i < nodes.length; i++) cum.push(cum[i - 1]! + d3(P(g, nodes[i - 1]!), P(g, nodes[i]!)));
  r.length = cum[cum.length - 1]!;
  const at = (meters: number): number => {
    const m = Math.max(0, Math.min(r.length, meters));
    let k = 0;
    while (k < cum.length - 1 && cum[k + 1]! < m) k++;
    return nodes[k]!;
  };
  // Umkämpft: erster Knoten, den die CT höchstens ~1 s nach den T erreichen könnten
  const dT = info.dist.T, dCT = info.dist.CT;
  let ci = -1;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (dT[n]! + BOTMAP.speed * 1 >= dCT[n]!) { ci = i; break; }
  }
  const entryIdx = (() => {
    if (r.entry < 0) return nodes.length - 1;
    const ep = info.portals[r.entry]!;
    let best = nodes.length - 1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const dd = d3(P(g, nodes[i]!), ep.pos);
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  })();
  if (ci >= 0 && ci < entryIdx) {
    r.contested = P(g, nodes[ci]!);
    r.contestedFrom = P(g, at(cum[ci]! - 6));
    r.control = P(g, coverNear(info, at(cum[ci]! - 7), 3));
  }
  // Bereitstellung: 9–22 m vor dem Eingang, bevorzugt mit Deckung und ohne Sicht auf den Pflanzpunkt
  const site = info.sites.find((s) => s.id === r.site)!;
  const plantEye = { x: site.plant.x, y: site.plant.y + BOTMAP.watchY, z: site.plant.z };
  const entryPos = r.entry >= 0 ? info.portals[r.entry]!.pos : site.plant;
  const entryEye = { x: entryPos.x, y: entryPos.y + BOTMAP.watchY, z: entryPos.z };
  let best = at(cum[entryIdx]! - 12);
  let bestScore = -Infinity;
  for (let m = 9; m <= 22; m += 1.5) {
    const n = at(cum[entryIdx]! - m);
    const eye = { x: g.x[n]!, y: g.y[n]! + BOTMAP.eye, z: g.z[n]! };
    let s = 0;
    if (g.flags[n]! & NAV_FLAG.cover) s += 2;
    if (!info.col.clear(eye, plantEye)) s += 2;
    if (!info.col.clear(eye, entryEye)) s += 0.5;
    s -= Math.abs(m - 13) * 0.08;
    if (s > bestScore) { bestScore = s; best = n; }
  }
  r.staging = P(g, best);
}

/** Knoten mit Deckung in der Nähe (≤ r m), sonst der Knoten selbst. */
export function coverNear(info: BotMapInfo, node: number, r: number): number {
  const g = info.nav;
  if (g.flags[node]! & NAV_FLAG.cover) return node;
  let best = node, bd = Infinity;
  forNodesNear(g, g.x[node]!, g.z[node]!, r, (i) => {
    if (!(g.flags[i]! & NAV_FLAG.cover) || (g.flags[i]! & NAV_FLAG.crouch) || Math.abs(g.y[i]! - g.y[node]!) > 0.6) return;
    const dd = Math.hypot(g.x[i]! - g.x[node]!, g.z[i]! - g.z[node]!);
    if (dd < bd) { bd = dd; best = i; }
  });
  return best;
}

// ----------------------------------------------------------------------------- Abfragen

/** Zone an einer Position (−1 = keine). */
export function zoneAt(info: BotMapInfo, p: XYZ): number {
  const n = nearestNode(info.nav, p.x, p.y, p.z, 6);
  return n >= 0 ? info.zoneOf[n]! : -1;
}

export function siteInfo(info: BotMapInfo, id: SiteId): SiteInfo | undefined {
  return info.sites.find((s) => s.id === id);
}

/** Routen eines Teams zu einem Spot (kürzeste zuerst). */
export function routesTo(info: BotMapInfo, team: Team, site: SiteId): Route[] {
  return info.routes.filter((r) => r.team === team && r.site === site).sort((a, b) => a.length - b.length);
}

/**
 * Eingänge eines Spots aus Sicht eines Teams: `attack` = Portale, über die T-Routen
 * hineinführen (CT halten sie), `defend` = Eingänge von der CT-Seite (T halten sie
 * nach dem Plant). Fallback: Seite über die Distanzfelder.
 */
export function siteEntrances(info: BotMapInfo, site: SiteInfo, kind: 'attack' | 'defend'): number[] {
  const tEntries = new Set(info.routes.filter((r) => r.team === 'T' && r.site === site.id && r.entry >= 0).map((r) => r.entry));
  const ctEntries = new Set(info.routes.filter((r) => r.team === 'CT' && r.site === site.id && r.entry >= 0).map((r) => r.entry));
  const out = site.entrances.filter((pid) => {
    if (kind === 'attack' && tEntries.has(pid)) return true;
    if (kind === 'defend' && ctEntries.has(pid)) return true;
    const p = info.portals[pid]!;
    const tSide = info.dist.T[p.fromNode]! < info.dist.CT[p.fromNode]!;
    return kind === 'attack' ? tSide && !ctEntries.has(pid) : !tSide && !tEntries.has(pid);
  });
  return out.length ? out : site.entrances.slice();
}

export type HoldOpts = {
  /**
   * Anlaufpunkt der Gegner (z. B. vor einem Eingang): Halte-Positionen liegen nicht auf
   * dieser Seite des beobachteten Punktes. Ohne Angabe entscheidet das Distanzfeld.
   */
  from?: XYZ;
  /** Entfernung zum beobachteten Punkt (m). */
  min?: number;
  max?: number;
  /** Höchstens so weit von `near` entfernt (z. B. Bombe nach dem Plant). */
  near?: XYZ;
  nearMax?: number;
  /** Zusätzlich sichtbare Punkte belohnen (z. B. die Bombe). */
  alsoSee?: XYZ[];
  /** Weitere Eingänge: Sicht darauf kostet Punkte (nicht von mehreren Seiten offen stehen). */
  exposed?: XYZ[];
  limit?: number;
  /** Mindestabstand der Ergebnisse untereinander (m). */
  spacing?: number;
  /** Lange Sichtlinien bevorzugen (Scharfschütze). */
  sniper?: boolean;
};

/**
 * Halte-Positionen für `team`, die den Punkt `watch` beobachten: Knoten auf der
 * eigenen Seite (Distanz zum gegnerischen Spawn größer als die des Punktes), mit
 * Sichtlinie, bewertet nach Deckung, Höhe, Entfernung, Ducken-Möglichkeit,
 * Karten-Hinweisen und wenig Angriffsfläche zu anderen Eingängen. Ergebnis
 * gecacht (gleiche Anfrage → gleiche Liste).
 */
export function holdSpots(info: BotMapInfo, watch: XYZ, team: Team, opts: HoldOpts = {}): HoldSpot[] {
  const min = opts.min ?? BOTMAP.holdMin;
  const max = opts.max ?? BOTMAP.holdMax;
  const limit = opts.limit ?? 8;
  const spacing = opts.spacing ?? 3;
  const key = `hold|${team}|${watch.x.toFixed(1)},${watch.y.toFixed(1)},${watch.z.toFixed(1)}|${opts.from ? `${opts.from.x.toFixed(1)},${opts.from.z.toFixed(1)}` : '-'}|${min}|${max}|${limit}|${spacing}|${opts.sniper ? 1 : 0}|${opts.near ? `${opts.near.x.toFixed(1)},${opts.near.z.toFixed(1)},${opts.nearMax}` : ''}|${(opts.alsoSee ?? []).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';')}|${(opts.exposed ?? []).map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';')}`;
  const cached = info.cache.get(key) as HoldSpot[] | undefined;
  if (cached) return cached;
  const g = info.nav;
  const col = info.col;
  const enemy = info.dist[enemyOf(team)];
  const wn = nearestNode(g, watch.x, watch.y, watch.z, 6);
  const dw = wn >= 0 ? enemy[wn]! : Infinity;
  const target = { x: watch.x, y: watch.y + BOTMAP.watchY, z: watch.z };
  const cand: number[] = [];
  const radius = opts.near ? Math.min(max, d2(opts.near, watch) + (opts.nearMax ?? 15)) : max;
  const from = opts.from;
  const ax = from ? watch.x - from.x : 0, az = from ? watch.z - from.z : 0;
  const al = Math.hypot(ax, az) || 1;
  const fromDist = from ? d2(from, watch) : 0;
  forNodesNear(g, watch.x, watch.z, radius, (i) => {
    if (g.flags[i]! & NAV_FLAG.crouch) return;
    if (Math.abs(g.y[i]! - watch.y) > 8) return;
    const dd = Math.hypot(g.x[i]! - watch.x, g.y[i]! - watch.y, g.z[i]! - watch.z);
    if (dd < min || dd > max) return;
    if (!Number.isFinite(enemy[i]!)) return;
    if (from) {
      // Nicht auf der Anlaufseite: Richtung weg vom Gegner (bis ~15° zurück erlaubt)
      const wx = g.x[i]! - watch.x, wz = g.z[i]! - watch.z;
      const wl = Math.hypot(wx, wz) || 1;
      if ((wx * ax + wz * az) / (wl * al) < -0.25) return;
      if (Math.hypot(g.x[i]! - from.x, g.z[i]! - from.z) < fromDist + 1) return;
    } else if (!(enemy[i]! >= dw + 2)) return;
    if (opts.near && Math.hypot(g.x[i]! - opts.near.x, g.z[i]! - opts.near.z) > (opts.nearMax ?? 15)) return;
    cand.push(i);
  });
  // Ausdünnen: höchstens ~700 Kandidaten prüfen
  const stride = Math.max(1, Math.ceil(cand.length / 700));
  const hintSpots = info.hints.filter((h): h is Extract<BotHint, { kind: 'hold' | 'sniper' }> => (h.kind === 'hold' || h.kind === 'sniper') && (!h.team || h.team === team));
  const scored: HoldSpot[] = [];
  for (let k = 0; k < cand.length; k += stride) {
    const i = cand[k]!;
    const pos = P(g, i);
    const eye = { x: pos.x, y: pos.y + BOTMAP.eye, z: pos.z };
    if (!col.clear(eye, target)) continue;
    const crouch = col.clear({ x: pos.x, y: pos.y + BOTMAP.crouchEye, z: pos.z }, target);
    const dist = d3(pos, watch);
    const cover = (g.flags[i]! & NAV_FLAG.cover) !== 0;
    const high = (g.flags[i]! & NAV_FLAG.high) !== 0;
    let s = 0;
    if (cover) s += 2.5;
    if (high) s += 1;
    if (crouch) s += 0.5;
    if (opts.sniper) s += Math.min(3, dist / 10);
    else if (dist >= 9 && dist <= 24) s += 2;
    else if (dist >= 6 && dist <= 30) s += 1;
    s += Math.min(1.5, Math.max(0, (enemy[i]! - dw) / 12));
    // Gleiche Zone wie der beobachtete Punkt (z. B. im Spot statt im Spawn) und mittlere Distanz bevorzugen
    if (wn >= 0 && info.zoneOf[i] === info.zoneOf[wn]) s += 1;
    if (!opts.sniper) s -= Math.abs(dist - 15) * 0.03;
    for (const h of hintSpots) {
      if (Math.hypot(h.pos[0] - pos.x, h.pos[2] - pos.z) < 1.6 && Math.abs(h.pos[1] - pos.y) < 1) s += h.kind === 'sniper' && opts.sniper ? 6 : 4;
    }
    for (const p of opts.alsoSee ?? []) if (col.clear(eye, { x: p.x, y: p.y + 0.4, z: p.z })) s += 2;
    for (const p of opts.exposed ?? []) if (d3(p, watch) > 2 && col.clear(eye, { x: p.x, y: p.y + BOTMAP.watchY, z: p.z })) s -= BOTMAP.exposedPenalty;
    scored.push({ node: i, pos, score: s, dist, crouch, high, cover });
  }
  scored.sort((a, b) => b.score - a.score || a.node - b.node);
  const out: HoldSpot[] = [];
  for (const s of scored) {
    if (out.some((o) => d3(o.pos, s.pos) < spacing)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  info.cache.set(key, out);
  return out;
}

/**
 * `n` verschiedene Stehplätze um einen Punkt (gleiche Ebene, ≥ spacing auseinander,
 * Deckung bevorzugt; mit `awayFrom` nicht näher an diesem Punkt als das Zentrum) —
 * damit Gruppen nicht alle auf denselben Knoten laufen.
 */
export function spreadSpots(info: BotMapInfo, center: XYZ, n: number, opts: { radius?: number; spacing?: number; awayFrom?: XYZ } = {}): XYZ[] {
  const g = info.nav;
  const radius = opts.radius ?? 6;
  const spacing = opts.spacing ?? 2.2;
  const c = nearestNode(g, center.x, center.y, center.z, 4);
  if (c < 0 || n <= 0) return Array.from({ length: Math.max(0, n) }, () => ({ ...center }));
  const base = P(g, c);
  const away = opts.awayFrom;
  const baseAway = away ? d2(base, away) : 0;
  const cand: { pos: XYZ; s: number }[] = [];
  forNodesNear(g, base.x, base.z, radius, (i) => {
    if (Math.abs(g.y[i]! - base.y) > 0.7 || (g.flags[i]! & NAV_FLAG.crouch)) return;
    const pos = P(g, i);
    if (away && d2(pos, away) < baseAway - 1) return;
    cand.push({ pos, s: -d2(pos, base) * 0.5 + (g.flags[i]! & NAV_FLAG.cover ? 1.5 : 0) });
  });
  cand.sort((a, b) => b.s - a.s || a.pos.x - b.pos.x || a.pos.z - b.pos.z);
  const out: XYZ[] = [base];
  for (const q of cand) {
    if (out.length >= n) break;
    if (out.some((o) => d2(o, q.pos) < spacing)) continue;
    out.push(q.pos);
  }
  while (out.length < n) out.push(out[out.length - 1]!);
  return out.slice(0, n);
}

/** Anlaufpunkt vor einem Portal (6 m auf der Ausgangsseite). */
export function portalApproach(info: BotMapInfo, pid: number, back = 6): XYZ {
  const p = info.portals[pid]!;
  return { x: p.pos.x - p.dir.x * back, y: p.pos.y, z: p.pos.z - p.dir.z * back };
}

/** Halte-Positionen, die ein Portal (Eingang) von der Innenseite beobachten. */
export function portalHoldSpots(info: BotMapInfo, pid: number, team: Team, opts: HoldOpts = {}): HoldSpot[] {
  return holdSpots(info, info.portals[pid]!.pos, team, { from: portalApproach(info, pid), ...opts });
}

/** Pflanzposition: Karten-Hinweis, sonst Pflanzpunkt der Karte. */
export function plantSpot(info: BotMapInfo, site: SiteInfo, rnd: () => number): XYZ {
  const hints = info.hints.filter((h): h is Extract<BotHint, { kind: 'plant' }> => h.kind === 'plant' && h.site.toLowerCase() === site.id);
  if (hints.length) {
    const h = hints[Math.floor(rnd() * hints.length) % hints.length]!;
    const n = nearestNode(info.nav, h.pos[0], h.pos[1], h.pos[2], 3);
    if (n >= 0) return P(info.nav, n);
  }
  return site.plant;
}

/**
 * Gefahrenpunkte einer Zone für ein Team: Portale, durch die Gegner kommen können
 * (Gegner-Seite = kleinere Distanz zum gegnerischen Spawn), plus die bevorzugten
 * Halte-Positionen des Gegners in Spot-Zonen. Zum Vorzielen („pre-aim“) beim Betreten.
 */
export function threatPoints(info: BotMapInfo, zone: number, team: Team): XYZ[] {
  if (zone < 0) return [];
  const key = `threat|${team}|${zone}`;
  const cached = info.cache.get(key) as XYZ[] | undefined;
  if (cached) return cached;
  const enemy = info.dist[enemyOf(team)];
  const z = info.zones[zone]!;
  const own = z.centerNode >= 0 ? enemy[z.centerNode]! : Infinity;
  const pts: XYZ[] = [];
  for (const pid of z.in) {
    const p = info.portals[pid]!;
    if (enemy[p.fromNode]! < own) pts.push(p.pos);
  }
  // Im Spot: die Lieblingsplätze der Verteidiger (für T) bzw. der Angreifer nach dem Plant
  if (z.site) {
    const site = siteInfo(info, z.site)!;
    const entries = siteEntrances(info, site, team === 'T' ? 'attack' : 'defend');
    for (const pid of entries.slice(0, 3)) {
      const spots = portalHoldSpots(info, pid, enemyOf(team), { limit: 3 });
      for (const s of spots.slice(0, 2)) pts.push(s.pos);
    }
  }
  info.cache.set(key, pts);
  return pts;
}
