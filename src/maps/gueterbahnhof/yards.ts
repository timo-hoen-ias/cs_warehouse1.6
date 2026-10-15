import type { MapBuilder } from '../../logic/mapkit';
import { prop } from '../../logic/mapprops';
import { WAGON } from '../../logic/railprops';
import { F, column, floorLabel, hangSign, hazardEdge, railedStairs, tape } from './common';

/**
 * Freiflächen der Karte: T-Hof (Süden), Efeu-Zugang und Efeu (Westen), Hauptgang, Altzug,
 * Mittelgang, Mitte, Z-Verbindung, Ostgang mit Laderampe, Ladestraße und die Packhallen-
 * Dachterrasse samt Stellwerk-Balkon (Sniper-Nest). Gleise liegen hier längs Z (rot 1).
 */
export function buildYards(b: MapBuilder): void {
  tHof(b);
  efeu(b);
  hauptgang(b);
  mitte(b);
  zVerbindung(b);
  ostgang(b);
  packhalle(b);
  stellwerk(b);
}

/** Wagenreihe entlang Z auf Gleis x: Zentren z0, z0 + pitch, … (Typ je Eintrag). */
type CarSpec = { kind: 'boxcar' | 'tankcar' | 'flatcar' | 'loco'; opts?: Parameters<typeof prop>[5] };
function trainZ(b: MapBuilder, x: number, z0: number, dir: 1 | -1, cars: CarSpec[]): void {
  let z = z0;
  for (const c of cars) {
    const half = c.kind === 'loco' ? WAGON.locoLength / 2 : WAGON.length / 2;
    if (c !== cars[0]) z += dir * (half + 0.3);
    prop(b, c.kind, x, 0, z, { rot: 1, ...c.opts });
    z += dir * (half + 0.15);
  }
}

