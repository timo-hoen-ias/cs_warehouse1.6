/**
 * Verbindet das Audio defensiv mit der Welt: nutzt `World.surfaceAt(x,y,z)` und
 * `World.acoustics { zones, emitters }`, sofern die Karte sie anbietet (sonst Beton,
 * Halle, keine Emitter), und den Welt-Raycast für Verdeckung.
 */
import { asSurface, segmentBlocked } from '../logic/audioMix';
import type { AcousticZone, AmbientEmitter } from '../logic/acoustics';
import type { Aabb } from '../logic/hitbox';
import { fallbackAcoustics, type HallBounds } from '../logic/ambientFallback';
import { mulberry32 } from '../logic/rng';
import type { Sfx } from './Sfx';

type WorldAudioHooks = {
  surfaceAt?: (x: number, y: number, z: number) => unknown;
  acoustics?: { zones?: readonly AcousticZone[]; emitters?: readonly AmbientEmitter[] } | null;
  aabbs?: readonly Aabb[];
  inner?: HallBounds;
  height?: number;
  solids?: readonly { kind: string; minX: number; maxX: number; minZ: number; maxZ: number }[];
  /** Karten-Collider (Raster + Rampen): bevorzugt für Verdeckung. */
  collider?: { clear(a: V3, b: V3): boolean };
};

type V3 = { x: number; y: number; z: number };

/** Verdeckt, wenn zwischen den (um `margin` gekürzten) Endpunkten Geometrie liegt. */
export function colliderOccluded(c: { clear(a: V3, b: V3): boolean }, a: V3, b: V3, margin = 0.35): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (len <= margin * 2) return false;
  const k = margin / len;
  const a2 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  const b2 = { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k, z: b.z - (b.z - a.z) * k };
  return !c.clear(a2, b2);
}

export function connectWorldAudio(sfx: Sfx, world: unknown): { zones: number; emitters: number; surfaces: boolean; fallback: boolean } {
  const w = (world ?? {}) as WorldAudioHooks;
  const surfaces = typeof w.surfaceAt === 'function';
  if (surfaces) {
    const fn = w.surfaceAt!;
    sfx.setSurfaceLookup((x, y, z) => asSurface(fn.call(world, x, y, z)));
  }
  let zones = w.acoustics?.zones ?? [];
  let emitters = w.acoustics?.emitters ?? [];
  let fallback = false;
  if (!zones.length && !emitters.length && w.inner) {
    // Karte ohne Akustik-Daten: Halle + plausible Quellen (Lüftung, Leuchten, Maschinen, Docks)
    const docks = (w.solids ?? []).filter((s) => s.kind === 'dock').map((s) => ({ x: (s.minX + s.maxX) / 2, z: (s.minZ + s.maxZ) / 2 }));
    const fb = fallbackAcoustics(w.inner, w.height ?? 10, docks, mulberry32(0xac0));
    zones = fb.zones;
    emitters = fb.emitters;
    fallback = true;
  }
  // Mit Zonen gilt außerhalb „draußen“ (Vertrag von roomAt), ohne Zonen ist alles Halle
  sfx.setAcoustics(zones, emitters, zones.length ? 'outdoor' : 'hall');
  const col = w.collider;
  const boxes = w.aabbs ?? [];
  if (col && typeof col.clear === 'function') sfx.setOcclusion((a, b) => colliderOccluded(col, a, b));
  else if (boxes.length) sfx.setOcclusion((a, b) => segmentBlocked(a, b, boxes));
  return { zones: zones.length, emitters: emitters.length, surfaces, fallback };
}
