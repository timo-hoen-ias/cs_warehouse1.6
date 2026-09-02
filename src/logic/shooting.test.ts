import { describe, expect, it } from 'vitest';
import { makeHealth, applyDamage } from './damage';
import { humanPartBoxes, castParts } from './hitbox';
import { WEAPONS } from './weapons';

describe('Schießen auf Ziel (Integrationspfad pure Logik)', () => {
  // Aufbau wie im Spiel: Ziel steht bei (0,0,0), Schütze auf der Z-Achse.
  const parts = humanPartBoxes({ x: 0, y: 0, z: 0 });
  const dir = { x: 0, y: 0, z: 1 };

  it('AK-Körpertreffer reduziert HP um damage', () => {
    const h = makeHealth(100);
    const hit = castParts({ x: 0, y: 0.7, z: -20 }, dir, parts);
    expect(hit?.part).toBe('body');
    applyDamage(h, WEAPONS['ak47']!.damage);
    expect(h.hp).toBe(100 - WEAPONS['ak47']!.damage);
  });

  it('AWP-Kopfschuss aus 20 m tötet', () => {
    const h = makeHealth(100);
    const awp = WEAPONS['awp']!;
    // ziele auf Kopfmitte
    const head = parts.find((p) => p.part === 'head')!;
    const aimY = (head.box.minY + head.box.maxY) / 2;
    const hit = castParts({ x: 0, y: aimY, z: -20 }, dir, parts);
    expect(hit?.part).toBe('head');
    const dmg = Math.round(awp.damage * awp.headFactor);
    const killed = applyDamage(h, dmg);
    expect(killed).toBe(true);
    expect(h.hp).toBe(0);
  });

  it('Wand davor blockiert: Wand-Hitbox näher als Ziel', () => {
    const wall = { part: 'body' as const, box: { minX: -10, minY: 0, minZ: -5, maxX: 10, maxY: 6, maxZ: -4.5 } };
    const origin = { x: 0, y: 0.7, z: -20 };
    const wallHit = castParts(origin, dir, [wall]);
    const targetHit = castParts(origin, dir, parts);
    expect(wallHit).not.toBeNull();
    expect(targetHit).not.toBeNull();
    expect(wallHit!.dist).toBeLessThan(targetHit!.dist);
  });
});