// ------------------------------------------------------------------ T-Hof
function tHof(b: MapBuilder): void {
  // Südwand: Rolltore der Güterabfertigung, Schilder, Rampen
  for (const x of [-26, -14, -2, 10, 22, 34, 46]) {
    prop(b, 'rollerDoor', x, 0, 76 - F, { rot: 2, len: 3.8, h: 4 });
    for (const dx of [-3, 3]) prop(b, 'bumper', x + dx, 0, 75.4, { rot: 0 });
  }
  for (const [i, x] of [-26, -14, -2, 10, 22, 34, 46].entries()) b.sign(`TOR ${i + 1}`, [x, 6.2, 76 - F - 0.02], 'nz', 2.2, 0.8, { color: 0xffd040 });
  b.sign('GÜTERABFERTIGUNG', [10, 8.4, 76 - F - 0.02], 'nz', 8, 1.3, { color: 0xf0f0f0, bg: 0x2f5f9e, sub: 'EINFAHRT GLEISFELD · ALLE RICHTUNGEN' });
  for (const x of [-20, 4, 28, 52]) b.wallLamp(x, 6.8, 76 - F - 0.05, 'nz', { intensity: 0.8, range: 12 });

  // Gleise (längs Z) mit Prellböcken und geparkten Wagen
  for (const x of [-24, 36]) {
    prop(b, 'track', x, 0, 60, { len: 32, rot: 1 });
    prop(b, 'bufferStop', x, 0, 75.4, { rot: 1 });
  }
  trainZ(b, -24, 68, -1, [{ kind: 'boxcar', opts: { worn: true, tint: 0x8a3a2c, seed: 51 } }, { kind: 'flatcar', opts: { n: 2, seed: 52 } }]);
  trainZ(b, 36, 68, -1, [{ kind: 'tankcar', opts: { tint: 0xa8b4bc } }, { kind: 'boxcar', opts: { doors: 'both', ramp: 'both', rampLen: 3.6, tint: 0x6a4a34, seed: 53 } }]);

  // Docks: Auflieger an den Toren, Container, Paletten, Stapler
  prop(b, 'trailer', 22, 0, 68.9, { rot: 1, tint: 0xe6e6e6 });
  prop(b, 'trailer', 46, 0, 68.9, { rot: 1, tint: 0x2a5aa8 });
  prop(b, 'cargoContainer', -31, 0, 66, { rot: 1, tint: 0x2f7d4f });
  prop(b, 'cargoContainer', -31, 2.59, 66, { rot: 1, tint: 0xa8432b });
  prop(b, 'cargoContainer', 14.5, 0, 52, { rot: 0, tint: 0xb7791f });
  prop(b, 'palletStack', 3, 0, 72.6, { n: 6 });
  prop(b, 'palletGoods', 4.6, 0, 72.6, {});
  prop(b, 'palletGoods', 6, 0, 72.6, {});
  prop(b, 'gitterbox', -9, 0, 72.8, { n: 2 });
  prop(b, 'gitterbox', -7.6, 0, 72.8, { n: 2 });
  prop(b, 'forklift', 16, 0, 71, { rot: 2, tint: 0xe0a020 });
  prop(b, 'palletGoods', 30, 0, 52, { h: 1.2 });
  prop(b, 'crate', 18, 0, 46, { h: 1.2 });
  prop(b, 'crate', 19.3, 0, 46, { h: 1.2 });
  prop(b, 'crate', 18.6, 1.2, 46, { h: 0.9 });
  prop(b, 'barrelGroup', -18, 0, 45);
  prop(b, 'cartons', 41, 0, 45);
  prop(b, 'handTruck', 8, 0, 70.5, { rot: 1 });
  prop(b, 'lampPost', -12, 0, 62);
  prop(b, 'lampPost', 14, 0, 62);
  prop(b, 'lampPost', 52, 0, 56);
  prop(b, 'lampPost', -30, 0, 46);
  prop(b, 'cones', -2, 0, 55);
  prop(b, 'cones', 12, 0, 60, { rot: 1 });
  // Fahrleitung über den beiden Gleisen
  for (const x of [-24, 36]) prop(b, 'catenary', x, 0, 60, { len: 32, rot: 1 });
  b.decal({ kind: 'line', pos: [3, 0.02, 56], size: [34, 0.15], color: 0xe8e8e8 });
  for (const x of [-14, -8, -2, 4, 10]) b.decal({ kind: 'line', pos: [x, 0.02, 63], size: [0.15, 8], color: 0xe8e8e8 });
  b.decal({ kind: 'stain', pos: [8, 0.02, 50], size: [8, 6] });
  b.decal({ kind: 'stain', pos: [-6, 0.02, 44], size: [5, 4] });
  // Richtungsschilder am Ausgang nach Norden (an der Werkstattwand und der Packhalle)
  b.sign('← EFEU', [-34 + 0.12, 3.2, 46], 'px', 3.2, 0.9, { color: 0x90d060, sub: 'GLEISFELD A · LANG' });
  b.sign('HAUPTGANG ↑', [-12 + 0.12, 3.6, 44], 'px', 3.8, 0.9, { color: 0xffd040, sub: 'MITTE · VERBINDUNG' });
  b.sign('OSTGANG →', [56 - 0.12, 4.2, 46], 'nx', 3.4, 0.9, { color: 0xffb070, sub: 'LADERAMPE · GLEISFELD B' });
  void column;
}

