import type { LagerDaten } from '../shared/types';
import type { LevelZones, Vec3 } from '../shared/level';
import { mulberry32 } from './demo';
import { computeSolids, freeSpots, innerBounds, type SolidBox } from './level';
import { layoutRacks, rackBounds } from './layout';

/**
 * Vertikale Level-Strukturen (pure, deterministisch): Zwischenebenen
 * (Plattform auf Stützen mit Treppe und Geländer) und eine Laderampe an der
 * CT-Stirnseite. Alle Teile sind achsenparallele Solids — Bewegung (Stufen,
 * Plattformen), Kollision und Schüsse nutzen dieselben Boxen.
 */
export const MEZZANINE = {
  width: 10,     // x
  depth: 7,      // z
  height: 3.2,   // Oberkante Plattform
  thickness: 0.25,
  stepRise: 0.25,
  stepTread: 0.36,
  stairWidth: 1.8,
  railHeight: 1.05,
  railThick: 0.08,
  pillar: 0.3,
} as const;

export const DOCK = {
  height: 1.2,
  depth: 4.5,
  /** Anteil der Hallenbreite, den die Rampe einnimmt. */
  widthRatio: 0.55,
  stepRise: 0.3,
  stepTread: 0.4,
} as const;

type Box = Omit<SolidBox, 'kind' | 'label'>;

function mk(kind: SolidBox['kind'], label: string, b: Box): SolidBox {
  return { kind, label, ...b };
}

/**
 * Zwischenebene um (cx, cz): Plattform, vier Stützen, Treppe an der +z-Seite
 * (Richtung `stairDir`: +1 nach +z, −1 nach −z), Geländer rundum außer am Treppenkopf.
 */
export function mezzanine(cx: number, cz: number, stairDir: 1 | -1 = 1, label = 'ebene'): SolidBox[] {
  const M = MEZZANINE;
  const out: SolidBox[] = [];
  const hw = M.width / 2;
  const hd = M.depth / 2;
  out.push(mk('platform', label, { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, minY: M.height - M.thickness, maxY: M.height }));
  // Stützen
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = cx + sx * (hw - M.pillar);
    const pz = cz + sz * (hd - M.pillar);
    out.push(mk('pillar', label, { minX: px - M.pillar / 2, maxX: px + M.pillar / 2, minZ: pz - M.pillar / 2, maxZ: pz + M.pillar / 2, minY: 0, maxY: M.height - M.thickness }));
  }
  // Treppe: beginnt an der Plattformkante (Mitte x), läuft in stairDir weg
  const steps = Math.ceil(M.height / M.stepRise);
  const edgeZ = cz + stairDir * hd;
  for (let i = 0; i < steps; i++) {
    const top = Math.min(M.height, M.stepRise * (steps - i));
    const z0 = edgeZ + stairDir * (i * M.stepTread);
    const z1 = edgeZ + stairDir * ((i + 1) * M.stepTread);
    out.push(mk('step', label, { minX: cx - M.stairWidth / 2, maxX: cx + M.stairWidth / 2, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), minY: 0, maxY: top }));
  }
  // Geländer: drei volle Seiten + Treppenseite links/rechts der Öffnung
  const r = M.railThick;
  const y0 = M.height;
  const y1 = M.height + M.railHeight;
  const back = cz - stairDir * hd;
  out.push(mk('rail', label, { minX: cx - hw, maxX: cx + hw, minZ: Math.min(back, back + stairDir * r), maxZ: Math.max(back, back + stairDir * r), minY: y0, maxY: y1 }));
  out.push(mk('rail', label, { minX: cx - hw, maxX: cx - hw + r, minZ: cz - hd, maxZ: cz + hd, minY: y0, maxY: y1 }));
  out.push(mk('rail', label, { minX: cx + hw - r, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, minY: y0, maxY: y1 }));
  const frontLo = Math.min(edgeZ, edgeZ - stairDir * r);
  const frontHi = Math.max(edgeZ, edgeZ - stairDir * r);
  out.push(mk('rail', label, { minX: cx - hw, maxX: cx - M.stairWidth / 2, minZ: frontLo, maxZ: frontHi, minY: y0, maxY: y1 }));
  out.push(mk('rail', label, { minX: cx + M.stairWidth / 2, maxX: cx + hw, minZ: frontLo, maxZ: frontHi, minY: y0, maxY: y1 }));
  return out;
}

