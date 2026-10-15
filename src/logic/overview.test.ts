import { describe, expect, it } from 'vitest';
import { brushInBand, heightColor, overviewBrushes, radarBand, radarFloorColor, radarNeedsBands, renderOverview, rimLight, stackedCells } from './overview';
import type { Brush, MapData } from './mapkit';

const map: MapData = {
  id: 'de_o', name: 'O', description: '', bounds: { min: [0, -2, 0], max: [20, 10, 10] },
  brushes: [
    { min: [0, -1, 0], max: [20, 0, 10], mat: 'concrete' },
    { min: [8, 0, 0], max: [8.4, 4, 10], mat: 'brick', tag: 'wall' },
    { min: [0, 6, 0], max: [20, 6.4, 10], mat: 'roof', tag: 'roof' },
    { min: [12, 0, 2], max: [16, 2, 4], mat: 'concrete', ramp: 'px' },
  ],
  decor: [], decals: [], signs: [], lights: [], areas: [{ name: 'Mitte', min: [0, -5, 0], max: [8, 5, 10] }],
  sites: [{ id: 'A', name: 'A', min: [1, -1, 1], max: [5, 3, 5], plant: [3, 0, 3] }],
  spawns: [{ team: 'T', pos: [18, 0, 8], yaw: 0 }], buyZones: [], acoustics: { zones: [], emitters: [] },
  env: { sunDir: [0, 1, 0], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0, skyHorizon: 0, skyIntensity: 0, ambient: 0, fogColor: 0, fogNear: 1, fogFar: 2 },
};

describe('Übersicht', () => {
  it('Rastergröße aus Kartengrenzen und Auflösung', () => {
    const r = renderOverview(map, { pxPerM: 4 });
    expect(r.w).toBe(80);
    expect(r.h).toBe(40);
    expect(r.data.length).toBe(80 * 40 * 4);
  });

  it('Dächer erscheinen nicht, Wände dunkel, Boden nach Höhe gefärbt', () => {
    expect(overviewBrushes(map).some((b) => b.tag === 'roof')).toBe(false);
    const r = renderOverview(map, { pxPerM: 4 });
    const px = (x: number, z: number) => {
      const i = (Math.floor(z * 4) * r.w + Math.floor(x * 4)) * 4;
      return Array.from(r.data.slice(i, i + 3));
    };
    const wall = px(8.2, 7);
    expect(Math.max(...wall)).toBeLessThan(40);
    const ground = px(10.5, 8);
    const c = heightColor(0);
    expect(Math.abs(ground[1]! - c[1])).toBeLessThan(40);
  });

  it('Höhenfarben unterscheiden Ebenen', () => {
    expect(heightColor(-3)).not.toEqual(heightColor(0));
    expect(heightColor(4)[0]).toBeGreaterThan(heightColor(0)[0]);
    expect(heightColor(100)).toEqual(heightColor(8));
  });

  it('Radar-Stil: transparenter Hintergrund außerhalb der Brushes', () => {
    const empty: MapData = { ...map, brushes: [], sites: [] };
    const r = renderOverview(empty, { pxPerM: 2, radar: true });
    expect(r.data[3]).toBe(0);
    const r2 = renderOverview(empty, { pxPerM: 2, labels: true });
    expect(r2.data[3]).toBe(255);
  });
});

/** Zwei Ebenen übereinander (Keller −5 / Erdgeschoss 0) im selben Grundriss. */
const stacked: MapData = {
  ...map,
  bounds: { min: [0, -8, 0], max: [20, 10, 10] },
  brushes: [
    { min: [0, -5.4, 0], max: [20, -5, 10], mat: 'concrete', tag: 'floor' }, // Kellerboden
    { min: [0, -5, 4], max: [20, -0.4, 4.4], mat: 'brick', tag: 'wall' }, // Kellerwand
    { min: [0, -0.4, 0], max: [20, 0, 10], mat: 'concrete', tag: 'floor' }, // Erdgeschossboden (Kellerdecke)
    { min: [0, 0, 7], max: [20, 4, 7.4], mat: 'brick', tag: 'wall' }, // Wand im Erdgeschoss
  ],
  sites: [
    { id: 'A', name: 'A', min: [2, -0.4, 1], max: [8, 3, 6], plant: [5, 0, 3] },
    { id: 'B', name: 'B', min: [2, -5.4, 1], max: [8, -1, 6], plant: [5, -5, 3] },
  ],
  areas: [],
};

const brush = (min: [number, number, number], max: [number, number, number], extra: Partial<Brush> = {}): Brush => ({ min, max, mat: 'concrete', ...extra });

