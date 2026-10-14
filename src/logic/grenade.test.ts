import { describe, expect, it } from 'vitest';
import { GRENADE, canSee, flashStrength, heDamageAt, lineOfSight, segmentHitsSmoke, stepGrenade, throwGrenade } from './grenade';
import type { Aabb } from './hitbox';

const wall: Aabb = { minX: 4, maxX: 4.5, minY: 0, maxY: 6, minZ: -10, maxZ: 10 };

function simulate(solids: Aabb[], kind: 'he' | 'flash' | 'smoke' = 'he', dir = { x: 1, y: 0.2, z: 0 }, maxT = 10, fuse?: number) {
  const g = throwGrenade(kind, { x: 0, y: 1.65, z: 0 }, dir, 'p1');
  if (fuse !== undefined) g.fuse = fuse;
  let t = 0;
  let detonatedAt = -1;
  while (t < maxT) {
    if (stepGrenade(g, 1 / 60, solids)) detonatedAt = t;
    t += 1 / 60;
  }
  return { g, detonatedAt };
}

describe('throwGrenade / stepGrenade', () => {
  it('fliegt ballistisch, landet auf dem Boden und bleibt liegen', () => {
    const { g } = simulate([], 'he', { x: 1, y: 0.2, z: 0 }, 10, 100);
    expect(g.resting).toBe(true);
    expect(g.pos.y).toBeCloseTo(GRENADE.radius, 3);
    expect(g.pos.x).toBeGreaterThan(3);
    expect(g.bounces).toBeGreaterThan(0);
  });

  it('zündet nach Ablauf des Zünders genau einmal', () => {
    const { g, detonatedAt } = simulate([], 'he');
    expect(g.detonated).toBe(true);
    expect(detonatedAt).toBeGreaterThan(GRENADE.fuse.he - 0.05);
    expect(detonatedAt).toBeLessThan(GRENADE.fuse.he + 0.05);
    expect(stepGrenade(g, 0.1, [])).toBe(false);
  });

  it('prallt an einer Wand ab (bleibt vor der Wand)', () => {
    const { g } = simulate([wall], 'smoke');
    expect(g.pos.x).toBeLessThan(wall.minX);
    expect(g.bounces).toBeGreaterThan(0);
  });

  it('Wurfstärke skaliert die Weite', () => {
    const near = throwGrenade('he', { x: 0, y: 1.65, z: 0 }, { x: 1, y: 0, z: 0 }, 'p', 0.4);
    const far = throwGrenade('he', { x: 0, y: 1.65, z: 0 }, { x: 1, y: 0, z: 0 }, 'p', 1);
    expect(far.vel.x).toBeGreaterThan(near.vel.x);
    expect(near.vel.x).toBeGreaterThan(0);
  });

  it('Zünderzeiten je Art', () => {
    expect(throwGrenade('flash', { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 'p').fuse).toBe(GRENADE.fuse.flash);
  });
});

describe('lineOfSight / heDamageAt', () => {
  it('freie Sicht ohne Hindernis, blockiert durch Wand', () => {
    expect(lineOfSight({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, [wall])).toBe(true);
    expect(lineOfSight({ x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 }, [wall])).toBe(false);
  });

  it('HE: voller Schaden im Zentrum, linearer Abfall, 0 außerhalb/hinter Wand', () => {
    const c = { x: 0, y: 0.1, z: 0 };
    expect(heDamageAt(c, c, [])).toBe(GRENADE.heDamage);
    const half = heDamageAt(c, { x: GRENADE.heRadius / 2, y: 0.1, z: 0 }, []);
    expect(half).toBe(Math.round(GRENADE.heDamage / 2));
    expect(heDamageAt(c, { x: GRENADE.heRadius + 1, y: 0.1, z: 0 }, [])).toBe(0);
    expect(heDamageAt({ x: 3, y: 1, z: 0 }, { x: 6, y: 1, z: 0 }, [wall])).toBe(0);
  });
});

describe('flashStrength', () => {
  const eye = { x: 0, y: 1.65, z: 0 };
  const flash = { x: 5, y: 1, z: 0 };
  it('direkter Blick = stark, Rücken = schwach, hinter Wand = 0, außer Reichweite = 0', () => {
    const front = flashStrength(eye, { x: 1, y: 0, z: 0 }, flash, []);
    const back = flashStrength(eye, { x: -1, y: 0, z: 0 }, flash, []);
    expect(front).toBeGreaterThan(0.8);
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThan(0.3);
    expect(flashStrength(eye, { x: 1, y: 0, z: 0 }, { x: 8, y: 1, z: 0 }, [wall])).toBe(0);
    expect(flashStrength(eye, { x: 1, y: 0, z: 0 }, { x: 100, y: 1, z: 0 }, [])).toBe(0);
  });
});

describe('Rauch', () => {
  const smoke = { pos: { x: 5, y: 1, z: 0 }, radius: 3, timeLeft: 10 };
  it('Segment durch die Wolke blockiert, daneben nicht, abgelaufener Rauch nicht', () => {
    expect(segmentHitsSmoke({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, [smoke])).toBe(true);
    expect(segmentHitsSmoke({ x: 0, y: 1, z: 5 }, { x: 10, y: 1, z: 5 }, [smoke])).toBe(false);
    expect(segmentHitsSmoke({ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }, [{ ...smoke, timeLeft: 0 }])).toBe(false);
  });

  it('canSee kombiniert Solids und Rauch', () => {
    expect(canSee({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, [wall], [])).toBe(true);
    expect(canSee({ x: 0, y: 1, z: 0 }, { x: 8, y: 1, z: 0 }, [wall], [])).toBe(false);
    expect(canSee({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, [], [{ pos: { x: 1.5, y: 1, z: 0 }, radius: 1, timeLeft: 5 }])).toBe(false);
  });
});

describe('Granaten in der Kartenwelt (Collider)', () => {
  it('rollt eine Rampe hinunter und bleibt am Fuß liegen; prallt an Wänden ab', async () => {
    const { Collider, COL } = await import('./collision');
    const w = new Collider([
      { minX: 0, maxX: 40, minY: -0.3, maxY: 0, minZ: -5, maxZ: 5, mask: COL.all },
      { minX: 10, maxX: 16, minY: 0, maxY: 3, minZ: -5, maxZ: 5, mask: COL.all, ramp: 'px' },
      { minX: 16, maxX: 20, minY: 0, maxY: 3, minZ: -5, maxZ: 5, mask: COL.all },
    ], { floorY: -50 });
    // auf die Plattform am oberen Rampenende legen, Richtung Rampe anstoßen
    const g = throwGrenade('smoke', { x: 15.5, y: 3.4, z: 0 }, { x: -1, y: 0, z: 0 }, 'p', 0.25);
    g.fuse = 100;
    for (let i = 0; i < 600; i++) stepGrenade(g, 1 / 60, w);
    expect(g.pos.x).toBeLessThan(10.5);
    expect(g.pos.y).toBeLessThan(0.5);
    expect(g.pos.y).toBeGreaterThan(-0.01);
    // Wurf gegen eine Wand: bleibt davor
    const wall2 = new Collider([
      { minX: -40, maxX: 40, minY: -0.3, maxY: 0, minZ: -5, maxZ: 5, mask: COL.all },
      { minX: 6, maxX: 6.5, minY: 0, maxY: 5, minZ: -5, maxZ: 5, mask: COL.all },
    ], { floorY: -50 });
    const h = throwGrenade('he', { x: 0, y: 1.65, z: 0 }, { x: 1, y: 0.1, z: 0 }, 'p');
    h.fuse = 100;
    for (let i = 0; i < 400; i++) stepGrenade(h, 1 / 60, wall2);
    expect(h.pos.x).toBeLessThan(6);
    expect(h.bounces).toBeGreaterThan(0);
    expect(h.resting).toBe(true);
  });
});
