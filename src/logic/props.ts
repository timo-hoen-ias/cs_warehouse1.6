import type { LagerDaten } from '../shared/types';
import type { LevelZones, Prop, PropKind, Vec3 } from '../shared/level';
import { mulberry32 } from './demo';
import { computeSolids, freeSpots, type SolidBox } from './level';

/**
 * Lager-Requisiten als Deckung (CS-Kisten-Äquivalent): Palettenstapel, Gitterboxen,
 * Kisten und Container. Deterministisch aus Seed, nur auf freien Flächen, mit
 * Abstand zu Zonen und zueinander. Pure & getestet.
 */
export const PROP_SIZES: Record<PropKind, Vec3> = {
  pallet: [1.2, 1.1, 0.8],
  cage: [1.2, 1.0, 0.8],
  crate: [1.0, 1.0, 1.0],
  container: [2.4, 2.6, 6.0],
};

/** Mindestabstand Prop ↔ Zone (Spawns/Spots bleiben frei). */
export const PROP_ZONE_CLEAR = 4;
/** Mindestabstand zwischen Props. */
export const PROP_MIN_DIST = 3.5;

/** Solid-Box einer Requisite (Drehung in Vierteldrehungen tauscht Breite/Tiefe). */
export function propSolid(p: Prop): SolidBox {
  const [w, h, d] = p.size;
  const sw = p.rot % 2 === 1 ? d : w;
  const sd = p.rot % 2 === 1 ? w : d;
  return {
    kind: 'prop',
    minX: p.pos[0] - sw / 2,
    maxX: p.pos[0] + sw / 2,
    minY: p.pos[1],
    maxY: p.pos[1] + h,
    minZ: p.pos[2] - sd / 2,
    maxZ: p.pos[2] + sd / 2,
    label: p.kind,
  };
}

/**
 * Erzeugt `count` Requisiten im Lager. Kandidaten = freie Bodenpunkte mit
 * clearance 1.6 m (Gänge zwischen Regalen bleiben begehbar), Auswahl zufällig
 * (Seed), Container nur in großen Freiflächen (clearance 4 m).
 */
export function generateProps(lager: LagerDaten, zones: LevelZones, count: number, seed = 7, avoid: SolidBox[] = []): Prop[] {
  const rnd = mulberry32(seed);
  const small = freeSpots(lager, 1.6, 1.5);
  const big = freeSpots(lager, 4.0, 2);
  const zonePts = [zones.t, zones.ct, zones.a, zones.b];
  const out: Prop[] = [];
  const farFromZones = (p: Vec3): boolean => zonePts.every((z) => Math.hypot(z[0] - p[0], z[2] - p[2]) >= PROP_ZONE_CLEAR);
  const farFromAvoid = (p: Vec3): boolean => avoid.every((b) => p[0] <= b.minX - 1.5 || p[0] >= b.maxX + 1.5 || p[2] <= b.minZ - 1.5 || p[2] >= b.maxZ + 1.5);
  const farFromProps = (p: Vec3): boolean => out.every((o) => Math.hypot(o.pos[0] - p[0], o.pos[2] - p[2]) >= PROP_MIN_DIST + Math.max(o.size[0], o.size[2]) / 2);
  const kinds: PropKind[] = ['pallet', 'pallet', 'pallet', 'cage', 'crate', 'container'];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const kind = kinds[Math.floor(rnd() * kinds.length)]!;
    const pool = kind === 'container' ? big : small;
    if (!pool.length) continue;
    const cand = pool[Math.floor(rnd() * pool.length)]!;
    if (!farFromZones(cand) || !farFromProps(cand) || !farFromAvoid(cand)) continue;
    const rot = (Math.floor(rnd() * 4) % 4) as 0 | 1 | 2 | 3;
    // Stapelhöhe variieren (Paletten 1–3 Lagen)
    const base = PROP_SIZES[kind];
    const h = kind === 'pallet' ? 0.55 * (1 + Math.floor(rnd() * 3)) : base[1];
    out.push({ kind, pos: [cand[0], 0, cand[2]], size: [base[0], h, base[2]], rot });
  }
  return out;
}

/** Alle Solids eines Levels: Regale + Wände + Props + Strukturen. */
export function solidsWithProps(lager: LagerDaten, props: Prop[] = [], structures: SolidBox[] = []): SolidBox[] {
  return [...computeSolids(lager), ...props.map(propSolid), ...structures];
}
