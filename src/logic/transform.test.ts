import { describe, expect, it } from 'vitest';
import type { Lagerort } from '../shared/types';
import { rackMetrics } from './layout';
import {
  applyTransform,
  clampScale,
  dist2d,
  IDENTITY_TRANSFORM,
  moveRack,
  rackAabb,
  resizeFactor,
  resizeHeight,
  resizeHeightFactor,
  resizeRack,
  resizeRackExact,
  rotateRack,
  round05,
  rackBounds,
  scaleRack,
  snap1,
  snap45,
  snappedMove,
} from './transform';

const ort: Lagerort = {
  lagerkennung: 'KUEHL',
  bezeichnung: 'Kühl-HR',
  lagertechnik: 'LTD3HR',
  dims: { d1: 4, d2: 2, d3: 5 },
  plaetze: [],
};

const base = {
  ...rackMetrics(ort),
  key: 'KUEHL#0',
  gang: 0,
  ort,
  origin: [10,0,20] as [number, number, number],
};
describe('snap', () => {

  it('snap45 rundet auf 45°-Vielfache', () => {
    expect(snap45(89)).toBe(90);
    expect(snap45(46)).toBe(45);
    expect(snap45(-44)).toBe(-45);
  });
});

describe('scale', () => {
  it('round05 liefert 0.5er-Schritte', () => {
    expect(round05(1.3)).toBe(1.5);
    expect(round05(0.24)).toBe(0);
  });

  it('clampScale begrenzt auf 0.5–2', () => {
    expect(clampScale(3)).toBe(2);
    expect(clampScale(0.1)).toBe(0.5);
    expect(clampScale(1)).toBe(1);
  });
});

describe('applyTransform', () => {
  it('verschiebt, skaliert und rotiert das Regal', () => {
    const t = { x: 3, z: -2, rotY: 0, scale: { x: 1.5, y: 2, z: 0.5 } };
    const p = applyTransform(base, t);
    expect(p.position).toEqual([13,0,18]);
    expect(p.size.w).toBeCloseTo(base.size.w * 1.5, 5);
    expect(p.size.h).toBeCloseTo(base.size.h * 2, 5);
    expect(p.size.d).toBeCloseTo(base.size.d * 0.5, 5);
    expect(p.key).toBe('KUEHL#0');
  });

  it('Identität lässt das Basis-Layout unverändert', () => {
    const p = applyTransform(base, IDENTITY_TRANSFORM);
    expect(p.position).toEqual([10, 0, 20]);
    expect(p.size).toEqual(base.size);
  });
});

describe('rackAabb', () => {
  it('0°: AABB = ungedrehte Box', () => {
    const p = applyTransform(base, IDENTITY_TRANSFORM);
    const b = rackAabb(p);
    expect(b.maxX - b.minX).toBeCloseTo(p.size.w, 5);
    expect(b.maxZ - b.minZ).toBeCloseTo(p.size.d, 5);
  });

  it('45°: AABB ist die umhüllende Diagonale', () => {
    const p = applyTransform(base, { x: 0, z: 0, rotY: Math.PI / 4, scale: { x: 1, y: 1, z: 1 } });
    const b = rackAabb(p);
    const expectHalf = (Math.sqrt(2) / 2) * (p.size.w / 2 + p.size.d / 2);
    expect(b.maxX - b.minX).toBeCloseTo(expectHalf * 2, 5);
  });

  it('90°: Breite und Tiefe vertauschen sich', () => {
    const p = applyTransform(base, { x: 0, z: 0, rotY: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } });
    const b = rackAabb(p);
    expect(b.maxX - b.minX).toBeCloseTo(p.size.d, 5);
    expect(b.maxZ - b.minZ).toBeCloseTo(p.size.w, 5);
  });
});

describe('rotateRack / scaleRack', () => {
  it('rotateRack snapped auf 45°-Schritte', () => {
    const r1 = rotateRack(IDENTITY_TRANSFORM, 50);
    expect((r1.rotY * 180) / Math.PI).toBe(45);
    const r2 = rotateRack(IDENTITY_TRANSFORM, 95);
    expect((r2.rotY * 180) / Math.PI).toBe(90);
  });

  it('scaleRack rundet und clamp (uniform, alle Achsen)', () => {
    expect(scaleRack(IDENTITY_TRANSFORM, 1.3).scale.x).toBe(1.5);
    expect(scaleRack(IDENTITY_TRANSFORM, 1.3).scale.y).toBe(1.5);
    expect(scaleRack(IDENTITY_TRANSFORM, 5).scale.x).toBe(2);
  });

  it('moveRack verschiebt und snapped auf ganze Meter', () => {
    const m = moveRack({ x: 2.4, z: -1.6, rotY: 0, scale: { x: 1, y: 1, z: 1 } }, 1, 0);
    expect(m.x).toBe(3);
    expect(m.z).toBe(-2);
  });
});

