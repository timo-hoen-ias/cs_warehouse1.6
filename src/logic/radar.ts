/** Rechteck in der XZ-Ebene (Weltmeter). */
export type Bounds2D = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Radar/Minimap-Mathematik (pure): Welt-XZ → Radar-Pixel, zentriert auf den
 * Spieler und mit seiner Blickrichtung nach oben gedreht (CS-1.6-Radar).
 */
export type RadarView = {
  /** Pixelgröße des quadratischen Radars. */
  size: number;
  /** Sichtbarer Weltradius (m) vom Spieler. */
  range: number;
};

/** Welt-Punkt relativ zum Spieler in Radar-Pixel (Vorwärts = oben). */
export function worldToRadar(px: number, pz: number, yaw: number, wx: number, wz: number, view: RadarView): { x: number; y: number; inside: boolean } {
  const dx = wx - px;
  const dz = wz - pz;
  // Kamera-Konvention: yaw 0 blickt nach -Z. Drehe so, dass die Blickrichtung nach oben zeigt.
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const rx = dx * c - dz * s;
  const rz = dx * s + dz * c;
  const scale = view.size / 2 / view.range;
  const x = view.size / 2 + rx * scale;
  const y = view.size / 2 + rz * scale;
  const inside = Math.hypot(rx, rz) <= view.range;
  return { x, y, inside };
}

/** Übersichts-Projektion (Scoreboard/Karte): Welt-Bounds → Pixelrechteck, nicht gedreht. */
export function worldToMap(wx: number, wz: number, bounds: Bounds2D, size: number): { x: number; y: number } {
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const scale = size / Math.max(w, d);
  return {
    x: (wx - bounds.minX) * scale + (size - w * scale) / 2,
    y: (wz - bounds.minZ) * scale + (size - d * scale) / 2,
  };
}
