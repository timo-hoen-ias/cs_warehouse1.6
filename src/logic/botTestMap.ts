import { MapBuilder, type MapData } from './mapkit';

/**
 * Kleine synthetische Testkarte für Bot-Tests (nur Tests importieren sie):
 *
 *   z 0..10   CT-Spawn (ganze Breite), Wand bei z=10 mit drei Durchgängen
 *   z 10..25  Spot A (x 0..20) | Tür A | Halle (x 25..55) | Tür B | Spot B (x 60..80)
 *   z 25..70  Lang (x 0..6)  ·  Mitte (x 37..43)  ·  B-Gang (x 74..80), dazwischen Gebäudeblöcke
 *   z 70..80  T-Spawn (ganze Breite)
 *
 * T erreichen A über Lang oder Mitte → Halle → Tür A, B über B-Gang oder Mitte → Halle → Tür B.
 */
export const BOT_TEST_ENV = { sunDir: [0.3, 0.8, 0.2] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };

export function buildBotTestMap(opts: { areas?: boolean; hints?: boolean } = {}): MapData {
  const b = new MapBuilder({ id: 'de_bottest', name: 'Bot-Test', description: '', bounds: { min: [-1, -1, -1], max: [81, 10, 81] }, env: BOT_TEST_ENV });
  b.floor(0, 0, 80, 80, 0, 'concrete');
  b.wallX(0, 80, 0, 0, 6, 'brick');
  b.wallX(0, 80, 80, 0, 6, 'brick');
  b.wallZ(0, 80, 0, 0, 6, 'brick');
  b.wallZ(0, 80, 80, 0, 6, 'brick');
  // Wand zwischen CT-Spawn und Spots/Halle mit drei Durchgängen
  b.wallX(0, 80, 10, 0, 6, 'brick', [
    { from: 8, to: 14, bottom: 0, top: 3 },
    { from: 36, to: 44, bottom: 0, top: 3 },
    { from: 66, to: 72, bottom: 0, top: 3 },
  ]);
  // Gebäudeblöcke zwischen den Gängen
  b.block(6, 25, 37, 70, 0, 6, 'concrete', { tag: 'building' });
  b.block(43, 25, 74, 70, 0, 6, 'concrete', { tag: 'building' });
  // Trennwände mit Türen (z 14..19)
  b.block(20, 10.2, 25, 14, 0, 6, 'concrete', { tag: 'building' });
  b.block(20, 19, 25, 25, 0, 6, 'concrete', { tag: 'building' });
  b.block(55, 10.2, 60, 14, 0, 6, 'concrete', { tag: 'building' });
  b.block(55, 19, 60, 25, 0, 6, 'concrete', { tag: 'building' });
  // Deckung
  b.box([7, 0, 15], [9, 1.3, 17], 'crate');
  b.box([13, 0, 21], [15, 1.3, 23], 'crate');
  b.box([4, 0, 12], [6, 1.3, 13.5], 'crate');
  b.box([65, 0, 15], [67, 1.3, 17], 'crate');
  b.box([73, 0, 21], [75, 1.3, 23], 'crate');
  b.box([38, 0, 16], [41, 1.3, 18], 'crate');
  b.box([2, 0, 45], [4, 1.3, 47], 'crate');
  b.box([76, 0, 45], [78, 1.3, 47], 'crate');
  if (opts.areas !== false) {
    b.area('T-Spawn', 0, 70, 80, 80);
    b.area('Lang', 0, 25, 6, 70);
    b.area('Mitte', 37, 25, 43, 70);
    b.area('B-Gang', 74, 25, 80, 70);
    b.area('Spot A', 0, 10, 20, 25);
    b.area('Tür A', 20, 10, 25, 25);
    b.area('Halle', 25, 10, 55, 25);
    b.area('Tür B', 55, 10, 60, 25);
    b.area('Spot B', 60, 10, 80, 25);
    b.area('CT-Spawn', 0, 0, 80, 10);
  }
  b.site('A', 'Spot A', [1, -1, 11], [19, 4, 24], [10, 0, 20]);
  b.site('B', 'Spot B', [61, -1, 11], [79, 4, 24], [70, 0, 20]);
  b.spawnGrid('T', 40, 0, 75, 5, 2, 2, 0);
  b.spawnGrid('CT', 40, 0, 5, 5, 2, 2, Math.PI);
  b.buy('T', 0, 70, 80, 80);
  b.buy('CT', 0, 0, 80, 10);
  if (opts.hints) {
    b.botHint({ kind: 'hold', pos: [16.5, 0, 12.5], team: 'CT', site: 'A' });
    b.botHint({ kind: 'plant', pos: [12.5, 0, 18.5], site: 'A' });
  }
  return b.data;
}