// ------------------------------------------------------------------ Efeu-Zugang und Efeu
function efeu(b: MapBuilder): void {
  // Zugang: zwei Gleise längs X mit Prellböcken im Westen
  for (const z of [57, 67]) {
    prop(b, 'track', -57, 0, z, { len: 44 });
    prop(b, 'bufferStop', -78.6, 0, z, { rot: 2 });
  }
  prop(b, 'boxcar', -52, 0, 57, { worn: true, tint: 0x6a4a34, seed: 61 });
  prop(b, 'flatcar', -67, 0, 57, { n: 1, seed: 62 });
  prop(b, 'tankcar', -46, 0, 67, { tint: 0xb8c4cc });
  prop(b, 'boxcar', -66.6, 0, 67, { doors: 'front', ramp: 'front', rampLen: 3.4, tint: 0x3f6a48, seed: 63 });
  prop(b, 'palletStack', -40, 0, 54, { n: 6 });
  prop(b, 'crate', -38.2, 0, 53.2, { h: 1.2 });
  prop(b, 'barrelGroup', -36, 0, 70.5);
  prop(b, 'cartons', -74, 0, 53);
  prop(b, 'lampPost', -42, 0, 62);
  prop(b, 'lampPost', -70, 0, 62);
  // Efeu bewächst die Nordwand des Zugangs
  prop(b, 'ivy', -45, 0, 52, { rot: 0, len: 24, h: 6, seed: 7 });
  prop(b, 'ivy', -68, 0, 52, { rot: 0, len: 20, h: 6, seed: 8 });

  // Efeu: schmaler Außengang (10 m) entlang der Westwand, Efeu an beiden Wänden, versetzte Deckung
  prop(b, 'ivy', -80, 0, 30, { rot: 3, len: 40, h: 7, seed: 9 });
  prop(b, 'ivy', -80, 0, -2, { rot: 3, len: 28, h: 7, seed: 10 });
  prop(b, 'ivy', -70, 0, 30, { rot: 1, len: 40, h: 6, seed: 11 });
  prop(b, 'ivy', -70, 0, 3, { rot: 1, len: 14, h: 6, seed: 12 });
  prop(b, 'track', -75, 0, 17, { len: 66, rot: 1 });
  prop(b, 'bufferStop', -75, 0, -16.6, { rot: 3 });
  prop(b, 'boxcar', -75, 0, 38, { rot: 1, worn: true, tint: 0x8a3a2c, seed: 65 });
  prop(b, 'flatcar', -75, 0, 8, { rot: 1, n: 1, seed: 66 });
  prop(b, 'cargoContainer', -78.6, 0, 21, { rot: 1, tint: 0x2b5f9e });
  prop(b, 'crate', -71.4, 0, 25, { h: 1.2 });
  prop(b, 'crate', -71.4, 0, 26.3, { h: 1.2 });
  prop(b, 'palletStack', -78.8, 0, 47, { n: 5 });
  prop(b, 'gitterbox', -71.5, 0, 14, { rot: 1, n: 2 });
  prop(b, 'barrel', -78.8, 0, -3);
  prop(b, 'barrel', -78.1, 0, -3.8);
  prop(b, 'palletGoods', -71.6, 0, -10, { rot: 1 });
  prop(b, 'lampPost', -78, 0, 12);
  prop(b, 'lampPost', -72, 0, -12);
  prop(b, 'cones', -75, 0, 28, { rot: 1 });
  b.sign('EFEU', [-80 + 0.14, 3.4, 44], 'px', 2.4, 0.9, { color: 0x90d060, sub: 'LANG · ZU GLEISFELD A' });
  b.sign('GLEISFELD A →', [-70 - 0.1, 3.8, -8], 'nx', 3.6, 0.9, { color: 0xff5a4a, sub: 'TÜR 7 · FAHRDIENSTLEITER MELDEN' });
  b.sign('ACHTUNG', [-70 - 0.1, 3.6, 24], 'nx', 2.2, 0.8, { color: 0xffd040, sub: 'ZUGVERKEHR' });
  b.decal({ kind: 'stain', pos: [-75, 0.02, 32], size: [3, 6] });
  b.decal({ kind: 'arrow', pos: [-75, 0.02, 44], size: [1.4, 2.4], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'stripes', pos: [-69.6, 0.02, -11], size: [1.2, 10] });
  prop(b, 'catenary', -75, 0, 17, { len: 66, rot: 1 });
}

