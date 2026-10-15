import { describe, expect, it } from 'vitest';
import { COL, Collider, type ColItem } from './collision';
import type { Body, BodyInput, MoveWorld } from './move';
import { MOVE, PLAYER, accelerate, applyFriction, bhopLimit, newBody, speedXZ, stepBody, topSpeed, wishDir } from './move';
import { WEAPONS, weaponSpeed } from './weapons';
import { loadMapData } from '../maps';

/** Tests der GoldSrc-Bewegung (Beschleunigung, Reibung, Luft, Sprünge, Landung). */

const FLOOR: MoveWorld = [];
const input = (over: Partial<BodyInput> = {}): BodyInput => ({ wishX: 0, wishZ: 0, run: PLAYER.runSpeed, walk: false, crouch: false, jump: false, ...over });
/** Simuliert `secs` Sekunden mit 60 Hz. */
const sim = (b: Body, inp: BodyInput, secs: number, world: MoveWorld = FLOOR): Body => {
  for (let i = 0; i < Math.round(secs * 60); i++) b = stepBody(b, inp, 1 / 60, world).body;
  return b;
};
const start = (): Body => newBody(0, 0, 0);

describe('PLAYER Tempo (CS-Tabelle in Metern)', () => {
  it('Messer-Lauftempo = 250 u/s = 6,2 m/s, Gehen 52 %, Ducken 34 %', () => {
    expect(PLAYER.runSpeed).toBeCloseTo(6.2, 6);
    expect(PLAYER.sprintSpeed).toBe(PLAYER.runSpeed);
    expect(PLAYER.walkSpeed).toBeCloseTo(6.2 * 0.52, 6);
    expect(PLAYER.crouchSpeed).toBeCloseTo(6.2 * 0.34, 6);
  });

  it('topSpeed: Waffentempo × Haltung, Ducken schlägt Gehen', () => {
    expect(topSpeed(6, false, false)).toBe(6);
    expect(topSpeed(6, true, false)).toBeCloseTo(6 * 0.52, 6);
    expect(topSpeed(6, false, true)).toBeCloseTo(6 * 0.34, 6);
    expect(topSpeed(6, true, true)).toBeCloseTo(6 * 0.34, 6);
  });

  it('Schleichen liegt unter der Schrittgeräusch-Schwelle (135 u/s), Rennen darüber', () => {
    expect(PLAYER.walkSpeed).toBeLessThan(135 * 0.0248);
    expect(weaponSpeed(WEAPONS['scout']!) * MOVE.walkFactor).toBeLessThan(145 * 0.0248);
    expect(weaponSpeed(WEAPONS['awp']!)).toBeGreaterThan(135 * 0.0248);
    expect(weaponSpeed(WEAPONS['awp']!, true) * 1).toBeGreaterThan(135 * 0.0248);
  });
});

