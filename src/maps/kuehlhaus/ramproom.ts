import { prop } from '../../logic/mapprops';
import { edge, frost, hangSign, line, type B } from './helpers';
import { tubeRow } from './lights';

// ====================================================================== Rampenraum (Lobby → Keller)
export function dressRampRoom(b: B): void {
  // Landung oben (x −28…−18, z 8…16)
  prop(b, 'gitterbox', -26.6, 0, 14, { n: 2 });
  prop(b, 'palletGoods', -26.6, 0, 12, { cold: true });
  line(b, 'cones', -20, 0, 9.2, -19, 0, 9.2, 2, { rot: 0 });
  edge(b, -28, 7.6, -18, 8, 0);
  hangSign(b, 'RAMPE ▼ KELLER', -23, 3.1, 9, 0x7fc0ff, 'DATENRAUM B · NUR MIT FREIGABE', 5);
  tubeRow(b, -25, 11, -20, 11, 2, 3.95, true, { intensity: 1.0, range: 10 });
  b.wallLamp(-27.85, 2.8, 12, 'px', { intensity: 0.9, range: 12, color: 0xdceeff });
  // Rampe: Wandlampen, Kältemittelleitungen entlang der Decke
  for (const z of [4, -2]) {
    b.wallLamp(-27.85, z === 4 ? 1.0 : -3.0, z, 'px', { intensity: 0.9, range: 12, color: 0xdceeff });
    b.wallLamp(-18.15, z === 4 ? 1.0 : -3.0, z, 'nx', { intensity: 0.9, range: 12, color: 0xdceeff });
  }
  b.decor('pipeZ', [-27.2, 3.4, 1], 0, [1.2, 1.2, 16], 0xd8dde2);
  b.decor('pipeZ', [-26.5, 3.1, 1], 0, [0.7, 0.7, 16], 0xc0442e);
  b.decor('cableTrayZ', [-19, 3.6, 1], 0, [1, 1, 16]);
  b.decal({ kind: 'arrow', pos: [-23, 0.02, 12], size: [2.4, 3], rot: Math.PI, color: 0xe8e8e8 });
  b.light({ kind: 'lamp', pos: [-23, -3.6, -3.4], color: 0xcfe4ff, intensity: 1.0, range: 12 });
  b.light({ kind: 'lamp', pos: [-23, -1.4, 3], color: 0xcfe4ff, intensity: 0.9, range: 12 });
  // untere Landung (z −6…−1) und Gang
  prop(b, 'palletGoods', -26.6, -5, -4, { cold: true });
  prop(b, 'barrel', -19.2, -5, -4.4);
  frost(b, -23, -5, -3.6, 8, 4);
  b.sign('KELLER', [-23, -2.0, -6.15], 'pz', 4, 0.8, { color: 0x7fc0ff, sub: 'B ↑ DATENRAUM' });
  tubeRow(b, -23, -8, -23, -18, 3, -0.95, false, { intensity: 1.0, range: 9 });
  tubeRow(b, -19, -17, -13, -17, 2, -0.95, true, { intensity: 1.0, range: 9 });
  b.decor('pipeZ', [-25.2, -1.5, -12], 0, [0.8, 0.8, 12], 0xd8dde2);
  prop(b, 'cableTray', -21, -1.5, -17, { len: 8 });
  edge(b, -26, -6, -20, -5.6, -5);
  b.ambient('compressor', [-23, -3, -10], 14, 0.5);
  b.ambient('ventilation', [-23, 0, 6], 12, 0.5);
}
