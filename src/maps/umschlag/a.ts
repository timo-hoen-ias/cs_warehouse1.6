import { prop } from '../../logic/mapprops';
import { F, LV, dockRow, hazardEdge, line, parcelPile, pillars, stripe, tape, tubeRow, type B } from './common';

/**
 * A-Seite: Rampe A (Außenrampe +2 m, Docks der Halle im Westen, Vordach „Sandwich“), Serverschrank A mit
 * Feuerkiste und Dreierkiste, Pförtnerhaus, Treppe und Dschungel (Pausenhof) mit Verbindung zur Halle,
 * Pförtner-Gasse und CT-Gasse im Norden, Palast (Disposition +5.6 m) mit Balkon über der Rampe.
 */
export function dressA(b: B): void {
  rampe(b);
  vordach(b);
  spotA(b);
  palast(b);
  nordSeite(b);
  dschungel(b);
}

/** Schild auf zwei Pfosten (freistehend im Freien). */
function postSign(b: B, text: string, x: number, y: number, z: number, facing: 'px' | 'nx' | 'pz' | 'nz', w: number, color: number, sub?: string): void {
  const alongX = facing === 'pz' || facing === 'nz';
  const off = { px: [0.03, 0], nx: [-0.03, 0], pz: [0, 0.03], nz: [0, -0.03] }[facing];
  b.sign(text, [x + off[0]!, y, z + off[1]!], facing, w, 0.9, { color, bg: 0x20262c, sub });
  for (const s of [-1, 1]) {
    const dx = alongX ? s * (w / 2 - 0.15) : 0;
    const dz = alongX ? 0 : s * (w / 2 - 0.15);
    b.box([x + dx - 0.04, 0, z + dz - 0.04], [x + dx + 0.04, y - 0.4, z + dz + 0.04], 'steel', { collide: 'none', tint: 0x404448, noNav: true, occlude: false });
  }
}

// ---------------------------------------------------------------- Rampe A: Fassaden, Docks, Rampe, Beleuchtung
function rampe(b: B): void {
  const A = LV.apron;
  // Dockwand der Umschlaghalle (Westseite): Rolltor-Buchten 1–10
  dockRow(b, 'x', 16.12, 6, 28, 'px', { step: 4, n0: 41, y: A, h: 3.8 });
  // Südwand (T-Rampe-Mauer) und Nordwand der Rampe: Rolltore, Schilder, Wandlampen
  for (const x of [30, 54, 62]) prop(b, 'rollerDoor', x, A, 30 - F, { rot: 2, len: 3.6, h: 4 });
  prop(b, 'doorSteel', 50, A, 30 - F, { rot: 2, tint: 0x3a6fb0 });
  b.sign('RAMPE A', [56, A + 6.6, 30 - F - 0.02], 'nz', 8, 1.5, { color: 0xf0f0f0, bg: 0xb04a2a, sub: 'WARENAUSGABE · BOMBENZIEL = IT-SCHRANK' });
  for (const x of [24, 40, 52, 64]) b.wallLamp(x, A + 5.0, 30 - F - 0.05, 'nz', { intensity: 1.0, range: 14, color: 0xffd9a0 });
  for (const x of [38, 60, 66]) b.wallLamp(x, A + 5.0, 2 + F + 0.05, 'pz', { intensity: 1.0, range: 14, color: 0xffd9a0 });
  for (const x of [34, 56]) prop(b, 'rollerDoor', x, A, 2 + F, { rot: 0, len: 3.6, h: 4 });
  b.sign('PFÖRTNER ↑', [64, A + 4.0, 2 + F + 0.02], 'pz', 3.4, 0.9, { color: 0xffd040, sub: 'TREPPE · CT-GASSE' });
  // Mastleuchten in der Mitte der Rampe (warmes Abendlicht)
  for (const [x, z] of [[36, 9], [58, 12], [44, 26], [62, 26]] as const) prop(b, 'lampPost', x, A, z);
  // Bodenmarkierungen: Stellplätze, Fahrspuren, A
  stripe(b, 30, 4, 30, 28, A, 0xe8e8e8, 0.2);
  stripe(b, 66, 4, 66, 28, A, 0xe8e8e8, 0.2);
  stripe(b, 30, 28, 66, 28, A, 0xe8c020, 0.2);
  b.decal({ kind: 'arrow', pos: [40, A + 0.02, 25], size: [2.6, 3.6], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'stripes', pos: [40, A + 0.02, 29.2], size: [12, 1.2] });
  hazardEdge(b, 34, 29.7, 46, 30, A);
  b.decal({ kind: 'stain', pos: [52, A + 0.02, 24], size: [6, 3.4] });
  b.decal({ kind: 'stain', pos: [40, A + 0.02, 20], size: [4, 2.4] });
  b.ambient('forklift', [30, A + 1, 14], 14, 0.4);
  b.ambient('wind', [45, A + 6, 15], 40, 0.5);
  b.ambient('birds', [50, A + 8, 10], 36, 0.4);
  b.ambient('traffic', [45, A + 4, 40], 50, 0.35);
}

