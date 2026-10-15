import { prop } from '../../logic/mapprops';
import { F, LV, dockRow, hangSign, hazardEdge, lampGrid, line, parcelPile, pillars, stripe, tubeRow, type B } from './common';

/**
 * Die Mitte: Umschlaghalle (x −14…14, z −34…26, Decke 11 m) mit Tor Süd, Steg (Wartungslaufsteg +4.4 m an der
 * Sortieranlage → Kurz-Brücke nach B), Fenster (Leitstand +4.4 m mit offener Scheibenwand über der Oberen Mitte),
 * Schacht zur Unterführung (−3.6 m) und der Unterführung selbst.
 */
export function dressMid(b: B): void {
  hallShell(b);
  steg(b);
  fenster(b);
  unterfuehrung(b);
  hallCover(b);
  hallSigns(b);
}

// ---------------------------------------------------------------- Hallendecke, Licht, Docks
function hallShell(b: B): void {
  // Binder quer über die Halle, Lichtbänder unter der Decke
  for (let z = -30; z <= 22; z += 8) prop(b, 'truss', 0, 8.6, z, { rot: 0, len: 28, h: 2.2 });
  for (const z of [-24, -8, 8]) b.box([-12, 10.96, z - 1.6], [12, 10.99, z + 1.6], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  for (const z of [-24, -8, 8]) b.light({ kind: 'window', pos: [0, 10.4, z], color: 0xdbe8ff, intensity: 1.0, range: 22 });
  lampGrid(b, -8, -28, 8, 20, 3, 7, 9.4, { intensity: 1.7, range: 20 });
  // Dock-Reihen innen (Ost- und Westwand) und Wandlampen
  dockRow(b, 'x', 14 - 0.1, -10, 24, 'nx', { step: 6, n0: 1 });
  dockRow(b, 'x', -14 + 0.1, 6, 24, 'px', { step: 6, n0: 21 });
  for (const z of [-28, -16, -4, 8, 20]) b.wallLamp(13.85, 6.4, z, 'nx', { intensity: 1.0, range: 14, color: 0xdceeff });
  for (const z of [-28, -16, -4, 8, 20]) b.wallLamp(-13.85, 6.4, z, 'px', { intensity: 1.0, range: 14, color: 0xdceeff });
  // Leitungen unter der Decke
  b.decor('cableTrayZ', [13.2, 8.3, -6], 0, [1, 1, 56]);
  b.decor('pipeZ', [-13.0, 9.8, -4], 0, [1.2, 1.2, 56], 0xd8dde2);
  b.decor('pipeZ', [-12.2, 9.4, -4], 0, [0.7, 0.7, 56], 0x2f6fb0);
  // Bodenmarkierung: Fahrspuren und Pfeile
  stripe(b, -9, -30, -9, 24, 0, 0xe8c020);
  stripe(b, 9, -30, 9, 24, 0, 0xe8c020);
  b.decal({ kind: 'arrow', pos: [0, 0.02, -26], size: [2.2, 3.4], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'arrow', pos: [0, 0.02, 14], size: [2.2, 3.4], rot: Math.PI, color: 0xe8e8e8 });
  b.decal({ kind: 'stripes', pos: [0, 0.02, 24.6], size: [16, 1.2] });
  b.decal({ kind: 'letter', pos: [0, 0.02, -2], size: [4, 4], text: 'M', color: 0xe8c020 });
  b.ambient('hallHum', [0, 7, -4], 40, 0.55);
  b.ambient('conveyor', [-6.5, 3, -12], 20, 0.6);
  b.ambient('forklift', [8, 1, 14], 14, 0.4);
}

// ---------------------------------------------------------------- Steg (Wartungslaufsteg) und Kurz-Brücke
function steg(b: B): void {
  const Y = LV.up;
  // Geländer: Ostkante, Nordende, Brücke beidseitig, Plattform in B
  b.rail(-10.05, -26, -10.05, 2, Y);
  b.rail(-14, -25.95, -10, -25.95, Y);
  b.rail(-26, -25.95, -16, -25.95, Y);
  b.rail(-26, -20.05, -16, -20.05, Y);
  b.rail(-36, -20.05, -28, -20.05, Y);
  b.rail(-36.05, -26, -36.05, -20, Y);
  // Stützen unter dem Steg (Deckung auf Bodenhöhe), Streben
  pillars(b, [[-10.3, -24], [-10.3, -14], [-10.3, -4], [-10.3, 1.4]], 0, Y - 0.4, 0x2f6fb0);
  b.box([-14, Y - 0.9, -26], [-10, Y - 0.4, 2], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  // Sortierförderer neben dem Steg (aufgeständert, man läuft darunter hindurch)
  prop(b, 'gantryConveyor', -6.5, 0, -11, { rot: 1, len: 26 });
  prop(b, 'gantryConveyor', -6.5, 0, 6.5, { rot: 1, len: 3 });
  // Brücke: Wartungsleuchten, Schilder, Zierkanten
  b.tubeLamp(-12, Y + 3.2, -12, false, { intensity: 0.9, range: 10 });
  b.tubeLamp(-12, Y + 3.2, 0, false, { intensity: 0.9, range: 10 });
  b.tubeLamp(-12, Y + 3.2, -22, false, { intensity: 0.9, range: 10 });
  b.tubeLamp(-21, Y + 3.0, -23, true, { intensity: 0.9, range: 9, color: 0xffe2b0 });
  hazardEdge(b, -14, 1.7, -10, 2, Y);
  hazardEdge(b, -26, -26, -16, -25.7, Y);
  b.sign('STEG', [-13.85, 7.6, -8], 'px', 3.2, 0.9, { color: 0xffd040, sub: 'WARTUNGSLAUFSTEG · KURZ → B' });
  b.sign('KURZ B →', [-15.88, 7.2, -17], 'pz', 3.6, 0.9, { color: 0xffb13a, sub: 'BRÜCKE ZUR PAKETSORTIERUNG' });
  b.sign('STEG ↑', [-13.85, 3.3, 11], 'px', 2.6, 0.8, { color: 0xffd040, sub: 'NUR PERSONAL' });
  b.sign('SORTIERANLAGE', [-6.5, 4.1, 6.4], 'pz', 3.2, 0.7, { color: 0xf0f0f0, bg: 0x2f6fb0, sub: 'BAND 4 · NICHT BETRETEN' });
  parcelPile(b, -12, 0, 6, 1, 4);
  // Ladung der Anlage: Gitterboxen am Bandende, Rollcontainer
  prop(b, 'gitterbox', -9, 0, -27, { n: 1 });
  prop(b, 'rollCage', -8.9, 0, -25.6, { h: 1.2 });
  prop(b, 'rollCage', -8, 0, -25.6, { h: 0.9 });
  // B-Seite: Kante und Lampe der Plattform
  hazardEdge(b, -36, -26.3, -28, -26, Y);
  b.tubeLamp(-32, Y + 3.0, -23, true, { intensity: 0.9, range: 9 });
}

// ---------------------------------------------------------------- Fenster: Leitstand (+4.4) mit Scheibenwand
function fenster(b: B): void {
  const Y = LV.up;
  // Fensterpfosten in der Scheibenwand (z −22…−20) über der Brüstung (1.0 m)
  for (const x of [5, 9]) b.box([x - 0.07, Y + 1.0, -22], [x + 0.07, Y + 2.8, -20], 'steel', { tint: 0x4a5a6a, tag: 'pillar' });
  b.box([2, Y + 2.78, -22.05], [12, Y + 2.9, -19.95], 'steel', { collide: 'none', tint: 0x6a7480, noNav: true, occlude: false });
  b.box([2, Y + 0.96, -20.05], [12, Y + 1.04, -19.9], 'metal', { collide: 'none', tint: 0xd8b020, noNav: true, occlude: false });
  b.sign('LEITSTAND', [7, 7.9, -19.88], 'pz', 8, 1.2, { color: 0xf0f0f0, bg: 0x2f6fb0, sub: 'UMSCHLAG · SCHICHTLEITUNG · FENSTER' });
  // Möblierung: Pulte mit Blick auf die Halle, Serverschrank (IT), Tafel, Stühle
  prop(b, 'console', 4.2, Y, -24.6, { rot: 2, len: 3 });
  prop(b, 'console', 9.8, Y, -24.6, { rot: 2, len: 3 });
  prop(b, 'desk', 3, Y, -31.5, { rot: 0 });
  prop(b, 'desk', 11, Y, -31.5, { rot: 0 });
  prop(b, 'serverRow', 7, Y, -33.4, { rot: 0, n: 3 });
  prop(b, 'locker', 2.6, Y, -28.4, { rot: 1 });
  prop(b, 'locker', 2.6, Y, -27.4, { rot: 1 });
  prop(b, 'cartons', 11.2, Y, -27.4, { seed: 9 });
  b.sign('SCHICHTPLAN', [11.85, Y + 1.7, -29], 'nx', 2.4, 1.1, { color: 0xf0f0f0, bg: 0x30404c, sub: 'FRÜH · SPÄT · NACHT' });
  b.sign('LAGEPLAN', [2.15, Y + 1.7, -30], 'px', 2.4, 1.1, { color: 0xffd040, bg: 0x20262c, sub: 'A · B · MITTE' });
  b.sign('LEITSTAND-TREPPE ↓ CT', [8, Y + 1.8, -37.85], 'pz', 3.2, 0.7, { color: 0xffd040, sub: 'ZUGANG NUR PERSONAL' });
  // Licht: Leuchtröhren, warmer Schreibtischschein
  tubeRow(b, 5, -31, 5, -25, 3, 7.7, false, { intensity: 1.0, range: 9 });
  tubeRow(b, 9, -31, 9, -25, 3, 7.7, false, { intensity: 1.0, range: 9 });
  b.light({ kind: 'lamp', pos: [7, Y + 1.6, -33], color: 0x40c8ff, intensity: 0.5, range: 6 });
  b.light({ kind: 'lamp', pos: [3, Y + 1.5, -31], color: 0xffd9a0, intensity: 0.6, range: 5 });
  b.decal({ kind: 'letter', pos: [7, Y + 0.02, -28], size: [3, 3], text: 'F', color: 0x7fc0ff });
  b.ambient('buzz', [7, Y + 1.5, -31], 8, 0.5);
  b.ambient('radio', [4, Y + 1, -26], 8, 0.4);
  // Zugangskorridor (z −38…−34): Lampe und Warnstreifen
  b.tubeLamp(8, 4.8 + 2.6, -36, false, { intensity: 0.9, range: 8 });
  hazardEdge(b, 6, -38.3, 10, -38, Y);
}

// ---------------------------------------------------------------- Unterführung (−3.6 m)
function unterfuehrung(b: B): void {
  const Y = LV.under;
  // Schacht in der Halle: Geländer um die Grube, Warnkanten, Schild
  b.rail(-14, 15.95, -4, 15.95, 0, 1.05, 0xe0a020);
  b.rail(-14, 22.05, -4, 22.05, 0, 1.05, 0xe0a020);
  hazardEdge(b, -4.4, 16, -4, 22, 0);
  hazardEdge(b, -14, 15.6, -4, 15.95, 0);
  hazardEdge(b, -14, 22.05, -4, 22.4, 0);
  hangSign(b, 'UNTERFÜHRUNG', -9, 6.2, 19, 0xffd040, 'SERVICEGANG · ↓ PAKETSORTIERUNG B', { w: 4.8 });
  b.light({ kind: 'lamp', pos: [-9, -1.6, 17.5], color: 0xcfe4ff, intensity: 1.0, range: 10 });
  b.light({ kind: 'lamp', pos: [-9, -1.6, 20.5], color: 0xcfe4ff, intensity: 1.0, range: 10 });
  b.sign('B ←', [-13.85, -1.2, 19], 'px', 1.8, 0.8, { color: 0xff7a5a, sub: 'UNTERFÜHRUNG' });
  // Gang: Röhren, Kabelwannen, Rohre, Beschriftung, Deckung
  tubeRow(b, -20, 19, -48, 19, 5, Y + 2.7, true, { intensity: 1.05, range: 10 });
  tubeRow(b, -49, 14, -49, 0, 4, Y + 2.7, false, { intensity: 1.05, range: 10 });
  b.decor('cableTrayX', [-33, Y + 2.5, 21], 0, [34, 1, 1]);
  b.decor('pipeX', [-33, Y + 2.2, 17.2], 0, [34, 1.0, 1.0], 0xd8dde2);
  b.decor('pipeX', [-33, Y + 1.9, 17.2], 0, [34, 0.6, 0.6], 0xc0442e);
  b.decor('cableTrayZ', [-47.2, Y + 2.5, 8], 0, [1, 1, 30]);
  b.decor('pipeZ', [-50.6, Y + 2.2, 8], 0, [1.0, 1.0, 30], 0xd8dde2);
  for (const x of [-22, -30, -38, -46]) b.wallLamp(x, Y + 2.1, 16.15, 'pz', { intensity: 0.7, range: 9, color: 0xffe2b0 });
  // Deckung im Gang (3 m Gasse bleibt frei): Paletten, Käfige, Fässer, Stapler-Ladegerät
  prop(b, 'palletGoods', -26, Y, 21, { seed: 31 });
  prop(b, 'palletStack', -34, Y, 17.2, { n: 5 });
  prop(b, 'gitterbox', -40, Y, 21.2, { n: 2 });
  prop(b, 'barrelGroup', -45, Y, 17.2, { seed: 4 });
  prop(b, 'rollCage', -29, Y, 17.1, { h: 1.1 });
  prop(b, 'palletGoods', -50.8, Y, 10, { rot: 1, seed: 17 });
  prop(b, 'cartons', -50.5, Y, 4, { seed: 5 });
  prop(b, 'gitterbox', -47.3, Y, 12, { n: 1, rot: 1 });
  prop(b, 'barrelGroup', -50.7, Y, -0.5, { seed: 8 });
  prop(b, 'electricBox', -52 + F, Y + 0.0, 14, { rot: 3 });
  prop(b, 'electricBox', -22, Y + 0.0, 22 - F, { rot: 2 });
  b.decal({ kind: 'stripes', pos: [-20, Y + 0.02, 19], size: [1.4, 6], rot: 0 });
  stripe(b, -48, 19, -16, 19, Y, 0xe8c020);
  stripe(b, -49, 20, -49, -2, Y, 0xe8c020);
  b.decal({ kind: 'arrow', pos: [-30, Y + 0.02, 19], size: [2.2, 3.2], rot: Math.PI / 2, color: 0xe8e8e8 });
  b.decal({ kind: 'arrow', pos: [-49, Y + 0.02, 8], size: [2.2, 3.2], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'stain', pos: [-36, Y + 0.02, 19.5], size: [6, 2.4] });
  b.sign('B ↑', [-52.88 + 0.12, Y + 1.7, 6], 'px', 2.4, 0.8, { color: 0xff7a5a, sub: 'PAKETSORTIERUNG' });
  b.sign('MITTE ←', [-15.88, Y + 1.9, 19], 'px', 2.6, 0.8, { color: 0xffd040, sub: 'UMSCHLAGHALLE' });
  b.sign('UNTERFÜHRUNG', [-52.88 + 0.12, Y + 1.9, 18], 'px', 3.2, 0.8, { color: 0xf0f0f0, bg: 0x30404c, sub: 'DURCHFAHRT NUR FUSSGÄNGER' });
  // Rampe
  b.light({ kind: 'lamp', pos: [-49, -1.4, -6], color: 0xdceeff, intensity: 1.0, range: 10 });
  b.light({ kind: 'lamp', pos: [-49, 0.6, -12], color: 0xdceeff, intensity: 1.0, range: 10 });
  b.decor('cableTrayZ', [-47.0, 3.2, -9], 0, [1, 1, 14]);
  hazardEdge(b, -52, -16.4, -46, -16, 0);
  b.sign('PAKETSORTIERUNG B', [-52 + 0.12, 2.2, -10], 'px', 4, 0.8, { color: 0xffb13a, sub: '↑ AUSGANG · RAMPE' });
  b.ambient('ventilation', [-35, Y + 1, 19], 16, 0.55);
  b.ambient('drip', [-49, Y + 1, 4], 8, 0.5);
}

// ---------------------------------------------------------------- Deckung in der Halle
function hallCover(b: B): void {
  // Untere Mitte (T-Seite): „Mid-Kisten“ — Kistenstapel, Stapler, Paletten
  prop(b, 'crateStack', 3.4, 0, 14);
  prop(b, 'crateStack', 8.6, 0, 9.6);
  prop(b, 'palletStack', 6, 0, 15.6, { n: 6 });
  prop(b, 'palletGoods', 6, 0, 17, { seed: 3 });
  prop(b, 'forklift', 10.6, 0, 20, { rot: 1, tint: 0xe0a020 });
  prop(b, 'gitterbox', -0.4, 0, 21, { n: 2 });
  prop(b, 'gitterbox', -0.4, 0, 22.3, { n: 2 });
  prop(b, 'cartons', 2.5, 0, 22, { seed: 12 });
  prop(b, 'handTruck', 12, 0, 12, { rot: 3 });
  // Mitte: Sortierinsel mit niedrigem Band, Käfige, Stützen
  prop(b, 'conveyor', 2.5, 0, -4, { rot: 1, len: 9 });
  prop(b, 'rollCage', 0.2, 0, -8.5, { h: 1.3 });
  prop(b, 'rollCage', 0.2, 0, -9.4, { h: 1.0 });
  prop(b, 'palletGoods', 5.8, 0, 1.6, { seed: 8 });
  prop(b, 'palletGoods', 5.8, 0, 2.8, { seed: 9 });
  prop(b, 'gitterbox', -3.6, 0, 2.4, { n: 1 });
  pillars(b, [[-4.5, -4], [-4.5, -14], [4.5, 8], [4.5, -16]], 0, 10.6, 0x2f5f9e, 0.6);
  // Obere Mitte: Kisten vor dem Leitstand-Sockel, Paletten, Stapler
  prop(b, 'crateStack', 8, 0, -17.5);
  prop(b, 'palletStack', 4.6, 0, -18.2, { n: 7 });
  prop(b, 'palletGoods', 11.6, 0, -18, { seed: 21 });
  prop(b, 'forklift', -2.6, 0, -22, { rot: 2, tint: 0x2f78c0 });
  prop(b, 'gitterbox', -6, 0, -31, { n: 2 });
  prop(b, 'gitterbox', -4.8, 0, -31, { n: 2 });
  parcelPile(b, 1.8, 0, -30.6, 0, 6);
  prop(b, 'rollCage', 10.6, 0, -14.4, { h: 1.1 });
  prop(b, 'cartons', 12.2, 0, -12, { seed: 14 });
  // Sockel des Leitstands: Wandschrank, Feuerlöscher, Schild
  prop(b, 'electricBox', 1.9, 0, -20 + 0.0 + F, { rot: 0 });
  b.decor('extinguisher', [13.5, 1.2, -26], 0);
  // Unterer Teil der Südwand/Tor: Streifenvorhang-Ersatz
  line(b, 'cones', -6, 0, 24.6, 6, 24.6, 4, {});
}

// ---------------------------------------------------------------- Schilder der Halle
function hallSigns(b: B): void {
  hangSign(b, 'UNTERE MITTE', 0, 8.0, 12, 0xffd040, 'T-SEITE · TOR SÜD', { w: 5 });
  hangSign(b, 'MITTE', 0, 8.0, -2, 0xffd040, 'UMSCHLAGHALLE · 56 DOCKS', { w: 5 });
  hangSign(b, 'OBERE MITTE', 0, 8.0, -18, 0xffd040, 'CT-SEITE · FENSTER ↑', { w: 5 });
  b.sign('VERBINDUNG →', [13.88, 3.8, -12], 'nx', 3.2, 0.9, { color: 0xffb13a, sub: 'DSCHUNGEL · RAMPE A' });
  b.sign('CT ↑', [-7.0, 4.6, -33.88], 'pz', 2.4, 0.8, { color: 0x8fc0ff, sub: 'WARENEINGANG' });
  b.sign('TOR SÜD', [0, 5.2, 25.88], 'nz', 5, 1.0, { color: 0xf0f0f0, bg: 0x2f6fb0, sub: 'LADEHOF · T-SEITE' });
  // Außen: große Aufschrift über dem Tor
  b.sign('UMSCHLAGHALLE', [0, 8.8, 30.12], 'pz', 12, 2.0, { color: 0xf0f0f0, bg: 0x2f6fb0, sub: 'CROSS-DOCKING · TOR SÜD · 24 H' });
  for (const x of [-8.5, 8.5]) b.wallLamp(x, 6.8, 30.12, 'pz', { intensity: 1.2, range: 14, color: 0xffd9a0 });
  prop(b, 'bumper', -9, 0, 29.6);
  prop(b, 'bumper', 9, 0, 29.6);
  hazardEdge(b, -8, 25.7, 8, 26, 0);
}
