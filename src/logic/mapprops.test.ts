import { describe, expect, it } from 'vitest';
import { MapBuilder } from './mapkit';
import { prop, propFootprint, type PropKind } from './mapprops';
import { brushItem, colliderFromMap } from './mapcompile';
import { PLAYER, stepPlayer, type PlayerMotion } from './move';

const ENV = { sunDir: [0, 1, 0] as [number, number, number], sunColor: 0xffffff, sunIntensity: 1, skyTop: 0x88aaff, skyHorizon: 0xddeeff, skyIntensity: 0.5, ambient: 0.1, fogColor: 0x999999, fogNear: 50, fogFar: 200 };
const mk = () => new MapBuilder({ id: 'de_p', name: 'P', description: '', bounds: { min: [-50, -5, -50], max: [50, 20, 50] }, env: ENV });

const ALL: PropKind[] = [
  'pallet', 'palletStack', 'palletGoods', 'crate', 'crateStack', 'gitterbox', 'container', 'container40', 'trailer', 'truck', 'forklift',
  'barrel', 'barrelGroup', 'drum', 'rack', 'shelf', 'serverRack', 'serverRow', 'ups', 'cooler', 'conveyor', 'cartons', 'ibc', 'desk',
  'bumper', 'lampPost', 'fence', 'handTruck', 'cableTray', 'locker', 'generator', 'rollerDoor', 'acUnit', 'electricBox', 'cones', 'doorSteel',
  'silo', 'chiller', 'compressor', 'stripCurtain', 'rollCage',
  'sacks', 'van', 'fountain', 'hoist', 'archGate', 'archive', 'crane', 'scaffold', 'gasLamp', 'logs',
];

