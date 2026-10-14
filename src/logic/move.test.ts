import { describe, expect, it } from 'vitest';
import type { SolidBox } from './level';
import type { PlayerMotion } from './move';
import { PLAYER, blocksAt, groundHeight, pointFree, resolveAxis, stepPlayer, wishSpeed } from './move';
import { COL, Collider, type ColItem } from './collision';

// Kleine Testhalle: Regal (Block) + vier Wände
const solids: SolidBox[] = [
  { kind: 'rack', minX: 2, maxX: 3.2, minY: 0, maxY: 6, minZ: 90, maxZ: 110, label: 'regal' },
  { kind: 'wall', minX: -20, maxX: 20, minY: 0, maxY: 8, minZ: 80, maxZ: 80.5, label: 'wand-nord' },
  { kind: 'wall', minX: -20, maxX: 20, minY: 0, maxY: 8, minZ: 119.5, maxZ: 120, label: 'wand-sued' },
  { kind: 'wall', minX: -20, maxX: -19.5, minY: 0, maxY: 8, minZ: 80, maxZ: 120, label: 'wand-west' },
  { kind: 'wall', minX: 19.5, maxX: 20, minY: 0, maxY: 8, minZ: 80, maxZ: 120, label: 'wand-ost' },
];

describe('stepPlayer Vertikal', () => {
  it('bleibt am Boden (y=eye) und wird grounded', () => {
    const start: PlayerMotion = { x: 0, y: PLAYER.eye, z: 100, vy: 0, grounded: true };
    const r = stepPlayer(start, 0, 0, false, 0.016, solids);
    expect(r.y).toBe(PLAYER.eye);
    expect(r.grounded).toBe(true);
    expect(r.vy).toBe(0);
  });

  it('Sprung setzt vy auf jumpSpeed', () => {
    const start: PlayerMotion = { x: 0, y: PLAYER.eye, z: 100, vy: 0, grounded: true };
    const r = stepPlayer(start, 0, 0, true, 0.016, solids);
    expect(r.vy).toBe(PLAYER.jumpSpeed);
    expect(r.grounded).toBe(false);
  });

  it('fällt durch Gravitation nach unten, bis er den Boden erreicht', () => {
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 100, vy: 0, grounded: true };
    m = stepPlayer(m, 0, 0, true, 0.016, solids); // springen
    const topY = m.y;
    expect(m.y).toBeGreaterThan(PLAYER.eye + 0.01);
    // über lange Zeit wieder auf Boden
    for (let i = 0; i < 200 && m.grounded === false; i++) m = stepPlayer(m, 0, 0, false, 0.016, solids);
    expect(m.y).toBe(PLAYER.eye);
    expect(m.grounded).toBe(true);
    void topY;
  });
});

describe('Kollision horizontal', () => {
  it('Spieler läuft gegen ein Regal und dringt nicht ein', () => {
    const rack = solids.find((s) => s.kind === 'rack')!;
    // starte westlich vom Regal auf Höhe seiner Z-Mitte, laufe nach Osten (+x) hinein
    const cz = (rack.minZ + rack.maxZ) / 2;
    let m: PlayerMotion = { x: rack.minX - 3, y: PLAYER.eye, z: cz, vy: 0, grounded: true };
    for (let i = 0; i < 120; i++) {
      m = stepPlayer(m, 5, 0, false, 0.016, solids);
      expect(m.x).toBeLessThanOrEqual(rack.minX - PLAYER.radius + 1e-6);
    }
  });

  it('resolveAxis schiebt aus überlappender Box heraus', () => {
    // Nordwand ist dünn: Punkt in Wandmitte → Push heraus in -z
    const wall = solids.find((s) => s.kind === 'wall' && s.label === 'wand-nord')!;
    const pos = { x: 0, z: (wall.minZ + wall.maxZ) / 2 };
    resolveAxis(pos, [wall], 0.1);
    expect(pos.z).toBeLessThanOrEqual(wall.minZ - 0.1 + 1e-6);
  });
});

