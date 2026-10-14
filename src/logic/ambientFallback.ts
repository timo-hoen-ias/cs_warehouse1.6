/**
 * Ersatz-Akustik für Karten ohne eigene Akustik-Daten (pure): die Halle als
 * Zone (außerhalb = draußen) und plausibel verteilte Hintergrundquellen —
 * Lüftungsauslässe im Raster unter der Decke, brummende Leuchten, eine
 * Maschine und ein Kompressor an den Wänden, Gabelstapler im Leerlauf an den
 * Docks, ein Radio im Pausenbereich. Deterministisch über den Zufallsgenerator.
 */
import type { AcousticZone, AmbientEmitter } from './acoustics';

export type HallBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export function fallbackAcoustics(
  inner: HallBounds,
  height: number,
  docks: readonly { x: number; z: number }[],
  rnd: () => number,
): { zones: AcousticZone[]; emitters: AmbientEmitter[] } {
  const h = Math.max(3, height);
  const zones: AcousticZone[] = [{ kind: 'hall', min: [inner.minX, -1, inner.minZ], max: [inner.maxX, h + 1, inner.maxZ] }];
  const emitters: AmbientEmitter[] = [];
  const w = inner.maxX - inner.minX;
  const d = inner.maxZ - inner.minZ;
  if (w <= 0 || d <= 0) return { zones, emitters };
  // Lüftung: Raster ~28 m unter der Decke
  const nx = Math.max(1, Math.round(w / 28));
  const nz = Math.max(1, Math.round(d / 28));
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = inner.minX + ((i + 0.5) / nx) * w;
      const z = inner.minZ + ((k + 0.5) / nz) * d;
      emitters.push({ sound: 'ventilation', pos: [x, h - 0.8, z], radius: 22, volume: 0.45 });
      // Jede zweite Zelle eine brummende Leuchte (versetzt)
      if ((i + k) % 2 === 0) emitters.push({ sound: 'buzz', pos: [x + (rnd() - 0.5) * 8, h - 1.5, z + (rnd() - 0.5) * 8], radius: 7, volume: 0.35 });
    }
  }
  // Maschine und Kompressor an gegenüberliegenden Wänden
  const zMid = (inner.minZ + inner.maxZ) / 2;
  emitters.push({ sound: 'machine', pos: [inner.minX + 2, 1.2, zMid + (rnd() - 0.5) * d * 0.5], radius: 26, volume: 0.55 });
  emitters.push({ sound: 'compressor', pos: [inner.maxX - 2, 1, zMid + (rnd() - 0.5) * d * 0.5], radius: 20, volume: 0.5 });
  if (w * d > 3000) emitters.push({ sound: 'conveyor', pos: [(inner.minX + inner.maxX) / 2 + (rnd() - 0.5) * w * 0.4, 1, zMid], radius: 22, volume: 0.4 });
  // Gabelstapler im Leerlauf an bis zu zwei Docks, sonst an einer Wand
  const lifts = docks.length ? docks.slice(0, 2) : [{ x: inner.minX + w * 0.25, z: inner.maxZ - 3 }];
  for (const p of lifts) emitters.push({ sound: 'forklift', pos: [p.x, 1, p.z], radius: 18, volume: 0.45 });
  // Radio in einer Ecke (Pausenbereich), ein Tropfen in der gegenüberliegenden
  emitters.push({ sound: 'radio', pos: [inner.maxX - 3, 1.5, inner.minZ + 3], radius: 9, volume: 0.4 });
  emitters.push({ sound: 'drip', pos: [inner.minX + 3, 0.2, inner.maxZ - 3], radius: 8, volume: 0.45 });
  return { zones, emitters };
}