/** Laderampe entlang der Südwand (CT-Seite): Podest + Stufen an beiden Enden. */
export function loadingDock(inner: { minX: number; maxX: number; minZ: number; maxZ: number }, label = 'rampe'): SolidBox[] {
  const out: SolidBox[] = [];
  const w = (inner.maxX - inner.minX) * DOCK.widthRatio;
  const cx = (inner.minX + inner.maxX) / 2;
  const z1 = inner.maxZ;
  const z0 = z1 - DOCK.depth;
  out.push(mk('dock', label, { minX: cx - w / 2, maxX: cx + w / 2, minZ: z0, maxZ: z1, minY: 0, maxY: DOCK.height }));
  const steps = Math.ceil(DOCK.height / DOCK.stepRise);
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const top = Math.min(DOCK.height, DOCK.stepRise * (steps - i));
      const x0 = cx + side * (w / 2 + i * DOCK.stepTread);
      const x1 = cx + side * (w / 2 + (i + 1) * DOCK.stepTread);
      out.push(mk('step', label, { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: z0, maxZ: z1, minY: 0, maxY: top }));
    }
  }
  return out;
}

/** XZ-Footprint einer Struktur mit Rand. */
function footprint(boxes: SolidBox[], pad: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)) - pad,
    maxX: Math.max(...boxes.map((b) => b.maxX)) + pad,
    minZ: Math.min(...boxes.map((b) => b.minZ)) - pad,
    maxZ: Math.max(...boxes.map((b) => b.maxZ)) + pad,
  };
}

function fpFree(fp: ReturnType<typeof footprint>, solids: SolidBox[]): boolean {
  return solids.every((b) => fp.maxX <= b.minX || fp.minX >= b.maxX || fp.maxZ <= b.minZ || fp.minZ >= b.maxZ);
}

/**
 * Strukturen für ein Lager: bis zu `count` Zwischenebenen auf freien Flächen
 * (Abstand zu Regalen/Wänden/Zonen) + Laderampe an der CT-Seite, falls Platz.
 */
export function generateStructures(lager: LagerDaten, zones: LevelZones, count = 2, seed = 11): SolidBox[] {
  const rnd = mulberry32(seed);
  const base = computeSolids(lager);
  const racks = base.filter((s) => s.kind === 'rack');
  const bounds = rackBounds(layoutRacks(lager.lagerorte));
  if (!bounds) return [];
  const inner = innerBounds(bounds);
  const out: SolidBox[] = [];
  const zonePts: Vec3[] = [zones.t, zones.ct, zones.a, zones.b];

  // Zwischenebenen: Kandidaten mit großem Freiraum, nicht an Zonen, zueinander weit entfernt
  const cands = freeSpots(lager, 5.5, 2).filter((p) => zonePts.every((z) => Math.hypot(z[0] - p[0], z[2] - p[2]) >= 9));
  const placed: Vec3[] = [];
  let guard = 0;
  while (placed.length < count && cands.length && guard++ < 200) {
    const c = cands[Math.floor(rnd() * cands.length)]!;
    if (placed.some((p) => Math.hypot(p[0] - c[0], p[2] - c[2]) < 20)) continue;
    const dir: 1 | -1 = c[2] < (inner.minZ + inner.maxZ) / 2 ? 1 : -1;
    const parts = mezzanine(c[0], c[2], dir, `ebene-${placed.length + 1}`);
    const fp = footprint(parts, 0.8);
    if (fp.minX < inner.minX || fp.maxX > inner.maxX || fp.minZ < inner.minZ || fp.maxZ > inner.maxZ) continue;
    if (!fpFree(fp, racks)) continue;
    out.push(...parts);
    placed.push(c);
  }

  // Laderampe an der Südwand, nur wenn davor kein Regal steht
  const dock = loadingDock(inner);
  const dfp = footprint(dock, 0.5);
  if (fpFree(dfp, racks) && fpFree(dfp, out)) out.push(...dock);
  return out;
}

/** Solids, die Bots am Boden blockieren (hohe Plattformen/Geländer ausgenommen). */
export function groundBlockers(solids: SolidBox[], feetLimit = 1.0): SolidBox[] {
  return solids.filter((s) => s.minY < feetLimit);
}
