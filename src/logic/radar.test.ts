import { describe, expect, it } from 'vitest';
import { worldToMap, worldToRadar } from './radar';

const view = { size: 200, range: 50 };

describe('worldToRadar', () => {
  it('Spieler ist in der Mitte; Punkt in Blickrichtung (-Z bei yaw 0) liegt oben', () => {
    const self = worldToRadar(0, 0, 0, 0, 0, view);
    expect(self).toEqual({ x: 100, y: 100, inside: true });
    const ahead = worldToRadar(0, 0, 0, 0, -25, view);
    expect(ahead.x).toBeCloseTo(100);
    expect(ahead.y).toBeCloseTo(50);
    expect(ahead.inside).toBe(true);
  });

  it('Drehung des Spielers dreht die Karte mit (Blick nach -X → -X liegt oben)', () => {
    const p = worldToRadar(0, 0, Math.PI / 2, -25, 0, view);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });

  it('außerhalb der Reichweite → inside false', () => {
    expect(worldToRadar(0, 0, 0, 80, 0, view).inside).toBe(false);
  });
});

describe('worldToMap', () => {
  it('bildet Bounds auf das Quadrat ab (längere Seite füllt, kürzere zentriert)', () => {
    const b = { minX: -10, maxX: 10, minZ: -20, maxZ: 20 };
    expect(worldToMap(-10, -20, b, 100)).toEqual({ x: 25, y: 0 });
    expect(worldToMap(10, 20, b, 100)).toEqual({ x: 75, y: 100 });
    expect(worldToMap(0, 0, b, 100)).toEqual({ x: 50, y: 50 });
  });
});
