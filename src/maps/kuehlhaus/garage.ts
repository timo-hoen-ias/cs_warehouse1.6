import { prop } from '../../logic/mapprops';
import { F, edge, frost, hangSign, line, snow, type B } from './helpers';
import { lampGrid, tubeRow } from './lights';

// ====================================================================== Garage, Garagenflur, Garagendach
export function dressGarage(b: B): void {
  // Garage (x −56…−24, z 36…60): Reefer-Auflieger als Mittelblock, Stapler-Ladestation, Werkbank
  prop(b, 'trailer', -42, 0, 48, { rot: 0, tint: 0xeef2f5 });
  line(b, 'forklift', -52, 0, 40, -52, 0, 56, 3, { rot: 1 });
  prop(b, 'forklift', -32, 0, 58, { rot: 2, tint: 0x2f78c0 });
  line(b, 'electricBox', -54, 0, 36 + F, -36, 0, 36 + F, 4, { rot: 0 });
  prop(b, 'desk', -34, 0, 59.2, { rot: 0 });
  prop(b, 'desk', -38.4, 0, 59.2, { rot: 0 });
  prop(b, 'shelf', -46, 0, 59.6, { len: 3 });
  prop(b, 'shelf', -49.4, 0, 59.6, { len: 3 });
  prop(b, 'palletStack', -30, 0, 40, { n: 5 });
  prop(b, 'palletGoods', -33, 0, 38, { cold: true });
  prop(b, 'palletGoods', -33, 0, 39.2, { cold: true });
  prop(b, 'gitterbox', -37, 0, 38.4, { n: 2 });
  prop(b, 'rollCage', -45, 0, 44, { h: 1.1, cold: true });
  prop(b, 'rollCage', -44, 0, 44, { h: 0.8, cold: true });
  prop(b, 'barrelGroup', -55, 0, 59, {});
  prop(b, 'drum', -55.2, 0, 37.6, { rot: 0 });
  prop(b, 'cones', -28.5, 0, 49, { rot: 0 });
  prop(b, 'handTruck', -39, 0, 53, { rot: 0 });
  b.decor('extinguisher', [-26.2, 1.2, 36.3], 0);
  edge(b, -24.4, 44, -24, 54, 0);
  edge(b, -24, 43.6, -20, 44, 0);
  edge(b, -24, 54, -20, 54.4, 0);
  frost(b, -40, 0, 52, 10, 5);
  frost(b, -50, 0, 44, 6, 8);
  lampGrid(b, -52, 40, -28, 56, 4, 3, 2.75, { intensity: 1.1, range: 11 });
  b.light({ kind: 'window', pos: [-21, 2.4, 49], color: 0xdce8ff, intensity: 0.9, range: 14 });
  hangSign(b, 'GARAGE', -27, 3.0, 49, 0xffd040, 'ELEKTRO-STAPLER · LADEZONE', 4);
  b.sign('LADESTATION', [-45, 3.0, 36.3], 'pz', 4, 0.8, { color: 0x7fe0a0, sub: 'STAPLER · 80 V' });
  b.sign('GARAGE', [-23.7, 3.4, 40], 'px', 3, 0.8, { color: 0xffd040, sub: 'NUR FLURFÖRDERZEUGE' });
  b.ambient('forklift', [-48, 1, 46], 12, 0.4);

  // Garagendach (4.5): Verflüssiger, Oberlichter, Kiste als Deckung
  prop(b, 'chiller', -40, 4.5, 41, { rot: 0 });
  prop(b, 'chiller', -48, 4.5, 41, { rot: 0 });
  prop(b, 'acUnit', -36, 4.5, 56, { rot: 1 });
  prop(b, 'cableTray', -44, 4.5, 56, { len: 10 });
  for (const x of [-52, -44, -36]) b.box([x - 1.2, 4.5, 50 - 1.2], [x + 1.2, 4.9, 50 + 1.2], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  prop(b, 'palletGoods', -52, 4.5, 55, { cold: true });
  prop(b, 'crate', -30, 4.5, 38, { h: 1.0 });
  snow(b, -56, 36, -24, 37, 4.5, 0.2);
  snow(b, -56, 59, -24, 60, 4.5, 0.2);
  frost(b, -48, 4.5, 50, 12, 8);
  b.sign('GARAGENDACH', [-30, 5.0, 36.3], 'pz', 4, 0.8, { color: 0xffd040, sub: 'ACHTUNG · GLATTEIS' });
  b.ambient('wind', [-40, 6, 48], 30, 0.4);

  // Garagenflur (x −28…−22, z 16…36)
  prop(b, 'stripCurtain', -25, 0, 30, { len: 6, h: 3.8 });
  prop(b, 'stripCurtain', -25, 0, 22, { len: 6, h: 3.8 });
  b.decor('pipeZ', [-27.4, 3.6, 26], 0, [1.2, 1.2, 20], 0xd8dde2);
  b.decor('pipeZ', [-26.8, 3.3, 26], 0, [0.7, 0.7, 20], 0xc0442e);
  prop(b, 'electricBox', -28 + F, 0, 20, { rot: 3 });
  prop(b, 'cartons', -23.2, 0, 26, { cold: true });
  prop(b, 'handTruck', -27, 0, 33, { rot: 1 });
  line(b, 'cones', -23, 0, 18, -23, 0, 20, 2);
  edge(b, -28, 15.6, -22, 16, 0);
  tubeRow(b, -25, 18, -25, 34, 4, 3.6, false, { intensity: 0.9, range: 9 });
  b.sign('GARAGE', [-25, 3.6, 35.8], 'nz', 3.6, 0.8, { color: 0xffd040, sub: '↓ HOF' });
  b.sign('RAMPENRAUM', [-25, 3.4, 16.2], 'pz', 4, 0.8, { color: 0x7fc0ff, sub: '↑ KELLER · LOBBY' });
  frost(b, -25, 0, 24, 5, 14);
}