describe('Radar: Höhenband', () => {
  it('Band-Schlüssel rundet auf 1.5 m (kein −0)', () => {
    expect(radarBand(0.3)).toBe(0);
    expect(radarBand(-0.2)).toBe(0);
    expect(Object.is(radarBand(-0.2), -0)).toBe(false);
    expect(radarBand(4.4)).toBe(4.5);
    expect(radarBand(-5.1)).toBe(-4.5);
    expect(radarBand(0.8)).toBe(1.5);
  });

  it('Standfläche gehört zur Ebene, Boden darüber/darunter nicht', () => {
    const floor0 = brush([0, -0.4, 0], [10, 0, 10]);
    const floorUp = brush([0, 4.5, 0], [10, 4.8, 10]);
    const floorDown = brush([0, -5.4, 0], [10, -5, 10]);
    expect(brushInBand(floor0, 0)).toBe(true);
    expect(brushInBand(floorUp, 0)).toBe(false);
    expect(brushInBand(floorDown, 0)).toBe(false);
    expect(brushInBand(floorUp, 4.5)).toBe(true);
    expect(brushInBand(floor0, 4.5)).toBe(false);
  });

  it('niedrige Deckung (Kiste) zählt, hohes Hindernis auf dieser Ebene (Container) auch', () => {
    expect(brushInBand(brush([0, 0, 0], [1, 1.2, 1]), 0)).toBe(true);
    expect(brushInBand(brush([0, 0, 0], [6, 2.6, 2.4]), 0)).toBe(true);
    // derselbe Container steht für einen Spieler eine Ebene höher nicht im Weg
    expect(brushInBand(brush([0, 0, 0], [6, 2.6, 2.4]), 5)).toBe(false);
  });

  it('Wände zählen nur in Körperhöhe der Ebene (Kellerwand nicht im Erdgeschoss)', () => {
    const cellarWall = brush([0, -5, 4], [20, -0.4, 4.4]);
    const groundWall = brush([0, 0, 7], [20, 4, 7.4]);
    expect(brushInBand(cellarWall, -5)).toBe(true);
    expect(brushInBand(cellarWall, 0)).toBe(false);
    expect(brushInBand(groundWall, 0)).toBe(true);
    expect(brushInBand(groundWall, -5)).toBe(false);
    // Wand über mehrere Ebenen zählt auf allen
    expect(brushInBand(brush([0, -5, 0], [0.4, 8, 10]), 0)).toBe(true);
    expect(brushInBand(brush([0, -5, 0], [0.4, 8, 10]), -5)).toBe(true);
  });

  it('Rampen zählen, wenn die Spielerhöhe in ihrer Spanne liegt', () => {
    const ramp = brush([0, 0, 0], [8, 5, 3], { ramp: 'px' });
    expect(brushInBand(ramp, 0)).toBe(true);
    expect(brushInBand(ramp, 2.5)).toBe(true);
    expect(brushInBand(ramp, 5)).toBe(true);
    expect(brushInBand(ramp, 9)).toBe(false);
    expect(brushInBand(ramp, -5)).toBe(false);
  });

  const px = (r: ReturnType<typeof renderOverview>, x: number, z: number): number[] => {
    const i = (Math.floor(z * 2) * r.w + Math.floor(x * 2)) * 4;
    return Array.from(r.data.slice(i, i + 4));
  };

  it('Raster je Ebene: eigene Ebene voll, andere nur als blasse Silhouette', () => {
    const cellar = renderOverview(stacked, { pxPerM: 2, radar: true, bandY: -5 });
    const ground = renderOverview(stacked, { pxPerM: 2, radar: true, bandY: 0 });
    // Kellerboden bei (15, 2): im Keller voll deckend, im Erdgeschoss nur blass (Alpha ≈ 20 %)
    expect(px(cellar, 15, 2)[3]).toBe(255);
    expect(px(ground, 15, 2)[3]).toBe(255); // dort liegt der Erdgeschossboden
    // Kellerwand (z = 4.2) nur im Keller dunkel
    expect(Math.max(...px(cellar, 12, 4.2).slice(0, 3))).toBeLessThan(30);
    expect(Math.max(...px(ground, 12, 4.2).slice(0, 3))).toBeGreaterThan(50);
    // Erdgeschosswand (z = 7.2) nur im Erdgeschoss dunkel; im Keller liegt dort der blasse Kellerboden
    expect(Math.max(...px(ground, 12, 7.2).slice(0, 3))).toBeLessThan(30);
    expect(px(cellar, 12, 7.2)[3]).toBe(255);
  });

  it('andere Ebenen erscheinen blass, wo die eigene Ebene leer ist', () => {
    const upper: MapData = { ...stacked, brushes: [brush([0, -5.4, 0], [10, -5, 10], { tag: 'floor' })], sites: [] };
    const r = renderOverview(upper, { pxPerM: 2, radar: true, bandY: 4.5 });
    const a = px(r, 5, 5)[3]!;
    expect(a).toBeGreaterThan(30);
    expect(a).toBeLessThan(80);
    const none = renderOverview(upper, { pxPerM: 2, radar: true });
    expect(px(none, 5, 5)[3]).toBe(255);
  });

  it('Bombenspot wird nur auf seiner Ebene getönt', () => {
    const tint = (r: ReturnType<typeof renderOverview>, z: number): number[] => px(r, 5, z);
    const ground = renderOverview(stacked, { pxPerM: 2, radar: true, bandY: 0 });
    const cellar = renderOverview(stacked, { pxPerM: 2, radar: true, bandY: -5 });
    const base = radarFloorColor(0);
    // Erdgeschoss: A-Spot (rötlich) ja, B-Spot (Keller) nein
    expect(tint(ground, 2.5)[0]! - base[0]).toBeGreaterThan(15);
    // Keller: Spot B getönt (orange: mehr Rot als der Kellerboden)
    expect(tint(cellar, 2.5)[0]! - radarFloorColor(-5.4)[0]).toBeGreaterThan(15);
  });
});