// ---------------------------------------------------------------- Vordach (Sandwich): angedockte Lkw zwischen Stützen
function vordach(b: B): void {
  const A = LV.apron;
  // Stützen am Vordachrand (Deckung), Dachbinder und Röhren
  pillars(b, [[27.4, 6], [27.4, 12], [27.4, 19], [27.4, 25], [27.4, 29.4]], A, 7.2, 0x2f6fb0, 0.6);
  b.box([16, 6.8, 5.7], [28, 7.2, 6.3], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  for (const z of [11, 19, 26]) b.box([16, 6.8, z - 0.3], [28, 7.2, z + 0.3], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  tubeRow(b, 20, 8, 20, 27, 3, 6.7, false, { intensity: 1.2, range: 12, color: 0xffe9c0 });
  tubeRow(b, 24.5, 8, 24.5, 27, 3, 6.7, false, { intensity: 1.0, range: 10, color: 0xffe9c0 });
  // Angedockte Lkw (rückwärts an der Halle): lassen schmale Gassen — das „Sandwich“ zwischen den Aufliegern
  for (const z of [8.5, 14.5, 24]) prop(b, 'trailer', 23.1, A, z, { rot: 0, tint: z === 14.5 ? 0xd8dde2 : 0xe8e0c8 });
  // Gasse zwischen den ersten beiden Aufliegern: Paletten, Stapler
  prop(b, 'palletGoods', 20, A, 11.5, { rot: 1, seed: 3 });
  prop(b, 'handTruck', 18, A, 11.5, { rot: 0 });
  prop(b, 'cartons', 25.5, A, 11.4, { seed: 8 });
  prop(b, 'rollCage', 22, A, 18, { h: 1.2 });
  prop(b, 'palletStack', 19, A, 19.3, { n: 6 });
  prop(b, 'forklift', 21, A, 28.4, { rot: 0, tint: 0xe0a020 });
  b.sign('DOCK-VORDACH', [16.12, A + 5.4, 17], 'px', 4, 1.0, { color: 0xffd040, bg: 0x20262c, sub: 'DOCKS 41 – 50 · SANDWICH' });
  b.sign('MAX. 5 KM/H', [27.4 - 0.4, A + 2.2, 29], 'nx', 1.4, 0.6, { color: 0xff7a5a, bg: 0x20262c });
}

// ---------------------------------------------------------------- Serverschrank A, Feuerkiste, Dreierkiste, Pförtnerhaus
function spotA(b: B): void {
  const A = LV.apron;
  // IT-Provisorium: Reihen aus Serverschränken auf Paletten, USV, Klimagerät, Kabelbrücke, Absperrband
  prop(b, 'serverRow', 44.4, A, 15.4, { rot: 0, n: 5 });
  prop(b, 'serverRow', 50.6, A, 15.4, { rot: 0, n: 3 });
  prop(b, 'ups', 47.6, A, 13.7, {});
  prop(b, 'cooler', 53.4, A, 14.4, { rot: 0 });
  prop(b, 'palletGoods', 47.6, A, 18.6, { tint: 0xe8e8e8, h: 1.1 });
  b.box([40.4, A, 17.2], [53, A + 0.15, 19.4], 'pallet', { collide: 'none', noNav: true, occlude: false });
  tape(b, 40, 19.6, 54, 19.6, A);
  tape(b, 40, 19.6, 40, 4.4, A);
  b.box([37.4, A, 15.0], [40.2, A + 0.07, 15.4], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.5 }); // Kabelbrücke
  b.box([37.4, A, 14.0], [37.8, A + 0.07, 15.4], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.5 });
  b.box([37.4, A, 14.0], [30, A + 0.07, 14.4], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.5 });
  postSign(b, 'SERVERSCHRANK A', 46.5, A + 3.4, 19.9, 'pz', 5.2, 0xff5a4a, 'IT · NICHT BERÜHREN · PROVISORIUM');
  b.light({ kind: 'lamp', pos: [47, A + 2.6, 14], color: 0x40c8ff, intensity: 0.55, range: 7 });
  b.ambient('buzz', [47, A + 2, 14], 10, 0.55);
  b.decal({ kind: 'grid', pos: [46, A + 0.02, 10], size: [14, 14] });
  b.decal({ kind: 'letter', pos: [46, A + 0.02, 10], size: [5, 5], text: 'A', color: 0xff5a4a });
  // Dreierkiste: drei Holzkisten im Dreieck, eine obendrauf (Gesprungene Deckung vor dem Spot)
  prop(b, 'crate', 40.3, A, 9.4, { h: 1.2 });
  prop(b, 'crate', 41.6, A, 9.4, { h: 1.2 });
  prop(b, 'crate', 40.95, A, 10.7, { h: 1.2 });
  prop(b, 'crate', 40.95, A + 1.2, 9.9, { h: 1.1 });
  // Feuerkiste: roter Brandschutzschrank mit Löschmitteln (Nordseite des Spots, neben der Treppe)
  b.box([49, A, 5.0], [51.6, A + 1.5, 6.1], 'metal', { tint: 0xc0301e });
  b.box([49, A + 1.5, 5.0], [51.6, A + 1.62, 6.1], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.5 });
  b.box([49.1, A + 0.3, 6.1], [51.5, A + 1.3, 6.15], 'door', { collide: 'none', tint: 0xe8e8e0, noNav: true, occlude: false, uvFit: true });
  b.decor('extinguisher', [49.5, A + 1.7, 5.55], 0);
  b.decor('extinguisher', [51.0, A + 1.7, 5.55], 0);
  b.sign('FEUERKISTE', [50.3, A + 1.0, 6.18], 'pz', 2.2, 0.5, { color: 0xffffff, bg: 0xc0301e, sub: 'BRANDSCHUTZ' });
  // Pförtnerhaus (Ticket-Häuschen) an der Treppe
  prop(b, 'gatehouse', 59.5, A, 6.4, { rot: 0 });
  b.box([56.3, A, 8.6], [62.7, A + 0.03, 9.0], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 1 });
  postSign(b, 'PFÖRTNERHAUS', 59.5, A + 4.2, 9.6, 'pz', 3.4, 0xffd040, 'EINLASS · AUSWEISKONTROLLE');
  b.box([62.8, A + 0.9, 6.6], [66, A + 1.0, 6.8], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.5 }); // Schranke
  prop(b, 'bumper', 62.6, A, 7.4);
  // Deckung über die Rampe verteilt: Container, Paletten, Gitterboxen (Lücken ≥ 3 m)
  prop(b, 'container', 62, A, 24, { rot: 0, tint: 0xa8432b });
  prop(b, 'container', 62, A + 2.59, 24, { rot: 0, tint: 0xb7791f });
  prop(b, 'cargoContainer', 52, A, 25, { rot: 1, tint: 0x2f7d4f });
  prop(b, 'crateStack', 36.4, A, 21.6);
  prop(b, 'palletStack', 32.6, A, 17.8, { n: 6 });
  prop(b, 'palletGoods', 32.6, A, 19.0, { seed: 15 });
  prop(b, 'gitterbox', 56, A, 11.6, { n: 2 });
  prop(b, 'gitterbox', 57.3, A, 11.6, { n: 2 });
  prop(b, 'gitterbox', 56.6, A, 12.6, { n: 1 });
  prop(b, 'barrelGroup', 33, A, 6.8, { seed: 2 });
  prop(b, 'palletGoods', 66, A, 15, { rot: 1, seed: 20 });
  parcelPile(b, 36, A, 25.5, 0, 9);
  line(b, 'cones', 32, A, 29, 44, 29, 4, {});
}

