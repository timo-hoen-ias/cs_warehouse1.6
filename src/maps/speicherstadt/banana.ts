import { prop } from '../../logic/mapprops';
import { awning, barge, bollard, edge, hoists, ladder, lamp, plate, shop, type B } from './helpers';

// ====================================================================== Banane: Lieferantengasse T-Spawn → B
// Vier gegeneinander versetzte Abschnitte (Mitte x: −52, −58, −64, −70), je 12 m breit.
export function dressBanana(b: B): void {
  // Banane-Anfang (T-Ausgang, x −58..−46)
  prop(b, 'barrelGroup', -56.4, 0, 76, {});
  prop(b, 'crate', -47.4, 0, 61.4, { h: 1.2 });
  prop(b, 'crate', -47.4, 1.2, 61.4, { h: 0.9 });
  prop(b, 'palletGoods', -56.6, 0, 66, { tint: 0xc9ad7c, rot: 1 });
  prop(b, 'palletGoods', -56.6, 0, 67.4, { tint: 0xb8996a, rot: 1 });
  prop(b, 'sacks', -52.6, 0, 80.2, { len: 3.6, n: 3 });
  prop(b, 'gasLamp', -57, 0, 72);
  prop(b, 'gasLamp', -47.2, 0, 60);
  hoists(b, 'px', -58, 60, 80, 0, 1, 7, { len: 1.5 });
  hoists(b, 'px', -58, 62, 78, 0, 2, 7, { len: 1.5, first: 3, load: 2 });
  plate(b, 'BANANE', -57.7, 3.0, 70, 'px', 'LIEFERANTENGASSE', 3.4);
  edge(b, -46.4, 66, -46, 78, 0);

  // Banane (x −64..−52): Baumstämme, Sandsack-Barrikade, Paletten
  prop(b, 'logs', -62.9, 0, 52, { len: 3.2, n: 3, rot: 1 });
  prop(b, 'logs', -62.9, 0, 48.2, { len: 3.2, n: 2, rot: 1 });
  prop(b, 'logs', -62.9, 0, 40, { len: 3.2, n: 3, rot: 1 });
  prop(b, 'sacks', -55.4, 0, 46, { len: 5, n: 4 });
  prop(b, 'palletStack', -53.4, 0, 55, { n: 6 });
  prop(b, 'palletGoods', -53.4, 0, 53.3, { tint: 0xd2b88a, rot: 1 });
  prop(b, 'crateStack', -60.4, 0, 38.8);
  prop(b, 'gasLamp', -52.6, 0, 58.4);
  prop(b, 'gasLamp', -63.4, 0, 44);
  hoists(b, 'px', -64, 38, 58, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', -52, 36, 56, 0, 1, 6, { len: 1.5, first: 2 });
  hoists(b, 'nx', -52, 38, 54, 0, 2, 6, { len: 1.5, first: 1, load: 1 });
  hoists(b, 'px', -64, 40, 56, 0, 2, 6, { len: 1.5, first: 2, load: 2 });
  plate(b, 'BANANE', -51.7, 3.0, 45, 'nx', undefined, 2.6);
  ladder(b, 'nx', -52, 40, 0, 3.4);
  awning(b, 'px', -64, 44, 52, 2.6, [0x2f5a3a, 0xe8dcc0]);

  // Lieferwagen („Auto“, x −70..−58): halb versperrte Lieferantengasse
  prop(b, 'van', -67.4, 0, 26, { rot: 0, tint: 0xe4dfcf });
  prop(b, 'palletGoods', -68.4, 0, 20, { tint: 0xc9ad7c, rot: 1 });
  prop(b, 'palletGoods', -68.4, 0, 21.4, { tint: 0xd2b88a, rot: 1 });
  prop(b, 'crate', -59.6, 0, 28, { h: 1.2 });
  prop(b, 'crate', -60.9, 0, 28.4, { h: 1.0 });
  prop(b, 'sacks', -68.6, 0, 32, { len: 2.7, n: 3, rot: 1 });
  prop(b, 'barrelGroup', -59.4, 0, 17, {});
  prop(b, 'handTruck', -68.4, 0, 16.4, { rot: 3 });
  prop(b, 'gasLamp', -69.2, 0, 36);
  prop(b, 'gasLamp', -58.8, 0, 15.6);
  hoists(b, 'px', -70, 16, 36, 0, 1, 6, { len: 1.5 });
  hoists(b, 'px', -70, 18, 34, 0, 2, 6, { len: 1.5, first: 1, load: 2 });
  hoists(b, 'nx', -58, 16, 34, 0, 1, 6, { len: 1.5, first: 1 });
  shop(b, 'WEINHANDEL KRÜGER', -57.68, 4.0, 24, 'nx', 'SPIRITUOSEN · LIEFERUNG', 4.4);
  plate(b, 'LIEFERWAGEN', -69.7, 3.0, 25, 'px', undefined, 3.4);

  // Banane-Brücke über das Fleet (x −76..−64)
  prop(b, 'gasLamp', -74.8, 0, -3.5);
  prop(b, 'gasLamp', -65.2, 0, -3.5);
  prop(b, 'gasLamp', -74.8, 0, 3.5);
  prop(b, 'gasLamp', -65.2, 0, 3.5);
  barge(b, -82, -1.0, 0, 6, 3.2, { cabin: true, hull: 0x24323a, alongZ: true });
  barge(b, -51, -1.0, 0, 12, 3.4, { cabin: true, cargo: true, hull: 0x4a2c22 });
  for (const x of [-77, -62.6]) for (const z of [-3.4, 3.4]) bollard(b, x, 1.7, z);
  plate(b, 'BRÜCKE', -63.7, 2.2, 8, 'nx', 'FLEET', 2.4);
  prop(b, 'sacks', -70, 0, 11.4, { len: 3.6, n: 3 });
  prop(b, 'barrelGroup', -65.4, 0, 14, {});
  hoists(b, 'px', -76, 6, 14, 0, 1, 4, { len: 1.5 });
  hoists(b, 'nx', -64, 6, 14, 0, 1, 4, { len: 1.5 });

  // Banane → B (B-Eingang)
  prop(b, 'sacks', -70, 0, -12, { len: 4.5, n: 4 });
  prop(b, 'palletStack', -74.6, 0, -18, { n: 6 });
  prop(b, 'crate', -65.4, 0, -10, { h: 1.2 });
  prop(b, 'gasLamp', -65, 0, -28.6);
  prop(b, 'gasLamp', -75, 0, -14.8);
  hoists(b, 'px', -76, -20, -6, 0, 1, 6, { len: 1.5 });
  hoists(b, 'nx', -64, -28, -6, 0, 1, 6, { len: 1.5 });
  plate(b, 'B-EINGANG', -75.7, 3.0, -17, 'px', undefined, 3.0);
  plate(b, 'DUNKEL', -75.7, 4.4, -24, 'px', 'ZUM LAGER', 2.4);
  lamp(b, -63.7, 4.2, -20, 'nx');
}
