import { describe, expect, it } from 'vitest';
import { BODY, BotBody, remainingVia } from './botBody';
import type { Intent } from './botBrain';
import { buildBotTestMap } from './botTestMap';
import { compileMap } from './mapcompile';
import { PLAYER } from './move';
import type { XYZ } from './nav';
import { WEAPONS, weaponSpeed } from './weapons';

const m = compileMap(buildBotTestMap());
const env = (now: number, mates: XYZ[] = []) => ({ col: m.collider, nav: m.nav, now, skill: 0.6, mates });

function intent(over: Partial<Intent> = {}): Intent {
  return { goal: null, via: [], plan: 1, speed: 'run', strafe: null, crouch: false, look: null, snap: false, fire: null, weapon: 'knife', reload: false, use: false, throwNade: null, avoid: [], radio: null, state: '', ...over };
}

function run(body: BotBody, it: Intent, seconds: number, t0 = 0, mates: XYZ[] = []): number {
  const dt = 0.05;
  let t = t0;
  for (let i = 0; i < seconds / dt; i++) {
    body.step(it, dt, env(t, mates));
    t += dt;
  }
  return t;
}

describe('Bot-Körper', () => {
  it('läuft über die Navigation durch Türen zum Ziel (Rennen ≈ Sprinttempo)', () => {
    const body = new BotBody({ x: 40, y: 0, z: 74, yaw: 0, pitch: 0 });
    const goal = { x: 10, y: 0, z: 18 };
    run(body, intent({ goal, speed: 'run' }), 25);
    expect(Math.hypot(body.pose.x - goal.x, body.pose.z - goal.z)).toBeLessThan(0.6);
    expect(body.stuckMax).toBeLessThan(1.5);
  });

  it('Tempo: Gehen und Schleichen langsamer, geduckt am langsamsten; Stillstand wird gezählt', () => {
    const speeds: Record<string, number> = {};
    for (const speed of ['run', 'walk', 'sneak'] as const) {
      const body = new BotBody({ x: 40, y: 0, z: 74, yaw: 0, pitch: 0 });
      run(body, intent({ goal: { x: 40, y: 0, z: 30 }, speed }), 2);
      speeds[speed] = 74 - body.pose.z;
    }
    expect(speeds.run!).toBeGreaterThan(speeds.walk!);
    expect(speeds.walk!).toBeGreaterThan(speeds.sneak!);
    expect(speeds.sneak! / 2).toBeLessThan(2.6); // unter der Hörschwelle
    const c = new BotBody({ x: 40, y: 0, z: 74, yaw: 0, pitch: 0 });
    run(c, intent({ goal: { x: 40, y: 0, z: 30 }, speed: 'run', crouch: true }), 2);
    expect((74 - c.pose.z) / 2).toBeLessThanOrEqual(BODY.crouch + 0.05);
    run(c, intent({ speed: 'stop' }), 0.5);
    expect(c.stillFor).toBeGreaterThanOrEqual(0.45);
  });

  it('Waffentempo: schwere Waffe bremst den Bot im selben Verhältnis wie den Spieler', () => {
    const dist = (scale: number): number => {
      const body = new BotBody({ x: 40, y: 0, z: 74, yaw: 0, pitch: 0 });
      body.speedScale = scale;
      run(body, intent({ goal: { x: 40, y: 0, z: 30 }, speed: 'run' }), 2);
      return 74 - body.pose.z;
    };
    const awp = weaponSpeed(WEAPONS['awp']!) / PLAYER.runSpeed;
    expect(awp).toBeLessThan(0.9);
    expect(dist(awp)).toBeLessThan(dist(1) * 0.95);
    expect(dist(awp)).toBeGreaterThan(dist(1) * 0.7);
  });

  it('Routen-Wegpunkte werden der Reihe nach abgearbeitet und nach Umwegen nicht erneut angelaufen', () => {
    const via = [{ x: 3, y: 0, z: 69.5 }, { x: 3, y: 0, z: 25.5 }];
    expect(remainingVia(via, 0, { x: 40, y: 0, z: 74 })).toHaveLength(2);
    expect(remainingVia(via, 1, { x: 3, y: 0, z: 50 })).toHaveLength(1);
    // schon im Gang (näher am zweiten als der erste) → erster entfällt
    expect(remainingVia(via, 0, { x: 3, y: 0, z: 40 })).toHaveLength(1);
    const body = new BotBody({ x: 40, y: 0, z: 74, yaw: 0, pitch: 0 });
    const it = intent({ goal: { x: 10, y: 0, z: 18 }, via });
    let t = run(body, it, 6);
    expect(body.pose.x).toBeLessThan(8); // über den Lang-Gang, nicht durch die Mitte
    // Umweg (anderer Plan), dann zurück zum Auftrag: der erste Wegpunkt bleibt abgehakt
    t = run(body, intent({ goal: { x: 3, y: 0, z: 45 }, plan: 2 }), 1, t);
    const zBefore = body.pose.z;
    run(body, { ...it, plan: 3 }, 1, t);
    expect(body.pose.z).toBeLessThan(zBefore - 4); // weiter Richtung Spot, nicht zurück zum ersten Wegpunkt
  });

  it('leicht verschobenes Ziel (gleicher Plan) wird übernommen statt am alten stehen zu bleiben', () => {
    const body = new BotBody({ x: 3, y: 0, z: 60, yaw: 0, pitch: 0 });
    let t = run(body, intent({ goal: { x: 3, y: 0, z: 60 }, plan: 5 }), 0.5);
    expect(body.speed).toBeLessThan(0.3);
    t = run(body, intent({ goal: { x: 4.3, y: 0, z: 58.8 }, plan: 5 }), 1.5, t);
    expect(Math.hypot(body.pose.x - 4.3, body.pose.z - 58.8)).toBeLessThan(0.5);
  });

  it('Strafen nur auf begehbarem Boden (nicht in Wände)', () => {
    const body = new BotBody({ x: 1, y: 0, z: 50, yaw: 0, pitch: 0 });
    run(body, intent({ strafe: { x: -1, z: 0 }, speed: 'walk' }), 1);
    expect(body.pose.x).toBeGreaterThan(0.3);
    const free = new BotBody({ x: 3, y: 0, z: 50, yaw: 0, pitch: 0 });
    run(free, intent({ strafe: { x: 1, z: 0 }, speed: 'walk' }), 0.3);
    expect(free.pose.x).toBeGreaterThan(3.5);
  });

  it('Abstand: läuft nicht auf einen stehenden Kameraden auf; besetztes Ziel zählt als erreicht', () => {
    const body = new BotBody({ x: 3, y: 0, z: 60, yaw: 0, pitch: 0 });
    const mate = { x: 3, y: 0, z: 54 };
    run(body, intent({ goal: { x: 3, y: 0, z: 40 } }), 1.5, 0, [mate]);
    expect(body.pose.z).toBeGreaterThan(54.5);
    const b2 = new BotBody({ x: 3, y: 0, z: 60, yaw: 0, pitch: 0 });
    run(b2, intent({ goal: { x: 3, y: 0, z: 56 } }), 3, 0, [{ x: 3, y: 0, z: 56 }]);
    expect(b2.speed).toBeLessThan(0.3);
    expect(b2.pose.z).toBeGreaterThan(56.5);
  });

  it('Drehen: begrenzte Drehrate, im Kampf schneller; Zielwinkel messbar', () => {
    const slow = new BotBody({ x: 40, y: 0, z: 74, yaw: 0, pitch: 0 });
    const fast = new BotBody({ x: 40, y: 0, z: 74, yaw: 0, pitch: 0 });
    const target = { x: 50, y: 1.6, z: 74 }; // 90° rechts
    slow.step(intent({ speed: 'stop', look: target }), 0.1, env(0));
    fast.step(intent({ speed: 'stop', look: target, snap: true }), 0.1, env(0));
    expect(Math.abs(fast.pose.yaw)).toBeGreaterThan(Math.abs(slow.pose.yaw));
    expect(fast.aimOff(target)).toBeLessThan(slow.aimOff(target));
    for (let i = 0; i < 20; i++) fast.step(intent({ speed: 'stop', look: target, snap: true }), 0.05, env(i));
    expect(fast.aimOff(target)).toBeLessThan(0.02);
  });
});
