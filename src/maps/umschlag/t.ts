import { prop } from '../../logic/mapprops';
import { F, LV, dockRow, hazardEdge, line, parcelPile, stripe, tubeRow, type B } from './common';

/**
 * T-Seite: Ladehof (Süden, 174 m breit) mit Spawn, Docks und wartenden Lkw, die vier Ausgänge —
 * Wohnungs-Aufgang (West), Vorplatz Süd/Tor Süd (Mitte), T-Rampe (Ost-Mitte), Palast-Aufgang (Ost) —
 * und der Sozialtrakt „Wohnungen“ (Obergeschoss +4.4: Gang, Umkleide, Pausenraum).
 */
export function dressT(b: B): void {
  ladehof(b);
  aufgaenge(b);
  wohnungen(b);
}

function ladehof(b: B): void {
  // Südwand: Dockreihe über die ganze Breite, dazwischen Lkw (rückwärts angedockt)
  dockRow(b, 'z', 88 - 0.12, -82, 86, 'nz', { step: 6, n0: 31, h: 4.2, len: 3.6 });
  for (const x of [-80, -68, 8, 20, 32, 44, 56, 68, 80]) prop(b, 'trailer', x, 0, 80.5, { rot: 3, tint: [0xe8e8e8, 0xd0d8e0, 0xe4d8c0, 0xc8d4dc][Math.abs(x) % 4] });
  for (const x of [-56, 14, 50]) prop(b, 'truck', x, 0, 66, { rot: (x % 2 === 0 ? 0 : 2) as 0 | 2, tint: x === 14 ? 0x2f78c0 : 0xc23a2a });
  // Spawn-Bereich (Kaufzone): Rollfeld mit Markierungen, Spind-Container, Paletten als Deckung am Rand
  b.decal({ kind: 'letter', pos: [-30, 0.02, 69], size: [5, 5], text: 'T', color: 0xffb13a });
  b.decal({ kind: 'grid', pos: [-30, 0.02, 78], size: [26, 8] });
  stripe(b, -52, 60, -2, 60, 0, 0xe8e8e8, 0.2);
  stripe(b, -52, 60, -52, 88, 0, 0xe8e8e8, 0.2);
  stripe(b, -2, 60, -2, 88, 0, 0xe8e8e8, 0.2);
  b.decal({ kind: 'stripes', pos: [-27, 0.02, 60], size: [50, 1.2] });
  b.sign('T-SPAWN', [-30, 6.2, 88 - F - 0.02], 'nz', 8, 1.4, { color: 0xffe2b0, bg: 0x6a3a1c, sub: 'LADEHOF · KAUFZONE · SICHERHEITSWESTE TRAGEN' });
  prop(b, 'cargoContainer', -56, 0, 83, { rot: 0, tint: 0xb7791f });
  prop(b, 'cargoContainer', -56, 2.59, 83, { rot: 0, tint: 0x2b5f9e });
  prop(b, 'palletStack', -50.6, 0, 70, { n: 6 });
  prop(b, 'palletGoods', -49, 0, 70.6, { seed: 3 });
  prop(b, 'gitterbox', 2.5, 0, 72, { n: 2 });
  prop(b, 'gitterbox', 2.5, 0, 73.3, { n: 2 });
  prop(b, 'forklift', -6, 0, 84, { rot: 1, tint: 0xe0a020 });
  prop(b, 'barrelGroup', -53, 0, 62.5, { seed: 3 });
  prop(b, 'handTruck', -8, 0, 62, { rot: 2 });
  // Deckung im Hof: Container-Inseln, Palettenreihen (der Hof ist groß, alle ~12 m etwas)
  const yardCover: [number, number, number, 0 | 1 | 2 | 3][] = [[-70, 56, 0xa8432b, 0], [-46, 52, 0x2f7d4f, 0], [-20, 54, 0x8a8f96, 1], [10, 54, 0xb7791f, 0], [26, 60, 0x6b3a7a, 1], [52, 56, 0x2b5f9e, 0], [72, 58, 0xa8432b, 1]];
  for (const [x, z, tint, rot] of yardCover) prop(b, 'container', x, 0, z, { rot, tint });
  prop(b, 'container', 26, 2.59, 60, { rot: 1, tint: 0xc0b8a8 });
  const piles: [number, number, number][] = [[-62, 72, 1], [-36, 56, 2], [-12, 58, 3], [18, 70, 4], [38, 74, 5], [62, 70, 6], [76, 66, 7]];
  for (const [x, z, s] of piles) parcelPile(b, x, 0, z, (s % 2) as 0 | 1, s);
  prop(b, 'crateStack', -62, 0, 62);
  prop(b, 'crateStack', 44, 0, 62);
  prop(b, 'forklift', 62, 0, 84, { rot: 3, tint: 0x2f78c0 });
  line(b, 'cones', -83, 0, 52, -83, 60, 3, {});
  line(b, 'bumper', -20, 0, 87.5, 12, 87.5, 5, {});
  // Licht: Mastleuchten im warmen Natriumlicht
  for (const [x, z] of [[-76, 62], [-46, 66], [-14, 62], [18, 64], [52, 64], [80, 58], [-12, 84], [30, 84]] as const) prop(b, 'lampPost', x, 0, z);
  b.ambient('traffic', [0, 6, 80], 60, 0.4);
  b.ambient('forklift', [-6, 1, 82], 14, 0.4);
  b.ambient('wind', [0, 8, 60], 80, 0.4);
  // Hallenfront Süd (Fassade nach Norden an der Südwand des Hofs ist die Dockreihe); Nordseite: Gewerbebauten
  b.sign('LADEHOF', [-70, 6.6, 88 - F - 0.02], 'nz', 6, 1.4, { color: 0xf0f0f0, bg: 0x2f6fb0, sub: 'DOCKS 31 – 59 · ANLIEFERUNG' });
  b.sign('LADEHOF', [60, 6.6, 88 - F - 0.02], 'nz', 6, 1.4, { color: 0xf0f0f0, bg: 0x2f6fb0, sub: 'DOCKS 31 – 59 · ANLIEFERUNG' });
}