// ---------------------------------------------------------------- Palast: Disposition (+5.6) mit Balkon
function palast(b: B): void {
  const P = LV.palace;
  const A = LV.apron;
  // Balkon: Geländer, Stützen, Blumenkästen, Schild
  b.rail(60, 7.95, 68, 7.95, P);
  b.rail(60, 24.05, 68, 24.05, P);
  b.rail(60.05, 8, 60.05, 16, P);
  pillars(b, [[66.2, 9], [66.2, 23], [61.2, 9], [61.2, 23]], A, P - 0.4, 0x2f6fb0);
  b.box([60, P - 0.9, 8], [68, P - 0.4, 24], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  prop(b, 'plant', 62, P, 9, { h: 1.2 });
  prop(b, 'plant', 62, P, 23, { h: 1.2 });
  prop(b, 'table', 65, P, 20.8, { rot: 1, len: 1.6 });
  prop(b, 'crate', 63.2, P, 10.5, { h: 0.9 });
  b.sign('BALKON', [64, P + 1.2, 7.9], 'pz', 2.4, 0.6, { color: 0xffd040, bg: 0x20262c, sub: 'RAUCHERBEREICH' });
  hazardEdge(b, 60, 7.7, 68, 8, P);
  hazardEdge(b, 59.7, 16, 60, 24, P);
  b.wallLamp(67.9, P + 3.0, 8.4, 'nx', { intensity: 1.0, range: 11, color: 0xffd9a0 });
  b.wallLamp(67.9, P + 3.0, 23.6, 'nx', { intensity: 1.0, range: 11, color: 0xffd9a0 });
  // Disposition (x 70…84, z 6…22): Schreibtische mit Blick auf die Rampe, Aktenschränke, Plantafel
  for (const z of [8, 11, 18, 21]) prop(b, 'desk', 72.6, P, z + 0.2, { rot: 1 });
  prop(b, 'desk', 78, P, 8.4, { rot: 0 });
  prop(b, 'desk', 81.6, P, 8.4, { rot: 0 });
  prop(b, 'console', 80, P, 14.6, { rot: 0, len: 3 });
  line(b, 'locker', 82.6, P, 6.8, 82.6, 6.8, 1, {});
  line(b, 'shelf', 77, P, 5.7, 83, 5.7, 3, { rot: 0, len: 2.4 });
  prop(b, 'plant', 71, P, 6.8, { h: 1.7 });
  prop(b, 'plant', 83.2, P, 21, { h: 1.7 });
  prop(b, 'cartons', 74, P, 20.8, { seed: 5 });
  b.sign('DISPOSITION', [83.88, P + 2.6, 14], 'nx', 5, 1.2, { color: 0xf0f0f0, bg: 0x6a3a1c, sub: 'TOURENPLANUNG · LKW-ZUTEILUNG · RAMPE A' });
  b.sign('TOURENPLAN', [83.88, P + 1.1, 9], 'nx', 2.4, 1.0, { color: 0xffd040, bg: 0x20262c, sub: 'A · B · MITTE' });
  tubeRow(b, 72, 8, 82, 8, 3, P + 3.2, true, { intensity: 1.0, range: 10, color: 0xfff0d0 });
  tubeRow(b, 72, 14, 82, 14, 3, P + 3.2, true, { intensity: 1.0, range: 10, color: 0xfff0d0 });
  tubeRow(b, 72, 20, 82, 20, 3, P + 3.2, true, { intensity: 1.0, range: 10, color: 0xfff0d0 });
  b.light({ kind: 'window', pos: [70.6, P + 2.0, 14], color: 0xffe0b0, intensity: 1.2, range: 12 });
  b.light({ kind: 'window', pos: [70.6, P + 2.0, 9], color: 0xffe0b0, intensity: 0.9, range: 10 });
  b.light({ kind: 'window', pos: [70.6, P + 2.0, 19], color: 0xffe0b0, intensity: 0.9, range: 10 });
  // Fensterbrüstung (Optik): Pfosten alle 4.5 m; Palast-Bögen im Gang
  for (const z of [8.5, 12, 16.5, 20]) if (z < 12 || z > 16) b.box([68.0, P + 1.0, z - 0.06], [70, P + 2.8, z + 0.06], 'steel', { tint: 0x5a4a3a, tag: 'pillar' });
  for (const z of [24, 28, 32]) {
    b.box([76.2, P, z - 0.15], [76.6, P + 3.0, z + 0.15], 'wood', { collide: 'none', tint: 0x8a6a4a, noNav: true, occlude: false });
    b.box([83.4, P, z - 0.15], [83.8, P + 3.0, z + 0.15], 'wood', { collide: 'none', tint: 0x8a6a4a, noNav: true, occlude: false });
    b.box([76.2, P + 2.7, z - 0.15], [83.8, P + 3.0, z + 0.15], 'wood', { collide: 'none', tint: 0x8a6a4a, noNav: true, occlude: false });
  }
  tubeRow(b, 80, 24, 80, 33, 3, P + 3.2, false, { intensity: 1.0, range: 9, color: 0xfff0d0 });
  prop(b, 'plant', 76.8, P, 33, { h: 1.6 });
  prop(b, 'plant', 83.2, P, 26, { h: 1.6 });
  prop(b, 'bench', 83.4, P, 29.5, { rot: 1, len: 2.4 });
  b.sign('PALAST', [80, P + 2.2, 33.9], 'nz', 5, 1.0, { color: 0xf0f0f0, bg: 0x6a3a1c, sub: 'DISPOSITION · BALKON → RAMPE A' });
  b.ambient('radio', [78, P + 1, 14], 10, 0.5);
  b.ambient('buzz', [78, P + 2, 10], 8, 0.4);
  // Außen: Dock-Buchten der Disposition unter dem Balkon (Westfassade), Sockel-Beschriftung
  dockRow(b, 'x', 68 - 0.12, 8, 24, 'nx', { step: 8, n0: 51, y: A, h: 3.0 });
}

// ---------------------------------------------------------------- Nordseite: Pförtner-Gasse, CT-Gasse, Treppe
function nordSeite(b: B): void {
  const A = LV.apron;
  // Treppe (x 46…54, z −6…2) und Dschungel-Treppe: Schilder, Lampen, Kanten
  hazardEdge(b, 46, 1.7, 54, 2, A);
  hazardEdge(b, 24, 1.7, 34, 2, A);
  b.sign('RAMPE A ↑', [46 + F, 3.8, -2], 'px', 3.2, 0.9, { color: 0xff7a5a, sub: 'TREPPE · BOMBENZIEL' });
  b.sign('RAMPE A ↑', [54 - F, 3.8, -2], 'nx', 3.2, 0.9, { color: 0xff7a5a, sub: 'TREPPE · BOMBENZIEL' });
  for (const z of [-4, 0]) { b.wallLamp(46 + F, 5.0, z, 'px', { intensity: 0.9, range: 11, color: 0xffd9a0 }); b.wallLamp(54 - F, 5.0, z, 'nx', { intensity: 0.9, range: 11, color: 0xffd9a0 }); }
  b.sign('RAMPE A ↑', [24 + F, 3.8, -2], 'px', 3.2, 0.9, { color: 0xff7a5a, sub: 'DSCHUNGEL-TREPPE' });
  for (const z of [-4, 0]) b.wallLamp(24 + F, 5.0, z, 'px', { intensity: 0.9, range: 11, color: 0xffd9a0 });
  // Pförtner-Gasse (x 38…66, z −14…−6): Backsteinwand, Fahrräder, Mülltonnen, Lampen
  for (const x of [42, 50, 58, 64]) b.wallLamp(x, 5.2, -6 - F - 0.05, 'nz', { intensity: 1.0, range: 13, color: 0xffd9a0 });
  for (const x of [44, 56]) b.wallLamp(x, 5.2, -14 + F + 0.05, 'pz', { intensity: 1.0, range: 13, color: 0xffd9a0 });
  prop(b, 'barrel', 40.5, 0, -12.8);
  prop(b, 'barrel', 41.6, 0, -12.8);
  prop(b, 'palletStack', 62.5, 0, -12.2, { n: 5 });
  prop(b, 'palletGoods', 63.9, 0, -12.2, { seed: 4 });
  prop(b, 'crate', 58.5, 0, -12.6, { h: 1.1 });
  prop(b, 'cartons', 40.4, 0, -8, { seed: 6 });
  prop(b, 'drum', 65.4, 0, -9, { rot: 1 });
  prop(b, 'handTruck', 38.8, 0, -9.5, { rot: 0 });
  b.sign('PFÖRTNER-GASSE', [52, 5.6, -14 + F + 0.02], 'pz', 6, 1.1, { color: 0xf0f0f0, bg: 0x6a3a1c, sub: '← DSCHUNGEL · TREPPE ↓ RAMPE A' });
  b.sign('→ CT', [66 - F, 3.4, -10], 'nx', 2.6, 0.8, { color: 0x8fc0ff, sub: 'CT-GASSE' });
  stripe(b, 38, -10, 66, -10, 0, 0xe8e8e8, 0.15);
  b.decal({ kind: 'letter', pos: [47, 0.02, -10], size: [2.4, 2.4], text: 'A', color: 0xff5a4a });
  b.decal({ kind: 'arrow', pos: [50, 0.02, -10], size: [1.8, 2.8], rot: Math.PI, color: 0xe8e8e8 });
  // CT-Gasse (x 44…54, z −46…−14): lang, schmal, Deckung alle ~10 m
  for (const z of [-42, -32, -22]) { b.wallLamp(44 + F, 5.4, z, 'px', { intensity: 1.0, range: 13, color: 0xffd9a0 }); b.wallLamp(54 - F, 5.4, z, 'nx', { intensity: 1.0, range: 13, color: 0xffd9a0 }); }
  prop(b, 'palletGoods', 45.6, 0, -34, { rot: 1, seed: 31 });
  prop(b, 'palletStack', 45.6, 0, -28, { n: 6 });
  prop(b, 'crate', 52.6, 0, -24.5, { h: 1.2 });
  prop(b, 'crate', 52.6, 0, -23.3, { h: 1.2 });
  prop(b, 'gitterbox', 52.8, 0, -38, { n: 2, rot: 1 });
  prop(b, 'cartons', 46, 0, -18, { seed: 14 });
  prop(b, 'barrel', 52.8, 0, -17);
  line(b, 'cones', 46, 0, -44, 52, -44, 3, {});
  b.sign('CT-GASSE', [49, 5.4, -46 + F + 0.02], 'pz', 5, 1.0, { color: 0x8fc0ff, bg: 0x20262c, sub: '↓ RAMPE A · ↑ CT-SPAWN' });
  b.sign('RAMPE A ↓', [44 + F, 3.6, -16], 'px', 2.6, 0.8, { color: 0xff7a5a, sub: 'TREPPE' });
  stripe(b, 49, -44, 49, -14, 0, 0xe8e8e8, 0.15);
  b.decal({ kind: 'letter', pos: [49, 0.02, -36], size: [2.4, 2.4], text: 'CT', color: 0x8fc0ff });
  b.decal({ kind: 'arrow', pos: [49, 0.02, -24], size: [1.8, 2.8], rot: Math.PI, color: 0xe8e8e8 });
  prop(b, 'lampPost', 52.5, 0, -30);
  b.ambient('traffic', [49, 4, -30], 30, 0.3);
}

// ---------------------------------------------------------------- Dschungel (Pausenhof) und Verbindung
function dschungel(b: B): void {
  // Verbindung (x 14…20, z −16…−8): Lampen, Pflanzen, Schilder, Absperrung
  tubeRow(b, 15, -12, 19, -12, 2, 4.4, true, { intensity: 1.0, range: 9, color: 0xfff0d0 });
  prop(b, 'plant', 19.2, 0, -15.2, { h: 1.4 });
  prop(b, 'plant', 19.2, 0, -8.8, { h: 1.4 });
  b.sign('VERBINDUNG', [14.12, 3.6, -9], 'px', 3.0, 0.8, { color: 0xffb13a, sub: '← MITTE · DSCHUNGEL →' });
  b.sign('VERBINDUNG', [19.88, 3.6, -15], 'nx', 3.0, 0.8, { color: 0xffb13a, sub: '← MITTE · DSCHUNGEL →' });
  hazardEdge(b, 14, -12, 14.4, -8, 0);
  // Dschungel (x 20…38, z −24…−6): Pausenhof — Pflanzen, Stuhlstapel, Tische, Bänke, Getränkeautomat, Pergola
  const J: [number, number, number][] = [[21, -22.5, 1.9], [24, -7.5, 1.5], [26.5, -23, 1.7], [28.5, -12, 1.3], [31, -20, 1.8], [33, -8, 1.4], [35.5, -22.5, 1.9], [37, -14, 1.6], [22, -17, 1.5], [30, -10.5, 1.2], [36.8, -7.4, 1.5], [21, -12, 1.2]];
  for (const [x, z, h] of J) prop(b, 'plant', x, 0, z, { h });
  line(b, 'chairStack', 22.4, 0, -20, 22.4, -18.8, 3, { n: 8 });
  line(b, 'chairStack', 34, 0, -9.2, 35.2, -9.2, 3, { n: 6 });
  prop(b, 'table', 28, 0, -17.5, { rot: 0, len: 2.4 });
  prop(b, 'table', 32.4, 0, -15, { rot: 1, len: 2.4 });
  prop(b, 'table', 24, 0, -10.5, { rot: 0, len: 2.0 });
  prop(b, 'bench', 28, 0, -21.6, { rot: 0, len: 3 });
  prop(b, 'bench', 36, 0, -18, { rot: 1, len: 3 });
  prop(b, 'crate', 36.2, 0, -12.4, { h: 0.8 });
  prop(b, 'drum', 21.2, 0, -8.6, { rot: 0 });
  // Getränkeautomat und Pergola
  b.box([23.2, 0, -23.8], [24.8, 1.9, -23.0], 'metal', { tint: 0xc03a2a });
  b.box([23.3, 0.8, -23.0], [24.7, 1.7, -22.96], 'emissive', { collide: 'none', tint: 0x7fc0ff, noNav: true, occlude: false });
  b.sign('KALTGETRÄNKE', [24, 2.4, -22.9], 'pz', 1.8, 0.4, { color: 0xffd040, bg: 0x20262c });
  for (const x of [26, 30, 34]) b.box([x - 0.1, 3.6, -22], [x + 0.1, 3.75, -10], 'wood', { collide: 'none', tint: 0x7a5a3a, noNav: true, occlude: false });
  for (const z of [-22, -10]) b.box([24, 3.5, z - 0.1], [36, 3.65, z + 0.1], 'wood', { collide: 'none', tint: 0x7a5a3a, noNav: true, occlude: false });
  for (const [x, z] of [[24.2, -22], [35.8, -22], [24.2, -10], [35.8, -10]] as const) b.box([x - 0.08, 0, z - 0.08], [x + 0.08, 3.6, z + 0.08], 'wood', { collide: 'none', tint: 0x7a5a3a, noNav: true, occlude: false });
  // Efeu an den Mauern, Lichterketten
  prop(b, 'ivy', 29, 0, -24 + 0.14, { rot: 0, len: 14, h: 4.2 });
  prop(b, 'ivy', 20.14, 0, -15, { rot: 3, len: 14, h: 3.6 });
  prop(b, 'ivy', 38 - 0.14, 0, -20, { rot: 1, len: 8, h: 3.2 });
  for (const [x, z] of [[24, -20], [30, -17], [34, -12], [26, -12], [34, -20]] as const) b.light({ kind: 'lamp', pos: [x, 3.3, z], color: 0xffd9a0, intensity: 0.85, range: 10 });
  for (const x of [26, 30, 34]) b.decor('lampHall', [x, 3.9, -16], 0, [0.6, 0.6, 0.6]);
  b.sign('DSCHUNGEL', [29, 5.2, -24 + F + 0.02], 'pz', 5.4, 1.1, { color: 0xf0f0f0, bg: 0x3f7f4a, sub: 'PAUSENHOF · RAUCHEN ERLAUBT' });
  b.decal({ kind: 'stain', pos: [28, 0.02, -15], size: [8, 5] });
  b.ambient('birds', [29, 4, -15], 20, 0.55);
  b.ambient('wind', [29, 6, -15], 30, 0.3);
}
