import { prop } from '../../logic/mapprops';
import { F, LV, hangSign, hazardEdge, lampGrid, line, parcelPile, pillars, stripe, tape, tubeRow, type B } from './common';

/**
 * B-Seite: Paketsortierung (x −72…−28, z −60…−16, Decke 8.2 m) mit Serverschrank B, Lieferwagen und Bank,
 * Markt (Retourenlager mit Fenster und Tür zur Halle) und Küche (Kantine) im Norden. Zugänge: Wohnungen
 * (Treppe aus dem Obergeschoss, SW), Unterführungs-Rampe (S), Kurz (Treppe von der Brücke, O), Markt/Küche (N).
 */
export function dressB(b: B): void {
  halle(b);
  spotB(b);
  markt(b);
  kueche(b);
}

function halle(b: B): void {
  // Hallenlicht und Decke
  lampGrid(b, -66, -54, -34, -22, 4, 4, 7.0, { intensity: 1.6, range: 17 });
  for (const z of [-48, -32]) b.box([-70, 8.16, z - 1.5], [-30, 8.19, z + 1.5], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  for (const z of [-48, -32]) b.light({ kind: 'window', pos: [-50, 7.8, z], color: 0xdbe8ff, intensity: 0.9, range: 20 });
  for (let x = -66; x <= -34; x += 8) b.box([x - 0.15, 7.45, -59.8], [x + 0.15, 8.1, -16.2], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  for (const z of [-52, -40, -28]) b.box([-71.8, 7.5, z - 0.12], [-28.2, 8.05, z + 0.12], 'steel', { collide: 'none', tint: 0x5a6a7a, noNav: true, occlude: false });
  b.decor('cableTrayX', [-50, 6.4, -59.2], 0, [42, 1, 1]);
  b.decor('pipeX', [-50, 6.9, -58.6], 0, [42, 0.9, 0.9], 0xd8dde2);
  for (const z of [-54, -42, -28]) b.wallLamp(-71.85, 5.4, z, 'px', { intensity: 0.9, range: 12, color: 0xdceeff });
  for (const z of [-54, -42, -34]) b.wallLamp(-28.15, 5.4, z, 'nx', { intensity: 0.9, range: 12, color: 0xdceeff });
  b.ambient('hallHum', [-50, 5, -38], 40, 0.55);
  b.ambient('conveyor', [-52, 1.5, -26], 22, 0.65);
  b.ambient('machine', [-62, 1.5, -54], 16, 0.4);

  // Sortieranlage im Süden: niedrige Bänder (Deckung) mit Rollcontainern, Lücken ≥ 3 m
  prop(b, 'conveyor', -58, 0, -23, { rot: 0, len: 8 });
  prop(b, 'conveyor', -39, 0, -23, { rot: 0, len: 8 });
  prop(b, 'gantryConveyor', -48, 0, -30, { rot: 0, len: 22 });
  line(b, 'rollCage', -59.5, 0, -26.5, -56.5, -26.5, 3, { h: 1.2 });
  line(b, 'rollCage', -42, 0, -26.8, -39, -26.8, 3, { h: 1.0 });
  prop(b, 'gitterbox', -36, 0, -17.5, { n: 2 });
  prop(b, 'gitterbox', -36, 0, -18.8, { n: 2 });
  parcelPile(b, -66.4, 0, -23.8, 1, 5);
  prop(b, 'palletStack', -44, 0, -18, { n: 6 });
  prop(b, 'forklift', -57, 0, -18.4, { rot: 0, tint: 0x2f78c0 });
  b.sign('SORTIERBAND 2', [-48, 4.1, -30 + 0.0 + 0.6], 'pz', 3.6, 0.7, { color: 0xf0f0f0, bg: 0x2f7d6f, sub: 'PAKETE · NACH ZIELGEBIET' });

  // Hallenmitte/Nord: Stützen, Käfigreihen, Palettenblöcke
  pillars(b, [[-62, -36], [-34, -36], [-62, -48], [-34, -52]], 0, 7.6, 0x2f7d6f, 0.6);
  prop(b, 'rollCage', -64.6, 0, -34.2, { h: 1.2 });
  prop(b, 'rollCage', -64.6, 0, -33.3, { h: 0.9 });
  prop(b, 'palletStack', -68.4, 0, -40, { n: 6 });
  prop(b, 'palletGoods', -68.4, 0, -38.6, { seed: 4 });
  prop(b, 'gitterbox', -68.6, 0, -54, { n: 2 });
  prop(b, 'gitterbox', -68.6, 0, -52.7, { n: 1 });
  prop(b, 'cartons', -66, 0, -57, { seed: 8 });
  prop(b, 'palletGoods', -42, 0, -57.4, { seed: 11 });
  prop(b, 'palletGoods', -40.8, 0, -57.4, { seed: 12 });
  prop(b, 'crateStack', -31, 0, -45);
  prop(b, 'palletStack', -30, 0, -52, { n: 7 });
  prop(b, 'handTruck', -29.8, 0, -56, { rot: 3 });
  prop(b, 'forklift', -32, 0, -33.4, { rot: 2, tint: 0xe0a020 });
  b.decal({ kind: 'line', pos: [-50, 0.02, -38], size: [40, 0.15], color: 0xe8c020 });
  stripe(b, -70, -20, -30, -20, 0, 0xe8e8e8, 0.2);
  b.decal({ kind: 'stripes', pos: [-49, 0.02, -17.2], size: [6, 1.2] });
  b.decal({ kind: 'arrow', pos: [-49, 0.02, -21], size: [2, 3], rot: Math.PI, color: 0xe8e8e8 });
  b.decal({ kind: 'arrow', pos: [-67, 0.02, -31], size: [2, 3], rot: Math.PI, color: 0xe8e8e8 });

  // Zugänge: Schilder und Kanten
  hangSign(b, 'PAKETSORTIERUNG', -49, 5.8, -20, 0xffffff, 'B · ZIELGEBIET WEST', { w: 5 });
  b.sign('WOHNUNGEN ↓', [-69.88, 5.4, -22], 'px', 3.2, 0.9, { color: 0xffb13a, sub: 'SOZIALTRAKT · OBERGESCHOSS' });
  b.sign('KURZ ↑', [-28.12, 6.0, -31], 'nx', 3.0, 0.9, { color: 0xffb13a, sub: 'BRÜCKE → STEG · MITTE' });
  b.sign('UNTERFÜHRUNG ↓', [-49, 3.4, -16 - 0.12], 'nz', 5, 0.9, { color: 0xffd040, sub: 'SERVICEGANG · ↓ MITTE' });
  hazardEdge(b, -52, -16.4, -46, -16, 0);
  hazardEdge(b, -70, -28.3, -64, -28, 0);
  hazardEdge(b, -36, -38.3, -28, -38, 0);
}

function spotB(b: B): void {
  // IT-Provisorium: Serverreihen auf Paletten an der Nordseite des Spots, Klima, USV, Kabelbrücke, Band
  prop(b, 'serverRow', -49.8, 0, -47.4, { rot: 0, n: 5 });
  prop(b, 'serverRow', -43.2, 0, -47.4, { rot: 0, n: 4 });
  prop(b, 'ups', -46.6, 0, -49.4, { rot: 0 });
  prop(b, 'cooler', -53.8, 0, -47.8, { rot: 0 });
  prop(b, 'palletGoods', -38.2, 0, -49.6, { tint: 0xe8e8e8, h: 1.1 });
  b.box([-54.5, 0, -46.3], [-40.4, 0.15, -44.6], 'pallet', { collide: 'none', noNav: true, occlude: false });
  tape(b, -55, -43.8, -39, -43.8, 0);
  tape(b, -55, -43.8, -55, -35, 0);
  b.box([-57.4, 0, -43.9], [-55, 0.07, -43.5], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.5 });
  b.box([-57.4, 0, -43.9], [-57, 0.07, -36], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.5 });
  hangSign(b, 'SERVERSCHRANK B', -48, 6.2, -44, 0xff5a4a, 'IT · NICHT BERÜHREN · PROVISORIUM', { w: 5.4 });
  b.light({ kind: 'lamp', pos: [-47, 2.6, -46.2], color: 0x40c8ff, intensity: 0.55, range: 7 });
  b.ambient('buzz', [-47, 2, -46], 10, 0.55);
  b.decal({ kind: 'grid', pos: [-48, 0.02, -42], size: [14, 14] });
  b.decal({ kind: 'letter', pos: [-48, 0.02, -41], size: [5, 5], text: 'B', color: 0xff5a4a });
  // Lieferwagen (Paketdienst) an der Westwand, Nase nach Norden, Hecktüren offen zur Mitte
  prop(b, 'van', -66.4, 0, -46, { rot: 3, tint: 0xf2f0e8 });
  prop(b, 'palletGoods', -64.4, 0, -50.4, { rot: 0, seed: 14 });
  prop(b, 'cartons', -69.4, 0, -42.4, { seed: 21 });
  b.sign('LIEFERWAGEN', [-71.88 + 0.0, 3.2, -48], 'px', 2.6, 0.8, { color: 0xffd040, sub: 'ZUSTELLUNG · TOUR 17' });
  // Bank: Packtisch mit Sitzbank an der Ostseite
  prop(b, 'bench', -37.2, 0, -41.5, { rot: 1, len: 3 });
  prop(b, 'table', -34.6, 0, -41.5, { rot: 1, len: 3 });
  prop(b, 'cartons', -34.6, 0, -40.4, { seed: 9 });
  prop(b, 'rollCage', -31.4, 0, -40.4, { h: 1.2 });
  b.sign('BANK', [-28.12, 3.0, -41.5], 'nx', 2.0, 0.7, { color: 0xffd040, sub: 'PACKPLATZ 3' });
  // Deckung vor dem Spot (Südseite): Käfiggruppe und Gitterboxen als „Box-Reihe“
  line(b, 'gitterbox', -56, 0, -36, -52, -36, 3, { n: 2, rot: 0 });
  prop(b, 'crateStack', -41.6, 0, -35.6);
  prop(b, 'palletStack', -44.4, 0, -36.6, { n: 5 });
  b.decor('extinguisher', [-58.1, 1.2, -46], 0);
}

