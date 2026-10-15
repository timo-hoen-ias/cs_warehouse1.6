import { prop } from '../../logic/mapprops';
import { F, edge, frost, hangSign, line, tape, type B } from './helpers';
import { lampGrid } from './lights';

// ====================================================================== Halle A (Erdgeschoss), Himmel, Hölle, Lüftung, Spot A
export function dressHalleA(b: B): void {
  // ---- Hallendecke: Stahlträger, Lichtbänder, Leuchten
  for (let x = -8; x <= 40; x += 8) b.box([x - 0.15, 14.2, -57.8], [x + 0.15, 14.85, -14.2], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  for (const z of [-48, -36, -24]) b.box([-11.8, 14.3, z - 0.12], [43.8, 14.8, z + 0.12], 'steel', { collide: 'none', tint: 0x5a6a7a, noNav: true, occlude: false });
  for (const z of [-50, -32]) b.box([-8, 14.96, z - 1.4], [40, 14.99, z + 1.4], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  lampGrid(b, -2, -52, 38, -20, 5, 4, 13.6, { intensity: 1.7, range: 22 });
  for (const [x, z] of [[8, -41], [28, -41]] as const) b.light({ kind: 'window', pos: [x, 11, z], color: 0xdbe8ff, intensity: 0.9, range: 20 });

  // ---- Himmel (Laufsteg +4.5 an der Westwand) und Treppe
  b.rail(-5.95, -48, -5.95, -20.05, 4.5);
  b.rail(-6, -20.05, 10, -20.05, 4.5);
  b.rail(-6, -15.95, 10, -15.95, 4.5);
  b.rail(10.05, -20, 10.05, -16, 4.5);
  for (const z of [-47.6, -40, -32, -24, -16.4]) b.box([-6.35, 0, z - 0.2], [-5.95, 4.2, z + 0.2], 'steel', { tint: 0x2f78c0, tag: 'pillar' });
  for (const x of [-2, 4, 9.6]) b.box([x - 0.2, 0, -16.4], [x + 0.2, 4.2, -15.6], 'steel', { tint: 0x2f78c0, tag: 'pillar' });
  prop(b, 'crate', -9.5, 4.5, -42, { h: 1.1 });
  prop(b, 'crate', -9.5, 4.5, -40.7, { h: 1.1 });
  prop(b, 'palletGoods', -9, 4.5, -23, { cold: true });
  prop(b, 'palletGoods', -9, 4.5, -21.8, { cold: true });
  prop(b, 'gitterbox', 2, 4.5, -18, { n: 1 });
  prop(b, 'cartons', -9, 4.5, -37, { cold: true });
  edge(b, -12, -48.4, -6, -48, 4.5);
  hangSign(b, 'HIMMEL', -6, 6.6, -34, 0xff7a5a, 'LAUFSTEG · ABSTURZGEFAHR', 4);
  b.sign('HIMMEL', [-11.85, 6.6, -42], 'px', 3.4, 0.9, { color: 0xff7a5a, sub: 'LAUFSTEG' });
  b.sign('HIMMELSTREPPE', [-11.85, 3.0, -52], 'px', 3.6, 0.8, { color: 0xffd040, sub: '↑ LAUFSTEG' });
  // Öffnung der Westwand zum Dachweg (Tür, +4.5)
  b.box([-12, 4.5, -34], [-11.9, 7.0, -28], 'door', { collide: 'none', tint: 0x2f78c0, noNav: true, occlude: false });
  b.sign('DACHWEG', [-11.85, 7.4, -31], 'px', 3, 0.7, { color: 0xffd040, sub: 'NUR PERSONAL' });

  // ---- Hölle (unter dem Laufsteg): zwei Regalreihen mit Querungen, wenig Licht
  line(b, 'rack', -10.8, 0, -45.3, -10.8, 0, -23.7, 5, { rot: 1, len: 5.4, h: 4.1, cold: true });
  for (const z of [-45.3, -39.9, -29.1, -23.7]) prop(b, 'rack', -7.5, 0, z, { rot: 1, len: 5.4, h: 4.1, cold: true });
  prop(b, 'palletGoods', -8.8, 0, -35, { cold: true });
  prop(b, 'palletStack', -8.7, 0, -33.4, { n: 6 });
  prop(b, 'drum', -8.4, 0, -17.6, { rot: 1 });
  frost(b, -9, 0, -35, 5, 12);
  frost(b, -9, 0, -20, 5, 5);
  b.light({ kind: 'lamp', pos: [-9, 3.6, -30], color: 0x9fc8ff, intensity: 0.7, range: 10 });
  b.light({ kind: 'lamp', pos: [-9, 3.6, -44], color: 0x9fc8ff, intensity: 0.7, range: 10 });
  b.light({ kind: 'lamp', pos: [-9, 3.6, -18], color: 0xdbeaff, intensity: 0.8, range: 10 });
  b.sign('HÖLLE', [-6.1, 3.2, -18.6], 'px', 2.8, 0.7, { color: 0xff7a5a, sub: 'UNTER DEM LAUFSTEG' });

  // ---- Wände: Regalreihen nördlich/südlich, Rohre, Kabelwannen, Streifenvorhänge an den Türen
  line(b, 'rack', 1.4, 0, -57.4, 1.4, 0, -57.4, 1, { rot: 0, len: 5.4, h: 8, cold: true });
  line(b, 'rack', 18, 0, -57.4, 23.4, 0, -57.4, 2, { rot: 0, len: 5.4, h: 8, cold: true });
  line(b, 'rack', 38.4, 0, -57.4, 38.4, 0, -57.4, 1, { rot: 0, len: 5.4, h: 8, cold: true });
  line(b, 'rack', 14, 0, -14.6, 30, 0, -14.6, 4, { rot: 2, len: 5.4, h: 8, cold: true });
  for (const x of [11, 30]) prop(b, 'stripCurtain', x, 0, -57.6, { len: x === 30 ? 4 : 6, h: 3.3 });
  prop(b, 'stripCurtain', -8, 0, -57.6, { len: 4, h: 3.3 });
  b.decor('pipeZ', [-11.2, 11.5, -36], 0, [1.4, 1.4, 42], 0xd8dde2);
  b.decor('pipeZ', [-10.5, 11.1, -36], 0, [0.8, 0.8, 42], 0xc0442e);
  b.decor('pipeX', [16, 11.5, -57.2], 0, [56, 1.2, 1.2], 0xd8dde2);
  b.decor('pipeX', [16, 11.1, -56.5], 0, [56, 0.7, 0.7], 0xc0442e);
  b.decor('cableTrayX', [16, 9.2, -14.7], 0, [56, 1, 1]);
  b.decor('cableTrayZ', [-11.4, 8.6, -36], 0, [1, 1, 42]);
  for (const z of [-50, -38, -26]) b.wallLamp(-11.85, 9, z, 'px', { intensity: 1.0, range: 14, color: 0xdceeff });
  for (const x of [4, 20, 36]) b.wallLamp(x, 9, -57.85, 'pz', { intensity: 1.0, range: 14, color: 0xdceeff });

  // ---- Hallenmitte: Förderbänder, Staplerverkehr, Palettenblöcke als Deckung
  prop(b, 'conveyor', 12, 0, -34, { rot: 0, len: 12 });
  prop(b, 'conveyor', 4, 0, -46, { rot: 0, len: 8 });
  prop(b, 'forklift', 18, 0, -22, { rot: 1, tint: 0xe0a020 });
  prop(b, 'forklift', 4, 0, -26, { rot: 0, tint: 0x2f78c0 });
  line(b, 'palletGoods', 20, 0, -30, 23, 0, -30, 3, { cold: true, rot: 1 });
  prop(b, 'palletStack', 7, 0, -41.4, { n: 7 });
  prop(b, 'palletGoods', 8.4, 0, -41.4, { cold: true });
  prop(b, 'palletGoods', 8.4, 0, -40.2, { cold: true });
  prop(b, 'gitterbox', 22, 0, -50, { n: 2 });
  prop(b, 'gitterbox', 22, 0, -48.8, { n: 2 });
  prop(b, 'rollCage', 14, 0, -52, { h: 1.2, cold: true });
  prop(b, 'rollCage', 14.9, 0, -52, { h: 0.9, cold: true });
  prop(b, 'crateStack', 17.5, 0, -41);
  prop(b, 'handTruck', 11, 0, -20, { rot: 1 });
  prop(b, 'cartons', 3, 0, -34, { cold: true });
  prop(b, 'cartons', 27, 0, -20, { cold: true });
  prop(b, 'pallet', 1, 0, -20, {});
  edge(b, 5.6, -14.4, 10.4, -14, 0);
  b.decal({ kind: 'line', pos: [8, 0.02, -30], size: [0.15, 32], color: 0xe8c020 });
  b.decal({ kind: 'line', pos: [28, 0.02, -30], size: [0.15, 32], color: 0xe8c020 });
  b.decal({ kind: 'arrow', pos: [8, 0.02, -24], size: [2, 3], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'arrow', pos: [28, 0.02, -34], size: [2, 3], rot: Math.PI, color: 0xe8e8e8 });
  frost(b, 14, 0, -24, 10, 8);
  frost(b, 24, 0, -38, 8, 8);
  frost(b, 2, 0, -52, 8, 6);

  // ---- Spot A: Serverschränke der IT „neben der Kältemaschine“, Kompressorstation an der Ostwand
  prop(b, 'serverRow', 26.5, 0, -54.6, { rot: 0, n: 5 });
  prop(b, 'serverRow', 34, 0, -54.6, { rot: 0, n: 4 });
  prop(b, 'ups', 23.2, 0, -54.6, {});
  prop(b, 'cooler', 38.6, 0, -54.6, { rot: 0 });
  prop(b, 'palletGoods', 38, 0, -50, { tint: 0xe8e8e8, h: 1.1 });
  line(b, 'compressor', 41.9, 0, -50, 41.9, 0, -34, 3, { rot: 1 });
  b.decor('pipeZ', [43.2, 3.2, -40], 0, [1.2, 1.2, 28], 0xd8dde2);
  b.decor('pipeZ', [43.2, 2.6, -40], 0, [0.7, 0.7, 28], 0xc0442e);
  b.decor('pipeX', [38, 4.4, -37], 0, [10, 0.8, 0.8], 0xc0442e);
  prop(b, 'crateStack', 22.5, 0, -39);
  prop(b, 'palletStack', 34.6, 0, -37.4, { n: 6 });
  prop(b, 'palletGoods', 36.1, 0, -37.4, { cold: true });
  prop(b, 'palletGoods', 24, 0, -48.5, { cold: true });
  prop(b, 'palletGoods', 24, 0, -47.3, { cold: true });
  prop(b, 'drum', 33, 0, -31, { rot: 0 });
  b.decal({ kind: 'letter', pos: [30, 0.02, -44], size: [5, 5], text: 'A', color: 0xff5a4a });
  b.decal({ kind: 'grid', pos: [30, 0.02, -44], size: [14, 14] });
  tape(b, 22, -52.5, 38, -52.5, 0);
  hangSign(b, 'SERVERSCHRANK A', 30, 6.2, -50.4, 0xff5a4a, 'IT · NICHT BERÜHREN', 5);
  b.sign('KÄLTEMASCHINE', [43.85, 4.6, -42], 'nx', 4, 0.9, { color: 0x9fd0ff, sub: 'NH₃ · DRUCK 12 BAR' });
  b.light({ kind: 'lamp', pos: [30, 2.6, -52.8], color: 0x40c8ff, intensity: 0.5, range: 6 });
  b.ambient('buzz', [30, 2, -54], 10, 0.5);
  b.ambient('compressor', [42, 1.5, -42], 16, 0.6);
  b.ambient('hallHum', [16, 6, -36], 40, 0.5);

  // ---- Lüftungsschacht (x 38…42, z −28…−18): Geländer, Warnstreifen, Gitterrost-Treppe
  b.rail(38, -28.05, 42, -28.05, 0, 1.05, 0xe0a020);
  b.rail(37.95, -28, 37.95, -18, 0, 1.05, 0xe0a020);
  b.rail(42.05, -28, 42.05, -18, 0, 1.05, 0xe0a020);
  edge(b, 37.6, -28.4, 42.4, -28, 0);
  edge(b, 37.6, -17.6, 42.4, -17.2, 0);
  hangSign(b, 'LÜFTUNG', 40, 4.4, -17.6, 0xffd040, 'A ↔ B · WARTUNG', 3.6);
  b.light({ kind: 'lamp', pos: [40, -2.6, -22], color: 0xcfe4ff, intensity: 0.9, range: 9 });
  b.light({ kind: 'lamp', pos: [40, -3.8, -26.5], color: 0x9fc8ff, intensity: 0.7, range: 8 });
  b.ambient('ventilation', [40, -2, -23], 14, 0.7);
  prop(b, 'electricBox', 44 - F, 0, -21, { rot: 1 });
}
