import { prop } from '../../logic/mapprops';
import { F, awning, edge, hoists, ladder, lamp, line, plate, shop, type B } from './helpers';

// ====================================================================== Hof B: Brunnen, Serverschränke, Neue Kiste
export function dressSiteB(b: B): void {
  // Alter Brunnen mit Laternen
  prop(b, 'fountain', -55, 0, -42, { len: 4.4 });
  prop(b, 'gasLamp', -58.4, 0, -45.4);
  prop(b, 'gasLamp', -51.6, 0, -38.6);
  // Serverschränke (IT-Provisorium) nahe am Eingang: zwei Reihen gegenüber, USV, Klimagerät, Plane
  prop(b, 'serverRow', -68.4, 0, -32.6, { rot: 3, n: 4 });
  prop(b, 'serverRow', -62.8, 0, -32.6, { rot: 1, n: 4 });
  prop(b, 'ups', -68.4, 0, -29.4);
  prop(b, 'cooler', -62.8, 0, -29.2);
  b.decal({ kind: 'letter', pos: [-65.6, 0.02, -32.6], size: [5.6, 5.6], text: 'B', color: 0xffffff });
  b.sign('SERVERSCHRANK B', [-65.6, 3.2, -36.4], 'pz', 4.4, 1.0, { color: 0xff5a4a, sub: 'IT-PROVISORIUM · BITTE TROCKEN LAGERN' });
  for (const dx of [-1.9, 1.9]) b.box([-65.6 + dx - 0.03, 0, -36.5], [-65.6 + dx + 0.03, 3.1, -36.4], 'metal', { collide: 'none', tint: 0x4a3a2a, noNav: true, occlude: false });
  b.box([-71.1, 0, -37.2], [-60.1, 0.02, -28.4], 'black', { collide: 'none', noNav: true, occlude: false, tint: 0x2a2a2a });
  // Plane über Kisten (Wetterschutz), mit Seilen
  prop(b, 'crate', -46.2, 0, -50.6, { h: 1.2 });
  prop(b, 'crate', -47.6, 0, -50.6, { h: 1.2 });
  prop(b, 'palletGoods', -46.9, 0, -49.0, { tint: 0xc9ad7c, h: 1.0 });
  b.box([-48.5, 1.2, -51.4], [-45.3, 1.5, -48.4], 'wrap', { collide: 'none', tint: 0x3a6a96, noNav: true, occlude: false });
  b.box([-48.5, 0.9, -51.4], [-48.2, 1.5, -48.4], 'wrap', { collide: 'none', tint: 0x3a6a96, noNav: true, occlude: false });
  // Neue Kiste (große Kiste + kleine obendrauf)
  prop(b, 'crate', -41.6, 0, -33.4, { h: 2.4 });
  prop(b, 'crate', -41.6, 2.4, -33.4, { h: 1.2 });
  prop(b, 'crate', -43.6, 0, -35.6, { h: 1.2 });
  // Deckung im Hof
  prop(b, 'sacks', -72.4, 0, -46, { len: 3.6, n: 3, rot: 1 });
  prop(b, 'palletStack', -72.6, 0, -50.4, { n: 6 });
  prop(b, 'barrelGroup', -58, 0, -50.6, {});
  prop(b, 'palletGoods', -70, 0, -29.8, { tint: 0xd2b88a });
  prop(b, 'crateStack', -48, 0, -31);
  prop(b, 'handTruck', -58, 0, -31, { rot: 2 });
  prop(b, 'logs', -73, 0, -41, { len: 3.2, n: 2, rot: 1 });
  prop(b, 'gasLamp', -45, 0, -52.4);
  prop(b, 'gasLamp', -74, 0, -52.4);
  prop(b, 'gasLamp', -37.6, 0, -30);

  // Verladerampe (Dock, +1.6 m): Tore, Ware, Treppe zum Hof
  const Y = 1.6;
  prop(b, 'rollerDoor', -76, Y, -62 + F * 0.5, { rot: 0, len: 3.4, h: 3.6, tint: 0x7a4a32 });
  prop(b, 'rollerDoor', -69, Y, -62 + F * 0.5, { rot: 0, len: 3.4, h: 3.6, tint: 0x3c5a48 });
  prop(b, 'rollerDoor', -62, Y, -62 + F * 0.5, { rot: 0, len: 3.4, h: 3.6, tint: 0x7a4a32 });
  hoists(b, 'pz', -62, -80, -64, Y, 2, 6, { len: 1.5, load: 1 });
  hoists(b, 'pz', -62, -80, -60, Y, 3, 6, { len: 1.5, first: 3, load: 2 });
  prop(b, 'sacks', -72.4, Y, -59.8, { len: 3.6, n: 3 });
  prop(b, 'palletGoods', -65.4, Y, -59.4, { tint: 0xc9ad7c });
  prop(b, 'palletGoods', -65.4, Y, -58.2, { tint: 0xb8996a });
  prop(b, 'handTruck', -58, Y, -59.4, { rot: 0 });
  prop(b, 'crate', -78.6, Y, -57, { h: 1.2 });
  prop(b, 'palletStack', -78.8, Y, -59.4, { n: 5 });
  b.stairs(-70, -54, -66, -48, 0, Y, 'nz', 'wood', { tint: 0xa88a6a });
  edge(b, -80, -54.4, -70, -54, Y);
  edge(b, -66, -54.4, -46, -54, Y);
  for (const [x, z] of [[-79, -54.6], [-47, -54.6]] as const) prop(b, 'gasLamp', x, Y, z);
  shop(b, 'VERLADERAMPE', -69, Y + 4.3, -62 + F, 'pz', 'ANNAHME 6–18 UHR', 4.2);
  awning(b, 'pz', -62, -78, -60, Y + 3.5, [0x7a2a22, 0xe8dcc0]);

  // Büro auf dem Dock
  prop(b, 'desk', -53, Y, -70.4, { rot: 2 });
  prop(b, 'desk', -56, Y, -66.2, { rot: 0 });
  prop(b, 'archive', -50, Y, -71.4, { len: 2.4, rot: 2 });
  prop(b, 'locker', -57.2, Y, -69);
  b.hallLamp(-53, Y + 3.7, -68, { color: 0xffd9a0, intensity: 0.9, range: 9 });
  shop(b, 'BÜRO', -52, Y + 3.2, -62 + F, 'pz', 'HAFENVERWALTUNG', 2.4);

  // Dunkel: dunkler Lagerraum, ein einsames Licht
  prop(b, 'shelf', -84.9, 0, -44, { len: 2.4, rot: 1 });
  prop(b, 'shelf', -84.9, 0, -40, { len: 2.4, rot: 1 });
  prop(b, 'crate', -81, 0, -46.4, { h: 1.2 });
  prop(b, 'barrel', -80.6, 0, -33.2);
  prop(b, 'barrel', -81.5, 0, -33.6);
  prop(b, 'sacks', -82, 0, -36, { len: 1.8, n: 2, rot: 1 });
  b.hallLamp(-82, 3.4, -40, { color: 0xffa860, intensity: 0.45, range: 7 });
  plate(b, 'DUNKEL', -75.7, 3.4, -45, 'px', 'LAGER · KEIN LICHT', 3.2);

  // Hofwände: Luken, Schilder, Laternen
  hoists(b, 'px', -76, -54, -48, 0, 1, 6, { len: 1.5 });
  hoists(b, 'px', -76, -32, -28, 0, 1, 6, { len: 1.5 });
  hoists(b, 'pz', -28, -62, -38, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', -36, -42, -28, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', -36, -42, -28, 0, 2, 6, { len: 1.5, load: 1 });
  hoists(b, 'pz', -28, -62, -38, 0, 2, 6, { len: 1.5, first: 3, load: 2 });
  plate(b, 'B', -36.7, 3.0, -38, 'nx', 'SERVERSCHRANK', 2.4);
  plate(b, 'BRUNNEN', -75.7, 3.0, -52, 'px', undefined, 2.6);
  plate(b, 'NEUE KISTE', -36.7, 2.2, -31.4, 'nx', undefined, 3.0);
  ladder(b, 'px', -76, -30, 0, 3.6);
  lamp(b, -75.6, 4.2, -50, 'px');
  lamp(b, -36.6, 4.2, -30, 'nx');
  line(b, 'palletGoods', -58, 0, -28.6, -46, 0, -28.6, 3, { tint: 0xc9ad7c });
}

