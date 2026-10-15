import type { MapBuilder } from '../../logic/mapkit';
import { prop } from '../../logic/mapprops';
import { WAGON } from '../../logic/railprops';
import { F, hangSign, hazardEdge, tape } from './common';

/**
 * CT-Bereich (Norden): CT-Hof mit Abstellgleis, Mitte-Nord, Untere Halle B (überdacht),
 * Obere Halle B (Ladeebene +3 m, Rampe aus der Unteren Halle) und die Verwaltung an der Nordwand.
 */
export function buildCT(b: MapBuilder): void {
  ctHof(b);
  mitteNord(b);
  untereHalle(b);
  obereHalle(b);
}

function ctHof(b: MapBuilder): void {
  // Nordwand: Verwaltung („Zentrale“) mit Eingängen und Beschriftung
  for (const x of [-18, 4, 26]) prop(b, 'doorSteel', x, 0, -88 + F, { rot: 0, tint: x === 4 ? 0x2f5f9e : 0x7a8a9a });
  for (const x of [-8, 14, 36]) prop(b, 'rollerDoor', x, 0, -88 + F, { rot: 0, len: 3.8, h: 4 });
  b.sign('ZENTRALE', [10, 8.8, -88 + F + 0.02], 'pz', 10, 1.6, { color: 0xf0f0f0, bg: 0x2f5f9e, sub: 'GÜTERBAHNHOF · FAHRDIENSTLEITUNG · IT-ABTEILUNG' });
  b.sign('CT-SPAWN', [-28 + 0.12, 4.2, -80], 'px', 3, 0.8, { color: 0x8fc0ff, sub: 'KAUFZONE' });
  for (const x of [-12, 0, 20, 32, 44]) b.wallLamp(x, 6.4, -88 + F + 0.05, 'pz', { intensity: 0.8, range: 12 });

  // Abstellgleis (E-W) mit „CT-Zug“: Durchgangswagen, Container-Stapel, Kesselwagen
  prop(b, 'track', 10, 0, -82, { len: 72 });
  prop(b, 'bufferStop', -26.4, 0, -82, { rot: 2 });
  prop(b, 'boxcar', -14, 0, -82, { doors: 'front', ramp: 'front', rampLen: 3.2, tint: 0x3f6a48, seed: 111 });
  prop(b, 'flatcar', 0.6, 0, -82, { n: 2, levels: 2, seed: 112 });
  prop(b, 'tankcar', 36, 0, -82, { tint: 0x55606a });
  // Deckung und Dressing
  prop(b, 'container', -22, 0, -72, { rot: 0, tint: 0xb7791f });
  prop(b, 'palletStack', 4, 0, -69, { n: 6 });
  prop(b, 'palletGoods', 5.6, 0, -69, {});
  prop(b, 'gitterbox', 31, 0, -69.5, { n: 2 });
  prop(b, 'gitterbox', 32.4, 0, -69.5, { n: 2 });
  prop(b, 'forklift', 42, 0, -72, { rot: 1, tint: 0xe0a020 });
  prop(b, 'generator', -26.4, 0, -76.6, { rot: 1 });
  prop(b, 'barrelGroup', -3, 0, -69.4);
  prop(b, 'crate', 46, 0, -84, { h: 1.2 });
  prop(b, 'crate', 46, 0, -85.3, { h: 1.2 });
  prop(b, 'lampPost', -20, 0, -76);
  prop(b, 'lampPost', 12, 0, -69.5);
  prop(b, 'lampPost', 40, 0, -76);
  prop(b, 'signal', -3.6, 0, -78.5, { n: 1 });
  prop(b, 'catenary', 10, 0, -82, { len: 72 });
  prop(b, 'cones', 8, 0, -70);
  prop(b, 'cones', 24, 0, -70, { rot: 1 });
  b.decal({ kind: 'line', pos: [10, 0.02, -72], size: [60, 0.15], color: 0xe8e8e8 });
  b.decal({ kind: 'stain', pos: [18, 0.02, -78], size: [8, 4] });
  b.decal({ kind: 'letter', pos: [18, 0.02, -69], size: [2.4, 2.4], text: 'CT', color: 0x8fc0ff });
  b.decal({ kind: 'stripes', pos: [-21, 0.02, -64], size: [10, 1] });
  // Sandwich-Tor (Halle A) und Leiterraum
  b.sign('SANDWICH ↓', [-21, 5.6, -66 + 0.12], 'pz', 4, 1, { color: 0xffd040, sub: 'ZUM GLEISFELD A' });
  b.sign('LEITERRAUM', [-7, 8.8, -66 + 0.0], 'pz', 4, 0.9, { color: 0xe8e8e8, sub: 'TREPPE → HIMMEL' });
  b.sign('MITTE ↓', [6, 6, -66 + 0.0], 'pz', 3.2, 0.9, { color: 0xe8e8e8, sub: 'MITTE-NORD · VERBINDUNG' });
  hangSign(b, 'UNTERE HALLE B →', 50, 6.6, -76, 0x8fc0ff, 'GLEISFELD B', { alongX: true, rod: 2 });
}

