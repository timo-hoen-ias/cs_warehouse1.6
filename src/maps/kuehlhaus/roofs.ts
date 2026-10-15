import { prop } from '../../logic/mapprops';
import { edge, frost, line, snow, type B } from './helpers';

// ====================================================================== Dachweg (Garage → Rampenraum → Westdach → Himmel)
export function dressRoofs(b: B): void {
  // Westdach (+4.5): Kältetechnik auf dem Dach, Oberlichter, Rohre, Deckung
  prop(b, 'chiller', -22, 4.5, -40, { rot: 1 });
  prop(b, 'chiller', -22, 4.5, -32, { rot: 1 });
  prop(b, 'compressor', -26, 4.5, -44, { rot: 0 });
  line(b, 'acUnit', -26.2, 4.5, -36, -26.2, 4.5, -28, 3, { rot: 1 });
  prop(b, 'crate', -18, 4.5, -42, { h: 1.1 });
  prop(b, 'crate', -18, 4.5, -40.7, { h: 1.1 });
  prop(b, 'crate', -18, 5.6, -41.4, { h: 0.8 });
  prop(b, 'palletGoods', -16.5, 4.5, -28, { cold: true });
  prop(b, 'gitterbox', -26, 4.5, -22, { n: 1 });
  prop(b, 'barrel', -20.4, 4.5, -10);
  prop(b, 'cableTray', -22, 4.5, -24, { rot: 1, len: 12 });
  b.decor('pipeZ', [-27.4, 5.2, -36], 0, [1.2, 1.2, 14], 0xd8dde2);
  b.decor('pipeX', [-21, 5.4, -46.8], 0, [12, 0.9, 0.9], 0xc0442e);
  for (const z of [-36, -14]) b.box([-24.8, 4.5, z - 1.2], [-21.2, 4.9, z + 1.2], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  b.decor('extinguisher', [-14.4, 4.5, -44], 0);
  snow(b, -28, -46, -14, -45, 4.5, 0.25);
  snow(b, -28, -26, -27, -6, 4.5, 0.25);
  snow(b, -18, -46, -14, -36, 4.5, 0.2);
  frost(b, -22, 4.5, -28, 10, 10);
  frost(b, -23, 4.5, -14, 6, 12);
  edge(b, -14.4, -34, -14, -28, 4.5);
  b.sign('WESTDACH', [-20, 6.4, -46.6], 'pz', 4.4, 0.9, { color: 0xffd040, sub: 'GLATTEIS · ABSTURZGEFAHR' });
  b.sign('HIMMEL →', [-15.2, 6.4, -31], 'px', 3.4, 0.8, { color: 0xff7a5a, sub: 'LAUFSTEG HALLE A' });
  b.light({ kind: 'window', pos: [-14, 6, -31], color: 0xdbe8ff, intensity: 0.7, range: 9 });
  b.ambient('wind', [-22, 7, -26], 34, 0.5);
  b.ambient('compressor', [-24, 5, -42], 12, 0.4);
  // Rampenraum-/Flurdach (+4.5)
  prop(b, 'acUnit', -24, 4.5, 4, { rot: 1 });
  prop(b, 'chiller', -27, 4.5, 24, { rot: 1 });
  prop(b, 'crate', -20.6, 4.5, 12, { h: 1.1 });
  for (const z of [10, 26]) b.box([-26.4, 4.5, z - 1], [-23.6, 4.9, z + 1], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  snow(b, -28, 14, -22, 15, 4.5, 0.2);
}