describe('Beschleunigung, Reibung, Counter-Strafe', () => {
  it('Anlaufen: nicht schlagartig, nach ≈ 0.45 s volles Lauftempo, nie darüber', () => {
    const early = sim(start(), input({ wishZ: -1 }), 0.05);
    expect(speedXZ(early)).toBeGreaterThan(0.5);
    expect(speedXZ(early)).toBeLessThan(PLAYER.runSpeed * 0.6);
    expect(speedXZ(sim(start(), input({ wishZ: -1 }), 0.25))).toBeLessThan(PLAYER.runSpeed * 0.95);
    expect(speedXZ(sim(start(), input({ wishZ: -1 }), 0.6))).toBeCloseTo(PLAYER.runSpeed, 3);
    let b = start();
    for (let i = 0; i < 120; i++) {
      b = stepBody(b, input({ wishZ: -1 }), 1 / 60, FLOOR).body;
      expect(speedXZ(b)).toBeLessThanOrEqual(PLAYER.runSpeed + 1e-6);
    }
  });

  it('diagonal gleich schnell wie geradeaus', () => {
    const d = Math.SQRT1_2;
    const diag = sim(start(), input({ wishX: d, wishZ: -d }), 0.5);
    expect(speedXZ(diag)).toBeCloseTo(PLAYER.runSpeed, 3);
  });

  it('Shift = 52 %, Ctrl = 34 % des Waffentempos; AWP ist langsamer als das Messer', () => {
    const wz = { wishZ: -1 };
    expect(speedXZ(sim(start(), input({ ...wz, walk: true }), 1))).toBeCloseTo(PLAYER.runSpeed * 0.52, 3);
    expect(speedXZ(sim(start(), input({ ...wz, crouch: true }), 1))).toBeCloseTo(PLAYER.runSpeed * 0.34, 3);
    const awpRun = weaponSpeed(WEAPONS['awp']!);
    expect(speedXZ(sim(start(), input({ ...wz, run: awpRun }), 1))).toBeCloseTo(awpRun, 3);
    expect(awpRun).toBeLessThan(PLAYER.runSpeed);
  });

  it('Loslassen: Reibung bremst in ≈ 0.4 s, nicht sofort', () => {
    const run = sim(start(), input({ wishZ: -1 }), 0.5);
    const after = (t: number): number => speedXZ(sim(run, input(), t));
    expect(after(0.05)).toBeGreaterThan(PLAYER.runSpeed * 0.6);
    expect(after(0.6)).toBeLessThan(0.05);
  });

  it('Counter-Strafe (Gegentaste) stoppt deutlich schneller als Loslassen', () => {
    const run = sim(start(), input({ wishX: 1 }), 0.5);
    const stopTime = (inp: BodyInput): number => {
      let b = run;
      for (let i = 1; i <= 120; i++) {
        b = stepBody(b, inp, 1 / 60, FLOOR).body;
        if (speedXZ(b) < 0.5) return i / 60;
      }
      return Infinity;
    };
    const release = stopTime(input());
    const counter = stopTime(input({ wishX: -1 }));
    expect(counter).toBeLessThan(0.2);
    expect(release).toBeGreaterThan(counter * 1.5);
  });

  it('Stillstand bleibt stehen (auch auf einer flachen Rampe kein Rutschen)', () => {
    const rampWorld = new Collider([{ minX: -3, maxX: 3, minZ: -3, maxZ: 3, minY: 0, maxY: 1, mask: COL.all, ramp: 'px' }], { floorY: 0 });
    let b = newBody(0, 0.5, 0);
    b = sim(b, input(), 0.2, rampWorld);
    const { x, y, z } = b;
    b = sim(b, input(), 2, rampWorld);
    expect(b.x).toBeCloseTo(x, 6);
    expect(b.z).toBeCloseTo(z, 6);
    expect(b.y).toBeCloseTo(y, 6);
    expect(b.grounded).toBe(true);
  });

  it('läuft gegen eine Wand: Tempo geht verloren, Gleiten entlang der Wand bleibt', () => {
    const wall = new Collider([{ minX: 2, maxX: 3, minZ: -20, maxZ: 20, minY: 0, maxY: 3, mask: COL.all }], { floorY: 0 });
    let b = sim(newBody(0, 0, 0), input({ wishX: Math.SQRT1_2, wishZ: -Math.SQRT1_2 }), 1.5, wall);
    expect(b.x).toBeLessThanOrEqual(2 - PLAYER.radius + 1e-6);
    expect(Math.abs(b.vx)).toBeLessThan(0.5);
    expect(b.vz).toBeLessThan(-3);
    expect(b.z).toBeLessThan(-3);
    b = sim(b, input(), 1, wall);
    expect(speedXZ(b)).toBeLessThan(0.05);
  });

  it('Rampen (30°) bergauf und bergab ohne Hüpfen, Tempo bleibt', () => {
    const h = Math.tan(Math.PI / 6) * 6;
    const w = new Collider([
      { minX: 2, maxX: 8, minZ: -2, maxZ: 2, minY: 0, maxY: h, mask: COL.all, ramp: 'px' },
      { minX: 8, maxX: 14, minZ: -2, maxZ: 2, minY: 0, maxY: h, mask: COL.all },
    ], { floorY: 0 });
    let b = newBody(0, 0, 0);
    let air = 0;
    for (let i = 0; i < 100; i++) {
      b = stepBody(b, input({ wishX: 1 }), 1 / 60, w).body;
      if (!b.grounded) air++;
    }
    expect(b.x).toBeGreaterThan(9);
    expect(b.y).toBeCloseTo(PLAYER.eye + h, 3);
    expect(air).toBe(0);
    for (let i = 0; i < 160; i++) {
      b = stepBody(b, input({ wishX: -1 }), 1 / 60, w).body;
      if (!b.grounded) air++;
    }
    expect(b.x).toBeLessThan(2);
    expect(b.y).toBeCloseTo(PLAYER.eye, 3);
    expect(air).toBe(0);
  });
});

