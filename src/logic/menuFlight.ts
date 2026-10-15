import type { NavGraph } from './nav';

/**
 * Kameraflug für den Menühintergrund (pure): Eine Rundreise durch die interessanten Orte einer
 * Karte (Spawns, Bombenspots, größte Callout-Bereiche), entlang der Navigationsknoten (bleibt
 * also in Gängen und auf Böden, nicht durch Wände), geglättet und gleichmäßig durchlaufen.
 * Aus der Weglinie entsteht pro Zeitpunkt eine Kamerapose (Blick voraus, leichtes Pendeln).
 */
export type V3 = { x: number; y: number; z: number };

/** Augenhöhe der Kamera über dem Boden (m). */
export const FLIGHT_EYE = 1.7;
/** Lauftempo des Flugs (m/s) — langsam und ruhig. */
export const FLIGHT_SPEED = 2.6;
/** Abstand der Stützpunkte nach dem Neuabtasten (m). */
export const FLIGHT_STEP = 0.5;

/**
 * Generationszähler für asynchrone Ladevorgänge: `begin()` startet einen Vorgang, jedes
 * spätere `begin()`/`invalidate()` macht ihn veraltet. Wichtig: erst aufräumen (das selbst
 * `invalidate()` auslösen kann), dann `begin()` — sonst ist der neue Vorgang sofort veraltet.
 */
export class LoadGate {
  private gen = 0;

  begin(): number {
    return ++this.gen;
  }

  invalidate(): void {
    this.gen++;
  }

  current(token: number): boolean {
    return token === this.gen;
  }
}

const dist3 = (a: V3, b: V3): number => Math.hypot(a.x - b.x, (a.y - b.y) * 3, a.z - b.z);

export type TourInput = {
  nav: Pick<NavGraph, 'areas'>;
  spawns: { team: string; pos: [number, number, number] }[];
  sites: { plant: [number, number, number] }[];
};

/**
 * Stationen der Rundreise: T-Spawn zuerst, dann Bombenspots, CT-Spawn und die größten
 * Callout-Bereiche (höchstens `maxAreas`), jeweils als nächster noch offener Ort (Luftlinie,
 * Höhenunterschied zählt dreifach — Ebenen werden nacheinander besucht statt hin und her).
 * Orte, die näher als `minGap` zusammenliegen, werden zusammengelegt.
 */
export function tourStops(inp: TourInput, maxAreas = 7, minGap = 14): V3[] {
  const key: V3[] = [];
  const t = inp.spawns.find((s) => s.team === 'T');
  const ct = inp.spawns.find((s) => s.team === 'CT');
  const start: V3 | null = t ? { x: t.pos[0], y: t.pos[1], z: t.pos[2] } : null;
  for (const s of inp.sites) key.push({ x: s.plant[0], y: s.plant[1], z: s.plant[2] });
  if (ct) key.push({ x: ct.pos[0], y: ct.pos[1], z: ct.pos[2] });
  const big = [...inp.nav.areas].filter((a) => a.nodeCount > 0).sort((a, b) => b.nodeCount - a.nodeCount).slice(0, maxAreas);
  const extra = big.map((a) => ({ x: a.center.x, y: a.center.y, z: a.center.z }));

  const keep: V3[] = [];
  const add = (p: V3): void => {
    if (!keep.some((q) => dist3(p, q) < minGap)) keep.push(p);
  };
  if (start) add(start);
  for (const p of key) add(p); // Schlüsselorte haben Vorrang vor Bereichs-Mittelpunkten
  for (const p of extra) add(p);

  // Reihenfolge: nächster offener Ort ab dem Start
  const rest = keep.slice(start ? 1 : 0);
  const order: V3[] = start ? [keep[0]!] : [];
  let cur: V3 | undefined = order[0] ?? rest.shift();
  if (!start && cur) order.push(cur);
  while (rest.length && cur) {
    let bi = 0;
    for (let i = 1; i < rest.length; i++) if (dist3(cur, rest[i]!) < dist3(cur, rest[bi]!)) bi = i;
    cur = rest.splice(bi, 1)[0]!;
    order.push(cur);
  }
  return order;
}

/** Knotenfolge → Koordinaten. */
export function nodesToPoints(g: Pick<NavGraph, 'x' | 'y' | 'z'>, nodes: readonly number[]): V3[] {
  return nodes.map((i) => ({ x: g.x[i]!, y: g.y[i]!, z: g.z[i]! }));
}

/**
 * Rundreise planen: Wege zwischen den Stationen (A* über `find`, geliefert werden Knotenfolgen) zu einer
 * geschlossenen Linie verbinden (letzte Station → erste). Nicht erreichbare Stationen entfallen.
 * Gibt null zurück, wenn kein brauchbarer Rundweg (≥ `minLength` m) entsteht.
 */
export function planFlight(g: Pick<NavGraph, 'x' | 'y' | 'z'>, find: (a: V3, b: V3) => { nodes: number[] } | null, stops: readonly V3[], minLength = 60): V3[] | null {
  if (stops.length < 2) return null;
  const legs: V3[][] = [];
  let prev = stops[0]!;
  for (let i = 1; i <= stops.length; i++) {
    const to = i === stops.length ? stops[0]! : stops[i]!;
    const path = find(prev, to);
    if (!path || path.nodes.length < 2) {
      if (i === stops.length) break; // Rückweg fehlt: Schleife schließt sich über die Linie selbst
      continue;
    }
    legs.push(nodesToPoints(g, path.nodes));
    prev = to;
  }
  const line = joinLegs(legs);
  return polylineLength(line, true) >= minLength ? line : null;
}

