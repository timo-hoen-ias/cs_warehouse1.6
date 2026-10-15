import { describe, expect, it } from 'vitest';
import type { DecorKind } from '../logic/mapkit';
import { decorGeometry, decorGlows } from './decor';

/** Maße und Eigenschaften der Deko-Formen (Fußpunkt = Boden-Mitte, Front +Z). */
const size = (kind: DecorKind, low = false) => {
  const g = decorGeometry(kind, low);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  return { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z, minY: bb.min.y, maxY: bb.max.y };
};

const NEW: DecorKind[] = ['sack', 'van', 'fountain', 'lantern', 'log', 'archRing'];

describe('Deko-Formen (Speicherstadt)', () => {
  it('jede neue Form hat Geometrie mit Position, Normale, UV und Vertexfarbe, in beiden Qualitätsstufen', () => {
    for (const kind of NEW) for (const low of [false, true]) {
      const g = decorGeometry(kind, low);
      expect(g.getAttribute('position').count, kind).toBeGreaterThan(20);
      expect(g.getAttribute('color').count, kind).toBe(g.getAttribute('position').count);
      expect(g.getAttribute('uv').count, kind).toBe(g.getAttribute('position').count);
      // keine Platzhalter-Magenta-Würfel (Standardfall)
      expect(g.getAttribute('position').count, kind).not.toBe(36);
    }
  });

  it('Maße: Sack 0.9 × 0.3, Lieferwagen 4.6 × 1.9 × 2.3, Laterne 4.2 m, Brunnen Radius 1, Stamm Länge 1, Bogen Radius 1', () => {
    const sack = size('sack');
    expect(sack.w).toBeGreaterThan(0.85);
    expect(sack.w).toBeLessThan(1.0);
    expect(sack.h).toBeLessThan(0.35);
    expect(sack.minY).toBeGreaterThanOrEqual(-0.01);
    const van = size('van');
    expect(van.d).toBeCloseTo(4.6, 1);
    expect(van.w).toBeGreaterThan(1.9);
    expect(van.maxY).toBeGreaterThan(2.2);
    expect(van.maxY).toBeLessThan(2.4);
    expect(van.minY).toBeCloseTo(0, 1);
    const lamp = size('lantern');
    expect(lamp.maxY).toBeGreaterThan(4.0);
    expect(lamp.maxY).toBeLessThan(4.3);
    const fountain = size('fountain');
    expect(fountain.w).toBeCloseTo(2, 1);
    expect(fountain.maxY).toBeGreaterThan(2);
    const log = size('log');
    expect(log.w).toBeGreaterThan(1.0);
    expect(log.w).toBeLessThan(1.06);
    expect(log.d).toBeCloseTo(0.54, 1);
    const arch = size('archRing');
    expect(arch.w).toBeCloseTo(2, 1);
    expect(arch.minY).toBeGreaterThanOrEqual(-0.01);
    expect(arch.d).toBeGreaterThan(1.0); // Laibung mit Schlussstein
  });

  it('nur die Laterne leuchtet (Instanzfarbe wird nicht vom gebackenen Licht abgedunkelt)', () => {
    expect(decorGlows('lantern')).toBe(true);
    for (const kind of NEW.filter((k) => k !== 'lantern')) expect(decorGlows(kind), kind).toBe(false);
  });
});