function mitteNord(b: MapBuilder): void {
  prop(b, 'container', 6, 0, -62, { rot: 1, tint: 0x6b3a7a });
  prop(b, 'palletGoods', 2.4, 0, -55, { rot: 1 });
  prop(b, 'palletGoods', 2.4, 0, -53.8, { rot: 1 });
  prop(b, 'gitterbox', 10.4, 0, -52, { n: 2 });
  prop(b, 'barrel', 2.4, 0, -63.5);
  prop(b, 'cones', 6, 0, -50);
  prop(b, 'lampPost', 10.5, 0, -58);
  b.decal({ kind: 'arrow', pos: [6, 0.02, -56], size: [1.6, 3], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'stripes', pos: [6, 0.02, -48.5], size: [12, 1] });
  b.decal({ kind: 'stain', pos: [6, 0.02, -57], size: [5, 4] });
  b.sign('MITTE-NORD', [0 + 0.12, 3.6, -57], 'px', 3.4, 0.9, { color: 0xe8e8e8, sub: 'CT ↑ · MITTE ↓' });
}

function untereHalle(b: MapBuilder): void {
  // Förderband und Hochregale entlang der Wände, Paletten
  prop(b, 'conveyor', 52.4, 0, -72, { rot: 1, len: 14 });
  for (const z of [-85.2, -79.8, -62]) prop(b, 'rack', 67.4, 0, z, { rot: 1, len: 5.2, h: 6, seed: 4 });
  prop(b, 'palletStack', 56, 0, -86, { n: 6 });
  prop(b, 'palletGoods', 57.4, 0, -86, {});
  prop(b, 'gitterbox', 64, 0, -66, { rot: 1, n: 2 });
  prop(b, 'crate', 60, 0, -62, { h: 1.2 });
  prop(b, 'crate', 61.3, 0, -62, { h: 1.2 });
  prop(b, 'crate', 60.6, 1.2, -62, { h: 0.9 });
  prop(b, 'forklift', 62, 0, -76, { rot: 0, tint: 0xd06020 });
  prop(b, 'cableTray', 59, 7.2, -73, { rot: 1, len: 28 });
  prop(b, 'rollerDoor', 50 + F, 0, -64, { rot: 3, len: 3.4, h: 4 });
  b.sign('UNTERE HALLE B', [59, 7.2, -58 - 0.12 + 0.24], 'nz', 5.2, 1.1, { color: 0x8fc0ff, sub: 'GLEISFELD B ↓' });
  b.sign('LAGER 3', [67.88, 3.6, -70], 'nx', 2.2, 0.8, { color: 0xffd040 });
  b.decal({ kind: 'line', pos: [58, 0.02, -72], size: [0.15, 28], color: 0xe8c020 });
  b.decal({ kind: 'stripes', pos: [61, 0.02, -59.4], size: [10, 1] });
  b.decal({ kind: 'arrow', pos: [60, 0.02, -66], size: [1.6, 3], rot: Math.PI, color: 0xe8e8e8 });
  tape(b, 55, -60, 57, -60, 0);
  for (const z of [-84, -76, -68]) b.hallLamp(59, 7.3, z, { intensity: 1.1, range: 14 });
  b.hallLamp(59, 7.3, -61, { intensity: 1.1, range: 14 });
  b.tubeLamp(66, 5.4, -78, false, { color: 0xd8ecff, intensity: 0.8, range: 9 });
}

function obereHalle(b: MapBuilder): void {
  // Ladeebene +3 m: Rampe aus der Unteren Halle, Auflieger, Paletten, Stapler, Fenster nach Norden
  hazardEdge(b, 68, -76, 80, -75.6, 3);
  hazardEdge(b, 67.6, -76, 68, -58, 3);
  for (const z of [-72, -66]) prop(b, 'palletGoods', 72, 3, z, { rot: 1, h: 1.2 });
  prop(b, 'palletStack', 72, 3, -62.6, { n: 6 });
  prop(b, 'trailer', 85, 3, -72, { rot: 1, tint: 0xd0d6dc });
  prop(b, 'forklift', 76, 3, -64, { rot: 0, tint: 0xe0a020 });
  prop(b, 'gitterbox', 70.5, 3, -69.5, { n: 2 });
  prop(b, 'crate', 78.5, 3, -60.5, { h: 1.2 });
  prop(b, 'crate', 79.8, 3, -60.5, { h: 1.2 });
  prop(b, 'shelf', 72, 3, -58.5, { len: 3 });
  prop(b, 'rollerDoor', 90 - F, 3, -64, { rot: 1, len: 3.6, h: 4 });
  prop(b, 'rollerDoor', 90 - F, 3, -78, { rot: 1, len: 3.6, h: 4 });
  b.sign('OBERE HALLE B', [79, 3 + 5.0, -58 - 0.12 + 0.24], 'nz', 5.2, 1.1, { color: 0xffd040, sub: 'LADEEBENE +3 m · RAMPE →' });
  b.sign('B ↓', [84, 3 + 3.4, -58 + 0.12], 'pz', 2.2, 1.0, { color: 0xffb13a, sub: 'EMPORE' });
  b.decal({ kind: 'line', pos: [74, 3.02, -66], size: [0.15, 18], color: 0xe8c020 });
  b.decal({ kind: 'arrow', pos: [74, 3.02, -62], size: [1.6, 3], rot: Math.PI, color: 0xe8e8e8 });
  for (const [x, z] of [[72, -84], [84, -84], [72, -68], [84, -62]] as const) b.hallLamp(x, 3 + 5.8, z, { intensity: 1.1, range: 14 });
  void WAGON;
}
