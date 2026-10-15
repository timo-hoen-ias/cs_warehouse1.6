import { describe, expect, it } from 'vitest';
import { THROW_TOL, simulateThrow, solveThrow } from './botThrow';
import { colliderFor } from './collision';

// Freie Fläche mit Boden (y 0) und einer hohen Wand bei x = 20 (z −10..10)
const floor = { minX: -50, maxX: 50, minY: -1, maxY: 0, minZ: -50, maxZ: 50 };
const wall = { minX: 20, maxX: 21, minY: 0, maxY: 30, minZ: -10, maxZ: 10 };
const col = colliderFor([floor, wall]);
const eye = { x: 0, y: 1.6, z: 0 };

describe('Granatenwürfe der Bots', () => {
  it('Simulation ist deterministisch und landet auf dem Boden', () => {
    const a = simulateThrow(col, 'smoke', eye, { x: 0, y: 0.3, z: -0.95 }, 1);
    const b = simulateThrow(col, 'smoke', eye, { x: 0, y: 0.3, z: -0.95 }, 1);
    expect(a).toEqual(b);
    expect(a.at.y).toBeLessThan(0.3);
    expect(a.at.z).toBeLessThan(-5);
  });

  it('Rauch/HE: Wurf landet innerhalb der Toleranz am Ziel (nah, mittel, weit)', () => {
    for (const target of [{ x: 0, y: 0, z: -6 }, { x: 8, y: 0, z: -10 }, { x: -12, y: 0, z: 14 }]) {
      for (const kind of ['smoke', 'he'] as const) {
        const plan = solveThrow(col, kind, eye, target);
        expect(plan, `${kind} → ${JSON.stringify(target)}`).not.toBeNull();
        expect(plan!.err).toBeLessThanOrEqual(THROW_TOL[kind]);
        // Nachrechnen: die Simulation bestätigt den Plan
        const sim = simulateThrow(col, kind, eye, plan!.dir, plan!.strength);
        expect(Math.hypot(sim.at.x - target.x, sim.at.z - target.z)).toBeLessThanOrEqual(THROW_TOL[kind] + 0.5);
      }
    }
  });

  it('Blend zündet in der Luft und muss die Zielpunkte sehen', () => {
    const target = { x: 0, y: 3, z: -10 };
    const plan = solveThrow(col, 'flash', eye, target, { mustSee: [{ x: 0, y: 1.6, z: -20 }], clear: (a, b) => col.clear(a, b) });
    expect(plan).not.toBeNull();
    expect(plan!.land.y).toBeGreaterThan(0.5);
    // Hinter der Wand niemand zu blenden → kein Wurf
    const hidden = solveThrow(col, 'flash', eye, target, { mustSee: [{ x: 30, y: 1.6, z: 0 }], clear: (a, b) => col.clear(a, b) });
    expect(hidden).toBeNull();
  });

  it('reject: Zündpunkte werden aussortiert; ohne erlaubten Wurf → null', () => {
    const target = { x: 0, y: 0, z: -10 };
    const free = solveThrow(col, 'he', eye, target)!;
    expect(free).not.toBeNull();
    const seen: number[] = [];
    // Alles zwischen Wurfpunkt und Ziel ist „besetzt“, was nahe am freien Wurf liegt → anderer Wurf
    const alt = solveThrow(col, 'he', eye, target, { reject: (at) => { seen.push(at.z); return Math.hypot(at.x - free.land.x, at.z - free.land.z) < 0.4; } });
    expect(seen.length).toBeGreaterThan(0);
    if (alt) expect(Math.hypot(alt.land.x - free.land.x, alt.land.z - free.land.z)).toBeGreaterThanOrEqual(0.4);
    expect(solveThrow(col, 'he', eye, target, { reject: () => true })).toBeNull();
  });

  it('unerreichbares Ziel hinter einer hohen Wand → null; zu nah → null', () => {
    expect(solveThrow(col, 'smoke', eye, { x: 26, y: 0, z: 0 })).toBeNull();
    expect(solveThrow(col, 'smoke', eye, { x: 0.3, y: 0, z: 0.2 })).toBeNull();
  });
});
