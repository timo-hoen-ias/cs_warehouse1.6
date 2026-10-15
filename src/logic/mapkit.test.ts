import { describe, expect, it } from 'vitest';
import { MATERIALS, MapBuilder, type MaterialId } from './mapkit';
import { colliderFromMap } from './mapcompile';
import { PLAYER, stepPlayer, type PlayerMotion } from './move';

const ENV = { sunDir: [0, 1, 0] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };
const mk = () => new MapBuilder({ id: 'de_t', name: 'T', description: '', bounds: { min: [-50, -5, -50], max: [50, 20, 50] }, env: ENV });

describe('MapBuilder', () => {
  it('box normalisiert min/max und übernimmt Optionen', () => {
    const b = mk();
    const br = b.box([2, 3, 4], [0, 0, 0], 'crate', { tint: 0xff0000 });
    expect(br.min).toEqual([0, 0, 0]);
    expect(br.max).toEqual([2, 3, 4]);
    expect(br.tint).toBe(0xff0000);
    expect(b.data.brushes).toHaveLength(1);
  });

  it('floor/roof: Oberkante bzw. Unterkante an der angegebenen Höhe', () => {
    const b = mk();
    const f = b.floor(0, 0, 4, 4, 2, 'concrete');
    expect(f.max[1]).toBe(2);
    const r = b.roof(0, 0, 4, 4, 6);
    expect(r.min[1]).toBe(6);
    expect(r.tag).toBe('roof');
    expect(r.noNav).toBe(true);
  });

  it('Wand mit Tür und Fenster wird in Pfeiler, Sturz und Brüstung zerlegt', () => {
    const b = mk();
    const parts = b.wallX(0, 10, 0, 0, 4, 'brick', [{ from: 2, to: 4, bottom: 0, top: 2.5 }, { from: 6, to: 8, bottom: 1, top: 2 }]);
    // links, Sturz Tür, Mitte, Brüstung Fenster, Sturz Fenster, rechts
    expect(parts).toHaveLength(6);
    const total = parts.reduce((s, p) => s + (p.max[0] - p.min[0]) * (p.max[1] - p.min[1]), 0);
    expect(total).toBeCloseTo(40 - 2 * 2.5 - 2 * 1, 5);
    // Durchgang frei: kein Teil überdeckt x=3, y=1
    expect(parts.some((p) => p.min[0] < 3 && p.max[0] > 3 && p.min[1] < 1 && p.max[1] > 1)).toBe(false);
  });

  it('Treppe: Stufen blockieren nur Schüsse, unsichtbare Clip-Rampe macht sie begehbar', () => {
    const b = mk();
    b.floor(-10, -5, 20, 5, 0, 'concrete');
    const parts = b.stairs(0, -1, 4, 1, 0, 2, 'px', 'steel');
    const steps = parts.filter((p) => p.tag === 'stairs');
    expect(steps.length).toBe(10);
    expect(steps.every((p) => p.collide === 'shot')).toBe(true);
    expect(parts.some((p) => p.ramp === 'px' && p.visible === false && p.collide === 'move')).toBe(true);
    b.floor(4, -1, 10, 1, 2, 'concrete');
    const col = colliderFromMap(b.data);
    let m: PlayerMotion = { x: -2, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    let air = 0;
    for (let i = 0; i < 160; i++) {
      m = stepPlayer(m, 4, 0, false, 1 / 60, col);
      if (!m.grounded) air++;
    }
    expect(m.x).toBeGreaterThan(6);
    expect(m.y).toBeCloseTo(PLAYER.eye + 2, 3);
    expect(air).toBe(0);
  });

  it('Treppe in alle vier Richtungen: Stufen überlappen nicht und steigen in Laufrichtung', () => {
    for (const dir of ['px', 'nx', 'pz', 'nz'] as const) {
      const b = mk();
      const steps = b.stairs(0, 0, 4, 4, 0, 1, dir).filter((p) => p.tag === 'stairs');
      for (let i = 1; i < steps.length; i++) expect(steps[i]!.max[1]).toBeGreaterThan(steps[i - 1]!.max[1]);
      const vol = steps.reduce((s, p) => s + (p.max[0] - p.min[0]) * (p.max[2] - p.min[2]), 0);
      expect(vol).toBeCloseTo(16, 5);
      const first = steps[0]!;
      const last = steps.at(-1)!;
      const c = (p: typeof first) => (dir === 'px' || dir === 'nx' ? (p.min[0] + p.max[0]) / 2 : (p.min[2] + p.max[2]) / 2);
      expect(dir === 'px' || dir === 'pz' ? c(last) > c(first) : c(last) < c(first)).toBe(true);
    }
  });

  it('Geländer: unsichtbarer Bewegungs-Clip + Deko ohne Kollision', () => {
    const b = mk();
    b.rail(0, 0, 6, 0, 2);
    const clip = b.data.brushes.filter((p) => p.collide === 'move');
    expect(clip).toHaveLength(1);
    expect(clip[0]!.visible).toBe(false);
    expect(b.data.brushes.filter((p) => p.collide === 'none').length).toBeGreaterThan(3);
  });

  it('Spawn-Raster, Spots, Kaufzonen, Bereiche, Lichter, Akustik', () => {
    const b = mk();
    b.spawnGrid('T', 0, 0, 0, 4, 2, 2, 0);
    expect(b.data.spawns).toHaveLength(8);
    expect(b.data.spawns[0]!.pos).toEqual([-3, 0, -1]);
    b.site('A', 'Spot A', [0, 0, 0], [5, 3, 5], [2, 0, 2]);
    b.buy('CT', 5, 5, 0, 0);
    expect(b.data.buyZones[0]!.min).toEqual([0, -20, 0]);
    b.area('Mitte', 10, 10, 0, 0);
    expect(b.data.areas[0]!.max[0]).toBe(10);
    b.hallLamp(0, 8, 0);
    b.tubeLamp(0, 3, 0, true);
    expect(b.data.lights).toHaveLength(2);
    expect(b.data.decor.map((d) => d.kind)).toEqual(['lampHall', 'lampTube']);
    b.room('hall', [0, 0, 0], [1, 1, 1]);
    b.ambient('machine', [0, 0, 0], 10);
    expect(b.data.acoustics.zones).toHaveLength(1);
    expect(b.data.acoustics.emitters).toHaveLength(1);
  });

  it('jedes Material hat Oberfläche und Texturmaßstab', () => {
    for (const [id, m] of Object.entries(MATERIALS) as [MaterialId, (typeof MATERIALS)[MaterialId]][]) {
      expect(m.uv, id).toBeGreaterThan(0);
      expect(['concrete', 'metal', 'grate', 'wood', 'gravel', 'tile']).toContain(m.surface);
    }
  });
});
