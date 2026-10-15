import { prop } from '../../logic/mapprops';
import { F, awning, edge, hoists, ladder, lamp, line, plate, shop, type B } from './helpers';

// ====================================================================== A-Hof (Kranhof, +1.6 m)
export function dressSiteA(b: B): void {
  const Y = 1.6;
  // Serverschränke der IT: zwei Reihen gegenüber, USV, Klimagerät; Container und Plane daneben
  // Nordreihe 6 m nach Norden versetzt: der Planter steht nicht mehr im Schutz zweier Reihen, die CT sehen ihn (Balance, Plant-Rate der T)
  prop(b, 'serverRow', 45.5, Y, -64.5, { rot: 0, n: 4 });
  prop(b, 'serverRow', 45.5, Y, -51.5, { rot: 2, n: 4 });
  b.light({ kind: 'lamp', pos: [45.5, Y + 3.4, -55], color: 0xcfe4ff, intensity: 1.3, range: 10 });
  prop(b, 'ups', 42.4, Y, -55);
  prop(b, 'cooler', 48.8, Y, -55);
  b.decal({ kind: 'letter', pos: [45.5, Y + 0.02, -55], size: [5.6, 5.6], text: 'A', color: 0xffffff });
  prop(b, 'container', 39, Y, -66.4, { rot: 1, tint: 0x3a5a7a });
  prop(b, 'crate', 40, Y, -57.4, { h: 1.2 });
  prop(b, 'crate', 41.4, Y, -57.4, { h: 1.2 });
  prop(b, 'palletGoods', 40.7, Y, -55.7, { tint: 0xc9ad7c, h: 1.0 });
  b.box([38.6, Y + 1.2, -58.2], [42.2, Y + 1.5, -54.8], 'wrap', { collide: 'none', tint: 0x3a6a96, noNav: true, occlude: false });
  b.box([38.6, Y + 0.9, -58.2], [38.9, Y + 1.5, -54.8], 'wrap', { collide: 'none', tint: 0x3a6a96, noNav: true, occlude: false });
  // Schild auf zwei Pfosten
  for (const dx of [-2.2, 2.2]) b.box([46 + dx - 0.04, Y, -67.5], [46 + dx + 0.04, Y + 3.4, -67.4], 'metal', { collide: 'none', tint: 0x4a3a2a, noNav: true, occlude: false });
  b.sign('SERVERSCHRANK A', [46, Y + 3.0, -67.35], 'pz', 4.8, 1.0, { color: 0xff5a4a, sub: 'IT-UMZUG · NICHT STAPELN · KRAN BEACHTEN' });
  b.sign('SERVERSCHRANK A', [46, Y + 3.0, -67.55], 'nz', 4.8, 1.0, { color: 0xff5a4a, sub: 'IT-UMZUG · NICHT STAPELN · KRAN BEACHTEN' });
  // Rostiger Kran über dem Hof (Ausleger nach Westen)
  prop(b, 'crane', 66.4, Y, -56, { rot: 2, h: 11, len: 10 });
  // Friedhof (NO-Ecke): ausrangierte Paletten, Kisten, Stapler, Fässer
  prop(b, 'palletStack', 69.6, Y, -80, { n: 8 });
  prop(b, 'palletStack', 69.6, Y, -77.4, { n: 5 });
  prop(b, 'palletStack', 66.4, Y, -79.6, { n: 3, rot: 1 });
  prop(b, 'crate', 62.4, Y, -80.4, { h: 1.4 });
  prop(b, 'crate', 62.4, Y + 1.4, -80.4, { h: 1.0 });
  prop(b, 'forklift', 64.4, Y, -72.4, { rot: 3, tint: 0x8a6a2a });
  prop(b, 'barrelGroup', 69.4, Y, -70, {});
  prop(b, 'crateStack', 60.2, Y, -73.6);
  prop(b, 'drum', 70, Y, -64.4, { rot: 0 });
  prop(b, 'gitterbox', 59, Y, -80.2, { n: 2 });
  // Deckung im Hof
  prop(b, 'sacks', 52.6, Y, -75, { len: 3.6, n: 3 });
  prop(b, 'palletGoods', 56.4, Y, -63.4, { tint: 0xc9ad7c });
  prop(b, 'palletGoods', 56.4, Y, -62.0, { tint: 0xb8996a });
  prop(b, 'palletStack', 36.2, Y, -78, { n: 6 });
  prop(b, 'cartons', 36.8, Y, -73);
  prop(b, 'logs', 57, Y, -50.4, { len: 3.2, n: 2 });
  prop(b, 'palletGoods', 43, Y, -44, { tint: 0xd2b88a });
  prop(b, 'crate', 47.4, Y, -47.4, { h: 1.2 });
  for (const [x, z] of [[36, -82], [70, -82], [36, -52.6], [70, -54]] as const) prop(b, 'gasLamp', x, Y, z);
  prop(b, 'gasLamp', 52, Y, -69);
  // Wände: Luken, Schilder, Markise
  hoists(b, 'pz', -84, 36, 72, Y, 1, 7, { len: 1.5 });
  hoists(b, 'pz', -84, 38, 70, Y, 2, 7, { len: 1.5, first: 3, load: 2 });
  hoists(b, 'nx', 72, -82, -54, Y, 1, 7, { len: 1.5 });
  hoists(b, 'nx', 72, -80, -56, Y, 2, 7, { len: 1.5, first: 3, load: 1 });
  hoists(b, 'pz', -38, 36, 46, Y, 1, 6, { len: 1.5 });
  plate(b, 'A-HOF', 36, Y + 3.2, -84 + F, 'pz', 'KRANHOF', 3.0);
  plate(b, 'FRIEDHOF', 71.7, Y + 2.6, -72, 'nx', 'ALTE PALETTEN', 3.0);
  lamp(b, 71.6, Y + 4.2, -62, 'nx');
  lamp(b, 36.4, Y + 4.2, -83.6, 'pz');
  awning(b, 'pz', -84, 56, 64, Y + 3.3, [0x2f5a3a, 0xe8dcc0]);
  // Südkante: Balkon und Kessel-Tor, Hofseite der Balkontreppe
  plate(b, 'BALKON', 42, Y + 3.2, -37.7, 'nz', 'ZU DEN WOHNUNGEN', 3.4);
  plate(b, 'KESSEL', 35.7, Y + 1.6, -47, 'px', 'ZU KURZ', 2.4);
  edge(b, 34.2, -52, 34.6, -42, Y);
}

