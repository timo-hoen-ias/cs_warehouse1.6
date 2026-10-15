import { prop } from '../../logic/mapprops';
import { F, dockRow, hangSign, hazardEdge, lampGrid, line, parcelPile, pillars, stripe, type B } from './common';

/**
 * CT-Seite: Wareneingang (x −10…40, z −74…−38, Decke 8.6 m) mit Dockreihe, Spinden, Schreibtischen und der
 * Leitstand-Treppe (+4.4 m) in der Mitte; Tore zur Oberen Mitte im Süden, CT-Tür zur CT-Gasse im Osten,
 * Küchengang nach Westen.
 */
export function dressCT(b: B): void {
  // Licht und Decke
  lampGrid(b, -4, -68, 34, -44, 5, 3, 7.4, { intensity: 1.6, range: 18, color: 0xe2ecff });
  for (const z of [-62, -50]) b.box([-8, 9.05, z - 1.5], [38, 9.08, z + 1.5], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  for (const z of [-62, -50]) b.light({ kind: 'window', pos: [14, 8.7, z], color: 0xdbe8ff, intensity: 1.0, range: 24 });
  for (let x = -6; x <= 38; x += 8) b.box([x - 0.15, 8.0, -73.8], [x + 0.15, 8.55, -38.2], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  for (const z of [-66, -54, -44]) b.box([-9.8, 8.1, z - 0.12], [39.8, 8.5, z + 0.12], 'steel', { collide: 'none', tint: 0x5a6a7a, noNav: true, occlude: false });

  // Nordwand: Docks des Wareneingangs, Spinde, Wandlampen
  dockRow(b, 'z', -74 + 0.12, -6, 36, 'pz', { step: 6, n0: 61, h: 4.2, len: 3.6 });
  line(b, 'locker', 2, 0, -66.6, 8, -66.6, 5, { rot: 0 });
  for (const x of [-4, 6, 16, 26, 36]) b.wallLamp(x, 6.4, -73.85, 'pz', { intensity: 1.0, range: 14, color: 0xdceeff });
  for (const z of [-70, -58, -46]) b.wallLamp(39.85, 6.4, z, 'nx', { intensity: 1.0, range: 14, color: 0xdceeff });
  for (const z of [-62, -52]) b.wallLamp(-9.85, 6.4, z, 'px', { intensity: 1.0, range: 14, color: 0xdceeff });
  b.ambient('hallHum', [15, 6, -56], 40, 0.5);
  b.ambient('forklift', [30, 1, -64], 14, 0.4);
  b.ambient('radio', [4, 1, -66], 8, 0.4);

  // Spawn-/Kaufzone: Markierungen, Zeichen, Boden
  b.decal({ kind: 'grid', pos: [22, 0.02, -54], size: [30, 8] });
  b.decal({ kind: 'letter', pos: [22, 0.02, -60], size: [4.4, 4.4], text: 'CT', color: 0x8fc0ff });
  stripe(b, -8, -40, 38, -40, 0, 0x8fc0ff, 0.2);
  stripe(b, -8, -72, -8, -40, 0, 0x8fc0ff, 0.2);
  b.decal({ kind: 'stripes', pos: [15, 0.02, -40.2], size: [46, 1.0] });
  hangSign(b, 'CT-SPAWN', 22, 6.4, -42, 0x8fc0ff, 'WARENEINGANG · KAUFZONE', { w: 6 });
  b.sign('CT-BEREICH', [15, 4.6, -74 + F + 0.02], 'pz', 8, 1.2, { color: 0x8fc0ff, bg: 0x20262c, sub: 'WARENEINGANG · SICHERHEITSDIENST' });

  // Deckung: Schreibtische (Sicherheitsbüro), Paletten, Käfige, Stapler — Spawn-Reihen bleiben frei
  prop(b, 'desk', 12, 0, -70, { rot: 0 });
  prop(b, 'desk', 14, 0, -70, { rot: 0 });
  prop(b, 'desk', 30, 0, -70, { rot: 0 });
  prop(b, 'palletStack', -6, 0, -48, { n: 6 });
  prop(b, 'palletGoods', -6, 0, -46.6, { seed: 12 });
  prop(b, 'gitterbox', 36, 0, -48, { n: 2 });
  prop(b, 'gitterbox', 36, 0, -46.7, { n: 2 });
  prop(b, 'rollCage', 36.6, 0, -66, { h: 1.2 });
  prop(b, 'rollCage', 35.6, 0, -66, { h: 1.0 });
  prop(b, 'forklift', 30, 0, -46, { rot: 2, tint: 0x2f78c0 });
  prop(b, 'conveyor', 20, 0, -70.4, { rot: 0, len: 8 });
  parcelPile(b, 0, 0, -44.6, 0, 5);
  prop(b, 'cartons', 4, 0, -62, { seed: 19 });
  pillars(b, [[8, -58], [24, -64], [30, -52]], 0, 7.8, 0x2f6fb0, 0.6);
  prop(b, 'handTruck', 12, 0, -50, { rot: 1 });
  prop(b, 'crateStack', -5, 0, -62);
  prop(b, 'palletGoods', -7, 0, -56, { rot: 1, seed: 6 });
  b.box([-7.6, 0, -68.4], [-5.8, 1.9, -67.6], 'metal', { tint: 0xc03a2a }); // Getränkeautomat
  b.box([-7.5, 0.8, -67.6], [-5.9, 1.7, -67.56], 'emissive', { collide: 'none', tint: 0x7fc0ff, noNav: true, occlude: false });
  b.sign('PAUSE', [-6.7, 2.4, -67.5], 'pz', 1.6, 0.5, { color: 0xffd040, sub: 'KALTGETRÄNKE' });

  // Leitstand-Treppe (x 6…10, z −50…−38): Schild und Kante
  hazardEdge(b, 6, -50.3, 10, -50, 0);
  b.sign('FENSTER ↑', [6 + F, 3.4, -44], 'px', 3.0, 0.8, { color: 0xffd040, sub: 'LEITSTAND' });
  b.sign('FENSTER ↑', [10 - F, 3.4, -44], 'nx', 3.0, 0.8, { color: 0xffd040, sub: 'LEITSTAND' });
  b.light({ kind: 'lamp', pos: [8, 4.2, -44], color: 0xdceeff, intensity: 0.8, range: 9 });

  // Tore zur Oberen Mitte (x −12…−2, z −38…−34)
  hangSign(b, 'OBERE MITTE', -7, 4.8, -36, 0xffd040, 'UMSCHLAGHALLE ↓', { w: 4.4 });
  b.wallLamp(-11.85, 4.4, -36, 'px', { intensity: 1.0, range: 10, color: 0xffd9a0 });
  b.tubeLamp(-7, 5.6, -36, false, { intensity: 1.1, range: 10, color: 0xfff0d0 });
  hazardEdge(b, -12, -34.3, -2, -34, 0);
  // Küchengang (West) und CT-Tür (Ost)
  b.sign('KÜCHE →', [-9.88, 4.0, -64], 'px', 3.0, 0.8, { color: 0x3f7f78, bg: 0xf0f0f0, sub: 'KANTINE · B ←' });
  b.sign('CT-GASSE', [39.88, 4.2, -43], 'nx', 3.0, 0.8, { color: 0x8fc0ff, bg: 0x20262c, sub: '→ RAMPE A' });
  b.light({ kind: 'lamp', pos: [42, 3.4, -43], color: 0xffd9a0, intensity: 0.9, range: 9 });
  b.wallLamp(42, 3.4, -45.85, 'pz', { intensity: 0.8, range: 9, color: 0xffd9a0 });
}
