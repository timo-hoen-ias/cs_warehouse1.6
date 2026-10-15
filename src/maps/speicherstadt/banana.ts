import { prop } from '../../logic/mapprops';
import { F, awning, barge, bollard, edge, hoists, ladder, lamp, plate, shop, type B } from './helpers';

// ====================================================================== Banane: Lieferantengasse T-Spawn → B
export function dressBanana(b: B): void {
  // Banane-Anfang (T-Ausgang)
  prop(b, 'barrelGroup', -58.4, 0, 76, {});
  prop(b, 'crate', -49, 0, 61.6, { h: 1.2 });
  prop(b, 'crate', -49, 1.2, 61.6, { h: 0.9 });
  prop(b, 'palletGoods', -58.6, 0, 66, { tint: 0xc9ad7c, rot: 1 });
  prop(b, 'palletGoods', -58.6, 0, 67.4, { tint: 0xb8996a, rot: 1 });
  prop(b, 'sacks', -55, 0, 80.2, { len: 3.6, n: 3 });
  prop(b, 'gasLamp', -59, 0, 72);
  prop(b, 'gasLamp', -47, 0, 60);
  hoists(b, 'px', -60, 60, 80, 0, 1, 7, { len: 1.5 });
  hoists(b, 'px', -60, 62, 78, 0, 2, 7, { len: 1.5, first: 3, load: 2 });
  plate(b, 'BANANE', -59.7, 3.0, 70, 'px', 'LIEFERANTENGASSE', 3.4);
  edge(b, -46.4, 66, -46, 78, 0);

  // Banane (lang, gekrümmt): Baumstämme, Sandsack-Barrikade, Paletten
  prop(b, 'logs', -64.7, 0, 52, { len: 3.2, n: 3, rot: 1 });
  prop(b, 'logs', -64.7, 0, 48.2, { len: 3.2, n: 2, rot: 1 });
  prop(b, 'logs', -64.4, 0, 36, { len: 3.2, n: 3, rot: 1 });
  prop(b, 'sacks', -58, 0, 42, { len: 5, n: 4 });
  prop(b, 'palletStack', -53.6, 0, 52.6, { n: 6 });
  prop(b, 'palletGoods', -53.6, 0, 50.9, { tint: 0xd2b88a, rot: 1 });
  prop(b, 'crateStack', -62, 0, 32);
  prop(b, 'gasLamp', -52.6, 0, 56);
  prop(b, 'gasLamp', -65.4, 0, 40);
  hoists(b, 'px', -66, 32, 56, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', -52, 32, 56, 0, 1, 6, { len: 1.5, first: 2 });
  hoists(b, 'nx', -52, 34, 54, 0, 2, 6, { len: 1.5, first: 1, load: 1 });
  hoists(b, 'px', -66, 34, 54, 0, 2, 6, { len: 1.5, first: 2, load: 2 });
  plate(b, 'BANANE', -51.7, 3.0, 45, 'nx', undefined, 2.6);
  ladder(b, 'nx', -52, 38, 0, 3.4);
  awning(b, 'px', -66, 38, 46, 3.2, [0x2f5a3a, 0xe8dcc0]);

  // Lieferwagen („Auto“): halb versperrte Lieferantengasse
  prop(b, 'van', -62, 0, 18, { rot: 0, tint: 0xe4dfcf });
  prop(b, 'palletGoods', -66.4, 0, 14, { tint: 0xc9ad7c, rot: 1 });
  prop(b, 'palletGoods', -66.4, 0, 15.4, { tint: 0xd2b88a, rot: 1 });
  prop(b, 'crate', -57.6, 0, 20, { h: 1.2 });
  prop(b, 'crate', -58.9, 0, 20.3, { h: 1.0 });
  prop(b, 'sacks', -66.2, 0, 24.4, { len: 2.7, n: 3, rot: 1 });
  prop(b, 'barrelGroup', -55.4, 0, 9, {});
  prop(b, 'handTruck', -66.2, 0, 9, { rot: 3 });
  prop(b, 'gasLamp', -69.2, 0, 28.4);
  prop(b, 'gasLamp', -54.6, 0, 8);
  hoists(b, 'px', -70, 8, 28, 0, 1, 6, { len: 1.5 });
  hoists(b, 'px', -70, 10, 26, 0, 2, 6, { len: 1.5, first: 1, load: 2 });
  hoists(b, 'nx', -54, 8, 28, 0, 1, 6, { len: 1.5, first: 1 });
  shop(b, 'WEINHANDEL KRÜGER', -53.68, 4.0, 19, 'nx', 'SPIRITUOSEN · LIEFERUNG', 4.4);
  plate(b, 'LIEFERWAGEN', -69.7, 3.0, 17, 'px', undefined, 3.4);

  // Banane-Brücke über das Fleet
  prop(b, 'gasLamp', -61.3, 0, -3.5);
  prop(b, 'gasLamp', -52.7, 0, -3.5);
  prop(b, 'gasLamp', -61.3, 0, 3.5);
  prop(b, 'gasLamp', -52.7, 0, 3.5);
  barge(b, -75, -1.0, 0, 13, 3.6, { cabin: true, cargo: true, hull: 0x24323a });
  barge(b, -45.2, -1.0, 0, 7, 3.0, { cargo: true, hull: 0x4a2c22 });
  for (const x of [-64.4, -49.6]) for (const z of [-3.4, 3.4]) bollard(b, x, 1.2, z);
  plate(b, 'BRÜCKE', -63.7, 2.2, 0, 'px', 'FLEET', 2.4);
  prop(b, 'sacks', -56.6, 0, -9, { len: 3.6, n: 3 });
  hoists(b, 'px', -64, -14, -6, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', -50, -14, -6, 0, 1, 6, { len: 1.5 });

  // Banane → B (B-Eingang)
  prop(b, 'sacks', -51, 0, -22, { len: 4.5, n: 4 });
  prop(b, 'palletStack', -56.8, 0, -17, { n: 6 });
  prop(b, 'barrelGroup', -45.2, 0, -16.6, {});
  prop(b, 'crate', -56.8, 0, -26, { h: 1.2 });
  prop(b, 'gasLamp', -45, 0, -28);
  prop(b, 'gasLamp', -57, 0, -14.8);
  hoists(b, 'px', -58, -30, -16, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', -44, -30, -16, 0, 1, 6, { len: 1.5 });
  plate(b, 'B-EINGANG', -57.7, 3.0, -23, 'px', undefined, 3.0);
  lamp(b, -43.7, 4.2, -22, 'nx');
}