describe('pointFree', () => {
  it('Punkt in freiem Gang ist frei, Punkt im Regal nicht', () => {
    const rack = solids.find((s) => s.kind === 'rack')!;
    const inRack = { x: (rack.minX + rack.maxX) / 2, z: (rack.minZ + rack.maxZ) / 2 };
    expect(pointFree(inRack.x, inRack.z, solids)).toBe(false);
    // weit weg vom Regal (nahe Wandmitte, freier Gang) frei
    const freePt = { x: rack.minX - 2, z: (rack.minZ + rack.maxZ) / 2 };
    expect(pointFree(freePt.x, freePt.z, solids)).toBe(true);
  });
});

describe('wishSpeed', () => {
  it('yaw=0: w bewegt in -Z (Standard-Camera-Blickrichtung)', () => {
    const v = wishSpeed({ w: true, s: false, a: false, d: false, sprint: false }, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-PLAYER.walkSpeed);
  });

  it('diagonale Bewegung wird normalisiert (konstante Geschwindigkeit)', () => {
    const v = wishSpeed({ w: true, s: false, a: true, d: false, sprint: false }, 0);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(PLAYER.walkSpeed);
  });

  it('sprint nutzt sprintSpeed', () => {
    const v = wishSpeed({ w: true, s: false, a: false, d: false, sprint: true }, 0);
    expect(v.z).toBeCloseTo(-PLAYER.sprintSpeed);
  });

  it('keine Taste → keine Bewegung', () => {
    const v = wishSpeed({ w: false, s: false, a: false, d: false, sprint: false }, 1);
    expect(v).toEqual({ x: 0, z: 0 });
  });
});

describe('PLAYER Duck-Stance', () => {
  it('Duck-Zielhöhe liegt unter der Standhöhe', () => {
    expect(PLAYER.crouchEye).toBeGreaterThan(0);
    expect(PLAYER.crouchEye).toBeLessThan(PLAYER.eye);
  });

  it('Duck-Geschwindigkeit liegt unter walkSpeed', () => {
    expect(PLAYER.crouchSpeed).toBeGreaterThan(0);
    expect(PLAYER.crouchSpeed).toBeLessThan(PLAYER.walkSpeed);
    expect(PLAYER.walkSpeed).toBeLessThan(PLAYER.sprintSpeed);
  });

  it('wishSpeed mit crouchSpeed begrenzt das Tempo', () => {
    const v = wishSpeed({ w: true, s: false, a: false, d: false, sprint: false }, 0, PLAYER.crouchSpeed, PLAYER.sprintSpeed);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(PLAYER.crouchSpeed);
  });
});

