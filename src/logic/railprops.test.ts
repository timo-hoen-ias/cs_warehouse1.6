import { describe, expect, it } from 'vitest';
import { MapBuilder } from './mapkit';
import { brushItem, colliderFromMap } from './mapcompile';
import { PLAYER, stepPlayer, type PlayerMotion } from './move';
import { dims, localPoint, place, worldDir } from './propgeom';
import { prop, propFootprint } from './mapprops';
import { RAIL_KINDS, WAGON, isRailKind, railProp } from './railprops';
import { buildNav } from './nav';

const ENV = { sunDir: [0, 1, 0] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };
const mk = () => new MapBuilder({ id: 'de_r', name: 'R', description: '', bounds: { min: [-60, -5, -60], max: [60, 20, 60] }, env: ENV });

describe('Geometrie-Helfer (propgeom)', () => {
  it('Vierteldrehungen: lokale Front +Z zeigt für rot 0..3 nach +Z, −X, −Z, +X', () => {
    expect(localPoint(0, 0, 0, 0, 1)).toEqual([0, 1]);
    expect(localPoint(0, 0, 1, 0, 1)[0]).toBe(-1);
    expect(localPoint(0, 0, 2, 0, 1)).toEqual([0, -1]);
    expect(localPoint(0, 0, 3, 0, 1)[0]).toBe(1);
    // Länge (+X) dreht mit
    expect(localPoint(0, 0, 1, 1, 0)).toEqual([0, 1]);
  });
  it('place: normalisiert min/max, dims tauscht bei ungerader Drehung', () => {
    expect(place(10, 5, 1, -2, -1, 2, 1)).toEqual([9, 3, 11, 7]);
    expect(dims(6, 2, 1)).toEqual([2, 6]);
    expect(dims(6, 2, 2)).toEqual([6, 2]);
  });
  it('worldDir: Rampenrichtung folgt der Drehung', () => {
    expect(worldDir(0, 0, -1)).toBe('nz');
    expect(worldDir(1, 0, -1)).toBe('px');
    expect(worldDir(2, 0, -1)).toBe('pz');
    expect(worldDir(3, 0, -1)).toBe('nx');
    expect(worldDir(0, 0, 1)).toBe('pz');
    expect(worldDir(1, 1, 0)).toBe('pz');
  });
});

