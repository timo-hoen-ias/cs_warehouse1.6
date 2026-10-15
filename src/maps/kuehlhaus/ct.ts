import { prop } from '../../logic/mapprops';
import { F, edge, frost, hangSign, line, type B } from './helpers';
import { lampGrid, tubeRow } from './lights';

// ====================================================================== CT-Bereich: Warenausgang, Kontrollraum, Kellertreppe
export function dressCT(b: B): void {
  // ---- CT-Halle (x 4…34, z −86…−62): Spinde, Rolltore, Schreibtische, Paletten
  line(b, 'locker', 6, 0, -85.55, 14, 0, -85.55, 9, { rot: 0 });
  line(b, 'locker', 22, 0, -85.55, 30, 0, -85.55, 9, { rot: 0 });
  for (const x of [17.5]) prop(b, 'rollerDoor', x, 0, -86 + F, { rot: 0, len: 4, h: 4.2 });
  prop(b, 'desk', 12, 0, -67, { rot: 0 });
  prop(b, 'desk', 14, 0, -67, { rot: 0 });
  prop(b, 'desk', 24, 0, -67, { rot: 0 });
  prop(b, 'palletGoods', 28, 0, -71, { cold: true });
  prop(b, 'palletGoods', 28, 0, -72.2, { cold: true });
  prop(b, 'palletStack', 6.6, 0, -66.6, { n: 5 });
  prop(b, 'gitterbox', 31.8, 0, -66, { n: 2, rot: 1 });
  prop(b, 'rollCage', 6.8, 0, -77.5, { h: 1.1, cold: true });
  prop(b, 'rollCage', 6.8, 0, -76.6, { h: 0.9, cold: true });
  prop(b, 'cartons', 33, 0, -78, { cold: true });
  prop(b, 'handTruck', 18, 0, -72, { rot: 0 });
  prop(b, 'forklift', 31, 0, -83, { rot: 2, tint: 0x2f78c0 });
  for (const [x, z] of [[10, -74], [22, -74]] as const) b.box([x - 0.3, 0, z - 0.3], [x + 0.3, 7.3, z + 0.3], 'steel', { tint: 0x2f78c0, tag: 'pillar' });
  // Pausenecke und Besprechungstisch: die Verwaltung wohnt hier
  prop(b, 'desk', 30.4, 0, -76.4, { rot: 1 });
  prop(b, 'desk', 30.4, 0, -77.6, { rot: 1 });
  b.box([32.4, 0, -73.4], [33.6, 1.9, -72.6], 'metal', { tint: 0xd8e4ea }); // Getränkeautomat
  b.box([32.5, 1.0, -72.58], [33.5, 1.7, -72.56], 'emissive', { collide: 'none', tint: 0x7fc0ff, noNav: true, occlude: false });
  b.sign('PAUSE', [33, 2.4, -72.5], 'pz', 1.6, 0.5, { color: 0xffd040, sub: 'HEISSE SCHOKOLADE' });
  b.decor('extinguisher', [4.3, 1.2, -62.4], 0);
  for (const [x, z] of [[14, -83], [26, -83]] as const) prop(b, 'cartons', x, 0, z, { cold: true });
  b.decal({ kind: 'line', pos: [19, 0.02, -74], size: [30, 0.15], color: 0x7fc0ff });
  b.decal({ kind: 'letter', pos: [19, 0.02, -78], size: [3.2, 3.2], text: 'CT', color: 0x8fc0ff });
  b.decal({ kind: 'stripes', pos: [11, 0.02, -62.6], size: [6, 1] });
  frost(b, 18, 0, -80, 12, 8);
  lampGrid(b, 8, -82, 30, -66, 3, 2, 6.2, { intensity: 1.35, range: 15 });
  b.light({ kind: 'window', pos: [18, 4, -85], color: 0xdbe8ff, intensity: 0.8, range: 14 });
  hangSign(b, 'CT-BEREICH', 19, 5.0, -70, 0x8fc0ff, 'WARENAUSGANG · VERWALTUNG', 5);
  b.sign('HALLE A', [11, 4.6, -61.85], 'nz', 3.4, 0.8, { color: 0xffd040, sub: '↓ MITTELTÜR' });
  b.sign('MINI', [30, 4.6, -61.85], 'nz', 2.6, 0.8, { color: 0xff7a5a, sub: '↓ HALLE A · SERVER' });
  b.sign('HALLE A', [11, 4.8, -58.15], 'pz', 3.4, 0.8, { color: 0x8fc0ff, sub: '↑ CT-BEREICH' });
  b.ambient('radio', [8, 1.5, -66], 12, 0.4);
  b.ambient('hallHum', [18, 4, -74], 30, 0.4);

  // ---- Kontrollraum (x −12…2, z −86…−62) mit Kellertreppe (x −8…0, z −76…−64)
  line(b, 'desk', -10.4, 0, -84.4, -4, 0, -84.4, 3, { rot: 0 });
  line(b, 'serverRack', -2, 0, -85, 0.4, 0, -85, 2, { rot: 0 });
  b.box([-11.6, 1.2, -85.9], [-5.6, 3.4, -85.8], 'emissive', { collide: 'none', tint: 0x4a8fd0, noNav: true, occlude: false });
  b.box([-4.6, 1.2, -85.9], [1.2, 3.4, -85.8], 'emissive', { collide: 'none', tint: 0x3ab08a, noNav: true, occlude: false });
  for (const x of [-9.2, -6.8]) b.box([x - 0.25, 0.76, -84.7], [x + 0.25, 1.1, -84.62], 'emissive', { collide: 'none', tint: 0x6fb0ff, noNav: true, occlude: false });
  prop(b, 'locker', -11.55, 0, -72, { rot: 3 });
  prop(b, 'locker', -11.55, 0, -71, { rot: 3 });
  prop(b, 'cartons', -10.4, 0, -66.4, { cold: true });
  b.rail(-8.05, -76, -8.05, -64, 0);
  b.rail(0.05, -76, 0.05, -64, 0);
  b.rail(-8, -63.95, 0, -63.95, 0);
  edge(b, -8, -76.4, 0, -76, 0);
  tubeRow(b, -9, -80, 0, -80, 3, 4.25, true, { intensity: 1.0, range: 11 });
  tubeRow(b, -9, -68, 0, -68, 3, 4.25, true, { intensity: 1.0, range: 11 });
  b.light({ kind: 'lamp', pos: [-4, -2.6, -70], color: 0xcfe4ff, intensity: 1.0, range: 12 });
  b.light({ kind: 'lamp', pos: [-4, -4.2, -66], color: 0xcfe4ff, intensity: 0.8, range: 10 });
  b.sign('KONTROLLRAUM', [-4, 3.8, -85.75], 'pz', 5, 0.9, { color: 0x7fe0a0, sub: 'LEITSTAND KÄLTETECHNIK' });
  hangSign(b, 'KELLER ▼', -4, 3.3, -76.6, 0x7fc0ff, 'B · DATENRAUM', 3.4);
  b.sign('TREPPE', [-8.2, 1.6, -70], 'nx', 3, 0.7, { color: 0xffd040, sub: '↓ −5 m' });
  b.ambient('buzz', [-4, 2, -84], 10, 0.4);
  b.ambient('ventilation', [-4, -2, -70], 12, 0.5);
}
