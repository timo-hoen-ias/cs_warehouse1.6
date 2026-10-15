/** Rechteck in der XZ-Ebene (Weltmeter). */
export type Bounds2D = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Radar/Minimap-Mathematik (pure): Welt-XZ → Radar-Pixel, zentriert auf den
 * Spieler und mit seiner Blickrichtung nach oben gedreht (CS-1.6-Radar) oder
 * mit Norden (−Z) oben (Einstellung `radarRotate` aus).
 */
export type RadarView = {
  /** Pixelgröße des quadratischen Radars. */
  size: number;
  /** Sichtbarer Weltradius (m) vom Spieler (halbe Kantenlänge). */
  range: number;
  /** Karte mit dem Blick drehen (Standard: ja). */
  rotate?: boolean;
};

/** Sichtradius bei Zoom 1 (m). */
export const RADAR_BASE_RANGE = 50;

/** Sichtbarer Radius (m) für den Zoom der Einstellungen (1 = 50 m, größer = näher dran). */
export function radarRange(zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return RADAR_BASE_RANGE / z;
}

/** Welt-Punkt relativ zum Spieler in Radar-Pixel (Vorwärts = oben, bzw. Norden = oben ohne Drehung). */
export function worldToRadar(px: number, pz: number, yaw: number, wx: number, wz: number, view: RadarView): { x: number; y: number; inside: boolean } {
  const dx = wx - px;
  const dz = wz - pz;
  // Kamera-Konvention: yaw 0 blickt nach -Z. Drehe so, dass die Blickrichtung nach oben zeigt.
  const a = view.rotate === false ? 0 : yaw;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rx = dx * c - dz * s;
  const rz = dx * s + dz * c;
  const scale = view.size / 2 / view.range;
  const x = view.size / 2 + rx * scale;
  const y = view.size / 2 + rz * scale;
  // „innen“ = im quadratischen Ausschnitt (halbe Kante = range)
  const inside = Math.abs(rx) <= view.range && Math.abs(rz) <= view.range;
  return { x, y, inside };
}

/** Blickwinkel für die Darstellung: gedreht relativ zum eigenen Blick, sonst absolut (Norden oben). */
export function radarHeading(yaw: number, selfYaw: number, rotate: boolean): number {
  return rotate ? yaw - selfYaw : yaw;
}

/** Höhenunterschied (m), ab dem ein Mitspieler als „auf anderer Etage“ markiert wird. */
export const LEVEL_GAP = 2.5;

/** Pfeil für Spieler auf anderer Etage (modernes CS): 'up' = darüber, 'down' = darunter. */
export function heightMarker(dy: number, gap: number = LEVEL_GAP): 'up' | 'down' | null {
  if (dy >= gap) return 'up';
  if (dy <= -gap) return 'down';
  return null;
}

/** Punkt außerhalb des Quadrats entlang der Richtung zur Mitte auf den Rand (minus Rand) ziehen. */
export function clampToEdge(x: number, y: number, size: number, margin: number): { x: number; y: number; clamped: boolean } {
  const half = size / 2;
  const dx = x - half;
  const dy = y - half;
  const lim = half - margin;
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  if (m <= lim || m === 0) return { x, y, clamped: false };
  const k = lim / m;
  return { x: half + dx * k, y: half + dy * k, clamped: true };
}

export type RadarPlayer = { id: string; x: number; y: number; z: number; yaw: number; team: 'T' | 'CT'; alive: boolean };

export type RadarDotView = {
  id: string;
  /** Pixelposition (Mitte des Punkts). */
  x: number;
  y: number;
  team: 'T' | 'CT';
  enemy: boolean;
  /** Blickrichtung (rad, 0 = oben). */
  heading: number;
  /** Pfeil für andere Etage. */
  marker: 'up' | 'down' | null;
  /** Punkt liegt außerhalb des Ausschnitts und wurde an den Rand gezogen. */
  clamped: boolean;
  /** 1 = voll; schwächer bei anderer Etage oder am Rand. */
  alpha: number;
};

/**
 * Punkte fürs Radar: Teamkameraden immer (außerhalb des Ausschnitts an den Rand gezogen),
 * Gegner nur, wenn das Team sie gesehen hat (`spotted`) und sie im Ausschnitt liegen.
 * Tote und der Spieler selbst fehlen. Andere Etage → Pfeil + schwächere Darstellung.
 */
export function radarDots(self: { x: number; y: number; z: number; yaw: number; id: string }, others: readonly RadarPlayer[], team: 'T' | 'CT', spotted: (id: string) => boolean, view: RadarView, edgeMargin: number): RadarDotView[] {
  const out: RadarDotView[] = [];
  const rotate = view.rotate !== false;
  for (const o of others) {
    if (!o.alive || o.id === self.id) continue;
    const enemy = o.team !== team;
    if (enemy && !spotted(o.id)) continue;
    const p = worldToRadar(self.x, self.z, self.yaw, o.x, o.z, view);
    if (enemy && !p.inside) continue;
    const e = clampToEdge(p.x, p.y, view.size, edgeMargin);
    const marker = heightMarker(o.y - self.y);
    out.push({
      id: o.id, x: e.x, y: e.y, team: o.team, enemy,
      heading: radarHeading(o.yaw, self.yaw, rotate),
      marker, clamped: e.clamped,
      alpha: (marker ? 0.62 : 1) * (e.clamped ? 0.7 : 1),
    });
  }
  return out;
}

/**
 * Bombenspot-Beschriftung: auf der eigenen Etage voll, auf einer anderen (B unter A) blass.
 * Ohne Höhenband (Karte ohne gestapelte Ebenen) immer voll.
 */
export function siteLabelState(plantY: number, bandY: number | undefined, gap: number = LEVEL_GAP): 'same' | 'other' {
  return bandY === undefined || Math.abs(plantY - bandY) <= gap ? 'same' : 'other';
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
