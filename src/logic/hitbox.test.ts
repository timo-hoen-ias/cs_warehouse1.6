import { describe, expect, it } from 'vitest';
import { boxSurfaceNormal, castBlockers, isRayCaster, castParts, humanPartBoxes, nearestAabbDistance, rayEntryNormal, rayIntersectAabb } from './hitbox';

// Ziel steht bei (0,0,0) mit Fußpunkt y=0, Blickrichtung +z? Strahlen kommen aus -z.
const parts = humanPartBoxes({ x: 0, y: 0, z: 0 });

describe('humanPartBoxes', () => {
  it('Körper reicht vom Fuß bis zur Hüfte, Kopf sitzt obendrauf', () => {
    const body = parts.find((p) => p.part === 'body')!;
    const head = parts.find((p) => p.part === 'head')!;
    expect(body.box.minY).toBe(0);
    expect(body.box.maxY).toBeGreaterThan(head.box.minY);
    expect(head.box.maxY).toBeGreaterThan(head.box.minY);
    expect(body.box.minX).toBeLessThan(0);
    expect(body.box.maxX).toBeGreaterThan(0);
  });

  it('Kopf ist kleiner als Körper', () => {
    const body = parts.find((p) => p.part === 'body')!;
    const head = parts.find((p) => p.part === 'head')!;
    const bw = body.box.maxX - body.box.minX;
    const hw = head.box.maxX - head.box.minX;
    expect(hw).toBeLessThan(bw);
  });
});