// ------------------------------------------------------------------ Hauptgang, Altzug, Mittelgang
function hauptgang(b: MapBuilder): void {
  // Hauptgang-Gleis (x = −2): Containerwagen, Durchgangswagen, Kesselwagen
  prop(b, 'track', -2, 0, 11, { len: 64, rot: 1 });
  prop(b, 'bufferStop', -2, 0, -21.6, { rot: 3 });
  trainZ(b, -2, 34, -1, [
    { kind: 'flatcar', opts: { n: 2, levels: 1, seed: 71 } },
    { kind: 'boxcar', opts: { doors: 'both', ramp: 'both', rampLen: 4, tint: 0x35557a, seed: 72 } },
    { kind: 'tankcar', opts: { tint: 0xe0c860 } },
  ]);
  // Altzug (x = 14.5): rostiger „alter Bombenzug“ mit Durchgangswagen und alter Lok
  prop(b, 'track', 14.5, 0, 6, { len: 76, rot: 1 });
  prop(b, 'bufferStop', 14.5, 0, -24.6, { rot: 3 });
  trainZ(b, 14.5, 34, -1, [
    { kind: 'boxcar', opts: { worn: true, tint: 0x8a3a2c, seed: 73 } },
    { kind: 'boxcar', opts: { worn: true, tint: 0x6a4a34, doors: 'both', ramp: 'both', rampLen: 3.4, seed: 74 } },
    { kind: 'boxcar', opts: { worn: true, tint: 0x7a6a4a, seed: 75 } },
    { kind: 'loco', opts: { tint: 0x3a4a3a } },
  ]);
  b.sign('ALTER BOMBENZUG', [14.5, 4.6, 34 + 7.1 + 0.02], 'pz', 3.2, 0.8, { color: 0xffb13a, sub: 'AUSSER DIENST · BETRETEN VERBOTEN' });
  // Deckung im Hauptgang
  prop(b, 'cargoContainer', -10.2, 0, 26, { rot: 1, tint: 0x8a8f96 });
  prop(b, 'palletStack', 6.6, 0, 22, { n: 6 });
  prop(b, 'palletGoods', 6.6, 0, 20.4, { rot: 1 });
  prop(b, 'crate', -10.5, 0, 12, { h: 1.2 });
  prop(b, 'crate', -10.5, 0, 10.7, { h: 1.2 });
  prop(b, 'gitterbox', 6.8, 0, 3, { rot: 1, n: 2 });
  prop(b, 'barrelGroup', -10.6, 0, -4);
  prop(b, 'lampPost', -9, 0, 33);
  prop(b, 'lampPost', 6, 0, 8);
  prop(b, 'cones', 4, 0, 36);
  b.sign('HAUPTGANG', [-12 + 0.12, 4.6, 24], 'px', 3.6, 0.9, { color: 0xffd040, sub: 'GLEISFELD A ←  ·  MITTE ↑' });
  // Mittelgang (zwischen Altzug und Packhalle)
  prop(b, 'crate', 22.8, 0, 36, { h: 1.2 });
  prop(b, 'crate', 22.8, 0, 34.7, { h: 1.2 });
  prop(b, 'drum', 22.4, 0, 28, { rot: 1 });
  prop(b, 'palletGoods', 22.8, 0, 20, { rot: 1, h: 1.3 });
  prop(b, 'barrel', 23, 0, 12.5);
  prop(b, 'cableTray', 23.4, 3.4, 20, { rot: 1, len: 26 });
  b.sign('MITTELGANG', [24 - 0.12, 4, 38], 'nx', 3.2, 0.8, { color: 0xe8e8e8, sub: 'PACKHALLE' });
  b.decal({ kind: 'line', pos: [19.5, 0.02, 24], size: [0.15, 30], color: 0xe8c020 });
}