// ====================================================================== Baustelle (CT-Seite) und CT-Passage
export function dressBaustelle(b: B): void {
  const Y = 1.6;
  prop(b, 'scaffold', -35.2, Y, -64, { len: 12, h: 8, rot: 1 });
  prop(b, 'scaffold', -35.2, Y, -78, { len: 6, h: 6, rot: 1 });
  prop(b, 'palletGoods', -44.4, Y, -78, { tint: 0xa04a30 });
  prop(b, 'palletGoods', -44.4, Y, -76.7, { tint: 0xa04a30 });
  prop(b, 'palletGoods', -44.4, Y, -75.4, { tint: 0xb85a3a });
  prop(b, 'generator', -43.4, Y, -68, { rot: 1 });
  prop(b, 'barrelGroup', -44.6, Y, -60.6, {});
  prop(b, 'cones', -40, Y, -57, { rot: 0 });
  prop(b, 'fence', -40, Y, -80.4, { len: 4, rot: 0 });
  prop(b, 'fence', -40, Y, -56.2, { len: 4, rot: 0 });
  prop(b, 'sacks', -38.4, Y, -72.6, { len: 2.7, n: 3, rot: 1 });
  prop(b, 'crate', -43.8, Y, -63, { h: 1.2 });
  prop(b, 'gasLamp', -45, Y, -82.6);
  prop(b, 'gasLamp', -45, Y, -56.4);
  shop(b, 'BAUSTELLE', -45.68, Y + 3.2, -70, 'px', 'ZUTRITT NUR MIT HELM', 3.6, 0xffd040, 0x1a1a1a);
  plate(b, 'BAUSTELLE', -34.3, Y + 2.0, -57, 'nx', undefined, 3.0);
  hoists(b, 'px', -46, -82, -64, Y, 2, 6, { len: 1.5, load: 1 });
  edge(b, -46, -54.4, -36, -54, Y);
  b.sign('BAUSTELLE', [-40, Y + 2.8, -56.6], 'pz', 3.4, 0.9, { color: 0xffd040, bg: 0x1a1a1a, sub: 'ACHTUNG · RAMPE ZUM HOF B' });

  // CT-Passage
  prop(b, 'sacks', -28, Y, -83, { len: 3.6, n: 3 });
  prop(b, 'palletStack', -21, Y, -75.2, { n: 5 });
  prop(b, 'barrelGroup', -31, Y, -75.4, {});
  prop(b, 'gasLamp', -33, Y, -83.2);
  prop(b, 'gasLamp', -17.6, Y, -75.2);
  hoists(b, 'pz', -84, -34, -16, Y, 1, 6, { len: 1.5 });
  hoists(b, 'nz', -74, -34, -16, Y, 1, 6, { len: 1.5, first: 2 });
  plate(b, 'CT-PASSAGE', -26, Y + 3.0, -74 - F, 'nz', 'ZUR BAUSTELLE', 3.4);
}
