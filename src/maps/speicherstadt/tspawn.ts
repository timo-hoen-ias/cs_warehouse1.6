import { prop } from '../../logic/mapprops';
import { F, awning, barge, bollard, chain, edge, hoists, lamp, line, plate, shop, type B } from './helpers';

// ====================================================================== T-Spawn: Hafenterrasse (+1.6 m)
export function dressTerrace(b: B): void {
  const Y = 1.6;
  // Kaimauer: Poller und Ketten, Lastkähne und ein Frachter im Hafenbecken (Wasserspiegel −1.2 m)
  for (let x = -32; x <= 14; x += 6) bollard(b, x, Y + 1.2, 81.2);
  for (let x = -32; x < 14; x += 6) chain(b, x, 81.2, x + 6, 81.2, Y + 1.2);
  barge(b, -22, -1.0, 88.5, 16, 4.6, { cabin: true, cargo: true });
  barge(b, 0, -1.0, 88, 24, 6, { cabin: true, cargo: true, hull: 0x1f2c34 });
  barge(b, 40, -1.0, 87.5, 18, 5, { cargo: true });
  barge(b, -60, -1.0, 88, 14, 4.2, { cabin: true });
  // Hafenkräne (Ausleger über das Wasser, rostig)
  prop(b, 'crane', -26, Y, 79, { rot: 1, h: 12, len: 10 });
  prop(b, 'crane', 10, Y, 79, { rot: 1, h: 11, len: 9 });
  // Containerstapel und Zollhäuschen
  prop(b, 'container', -31.5, Y, 63.6, { rot: 1, tint: 0x9a4a32 });
  prop(b, 'container', -31.5, Y + 2.59, 63.6, { rot: 1, tint: 0x3a6a8a });
  prop(b, 'container', 12.2, Y, 75, { rot: 1, tint: 0x2f6a4a });
  prop(b, 'container', 12.2, Y + 2.59, 75, { rot: 1, tint: 0x8a6a3a });
  b.box([2, Y, 74], [8, Y + 3.0, 80], 'brick', { tint: 0xc4a08a, top: 'roof' });
  b.box([1.7, Y + 3.0, 73.7], [8.3, Y + 3.25, 80.3], 'roof', { tint: 0x6a4a3a, noNav: true });
  b.box([2.2, Y, 73.94], [3.4, Y + 2.1, 74.0], 'door', { collide: 'none', tint: 0x3c5a48, noNav: true, occlude: false });
  b.box([5, Y + 1.2, 73.94], [7, Y + 2.0, 74.0], 'window', { collide: 'none', noNav: true, occlude: false, uvFit: true });
  shop(b, 'ZOLL', 5, Y + 2.6, 73.9, 'nz', 'HAFENAMT', 2.6);
  // Ware am Kai
  prop(b, 'sacks', -14, Y, 78, { len: 3.6, n: 3 });
  prop(b, 'sacks', -5, Y, 79.2, { len: 2.7, n: 2 });
  prop(b, 'palletGoods', -18.5, Y, 74.5, { tint: 0xc9ad7c });
  prop(b, 'palletGoods', -18.5, Y, 75.8, { tint: 0xd2b88a });
  prop(b, 'barrelGroup', 6, Y, 66, {});
  prop(b, 'crate', 9.5, Y, 70, { h: 1.2 });
  prop(b, 'crate', 9.5, Y + 1.2, 70, { h: 0.9 });
  prop(b, 'handTruck', -25, Y, 72, { rot: 1 });
  prop(b, 'cartons', -12, Y, 61.8);
  line(b, 'palletStack', -30, Y, 70.5, -30, Y, 76, 3, { n: 5, rot: 1 });
  // Laternen
  for (const [x, z] of [[-30, 79], [-14, 79.4], [2.5, 62], [-32, 62], [14, 80]] as const) prop(b, 'gasLamp', x, Y, z);
  // Nordwand der Terrasse: Speicherluken, Schilder, Rampenzeichen
  hoists(b, 'pz', 60, -34, -10, Y, 1, 6, { len: 1.5 });
  hoists(b, 'pz', 60, 4, 16, Y, 1, 6, { len: 1.5 });
  hoists(b, 'pz', 60, -34, -10, Y, 2, 6, { len: 1.5, first: 3, load: 2 });
  plate(b, 'T-SPAWN', -22, Y + 3.0, 60 + F, 'pz', 'HAFENTERRASSE', 3.2);
  plate(b, 'T-RAMPE', -9.7, Y + 2.6, 56, 'px', undefined, 2.4);
  shop(b, 'SPEICHERBODEN', 15.7, Y + 3.7, 65, 'nx', 'WOHNUNGEN · AUFGANG', 4.4);
  plate(b, 'BANANE', -33.7, Y + 2.2, 62.5, 'px', 'NACH B', 2.4);
  edge(b, -10, 59.6, 4, 60, Y);
  edge(b, -34.4, 66, -34, 78, Y);
  lamp(b, 15.6, Y + 4.2, 60.6, 'nx');
  lamp(b, 15.6, Y + 4.2, 70.6, 'nx');
  // Anschlag: Schiffsglocke/Segeltuch-Markise über dem Aufgang
  awning(b, 'nx', 16, 61, 69, Y + 2.4, [0x2f4a6a, 0xe8dcc0]);
}