/** Teilstrecken zu einer Linie verbinden (doppelte Nahtpunkte entfallen). */
export function joinLegs(legs: readonly (readonly V3[])[]): V3[] {
  const out: V3[] = [];
  for (const leg of legs) {
    for (const p of leg) {
      const last = out[out.length - 1];
      if (last && Math.hypot(last.x - p.x, last.y - p.y, last.z - p.z) < 1e-6) continue;
      out.push(p);
    }
  }
  return out;
}

/** Länge einer Linie (m), optional als geschlossene Schleife. */
export function polylineLength(pts: readonly V3[], closed = false): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y, pts[i]!.z - pts[i - 1]!.z);
  if (closed && pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    l += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  return l;
}

/**
 * Gleichmäßig abtasten (Abstand `step`) — Voraussetzung für konstantes Tempo.
 * Geschlossen: der Rückweg zum ersten Punkt wird mit abgetastet; das letzte Sample liegt dann vor dem ersten.
 */
export function resample(pts: readonly V3[], step: number, closed: boolean): V3[] {
  if (pts.length < 2) return [...pts];
  const line = closed ? [...pts, pts[0]!] : [...pts];
  const out: V3[] = [line[0]!];
  let carry = 0; // Reststrecke seit dem letzten Sample
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (seg < 1e-9) continue;
    let pos = step - carry; // Abstand ab a bis zum nächsten Sample
    while (pos <= seg + 1e-9) {
      const k = pos / seg;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
      pos += step;
    }
    carry = seg - (pos - step);
  }
  if (closed) out.pop(); // Endpunkt = Startpunkt
  return out;
}

/**
 * Gleitender Mittelwert über `radius` Stützpunkte nach jeder Seite (Treppen-Zickzack und Knicke werden
 * weich). Geschlossen: umlaufend, sonst bleiben Anfang und Ende stehen.
 */
export function smoothPolyline(pts: readonly V3[], radius: number, closed: boolean): V3[] {
  const n = pts.length;
  if (n < 3 || radius < 1) return [...pts];
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (let k = -radius; k <= radius; k++) {
      let j = i + k;
      if (closed) j = ((j % n) + n) % n;
      else if (j < 0 || j >= n) continue;
      const p = pts[j]!;
      sx += p.x; sy += p.y; sz += p.z; c++;
    }
    out.push({ x: sx / c, y: sy / c, z: sz / c });
  }
  if (!closed) {
    out[0] = pts[0]!;
    out[n - 1] = pts[n - 1]!;
  }
  return out;
}

/** Geschlossene, gleichmäßig abgetastete Flugbahn mit Positions-/Richtungsabfrage über die Weglänge. */
export class FlightPath {
  readonly pts: V3[];
  readonly step: number;
  readonly length: number;

  constructor(raw: readonly V3[], step = FLIGHT_STEP, smoothRadius = 5) {
    const even = resample(raw, step, true);
    this.pts = smoothPolyline(even, smoothRadius, true);
    this.step = step;
    this.length = this.pts.length * step;
  }

  /** Position nach `s` Metern (umlaufend, linear zwischen den Stützpunkten). */
  at(s: number): V3 {
    const n = this.pts.length;
    const f = ((s / this.step) % n + n) % n;
    const i = Math.floor(f);
    const k = f - i;
    const a = this.pts[i]!;
    const b = this.pts[(i + 1) % n]!;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  }
}

export type FlightPose = { x: number; y: number; z: number; yaw: number; pitch: number };

/** Blickwinkel (Kamera-Konvention: yaw 0 blickt nach −Z) für eine Richtung in der Horizontalen. */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Kürzester Winkelunterschied a − b in (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Kamerapose zur Zeit `t` (s): Position bei `t · speed` auf der Bahn in Augenhöhe, Blick auf einen Punkt
 * `lookAhead` m weiter vorn (nimmt Kurven früh mit), dazu langsames Pendeln links/rechts und leichtes Nicken.
 */
export function flightPose(path: FlightPath, t: number, speed = FLIGHT_SPEED, lookAhead = 7): FlightPose {
  const s = t * speed;
  const p = path.at(s);
  const q = path.at(s + lookAhead);
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const flat = Math.hypot(dx, dz);
  const base = flat > 0.05 ? yawOf(dx, dz) : yawOf(path.at(s + 1).x - p.x, path.at(s + 1).z - p.z);
  const sway = Math.sin(t * 0.31) * 0.22 + Math.sin(t * 0.13 + 1.3) * 0.12;
  const pitch = -0.04 + Math.sin(t * 0.23 + 0.6) * 0.035 + Math.atan2(q.y - p.y, Math.max(1, flat)) * 0.5;
  return { x: p.x, y: p.y + FLIGHT_EYE + Math.sin(t * speed * 2.1) * 0.025, z: p.z, yaw: base + sway, pitch };
}