describe('snappedMove (Drag-Regression)', () => {
  const baseX = 10;
  const baseZ = 20;
  const grab = { dx: 0.3, dz: -0.2 };
  const start = { x: 0, z: 0, rotY: 0, scale: { x: 1, y: 1, z: 1 } };

  it('platziert das Regal konsistent an der gesnappten Weltposition', () => {
    const m = snappedMove(start, baseX, baseZ, 10 + 0.3 + 2.4, 20 - 0.2 - 1.4, grab.dx, grab.dz);
    expect(m.x).toBe(2); // snap1(2.4) - 0 = 2
    expect(m.z).toBe(-1); // snap1(-1.4) - 0 = -1
  });

  it('oszilliert NICHT bei wiederholten Aufrufen (konstanter Basis-Origin)', () => {
    const first = snappedMove(start, baseX, baseZ, 12.7, 18.8, grab.dx, grab.dz);
    // zweiter Aufruf mit gleicher Weltposition, aber "zwischengespeichertem" Transform
    const second = snappedMove(first, baseX, baseZ, 12.7, 18.8, grab.dx, grab.dz);
    expect(second.x).toBe(first.x);
    expect(second.z).toBe(first.z);
    // absolute Regalposition bleibt bei gleichbleibender Maus stabil:
    const abs = baseX + second.x;
    expect(abs).toBeCloseTo(snap1(12.7 - grab.dx), 5);
  });
});

describe('resizeRack / resizeFactor / resizeHeightFactor', () => {
  it('resizeRack ändert nur die angegebene Achse', () => {
    const t = { x: 0, z: 0, rotY: 0, scale: { x: 1, y: 1, z: 1 } };
    const r = resizeRack(t, 'y', 1.5);
    expect(r.scale).toEqual({ x: 1, y: 1.5, z: 1 });
  });

  it('resizeRackExact erlaubt Kommazahl-Faktoren ohne 0.5er-Rundung', () => {
    const t = { x: 0, z: 0, rotY: 0, scale: { x: 1, y: 1, z: 1 } };
    expect(resizeRackExact(t, 'x', 1.37).scale.x).toBeCloseTo(1.37, 5);
    expect(resizeRackExact(t, 'z', 5).scale.z).toBe(2);
    expect(resizeRackExact(t, 'y', 0.1).scale.y).toBe(0.5);
  });

  it('resizeRack rundet auf 0.5 und klemmt auf 0.5–2', () => {
    const t = { x: 0, z: 0, rotY: 0, scale: { x: 1, y: 1, z: 1 } };
    expect(resizeRack(t, 'x', 1.3).scale.x).toBe(1.5);
    expect(resizeRack(t, 'x', 5).scale.x).toBe(2);
    expect(resizeRack(t, 'z', 0.1).scale.z).toBe(0.5);
  });

  it('resizeFactor: Zeigerposition relativ zur unskalierten Halbkante', () => {
    expect(resizeFactor(1.0, 1.8, 0.35)).toBe(1.5); // (1.8-0.35)/1.0 → 1.45 → 1.5
    expect(resizeFactor(1.0, -1.8, 0.35)).toBe(1.5); // Betrag, symmetrisch
    expect(resizeFactor(1.0, 0.3, 0.35)).toBe(0.5); // unter 0 → geklemmt
  });

  it('resizeHeightFactor: Höhe aus Zeiger-Y relativ zur Basishöhe', () => {
    expect(resizeHeightFactor(2.0, 3.0, 0)).toBe(1.5);
    expect(resizeHeightFactor(2.0, 5.0, 0)).toBe(2);
    expect(resizeHeightFactor(2.0, 0.5, 0)).toBe(0.5);
  });

  it('resizeHeight bleibt beim Anpacken des Griffs stabil (kein Sprung)', () => {
    const baseH = 1.1;
    const off = 0.35;
    for (const s of [0.5, 1, 1.5, 2]) {
      const grab = resizeHeight(baseH, baseH * s + off, off);
      expect(grab).toBe(s);
    }
    const grown = resizeHeight(baseH, baseH * 1.5 + off + 0.5, off);
    expect(grown).toBe(2);
  });
});

describe('dist2d', () => {
  it('berechnet die Länge einer Strecke', () => {
    expect(dist2d({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
});

describe('rackBounds', () => {
  it('umschließt alle Regale plus Rand', () => {
    const a = applyTransform({ ...base, origin: [0, 0, 0] }, IDENTITY_TRANSFORM);
    const b = applyTransform({ ...base, origin: [10, 0, 20] }, IDENTITY_TRANSFORM);
    const bounds = rackBounds([a, b], 4)!;
    expect(bounds).not.toBeNull();
    expect(bounds.minX).toBeLessThanOrEqual(-4 + 1e-9);
    expect(bounds.maxX).toBeGreaterThanOrEqual(14 - 1e-9);
    expect(bounds.minZ).toBeLessThanOrEqual(-4 + 1e-9);
    expect(bounds.maxZ).toBeGreaterThanOrEqual(24 - 1e-9);
  });

  it('null bei leerem Bestand', () => {
    expect(rackBounds([], 4)).toBeNull();
  });
});