describe('rayIntersectAabb', () => {
  it('trifft Box von außen', () => {
    const body = parts.find((p) => p.part === 'body')!;
    const t = rayIntersectAabb({ x: 0, y: 1, z: -5 }, { x: 0, y: 0, z: 1 }, body.box);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(5 - body.box.maxZ, 1);
  });

  it('trifft bei schrägem Strahl von oben (neg. dir.y) — Regression', () => {
    // Kamera bei z=-20, Blick schräg nach unten auf Körpermitte
    const body = parts.find((p) => p.part === 'body')!;
    const cy = (body.box.minY + body.box.maxY) / 2;
    const origin = { x: 0, y: 1.65, z: -20 };
    const target = { x: 0, y: cy, z: 0 };
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const L = Math.hypot(dx, dy, dz);
    const dir = { x: dx / L, y: dy / L, z: dz / L };
    const t = rayIntersectAabb(origin, dir, body.box);
    expect(t).not.toBeNull();
  });

  it('verfehlt Box seitlich', () => {
    const body = parts.find((p) => p.part === 'body')!;
    const t = rayIntersectAabb({ x: 50, y: 1, z: -5 }, { x: 0, y: 0, z: 1 }, body.box);
    expect(t).toBeNull();
  });

  it('Start innerhalb der Box liefert Treffer (t >= 0)', () => {
    const body = parts.find((p) => p.part === 'body')!;
    const t = rayIntersectAabb({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, body.box);
    expect(t).not.toBeNull();
  });

  it('Strahl von innen nach außen liefert Treffer', () => {
    const body = parts.find((p) => p.part === 'body')!;
    const t = rayIntersectAabb({ x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: 1 }, body.box);
    expect(t).not.toBeNull();
  });
});

describe('castParts', () => {
  it('Schuss auf die Brust trifft body', () => {
    const hit = castParts({ x: 0, y: 1, z: -5 }, { x: 0, y: 0, z: 1 }, parts);
    expect(hit?.part).toBe('body');
  });

  it('Schuss auf den Kopf trifft head', () => {
    const head = parts.find((p) => p.part === 'head')!;
    const aimY = (head.box.minY + head.box.maxY) / 2;
    const hit = castParts({ x: 0, y: aimY, z: -5 }, { x: 0, y: 0, z: 1 }, parts);
    expect(hit?.part).toBe('head');
  });

  it('Schuss über den Kopf trifft nichts', () => {
    const hit = castParts({ x: 0, y: 3, z: -5 }, { x: 0, y: 0, z: 1 }, parts);
    expect(hit).toBeNull();
  });

  it('Kopf steht vor Körper → head gewinnt (nächste Distanz)', () => {
    // Künstlich: head näher am Schützen (kleineres z), body dahinter
    const near = { part: 'head' as const, box: { minX: -0.3, minY: 1.2, minZ: -4, maxX: 0.3, maxY: 1.8, maxZ: 2 } };
    const far = { part: 'body' as const, box: { minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 2, maxZ: 5 } };
    const hit = castParts({ x: 0, y: 1.5, z: -10 }, { x: 0, y: 0, z: 1 }, [far, near]);
    expect(hit?.part).toBe('head');
    expect(hit?.dist).toBeLessThan(castParts({ x: 0, y: 1.5, z: -10 }, { x: 0, y: 0, z: 1 }, [far])!.dist);
  });
});

describe('boxSurfaceNormal', () => {
  const box = { minX: -1, minY: 0, minZ: -2, maxX: 1, maxY: 2, maxZ: 2 };
  it('erkennt +X-Fläche', () => {
    expect(boxSurfaceNormal(box, { x: 1, y: 1, z: 0 })).toEqual({ x: 1, y: 0, z: 0 });
  });
  it('erkennt -X-Fläche', () => {
    expect(boxSurfaceNormal(box, { x: -1, y: 1, z: 0 })).toEqual({ x: -1, y: 0, z: 0 });
  });
  it('erkennt +Y-Fläche', () => {
    expect(boxSurfaceNormal(box, { x: 0, y: 2, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
  });
  it('erkennt -Z-Fläche', () => {
    expect(boxSurfaceNormal(box, { x: 0, y: 1, z: -2 })).toEqual({ x: 0, y: 0, z: -1 });
  });
  it('liefert null außerhalb jeder Fläche (Boxinneres)', () => {
    expect(boxSurfaceNormal(box, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});

describe('nearestAabbDistance', () => {
  const near = { minX: -1, minY: 0, minZ: 0, maxX: 1, maxY: 3, maxZ: 0.2 };
  const far = { minX: -1, minY: 0, minZ: 6, maxX: 1, maxY: 3, maxZ: 6.2 };
  const origin = { x: 0, y: 1.65, z: -5 };
  const dir = { x: 0, y: 0, z: 1 };

  it('liefert die nächste Box (nah vor fern)', () => {
    expect(nearestAabbDistance(origin, dir, [far, near])).toBeCloseTo(5, 5);
  });

  it('liefert max, wenn nichts getroffen wird', () => {
    expect(nearestAabbDistance(origin, { x: 1, y: 0, z: 0 }, [near, far])).toBe(Infinity);
    expect(nearestAabbDistance(origin, dir, [], 12)).toBe(12);
  });

  it('begrenzt das Ergebnis auf max', () => {
    expect(nearestAabbDistance(origin, dir, [far], 5.5)).toBe(5.5);
    expect(nearestAabbDistance(origin, dir, [far], 11)).toBeCloseTo(11, 5);
  });
});

describe('rayEntryNormal', () => {
  const box = { minX: -1, minY: 0, minZ: -2, maxX: 1, maxY: 2, maxZ: 2 };
  it('Eintritt durch -X (Strahl von links)', () => {
    expect(rayEntryNormal(box, { x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })).toEqual({ x: -1, y: 0, z: 0 });
  });
  it('Eintritt durch +X (Strahl von rechts)', () => {
    expect(rayEntryNormal(box, { x: 5, y: 1, z: 0 }, { x: -1, y: 0, z: 0 })).toEqual({ x: 1, y: 0, z: 0 });
  });
  it('Eintritt durch +Y (Strahl von oben)', () => {
    expect(rayEntryNormal(box, { x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
  });
  it('Eintritt durch -Z (Strahl von vorne)', () => {
    expect(rayEntryNormal(box, { x: 0, y: 1, z: -5 }, { x: 0, y: 0, z: 1 })).toEqual({ x: 0, y: 0, z: -1 });
  });
  it('schräger Strahl von -X/-Z → dominanteste Eintrittsfläche', () => {
    const n = rayEntryNormal(box, { x: -5, y: 1, z: -5 }, { x: 0.7, y: 0, z: 1 });
    expect(n).toEqual({ x: -1, y: 0, z: 0 });
  });
  it('verfehlter Strahl → null', () => {
    expect(rayEntryNormal(box, { x: 50, y: 1, z: -5 }, { x: 0, y: 0, z: 1 })).toBeNull();
  });
});

describe('castBlockers', () => {
  const box = { minX: 2, maxX: 3, minY: 0, maxY: 2, minZ: -1, maxZ: 1 };
  it('Quaderliste: nächster Treffer mit Eintrittsnormale, maxT begrenzt', () => {
    const h = castBlockers([box], { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 10)!;
    expect(h.t).toBeCloseTo(2);
    expect(h.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(castBlockers([box], { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 1.5)).toBeNull();
    expect(isRayCaster([box])).toBe(false);
  });
  it('Strahl-Welt (castRay) wird direkt gefragt; Treffer ≤ 2 cm werden übersprungen', () => {
    let calls = 0;
    const caster = { castRay: (o: { x: number }, _d: unknown, maxT: number) => { calls++; return o.x < 0.02 ? { t: 0.01, normal: { x: -1, y: 0, z: 0 } } : maxT > 3 ? { t: 3, normal: { x: -1, y: 0, z: 0 } } : null; } };
    expect(isRayCaster(caster)).toBe(true);
    const h = castBlockers(caster, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 10)!;
    expect(h.t).toBe(3);
    expect(calls).toBe(2);
  });
});
