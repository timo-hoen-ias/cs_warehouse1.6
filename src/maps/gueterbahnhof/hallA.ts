import type { MapBuilder } from '../../logic/mapkit';
import { prop } from '../../logic/mapprops';
import { WAGON } from '../../logic/railprops';
import { F, column, floorLabel, hangSign, hazardEdge, railedStairs, tape } from './common';

/**
 * Gleisfeld A (überdachte Güterhalle, 54 × 56 m): Gleise 1–5 mit Zügen, Himmel-Galerie
 * über der Nordwand (Sandwich darunter), Kranbahn mit Laufstegen, Leiterraum-Treppe,
 * Popdog-Grube. Der Bombenzug (Gleis 3) trägt den IT-Wagen mit „Serverschrank A“.
 *
 * Höhen: Boden 0, Wagenboden 1.3, Wagendach 3.74, Himmel 5.0, Kranbahn 8.4, Grube −1.4.
 */
export const HALL_A = {
  /** Gleise 1–5 (z). */
  tracks: [-52, -44, -36, -28, -20],
  /** IT-Wagen (Serverschrank A): Mittelpunkt x, Gleis 3. */
  itX: -50.4,
  gallery: 5,
  catwalk: 8.4,
};

export function buildHallA(b: MapBuilder): void {
  const RR = WAGON.roof + 0.14; // Wagendach (Oberkante)
  const [G1, G2, G3, G4, G5] = HALL_A.tracks as [number, number, number, number, number];
  const GY = HALL_A.gallery;
  const CY = HALL_A.catwalk;

  // ---------------------------------------------------------------- Dach, Binder, Oberlicht-Spalten
  // sieben Bahnen à 6 m mit 2 m Spalten: echte Sonnenstreifen auf Wagen und Boden
  for (let k = 0; k < 7; k++) b.box([-68, 14, -62 + 8 * k], [-14, 14.4, -56 + 8 * k], 'roof', { tag: 'roof', noNav: true });
  for (const x of [-62, -53, -44, -35, -26, -17]) prop(b, 'truss', x, 11.6, -34, { rot: 1, len: 56, h: 2.4 });
  for (let z = -60; z < -6; z += 8) b.box([-68, 13.6, z - 0.1], [-14, 14, z + 0.1], 'steel', { collide: 'none', noNav: true, occlude: false, tint: 0x4a5662 });

  // ---------------------------------------------------------------- Gleise, Prellböcke
  for (const z of HALL_A.tracks) prop(b, 'track', -41, 0, z, { len: 54 });
  for (const z of [G2, G3]) {
    prop(b, 'track', -6.5, 0, z, { len: 13 });
    prop(b, 'bufferStop', -0.8, 0, z);
  }
  for (const z of HALL_A.tracks) prop(b, 'bufferStop', -67.4, 0, z, { rot: 2 });

  // ---------------------------------------------------------------- Züge
  const P = WAGON.pitch - 0.15;
  const S1 = -57.2, S2 = S1 + P, S3 = -22;
  // Gleis 1 (Sandwich-Seite): Altzug mit begehbaren Dächern (Aufgang von Himmel)
  prop(b, 'boxcar', S1, 0, G1, { worn: true, walkRoof: true, tint: 0x8a3a2c, seed: 3 });
  prop(b, 'boxcar', S2, 0, G1, { worn: true, walkRoof: true, tint: 0x6a4a34, seed: 4 });
  prop(b, 'tankcar', S3, 0, G1, { tint: 0xa8b4bc });
  // Gleis 2: Container-Flachwagen, Kesselwagen, hochgestapelte Container
  prop(b, 'flatcar', S1, 0, G2, { n: 2, levels: 1, seed: 11 });
  prop(b, 'tankcar', S2, 0, G2, { tint: 0xe0c860 });
  prop(b, 'flatcar', S3, 0, G2, { n: 1, levels: 2, seed: 12 });
  // Gleis 3: Bombenzug — IT-Wagen, Durchgangswagen, einfahrende Lok (steht im Ost-Tor)
  const IT = HALL_A.itX;
  prop(b, 'boxcar', IT, 0, G3, { doors: 'both', ramp: 'both', rampLen: 3.4, tint: 0x2f5f9e, seed: 21 });
  prop(b, 'boxcar', IT + WAGON.pitch, 0, G3, { doors: 'both', ramp: 'both', rampLen: 3.4, tint: 0x3f6a48, seed: 22 });
  prop(b, 'loco', IT + WAGON.pitch + WAGON.pitch / 2 + WAGON.locoLength / 2 + 0.1, 0, G3, { tint: 0xe08a1c });
  // Gleis 4
  prop(b, 'boxcar', S1, 0, G4, { doors: 'front', ramp: 'front', rampLen: 3, tint: 0x7a7f84, seed: 31 });
  prop(b, 'boxcar', S3, 0, G4, { tint: 0x8a3a2c, worn: true, seed: 32 });
  // Gleis 5
  prop(b, 'boxcar', S2, 0, G5, { doors: 'both', ramp: 'both', rampLen: 3, tint: 0x35557a, seed: 41 });
  prop(b, 'flatcar', S3, 0, G5, { n: 2, levels: 1, seed: 42 });

  // IT-Wagen: Serverschränke an der Nordwand, USV und Kühlung, Kabel — hier liegt der Spot
  const itFloor = WAGON.floor;
  prop(b, 'serverRow', IT - 4.1, itFloor, G3 - 0.8, { n: 6 });
  prop(b, 'serverRow', IT + 4.1, itFloor, G3 - 0.8, { n: 6 });
  prop(b, 'ups', IT - 1.9, itFloor, G3 + 1.05, {});
  prop(b, 'cooler', IT + 2.2, itFloor, G3 + 1.0, {});
  b.tubeLamp(IT, 3.3, G3, true, { color: 0xbfe0ff, intensity: 1.0, range: 7 });
  b.light({ kind: 'lamp', pos: [IT - 4, 2.4, G3 - 0.2], color: 0x40c8ff, intensity: 0.45, range: 5 });
  b.light({ kind: 'lamp', pos: [IT + 4, 2.4, G3 - 0.2], color: 0x40c8ff, intensity: 0.45, range: 5 });
  // Durchgangswagen: Gitterboxen und Kartons als Ladung
  prop(b, 'gitterbox', IT + WAGON.pitch - 3.5, itFloor, G3 - 0.75, { n: 1 });
  prop(b, 'palletGoods', IT + WAGON.pitch + 3.8, itFloor, G3 - 0.75, { tint: 0xd8d8d0, h: 0.9 });

  // ---------------------------------------------------------------- Himmel: Galerie über der Nordwand (Sandwich darunter)
  b.floor(-68, -62, -12, -55, GY, 'steel', { thick: 0.4, top: 'grating', tint: 0x5a6a7a, tag: 'platform' });
  b.floor(-36, -62, -12, -55, GY, 'concrete', { thick: 0.4, top: 'tile', tint: 0xb8b4a8, tag: 'platform' });
  for (const [x0, x1] of [[-68, -62.2], [-56.8, -46.6], [-41.6, -36], [-36, -12]] as const) b.rail(x0, -55.05, x1, -55.05, GY);
  for (const x of [-64, -55, -46, -37, -28, -19]) column(b, x, -55.15, 0, GY - 0.4);
  // Aufgänge von Himmel auf die Altzug-Dächer (Gleis 1): Dach liegt 1.26 m unter der Galerie
  for (const x of [-61, -44.4]) b.stairs(x, -57, x + 2.4, -53.5, RR, GY, 'nz', 'steel', { top: 'grating', tint: 0x6a7480 });
  // Büroteil: Leitstand mit Schreibtischen, Spinden, Schaltschränken
  for (const x of [-34.4, -31.2]) prop(b, 'desk', x, GY, -60.8, { rot: 2 });
  for (const x of [-34, -30.4]) prop(b, 'desk', x, GY, -57.3, { rot: 0 });
  prop(b, 'locker', -15.2, GY, -61.4, { rot: 0 });
  prop(b, 'locker', -16.2, GY, -61.4, { rot: 0 });
  prop(b, 'shelf', -35, GY, -61.5, { len: 2.4 });
  prop(b, 'electricBox', -13.6, GY, -58, { rot: 3 });
  // Galerie West: Palettenreste und Kisten (Deckung)
  prop(b, 'palletGoods', -66, GY, -60, { h: 1.1 });
  prop(b, 'crate', -64.6, GY, -61, { h: 1.0 });
  prop(b, 'crateStack', -52, GY, -59.4, {});
  prop(b, 'gitterbox', -44.5, GY, -60.8, { n: 2 });

  // ---------------------------------------------------------------- Leiterraum: Treppe hinauf zur Galerie (Zugang aus CT-Hof)
  // Treppe läuft von Norden (CT-Hof) nach Süden; der Absatz auf +5 m führt westlich in die Galerie
  railedStairs(b, -12, -70, -2, -59, 0, GY, 'pz', { mat: 'concrete', railEnd: 10 / 11 });
  b.floor(-12, -60, -2, -56, GY, 'concrete', { thick: 0.4, top: 'tile', tint: 0xb8b4a8, tag: 'platform' });
  hazardEdge(b, -12, -70.4, -2, -70, 0);

  // ---------------------------------------------------------------- Kranbahn (Hängekran): Aufgang, Laufstege, Träger, Kranlast
  // Ostlaufsteg an der Hallenwand, Hauptlaufsteg quer über die Halle, Aufgang von Himmel, Abgang im Südosten
  b.walkway(-17, -60, -14, -9, CY, { rails: 'none', thick: 0.3 });
  b.rail(-14.05, -60, -14.05, -9, CY);
  b.rail(-16.95, -56, -16.95, -39, CY);
  b.rail(-16.95, -37, -16.95, -13, CY);
  b.rail(-17, -60.05, -14, -60.05, CY);
  b.rail(-17, -9.05, -14, -9.05, CY);
  b.walkway(-66, -39, -17, -37, CY, { rails: 'both', thick: 0.3 });
  // Dachträger (Hängekran-Bahn) neben dem Laufsteg, Laufkatze, Hänger an den Bindern
  b.box([-66, CY - 0.2, -37], [-17, CY + 1.2, -35.2], 'steel', { tint: 0xd8a820, tag: 'prop', noNav: true });
  b.box([-67.2, CY - 0.3, -39.2], [-65.8, CY + 1.6, -35.0], 'steel', { collide: 'none', noNav: true, tint: 0x6a7480, occlude: false });
  for (const x of [-62, -53, -44, -35, -26, -17]) b.box([x - 0.07, CY + 1.2, -36.2], [x + 0.07, 11.6, -36.0], 'steel', { collide: 'none', noNav: true, occlude: false, tint: 0x4a5662 });
  b.box([IT - 1.4, CY + 1.2, -37], [IT + 1.4, CY + 2.0, -35.2], 'steel', { collide: 'none', noNav: true, occlude: false, tint: 0xe0a020 });
  // Kranlast: Transportkiste (IT-Lieferung) über dem Bombenzug, an zwei Seilen
  b.box([IT - 1.6, 5.7, G3 - 1.1], [IT + 1.6, 7.9, G3 + 1.1], 'crate', { tint: 0xc8b088, tag: 'prop', noNav: true, uv: 1.3 });
  for (const dx of [-1.2, 1.2]) b.box([IT + dx - 0.04, 7.9, G3 - 0.05], [IT + dx + 0.04, CY + 1.2, G3 + 0.05], 'steel', { collide: 'none', noNav: true, occlude: false, tint: 0x30343a });
  b.box([IT - 1.3, 7.9, G3 - 0.2], [IT + 1.3, 8.15, G3 + 0.2], 'steel', { collide: 'none', noNav: true, occlude: false, tint: 0x30343a });
  // Aufgang (Himmel → Ostlaufsteg) und Abgang (Südost → Hallenboden)
  railedStairs(b, -27, -60, -16, -56, GY, CY, 'px', { railEnd: 10 / 11 });
  railedStairs(b, -34, -13, -16, -9, 0, CY, 'px', { railEnd: 17 / 18 });
  hazardEdge(b, -34.4, -13, -34, -9, 0);

  // ---------------------------------------------------------------- Popdog: Revisionsgrube mit Rampe und Treppe
  b.ramp(-60, -14, -56, -6, -1.4, 0, 'nx', 'concreteDark', { tag: 'ramp' });
  railedStairs(b, -50, -14, -45, -6, -1.4, 0, 'px', { mat: 'concrete', railEnd: 4 / 5 });
  hazardEdge(b, -56, -14.3, -50, -14, 0);
  hazardEdge(b, -60, -14.3, -56.2, -14, 0);
  hazardEdge(b, -46, -14.3, -44.7, -14, 0);
  // Gleis in der Grube + Pritsche, Ölspur, Werkzeugwagen
  prop(b, 'track', -53, -1.4, -10, { len: 6 });
  prop(b, 'barrel', -54.5, -1.4, -12.2);
  prop(b, 'palletGoods', -52, -1.4, -7.4, { h: 0.8 });
  prop(b, 'cones', -57, -1.4, -13);
  b.decal({ kind: 'stain', pos: [-53, -1.38, -10], size: [5, 3] });

  // ---------------------------------------------------------------- Requisiten (Sandwich, Gänge, Südstreifen)
  // Sandwich (unter Himmel): Regale und Spinde an der Nordwand, Stapler
  for (const x of [-65.5, -62.5, -59.5]) prop(b, 'shelf', x, 0, -61.5, { len: 2.4 });
  prop(b, 'forklift', -35, 0, -59.5, { rot: 1, tint: 0xe0a020 });
  prop(b, 'palletStack', -49, 0, -60.8, { n: 6 });
  prop(b, 'palletGoods', -47.4, 0, -60.8, {});
  prop(b, 'gitterbox', -41, 0, -60.8, { n: 2 });
  prop(b, 'crate', -30.6, 0, -61, { h: 1.2 });
  prop(b, 'crate', -30.6, 0, -59.7, { h: 1.2 });
  prop(b, 'barrelGroup', -22.5, 0, -61);
  // Südstreifen
  for (const x of [-42, -36.6, -31.2]) prop(b, 'rack', x, 0, -7.2, { len: 5.2, h: 6, seed: 5 });
  prop(b, 'palletStack', -66, 0, -9, { n: 5 });
  prop(b, 'crate', -64.8, 0, -17.5, { h: 1.2 });
  prop(b, 'cartons', -66.2, 0, -14);
  prop(b, 'drum', -20, 0, -7.5, { rot: 1 });
  prop(b, 'barrelGroup', -15.5, 0, -8);
  // Quergang
  prop(b, 'crate', -33, 0, -47, { h: 1.2 });
  prop(b, 'crate', -33, 0, -45.7, { h: 1.2 });
  prop(b, 'crate', -33, 1.2, -46.4, { h: 0.9 });
  prop(b, 'palletGoods', -31.5, 0, -25, { h: 1.2 });
  prop(b, 'handTruck', -34.6, 0, -23.5, { rot: 1 });
  // Wagenseiten: Gitterboxen, Paletten zwischen den Wagen
  prop(b, 'gitterbox', -60, 0, -41, { n: 2 });
  prop(b, 'palletGoods', -46, 0, -39.5, {});
  prop(b, 'palletGoods', -44.6, 0, -39.5, {});
  prop(b, 'barrel', -62.2, 0, -24.4);
  prop(b, 'barrel', -61.4, 0, -24.8);
  prop(b, 'palletStack', -62, 0, -31.5, { n: 5 });
  prop(b, 'crate', -40, 0, -31.3, { h: 1.2 });
  prop(b, 'crate', -38.7, 0, -31.3, { h: 1.2 });
  prop(b, 'forklift', -52, 0, -23.7, { rot: 0, tint: 0xd06020 });
  prop(b, 'gitterbox', -23, 0, -49.5, { n: 1 });
  prop(b, 'palletGoods', -18, 0, -41.5, { h: 1.0 });
  prop(b, 'cones', -16, 0, -30);
  // Ost-Tore: Signal und Hinweis
  prop(b, 'signal', -15.5, 0, -48.8, { rot: 0, n: 0 });
  prop(b, 'signal', -15.5, 0, -9.8, { rot: 0, n: 1 });
  tape(b, -60, -17.5, -62, -17.5, 0);

  // ---------------------------------------------------------------- Schilder und Markierungen
  hangSign(b, 'SERVERSCHRANK A', IT, 6.4, G3 - 2.2, 0xff5a4a, 'IT-UMZUG · BITTE NICHT STAPELN', { rod: 2.6 });
  b.sign('GLEISFELD A', [-30, 12.7, -62 + 0.1], 'pz', 9, 1.5, { color: 0xf0f0f0, bg: 0x2f5f9e, sub: 'GLEIS 1–5 · NUR MIT FAHRDIENSTLEITER' });
  b.sign('HIMMEL', [-45, 6.4, -62 + 0.12], 'pz', 3.6, 0.9, { color: 0x8fc0ff, sub: 'LEITSTAND · KRAN' });
  b.sign('SANDWICH', [-40, 3.6, -62 + 0.12], 'pz', 3.6, 0.8, { color: 0xffd040, sub: 'DURCHGANG' });
  b.sign('KRANBAHN', [-14.12, 9.6, -48], 'nx', 3.4, 0.8, { color: 0xffd040, sub: 'NUR MIT SICHERUNG' });
  b.sign('POPDOG', [-53, 1.9, -6 - 0.12], 'nz', 3.4, 0.8, { color: 0xffb13a, sub: 'REVISIONSGRUBE' });
  b.sign('EFEU', [-68 + 0.14, 4.0, -11], 'px', 2.2, 0.8, { color: 0x90d060, sub: 'ZUM T-HOF' });
  b.sign('OST-TOR 1', [-14 - 0.12, 5, -40], 'nx', 3, 0.8, { color: 0xe8e8e8, sub: 'ZUR MITTE' });
  b.sign('OST-TOR 2', [-14 - 0.12, 5, -17], 'nx', 3, 0.8, { color: 0xe8e8e8, sub: 'ZUR MITTE' });
  b.sign('LEITERRAUM', [-12 - 0.0, 4.4, -64 - 0.0], 'pz', 3.2, 0.8, { color: 0xe8e8e8, sub: 'TREPPE → HIMMEL' });
  for (let i = 0; i < HALL_A.tracks.length; i++) {
    floorLabel(b, String(i + 1), -16.5, 0, HALL_A.tracks[i]! + 2.2, 1.6, 0xe8c020, 0);
    b.sign(`GLEIS ${i + 1}`, [-68 + 0.14, 2.2, HALL_A.tracks[i]!], 'px', 1.6, 0.6, { color: 0xe8c020 });
  }
  // Fahrspuren / Gehwegmarkierung entlang der Querachse
  for (const x of [-35.2, -29.6]) b.decal({ kind: 'line', pos: [x, 0.02, -34], size: [0.15, 52], color: 0xe8c020 });
  b.decal({ kind: 'stripes', pos: [-12.8, 0.02, -40], size: [1.2, 16] });
  b.decal({ kind: 'stripes', pos: [-12.8, 0.02, -17], size: [1.2, 14] });
  b.decal({ kind: 'letter', pos: [IT, 0.02, -40], size: [4.4, 4.4], text: 'A', color: 0xff5a4a });
  b.decal({ kind: 'stain', pos: [-38, 0.02, -26], size: [6, 4] });
  b.decal({ kind: 'stain', pos: [-60, 0.02, -48], size: [5, 3] });

  // ---------------------------------------------------------------- Licht
  for (const x of [-60, -48, -35, -22]) for (const z of [-58, -47, -33, -23, -12]) b.hallLamp(x, 12.6, z, { color: 0xffe6c0, intensity: 2.3, range: 24 });
  // Kranlampen am Träger: beleuchten Wagendächer und Gänge von oben
  for (const x of [-62, -52, -42, -32, -22]) b.hallLamp(x, 7.8, -34.4, { color: 0xfff0d0, intensity: 1.6, range: 14 });
  for (const x of [-64, -55, -46, -37, -28, -19]) b.tubeLamp(x, 4.35, -58.5, true, { color: 0xd8ecff, intensity: 0.8, range: 9 });
  for (const z of [-56, -46, -30, -20, -12]) b.tubeLamp(-15.5, CY + 2.4, z, false, { color: 0xfff0d0, intensity: 0.6, range: 8 });
  for (const x of [-60, -48, -24]) b.tubeLamp(x, CY + 2.4, -38, true, { color: 0xfff0d0, intensity: 0.6, range: 8 });
  for (const [x, z] of [[-14.4, -48.8], [-14.4, -17], [-67.6, -11]] as const) b.wallLamp(x + (x < -60 ? 0.3 : -0.1), 5.6, z, x < -60 ? 'px' : 'nx', { intensity: 0.7, range: 10 });
  void F;
}