function aufgaenge(b: B): void {
  // Vorplatz Süd (T-Mitte): Pfeile, Poller, Container-Barrikade
  b.decal({ kind: 'arrow', pos: [0, 0.02, 40], size: [3, 4], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'letter', pos: [0, 0.02, 34], size: [3, 3], text: 'M', color: 0xe8c020 });
  prop(b, 'cargoContainer', -17, 0, 40, { rot: 1, tint: 0x2f7d4f });
  prop(b, 'palletStack', 9.5, 0, 38, { n: 6 });
  prop(b, 'palletGoods', 9.5, 0, 36.6, { seed: 9 });
  prop(b, 'crateStack', -9, 0, 46);
  prop(b, 'bumper', 11, 0, 31);
  prop(b, 'lampPost', -20, 0, 33);
  prop(b, 'lampPost', 12, 0, 45);
  b.sign('MITTE ↑', [-24 + F, 4.0, 40], 'px', 3.2, 0.9, { color: 0xffd040, sub: 'TOR SÜD · UMSCHLAGHALLE' });
  b.sign('MITTE ↑', [14 - F, 4.0, 40], 'nx', 3.2, 0.9, { color: 0xffd040, sub: 'TOR SÜD · UMSCHLAGHALLE' });

  // T-Rampe (Lkw-Rampe nach A, 14 m, +2 m): Seitenwände mit Warnstreifen, Poller, Schilder
  b.sign('RAMPE A ↑', [34 + F, 4.2, 40], 'px', 3.4, 0.9, { color: 0xff7a5a, sub: 'T-RAMPE · LKW-AUFFAHRT' });
  b.sign('RAMPE A ↑', [46 - F, 4.2, 40], 'nx', 3.4, 0.9, { color: 0xff7a5a, sub: 'T-RAMPE · LKW-AUFFAHRT' });
  hazardEdge(b, 34, 47.7, 46, 48, 0);
  hazardEdge(b, 34, 29.7, 46, 30, LV.apron);
  prop(b, 'bumper', 35, 0, 47.4);
  prop(b, 'bumper', 45, 0, 47.4);
  for (const z of [34, 42]) { b.wallLamp(34 + F, 6.2, z, 'px', { intensity: 1.0, range: 12, color: 0xffd9a0 }); b.wallLamp(46 - F, 6.2, z, 'nx', { intensity: 1.0, range: 12, color: 0xffd9a0 }); }
  stripe(b, 40, 30, 40, 47, 0, 0xe8e8e8, 0.2);
  b.decal({ kind: 'arrow', pos: [40, 0.03, 40], size: [3, 4], rot: 0, color: 0xe8e8e8 });

  // Palast-Aufgang (Treppe +5.6 m): Schilder und Licht
  b.sign('PALAST ↑', [76 + F, 4.6, 41], 'px', 3.4, 0.9, { color: 0xffd040, sub: 'DISPOSITION · BÜROS' });
  b.sign('PALAST ↑', [84 - F, 4.6, 41], 'nx', 3.4, 0.9, { color: 0xffd040, sub: 'DISPOSITION · BÜROS' });
  for (const z of [36, 44]) { b.wallLamp(76 + F, 6.8, z, 'px', { intensity: 1.0, range: 12, color: 0xffd9a0 }); b.wallLamp(84 - F, 6.8, z, 'nx', { intensity: 1.0, range: 12, color: 0xffd9a0 }); }
  hazardEdge(b, 76, 47.7, 84, 48, 0);
  prop(b, 'lampPost', 72, 0, 52);
  prop(b, 'palletGoods', 88, 0, 50, { rot: 1, seed: 7 });
  prop(b, 'container', 80, 0, 56, { rot: 0, tint: 0x6b3a7a });

  // Wohnungs-Aufgang (Treppe +4.4 m) mit Spind-Wand und Schild
  b.sign('WOHNUNGEN ↑', [-70 + F, 3.8, 33], 'px', 3.6, 0.9, { color: 0xffb13a, sub: 'SOZIALTRAKT · B ÜBER OBERGESCHOSS' });
  b.sign('WOHNUNGEN ↑', [-64 - F, 3.8, 33], 'nx', 3.6, 0.9, { color: 0xffb13a, sub: 'SOZIALTRAKT · B ÜBER OBERGESCHOSS' });
  b.sign('WOHNUNGEN', [-67, 5.4, 38 + 0.12], 'pz', 6, 1.2, { color: 0xf0f0f0, bg: 0x6a3a1c, sub: 'SOZIALTRAKT · UMKLEIDEN · PAUSE' });
  for (const z of [30, 35]) { b.wallLamp(-70 + F, 6.4, z, 'px', { intensity: 1.0, range: 12, color: 0xffd9a0 }); b.wallLamp(-64 - F, 6.4, z, 'nx', { intensity: 1.0, range: 12, color: 0xffd9a0 }); }
  hazardEdge(b, -70, 37.7, -64, 38, 0);
  prop(b, 'container', -78, 0, 44, { rot: 0, tint: 0xc0b8a8 });
  prop(b, 'barrel', -58.6, 0, 42);
  prop(b, 'barrel', -58.6, 0, 43.1);
  prop(b, 'palletGoods', -81, 0, 52, { seed: 12 });
  prop(b, 'lampPost', -76, 0, 46);
  prop(b, 'lampPost', -62, 0, 54);
  prop(b, 'handTruck', -84.4, 0, 40, { rot: 3 });
}