// ====================================================================== T-Rampe, Untere Mitte, Kistenhof
export function dressLane(b: B): void {
  prop(b, 'container', -7.6, 0, 30, { rot: 1, tint: 0x6a7a3a });
  prop(b, 'palletStack', -9.2, 0, 14, { n: 6, rot: 1 });
  prop(b, 'palletGoods', -9.2, 0, 17, { tint: 0xc9ad7c, rot: 1 });
  prop(b, 'sacks', 2.4, 0, 40, { len: 3.6, n: 3, rot: 1 });
  prop(b, 'crateStack', -2, 0, 22);
  prop(b, 'barrelGroup', -8.8, 0, 42, {});
  prop(b, 'cartons', 3, 0, 14);
  for (const [x, z] of [[-9.4, 52], [3.4, 46.5], [-9.4, 20], [3.4, 10], [-9.4, 36]] as const) prop(b, 'gasLamp', x, z === 52 ? 0.5 : 0, z);
  hoists(b, 'px', -10, 12, 48, 0, 1, 8, { len: 1.5 });
  hoists(b, 'px', -10, 14, 46, 0, 2, 8, { len: 1.5, first: 4, load: 2 });
  hoists(b, 'nx', 4, 8, 22, 0, 1, 7, { len: 1.5 });
  plate(b, 'UNTERE MITTE', -9.7, 3.0, 28, 'px', undefined, 3.4);
  shop(b, 'GEBR. HANSEN', -9.68, 4.4, 42, 'px', 'KAFFEE · TEE · GEWÜRZE', 3.6);
  // Kistenhof: Container, Kisten, Sackpyramide, Handwagen
  prop(b, 'container', 14.4, 0, 31, { rot: 0, tint: 0x8a4a32 });
  prop(b, 'container', 8.4, 0, 43.4, { rot: 0, tint: 0x4a6a8a });
  prop(b, 'crate', 16.2, 0, 41, { h: 1.2 });
  prop(b, 'crate', 16.2, 1.2, 41, { h: 0.9 });
  prop(b, 'sacks', 10, 0, 25, { len: 3.6, n: 4 });
  prop(b, 'palletStack', 16.6, 0, 25.4, { n: 7 });
  prop(b, 'barrel', 12.6, 0, 37);
  prop(b, 'barrel', 13.3, 0, 37.5);
  prop(b, 'handTruck', 11, 0, 34, { rot: 2 });
  prop(b, 'gasLamp', 17, 0, 23.4);
  hoists(b, 'nx', 18, 24, 44, 0, 1, 8, { len: 1.5 });
  hoists(b, 'nz', 46, 6, 16, 0, 1, 6, { len: 1.5 });
  shop(b, 'KISTENHOF', 17.68, 3.2, 38, 'nx', 'ANLIEFERUNG', 3.0);
  awning(b, 'nx', 18, 28, 36, 2.5);
}