describe('Requisiten', () => {
  it('jede Art erzeugt Brushes oder Deko mit gültigen Maßen, deterministisch', () => {
    for (const kind of ALL) {
      const a = mk();
      prop(a, kind, 3, 1, -2, { rot: 1 });
      const b = mk();
      prop(b, kind, 3, 1, -2, { rot: 1 });
      expect(a.data.brushes.length + a.data.decor.length, kind).toBeGreaterThan(0);
      expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
      for (const br of a.data.brushes) for (let k = 0; k < 3; k++) expect(br.max[k]!, kind).toBeGreaterThan(br.min[k]!);
    }
  });

  it('Drehung um 90° tauscht die Grundfläche (Container 6 m entlang Z)', () => {
    const b = mk();
    prop(b, 'container', 0, 0, 0, { rot: 1, tint: 0xff0000 });
    const body = b.data.brushes.find((x) => x.mat === 'container')!;
    expect(body.max[0] - body.min[0]).toBeCloseTo(2.44, 2);
    expect(body.max[2] - body.min[2]).toBeCloseTo(6.06, 2);
    expect(propFootprint('container', 1)).toEqual([2.44, 6.1]);
  });

  it('blockierende Requisiten kollidieren; hohe Oberseiten sind kein Navigationsboden', () => {
    const b = mk();
    prop(b, 'forklift', 0, 0, 0);
    const col = b.data.brushes.map((x, i) => brushItem(x, i)).filter(Boolean);
    expect(col.length).toBe(1);
    expect(col[0]!.noNav).toBe(true); // 2.1 m hoch
    const c = mk();
    prop(c, 'crate', 0, 0, 0, { h: 1.2 });
    expect(brushItem(c.data.brushes[0]!, 0)!.noNav).toBeFalsy();
  });

  it('Serverreihe: eine Kollisionsbox + je Schrank eine Deko-Instanz', () => {
    const b = mk();
    prop(b, 'serverRow', 0, 0, 0, { n: 5 });
    expect(b.data.decor.filter((d) => d.kind === 'serverRack')).toHaveLength(5);
    expect(b.data.brushes.filter((x) => (x.collide ?? 'all') === 'all')).toHaveLength(1);
  });

  it('Rolltor liegt vor der Wand (lokal +Z), Zaun blockiert nur Bewegung', () => {
    const b = mk();
    prop(b, 'rollerDoor', 0, 0, 10, { rot: 2 });
    const gate = b.data.brushes.find((x) => x.mat === 'gate')!;
    expect(gate.max[2]).toBeLessThanOrEqual(10 + 1e-9);
    expect(gate.uvFit).toBe(true);
    const f = mk();
    prop(f, 'fence', 0, 0, 0, { len: 6 });
    expect(f.data.brushes[0]!.collide).toBe('move');
  });
  it('Silo: Achteck-Kern aus drei Quadern, Zylinder + Kuppel als Deko, Leiter ohne Kollision', () => {
    const b = mk();
    prop(b, 'silo', 10, 0, 20, { len: 6, h: 14 });
    const solid = b.data.brushes.filter((x) => (x.collide ?? 'all') === 'all');
    expect(solid).toHaveLength(3);
    expect(solid.every((x) => x.visible === false && x.occlude === true && x.noNav === true)).toBe(true);
    const items = solid.map((x, i) => brushItem(x, i)!);
    const hit = (px: number, pz: number): boolean => items.some((it) => px > it.minX && px < it.maxX && pz > it.minZ && pz < it.maxZ);
    expect(hit(10 + 2.6, 20)).toBe(true); // nahe der Rundung in den Himmelsrichtungen
    expect(hit(10, 20 + 2.6)).toBe(true);
    expect(hit(10 + 2.4, 20 + 2.4)).toBe(false); // Ecken des Umrisskastens sind frei
    expect(hit(10 + 3.4, 20)).toBe(false);
    const tank = b.data.decor.find((d) => d.kind === 'tank')!;
    expect(tank.scale).toEqual([3, 14, 3]);
    const dome = b.data.decor.find((d) => d.kind === 'tankDome')!;
    expect(dome.pos[1]).toBe(14);
    expect(b.data.brushes.filter((x) => x.collide === 'none').length).toBeGreaterThan(20);
  });

  it('Kälte-Requisiten: Verflüssiger, Verdichter, Streifenvorhang, Rollcontainer', () => {
    const b = mk();
    prop(b, 'chiller', 0, 0, 0);
    prop(b, 'compressor', 5, 0, 0);
    prop(b, 'stripCurtain', 10, 0, 0, { len: 3, h: 2.5, rot: 1 });
    prop(b, 'rollCage', 15, 0, 0, { h: 0.9 });
    expect(b.data.decor.map((d) => d.kind)).toEqual(['condenser', 'compressor', 'stripCurtain']);
    expect(b.data.decor[2]!.scale).toEqual([3, 2.5, 1]);
    expect(b.data.decor[2]!.rot).toBeCloseTo(Math.PI / 2);
    // Verflüssiger: Füße + Körper blockieren, Spalt darunter ist nur 0.55 m hoch
    const body = b.data.brushes.find((x) => x.mat === 'white')!;
    expect(body.min[1]).toBeCloseTo(0.55);
    // Rollcontainer: Gitter nur Bewegung, Ware blockiert auch Schüsse
    const cage = b.data.brushes.find((x) => x.mat === 'cage')!;
    expect(cage.collide).toBe('move');
    expect(b.data.brushes.find((x) => x.mat === 'carton')!.collide).toBeUndefined();
  });

  it('Tiefkühl-Palette: Ware in Weiß/Blau-Tönen, deterministisch', () => {
    const cold = mk();
    for (let i = 0; i < 12; i++) prop(cold, 'palletGoods', i * 2, 0, 0, { cold: true });
    const warm = mk();
    for (let i = 0; i < 12; i++) prop(warm, 'palletGoods', i * 2, 0, 0);
    const tints = (m: MapBuilder): number[] => m.data.brushes.filter((x) => x.mat === 'wrap').map((x) => x.tint!);
    const blueish = (c: number): boolean => Math.min(c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff) >= 0x9f; // hell, kein Karton-Braun
    expect(tints(cold).every(blueish)).toBe(true);
    expect(tints(warm).some((c) => !blueish(c))).toBe(true);
    // Tiefkühl-Kartons und Regalware sind Folie (hell), nicht brauner Karton
    const c2 = mk();
    prop(c2, 'cartons', 0, 0, 0, { cold: true, n: 5 });
    prop(c2, 'rack', 4, 0, 0, { cold: true });
    prop(c2, 'shelf', 8, 0, 0, { cold: true });
    expect(c2.data.brushes.some((x) => x.mat === 'carton')).toBe(false);
    const w2 = mk();
    prop(w2, 'cartons', 0, 0, 0, { n: 5 });
    expect(w2.data.brushes.some((x) => x.mat === 'carton')).toBe(true);
  });
  it('Sackstapel: Pyramide, eine Kollisionsbox je Lage, zwei Säcke tief, Deko je Sack', () => {
    const b = mk();
    prop(b, 'sacks', 0, 0, 0, { len: 3.6, n: 4 });
    const solid = b.data.brushes.filter((x) => (x.collide ?? 'all') === 'all');
    expect(solid).toHaveLength(4);
    // jede Lage ist einen Sack (0.9 m) kürzer und 0.28 m höher
    const widths = solid.map((x) => x.max[0] - x.min[0]);
    expect(widths[0]).toBeCloseTo(3.6);
    expect(widths[1]).toBeCloseTo(2.7);
    expect(widths[3]).toBeCloseTo(0.9);
    expect(solid[3]!.max[1]).toBeCloseTo(4 * 0.28);
    // 4 + 3 + 2 + 1 Säcke je Reihe, zwei Reihen tief
    expect(b.data.decor.filter((d) => d.kind === 'sack')).toHaveLength(20);
    // zu viele Lagen für die Länge: Stapel endet an der Spitze (len 1.8 → nur zwei Lagen)
    const c = mk();
    prop(c, 'sacks', 0, 0, 0, { len: 1.8, n: 6 });
    expect(c.data.brushes.filter((x) => (x.collide ?? 'all') === 'all')).toHaveLength(2);
    // gedreht: Breite liegt entlang Z
    const d = mk();
    prop(d, 'sacks', 0, 0, 0, { len: 3.6, n: 1, rot: 1 });
    expect(d.data.brushes[0]!.max[2] - d.data.brushes[0]!.min[2]).toBeCloseTo(3.6);
  });

  it('Lieferwagen und Brunnen: Kollision plus Deko-Modell, Beckenrand ist kein Navigationsboden', () => {
    const b = mk();
    prop(b, 'van', 0, 0, 0, { tint: 0xaa2222 });
    expect(b.data.decor).toHaveLength(1);
    expect(b.data.decor[0]!.kind).toBe('van');
    expect(b.data.decor[0]!.tint).toBe(0xaa2222);
    const hull = b.data.brushes.filter((x) => (x.collide ?? 'all') === 'all');
    expect(hull).toHaveLength(2);
    expect(Math.max(...hull.map((x) => x.max[1]))).toBeGreaterThan(2);
    const f = mk();
    prop(f, 'fountain', 0, 0, 0, { len: 4.4 });
    expect(f.data.decor[0]!.kind).toBe('fountain');
    expect(f.data.decor[0]!.scale).toEqual([2.2, 1, 2.2]);
    const rim = f.data.brushes.filter((x) => x.max[1] === 0.75);
    expect(rim).toHaveLength(3);
    expect(rim.every((x) => x.noNav === true)).toBe(true);
  });

  it('Seilwinden-Erker: nur Optik, Last nur auf Wunsch', () => {
    const plain = mk();
    prop(plain, 'hoist', 0, 4, 0, { len: 1.6, h: 2.4 });
    expect(plain.data.brushes.every((x) => x.collide === 'none')).toBe(true);
    const loaded = mk();
    prop(loaded, 'hoist', 0, 4, 0, { len: 1.6, h: 2.4, n: 1 });
    expect(loaded.data.brushes.length).toBe(plain.data.brushes.length + 1);
    expect(loaded.data.brushes.some((x) => x.mat === 'crate')).toBe(true);
    // Balken ragt in lokal +Z aus der Wand (rot 0), gedreht nach −X
    const rot = mk();
    prop(rot, 'hoist', 0, 4, 0, { rot: 1 });
    expect(Math.min(...rot.data.brushes.map((x) => x.min[0]))).toBeLessThan(-1.4);
  });

  it('Torbogen: Pfeiler blockieren, Durchgang ist frei, Zwickel blocken nur Schüsse, Rundbogen als Deko', () => {
    const b = mk();
    b.floor(-10, -10, 10, 10, 0, 'concrete');
    prop(b, 'archGate', 0, 0, 0, { len: 5, h: 4.4, n: 1.2 });
    const ring = b.data.decor.find((d) => d.kind === 'archRing')!;
    expect(ring.pos[1]).toBeCloseTo(4.4 - 2.5); // Kämpferhöhe = Scheitel − Radius
    expect(ring.scale![0]).toBeCloseTo(2.5);
    const col = colliderFromMap(b.data);
    // Läuft man entlang Z durch die Mitte, stoppt der Bogen nicht
    let m: PlayerMotion = { x: 0, y: PLAYER.eye, z: 6, vy: 0, grounded: true };
    for (let i = 0; i < 200; i++) m = stepPlayer(m, 0, -4, false, 1 / 60, col);
    expect(m.z).toBeLessThan(-4);
    // durch den Pfeiler (x = −3.1) kommt man nicht
    let p: PlayerMotion = { x: -3.1, y: PLAYER.eye, z: 6, vy: 0, grounded: true };
    for (let i = 0; i < 200; i++) p = stepPlayer(p, 0, -4, false, 1 / 60, col);
    expect(p.z).toBeGreaterThan(0.2);
    // Zwickel über dem Kämpfer: Schuss blockiert, Bewegung nicht
    const spandrel = b.data.brushes.filter((x) => x.collide === 'shot');
    expect(spandrel).toHaveLength(14); // 7 Scheiben je Seite (die Scheitelscheibe entfällt)
    expect(spandrel.every((x) => x.max[1] === 4.4)).toBe(true);
  });

  it('Aktenregal, Hafenkran, Baugerüst, Gaslaterne, Baumstämme', () => {
    const a = mk();
    prop(a, 'archive', 0, 0, 0, { len: 2.4 });
    expect(a.data.brushes.filter((x) => (x.collide ?? 'all') === 'all')).toHaveLength(1);
    expect(a.data.brushes.filter((x) => x.mat === 'carton').length).toBeGreaterThan(10);
    const c = mk();
    prop(c, 'crane', 0, 0, 0, { h: 11, len: 9 });
    const solid = c.data.brushes.filter((x) => (x.collide ?? 'all') === 'all');
    expect(solid).toHaveLength(2); // Sockel + Mast, Ausleger und Gegengewicht ohne Kollision
    expect(Math.max(...c.data.brushes.map((x) => x.max[0]))).toBeCloseTo(9);
    const s = mk();
    prop(s, 'scaffold', 0, 0, 0, { len: 4, h: 6 });
    expect(s.data.brushes.every((x) => x.collide === 'none' && x.noNav === true)).toBe(true);
    expect(s.data.brushes.filter((x) => x.mat === 'wood')).toHaveLength(3); // Bohlen auf 2, 4 und 6 m
    const g = mk();
    prop(g, 'gasLamp', 5, 0, 5);
    expect(g.data.decor.map((d) => d.kind)).toEqual(['lantern']);
    expect(g.data.lights).toHaveLength(1);
    expect(g.data.lights[0]!.pos[1]).toBeGreaterThan(3.5);
    expect(g.data.brushes[0]!.tag).toBe('pillar');
    const l = mk();
    prop(l, 'logs', 0, 0, 0, { len: 3.2, n: 3 });
    expect(l.data.decor.filter((d) => d.kind === 'log')).toHaveLength(6); // 3 + 2 + 1
    expect(l.data.decor.every((d) => d.scale![0] === 3.2)).toBe(true);
    expect(l.data.brushes[0]!.noNav).toBe(true);
  });
});
