/**
 * Akustik-Vertrag zwischen Karten und Audio (pure, framework-frei).
 * Karten liefern Oberflächen (Schritte), Raumzonen (Hall/Filter) und
 * Ambient-Quellen; die Audio-Schicht (`src/audio/`) spielt sie ab.
 */
export type Vec3 = [number, number, number];

/** Oberfläche unter den Füßen → Schrittklang. */
export type Surface = 'concrete' | 'metal' | 'grate' | 'wood' | 'gravel' | 'tile';

/** Raumcharakter → Nachhall/Filter der Schüsse und Schritte. */
export type RoomKind = 'outdoor' | 'hall' | 'room' | 'tunnel' | 'cold';

/** Ortsfeste Hintergrundgeräusche (Schleifen, positionsabhängig). */
export type AmbientSound =
  | 'hallHum' | 'ventilation' | 'machine' | 'conveyor' | 'forklift' | 'compressor'
  | 'buzz' | 'drip' | 'radio' | 'alarmFar' | 'wind' | 'birds' | 'traffic' | 'rain';

export type AmbientEmitter = { sound: AmbientSound; pos: Vec3; radius: number; volume?: number };

/** Achsenparallele Zone mit Raumcharakter (kleinste umschließende Zone gewinnt). */
export type AcousticZone = { kind: RoomKind; min: Vec3; max: Vec3 };

function inside(z: AcousticZone, x: number, y: number, zz: number): boolean {
  return x >= z.min[0] && x <= z.max[0] && y >= z.min[1] && y <= z.max[1] && zz >= z.min[2] && zz <= z.max[2];
}

function volume(z: AcousticZone): number {
  return (z.max[0] - z.min[0]) * (z.max[1] - z.min[1]) * (z.max[2] - z.min[2]);
}

/** Raumcharakter an einem Punkt: kleinste Zone, die ihn enthält, sonst `fallback`. */
export function roomAt(zones: readonly AcousticZone[], x: number, y: number, z: number, fallback: RoomKind = 'outdoor'): RoomKind {
  let best: AcousticZone | null = null;
  for (const zone of zones) if (inside(zone, x, y, z) && (!best || volume(zone) < volume(best))) best = zone;
  return best ? best.kind : fallback;
}

/** Lautstärke-Anteil einer Ambient-Quelle am Hörerort (0..1, weicher Abfall bis `radius`). */
export function emitterGain(e: AmbientEmitter, x: number, y: number, z: number): number {
  const d = Math.hypot(e.pos[0] - x, e.pos[1] - y, e.pos[2] - z);
  if (d >= e.radius) return 0;
  const k = 1 - d / e.radius;
  return k * k * (e.volume ?? 1);
}