// ------------------------------------------------------------------ Mitte (Verbindung)
function mitte(b: MapBuilder): void {
  // Gleis 3 setzt sich aus der Halle fort: Durchgangswagen und Container-Flachwagen
  prop(b, 'track', 11, 0, -36, { len: 46 });
  prop(b, 'bufferStop', 33.2, 0, -36, { rot: 0 });
  prop(b, 'boxcar', -2.9, 0, -36, { doors: 'both', ramp: 'both', rampLen: 3.6, tint: 0x7a7f84, seed: 81 });
  prop(b, 'flatcar', 21.8, 0, -36, { n: 2, levels: 1, seed: 82 });
  // Container-Burg und Deckung
  prop(b, 'cargoContainer', 6, 0, -17, { rot: 1, tint: 0xa8432b });
  prop(b, 'cargoContainer', 6, 2.59, -17, { rot: 1, tint: 0x2b5f9e });
  prop(b, 'cargoContainer', 9.6, 0, -22.2, { rot: 0, tint: 0x8a8f96 });
  prop(b, 'palletStack', 18, 0, -8, { n: 6 });
  prop(b, 'palletGoods', 19.5, 0, -8, {});
  prop(b, 'crateStack', 2, 0, -3, {});
  prop(b, 'crate', 31.5, 0, -30, { h: 1.2 });
  prop(b, 'crate', 31.5, 0, -28.7, { h: 1.2 });
  prop(b, 'gitterbox', -9.4, 0, -22, { n: 2 });
  prop(b, 'barrelGroup', 26, 0, -22);
  prop(b, 'forklift', 20, 0, -44, { rot: 1, tint: 0xd06020 });
  prop(b, 'palletGoods', 27.5, 0, -42, { h: 1.1 });
  prop(b, 'palletGoods', 29, 0, -42, { h: 1.1 });
  prop(b, 'lampPost', -8, 0, -30);
  prop(b, 'lampPost', 12, 0, -8);
  prop(b, 'lampPost', 22, 0, -12);
  prop(b, 'signal', 9.5, 0, -26, { n: 1 });
  prop(b, 'signal', 22.5, 0, -33, { n: 0 });
  prop(b, 'cones', 14, 0, -27);
  // Fahrleitung quer über die Mitte
  prop(b, 'catenary', 11, 0, -36, { len: 44 });
  // Gleiswaage mit Markierung
  b.decal({ kind: 'grid', pos: [14, 0.02, -2], size: [8, 5] });
  b.decal({ kind: 'letter', pos: [3, 0.02, -28], size: [3.6, 3.6], text: 'M', color: 0xe8c020 });
  b.decal({ kind: 'arrow', pos: [6, 0.02, -44], size: [1.6, 3], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'stain', pos: [16, 0.02, -24], size: [7, 5] });
  b.decal({ kind: 'stain', pos: [-4, 0.02, -8], size: [6, 4] });
  b.sign('MITTE', [-12 + 0.12, 3.6, -20], 'px', 3.2, 0.9, { color: 0xe8e8e8, sub: 'VERBINDUNG' });
  b.sign('Z ↗', [34 - 0.12, 3.8, -23], 'nx', 2.6, 0.9, { color: 0xffd040, sub: 'Z-VERBINDUNG → B' });
  b.sign('CT ↑', [0 + 0.12, 3.4, -52], 'px', 2.4, 0.9, { color: 0x8fc0ff, sub: 'MITTE-NORD' });
}

