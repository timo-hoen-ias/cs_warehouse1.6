import type { Lagerort } from '../shared/types';
import type { RackKind, RackPlacement } from './layout';

export type RackScale = { x: number; y: number; z: number };
export type RackTransform = { x: number; z: number; rotY: number; scale: RackScale };

export const IDENTITY_TRANSFORM: RackTransform = { x: 0, z: 0, rotY: 0, scale: { x: 1, y: 1, z: 1 } };
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;

export type PlacedRack = {
  key: string;
  ort: Lagerort;
  kind: RackKind;
  gang: number;
  cols: number;
  levels: number;
  depth: number;
  flat: boolean;
  cellH: number;
  position: [number, number, number];
  rotY: number;
  size: { w: number; h: number; d: number };
};
/** Rundet auf den nächsten ganzen Meter (1x1-Raster). */
export function snap1(n: number): number {
  return Math.round(n);
}

/** Rundet auf das nächste 45°-Vielfache (Grad). */
export function snap45(deg: number): number {
  return Math.round(deg / 45) * 45;
}

export function round05(n: number): number {
  return Math.round(n * 2) / 2;
}

export function clampScale(s: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
}

export function rotateRack(t: RackTransform, deltaDeg: number): RackTransform {
  return { ...t, rotY: (snap45((t.rotY * 180) / Math.PI + deltaDeg) * Math.PI) / 180 };
}

export function moveRack(t: RackTransform, dx: number, dz: number): RackTransform {
  return { ...t, x: snap1(t.x + dx), z: snap1(t.z + dz) };
}

/**
 * Live-Drag: berechnet den neuen Transform relativ zum KONSTANTEN Basis-Origin
 * (baseX/baseZ), der beim pointerdown eingefroren wurde. baseX/baseZ dürfen
 * nicht aus der aktuell zwischengespeicherten Position neu abgeleitet werden,
 * sonst oszilliert das Regal beim Ziehen.
 */
export function snappedMove(
  last: RackTransform,
  baseX: number,
  baseZ: number,
  wpX: number,
  wpZ: number,
  grabDx: number,
  grabDz: number,
): RackTransform {
  return { ...last, x: snap1(wpX - grabDx) - baseX, z: snap1(wpZ - grabDz) - baseZ };
}

export function scaleRack(t: RackTransform, factor: number): RackTransform {
  const s = clampScale(round05(factor));
  return { ...t, scale: { x: s, y: s, z: s } };
}

export function resizeRack(t: RackTransform, axis: keyof RackScale, factor: number): RackTransform {
  return { ...t, scale: { ...t.scale, [axis]: clampScale(round05(factor)) } };
}

/** Skala setzen ohne 0.5er-Rundung (für Kommazahl-Eingaben in der UI). */
export function resizeRackExact(t: RackTransform, axis: keyof RackScale, factor: number): RackTransform {
  return { ...t, scale: { ...t.scale, [axis]: clampScale(factor) } };
}

/** Faktor aus Zeiger-Position entlang der Achse relativ zur unskalierten Halbkantenlänge. */
export function resizeFactor(baseHalf: number, pointerCoord: number, handleOffset: number): number {
  return clampScale(round05((Math.abs(pointerCoord) - handleOffset) / baseHalf));
}

export function resizeHeightFactor(baseH: number, topY: number, floorY: number): number {
  return clampScale(round05((topY - floorY) / baseH));
}

/** Wie resizeHeightFactor, aber rechnet den Griff-Abstand (handleOffset) heraus –
 *  damit greift der Y-Griff ohne Sprung auf die aktuelle Skala. */
export function resizeHeight(baseH: number, pointerY: number, handleOffset: number, floorY = 0): number {
  return resizeHeightFactor(baseH, pointerY - handleOffset, floorY);
}

export function applyTransform(base: RackPlacement, t: RackTransform): PlacedRack {
  return {
    key: base.key,
    ort: base.ort,
    kind: base.kind,
    gang: base.gang,
    cols: base.cols,
    levels: base.levels,
    depth: base.depth,
    flat: base.flat,
    cellH: base.cellH,
    position: [base.origin[0] + t.x, 0, base.origin[2] + t.z],
    rotY: t.rotY,
    size: { w: base.size.w * t.scale.x, h: base.size.h * t.scale.y, d: base.size.d * t.scale.z },
  };
}

export function rackAabb(placed: PlacedRack): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const hx = Math.abs(Math.cos(placed.rotY)) * (placed.size.w / 2) + Math.abs(Math.sin(placed.rotY)) * (placed.size.d / 2);
  const hz = Math.abs(Math.sin(placed.rotY)) * (placed.size.w / 2) + Math.abs(Math.cos(placed.rotY)) * (placed.size.d / 2);
  return {
    minX: placed.position[0] - hx,
    maxX: placed.position[0] + hx,
    minZ: placed.position[2] - hz,
    maxZ: placed.position[2] + hz,
  };
}

export function dist2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function rackBounds(
  racks: PlacedRack[],
  margin: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (racks.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of racks) {
    const b = rackAabb(r);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
}