describe('Luft: Air-Strafing, Bunnyhop-Bremse', () => {
  it('accelerate am Boden bis zum Wunschtempo; in der Luft nur um airWishCap je Schritt', () => {
    const g = accelerate(0, 0, 1, 0, 6, 6, false, 1);
    expect(g.vx).toBeCloseTo(6, 6);
    const a = accelerate(6, 0, 0, 1, 6, 6, true, 1 / 60);
    expect(a.vz).toBeGreaterThan(0);
    expect(a.vz).toBeLessThanOrEqual(MOVE.airWishCap + 1e-9);
    expect(Math.hypot(a.vx, a.vz)).toBeGreaterThan(6);
  });

  it('in Flugrichtung beschleunigt die Luftsteuerung nicht über den Cap hinaus', () => {
    const a = accelerate(6, 0, 1, 0, 6, 6, true, 1 / 60);
    expect(a.vx).toBe(6);
    const slow = accelerate(0, 0, 1, 0, 6, 6, true, 1);
    expect(slow.vx).toBeCloseTo(MOVE.airWishCap, 6);
    expect(accelerate(3, 0, 1, 0, 0, 6, false, 1)).toEqual({ vx: 3, vz: 0 });
  });

  it('Strafen mit mitdrehender Blickrichtung baut Tempo auf (Air-Strafe), aber begrenzt', () => {
    let vx = 0;
    let vz = -PLAYER.runSpeed;
    for (let i = 0; i < 120; i++) {
      // Wunschrichtung bleibt rechtwinklig zur Flugrichtung (ideales Strafen)
      const sp = Math.hypot(vx, vz);
      ({ vx, vz } = accelerate(vx, vz, vz / sp, -vx / sp, PLAYER.runSpeed, PLAYER.runSpeed, true, 1 / 60));
    }
    expect(Math.hypot(vx, vz)).toBeGreaterThan(PLAYER.runSpeed * 1.2);
    expect(Math.hypot(vx, vz)).toBeLessThan(PLAYER.runSpeed * 3);
  });

  it('bhopLimit: bis 120 % des Waffentempos unverändert, darüber auf 0.8 × Grenze', () => {
    const run = 6;
    expect(bhopLimit(6, 0, run)).toEqual({ vx: 6, vz: 0 });
    expect(bhopLimit(7.1, 0, run).vx).toBe(7.1);
    const c = bhopLimit(0, -10, run);
    expect(Math.hypot(c.vx, c.vz)).toBeCloseTo(1.2 * run * 0.8, 6);
  });

  it('Dauer-Halten von Space springt nur einmal; Neu-Drücken = Bunnyhop mit gedeckeltem Tempo', () => {
    let b = start();
    let jumps = 0;
    for (let i = 0; i < 240; i++) {
      const r = stepBody(b, input({ wishZ: -1, jump: true }), 1 / 60, FLOOR);
      b = r.body;
      if (r.jumped) jumps++;
    }
    expect(jumps).toBe(1);
    b = start();
    let maxSpeed = 0;
    jumps = 0;
    for (let i = 0; i < 60 * 8; i++) {
      const r = stepBody(b, input({ wishZ: -1, jump: i % 2 === 0 }), 1 / 60, FLOOR);
      b = r.body;
      if (r.jumped) jumps++;
      maxSpeed = Math.max(maxSpeed, speedXZ(b));
    }
    expect(jumps).toBeGreaterThanOrEqual(5);
    expect(maxSpeed).toBeLessThanOrEqual(PLAYER.runSpeed * 1.2 + 0.01);
  });

  it('Absprung mit Übertempo wird gebremst', () => {
    const b: Body = { ...start(), vz: -12 };
    const r = stepBody(b, input({ jump: true }), 1 / 60, FLOOR);
    expect(r.jumped).toBe(true);
    expect(speedXZ(r.body)).toBeLessThan(PLAYER.runSpeed * 1.2);
    expect(r.body.grounded).toBe(false);
  });

  it('Springen ändert das Horizontaltempo am Boden nicht (keine Reibung im Flug)', () => {
    let b = sim(start(), input({ wishZ: -1 }), 0.4);
    const v0 = speedXZ(b);
    b = stepBody(b, input({ wishZ: -1, jump: true }), 1 / 60, FLOOR).body;
    for (let i = 0; i < 20; i++) b = stepBody(b, input({ wishZ: -1 }), 1 / 60, FLOOR).body;
    expect(b.grounded).toBe(false);
    expect(speedXZ(b)).toBeCloseTo(v0, 3);
    // ohne Taste im Flug: Tempo bleibt (Reibung nur am Boden)
    for (let i = 0; i < 10; i++) b = stepBody(b, input(), 1 / 60, FLOOR).body;
    expect(speedXZ(b)).toBeCloseTo(v0, 3);
  });
});

