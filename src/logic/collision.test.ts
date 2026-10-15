import { describe, expect, it } from 'vitest';
import { COL, Collider, MAX_WALK_SLOPE, rampAbove, rampSlope, rayItem, topAt, type ColItem } from './collision';
import { mulberry32 } from './rng';

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, extra: Partial<ColItem> = {}): ColItem =>
  ({ minX, minY, minZ, maxX, maxY, maxZ, mask: COL.all, ...extra });

describe('Rampen-Geometrie', () => {
  const r = box(0, 0, 0, 4, 2, 2, { ramp: 'px' });
  it('topAt folgt der Schräge und klemmt auf die Grundfläche', () => {
    expect(topAt(r, 0, 1)).toBeCloseTo(0);
    expect(topAt(r, 2, 1)).toBeCloseTo(1);
    expect(topAt(r, 9, 1)).toBeCloseTo(2);
    expect(topAt({ ...r, ramp: 'nx' }, 1, 1)).toBeCloseTo(1.5);
    expect(topAt({ ...r, ramp: 'pz' }, 1, 0.5)).toBeCloseTo(0.5);
  });
  it('rampSlope und Begehbarkeitsgrenze', () => {
    expect(rampSlope(r)).toBeCloseTo(0.5);
    expect(MAX_WALK_SLOPE).toBeCloseTo(Math.tan((40 * Math.PI) / 180));
  });
  it('rampAbove schneidet den Teil oberhalb einer Höhe als Quader ab', () => {
    expect(rampAbove(r, 3)).toBeNull();
    expect(rampAbove(r, -1)).toBe(r);
    const cut = rampAbove(r, 1)!;
    expect(cut.minX).toBeCloseTo(2);
    expect(cut.maxX).toBe(4);
    expect(cut.ramp).toBeUndefined();
    const cutN = rampAbove({ ...r, ramp: 'nz' }, 0.5)!;
    expect(cutN.maxZ).toBeCloseTo(1.5);
  });
});

describe('rayItem', () => {
  it('trifft einen Quader mit richtiger Distanz und Normale', () => {
    const h = rayItem({ x: -5, y: 1, z: 1 }, { x: 1, y: 0, z: 0 }, box(0, 0, 0, 2, 2, 2), 100)!;
    expect(h.t).toBeCloseTo(5);
    expect(h.normal).toEqual({ x: -1, y: 0, z: 0 });
    const top = rayItem({ x: 1, y: 5, z: 1 }, { x: 0, y: -1, z: 0 }, box(0, 0, 0, 2, 2, 2), 100)!;
    expect(top.t).toBeCloseTo(3);
    expect(top.normal).toEqual({ x: 0, y: 1, z: 0 });
  });
  it('ignoriert Elemente, in denen der Strahl startet, und respektiert maxT', () => {
    expect(rayItem({ x: 1, y: 1, z: 1 }, { x: 1, y: 0, z: 0 }, box(0, 0, 0, 2, 2, 2), 100)).toBeNull();
    expect(rayItem({ x: -5, y: 1, z: 1 }, { x: 1, y: 0, z: 0 }, box(0, 0, 0, 2, 2, 2), 4)).toBeNull();
  });
  it('trifft die Schräge einer Rampe senkrecht von oben und streift über den niedrigen Teil', () => {
    const r = box(0, 0, 0, 4, 2, 2, { ramp: 'px' });
    const down = rayItem({ x: 2, y: 5, z: 1 }, { x: 0, y: -1, z: 0 }, r, 100)!;
    expect(down.t).toBeCloseTo(4); // Oberfläche bei x=2 ist 1 m hoch
    expect(down.normal.y).toBeGreaterThan(0.8);
    expect(down.normal.x).toBeLessThan(0);
    // waagrechter Strahl in 1.5 m Höhe von links: trifft die Schräge bei x=3
    const side = rayItem({ x: -3, y: 1.5, z: 1 }, { x: 1, y: 0, z: 0 }, r, 100)!;
    expect(side.t).toBeCloseTo(6);
    // in 2.5 m Höhe: über die Rampe hinweg
    expect(rayItem({ x: -3, y: 2.5, z: 1 }, { x: 1, y: 0, z: 0 }, r, 100)).toBeNull();
    // von rechts (hohe Stirnseite) trifft der waagrechte Strahl die senkrechte Fläche
    const back = rayItem({ x: 9, y: 1.5, z: 1 }, { x: -1, y: 0, z: 0 }, r, 100)!;
    expect(back.t).toBeCloseTo(5);
    expect(back.normal).toEqual({ x: 1, y: 0, z: 0 });
  });
});

