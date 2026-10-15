import type { RampDir } from './collision';

/**
 * Gemeinsame Geometrie-Helfer der Requisiten (pure): Vierteldrehungen, lokale → Welt-
 * Koordinaten und gemeinsame Optionen. Lokale Front = +Z, Länge entlang lokal X;
 * `rot 1` dreht die Front nach −X (wie in docs/KARTENFORMAT.md).
 */
export type PropOpts = {
  rot?: 0 | 1 | 2 | 3;
  tint?: number;
  h?: number;
  n?: number;
  len?: number;
  seed?: number;
  levels?: number;
  /** Tiefkühlware (weiß/blau) statt Karton-Farben. */
  cold?: boolean;
  /** Güterwagen: Schiebetüren (`front` = lokale +Z-Seite, `both` = beide Seiten offen, Standard `closed`). */
  doors?: 'closed' | 'front' | 'both';
  /** Güterwagen: Verladerampe an der offenen Tür (`front` = +Z, `back` = −Z, `both`). */
  ramp?: 'none' | 'front' | 'back' | 'both';
  /** Länge der Verladerampe in m (Standard 4.5). */
  rampLen?: number;
  /** Güterwagen: Dach ist Navigationsboden (Zugang muss die Karte selbst bauen). */
  walkRoof?: boolean;
  /** Güterwagen: verwitterter, rostiger Anstrich (Material `rust`). */
  worn?: boolean;
};

/** Rechteck (halbe Breiten) nach Vierteldrehung. */
export function dims(w: number, d: number, rot: number): [number, number] {
  return rot % 2 === 0 ? [w, d] : [d, w];
}

/** Lokaler Punkt (lx, lz) → Weltposition bei Fußpunkt (x, z) und Vierteldrehung. */
export function localPoint(x: number, z: number, rot: number, lx: number, lz: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 1: return [x - lz, z + lx];
    case 2: return [x - lx, z - lz];
    case 3: return [x + lz, z - lx];
    default: return [x + lx, z + lz];
  }
}

/** Lokale Box (lx, lz relativ zur Mitte, ungedreht) in Weltkoordinaten (x0, z0, x1, z1). */
export function place(x: number, z: number, rot: number, lx0: number, lz0: number, lx1: number, lz1: number): [number, number, number, number] {
  const a = localPoint(x, z, rot, lx0, lz0);
  const b = localPoint(x, z, rot, lx1, lz1);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** Lokale Richtung (dx, dz ∈ {−1, 0, 1}) → Rampenrichtung in der Welt. */
export function worldDir(rot: number, dx: number, dz: number): RampDir {
  const [wx, wz] = localPoint(0, 0, rot, dx, dz);
  if (Math.abs(wx) > Math.abs(wz)) return wx > 0 ? 'px' : 'nx';
  return wz > 0 ? 'pz' : 'nz';
}