describe('Sprunghöhen und Hocksprung', () => {
  const box = (h: number, from: number, depth = 3): ColItem => ({ minX: from, maxX: from + depth, minZ: -3, maxZ: 3, minY: 0, maxY: h, mask: COL.all });
  /**
   * Mit Anlauf (Tempo v) im Abstand d vor der Kante abspringen: landet man auf der Box der Höhe h?
   * Hocksprung = Ducken erst in der Luft (wie in CS: springen, dann ducken).
   */
  const reaches = (h: number, crouch: boolean, v: number, d: number): boolean => {
    const edge = 10;
    const w = new Collider([box(h, edge)], { floorY: 0 });
    let b: Body = { ...newBody(edge - d, 0, 0), vx: v };
    for (let i = 0; i < 90; i++) {
      b = stepBody(b, input({ wishX: 1, run: Math.max(v, 1), crouch: crouch && !b.grounded, jump: i === 0 }), 1 / 60, w).body;
      if (i > 5 && b.grounded && b.x > edge && Math.abs(b.y - PLAYER.eye - h) < 1e-6) return true;
    }
    return false;
  };
  const anyDist = (h: number, crouch: boolean, v: number): boolean => {
    for (let d = 0.4; d < 2.6; d += 0.1) if (reaches(h, crouch, v, d)) return true;
    return false;
  };
  /** Höchste Boxhöhe (0.05-Raster), die irgendein Absprungabstand erreicht. */
  const reach = (crouch: boolean, v: number): number => {
    let best = 0;
    for (let h = 0.3; h < 2.4; h += 0.05) if (anyDist(h, crouch, v)) best = h;
    return best;
  };

  it('Standsprung: ≈ 1.1 m Scheitelhöhe (CS 45 u)', () => {
    let b = newBody(0, 0, 0);
    let maxY = 0;
    for (let i = 0; i < 120; i++) {
      b = stepBody(b, input({ jump: i === 0 }), 1 / 60, FLOOR).body;
      maxY = Math.max(maxY, b.y - PLAYER.eye);
    }
    expect(maxY).toBeGreaterThan(1.0);
    expect(maxY).toBeLessThan(1.2);
    expect(b.grounded).toBe(true);
  });

  it('Kisten bis 1.25 m (Xbox) sind im normalen Sprung erreichbar, 1.5 m nur im Hocksprung', () => {
    for (const v of [PLAYER.runSpeed, PLAYER.walkSpeed]) {
      expect(anyDist(1.1, false, v), `1.1 @${v}`).toBe(true);
      expect(anyDist(1.2, false, v), `1.2 @${v}`).toBe(true);
      expect(anyDist(1.25, false, v), `1.25 @${v}`).toBe(true);
      expect(anyDist(1.5, false, v), `1.5 @${v}`).toBe(false);
      expect(anyDist(1.5, true, v), `1.5 duck @${v}`).toBe(true);
    }
  });

  it('Reichweite: Hocksprung ≈ +0.45 m, bleibt aber unter der zweiten Xbox-Stufe (1.95 m)', () => {
    const stand = reach(false, PLAYER.runSpeed);
    const duck = reach(true, PLAYER.runSpeed);
    expect(stand).toBeGreaterThanOrEqual(1.25);
    expect(stand).toBeLessThan(1.5);
    expect(duck).toBeGreaterThanOrEqual(1.65);
    expect(duck).toBeLessThan(1.95);
    expect(duck - stand).toBeGreaterThan(0.25);
  });

  it('Karten-Geometrie: alle Bodenkisten (Material „crate“) bis 1.3 m sind im Sprung, bis 1.7 m im Hocksprung erreichbar', () => {
    const data = loadMapData('de_lagerstaub');
    const crates = data.brushes.filter((br) => br.mat === 'crate' && br.min[1] < 0.3 && !br.ramp);
    expect(crates.length).toBeGreaterThan(5);
    const heights = new Set(crates.map((c) => +(c.max[1] - c.min[1]).toFixed(2)));
    expect([...heights].some((h) => h >= 1.0 && h <= 1.3)).toBe(true);
    const stand = reach(false, PLAYER.runSpeed);
    const duck = reach(true, PLAYER.runSpeed);
    for (const h of heights) {
      if (h <= 1.3) expect(stand, `Kiste ${h} m`).toBeGreaterThanOrEqual(h - 0.05);
      if (h <= 1.7) expect(duck, `Kiste ${h} m`).toBeGreaterThanOrEqual(h - 0.05);
    }
  });
});