describe('Vertikalität: Stufen, Kisten, Plattformen', () => {
  const box = (minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number, label = 'b'): import('./level').SolidBox =>
    ({ kind: 'prop', minX, maxX, minZ, maxZ, minY, maxY, label });
  const run = (m: PlayerMotion, mx: number, mz: number, jump: boolean, steps: number, s: import('./level').SolidBox[]): PlayerMotion => {
    for (let i = 0; i < steps; i++) m = stepPlayer(m, mx, mz, jump && i === 0, 0.016, s);
    return m;
  };

  it('groundHeight: Oberkante einer erreichbaren Box, sonst 0; zu hohe Box zählt nicht', () => {
    const low = box(-1, 1, -1, 1, 0, 0.5);
    expect(groundHeight(0, 0, 0, [low])).toBe(0.5);
    expect(groundHeight(5, 5, 0, [low])).toBe(0);
    const high = box(-1, 1, -1, 1, 0, 1.2);
    expect(groundHeight(0, 0, 0, [high])).toBe(0);
    expect(groundHeight(0, 0, 1.0, [high])).toBe(1.2);
  });

  it('blocksAt: Stufe blockiert nicht, Kiste blockiert, Decke über dem Kopf blockiert nicht', () => {
    expect(blocksAt(box(0, 1, 0, 1, 0, 0.5), 0)).toBe(false);
    expect(blocksAt(box(0, 1, 0, 1, 0, 1.2), 0)).toBe(true);
    expect(blocksAt(box(0, 1, 0, 1, 2.5, 2.8), 0)).toBe(false);
    expect(blocksAt(box(0, 1, 0, 1, 0, 1.2), 1.0)).toBe(false); // Fuß fast oben → Stufe
  });

  it('läuft auf eine niedrige Palette (0.5 m) ohne Sprung hinauf und wieder herunter', () => {
    const pallet = box(2, 4, -1, 1, 0, 0.5);
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    m = run(m, 4, 0, false, 60, [pallet]);
    expect(m.x).toBeGreaterThan(2.2);
    expect(m.y).toBeCloseTo(PLAYER.eye + 0.5, 5);
    expect(m.grounded).toBe(true);
    m = run(m, 4, 0, false, 80, [pallet]);
    expect(m.x).toBeGreaterThan(4.5);
    expect(m.y).toBeCloseTo(PLAYER.eye, 3);
  });

  it('eine 1 m Kiste blockiert beim Gehen, lässt sich aber überspringen', () => {
    const crate = box(1.5, 2.5, -1, 1, 0, 1.0);
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    m = run(m, 4, 0, false, 60, [crate]);
    expect(m.x).toBeLessThanOrEqual(1.5 - PLAYER.radius + 1e-6);
    // Sprung + Vorwärtsbewegung
    m = { x: 0.9, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    m = run(m, 3, 0, true, 35, [crate]); // Sprungbahn ≈ 0.5 s bis Landung auf 1 m
    expect(m.x).toBeGreaterThan(1.5);
    expect(m.y).toBeCloseTo(PLAYER.eye + 1.0, 3);
    expect(m.grounded).toBe(true);
  });

  it('Treppe aus Stufen führt auf eine Plattform; Fallen von der Kante landet am Boden', () => {
    const solids: import('./level').SolidBox[] = [];
    for (let i = 0; i < 8; i++) solids.push(box(1 + i * 0.4, 1.4 + i * 0.4, -1, 1, 0, 0.3 * (i + 1)));
    const platform = box(4.2, 10, -3, 3, 2.2, 2.4);
    solids.push(platform);
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    m = run(m, 4, 0, false, 120, solids);
    expect(m.x).toBeGreaterThan(5);
    expect(m.y).toBeCloseTo(PLAYER.eye + 2.4, 3);
    expect(m.grounded).toBe(true);
    // Weiter bis über die Kante → fällt auf den Hallenboden
    m = run(m, 4, 0, false, 200, solids);
    expect(m.x).toBeGreaterThan(10);
    expect(m.y).toBeCloseTo(PLAYER.eye, 3);
    expect(m.grounded).toBe(true);
  });

  it('unter einem Laufsteg (2.5 m) läuft man hindurch', () => {
    const catwalk = box(1, 5, -2, 2, 2.5, 2.75);
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    m = run(m, 4, 0, false, 100, [catwalk]);
    expect(m.x).toBeGreaterThan(5);
    expect(m.y).toBeCloseTo(PLAYER.eye, 5);
  });
});

describe('Rampen, Decken, Kanten (Collider)', () => {
  const ramp = (minX: number, maxX: number, minY: number, maxY: number, dir: ColItem['ramp'] = 'px'): ColItem =>
    ({ minX, maxX, minY, maxY, minZ: -2, maxZ: 2, mask: COL.all, ramp: dir });
  const slab = (minX: number, maxX: number, minY: number, maxY: number, minZ = -2, maxZ = 2): ColItem =>
    ({ minX, maxX, minY, maxY, minZ, maxZ, mask: COL.all });
  const run = (m: PlayerMotion, mx: number, mz: number, steps: number, w: Collider, jump = false): { m: PlayerMotion; maxDy: number; airFrames: number } => {
    let maxDy = 0;
    let airFrames = 0;
    for (let i = 0; i < steps; i++) {
      const prev = m.y;
      m = stepPlayer(m, mx, mz, jump && i === 0, 1 / 60, w);
      maxDy = Math.max(maxDy, Math.abs(m.y - prev));
      if (!m.grounded) airFrames++;
    }
    return { m, maxDy, airFrames };
  };

  it('läuft eine 30°-Rampe gleichmäßig hinauf und wieder hinunter, ohne zu hüpfen', () => {
    const h = Math.tan(Math.PI / 6) * 6; // 6 m lang, 30°
    const w = new Collider([ramp(2, 8, 0, h), slab(8, 14, 0, h)], { floorY: 0 });
    let r = run({ x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true }, 4.2, 0, 150, w);
    expect(r.m.x).toBeGreaterThan(9);
    expect(r.m.y).toBeCloseTo(PLAYER.eye + h, 3);
    expect(r.airFrames).toBe(0);
    // auf halber Rampe: Höhe folgt der Schräge
    r = run({ x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true }, 4.2, 0, 50, w);
    expect(r.m.y - PLAYER.eye).toBeCloseTo((r.m.x - 2) * Math.tan(Math.PI / 6), 1);
    // bergab: bleibt am Boden (kein Fallen/Hüpfen)
    const down = run({ x: 10, y: PLAYER.eye + h, z: 0, vy: 0, grounded: true }, -6.2, 0, 120, w);
    expect(down.m.x).toBeLessThan(1);
    expect(down.m.y).toBeCloseTo(PLAYER.eye, 3);
    expect(down.airFrames).toBe(0);
  });

  it('zu steile Rampe (60°) blockiert wie eine Wand', () => {
    const w = new Collider([ramp(2, 4, 0, 2 * Math.tan(Math.PI / 3))], { floorY: 0 });
    const r = run({ x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true }, 4, 0, 120, w);
    expect(r.m.x).toBeLessThan(2.2);
    expect(r.m.y).toBeLessThan(PLAYER.eye + 0.6);
  });

  it('von der Seite blockiert der hohe Teil einer Rampe, der niedrige ist Stufe', () => {
    const w = new Collider([{ minX: 0, maxX: 2, minZ: 0, maxZ: 10, minY: 0, maxY: 3, mask: COL.all, ramp: 'pz' }], { floorY: 0 });
    // bei z=8 ist die Rampe 2.4 m hoch → Wand
    let r = run({ x: -2, y: PLAYER.eye, z: 8, vy: 0, grounded: true }, 4, 0, 60, w);
    expect(r.m.x).toBeLessThanOrEqual(-PLAYER.radius + 1e-6);
    // bei z=1 nur 0.3 m → hinaufsteigen
    r = run({ x: -2, y: PLAYER.eye, z: 1, vy: 0, grounded: true }, 4, 0, 40, w);
    expect(r.m.x).toBeGreaterThan(0.5);
    expect(r.m.y).toBeGreaterThan(PLAYER.eye + 0.2);
  });

  it('Kopf stößt beim Springen unter einem niedrigen Laufsteg an und wird nicht seitlich weggeschoben', () => {
    const w = new Collider([slab(-3, 3, 2.2, 2.4)], { floorY: 0 });
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    let maxFeet = 0;
    for (let i = 0; i < 60; i++) {
      m = stepPlayer(m, 0, 0, i === 0, 1 / 60, w);
      maxFeet = Math.max(maxFeet, m.y - PLAYER.eye);
    }
    expect(maxFeet).toBeLessThanOrEqual(2.2 - PLAYER.height + 1e-6);
    expect(m.x).toBe(0);
    expect(m.grounded).toBe(true);
  });

  it('niedriger Durchgang (1.5 m) blockiert im Stand', () => {
    const w = new Collider([slab(2, 4, 1.5, 3)], { floorY: 0 });
    const r = run({ x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true }, 4, 0, 60, w);
    expect(r.m.x).toBeLessThanOrEqual(2 - PLAYER.radius + 1e-6);
  });

  it('Boden unter null (Tunnel) und Fallen von einer Kante', () => {
    const w = new Collider([slab(-5, 5, -4.3, -4), slab(5, 15, -0.3, 0)], { floorY: -50 });
    const r = run({ x: 10, y: PLAYER.eye, z: 0, vy: 0, grounded: true }, -4, 0, 120, w);
    expect(r.m.x).toBeLessThan(4);
    expect(r.m.y).toBeCloseTo(PLAYER.eye - 4, 3);
    expect(r.m.grounded).toBe(true);
  });
});
