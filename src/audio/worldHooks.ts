/**
 * Verbindet das Audio defensiv mit der Welt: nutzt `World.surfaceAt(x,y,z)` und
 * `World.acoustics { zones, emitters }`, sofern die Karte sie anbietet (sonst Beton,
 * Halle, keine Emitter), und den Welt-Raycast für Verdeckung.
 */
import { asSurface, segmentBlocked } from '../logic/audioMix';
import type { AcousticZone, AmbientEmitter } from '../logic/acoustics';
import type { Aabb } from '../logic/hitbox';
import type { Sfx } from './Sfx';

type WorldAudioHooks = {
  surfaceAt?: (x: number, y: number, z: number) => unknown;
  acoustics?: { zones?: readonly AcousticZone[]; emitters?: readonly AmbientEmitter[] } | null;
  aabbs?: readonly Aabb[];
};

export function connectWorldAudio(sfx: Sfx, world: unknown): { zones: number; emitters: number; surfaces: boolean } {
  const w = (world ?? {}) as WorldAudioHooks;
  const surfaces = typeof w.surfaceAt === 'function';
  if (surfaces) {
    const fn = w.surfaceAt!;
    sfx.setSurfaceLookup((x, y, z) => asSurface(fn.call(world, x, y, z)));
  }
  const zones = w.acoustics?.zones ?? [];
  const emitters = w.acoustics?.emitters ?? [];
  // Mit Zonen gilt außerhalb „draußen“ (Vertrag von roomAt), ohne Zonen ist alles Halle
  sfx.setAcoustics(zones, emitters, zones.length ? 'outdoor' : 'hall');
  const boxes = w.aabbs ?? [];
  if (boxes.length) sfx.setOcclusion((a, b) => segmentBlocked(a, b, boxes));
  return { zones: zones.length, emitters: emitters.length, surfaces };
}