describe('Bahn-Requisiten', () => {
  it('jede Art erzeugt gültige, deterministische Geometrie und ist als Bahn-Art erkannt', () => {
    for (const kind of RAIL_KINDS) {
      expect(isRailKind(kind)).toBe(true);
      const a = mk();
      prop(a, kind, 3, 0, -2, { rot: 1 });
      const c = mk();
      prop(c, kind, 3, 0, -2, { rot: 1 });
      expect(a.data.brushes.length + a.data.decor.length, kind).toBeGreaterThan(0);
      expect(JSON.stringify(a.data)).toBe(JSON.stringify(c.data));
      for (const br of a.data.brushes) for (let k = 0; k < 3; k++) expect(br.max[k]!, kind).toBeGreaterThan(br.min[k]!);
    }
    expect(isRailKind('crate')).toBe(false);
  });

  it('Gleis: Schienen im Regelspur-Abstand, Schwellen, alles ohne Kollision', () => {
    const b = mk();
    prop(b, 'track', 0, 0, 0, { len: 12 });
    const rails = b.data.brushes.filter((x) => x.mat === 'steel' && x.max[1] === WAGON.railTop);
    expect(rails).toHaveLength(2);
    const mid = (r: (typeof rails)[number]) => (r.min[2] + r.max[2]) / 2;
    expect(Math.abs(mid(rails[0]!) - mid(rails[1]!))).toBeCloseTo(WAGON.gauge, 3);
    expect(b.data.brushes.filter((x) => x.mat === 'wood').length).toBeGreaterThanOrEqual(14);
    expect(b.data.brushes.every((x) => x.collide === 'none')).toBe(true);
    // Gleis entlang Z (rot 1)
    const c = mk();
    prop(c, 'track', 0, 0, 0, { len: 12, rot: 1 });
    const bed = c.data.brushes.find((x) => x.mat === 'gravel')!;
    expect(bed.max[2] - bed.min[2]).toBeCloseTo(12, 5);
  });

  it('Wagen: Fußabdruck passt zu propFootprint, Puffer berühren sich beim Abstand WAGON.pitch', () => {
    expect(propFootprint('boxcar', 0)).toEqual([WAGON.length, WAGON.width]);
    expect(propFootprint('boxcar', 1)).toEqual([WAGON.width, WAGON.length]);
    expect(propFootprint('loco')[0]).toBe(WAGON.locoLength);
    const b = mk();
    prop(b, 'boxcar', 0, 0, 0, { tint: 0x884433 });
    const floor = b.data.brushes.find((x) => x.top === 'wood')!;
    expect(floor.max[0] - floor.min[0]).toBe(WAGON.length);
    const buffer = b.data.brushes.filter((x) => x.mat === 'black' && x.max[0] > WAGON.length / 2);
    expect(Math.max(...buffer.map((x) => x.max[0])) * 2).toBeCloseTo(WAGON.pitch, 5);
  });

  it('geschlossener Güterwagen: Boden und Dach sind kein Navigationsboden, Wände blockieren', () => {
    const b = mk();
    b.floor(-30, -30, 30, 30, 0, 'concrete');
    prop(b, 'boxcar', 0, 0, 0, { doors: 'closed' });
    const g = buildNav(colliderFromMap(b.data));
    let inside = 0;
    for (let i = 0; i < g.count; i++) if (g.y[i]! > 1) inside++;
    expect(inside).toBe(0);
    // von der Seite gegen die geschlossene Wand: man kommt nicht hinein (und nicht unter den Wagen)
    const col = colliderFromMap(b.data);
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 8, vy: 0, grounded: true };
    for (let i = 0; i < 300; i++) m = stepPlayer(m, 0, -4, false, 1 / 60, col);
    expect(m.z).toBeGreaterThan(WAGON.width / 2);
  });

  it('Güterwagen mit offener Tür + Rampe: für jede Drehung hinaufgehen und innen stehen (Kopffreiheit)', () => {
    for (const rot of [0, 1, 2, 3] as const) {
      const b = mk();
      b.floor(-30, -30, 30, 30, 0, 'concrete');
      prop(b, 'boxcar', 10, 0, 10, { rot, doors: 'both', ramp: 'both', tint: 0x884433 });
      const col = colliderFromMap(b.data);
      for (const [side, lz] of [['front', 6], ['back', -6]] as const) {
        const [sx, sz] = localPoint(10, 10, rot, 0, lz);
        const [ex, ez] = localPoint(0, 0, rot, 0, side === 'front' ? -1 : 1);
        let m: PlayerMotion = { x: sx, y: PLAYER.eye, z: sz, vy: 0, grounded: true };
        for (let i = 0; i < 140; i++) m = stepPlayer(m, ex * 3, ez * 3, false, 1 / 60, col);
        const [ix, iz] = localPoint(10, 10, rot, 0, 0);
        expect(Math.hypot(m.x - ix, m.z - iz), `rot ${rot} ${side}: im Wagen`).toBeLessThan(1.4);
        expect(m.y - PLAYER.eye, `rot ${rot} ${side}: Bodenhöhe`).toBeCloseTo(WAGON.floor, 2);
        expect(col.blockedAt(m.x, m.z, WAGON.floor, PLAYER.radius, PLAYER.height, PLAYER.step), `rot ${rot} ${side}: frei`).toBe(false);
      }
    }
  });

  it('nur die offene Seite bekommt eine Rampe; Dach ist nur mit walkRoof Navigationsboden', () => {
    const a = mk();
    prop(a, 'boxcar', 0, 0, 0, { doors: 'front', ramp: 'both' });
    expect(a.data.brushes.filter((x) => x.ramp)).toHaveLength(1);
    const roofOf = (bld: MapBuilder) => bld.data.brushes.find((x) => x.mat === 'metal' && x.max[1] > WAGON.roof)!;
    expect(brushItem(roofOf(a), 0)!.noNav).toBe(true);
    const c = mk();
    prop(c, 'boxcar', 0, 0, 0, { walkRoof: true });
    expect(brushItem(roofOf(c), 0)!.noNav).toBeFalsy();
    expect(roofOf(c).max[1]).toBeCloseTo(WAGON.roof + 0.14, 5);
  });

  it('Frachtcontainer: Maße, Türplatte wirft keinen Schatten, offene Wagen bekommen eine Innenleuchte', () => {
    const c = mk();
    prop(c, 'cargoContainer', 0, 0, 0, { tint: 0xaa3322 });
    const body = c.data.brushes.find((x) => x.mat === 'container' && (x.collide ?? 'all') === 'all')!;
    expect(body.max[0] - body.min[0]).toBeCloseTo(6.06, 2);
    expect(c.data.brushes.filter((x) => x.occlude === false && x.mat === 'door')).toHaveLength(1);
    const long = mk();
    prop(long, 'cargoContainer', 0, 0, 0, { len: 12.19 });
    expect(long.data.brushes[0]!.max[0] - long.data.brushes[0]!.min[0]).toBeCloseTo(12.19, 2);
    const open = mk();
    prop(open, 'boxcar', 0, 0, 0, { doors: 'both' });
    expect(open.data.lights).toHaveLength(1);
    const closed = mk();
    prop(closed, 'boxcar', 0, 0, 0, {});
    expect(closed.data.lights).toHaveLength(0);
  });

  it('Flachwagen: n Container (1 mittig, 2 an den Enden), levels stapelt; Kesselwagen kollidiert schmaler als sichtbar', () => {
    const one = mk();
    prop(one, 'flatcar', 0, 0, 0, { n: 1 });
    expect(one.data.brushes.filter((x) => x.mat === 'container')).toHaveLength(1);
    const four = mk();
    prop(four, 'flatcar', 0, 0, 0, { n: 2, levels: 2 });
    const cont = four.data.brushes.filter((x) => x.mat === 'container');
    expect(cont).toHaveLength(4);
    expect(Math.max(...cont.map((x) => x.max[1]))).toBeCloseTo(WAGON.floor + 2 * 2.59, 5);
    const none = mk();
    prop(none, 'flatcar', 0, 0, 0, {});
    expect(none.data.brushes.some((x) => x.mat === 'container')).toBe(false);
    const t = mk();
    prop(t, 'tankcar', 0, 0, 0, {});
    const hit = t.data.brushes.find((x) => x.visible === false)!;
    expect(hit.max[2]).toBeLessThan(0.15 * 8.6);
    expect(t.data.decor.some((d) => d.kind === 'pipeX')).toBe(true);
  });

  it('Loks und Prellbock: massiv, aber ohne Navigationsboden auf der Lok', () => {
    const b = mk();
    b.floor(-30, -30, 30, 30, 0, 'concrete');
    railProp(b, 'loco', 0, 0, 0);
    const g = buildNav(colliderFromMap(b.data));
    for (let i = 0; i < g.count; i++) expect(g.y[i]!).toBeLessThan(0.5);
    const s = mk();
    prop(s, 'bufferStop', 0, 0, 0);
    expect(s.data.brushes.some((x) => (x.collide ?? 'all') === 'all')).toBe(true);
  });

  it('Signal: n wählt die leuchtende Lampe und das Licht, Fahrleitung/Efeu/Binder sind reine Optik', () => {
    const r = mk();
    prop(r, 'signal', 0, 0, 0, { n: 0 });
    const g = mk();
    prop(g, 'signal', 0, 0, 0, { n: 1 });
    expect(r.data.lights[0]!.color).not.toBe(g.data.lights[0]!.color);
    expect(r.data.brushes.filter((x) => x.mat === 'emissive')).toHaveLength(1);
    for (const kind of ['catenary', 'ivy', 'truss'] as const) {
      const b = mk();
      prop(b, kind, 0, 4, 0, { len: 30 });
      const solid = b.data.brushes.filter((x) => (x.collide ?? 'all') !== 'none');
      // Fahrleitung: nur die Masten kollidieren
      expect(solid.every((x) => x.tag === 'pillar'), kind).toBe(true);
    }
  });

  it('Efeu: Blattflächen liegen hinter der Vorderkante, Höhe überschreitet h nicht', () => {
    const b = mk();
    prop(b, 'ivy', 0, 0, 0, { len: 8, h: 3, rot: 0, seed: 5 });
    expect(b.data.brushes.length).toBeGreaterThan(4);
    for (const x of b.data.brushes) {
      expect(x.mat).toBe('foliage');
      expect(x.max[1]).toBeLessThanOrEqual(3 + 1e-9);
      expect(x.min[2]).toBeGreaterThanOrEqual(0);
      expect(x.max[2]).toBeLessThan(0.4);
    }
  });
});

