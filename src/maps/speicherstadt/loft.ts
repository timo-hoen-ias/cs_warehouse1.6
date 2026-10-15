import { prop } from '../../logic/mapprops';
import { F, edge, hoists, lamp, line, plate, shop, type B } from './helpers';

// ====================================================================== Wohnungen: Speicherboden (+4.4 m), Treppenhaus, Balkon
export function dressLoft(b: B): void {
  const Y = 4.4;
  // Eingang und Treppenhaus
  prop(b, 'sacks', 28.4, 1.6, 68.4, { len: 1.8, n: 2, rot: 1 });
  prop(b, 'crate', 21.2, 1.6, 68.6, { h: 1.2 });
  prop(b, 'barrelGroup', 28.6, 1.6, 58.4, {});
  b.hallLamp(25, 1.6 + 4.9, 63, { color: 0xffbf78, intensity: 1.1, range: 12 });
  b.hallLamp(24, 1.6 + 5.4, 50, { color: 0xffbf78, intensity: 1.0, range: 11 });
  plate(b, 'WOHNUNGEN', 20.3, 1.6 + 2.6, 62, 'px', 'SPEICHERBODEN · 2. OG', 3.2);
  b.rail(28.05, 44, 28.05, 56, 3.0, 1.05, 0x6a4a2e);

  // Südhalle: Stützen, Sackhaufen, Ware, Hängeleuchten
  const cols: [number, number][] = [[32, 12], [44, 12], [32, 20], [44, 20], [32, 32], [44, 32], [32, 40], [44, 40], [26, 12], [50, 12]];
  for (const [x, z] of cols) b.box([x - 0.3, Y, z - 0.3], [x + 0.3, 9.6, z + 0.3], 'wood', { tint: 0x5a3e26, tag: 'pillar' });
  for (const [x, z] of [[30, 16], [46, 16], [30, 36], [46, 36], [38, 28], [38, 10]] as const) b.hallLamp(x, 8.7, z, { color: 0xffbf78, intensity: 1.15, range: 15 });
  prop(b, 'sacks', 38, Y, 18, { len: 3.6, n: 4 });
  prop(b, 'sacks', 52.6, Y, 34, { len: 3.6, n: 3, rot: 1 });
  prop(b, 'sacks', 22.8, Y, 14, { len: 2.7, n: 3, rot: 1 });
  prop(b, 'crateStack', 38, Y, 38);
  prop(b, 'crateStack', 52, Y, 14);
  prop(b, 'palletGoods', 22.8, Y, 36, { tint: 0xc9ad7c, rot: 1 });
  prop(b, 'palletGoods', 22.8, Y, 37.4, { tint: 0xb8996a, rot: 1 });
  prop(b, 'barrelGroup', 54.6, Y, 24.8, {});
  prop(b, 'barrelGroup', 22.8, Y, 9, {});
  prop(b, 'palletStack', 54.8, Y, 42, { n: 5 });
  prop(b, 'desk', 36, Y, 41.6, { rot: 2 });
  prop(b, 'cartons', 40, Y, 30);
  line(b, 'rack', 33, Y, 7.2, 51, Y, 7.2, 2, { len: 5.4, h: 4.4, seed: 5 });
  edge(b, 20, 43.6, 28, 44, Y);

  // Speicherbrücke und Nordhalle
  b.hallLamp(40, 7.0, 4, { color: 0xffbf78, intensity: 1.0, range: 11 });
  b.hallLamp(40, 7.0, -4, { color: 0xffbf78, intensity: 1.0, range: 11 });
  prop(b, 'sacks', 54.4, Y, -13, { len: 3.6, n: 3, rot: 1 });
  prop(b, 'sacks', 32.4, Y, -22, { len: 3.6, n: 3, rot: 1 });
  prop(b, 'crateStack', 48, Y, -22);
  prop(b, 'crateStack', 35, Y, -12);
  prop(b, 'palletGoods', 54.6, Y, -24, { tint: 0xd2b88a, rot: 1 });
  prop(b, 'barrelGroup', 32.6, Y, -9.8, {});
  prop(b, 'palletStack', 54.6, Y, -9, { n: 5 });
  for (const [x, z] of [[36, -14], [50, -14], [36, -22], [50, -22]] as const) b.box([x - 0.3, Y, z - 0.3], [x + 0.3, 9.6, z + 0.3], 'wood', { tint: 0x5a3e26, tag: 'pillar' });
  for (const [x, z] of [[36, -18], [50, -18], [43, -12], [43, -25]] as const) b.hallLamp(x, 8.7, z, { color: 0xffbf78, intensity: 1.15, range: 15 });
  // Warmes Abendlicht durch die Luken (Fensterlicht ohne Schatten-Aufwand)
  for (const [x, z, f] of [[20.8, 18, 'px'], [20.8, 34, 'px'], [55.2, 18, 'nx'], [55.2, 38, 'nx'], [30.8, -14, 'px'], [55.2, -18, 'nx']] as const) {
    b.light({ kind: 'window', pos: [x, Y + 2.0, z], color: 0xffa860, intensity: 1.4, range: 13 });
    void f;
  }
  hoists(b, 'px', 20, 12, 40, Y, 1, 8, { len: 1.5 });
  plate(b, 'WOHNUNGEN', 42, Y + 3.2, -27.7, 'pz', 'NORD · ZUM BALKON', 3.4);
  plate(b, 'SPEICHERBRÜCKE', 42, Y + 2.4, 6.3, 'nz', undefined, 3.4);
  shop(b, 'SEILWINDE', 55.65, Y + 3.0, 30, 'nx', 'LASTEN NUR MIT SICHERUNG', 3.8);
  shop(b, 'GEWÜRZLAGER', 20.35, Y + 3.6, 28, 'px', 'PFEFFER · ZIMT · NELKEN', 3.8);

  // Balkon: Geländer, Laternen, Blumenkästen (Fässer), Schild
  b.rail(36, -38.05, 38, -38.05, Y, 1.05, 0x6a4a2e);
  b.rail(46, -38.05, 54, -38.05, Y, 1.05, 0x6a4a2e);
  b.rail(38.05, -46, 38.05, -38, 1.6 + 2.8 * 0.5, 1.05, 0x6a4a2e);
  b.rail(45.95, -46, 45.95, -38, 1.6 + 2.8 * 0.5, 1.05, 0x6a4a2e);
  prop(b, 'gasLamp', 36.6, Y, -31);
  prop(b, 'gasLamp', 53.4, Y, -31);
  prop(b, 'barrel', 51, Y, -37.2);
  prop(b, 'barrel', 51.9, Y, -37.0);
  prop(b, 'crate', 36.8, Y, -36.4, { h: 1.0 });
  shop(b, 'BALKON', 45, Y + 3.0, -29.7, 'pz', 'AUSSICHT AUF DEN KRANHOF', 3.4);
  lamp(b, 36.4, Y + 2.8, -33, 'px');
}
