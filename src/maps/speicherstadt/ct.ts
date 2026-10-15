import { prop } from '../../logic/mapprops';
import { F, awning, bollard, chain, edge, hoists, plate, shop, type B } from './helpers';

// ====================================================================== CT-Spawn: Zollhof (+1.6 m)
export function dressCT(b: B): void {
  const Y = 1.6;
  prop(b, 'van', -14, Y, -86, { rot: 0, tint: 0x3a5a7a });
  prop(b, 'container', 13.8, Y, -86, { rot: 1, tint: 0x8a3a2a });
  prop(b, 'sacks', -6, Y, -88.8, { len: 3.6, n: 3 });
  prop(b, 'palletStack', 6, Y, -88.8, { n: 6 });
  prop(b, 'palletGoods', 8, Y, -88.8, { tint: 0xc9ad7c });
  prop(b, 'barrelGroup', 12.4, Y, -73, {});
  prop(b, 'crate', -13.4, Y, -72.4, { h: 1.2 });
  prop(b, 'crate', -12.1, Y, -72.4, { h: 1.2 });
  prop(b, 'handTruck', 0, Y, -74.6, { rot: 0 });
  for (const [x, z] of [[-14.6, -89.2], [14.6, -89.2], [-14.6, -70.8], [14.6, -70.8]] as const) prop(b, 'gasLamp', x, Y, z);
  // Zollschranke an der Rampe (nur Optik)
  b.box([-6.2, Y, -70.7], [-5.8, Y + 1.0, -70.3], 'metal', { collide: 'none', tint: 0xd8d8d8, noNav: true, occlude: false });
  chain(b, -5.8, -70.5, 5.8, -70.5, Y);
  bollard(b, -6, Y, -70.4);
  bollard(b, 6, Y, -70.4);
  hoists(b, 'pz', -90, -16, 16, Y, 1, 7, { len: 1.5 });
  hoists(b, 'pz', -90, -14, 14, Y, 2, 7, { len: 1.5, first: 3, load: 2 });
  hoists(b, 'nx', 16, -90, -86, Y, 1, 5, { len: 1.5 });
  shop(b, 'ZOLLHOF', 0, Y + 3.9, -90 + F, 'pz', 'HAFENZOLLAMT · CT-SPAWN', 4.6);
  plate(b, 'CT-RAMPE', -5.7, Y + 1.2, -66, 'px', undefined, 2.4);
  plate(b, 'OBERE MITTE', 5.7, Y + 1.2, -66, 'nx', 'AB HIER FREI', 3.2);
  edge(b, -6, -70.2, 6, -70, Y);
  awning(b, 'pz', -90, -4, 4, Y + 2.8, [0x2f4a6a, 0xe8dcc0]);
}