describe('Radar: Stapel-Erkennung', () => {
  it('flache Karte: keine übereinanderliegenden Ebenen', () => {
    expect(stackedCells(map)).toBe(0);
    expect(radarNeedsBands(map)).toBe(false);
  });

  it('Keller unter Erdgeschoss (5 m Abstand) auf großer Fläche → Höhenbänder', () => {
    // 20 × 10 m = 50 Zellen (à 4 m²) pro Ebenenpaar: zu wenig; große Karte nötig
    expect(stackedCells(stacked)).toBeGreaterThan(40);
    const big: MapData = {
      ...stacked,
      bounds: { min: [0, -8, 0], max: [60, 10, 60] },
      brushes: [
        { min: [0, -5.4, 0], max: [60, -5, 60], mat: 'concrete', tag: 'floor' },
        { min: [0, -0.4, 0], max: [60, 0, 60], mat: 'concrete', tag: 'floor' },
      ],
    };
    expect(radarNeedsBands(big)).toBe(true);
  });

  it('kleine Höhenunterschiede (Plattform 1.2 m, Container) lösen es nicht aus', () => {
    const lowSteps: MapData = {
      ...map,
      bounds: { min: [0, -2, 0], max: [60, 10, 60] },
      brushes: [
        { min: [0, -1, 0], max: [60, 0, 60], mat: 'concrete', tag: 'floor' },
        { min: [0, 0, 0], max: [60, 1.2, 60], mat: 'concrete', tag: 'platform' },
        { min: [0, 0, 0], max: [60, 2.6, 60], mat: 'metal', tag: 'prop' },
      ],
    };
    expect(radarNeedsBands(lowSteps)).toBe(false);
  });
});

describe('Radar: Aussehen', () => {
  const R = renderOverview({ ...map, sites: [], areas: [] }, { pxPerM: 4, radar: true });
  const at = (x: number, z: number): number[] => {
    const i = (Math.floor(z * 4) * R.w + Math.floor(x * 4)) * 4;
    return Array.from(R.data.slice(i, i + 4));
  };
  const lum = (c: number[]): number => c[0]! * 0.3 + c[1]! * 0.59 + c[2]! * 0.11;

  it('Wände sind dunkel, Boden mittelhell (nicht ausgewaschen)', () => {
    const wall = at(8.2, 7);
    const floor = at(4, 8);
    expect(lum(wall)).toBeLessThan(30);
    expect(lum(floor)).toBeGreaterThan(60);
    expect(lum(floor)).toBeLessThan(170);
    expect(floor[3]).toBe(255);
  });

  it('Boden-Farben: Keller bläulich, oben heller und wärmer', () => {
    const low = radarFloorColor(-5);
    const mid = radarFloorColor(0);
    const high = radarFloorColor(6);
    expect(low[2]).toBeGreaterThan(low[0]);
    expect(high[0]).toBeGreaterThan(mid[0]);
    expect(radarFloorColor(100)).toEqual(radarFloorColor(8));
    expect(radarFloorColor(-100)).toEqual(radarFloorColor(-5));
  });

  it('kein Brush ist heller als 200 (kein weißer Wash wie früher bei Gebäuden)', () => {
    const maxLum = (() => { let m = 0; for (let i = 0; i < R.w * R.h; i++) if (R.data[i * 4 + 3]) m = Math.max(m, lum(Array.from(R.data.slice(i * 4, i * 4 + 3)))); return m; })();
    expect(maxLum).toBeLessThan(200);
  });
});

describe('rimLight', () => {
  it('hellt nur Bodenpixel an der Kante zur Wand auf', () => {
    const w = 5, h = 1;
    const data = new Uint8ClampedArray(w * h * 4);
    const set = (x: number, c: number[]) => data.set([...c, 255], x * 4);
    set(0, [10, 16, 20]);
    for (let x = 1; x < 5; x++) set(x, [80, 120, 120]);
    rimLight(data, w, h);
    expect(data[4]).toBeGreaterThan(80); // Rand zum Wandpixel
    expect(data[8]).toBe(80); // Innen unverändert
    expect(data[16]).toBe(80); // Bildrand zählt nicht als Wand
  });
});
