import { prop } from '../../logic/mapprops';
import { F, edge, frost, hangSign, line, tape, type B } from './helpers';
import { tubeRow } from './lights';

const FLOOR = -5;

// ====================================================================== Keller B (Datenraum + Tiefkühllager) und Geheimgang
export function dressKeller(b: B): void {
  // ---- Stützen im 8-m-Raster (Deckung), Hallendecke mit Kabelwannen und Rohren
  for (const x of [-4, 4, 12, 20, 28, 36]) {
    for (const z of [-52, -44, -36, -28, -20]) {
      if (x >= 36 && z >= -28) continue; // Lüftungsblock
      b.box([x - 0.35, FLOOR, z - 0.35], [x + 0.35, -0.8, z + 0.35], 'concrete', { tint: 0xb8c2ca, tag: 'pillar' });
      b.box([x - 0.4, FLOOR, z - 0.4], [x + 0.4, FLOOR + 0.9, z + 0.4], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 0.9 });
    }
  }
  b.decor('pipeX', [16, -1.4, -57.2], 0, [56, 1.2, 1.2], 0xd8dde2);
  b.decor('pipeX', [16, -1.9, -56.5], 0, [56, 0.7, 0.7], 0xc0442e);
  b.decor('cableTrayX', [16, -1.5, -40], 0, [56, 1, 1]);
  b.decor('cableTrayX', [16, -1.5, -24], 0, [56, 1, 1]);
  b.decor('cableTrayZ', [0, -1.5, -36], 0, [1, 1, 40]);
  b.decor('pipeZ', [43.2, -1.5, -46], 0, [1.0, 1.0, 20], 0xd8dde2);

  // ---- Datenraum (x 14…42, z −56…−30): Serverreihen Rücken an Rücken, Kaltgang dazwischen
  for (const [zA, zB] of [[-52.2, -49.2], [-39.6, -36.6], [-33.6, -30.6]] as const) {
    for (const x of [19.5, 24.5, 29.5, 34.5]) {
      if (zA === -33.6 && x > 31) continue;
      prop(b, 'serverRow', x, FLOOR, zA, { rot: 0, n: 5 });
      prop(b, 'serverRow', x, FLOOR, zB, { rot: 2, n: 5 });
    }
  }
  for (const z of [-56.4, -52, -47.6]) prop(b, 'cooler', 43.2, FLOOR, z, { rot: 1 });
  prop(b, 'ups', 14.6, FLOOR, -53.4, {});
  prop(b, 'ups', 14.6, FLOOR, -52.4, {});
  prop(b, 'ups', 14.6, FLOOR, -51.4, {});
  prop(b, 'palletGoods', 38, FLOOR, -44.6, { tint: 0xe8e8e8, h: 1.2 });
  prop(b, 'palletGoods', 38, FLOOR, -43.4, { tint: 0xe8e8e8, h: 0.9 });
  prop(b, 'gitterbox', 16.6, FLOOR, -42, { n: 1, rot: 1 });
  prop(b, 'crateStack', 22, FLOOR, -43.5);
  prop(b, 'cartons', 36, FLOOR, -41.4, {});
  b.decal({ kind: 'letter', pos: [30, FLOOR + 0.02, -44], size: [5, 5], text: 'B', color: 0xffb13a });
  b.decal({ kind: 'grid', pos: [30, FLOOR + 0.02, -44], size: [28, 24] });
  b.decal({ kind: 'stripes', pos: [30, FLOOR + 0.02, -56.6], size: [28, 1] });
  tape(b, 20, -45.8, 20, -42.2, FLOOR);
  b.sign('SERVERSCHRANK B', [43.85, -2.2, -41], 'nx', 5, 1.0, { color: 0xffb13a, sub: 'RECHENZENTRUM · KÜHLUNG AN' });
  b.sign('DATENRAUM', [13.85, -2.2, -44], 'px', 3.4, 0.9, { color: 0x7fc0ff, sub: 'KALTGANG · 18 °C' });
  for (const [x, z] of [[24.5, -50.7], [34.5, -50.7], [24.5, -38.1], [34.5, -38.1], [29.5, -44]] as const) b.light({ kind: 'lamp', pos: [x, FLOOR + 2.3, z], color: 0x40a8ff, intensity: 0.45, range: 6 });
  b.ambient('buzz', [30, -3.5, -44], 14, 0.6);
  b.ambient('ventilation', [40, -3.5, -48], 18, 0.6);
  b.ambient('compressor', [42, -3.5, -52], 16, 0.4);

  // ---- Tiefkühllager (West): Regalreihen mit Querungen, Frostboden, Streifenvorhänge
  for (const x of [-8, -3.2, 1.6, 6.4, 11.2]) {
    for (const z of [-53, -47.6]) prop(b, 'rack', x, FLOOR, z, { rot: 1, len: 5.4, h: 3.8, cold: true });
    for (const z of [-39, -33.6]) if (x !== 1.6) prop(b, 'rack', x, FLOOR, z, { rot: 1, len: 5.4, h: 3.8, cold: true });
  }
  prop(b, 'forklift', 4, FLOOR, -26, { rot: 3, tint: 0x2f78c0 });
  prop(b, 'palletStack', -9, FLOOR, -26, { n: 6 });
  prop(b, 'palletGoods', -9, FLOOR, -24.6, { cold: true });
  prop(b, 'palletGoods', 11, FLOOR, -28, { cold: true });
  prop(b, 'palletGoods', 11, FLOOR, -26.8, { cold: true });
  prop(b, 'rollCage', 8, FLOOR, -22, { h: 1.2, cold: true });
  prop(b, 'rollCage', 8.9, FLOOR, -22, { h: 0.9, cold: true });
  prop(b, 'gitterbox', 0, FLOOR, -18, { n: 2 });
  prop(b, 'handTruck', -2, FLOOR, -20, { rot: 0 });
  prop(b, 'stripCurtain', -4, FLOOR, -57.6, { len: 4, h: 3.6 });
  frost(b, 2, FLOOR, -44, 18, 14);
  frost(b, 0, FLOOR, -26, 14, 10);
  frost(b, -8, FLOOR, -34, 5, 14);
  b.sign('TIEFKÜHLLAGER', [-11.85, -2.3, -40], 'px', 4.6, 1.0, { color: 0x9fd0ff, sub: '−30 °C · JACKE ANZIEHEN' });
  b.sign('KELLERTREPPE', [-4, -2.3, -57.9], 'pz', 3.6, 0.8, { color: 0x7fc0ff, sub: '↑ KONTROLLRAUM · CT' });
  b.sign('LÜFTUNG', [36.1, -2.3, -26], 'nx', 3, 0.8, { color: 0xffd040, sub: '↑ A ↔ B' });
  b.sign('GEHEIMGANG', [43.85, -2.2, -30.2], 'nx', 3.2, 0.8, { color: 0xff7a5a, sub: 'SERVICEZUGANG' });
  b.sign('RAMPE', [-11.85, -2.2, -17], 'px', 2.6, 0.8, { color: 0x7fc0ff, sub: '↑ LOBBY' });

  // ---- Licht: kaltweiße Röhren im Raster, an den Wänden Wandlampen
  for (const x of [-4, 4, 12, 20, 28, 36]) {
    for (const z of [-52, -44, -36, -28, -20]) {
      if (x >= 36 && z >= -28) continue;
      b.tubeLamp(x + 2, -0.95, z + 2, true, { color: z < -40 && x > 12 ? 0xcfe4ff : 0xdceeff, intensity: 1.05, range: 11 });
    }
  }
  for (const z of [-50, -34, -22]) b.wallLamp(-11.85, -2.3, z, 'px', { intensity: 0.8, range: 12, color: 0xdceeff });
  for (const x of [0, 16, 32]) b.wallLamp(x, -2.3, -57.85, 'pz', { intensity: 0.8, range: 12, color: 0xdceeff });
  b.ambient('hallHum', [16, -3, -36], 40, 0.4);

  // ---- Geheimgang (Rampe aus dem Hof, dann Tunnel nach B)
  // Rampenfuß und Tunnelmund
  edge(b, 48, 30.2, 58, 30.6, FLOOR);
  frost(b, 53, FLOOR, 34, 8, 8);
  prop(b, 'barrel', 49, FLOOR, 31.4);
  prop(b, 'palletGoods', 56.8, FLOOR, 31.8, { cold: true });
  b.light({ kind: 'lamp', pos: [53, -2.5, 34], color: 0xdbeaff, intensity: 1.0, range: 12 });
  b.light({ kind: 'lamp', pos: [53, -3.5, 40], color: 0xdbeaff, intensity: 0.8, range: 10 });
  tubeRow(b, 53, 28, 53, 8, 5, -0.95, false, { intensity: 1.0, range: 9 });
  tubeRow(b, 54, 3, 46, 3, 3, -0.95, true, { intensity: 1.0, range: 9 });
  tubeRow(b, 48, -2, 48, -48, 7, -0.95, false, { intensity: 1.0, range: 9 });
  b.tubeLamp(45, -0.95, -35, true, { intensity: 1.0, range: 9 });
  b.tubeLamp(45, -0.95, -47, true, { intensity: 1.0, range: 9 });
  b.decor('pipeZ', [51, -1.5, 18], 0, [1.2, 1.2, 24], 0xd8dde2);
  b.decor('pipeZ', [51.7, -1.9, 18], 0, [0.7, 0.7, 24], 0xc0442e);
  b.decor('pipeX', [50, -1.5, 3.6], 0, [12, 1.2, 1.2], 0xd8dde2);
  b.decor('pipeZ', [46.6, -1.5, -18], 0, [1.2, 1.2, 38], 0xd8dde2);
  b.decor('cableTrayZ', [55.3, -1.6, 18], 0, [1, 1, 24]);
  prop(b, 'electricBox', 56 - F, FLOOR, 22, { rot: 1 });
  prop(b, 'electricBox', 46 + F, FLOOR, -12, { rot: 3 });
  prop(b, 'cartons', 54.6, FLOOR, 10, { cold: true });
  prop(b, 'barrel', 47.4, FLOOR, -11);
  // Slalom im Nordtunnel (4 m breit): Regale wechselseitig an der Wand → keine 40-m-Sichtlinie, Deckung für Angreifer
  // Brandschutzwände mit versetzten 2-m-Durchgängen (Streifenvorhang): jede Gerade im Nordtunnel wird irgendwo gesperrt
  // (Durchgänge wechseln die Seite an x = 48) → Knick statt 40-m-Sichtlinie, Ecken zum Peeken für Angreifer
  for (const [z, x0, x1] of [[-10, 48, 50], [-22, 46, 48], [-30, 48, 50]] as const) {
    b.box([x0, FLOOR, z - 0.2], [x1, -0.8, z + 0.2], 'panel', { tint: 0xdde6ec, tag: 'wall' });
    prop(b, 'stripCurtain', x0 === 48 ? 47 : 49, FLOOR, z, { len: 2.0, h: 2.8 });
  }
  prop(b, 'gitterbox', 51.4, FLOOR, 5, { n: 1, rot: 1 });
  b.sign('GEHEIMGANG', [53, -2.2, 29.85], 'nz', 4, 0.9, { color: 0xffd040, sub: 'SERVICE · NUR PERSONAL' });
  b.sign('B ↑', [48, -2.2, -49.85], 'pz', 2.4, 0.8, { color: 0xffb13a, sub: 'RECHENZENTRUM' });
  b.sign('HOF', [49, -2.2, 3.15], 'pz', 2.2, 0.7, { color: 0xffd040, sub: '↓ AUSGANG' });
  b.ambient('ventilation', [51, -3, 14], 14, 0.5);
  b.ambient('drip', [48, -3, -10], 8, 0.5);
}