function wohnungen(b: B): void {
  const Y = LV.up;
  // Gang (x −70…−64, z −16…26): Röhren, Wandlampen, Rohre, Bodenmarkierung
  tubeRow(b, -67, 24, -67, -14, 8, 7.45, false, { intensity: 1.05, range: 10, color: 0xe6f0ff });
  b.decor('pipeZ', [-69.4, Y + 3.0, 5], 0, [0.8, 0.8, 42], 0xd8dde2);
  b.decor('cableTrayZ', [-64.8, Y + 2.9, 5], 0, [1, 1, 42]);
  stripe(b, -67, -14, -67, 24, Y, 0xe8c020);
  b.decal({ kind: 'arrow', pos: [-67, Y + 0.02, 8], size: [1.6, 2.6], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'arrow', pos: [-67, Y + 0.02, -6], size: [1.6, 2.6], rot: Math.PI, color: 0xe8e8e8 });
  hazardEdge(b, -70, 25.7, -64, 26, Y);
  b.sign('WOHNUNGEN', [-69.88, Y + 2.2, 24], 'px', 2.6, 0.8, { color: 0xffb13a, sub: '↓ T-SEITE · ↑ B' });
  b.sign('WOHNUNGEN', [-64.12, Y + 2.2, -12], 'nx', 2.6, 0.8, { color: 0xffb13a, sub: '↑ B · PAKETSORTIERUNG' });
  // Deckung im Gang (3 m Gasse bleibt frei): Rollcontainer, Handwagen, Pflanze, Bank
  prop(b, 'rollCage', -69.2, Y, 18, { h: 1.2 });
  prop(b, 'rollCage', -68.3, Y, 18, { h: 0.9 });
  prop(b, 'rollCage', -64.8, Y, 10, { h: 1.3 });
  prop(b, 'handTruck', -64.9, Y, 4, { rot: 1 });
  prop(b, 'plant', -69.3, Y, 0, { h: 1.5 });
  prop(b, 'bench', -64.6, Y, -4, { rot: 1, len: 2.4 });
  prop(b, 'cartons', -69.2, Y, -9, { seed: 2 });
  prop(b, 'rollCage', -69.2, Y, 13, { h: 1.1 });
  prop(b, 'locker', -64.5, Y, 21, { rot: 3 });
  prop(b, 'locker', -64.5, Y, 22.1, { rot: 3 });
  prop(b, 'electricBox', -64.12, Y, -1, { rot: 3 });
  b.decor('extinguisher', [-64.4, Y + 1.2, 14], 0);
  b.decor('extinguisher', [-69.6, Y + 1.2, -12], 0);
  b.ambient('hallHum', [-67, Y + 2, 5], 30, 0.35);
  b.ambient('radio', [-78, Y + 1, 16], 10, 0.45);

  // Umkleide (x −84…−72, z −10…4): Spindreihen, Bänke, Schuhregal, Waschbecken
  line(b, 'locker', -83.5, Y, -9.4, -83.5, -9.4 + 11, 11, { rot: 3 });
  line(b, 'locker', -77, Y, -9.5, -73, -9.5, 5, { rot: 0 });
  prop(b, 'bench', -79.8, Y, -4, { rot: 1, len: 4 });
  prop(b, 'bench', -79.8, Y, 0, { rot: 1, len: 4 });
  prop(b, 'cartons', -74, Y, 2.8, { seed: 7 });
  prop(b, 'handTruck', -83, Y, 3, { rot: 0 });
  tubeRow(b, -80, -8, -80, 2, 3, 7.45, false, { intensity: 1.0, range: 9, color: 0xe6f0ff });
  b.sign('UMKLEIDE', [-69.88, Y + 2.7, -3], 'px', 2.4, 0.7, { color: 0xf0f0f0, bg: 0x30404c, sub: 'SCHICHTWECHSEL' });
  b.sign('SPINDE 1–40', [-83.88, Y + 2.4, -3], 'px', 2.6, 0.7, { color: 0xffd040, sub: 'NUR EIGENE SCHLÖSSER' });

  // Pausenraum (x −84…−72, z 8…24): Tische mit Bänken, Stuhlstapel, Küchenzeile, Kaffeemaschine, Pflanzen
  prop(b, 'table', -78, Y, 12, { rot: 1, len: 3 });
  prop(b, 'table', -78, Y, 18, { rot: 1, len: 3 });
  prop(b, 'chairStack', -83, Y, 9.4, { n: 7 });
  prop(b, 'chairStack', -83, Y, 10.4, { n: 5 });
  prop(b, 'counter', -78, Y, 23.4, { rot: 2, len: 5 });
  prop(b, 'cooler', -74, Y, 23.4, { rot: 2 });
  prop(b, 'plant', -83.4, Y, 22.8, { h: 1.6 });
  prop(b, 'plant', -73.4, Y, 9.6, { h: 1.3 });
  b.box([-84, Y + 0.9, 23.2], [-80, Y + 1.2, 23.5], 'metal', { collide: 'none', tint: 0x30343a, noNav: true, occlude: false }); // Kaffeemaschine
  tubeRow(b, -80, 10, -80, 22, 3, 7.45, false, { intensity: 1.0, range: 9, color: 0xfff0d0 });
  b.sign('PAUSENRAUM', [-69.88, Y + 2.7, 17], 'px', 2.6, 0.7, { color: 0xf0f0f0, bg: 0x3f7f78, sub: 'KAFFEE · 15 MIN' });
  b.sign('SCHICHTPLAN', [-83.88, Y + 2.0, 17], 'px', 2.4, 1.2, { color: 0xf0f0f0, bg: 0x30404c, sub: 'FRÜH · SPÄT · NACHT' });
  b.light({ kind: 'lamp', pos: [-78, Y + 2.4, 16], color: 0xffe0b0, intensity: 0.7, range: 10 });
  b.light({ kind: 'lamp', pos: [-78, Y + 2.4, -2], color: 0xe6f0ff, intensity: 0.6, range: 10 });
}