describe('Landung', () => {
  it('Landung meldet die Aufprallgeschwindigkeit, harter Sturz bremst das Tempo', () => {
    let b: Body = { ...newBody(0, 8, 0), grounded: false, vz: -6 };
    let landed = 0;
    for (let i = 0; i < 200 && landed === 0; i++) {
      const r = stepBody(b, input(), 1 / 60, FLOOR);
      b = r.body;
      landed = r.landSpeed;
    }
    expect(landed).toBeGreaterThan(Math.sqrt(2 * 20 * 7.5));
    expect(landed).toBeLessThan(Math.sqrt(2 * 20 * 8.5));
    expect(Math.abs(b.vz)).toBeLessThan(4.1); // ≥ 30 % Verlust
    expect(b.grounded).toBe(true);
  });

  it('normaler Sprung: Landung ohne Tempoverlust', () => {
    let b: Body = { ...start(), vz: -6 };
    let landed = 0;
    for (let i = 0; i < 120; i++) {
      const r = stepBody(b, input({ wishZ: -1, jump: i === 0 }), 1 / 60, FLOOR);
      b = r.body;
      if (r.landSpeed > 0) landed = r.landSpeed;
    }
    expect(landed).toBeGreaterThan(5);
    expect(landed).toBeLessThan(8);
    expect(speedXZ(b)).toBeGreaterThan(5.5);
  });

  it('Rampenlaufen löst keine Landung aus', () => {
    const h = Math.tan(Math.PI / 6) * 6;
    const w = new Collider([
      { minX: 2, maxX: 8, minZ: -2, maxZ: 2, minY: 0, maxY: h, mask: COL.all, ramp: 'px' },
      { minX: 8, maxX: 14, minZ: -2, maxZ: 2, minY: 0, maxY: h, mask: COL.all },
    ], { floorY: 0 });
    let b = newBody(0, 0, 0);
    let total = 0;
    for (let i = 0; i < 100; i++) {
      const r = stepBody(b, input({ wishX: 1 }), 1 / 60, w);
      b = r.body;
      total += r.landSpeed;
    }
    expect(total).toBe(0);
    expect(b.x).toBeGreaterThan(7);
  });
});

describe('Zeitschritte (stepBody)', () => {
  it('ein 0.1-s-Schritt entspricht ≈ 6 Schritten à 1/60 s', () => {
    const inp = input({ wishX: 1 });
    const big = stepBody(newBody(0, 0, 0), inp, 0.1, FLOOR).body;
    let s = newBody(0, 0, 0);
    for (let i = 0; i < 6; i++) s = stepBody(s, inp, 1 / 60, FLOOR).body;
    expect(big.x).toBeCloseTo(s.x, 5);
    expect(big.vx).toBeCloseTo(s.vx, 5);
  });

  it('dt = 0 ändert nichts', () => {
    const b = newBody(1, 0, 2);
    const r = stepBody(b, input({ wishX: 1, jump: true }), 0, []);
    expect(r.body).toBe(b);
    expect(r.jumped).toBe(false);
  });
});

describe('wishDir / applyFriction', () => {
  it('wishDir: Einheitsvektor bzw. 0', () => {
    const f = wishDir({ w: true, s: false, a: false, d: false }, 0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    const d = wishDir({ w: true, s: false, a: false, d: true }, 0);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
    expect(wishDir({ w: true, s: true, a: false, d: false }, 0)).toEqual({ x: 0, z: 0 });
  });

  it('Reibung: unter stopSpeed konstante Bremskraft, darüber proportional, nie rückwärts', () => {
    const fast = applyFriction(10, 0, 0.01);
    expect(fast.vx).toBeCloseTo(10 - 10 * MOVE.friction * 0.01, 6);
    const slow = applyFriction(1, 0, 0.01);
    expect(slow.vx).toBeCloseTo(1 - MOVE.stopSpeed * MOVE.friction * 0.01, 6);
    expect(applyFriction(0.5, 0, 1)).toEqual({ vx: 0, vz: 0 });
    expect(applyFriction(0.001, 0, 0.016)).toEqual({ vx: 0, vz: 0 });
  });
});