// ------------------------------------------------------------------ Z-Verbindung
function zVerbindung(b: MapBuilder): void {
  prop(b, 'ivy', 38, 0, -26, { rot: 0, len: 6, h: 3.5, seed: 13 }); // Nordwand von Z1
  prop(b, 'crate', 36, 0, -21.2, { h: 1.2 });
  prop(b, 'crate', 36, 0, -22.5, { h: 1.2 });
  prop(b, 'barrelGroup', 44.2, 0, -28);
  prop(b, 'palletGoods', 41.4, 0, -37, { rot: 1 });
  prop(b, 'cones', 48, 0, -38.5);
  prop(b, 'lampPost', 42.5, 0, -24);
  b.sign('Z-VERBINDUNG', [39 + 0.0, 3.8, -20 + 0.12], 'nz', 3.8, 0.9, { color: 0xffd040, sub: 'GLEISFELD B →' });
  b.decal({ kind: 'letter', pos: [43, 0.02, -30], size: [3.4, 3.4], text: 'Z', color: 0xe8c020 });
  b.decal({ kind: 'stripes', pos: [53, 0.02, -37], size: [1.4, 6] });
  b.wallLamp(46 - 0.1, 5.4, -24, 'nx', { intensity: 0.8, range: 11 });
  b.wallLamp(48, 5.4, -34 + 0.1, 'pz', { intensity: 0.8, range: 11 });
  b.wallLamp(40 + 0.1, 5.4, -32, 'px', { intensity: 0.8, range: 11 });
}

// ------------------------------------------------------------------ Ostgang, Laderampe, Ladestraße
function ostgang(b: MapBuilder): void {
  // Gleis (x = 47.2) neben der Laderampe: Durchgangswagen auf Höhe der Rampenkante
  prop(b, 'track', 47.2, 0, 20, { len: 52, rot: 1 });
  prop(b, 'bufferStop', 47.2, 0, -5.4, { rot: 3 });
  prop(b, 'boxcar', 47.2, 0, 31, { rot: 1, doors: 'both', ramp: 'front', rampLen: 3.8, tint: 0x6a4a34, worn: true, seed: 91 });
  prop(b, 'boxcar', 47.2, 0, 16.4, { rot: 1, doors: 'both', ramp: 'front', rampLen: 3.8, tint: 0x3f6a48, seed: 92 });
  prop(b, 'flatcar', 47.2, 0, 1.8, { rot: 1, n: 2, levels: 1, seed: 93 });
  // Laderampe (Dock, +1.3 m) vor dem Güterschuppen, Rampen an beiden Enden
  b.floor(49, 12, 56, 40, WAGON.floor, 'concrete', { thick: 1.3, top: 'concrete', tint: 0xa8a49c, tag: 'platform' });
  b.ramp(49, 40, 56, 46, 0, WAGON.floor, 'nz', 'concrete', { tag: 'ramp', tint: 0xa8a49c });
  b.ramp(49, 6, 56, 12, 0, WAGON.floor, 'pz', 'concrete', { tag: 'ramp', tint: 0xa8a49c });
  hazardEdge(b, 49, 12, 49.4, 40, WAGON.floor);
  hazardEdge(b, 49, 40, 56, 40.4, 0);
  for (const z of [18, 26, 34]) prop(b, 'rollerDoor', 56 - F, WAGON.floor, z, { rot: 1, len: 4, h: 4 });
  for (const z of [22, 30]) b.wallLamp(56 - F - 0.05, 6.6, z, 'nx', { intensity: 0.8, range: 12 });
  prop(b, 'palletGoods', 54, WAGON.floor, 16, { h: 1.1 });
  prop(b, 'palletGoods', 54, WAGON.floor, 22, { h: 1.2, rot: 1 });
  prop(b, 'gitterbox', 54.4, WAGON.floor, 29, { n: 2 });
  prop(b, 'forklift', 52.5, WAGON.floor, 36, { rot: 3, tint: 0xe0a020 });
  prop(b, 'crate', 54.6, WAGON.floor, 38.5, { h: 1.1 });
  b.sign('LADERAMPE', [56 - 0.12, WAGON.floor + 5.4, 28], 'nx', 4, 1, { color: 0xffd040, sub: 'GÜTERSCHUPPEN · TOR 1–3' });
  // Ostgang-Deckung
  prop(b, 'cargoContainer', 38.5, 0, 30, { rot: 1, tint: 0xa8432b });
  prop(b, 'cargoContainer', 38.5, 0, 22, { rot: 1, tint: 0x8a8f96 });
  prop(b, 'palletStack', 36, 0, 12, { n: 5 });
  prop(b, 'crate', 42.8, 0, 8, { h: 1.2 });
  prop(b, 'crate', 42.8, 0, 6.7, { h: 1.2 });
  prop(b, 'barrelGroup', 36.5, 0, 0);
  prop(b, 'gitterbox', 42, 0, -2, { n: 2 });
  prop(b, 'lampPost', 36, 0, 38);
  prop(b, 'lampPost', 52.5, 0, 4);
  prop(b, 'signal', 40.5, 0, 14, { rot: 0, n: 1 });
  prop(b, 'catenary', 47.2, 0, 20, { len: 48, rot: 1 });
  b.decal({ kind: 'line', pos: [43, 0.02, 14], size: [0.15, 50], color: 0xe8c020 });
  b.sign('OSTGANG', [34 + 0.12, 3.6, 36], 'px', 3.2, 0.9, { color: 0xffb070, sub: 'LADERAMPE · GLEISFELD B' });
  // Ladestraße Süd (vor dem Süd-Tor von Gleisfeld B)
  prop(b, 'trailer', 70, 0, 4.6, { rot: 0, tint: 0xe6e6e6 });
  prop(b, 'trailer', 85.5, 0, 3.6, { rot: 1, tint: 0x2a5aa8 });
  prop(b, 'cargoContainer', 60, 0, -2, { rot: 1, tint: 0x6b3a7a });
  prop(b, 'palletStack', 62.5, 0, 8, { n: 6 });
  prop(b, 'palletGoods', 64, 0, 8, {});
  prop(b, 'palletGoods', 77, 0, 8.6, { rot: 1, h: 1.3 });
  prop(b, 'forklift', 74, 0, -3, { rot: 3 });
  prop(b, 'barrelGroup', 83, 0, 4);
  prop(b, 'lampPost', 62, 0, 2);
  prop(b, 'lampPost', 84, 0, 8);
  prop(b, 'cones', 66, 0, -6);
  prop(b, 'cones', 80, 0, -6, { rot: 1 });
  b.sign('GLEISFELD B', [73, 7.8, -8 + 0.0 + 0.12], 'pz', 9, 1.5, { color: 0xf0f0f0, bg: 0xb8601c, sub: 'SERVERINSEL · IT-ABTEILUNG' });
  b.decal({ kind: 'stripes', pos: [73, 0.02, -7], size: [16, 1] });
  b.decal({ kind: 'letter', pos: [73, 0.02, 2], size: [4, 4], text: 'B', color: 0xffb13a });
  b.decal({ kind: 'stain', pos: [66, 0.02, 4], size: [7, 4] });
}

