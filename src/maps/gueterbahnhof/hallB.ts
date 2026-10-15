import type { MapBuilder } from '../../logic/mapkit';
import { prop } from '../../logic/mapprops';
import { WAGON } from '../../logic/railprops';
import { column, floorLabel, hangSign, hazardEdge, railedStairs, tape } from './common';

/**
 * Gleisfeld B (überdachte Halle, 36 × 46 m): zwei Gleise längs Z mit Wagen, dazwischen die
 * Serverinsel (Plattform +0.35 m) mit den IT-Schränken („Serverschrank B“), im Nordosten die
 * Obere Empore (+3 m, Obere Halle B) mit Treppe und Zugang aufs Wagendach. Eingänge: Z-Verbindung
 * (Westtür), Süd-Tor, Untere Halle B (Nord), Obere Halle B (Nordost).
 */
export const HALL_B = {
  /** Gleise (x), Insel-Höhe und Pflanzpunkt. */
  trackL: 66,
  trackR: 80,
  island: 0.35,
  gallery: 3,
};

export function buildHallB(b: MapBuilder): void {
  const IY = HALL_B.island;
  const GY = HALL_B.gallery;

  // ---------------------------------------------------------------- Dach, Binder, Oberlicht-Spalten
  for (const [x0, x1] of [[54, 60], [62, 68], [70, 76], [78, 84], [86, 90]] as const) b.box([x0, 12, -56], [x1, 12.4, -10], 'roof', { tag: 'roof', noNav: true });
  for (const z of [-52, -43, -34, -25, -16]) prop(b, 'truss', 72, 9.6, z, { len: 36, h: 2.4 });
  for (let x = 58; x < 90; x += 8) b.box([x - 0.1, 11.6, -56], [x + 0.1, 12, -10], 'steel', { collide: 'none', noNav: true, occlude: false, tint: 0x4a5662 });

  // ---------------------------------------------------------------- Gleise und Wagen
  prop(b, 'track', HALL_B.trackL, 0, -33, { len: 46, rot: 1 });
  prop(b, 'bufferStop', HALL_B.trackL, 0, -54.4, { rot: 1 });
  prop(b, 'track', HALL_B.trackR, 0, -19, { len: 30, rot: 1 }); // läuft durch das Süd-Tor hinaus
  prop(b, 'bufferStop', HALL_B.trackR, 0, -4.6, { rot: 3 });
  // Gleis links: Durchgangswagen (Dach begehbar), Container-Flachwagen, Kesselwagen
  prop(b, 'boxcar', HALL_B.trackL, 0, -18, { rot: 1, doors: 'both', ramp: 'both', rampLen: 3.4, tint: 0x6a4a34, seed: 101 });
  prop(b, 'flatcar', HALL_B.trackL, 0, -32.5, { rot: 1, n: 2, levels: 1, seed: 102 });
  prop(b, 'tankcar', HALL_B.trackL, 0, -47, { rot: 1, tint: 0xa8b4bc });
  // Gleis rechts: Durchgangswagen mit begehbarem Dach (Zugang von der Empore)
  prop(b, 'boxcar', HALL_B.trackR, 0, -26.5, { rot: 1, tint: 0x35557a, walkRoof: true, seed: 103 });
  b.ramp(78.5, -36.4, 81.5, -33.5, GY, WAGON.roof + 0.14, 'pz', 'steel', { top: 'grating', tint: 0x6a7480, tag: 'ramp' });

  // ---------------------------------------------------------------- Serverinsel (Plattform) mit Schränken
  b.floor(69, -46, 77, -20, IY, 'concrete', { thick: 0.5, top: 'epoxy', tint: 0xb0b4b2, tag: 'platform' });
  hazardEdge(b, 68.7, -46, 69, -20, IY);
  hazardEdge(b, 77, -46, 77.3, -20, IY);
  // drei Schrankreihen entlang Z (Fronten zum kalten Gang in der Mitte), Quergänge dazwischen
  for (const [zc, n] of [[-41.5, 8], [-33, 5], [-24.5, 8]] as const) {
    prop(b, 'serverRow', 70.5, IY, zc, { rot: 3, n });
    prop(b, 'serverRow', 75.5, IY, zc, { rot: 1, n });
  }
  prop(b, 'ups', 70, IY, -37.1, { rot: 3 });
  prop(b, 'ups', 76, IY, -29, { rot: 1 });
  prop(b, 'cooler', 70.5, IY, -28.9, { rot: 3 });
  prop(b, 'cooler', 75.5, IY, -37, { rot: 1 });
  prop(b, 'cableTray', 73, 3.6, -33, { rot: 1, len: 30 });
  prop(b, 'cableTray', 70.5, 3.6, -33, { rot: 1, len: 30 });
  prop(b, 'cableTray', 75.5, 3.6, -33, { rot: 1, len: 30 });
  prop(b, 'palletGoods', 73, IY, -22.2, { tint: 0xe8e8e8, h: 1.0 });
  prop(b, 'crate', 73.8, IY, -44.8, { h: 1.0 });
  tape(b, 71.5, -33, 74.5, -33, IY);
  b.light({ kind: 'lamp', pos: [73, 3.2, -41.5], color: 0x40c8ff, intensity: 0.5, range: 7 });
  b.light({ kind: 'lamp', pos: [73, 3.2, -33], color: 0x40c8ff, intensity: 0.5, range: 7 });
  b.light({ kind: 'lamp', pos: [73, 3.2, -24.5], color: 0x40c8ff, intensity: 0.5, range: 7 });
  hangSign(b, 'SERVERSCHRANK B', 73, 6.2, -36, 0xffb13a, 'RECHENZENTRUM · KÜHLUNG AN', { rod: 4.2, alongX: true, w: 4.4 });

  // ---------------------------------------------------------------- Obere Empore (Obere Halle B) mit Treppe
  b.rail(78.05, -56, 78.05, -34, GY);
  b.rail(78, -33.95, 78.5, -33.95, GY); // Lücke für die Rampe aufs Wagendach
  b.rail(81.5, -33.95, 84, -33.95, GY);
  railedStairs(b, 84, -35, 90, -24, 0, GY, 'nz', { mat: 'concrete', railEnd: 10 / 11 });
  hazardEdge(b, 78.1, -56, 78.5, -34, GY);
  prop(b, 'crate', 87.5, GY, -52, { h: 1.2 });
  prop(b, 'crate', 87.5, GY, -50.7, { h: 1.2 });
  prop(b, 'palletGoods', 82, GY, -54, { h: 1.2 });
  prop(b, 'palletGoods', 83.4, GY, -54, { h: 1.2 });
  prop(b, 'gitterbox', 88, GY, -44, { rot: 1, n: 2 });
  prop(b, 'forklift', 83, GY, -41, { rot: 0, tint: 0xe0a020 });
  prop(b, 'desk', 88.6, GY, -37.4, { rot: 3 });
  prop(b, 'locker', 89.4, GY, -39.6, { rot: 3 });
  prop(b, 'electricBox', 78.2, GY, -46, { rot: 1 });
  b.sign('OBERE EMPORE', [90 - 0.12, GY + 3.4, -45], 'nx', 4, 1, { color: 0xffd040, sub: 'LADEBÜHNE +3 m · ZUGANG OBERE HALLE' });

  // ---------------------------------------------------------------- Westgang, Nordwand, Südstreifen
  for (const z of [-52, -46.6, -41.2, -22.2, -16.8]) prop(b, 'rack', 55.2, 0, z, { rot: 1, len: 5.2, h: 7, seed: 9 });
  prop(b, 'forklift', 59, 0, -48, { rot: 2, tint: 0xd06020 });
  prop(b, 'palletStack', 57.6, 0, -37.2, { n: 5 });
  prop(b, 'palletGoods', 58.5, 0, -30, { rot: 1 });
  prop(b, 'gitterbox', 62.5, 0, -13, { rot: 1, n: 2 });
  prop(b, 'barrelGroup', 60, 0, -12.5);
  prop(b, 'crate', 83.5, 0, -14, { h: 1.2 });
  prop(b, 'crate', 83.5, 0, -15.3, { h: 1.2 });
  prop(b, 'palletStack', 87.4, 0, -13, { n: 6 });
  prop(b, 'gitterbox', 86.4, 0, -22.4, { n: 2 });
  prop(b, 'generator', 87.4, 0, -18.4, { rot: 1 });
  prop(b, 'cones', 64, 0, -11.6);
  prop(b, 'cones', 82, 0, -11.6, { rot: 1 });
  prop(b, 'palletGoods', 61.6, 0, -53.4, {});
  prop(b, 'palletGoods', 63, 0, -53.4, {});
  column(b, 63.4, -22.6, 0, 9, 0.5, 0xb8601c);
  column(b, 82.4, -22.6, 0, 9, 0.5, 0xb8601c);
  column(b, 63.4, -45, 0, 9, 0.5, 0xb8601c);
  void floorLabel;

  // ---------------------------------------------------------------- Beschriftung und Markierungen
  b.sign('GLEISFELD B', [72, 11, -56 + 0.12], 'pz', 9, 1.5, { color: 0xf0f0f0, bg: 0xb8601c, sub: 'GLEIS 6 + 7 · SERVERINSEL' });
  b.sign('Z-VERBINDUNG', [54 + 0.14, 3.4, -37], 'px', 3.2, 0.8, { color: 0xffd040, sub: 'ZUR MITTE' });
  b.sign('UNTERE HALLE', [61, 4.8, -56 + 0.12], 'pz', 4, 1, { color: 0x8fc0ff, sub: 'ZUM CT-HOF' });
  b.sign('SÜD-TOR', [73, 6.6, -10 - 0.12], 'nz', 3.6, 0.9, { color: 0xe8e8e8, sub: 'LADESTRASSE' });
  b.sign('GLEIS 6', [66, 5.0, -56 + 0.12], 'pz', 1.8, 0.7, { color: 0xe8c020 });
  b.sign('GLEIS 7', [80, 5.0, -56 + 0.12], 'pz', 1.8, 0.7, { color: 0xe8c020 });
  b.decal({ kind: 'letter', pos: [73, IY + 0.02, -33], size: [4.2, 4.2], text: 'B', color: 0xffb13a });
  b.decal({ kind: 'stripes', pos: [73, 0.02, -12.5], size: [14, 1] });
  b.decal({ kind: 'line', pos: [64.2, 0.02, -33], size: [0.15, 46], color: 0xe8c020 });
  b.decal({ kind: 'line', pos: [81.8, 0.02, -23], size: [0.15, 26], color: 0xe8c020 });
  b.decal({ kind: 'stain', pos: [60, 0.02, -26], size: [6, 4] });
  b.decal({ kind: 'stain', pos: [84, 0.02, -34], size: [5, 4] });

  // ---------------------------------------------------------------- Licht
  for (const x of [58, 66, 74, 82]) for (const z of [-52, -42, -32, -22, -13]) b.hallLamp(x, 10.6, z, { color: 0xe2eeff, intensity: 2.0, range: 22 });
  for (const z of [-36, -50]) b.tubeLamp(55, 4.8, z, false, { color: 0xd8ecff, intensity: 0.7, range: 8 });
  b.wallLamp(54.2, 4.6, -43, 'px', { intensity: 0.7, range: 10 });
  b.wallLamp(54.2, 4.6, -27, 'px', { intensity: 0.7, range: 10 });
  for (const z of [-54, -45]) b.tubeLamp(84, GY + 3.2, z, true, { color: 0xfff0d0, intensity: 0.7, range: 8 });
}