// ====================================================================== Mitte, Obere Mitte, Ladehof
export function dressMitte(b: B): void {
  // Zollplatz: Kistenstapel, Sackbarrikade, Handwagen, Laternen
  prop(b, 'crateStack', -13.6, 0, -9);
  prop(b, 'sacks', 3.4, 0, 3.4, { len: 3.6, n: 4, rot: 1 });
  prop(b, 'palletGoods', -12, 0, 2, { tint: 0xc9ad7c });
  prop(b, 'palletGoods', -12, 0, 3.4, { tint: 0xb8996a });
  prop(b, 'barrelGroup', -15, 0, -16, {});
  prop(b, 'crate', 6.4, 0, -15.6, { h: 1.2 });
  prop(b, 'crate', 7.7, 0, -15.6, { h: 1.2 });
  prop(b, 'handTruck', 7, 0, -9.4, { rot: 1 });
  // Zollwaage (Gebäude in der Mitte): Luken, Schilder, Markise
  hoists(b, 'pz', 2, -8, 4, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nz', -12, -8, 4, 0, 1, 6, { len: 1.5, first: 1, load: 1 });
  shop(b, 'ZOLLWAAGE', -2, 3.6, -2 + F, 'pz', 'HAFENAMT · WIEGEN & VERZOLLEN', 4.6);
  plate(b, 'MITTE', -2, 3.2, -12 - F, 'nz', undefined, 2.4);
  awning(b, 'nz', -12, -6, 2, 2.6, [0x2f4a6a, 0xe8dcc0]);
  prop(b, 'gasLamp', -9, 0, -3);
  prop(b, 'gasLamp', 5.4, 0, -13);
  prop(b, 'cartons', -16, 0, 6);
  prop(b, 'palletStack', 8.8, 0, 6.6, { n: 6 });
  for (const [x, z] of [[-14.5, -17.5], [6.5, -17.5], [-14.5, 5], [7, 6]] as const) prop(b, 'gasLamp', x, 0, z);
  hoists(b, 'px', -18, -18, 6, 0, 1, 6, { len: 1.5 });
  hoists(b, 'px', -18, -16, 4, 0, 2, 6, { len: 1.5, first: 3, load: 2 });
  hoists(b, 'nz', 8, -18, -10, 0, 1, 5, { len: 1.5 });
  shop(b, 'KAFFEE-RÖSTEREI', -17.68, 4.6, -6, 'px', 'SEIT 1887 · HAFENSTR.', 4.8);
  awning(b, 'px', -18, -10, -2, 3.4, [0x7a2a22, 0xe8dcc0]);
  plate(b, 'MITTE', -17.7, 3.0, 5, 'px', undefined, 2.4);
  plate(b, 'MITTE', 9.7, 3.0, -19, 'nx', undefined, 2.4);
  // Obere Mitte: Fleet-Brücke, Kähne, Laternen, Deckung
  for (const [x, z] of [[-5.4, -47.4], [5.4, -47.4], [-5.4, -38.6], [5.4, -38.6]] as const) prop(b, 'gasLamp', x, 0, z);
  barge(b, 18, -1.0, -43, 11, 3.4, { cabin: true, cargo: true });
  barge(b, -22, -1.0, -43, 9, 3.2, { cargo: true, hull: 0x3a2c28 });
  for (const x of [-7, 7]) for (let z = -45.6; z < -40; z += 1.9) bollard(b, x, 1.2, z);
  prop(b, 'container', 4.2, 0, -29, { rot: 1, tint: 0x4a6a4a });
  prop(b, 'container', -4.2, 0, -54, { rot: 1, tint: 0x9a4a32 });
  prop(b, 'sacks', 4.6, 0, -23.4, { len: 2.7, n: 3, rot: 1 });
  prop(b, 'palletStack', 5.2, 0, -52, { n: 6, rot: 1 });
  prop(b, 'palletGoods', -5, 0, -33, { tint: 0xc9ad7c, rot: 1 });
  prop(b, 'palletGoods', -5, 0, -23, { tint: 0xd2b88a, rot: 1 });
  prop(b, 'crate', 4.8, 0, -35.8, { h: 1.2 });
  hoists(b, 'px', -6, -58, -46, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', 6, -58, -46, 0, 1, 6, { len: 1.5, first: 3 });
  hoists(b, 'nx', 6, -38, -20, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', 6, -57, -49, 0, 2, 6, { len: 1.5, load: 1 });
  plate(b, 'OBERE MITTE', -5.7, 3.0, -55, 'px', undefined, 3.4);
  plate(b, 'FLEETBRÜCKE', 5.7, 2.6, -37, 'nx', 'NACH CT', 3.4);
  lamp(b, -5.6, 4.2, -49, 'px');
  lamp(b, 5.6, 4.2, -29, 'nx');
  // Ladehof (Nische): Hochregale, Stapler, Kisten
  prop(b, 'rack', -11, 0, -35.1, { len: 5.4, h: 6, seed: 3 });
  prop(b, 'forklift', -9, 0, -29.6, { rot: 2, tint: 0xd08a20 });
  prop(b, 'palletGoods', -14.2, 0, -28, { tint: 0xb8996a });
  prop(b, 'palletGoods', -14.2, 0, -29.3, { tint: 0xc9ad7c });
  prop(b, 'crate', -14.6, 0, -33, { h: 1.2 });
  prop(b, 'gasLamp', -15.4, 0, -26.8);
  shop(b, 'LADEHOF', -15.68, 3.0, -31, 'px', 'NUR ANLIEFERUNG', 2.8);
  // Brückengasse: schmale Verbindung zum Hof B, Sackbarrikade und Laternen
  prop(b, 'sacks', -26, 0, -34.4, { len: 3.6, n: 3 });
  prop(b, 'palletStack', -20.5, 0, -29.2, { n: 5 });
  prop(b, 'crate', -31.5, 0, -29.2, { h: 1.2 });
  prop(b, 'barrelGroup', -34.6, 0, -34.6, {});
  prop(b, 'gasLamp', -24, 0, -28.6);
  prop(b, 'gasLamp', -34.6, 0, -29);
  hoists(b, 'pz', -36, -34, -18, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nz', -28, -34, -18, 0, 1, 6, { len: 1.5, first: 2 });
  hoists(b, 'nz', -28, -33, -19, 0, 2, 6, { len: 1.5, first: 1, load: 1 });
  plate(b, 'BRÜCKENGASSE', -26, 3.0, -28 - F, 'nz', 'ZUM HOF B', 3.6);
}

// ====================================================================== Zweite Mitte (Gasse unter der Speicherbrücke)
export function dressAlley(b: B): void {
  prop(b, 'sacks', 20.6, 0, -2.2, { len: 3.6, n: 3 });
  prop(b, 'crateStack', 52.8, 0, 2.4);
  prop(b, 'barrelGroup', 14.6, 0, 2.2, {});
  prop(b, 'palletStack', 30, 0, -2.9, { n: 6 });
  prop(b, 'palletGoods', 56.5, 0, -2.8, { tint: 0xc9ad7c });
  prop(b, 'handTruck', 28, 0, 2.6, { rot: 2 });
  prop(b, 'gasLamp', 31, 0, 3.3);
  prop(b, 'gasLamp', 49.5, 0, -3.3);
  prop(b, 'gasLamp', 14, 0, -3.3);
  b.hallLamp(40, 3.6, 0, { color: 0xffbf78, intensity: 1.0, range: 12 });
  hoists(b, 'pz', -4, 28, 58, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nz', 4, 20, 36, 0, 1, 6, { len: 1.5, first: 2 });
  hoists(b, 'nz', 4, 44, 58, 0, 1, 6, { len: 1.5, first: 2, load: 1 });
  hoists(b, 'nz', 4, 20, 36, 0, 2, 6, { len: 1.5, first: 5, load: 2 });
  plate(b, 'ZWEITE MITTE', 24, 3.0, 4 - F, 'nz', undefined, 3.4);
  shop(b, 'SPEICHERBRÜCKE', 40, 8.6, 4 - F, 'nz', 'NUR FÜR BEFUGTE', 3.8);
}

// ====================================================================== Kurz
export function dressKurz(b: B): void {
  prop(b, 'container', 23.8, 0, -14, { rot: 1, tint: 0x7a4a2a });
  prop(b, 'sacks', 16.4, 0, -22, { len: 3.6, n: 3, rot: 1 });
  prop(b, 'crateStack', 20.6, 0, -29);
  prop(b, 'palletStack', 24.4, 0, -25, { n: 5, rot: 1 });
  prop(b, 'barrelGroup', 15.4, 0, -8.6, {});
  prop(b, 'gasLamp', 15, 0, -31);
  prop(b, 'gasLamp', 25, 0, -6);
  hoists(b, 'nx', 26, -34, -4, 0, 1, 6, { len: 1.5 });
  hoists(b, 'px', 14, -34, -20, 0, 1, 6, { len: 1.5, first: 1 });
  hoists(b, 'nx', 26, -32, -6, 0, 2, 6, { len: 1.5, first: 3, load: 2 });
  plate(b, 'KURZ', 25.7, 3.0, -22, 'nx', 'ZUM KESSEL', 2.6);
  plate(b, 'KURZ', 14.3, 3.0, -30, 'px', undefined, 2.4);
  edge(b, 14, -34.4, 26, -34, 0);
}