// ====================================================================== Grube (SO-Ecke, 0 m) und Lange Halle (überdacht)
export function dressPit(b: B): void {
  prop(b, 'crateStack', 63, 0, -45.6);
  prop(b, 'sacks', 69, 0, -49.8, { len: 3.6, n: 3 });
  prop(b, 'sacks', 66.2, 0, -39.6, { len: 2.7, n: 2 });
  prop(b, 'barrelGroup', 70.6, 0, -43.4, {});
  prop(b, 'palletGoods', 57.6, 0, -49.4, { tint: 0xc9ad7c });
  prop(b, 'gasLamp', 57.4, 0, -39);
  plate(b, 'GRUBE', 71.7, 2.2, -44, 'nx', undefined, 2.4);
  plate(b, 'GRUBE', 56.3, 2.0, -50, 'px', undefined, 2.0);
  edge(b, 48, -52.4, 56, -52, 0);
  hoists(b, 'px', 56, -52, -50, 0, 1, 4, { len: 1.5 });
}

export function dressLongHall(b: B): void {
  // Lange Halle: Stützenreihe, Regale an der Westwand, Stapler, Ware, Hängeleuchten
  for (let z = -32; z <= 0; z += 8) {
    b.box([68.2, 0, z - 0.3], [68.8, 9, z + 0.3], 'wood', { tint: 0x5a3e26, tag: 'pillar' });
    b.hallLamp(67, 8.2, z + 4, { color: 0xffc080, intensity: 1.1, range: 14 });
  }
  for (const z of [-34, -28.4, -22.8, -17.2]) prop(b, 'rack', 62.9, 0, z, { rot: 1, len: 5.4, h: 6.2, seed: 11 + z });
  prop(b, 'forklift', 70.4, 0, -12, { rot: 0, tint: 0xc08a20 });
  prop(b, 'palletGoods', 70.4, 0, -22, { tint: 0xd2b88a, h: 1.4 });
  prop(b, 'palletGoods', 70.4, 0, -20.6, { tint: 0xc9ad7c, h: 1.4 });
  prop(b, 'crateStack', 65.8, 0, -4.4);
  prop(b, 'sacks', 70.4, 0, -29, { len: 3.6, n: 3, rot: 1 });
  prop(b, 'palletStack', 70.8, 0, -6.6, { n: 6, rot: 1 });
  prop(b, 'sacks', 65.4, 0, 1.6, { len: 2.7, n: 2 });
  prop(b, 'cartons', 66, 0, -10.6);
  hoists(b, 'nx', 72, -36, -6, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', 72, -34, -8, 0, 2, 6, { len: 1.5, first: 3, load: 2 });
  plate(b, 'LANGE HALLE', 71.7, 2.8, -2, 'nx', 'SPEICHER 9', 3.6);
  plate(b, 'LANGE HALLE', 62.3, 2.8, -2, 'px', undefined, 3.6);
  shop(b, 'LANGE HALLE', 67, 8.2, 3.7, 'nz', 'GROSSE LAGERHALLE', 4.4);
  lamp(b, 71.6, 4.2, -14, 'nx');
  lamp(b, 71.6, 4.2, 0, 'nx');
  // Schienen im Hallenboden (Loren)
  b.box([64.4, 0, -37], [64.6, 0.04, 3], 'steel', { collide: 'none', tint: 0x4a4a4a, noNav: true, occlude: false });
  b.box([65.8, 0, -37], [66.0, 0.04, 3], 'steel', { collide: 'none', tint: 0x4a4a4a, noNav: true, occlude: false });
}

// ====================================================================== Bogen (CT → A), Bibliothek, Kessel (Kurz → A)
export function dressBogen(b: B): void {
  const Y = 1.6;
  // Rundbogen-Tor im Mittelgang
  prop(b, 'archGate', 26, Y, -79, { rot: 1, len: 6, h: 4.4, n: 2, tint: 0xc4a08c });
  for (const x of [19, 31]) b.hallLamp(x, Y + 3.6, -79, { color: 0xffbf78, intensity: 1.1, range: 11 });
  prop(b, 'sacks', 19.2, Y, -83, { len: 1.8, n: 2, rot: 1 });
  prop(b, 'barrelGroup', 32.2, Y, -75.4, {});
  prop(b, 'crate', 18.6, Y, -75.2, { h: 1.2 });
  prop(b, 'gasLamp', 22, Y, -83.4);
  shop(b, 'BOGEN', 26, Y + 4.6, -79.5, 'px', 'ZUM KRANHOF', 3.0);
  shop(b, 'BOGEN', 26, Y + 4.6, -78.5, 'nx', 'ZUM KRANHOF', 3.0);
  plate(b, 'BOGEN', 16.3, Y + 2.4, -83, 'px', undefined, 2.2);
}

export function dressLibrary(b: B): void {
  const Y = 1.6;
  // Archiv: Regale an der Westwand und als Inseln, Lesetisch, Leseleuchten
  line(b, 'archive', 18.7, Y, -68.2, 18.7, Y, -55.6, 5, { rot: 1, len: 2.4 });
  line(b, 'archive', 28.5, Y, -66, 31.2, Y, -66, 2, { rot: 0, len: 2.4 });
  line(b, 'archive', 21, Y, -55.0, 28, Y, -55.0, 3, { rot: 2, len: 2.4 });
  prop(b, 'desk', 24.6, Y, -61.8, { rot: 0 });
  prop(b, 'desk', 27.2, Y, -62.0, { rot: 0 });
  prop(b, 'cartons', 29.8, Y, -57.6);
  b.hallLamp(22, Y + 3.0, -62, { color: 0xffe0a0, intensity: 1.0, range: 9 });
  b.hallLamp(28, Y + 3.0, -64, { color: 0xffe0a0, intensity: 0.9, range: 9 });
  b.light({ kind: 'lamp', pos: [25, Y + 1.6, -61.8], color: 0x9ae0a0, intensity: 0.5, range: 5 });
  plate(b, 'BIBLIOTHEK', 18.3, Y + 2.6, -60, 'px', undefined, 3.0);
  shop(b, 'ARCHIV', 31.65, Y + 2.9, -59, 'nx', 'AKTEN · FRACHTBRIEFE', 3.0);
  shop(b, 'BIBLIOTHEK', 36.6, Y + 3.6, -59.4, 'px', 'ARCHIV · ZUTRITT FREI', 3.8);
}

export function dressKessel(b: B): void {
  const Y = 1.6;
  // Kesselhaus: liegender Dampfkessel auf Ziegelsockel, Schornstein, Rohre, Kohlenbunker
  b.box([14.6, Y, -52], [22, Y + 0.7, -47.6], 'brick', { tint: 0x8a6a58, top: 'roof' });
  b.decor('pipeX', [18.3, Y + 1.9, -49.8], 0, [6.6, 8, 8], 0xa86a4c);
  for (const x of [15.6, 18.3, 21.0]) b.decor('pipeX', [x, Y + 1.9, -49.8], 0, [0.12, 8.6, 8.6], 0x6a6a6a);
  b.decor('pipeY', [20.2, Y + 2.9, -49.8], 0, [3.0, 7.0, 3.0], 0x8a7a70);
  b.decor('pipeY', [15.6, Y + 2.5, -49.8], 0, [1.2, 3.2, 1.2], 0x8a8a8a);
  b.box([14.6, Y + 0.7, -51.6], [22, Y + 3.4, -47.8], 'metal', { visible: false, occlude: false, noNav: true });
  b.box([14.4, Y, -52], [22.2, Y + 3.5, -47.4], 'brick', { visible: false, collide: 'all', occlude: false, noNav: true });
  b.decor('pipeX', [24, Y + 5.2, -51.2], 0, [11, 1.6, 1.6], 0xc8c8c8);
  b.decor('pipeX', [24, Y + 5.6, -50.6], 0, [11, 1.0, 1.0], 0xb04030);
  b.decor('pipeZ', [29.6, Y + 5.0, -46.4], 0, [1.2, 1.2, 9], 0xc8c8c8);
  prop(b, 'barrelGroup', 32.4, Y, -50.4, {});
  b.box([26.4, Y, -52], [29.6, Y + 1.3, -50.2], 'concreteDark', { tint: 0x2a2a2a, top: 'black' });
  prop(b, 'crate', 15.4, Y, -45.6, { h: 1.2 });
  prop(b, 'gasLamp', 32.5, Y, -43.6);
  for (const x of [20, 29]) b.hallLamp(x, Y + 4.9, -46, { color: 0xffb070, intensity: 1.2, range: 13 });
  b.light({ kind: 'lamp', pos: [18, Y + 3.6, -46.2], color: 0xff9a50, intensity: 1.2, range: 9 });
  b.light({ kind: 'lamp', pos: [18, Y + 1.0, -46.4], color: 0xff7a30, intensity: 0.8, range: 6 });
  plate(b, 'KESSEL', 14.3, Y + 3.0, -44, 'px', 'KESSELHAUS', 2.6);
  shop(b, 'KESSELHAUS', 24, Y + 4.8, -52 + F, 'pz', 'DAMPF · NICHT BERÜHREN', 4.0, 0xffd040, 0x1a1a1a);
  edge(b, 14, -42.4, 26, -42, Y);
  ladder(b, 'nz', -42, 31, Y, 3.0);
}
