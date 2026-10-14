import { describe, expect, it } from 'vitest';
import { generateLagerDaten } from './demo';
import { computeSolids, suggestZones } from './level';
import { PLAYER, stepPlayer, type PlayerMotion } from './move';
import { DOCK, MEZZANINE, generateStructures, groundBlockers, loadingDock, mezzanine } from './structures';

describe('mezzanine', () => {
  const parts = mezzanine(0, 0, 1);
  it('besteht aus Plattform, 4 Stützen, Treppe und Geländern', () => {
    expect(parts.filter((p) => p.kind === 'platform')).toHaveLength(1);
    expect(parts.filter((p) => p.kind === 'pillar')).toHaveLength(4);
    expect(parts.filter((p) => p.kind === 'step').length).toBeGreaterThanOrEqual(12);
    expect(parts.filter((p) => p.kind === 'rail')).toHaveLength(5);
    const plat = parts.find((p) => p.kind === 'platform')!;
    expect(plat.maxY).toBe(MEZZANINE.height);
  });

  it('Treppenstufen steigen monoton bis zur Plattformhöhe, jede ≤ Stufenhöhe', () => {
    const steps = parts.filter((p) => p.kind === 'step').sort((a, b) => a.minZ - b.minZ);
    let prev = MEZZANINE.height + 1e-9;
    for (const s of steps) {
      expect(s.maxY).toBeLessThanOrEqual(prev + 1e-9);
      expect(s.maxY - (prev === MEZZANINE.height + 1e-9 ? s.maxY : prev)).toBeLessThanOrEqual(PLAYER.step);
      prev = s.maxY;
    }
    expect(steps[0]!.maxY).toBeCloseTo(MEZZANINE.height, 5);
    expect(steps[steps.length - 1]!.maxY).toBeLessThanOrEqual(PLAYER.step);
  });

  it('ein Spieler kann die Treppe hochlaufen und steht dann auf der Plattform', () => {
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 12, vy: 0, grounded: true };
    for (let i = 0; i < 400; i++) m = stepPlayer(m, 0, -3.5, false, 0.016, parts);
    expect(m.z).toBeLessThan(MEZZANINE.depth / 2);
    expect(m.y).toBeCloseTo(PLAYER.eye + MEZZANINE.height, 3);
    // Geländer hält ihn auf der Plattform (Rückseite)
    for (let i = 0; i < 400; i++) m = stepPlayer(m, 0, -3.5, false, 0.016, parts);
    expect(m.z).toBeGreaterThan(-MEZZANINE.depth / 2 - 0.5);
    expect(m.y).toBeCloseTo(PLAYER.eye + MEZZANINE.height, 3);
  });

  it('Treppenrichtung −z spiegelt die Treppe', () => {
    const back = mezzanine(0, 0, -1);
    const steps = back.filter((p) => p.kind === 'step');
    for (const s of steps) expect(s.maxZ).toBeLessThanOrEqual(-MEZZANINE.depth / 2 + 1e-9);
  });
});

describe('loadingDock', () => {
  const inner = { minX: -30, maxX: 30, minZ: -40, maxZ: 40 };
  const dock = loadingDock(inner);
  it('Podest an der Südwand mit Stufen an beiden Enden', () => {
    const d = dock.find((p) => p.kind === 'dock')!;
    expect(d.maxZ).toBe(40);
    expect(d.maxY).toBe(DOCK.height);
    expect(d.maxX - d.minX).toBeCloseTo(60 * DOCK.widthRatio, 5);
    const steps = dock.filter((p) => p.kind === 'step');
    expect(steps.length).toBe(2 * Math.ceil(DOCK.height / DOCK.stepRise));
    expect(steps.some((s) => s.maxX <= d.minX + 1e-9)).toBe(true);
    expect(steps.some((s) => s.minX >= d.maxX - 1e-9)).toBe(true);
  });

  it('Spieler läuft über die Stufen aufs Podest', () => {
    const d = dock.find((p) => p.kind === 'dock')!;
    let m: PlayerMotion = { x: d.minX - 4, y: PLAYER.eye, z: 38, vy: 0, grounded: true };
    for (let i = 0; i < 300; i++) m = stepPlayer(m, 3.5, 0, false, 0.016, dock);
    expect(m.x).toBeGreaterThan(d.minX);
    expect(m.y).toBeCloseTo(PLAYER.eye + DOCK.height, 3);
  });
});

describe('generateStructures', () => {
  const lager = generateLagerDaten(12, 5, 'block');
  const zones = suggestZones(lager);
  const st = generateStructures(lager, zones, 2, 11);

  it('deterministisch, kollidiert nicht mit Regalen, hält Abstand zu Zonen', () => {
    expect(generateStructures(lager, zones, 2, 11)).toEqual(st);
    const racks = computeSolids(lager).filter((s) => s.kind === 'rack');
    for (const s of st) {
      for (const r of racks) {
        const overlap = s.minX < r.maxX && s.maxX > r.minX && s.minZ < r.maxZ && s.maxZ > r.minZ;
        expect(overlap).toBe(false);
      }
    }
    const plats = st.filter((s) => s.kind === 'platform');
    expect(plats.length).toBeGreaterThanOrEqual(1);
    for (const p of plats) {
      const cx = (p.minX + p.maxX) / 2;
      const cz = (p.minZ + p.maxZ) / 2;
      for (const z of [zones.t, zones.ct, zones.a, zones.b]) expect(Math.hypot(z[0] - cx, z[2] - cz)).toBeGreaterThan(8);
    }
  });

  it('groundBlockers lässt hohe Plattformen/Geländer für Bodenbots weg', () => {
    const gb = groundBlockers(st);
    expect(gb.every((s) => s.minY < 1.0)).toBe(true);
    expect(gb.some((s) => s.kind === 'pillar')).toBe(true);
    expect(gb.some((s) => s.kind === 'platform')).toBe(false);
  });
});