describe('Collider', () => {
  it('Raster-Raycast liefert dasselbe wie Brute-Force (viele Elemente, Rampen)', () => {
    const rnd = mulberry32(7);
    const items: ColItem[] = [];
    const dirs = ['px', 'nx', 'pz', 'nz'] as const;
    for (let i = 0; i < 400; i++) {
      const x = (rnd() - 0.5) * 160;
      const z = (rnd() - 0.5) * 160;
      const y = rnd() * 6;
      const it: ColItem = box(x, y, z, x + 0.5 + rnd() * 8, y + 0.3 + rnd() * 4, z + 0.5 + rnd() * 8);
      if (rnd() < 0.3) it.ramp = dirs[Math.floor(rnd() * 4)]!;
      items.push(it);
    }
    const c = new Collider(items, { floorY: -100, cell: 4 });
    for (let k = 0; k < 300; k++) {
      const o = { x: (rnd() - 0.5) * 170, y: rnd() * 8, z: (rnd() - 0.5) * 170 };
      const a = rnd() * Math.PI * 2;
      const e = (rnd() - 0.5) * 0.6;
      const d = { x: Math.cos(a) * Math.cos(e), y: Math.sin(e), z: Math.sin(a) * Math.cos(e) };
      let best = Infinity;
      for (const it of items) {
        const h = rayItem(o, d, it, 200);
        if (h && h.t < best) best = h.t;
      }
      const hit = c.raycast(o, d, 200, COL.all);
      if (best === Infinity) expect(hit).toBeNull();
      else expect(hit!.t).toBeCloseTo(best, 6);
    }
  });

  it('Masken: Geländer blockiert Bewegung, aber keine Schüsse', () => {
    const rail = box(0, 0, -2, 0.1, 1.1, 2, { mask: COL.move });
    const c = new Collider([rail], { floorY: 0 });
    expect(c.clear({ x: -2, y: 0.8, z: 0 }, { x: 2, y: 0.8, z: 0 })).toBe(true);
    expect(c.blockedAt(0.2, 0, 0, 0.35, 1.8, 0.55)).toBe(true);
  });

  it('impliziter Boden und surfaceAt', () => {
    const c = new Collider([box(0, 0, 0, 4, 1, 4, { surface: 'metal' })], { floorY: 0 });
    expect(c.raycast({ x: -5, y: 2, z: -5 }, { x: 0, y: -1, z: 0 }, 10)!.t).toBeCloseTo(2);
    expect(c.surfaceAt(2, 1, 2)).toBe('metal');
    expect(c.surfaceAt(-3, 0, -3)).toBeNull();
  });

  it('query findet nur Elemente im Rechteck', () => {
    const items = Array.from({ length: 50 }, (_, i) => box(i * 3, 0, 0, i * 3 + 1, 1, 1));
    const c = new Collider(items);
    expect(c.query(0, 0, 4, 1).length).toBe(2);
    expect(c.query(100, 0, 104, 1, COL.shot).length).toBe(2);
  });

  it('Bodenhöhe: Kiste, Rampe und Decke', () => {
    const c = new Collider([box(0, 0, 0, 2, 0.5, 2), box(4, 0, 0, 8, 2, 2, { ramp: 'px' }), box(10, 2.5, 0, 12, 2.7, 2)], { floorY: 0 });
    expect(c.groundHeight(1, 1, 0, 0.35, 0.55)).toBe(0.5);
    expect(c.groundHeight(6, 1, 0.8, 0.35, 0.55)).toBeCloseTo(1);
    expect(c.groundHeight(11, 1, 0, 0.35, 0.55)).toBe(0);
    expect(c.ceilingAbove(11, 1, 0, 0.35)).toBe(2.5);
  });
});