// ------------------------------------------------------------------ Packhalle: Dachterrasse mit Treppe
function packhalle(b: MapBuilder): void {
  const Y = 7;
  // Treppe von der Mitte auf die Dachterrasse (Nordseite)
  railedStairs(b, 26, -19, 32, -3, 0, Y, 'pz', { mat: 'concrete', railEnd: 15 / 16 }); // endet 1 m auf dem Dach (saubere Navigationsanbindung)
  hazardEdge(b, 26, -19.4, 32, -19, 0);
  // Brüstung (Bewegung blockiert, Schüsse nicht) und Dachaufbauten
  b.rail(24.05, -4, 24.05, 30, Y, 1.0);
  b.rail(33.95, -4, 33.95, 30, Y, 1.0);
  b.rail(24, 29.95, 34, 29.95, Y, 1.0);
  b.rail(24, -3.95, 26, -3.95, Y, 1.0);
  b.rail(32, -3.95, 34, -3.95, Y, 1.0);
  for (const z of [4, 16, 26]) prop(b, 'acUnit', 29, Y, z, { rot: 0 });
  prop(b, 'crate', 31.2, Y, 8, { h: 1.2 });
  prop(b, 'crate', 31.2, Y, 9.3, { h: 1.2 });
  prop(b, 'palletGoods', 26, Y, 12, { rot: 1, h: 1.0 });
  prop(b, 'ibc', 27, Y, 21);
  prop(b, 'cableTray', 29, Y + 0.1, 14, { rot: 1, len: 8 });
  prop(b, 'lampPost', 25, Y, 0);
  b.sign('PACKHALLE', [29, Y + 1.6, 30 - 0.05], 'nz', 5.4, 1.2, { color: 0xf0f0f0, bg: 0x6a3a2a, sub: 'DACHTERRASSE · BETRETEN AUF EIGENE GEFAHR' });
  b.sign('DACHTERRASSE', [24 + 0.12, 3.0, -14], 'px', 3.6, 0.9, { color: 0xffd040, sub: 'TREPPE ↑' });
  b.light({ kind: 'lamp', pos: [29, Y + 5.5, 6], color: 0xffe2b0, intensity: 0.9, range: 14 });
  b.light({ kind: 'lamp', pos: [29, Y + 5.5, 22], color: 0xffe2b0, intensity: 0.9, range: 14 });
}

