import { prop } from '../../logic/mapprops';
import { F, edge, frost, line, snow, type B } from './helpers';

// ====================================================================== Außenbereich
export function dressYard(b: B): void {
  // Silos: Ammoniak-/Kältespeicher, durch Rohre und eine Kompressorstation verbunden
  const silos: [number, number, number, number][] = [[-6, 52, 8, 16], [10, 52, 6.6, 14], [-6, 67, 7, 15], [11, 67, 8, 16]];
  for (const [x, z, d, h] of silos) {
    prop(b, 'silo', x, 0, z, { len: d, h });
    b.box([x - d / 2 - 0.5, 0, z - d / 2 - 0.5], [x + d / 2 + 0.5, 0.35, z + d / 2 + 0.5], 'concrete', { collide: 'none', noNav: true, tint: 0x9aa4ac, occlude: false });
  }
  b.decor('pipeX', [2.2, 9.5, 52], 0, [6.6, 1.2, 1.2], 0xd8dde2);
  b.decor('pipeX', [2.2, 9.0, 52.5], 0, [6.6, 0.8, 0.8], 0xc0442e);
  b.decor('pipeZ', [-6, 10.5, 59.7], 0, [1.2, 1.2, 8], 0xd8dde2);
  b.decor('pipeX', [2.6, 10.0, 67], 0, [7.4, 1.0, 1.0], 0xd8dde2);
  b.sign('NH₃', [-6, 5.2, 52 + 4.06], 'pz', 3.2, 1.0, { color: 0xffd040, sub: 'KÄLTEMITTEL' });
  b.sign('SILO 2', [10, 4.6, 52 + 3.36], 'pz', 2.6, 0.8, { color: 0xe8f1f6, sub: 'TIEFKÜHLSPEICHER' });
  b.sign('SILO 3', [-6, 4.8, 67 + 3.56], 'pz', 2.6, 0.8, { color: 0xe8f1f6, sub: '−32 °C' });
  prop(b, 'compressor', 2.2, 0, 59.8, { rot: 1 });
  prop(b, 'chiller', 2.2, 0, 45.5, { rot: 0 });
  prop(b, 'chiller', 3.4, 0, 73, { rot: 0 });
  line(b, 'barrel', -1.6, 0, 47, -0.6, 0, 47, 2);
  prop(b, 'palletGoods', 6.5, 0, 59, { cold: true });
  prop(b, 'palletGoods', 6.5, 0, 60.3, { cold: true });
  prop(b, 'gitterbox', 5.4, 0, 56.4, { n: 2, rot: 1 });
  // Notdusche/Augenspülung der Kältetechniker (Ammoniak) neben der Kompressorstation
  b.box([0.2, 0, 61.4], [1.0, 2.3, 62.2], 'metal', { tint: 0x3a9a5a, tag: 'prop' });
  b.box([0.1, 2.2, 61.3], [1.1, 2.4, 62.3], 'metal', { collide: 'none', tint: 0x3a9a5a, noNav: true, occlude: false });
  b.sign('NOTDUSCHE', [0.6, 1.5, 62.25], 'pz', 1.6, 0.5, { color: 0xf0f6fa, bg: 0x2a8a50, sub: 'AUGENSPÜLUNG' });
  frost(b, 2, 0, 59, 12, 10);
  frost(b, 2, 0, 46, 10, 6);

  // Außenbereich: Container-Stapel, Reefer-Auflieger, Paletten, Leuchten
  prop(b, 'container', 27.5, 0, 42, { rot: 1, tint: 0x9db8d0 });
  prop(b, 'container', 27.5, 0, 48.3, { rot: 1, tint: 0xdfe8ee });
  prop(b, 'container', 27.5, 2.59, 45, { rot: 1, tint: 0xc9d4dc });
  prop(b, 'container', 22, 0, 36, { rot: 0, tint: 0xb04a32 });
  prop(b, 'palletStack', 20.5, 0, 56, { n: 6 });
  prop(b, 'palletGoods', 21.8, 0, 56, { cold: true });
  prop(b, 'palletGoods', 21.8, 0, 57.2, { cold: true });
  prop(b, 'rollCage', 19.6, 0, 62.8, { h: 1.0, cold: true });
  prop(b, 'rollCage', 19.6, 0, 63.7, { h: 1.2, cold: true });
  prop(b, 'trailer', -26, 0, 78, { rot: 0, tint: 0xeef2f5 });
  prop(b, 'truck', -13.6, 0, 78, { rot: 0, tint: 0x2f78c0 });
  prop(b, 'container', -15, 0, 46, { rot: 1, tint: 0x2f7d4f });
  prop(b, 'container', -15, 0, 52.4, { rot: 1, tint: 0x9db8d0 });
  prop(b, 'crate', -18, 0, 40, { h: 1.2 });
  prop(b, 'crate', -18, 1.2, 40, { h: 0.9 });
  prop(b, 'palletGoods', -14, 0, 38, { cold: true });
  prop(b, 'palletGoods', -12.6, 0, 38, { cold: true });
  for (const [x, z] of [[-12, 36], [24, 34], [30, 56], [-40, 70], [58, 50], [72, 70]] as const) prop(b, 'lampPost', x, 0, z);

  // Nordwand des Hofs (Kühlhaus-Fassade): Verladetore, Verflüssiger-Reihe, Leitungen
  for (const x of [-72, -60, 28, 40, 52, 76]) prop(b, 'rollerDoor', x, 0, 30 + F, { rot: 0, len: 3.6, h: 4.2 });
  for (const x of [-72, -60, 28, 40, 52, 76]) b.wallLamp(x, 5.8, 30 + F + 0.05, 'pz', { intensity: 0.7, range: 10, color: 0xcfe4ff });
  line(b, 'chiller', 32, 0, 32.6, 62, 0, 32.6, 5, { rot: 0 });
  line(b, 'chiller', -76, 0, 32.6, -62, 0, 32.6, 3, { rot: 0 });
  b.sign('KÜHLHAUS NORD', [-66, 7.4, 30 + F + 0.02], 'pz', 8, 1.4, { color: 0xf0f6fa, bg: 0x2f78c0, sub: 'TIEFKÜHLLOGISTIK' });
  b.sign('KÜHLHAUS NORD', [46, 7.4, 30 + F + 0.02], 'pz', 8, 1.4, { color: 0xf0f6fa, bg: 0x2f78c0, sub: 'TIEFKÜHLLOGISTIK' });

  // Haupteingang: Rolltor halb offen, Streifenvorhang, Schilder
  b.box([4, 5.0, 29.9], [16, 6.2, 30.2], 'gate', { tint: 0xb8c4cc, tag: 'door' });
  prop(b, 'stripCurtain', 10, 0, 27.4, { len: 8, h: 3.8 });
  b.sign('HAUPTEINGANG', [10, 7.0, 30 + F + 0.02], 'pz', 7, 1.2, { color: 0xffd040, sub: 'WARENANNAHME · LOBBY' });
  for (const x of [4.4, 15.6]) prop(b, 'bumper', x, 0, 31.2, { rot: 0 });
  edge(b, 4, 29.4, 16, 30, 0);
  frost(b, 10, 0, 34, 14, 6);

  // T-Spawn: Laderampen mit Reefer-Aufliegern
  prop(b, 'trailer', 32, 0, 85.6, { rot: 0, tint: 0xeef2f5 });
  prop(b, 'truck', 41.2, 0, 85.6, { rot: 0, tint: 0xc23a2a });
  prop(b, 'trailer', 52, 0, 85.6, { rot: 0, tint: 0xdfe8ee });
  for (const x of [28, 40, 52]) prop(b, 'rollerDoor', x, 0, 88 - F, { rot: 2, len: 3.6, h: 4.2 });
  b.sign('DOCK 1–3', [40, 7.2, 88 - F - 0.02], 'nz', 6, 1.2, { color: 0xffd040, sub: 'VERLADUNG · NUR MIT FREIGABE' });
  prop(b, 'container', 70, 0, 64, { rot: 1, tint: 0xa8432b });
  prop(b, 'palletStack', 68.4, 0, 72, { n: 5 });
  prop(b, 'gitterbox', 67.4, 0, 76.6, { n: 2 });
  prop(b, 'barrelGroup', 62.6, 0, 62, {});
  line(b, 'cones', 24, 0, 60.4, 56, 0, 60.4, 5, { rot: 0 });
  b.sign('T-SPAWN', [22.1, 3.4, 73], 'px', 3, 0.9, { color: 0xffb070, sub: 'LADEZONE' });

  // Garage + Dachaufgang + Westhof
  prop(b, 'container', -70, 0, 40, { rot: 0, tint: 0x9db8d0 });
  prop(b, 'container', -70, 2.59, 40, { rot: 0, tint: 0xa8432b });
  prop(b, 'container', -68, 0, 56, { rot: 1, tint: 0xdfe8ee });
  prop(b, 'trailer', -68, 0, 72, { rot: 0, tint: 0xe6edf2 });
  prop(b, 'palletStack', -46, 0, 66, { n: 5 });
  prop(b, 'barrelGroup', -36, 0, 66, {});
  edge(b, -50, 62, -40, 62.4, 0);
  b.sign('DACH', [-45, 3.4, 61.9], 'pz', 2.4, 0.8, { color: 0xffd040, sub: 'NUR PERSONAL' });
  snow(b, -80, 86, 84, 88, 0, 0.25);
  snow(b, -80, 30, -30, 31.2, 0, 0.3);

  // Geheimgang-Rampe: Betonrampe mit Geländer und Warnband
  for (const x of [48.05, 57.95]) b.rail(x, 30, x, 48, 0, 1.05, 0xe0a020);
  edge(b, 48, 47.4, 58, 48, 0);
  b.sign('SERVICE', [53, 3.0, 29.95], 'pz', 5, 1.0, { color: 0xffd040, sub: 'GEHEIMGANG · NUR PERSONAL' });
}