describe('Laufsteg (MapBuilder.walkway)', () => {
  it('Rost mit Geländer auf beiden Längsseiten, begehbar; Geländer blockiert', () => {
    const b = mk();
    b.floor(-20, -20, 20, 20, 0, 'concrete');
    b.ramp(-6, -1, 0, 1, 0, 3, 'px', 'steel');
    b.walkway(0, -1, 12, 1, 3);
    expect(b.data.brushes.filter((x) => x.tag === 'rail' && x.collide === 'move')).toHaveLength(2);
    const col = colliderFromMap(b.data);
    let m: PlayerMotion = { x: -5, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
    for (let i = 0; i < 240; i++) m = stepPlayer(m, 4, 0, false, 1 / 60, col);
    expect(m.y - PLAYER.eye).toBeCloseTo(3, 2);
    expect(m.x).toBeGreaterThan(8);
    // seitlich gegen das Geländer: bleibt auf dem Steg
    for (let i = 0; i < 120; i++) m = stepPlayer(m, 0, 4, false, 1 / 60, col);
    expect(m.y - PLAYER.eye).toBeCloseTo(3, 2);
    expect(Math.abs(m.z)).toBeLessThan(1);
    const one = mk();
    one.walkway(0, 0, 2, 10, 3, { rails: 'a' });
    expect(one.data.brushes.filter((x) => x.tag === 'rail' && x.collide === 'move')).toHaveLength(1);
  });
});
