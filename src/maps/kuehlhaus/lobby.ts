import { prop } from '../../logic/mapprops';
import { F, edge, frost, hangSign, line, type B } from './helpers';
import { lampGrid, tubeRow } from './lights';

// ====================================================================== Lobby, Hütte, Westgang
export function dressLobby(b: B): void {
  // Lobby (x −16…24, z 4…26): Stützen, Tiefkühlware, Stapler, Kühlraumtüren an der Ostwand
  for (const [x, z] of [[-6, 12], [-6, 20], [18, 12], [18, 20], [6, 16]] as const) b.box([x - 0.3, 0, z - 0.3], [x + 0.3, 7.7, z + 0.3], 'steel', { tint: 0x2f78c0, tag: 'pillar' });
  line(b, 'rack', -14.5, 0, 24, -14.5, 0, 24, 1, { rot: 1, len: 5.4, h: 4, cold: true });
  prop(b, 'palletGoods', -14, 0, 14, { cold: true });
  prop(b, 'palletGoods', -14, 0, 15.3, { cold: true });
  prop(b, 'palletStack', -14, 0, 17.2, { n: 6 });
  prop(b, 'gitterbox', -13.8, 0, 19.2, { n: 2, rot: 1 });
  prop(b, 'forklift', -9, 0, 24, { rot: 0, tint: 0xe0a020 });
  prop(b, 'rollCage', -10, 0, 8, { h: 1.2, cold: true });
  prop(b, 'rollCage', -10, 0, 9.1, { h: 0.9, cold: true });
  for (const z of [8, 14, 20]) {
    prop(b, 'doorSteel', 24 - F, 0, z, { rot: 1, len: 1.8, tint: 0xe8eef2 });
    prop(b, 'stripCurtain', 23.2, 0, z, { len: 2.6, h: 3.4, rot: 1 });
  }
  b.sign('KÜHLRAUM 1', [23.8, 3.8, 8], 'nx', 2.8, 0.7, { color: 0x9fd0ff, sub: '−25 °C' });
  b.sign('KÜHLRAUM 2', [23.8, 3.8, 14], 'nx', 2.8, 0.7, { color: 0x9fd0ff, sub: '−25 °C' });
  b.sign('KÜHLRAUM 3', [23.8, 3.8, 20], 'nx', 2.8, 0.7, { color: 0x9fd0ff, sub: '−30 °C' });
  prop(b, 'palletGoods', 21, 0, 10.8, { cold: true });
  prop(b, 'palletGoods', 21, 0, 12, { cold: true });
  prop(b, 'cartons', 20.5, 0, 17, { cold: true });
  prop(b, 'palletStack', 21.2, 0, 23.4, { n: 5 });
  prop(b, 'handTruck', 20, 0, 6, { rot: 2 });
  prop(b, 'electricBox', 14, 0, 4.2 + F, { rot: 0, tint: 0xa8b0a0 });
  b.decor('extinguisher', [16.5, 1.2, 4.3], 0);
  b.decor('extinguisher', [10.3, 1.2, 25.5], 0);
  // Boden: Gehwege, Markierungen, Reif
  for (const x of [-2, 18]) b.decal({ kind: 'line', pos: [x, 0.02, 15], size: [0.15, 22], color: 0x4fd080 });
  b.decal({ kind: 'line', pos: [4, 0.02, 7], size: [40, 0.15], color: 0xe8c020 });
  b.decal({ kind: 'arrow', pos: [10, 0.02, 22], size: [2, 3], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'arrow', pos: [8, 0.02, 9], size: [2, 3], rot: Math.PI, color: 0xe8e8e8 });
  edge(b, 4, 25.4, 16, 26, 0);
  frost(b, 10, 0, 22, 14, 7);
  frost(b, 20, 0, 15, 4, 14);
  // Licht
  lampGrid(b, -6, 8, 18, 22, 3, 3, 6.6, { intensity: 1.35, range: 15 });
  b.light({ kind: 'window', pos: [10, 2.6, 28.2], color: 0xe2efff, intensity: 1.0, range: 16 });
  // Wegweiser
  hangSign(b, 'HALLE A →', 8, 4.6, 6.2, 0xffd040, 'HÜTTE · QUIETSCHTÜR', 4.4);
  b.sign('RAMPENRAUM', [-15.85, 3.4, 12], 'px', 3.4, 0.8, { color: 0x7fc0ff, sub: '← KELLER · B' });
  b.sign('WESTGANG', [-13.9, 3.6, 4.15], 'pz', 3, 0.8, { color: 0xffb070, sub: '→ HALLE A · HÖLLE' });
  b.sign('LOBBY', [10, 6.2, 25.85], 'nz', 4, 1.0, { color: 0xf0f6fa, bg: 0x2f78c0, sub: 'KÜHLHAUS · EMPFANG' });
  b.ambient('hallHum', [4, 4, 14], 24, 0.5);

  // Hütte (x 2…14, z −10…2): Pförtnerloge, Tür quietscht
  prop(b, 'desk', 3.6, 0, -6, { rot: 1 });
  prop(b, 'locker', 13.6, 0, -4, { rot: 1 });
  prop(b, 'locker', 13.6, 0, -2.9, { rot: 1 });
  prop(b, 'shelf', 7, 0, -9.6, { len: 2.4 });
  prop(b, 'cartons', 12.5, 0, -8.8, { cold: true });
  prop(b, 'electricBox', 14 - F, 0, 0.4, { rot: 1 });
  b.box([3.1, 0.78, -5.6], [3.14, 1.15, -5.2], 'emissive', { collide: 'none', tint: 0x6fb0ff, noNav: true, occlude: false });
  b.sign('PFÖRTNER', [8, 3.1, 1.86], 'nz', 3, 0.7, { color: 0xffd040, sub: 'TÜR QUIETSCHT · NICHT ÖLEN' });
  b.sign('HALLE A', [8, 3.1, -9.86], 'pz', 3, 0.7, { color: 0xff7a5a, sub: 'KÜHLZONE · JACKE ANZIEHEN' });
  tubeRow(b, 5, -4, 11, -4, 2, 3.65, true, { intensity: 0.9, range: 8 });
  tubeRow(b, 8, 0, 8, -8, 2, 3.65, false, { intensity: 0.7, range: 7 });
  frost(b, 8, 0, -12, 4, 4);

  // Westgang (x −16…−12, z −20…4)
  edge(b, -16, 3.6, -12, 4, 0);
  tubeRow(b, -14, -18, -14, 2, 4, 3.65, false, { intensity: 0.9, range: 9 });
  prop(b, 'locker', -15.55, 0, -4, { rot: 3 });
  prop(b, 'cartons', -13.2, 0, -12, { cold: true });
  b.decor('extinguisher', [-12.3, 1.2, -9], 0);
  b.sign('HÖLLE', [-14, 3.4, -19.85], 'pz', 3.2, 0.8, { color: 0xff7a5a, sub: 'HALLE A · −18 °C' });
  frost(b, -14, 0, -15, 3.6, 8);
}