function markt(b: B): void {
  // Markt (x −64…−44, z −82…−62, Decke 4.6): Retourenlager mit Regalen, Kassen, Aktionsschildern
  tubeRow(b, -60, -66, -48, -66, 3, 4.3, true, { intensity: 1.05, range: 10, color: 0xfff0d0 });
  tubeRow(b, -60, -73, -48, -73, 3, 4.3, true, { intensity: 1.05, range: 10, color: 0xfff0d0 });
  tubeRow(b, -60, -79, -48, -79, 3, 4.3, true, { intensity: 1.0, range: 10, color: 0xfff0d0 });
  line(b, 'shelf', -62.6, 0, -80.5, -62.6, -69, 5, { rot: 1, len: 2.4 });
  line(b, 'shelf', -45.4, 0, -80.5, -45.4, -76, 3, { rot: 3, len: 2.4 });
  line(b, 'shelf', -58, 0, -81.4, -50, -81.4, 3, { rot: 0, len: 2.4 });
  prop(b, 'rollCage', -56, 0, -74.4, { h: 1.2 });
  prop(b, 'rollCage', -55.1, 0, -74.4, { h: 1.0 });
  prop(b, 'palletGoods', -52.6, 0, -69.6, { seed: 6 });
  prop(b, 'palletGoods', -51.4, 0, -69.6, { seed: 7 });
  prop(b, 'palletStack', -58.6, 0, -66.8, { n: 5 });
  prop(b, 'crate', -49.6, 0, -77, { h: 1.1 });
  prop(b, 'crate', -49.6, 0, -78.3, { h: 1.1 });
  prop(b, 'cartons', -60, 0, -72, { seed: 18 });
  // Kasse mit Schalter
  prop(b, 'counter', -48.6, 0, -66.4, { rot: 0, len: 3 });
  prop(b, 'desk', -45.8, 0, -69.6, { rot: 1 });
  b.sign('MARKT', [-54, 3.4, -82 + 0.12], 'pz', 5, 1.1, { color: 0xf0f0f0, bg: 0xb04a2a, sub: 'RETOURENLAGER · RESTPOSTEN' });
  b.sign('−50 %', [-62.88 + 0.12, 2.6, -75], 'px', 1.8, 0.9, { color: 0xffffff, bg: 0xc0301e, sub: 'AKTION' });
  b.sign('RESTPOSTEN', [-45.12, 2.5, -73], 'nx', 2.4, 0.8, { color: 0xffd040, bg: 0x20262c, sub: 'SOLANGE VORRAT' });
  b.sign('KASSE', [-48.6, 2.8, -66.1], 'pz', 1.6, 0.5, { color: 0xf0f0f0, bg: 0x20262c });
  // Seite zur Halle: Tür und Fenster mit Beschriftung
  b.sign('MARKT', [-55, 3.3, -60.12], 'pz', 2.8, 0.8, { color: 0xffd040, bg: 0xb04a2a, sub: 'TÜR · WARENANNAHME' });
  b.sign('FENSTER', [-46, 3.3, -60.12], 'pz', 2.4, 0.7, { color: 0xffd040, bg: 0x20262c, sub: 'AUSGABE' });
  b.box([-48, 1.0, -62.4], [-44, 1.06, -59.7], 'wood', { collide: 'none', tint: 0x8a6a4a, noNav: true, occlude: false }); // Fensterbrett
  b.ambient('radio', [-54, 1, -72], 10, 0.4);
  b.light({ kind: 'lamp', pos: [-46, 2.0, -61], color: 0xffe0b0, intensity: 0.7, range: 6 });
}