// ------------------------------------------------------------------ Stellwerk: Treppe in der Gasse, Balkon über der Mitte
function stellwerk(b: MapBuilder): void {
  const BY = 5.8;
  railedStairs(b, 26, -66, 32, -51, 0, BY, 'pz', { mat: 'concrete', railEnd: 14 / 15 });
  b.floor(26, -52, 32, -48, BY, 'steel', { thick: 0.4, top: 'grating', tint: 0x5a6a7a, tag: 'platform' });
  b.floor(14, -48, 32, -44, BY, 'steel', { thick: 0.4, top: 'grating', tint: 0x5a6a7a, tag: 'platform' });
  b.rail(14, -43.95, 32, -43.95, BY);
  b.rail(14.05, -48, 14.05, -44, BY);
  b.rail(31.95, -48, 31.95, -44, BY);
  b.rail(26, -52.05, 26.0, -48, BY);
  for (const x of [15, 23, 31]) column(b, x, -44.3, 0, BY - 0.4);
  // Gasse: Wände sind Gebäudemasse; Kisten als Deckung auf dem Balkon
  prop(b, 'crate', 16.5, BY, -45.5, { h: 1.0 });
  prop(b, 'crate', 16.5, BY, -46.8, { h: 1.0 });
  prop(b, 'desk', 21, BY, -47.4, { rot: 2 });
  prop(b, 'electricBox', 18, BY, -48 + 0.0, { rot: 0 });
  prop(b, 'locker', 24, BY, -47.6, { rot: 2 });
  // Fensterfront und Beschriftung des Stellwerks
  b.box([14, BY + 1.6, -48.06], [26, BY + 3.0, -48.02], 'window', { collide: 'none', uvFit: true, noNav: true, occlude: false, tint: 0xc8d4dc });
  b.sign('STELLWERK', [20, BY + 4.4, -48.12], 'pz', 5.4, 1.2, { color: 0xf0f0f0, bg: 0x2a4a7a, sub: 'FAHRDIENSTLEITUNG · NUR BEFUGTE' });
  b.sign('SNIPER-NEST', [20, BY + 0.2, -48.12], 'pz', 3, 0.7, { color: 0xff5a4a, sub: 'AUSSICHT AUF DIE MITTE' });
  b.sign('STELLWERK ↑', [26 - 0.12, 3.2, -62], 'nx', 3.4, 0.9, { color: 0xffd040, sub: 'TREPPE → BALKON' });
  b.wallLamp(18, BY + 2.6, -48.2, 'pz', { intensity: 0.9, range: 12 });
  b.wallLamp(26, BY + 2.6, -48.2, 'pz', { intensity: 0.9, range: 12 });
  void hangSign; void floorLabel; void tape;
}
