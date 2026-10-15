import { describe, expect, it } from 'vitest';
import { LEVEL_GAP, RADAR_BASE_RANGE, clampToEdge, heightMarker, radarDots, radarHeading, radarRange, siteLabelState, worldToMap, worldToRadar, type RadarPlayer } from './radar';

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

describe('worldToRadar ohne Drehung (Norden oben)', () => {
  const north = { size: 200, range: 50, rotate: false };
  it('−Z liegt oben, +X rechts, unabhängig vom Blick', () => {
    for (const yaw of [0, 1.2, -2.5]) {
      const n = worldToRadar(0, 0, yaw, 0, -25, north);
      expect(n.x).toBeCloseTo(100);
      expect(n.y).toBeCloseTo(50);
      const e = worldToRadar(0, 0, yaw, 25, 0, north);
      expect(e.x).toBeCloseTo(150);
      expect(e.y).toBeCloseTo(100);
    }
  });

  it('Ausschnitt ist ein Quadrat (Ecke ≈ 1.4 × Reichweite liegt noch drin)', () => {
    expect(worldToRadar(0, 0, 0, 45, 45, north).inside).toBe(true);
    expect(worldToRadar(0, 0, 0, 51, 0, north).inside).toBe(false);
  });
});

describe('Radar-Zoom und Blickrichtung', () => {
  it('Zoom 1 = 50 m, mehr Zoom = kleinerer Radius, ungültig → Standard', () => {
    expect(radarRange(1)).toBe(RADAR_BASE_RANGE);
    expect(radarRange(2)).toBe(25);
    expect(radarRange(0.5)).toBe(100);
    expect(radarRange(0)).toBe(RADAR_BASE_RANGE);
    expect(radarRange(Number.NaN)).toBe(RADAR_BASE_RANGE);
  });

  it('Blickwinkel: relativ bei Drehung, sonst absolut', () => {
    expect(radarHeading(1.5, 0.5, true)).toBeCloseTo(1);
    expect(radarHeading(1.5, 0.5, false)).toBeCloseTo(1.5);
  });
});

describe('heightMarker', () => {
  it('Pfeil erst ab einer Etage Unterschied', () => {
    expect(heightMarker(0)).toBeNull();
    expect(heightMarker(LEVEL_GAP - 0.01)).toBeNull();
    expect(heightMarker(LEVEL_GAP)).toBe('up');
    expect(heightMarker(-LEVEL_GAP)).toBe('down');
    expect(heightMarker(-5)).toBe('down');
  });
});

describe('clampToEdge', () => {
  it('Punkte im Ausschnitt bleiben', () => {
    expect(clampToEdge(60, 140, 200, 10)).toEqual({ x: 60, y: 140, clamped: false });
  });

  it('Punkte außerhalb landen auf dem Rand (Richtung bleibt)', () => {
    const e = clampToEdge(400, 100, 200, 10);
    expect(e.clamped).toBe(true);
    expect(e.x).toBeCloseTo(190);
    expect(e.y).toBeCloseTo(100);
    const d = clampToEdge(300, 300, 200, 10); // schräg: Richtung (1,1)
    expect(d.x).toBeCloseTo(190);
    expect(d.y).toBeCloseTo(190);
  });

  it('Mitte (Länge 0) bleibt unverändert', () => {
    expect(clampToEdge(100, 100, 200, 10).clamped).toBe(false);
  });
});

describe('radarDots', () => {
  const view = { size: 200, range: 50 };
  const self = { id: 'me', x: 0, y: 0, z: 0, yaw: 0 };
  const P = (id: string, team: 'T' | 'CT', x: number, y: number, z: number, alive = true, yaw = 0): RadarPlayer => ({ id, team, x, y, z, yaw, alive });
  const dots = (others: RadarPlayer[], spotted: string[] = []) => radarDots(self, others, 'CT', (id) => spotted.includes(id), view, 8);

  it('Teamkameraden immer, Gegner nur wenn gesichtet; Tote und man selbst nie', () => {
    const list = dots([P('me', 'CT', 0, 0, 0), P('a', 'CT', 10, 0, -10), P('b', 'T', 10, 0, -20), P('c', 'T', -10, 0, -20), P('d', 'CT', 5, 0, 5, false)], ['c']);
    expect(list.map((d) => d.id)).toEqual(['a', 'c']);
    expect(list[0]!.enemy).toBe(false);
    expect(list[1]!.enemy).toBe(true);
  });

  it('gesichteter Gegner außerhalb des Ausschnitts wird nicht gezeigt, Mitspieler an den Rand gezogen', () => {
    const list = dots([P('far-mate', 'CT', 0, 0, -200), P('far-foe', 'T', 0, 0, -200)], ['far-foe']);
    expect(list.map((d) => d.id)).toEqual(['far-mate']);
    expect(list[0]!.clamped).toBe(true);
    expect(list[0]!.y).toBeCloseTo(8);
    expect(list[0]!.alpha).toBeLessThan(1);
  });

  it('andere Etage: Pfeil und schwächere Darstellung', () => {
    const [up, down, same] = dots([P('u', 'CT', 5, 4.5, -5), P('d', 'CT', 5, -5, -5), P('s', 'CT', 5, 0.4, -5)]);
    expect(up!.marker).toBe('up');
    expect(down!.marker).toBe('down');
    expect(same!.marker).toBeNull();
    expect(up!.alpha).toBeLessThan(1);
    expect(same!.alpha).toBe(1);
  });

  it('Blickrichtung relativ (gedreht) bzw. absolut (Norden oben)', () => {
    const rot = radarDots({ ...self, yaw: 1 }, [P('a', 'CT', 0, 0, -5, true, 1.5)], 'CT', () => false, view, 8);
    expect(rot[0]!.heading).toBeCloseTo(0.5);
    const fixed = radarDots({ ...self, yaw: 1 }, [P('a', 'CT', 0, 0, -5, true, 1.5)], 'CT', () => false, { ...view, rotate: false }, 8);
    expect(fixed[0]!.heading).toBeCloseTo(1.5);
  });
});

describe('siteLabelState', () => {
  it('eigene Etage voll, andere Etage blass, ohne Band immer voll', () => {
    expect(siteLabelState(0, 0)).toBe('same');
    expect(siteLabelState(-5, 0)).toBe('other');
    expect(siteLabelState(-5, undefined)).toBe('same');
    expect(siteLabelState(2, 0.5)).toBe('same');
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