function kueche(b: B): void {
  // Küche (x −42…−24, z −78…−62, Decke 4.2): Großküche mit Herden, Kühlung, Edelstahl-Insel
  tubeRow(b, -38, -66, -28, -66, 3, 3.9, true, { intensity: 1.1, range: 10, color: 0xf2f8ff });
  tubeRow(b, -38, -72, -28, -72, 3, 3.9, true, { intensity: 1.1, range: 10, color: 0xf2f8ff });
  tubeRow(b, -38, -77, -28, -77, 3, 3.9, true, { intensity: 1.0, range: 10, color: 0xf2f8ff });
  line(b, 'stove', -39.2, 0, -77.4, -31, -77.4, 3, { rot: 0 });
  prop(b, 'counter', -33, 0, -70.2, { rot: 0, len: 6 });
  prop(b, 'counter', -41.4, 0, -69, { rot: 1, len: 4 });
  line(b, 'cooler', -24.7, 0, -77, -24.7, -73.4, 3, { rot: 3 });
  prop(b, 'counter', -27, 0, -77.4, { rot: 0, len: 3 });
  prop(b, 'rollCage', -37.4, 0, -63.4, { h: 1.0 });
  prop(b, 'cartons', -26, 0, -63.2, { seed: 20 });
  prop(b, 'barrel', -41.4, 0, -63.2, { rot: 0 });
  prop(b, 'palletGoods', -39.6, 0, -63.0, { rot: 0, seed: 22, h: 0.9 });
  // Töpfe auf dem Herd, hängende Pfannen, Essensausgabe
  for (const x of [-39.2, -35.1, -31]) b.box([x - 0.35, 0.94, -77.7], [x + 0.35, 1.5, -77.1], 'steel', { collide: 'none', tint: 0xb8c0c8, noNav: true, occlude: false });
  for (const x of [-38, -34, -30]) b.box([x - 0.12, 2.0, -77.9], [x + 0.12, 2.5, -77.8], 'black', { collide: 'none', tint: 0x2a2c30, noNav: true, occlude: false });
  b.sign('KÜCHE', [-32, 3.3, -62 - 0.12], 'nz', 3.0, 0.8, { color: 0xf0f0f0, bg: 0x3f7f78, sub: 'KANTINE · TÜR B' });
  b.sign('KANTINE', [-33, 3.3, -78 + 0.12], 'pz', 4.4, 0.9, { color: 0xf0f0f0, bg: 0x3f7f78, sub: 'MITTAGSTISCH 11:30 – 13:30' });
  b.sign('SPEISEPLAN', [-41.88, 2.4, -67], 'px', 2.0, 1.2, { color: 0xffd040, bg: 0x20262c, sub: 'LINSEN · SCHNITZEL' });
  b.light({ kind: 'lamp', pos: [-33, 3.2, -75], color: 0xfff0d0, intensity: 0.7, range: 8 });
  b.ambient('machine', [-33, 1.5, -74], 12, 0.4);
  b.ambient('radio', [-26, 1.5, -66], 8, 0.35);
  // Gang zum CT-Spawn (x −24…−10, z −72…−66)
  tubeRow(b, -22, -69, -12, -69, 3, 3.9, true, { intensity: 1.0, range: 9, color: 0xdceeff });
  b.sign('KÜCHE ←', [-10.12, 3.2, -68.5], 'nx', 2.6, 0.8, { color: 0x3f7f78, bg: 0xf0f0f0, sub: 'KANTINE · B' });
  prop(b, 'plant', -22.6, 0, -66.8, { h: 1.3 });
  prop(b, 'bench', -17, 0, -66.5, { rot: 0, len: 2.4 });
  prop(b, 'cartons', -12.5, 0, -71.4, { seed: 3 });
  b.sign('B ←', [-17, 3.1, -72 + 0.12], 'pz', 2.4, 0.8, { color: 0xff7a5a, sub: 'KÜCHE · MARKT · PAKETSORTIERUNG' });
}
