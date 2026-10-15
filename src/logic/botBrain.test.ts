import { describe, expect, it } from 'vitest';
import { analyzeMap, siteInfo, type BotMapInfo } from './botMap';
import { BotBrain, bombFlight, findCover, type BrainInput, type SeenEnemy } from './botBrain';
import { makeTask, type Task } from './botCoach';
import { newKnowledge, report, sighting } from './botKnowledge';
import { BOT_TEST_ENV, buildBotTestMap } from './botTestMap';
import { MapBuilder } from './mapkit';
import { defaultLoadout, giveWeapon, type Loadout } from './loadout';
import { compileMap } from './mapcompile';
import type { XYZ } from './nav';
import { mulberry32 } from './rng';

const m = compileMap(buildBotTestMap());
const info: BotMapInfo = analyzeMap({ nav: m.nav, collider: m.collider, sites: m.sites, spawns: m.spawns });

function armed(team: 'T' | 'CT' = 'CT'): Loadout {
  const lo = defaultLoadout(team);
  giveWeapon(lo, team === 'T' ? 'ak47' : 'm4a1');
  return lo;
}

function input(over: Partial<BrainInput> & { pos?: XYZ; lo?: Loadout; task?: Task | null; weapon?: string; stillFor?: number; yaw?: number } = {}): BrainInput {
  const pos = over.pos ?? { x: 10, y: 0, z: 18 };
  const lo = over.lo ?? armed();
  return {
    now: 50, elapsed: 50, dt: 0.05, phase: 'live', info, col: m.collider, smokes: [],
    self: { pos, eye: { x: pos.x, y: pos.y + 1.65, z: pos.z }, yaw: over.yaw ?? Math.PI, hp: 100, loadout: lo, weapon: over.weapon ?? lo.primary ?? 'usp', crouch: false, stillFor: over.stillFor ?? 1, reloading: false, blind: 0, ahead: null, inSite: true },
    visible: [], mates: [], know: newKnowledge('CT'), task: over.task ?? null,
    bomb: { phase: 'none', pos: null, fuseLeft: 0, progress: 0 },
    ...over,
  };
}

const enemy = (pos: XYZ, dist = 15): SeenEnemy => ({ id: 'e1', pos, crouch: false, dist });

describe('Bot-Gehirn: Kampf', () => {
  it('Reaktionszeit vor dem ersten Schuss, dann Feuer auf Kopf/Brust des Gegners', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(1));
    const e = enemy({ x: 3, y: 0, z: 30 });
    const first = b.think(input({ visible: [e] }));
    expect(first.fire).toBeNull();
    expect(first.snap).toBe(true);
    expect(first.look!.y).toBeGreaterThan(1);
    let it = first;
    for (let i = 0; i < 30 && !it.fire; i++) it = b.think(input({ visible: [e], now: 50 + i * 0.05 }));
    expect(it.fire).not.toBeNull();
    expect(it.fire!.target).toBe('e1');
    expect([1.1, 1.53]).toContain(+it.fire!.aim.y.toFixed(2));
  });

  it('Vorzielen: wer still auf den Eingang schaut, reagiert schneller als einer, der woanders hinschaut', () => {
    const pos = { x: 10, y: 0, z: 18 };
    const e = enemy({ x: 10, y: 0, z: 38 }, 20);
    const towards = Math.atan2(-(e.pos.x - pos.x), -(e.pos.z - pos.z));
    const holder = new BotBrain('c1', 'CT', 0.6, mulberry32(4));
    holder.think(input({ pos, visible: [e], yaw: towards, stillFor: 1 }));
    const walker = new BotBrain('c1', 'CT', 0.6, mulberry32(4));
    walker.think(input({ pos, visible: [e], yaw: towards + 0.4, stillFor: 1 }));
    expect(holder.reaction).toBeLessThan(walker.reaction * 0.7);
    expect(holder.sightTime).toBeGreaterThan(walker.sightTime);
  });

  it('T kurz vor der Explosion im Wirkungsbereich: weglaufen statt kämpfen (außer der Gegner ist ganz nah)', () => {
    const bombPos = { x: 10, y: 0, z: 22 };
    const bomb = { phase: 'planted' as const, pos: bombPos, fuseLeft: 3, progress: 0 };
    expect(bombFlight('T', bomb, { x: 10, y: 0, z: 18 })).toBe(true);
    expect(bombFlight('CT', bomb, { x: 10, y: 0, z: 18 })).toBe(false);
    expect(bombFlight('T', { ...bomb, fuseLeft: 20 }, { x: 10, y: 0, z: 18 })).toBe(false);
    expect(bombFlight('T', bomb, { x: 10, y: 0, z: 60 })).toBe(false);
    const b = new BotBrain('t1', 'T', 0.6, mulberry32(5));
    const task = makeTask({ kind: 'move', label: 'Abstand zur Bombe', goal: { x: 3, y: 0, z: 40 }, speed: 'run', urgent: true });
    let it = b.think(input({ task, lo: armed('T'), bomb, visible: [enemy({ x: 10, y: 0, z: 2 }, 16)] }));
    for (let i = 0; i < 20; i++) it = b.think(input({ task, lo: armed('T'), bomb, visible: [enemy({ x: 10, y: 0, z: 2 }, 16)], now: 50 + i * 0.05 }));
    expect(it.fire).toBeNull();
    expect(it.goal).toEqual(task.goal);
    expect(it.speed).toBe('run');
  });

  it('auf Distanz erst anhalten (Gegenlenken), dann schießen', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(2));
    const e = enemy({ x: 3, y: 0, z: 40 }, 25);
    for (let i = 0; i < 30; i++) b.think(input({ visible: [e], stillFor: 1 }));
    const moving = b.think(input({ visible: [e], stillFor: 0 }));
    expect(moving.fire).toBeNull();
    expect(moving.speed).toBe('stop');
  });

  it('leeres Magazin im Nahkampf → Pistole', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(3));
    const lo = armed();
    lo.guns['m4a1']!.mag = 0;
    const it = b.think(input({ lo, visible: [enemy({ x: 10, y: 0, z: 26 }, 8)] }));
    expect(it.weapon).toBe('usp');
  });

  it('außer Reichweite (Pistole gegen Gegner auf 60 m): weiterlaufen statt stehen und sprühen', () => {
    const b = new BotBrain('t1', 'T', 0.6, mulberry32(16));
    const lo = defaultLoadout('T');
    const task = makeTask({ kind: 'move', label: 'Sammeln', goal: { x: 3, y: 0, z: 30 }, speed: 'run' });
    const far = enemy({ x: 40, y: 0, z: 10 }, 60);
    let it = b.think(input({ task, lo, pos: { x: 40, y: 0, z: 70 }, visible: [far] }));
    for (let i = 0; i < 20; i++) it = b.think(input({ task, lo, pos: { x: 40, y: 0, z: 70 }, visible: [far], now: 50 + i * 0.05 }));
    expect(it.fire).toBeNull();
    expect(it.goal).toEqual(task.goal);
    expect(it.speed).toBe('run');
    expect(it.look!.z).toBeCloseTo(10);
    // Gewehr auf dieselbe Distanz: kämpft
    const r = new BotBrain('t2', 'T', 0.6, mulberry32(16));
    let ir = r.think(input({ task, pos: { x: 40, y: 0, z: 70 }, visible: [far], lo: armed('T') }));
    for (let i = 0; i < 30 && !ir.fire; i++) ir = r.think(input({ task, pos: { x: 40, y: 0, z: 70 }, visible: [far], lo: armed('T'), now: 50 + i * 0.05 }));
    expect(ir.fire).not.toBeNull();
  });

  it('verlorenen Gegner anhalten: Blick auf die letzte Position, stehen bleiben', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(4));
    const lo = armed();
    lo.grenades.he = 0;
    b.think(input({ lo, visible: [enemy({ x: 3, y: 0, z: 30 })] }));
    const it = b.think(input({ lo, now: 51 }));
    expect(it.state).toBe('Winkel halten');
    expect(it.look!.z).toBeCloseTo(30);
    const later = b.think(input({ lo, now: 55 }));
    expect(later.state).not.toBe('Winkel halten');
  });

  it('wenig HP und Gegner auf Distanz → Rückzug in Deckung (ohne Sicht zum Gegner)', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(5));
    const e = enemy({ x: 3, y: 0, z: 28 }, 13);
    const inp = input({ visible: [e] });
    inp.self.hp = 20;
    const it = b.think(inp);
    expect(it.state).toBe('Rückzug');
    expect(it.goal).not.toBeNull();
    expect(m.collider.clear({ x: 3, y: 1.5, z: 28 }, { x: it.goal!.x, y: it.goal!.y + 1.4, z: it.goal!.z })).toBe(false);
  });
});

describe('Bot-Gehirn: Aufträge', () => {
  it('Halten: hinlaufen (zuletzt gehen), dann stehen und abwechselnd die Blickpunkte beobachten', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(6));
    const task = makeTask({ kind: 'hold', label: 'Halten', goal: { x: 5.5, y: 0, z: 13.5 }, look: [{ x: 3, y: 0, z: 25 }, { x: 22, y: 0, z: 16 }], speed: 'run' });
    const far = b.think(input({ task, pos: { x: 40, y: 0, z: 5 }, elapsed: 3 }));
    expect(far.goal).toEqual(task.goal);
    expect(far.speed).toBe('run');
    const near = b.think(input({ task, pos: { x: 9, y: 0, z: 13.5 } }));
    expect(near.speed).toBe('walk');
    const looks = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const it = b.think(input({ task, pos: { x: 5.5, y: 0, z: 13.5 }, now: 60 + i * 0.05 }));
      expect(it.speed).toBe('stop');
      looks.add(Math.round(it.look!.x / 10));
    }
    expect(looks.size).toBe(2);
  });

  it('Pflanzen: im Spot E halten mit C4 in der Hand, geduckt; Entschärfen an der Bombe', () => {
    const b = new BotBrain('t1', 'T', 0.6, mulberry32(7));
    const plant = siteInfo(info, 'a')!.plant;
    const lo = armed('T');
    giveWeapon(lo, 'c4');
    const task = makeTask({ kind: 'plant', label: 'Pflanzen', goal: plant });
    const it = b.think(input({ task, lo, pos: { ...plant } }));
    expect(it.use).toBe(true);
    expect(it.weapon).toBe('c4');
    expect(it.crouch).toBe(true);
    const c = new BotBrain('c1', 'CT', 0.6, mulberry32(8));
    const defuse = makeTask({ kind: 'defuse', label: 'Entschärfen', goal: plant });
    const away = c.think(input({ task: defuse, pos: { x: 30, y: 0, z: 5 }, bomb: { phase: 'planted', pos: plant, fuseLeft: 30, progress: 0 } }));
    expect(away.use).toBe(false);
    expect(away.goal).toEqual(plant);
    const at = c.think(input({ task: defuse, pos: { x: plant.x + 0.5, y: 0, z: plant.z }, bomb: { phase: 'planted', pos: plant, fuseLeft: 30, progress: 0 } }));
    expect(at.use).toBe(true);
  });

  it('Entschärfen unter Feuer: abbrechen, außer es ist fast fertig bzw. sonst zu spät', () => {
    const plant = siteInfo(info, 'a')!.plant;
    const defuse = makeTask({ kind: 'defuse', label: 'Entschärfen', goal: plant });
    const e = enemy({ x: 3, y: 0, z: 28 }, 13);
    const mk = (progress: number, fuseLeft: number) => input({ task: defuse, pos: { x: plant.x + 0.3, y: 0, z: plant.z }, visible: [e], bomb: { phase: 'defusing', pos: plant, fuseLeft, progress } });
    expect(new BotBrain('c1', 'CT', 0.6, mulberry32(9)).think(mk(0.1, 30)).use).toBe(false);
    expect(new BotBrain('c1', 'CT', 0.6, mulberry32(9)).think(mk(0.9, 30)).use).toBe(true);
    expect(new BotBrain('c1', 'CT', 0.6, mulberry32(9)).think(mk(0.2, 9)).use).toBe(true);
  });

  it('Gehen statt Rennen, wo Gegner schon sein können; eilige Aufträge rennen', () => {
    const b = new BotBrain('t1', 'T', 0.6, mulberry32(10));
    const task = makeTask({ kind: 'move', label: 'Sammeln', goal: { x: 3, y: 0, z: 30 }, speed: 'run' });
    const early = b.think(input({ task, pos: { x: 3, y: 0, z: 60 }, elapsed: 2, lo: armed('T') }));
    expect(early.speed).toBe('run');
    const late = b.think(input({ task, pos: { x: 3, y: 0, z: 60 }, elapsed: 40, lo: armed('T') }));
    expect(late.speed).toBe('walk');
    const urgent = makeTask({ kind: 'move', label: 'Rush', goal: { x: 3, y: 0, z: 30 }, speed: 'run', urgent: true });
    expect(b.think(input({ task: urgent, pos: { x: 3, y: 0, z: 60 }, elapsed: 40, lo: armed('T') })).speed).toBe('run');
  });

  it('Ecken checken: beim Laufen Blick auf Gefahrenpunkte statt nur in Laufrichtung', () => {
    const b = new BotBrain('t1', 'T', 0.6, mulberry32(11));
    const task = makeTask({ kind: 'move', label: 'rein', goal: { x: 10, y: 0, z: 15 }, speed: 'run' });
    const inp = input({ task, pos: { x: 3, y: 0, z: 36 }, elapsed: 60, lo: armed('T'), yaw: 0 });
    inp.self.ahead = { x: 3, y: 0, z: 31 };
    const it = b.think(inp);
    expect(it.look).not.toBeNull();
    // nicht der Laufweg (Wegpunkt in Augenhöhe), sondern ein Gefahrenpunkt (Eingang zum Spot)
    expect(it.look!.z === 31).toBe(false);
    expect(it.look!.z).toBeLessThan(26);
    // früh in der Runde (keine Gefahr) schaut er in Laufrichtung
    const calm = input({ task, pos: { x: 3, y: 0, z: 36 }, elapsed: 1, lo: armed('T'), yaw: 0 });
    calm.self.ahead = { x: 3, y: 0, z: 31 };
    expect(new BotBrain('t2', 'T', 0.6, mulberry32(11)).think(calm).look!.z).toBe(31);
  });

  it('Geräusch: Halter zielt vor; freie Rolle (roam) geht schleichend nach', () => {
    const hold = makeTask({ kind: 'hold', label: 'Halten', goal: { x: 5.5, y: 0, z: 13.5 }, look: [{ x: 3, y: 0, z: 25 }], speed: 'run' });
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(12));
    b.think(input({ task: hold, pos: { x: 5.5, y: 0, z: 13.5 }, now: 40 }));
    b.onHeard({ x: 18, y: 0, z: 22 }, 49.5);
    const it = b.think(input({ task: hold, pos: { x: 5.5, y: 0, z: 13.5 } }));
    expect(it.speed).toBe('stop');
    expect(it.look!.x).toBeCloseTo(18);
    const roam = makeTask({ kind: 'hold', label: 'Lurker', goal: { x: 40, y: 0, z: 50 }, look: [{ x: 40, y: 0, z: 30 }], speed: 'walk', roam: true });
    const l = new BotBrain('t1', 'T', 0.6, mulberry32(13));
    l.think(input({ task: roam, pos: { x: 40, y: 0, z: 50 }, now: 40, lo: armed('T') }));
    l.onHeard({ x: 40, y: 0, z: 35 }, 49.8);
    const go = l.think(input({ task: roam, pos: { x: 40, y: 0, z: 50 }, lo: armed('T') }));
    expect(go.state).toBe('Geräusch nachgehen');
    expect(go.speed).toBe('sneak');
  });

  it('Granaten-Auftrag: erst in Wurfweite werfen (Waffe ziehen, zielen, loslassen)', () => {
    const b = new BotBrain('t1', 'T', 0.6, mulberry32(14));
    const lo = armed('T');
    lo.grenades.smoke = 1;
    const task = makeTask({ kind: 'move', label: 'rein', goal: { x: 10, y: 0, z: 18 }, speed: 'run', nades: [{ kind: 'smoke', target: { x: 10, y: 0, z: 18 } }] });
    const far = b.think(input({ task, lo, pos: { x: 40, y: 0, z: 75 } }));
    expect(far.state).not.toContain('Granate');
    let it = b.think(input({ task, lo, pos: { x: 3, y: 0, z: 34 }, weapon: 'ak47' }));
    expect(it.state).toContain('Granate');
    expect(it.weapon).toBe('smokegrenade');
    let thrown: typeof it.throwNade = null;
    for (let i = 0; i < 20 && !thrown; i++) {
      it = b.think(input({ task, lo, pos: { x: 3, y: 0, z: 34 }, weapon: 'smokegrenade', now: 50 + i * 0.05 }));
      thrown = it.throwNade;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.kind).toBe('smoke');
  });

  it('Halter wirft HE, wenn sich mehrere Gegner an der Engstelle sammeln', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(15));
    const lo = armed();
    lo.grenades.he = 1;
    const hold = makeTask({ kind: 'hold', label: 'Halten', goal: { x: 5.5, y: 0, z: 13.5 }, look: [{ x: 3, y: 0, z: 26 }], speed: 'run' });
    b.think(input({ task: hold, lo, pos: { x: 5.5, y: 0, z: 13.5 }, now: 40 }));
    const k = newKnowledge('CT');
    report(k, sighting(info, 'a', { x: 3, y: 0, z: 30 }, 49, 'heard'));
    report(k, sighting(info, 'b', { x: 4, y: 0, z: 32 }, 49, 'heard'));
    const it = b.think(input({ task: hold, lo, pos: { x: 5.5, y: 0, z: 13.5 }, know: k }));
    expect(it.state).toBe('Granate (he)');
  });
});

describe('Bot-Gehirn: Rücksicht auf Kameraden', () => {
  const spot = { x: 10, y: 0, z: 18 };
  const foe = enemy({ x: 3, y: 0, z: 30 }, 14);
  // Kamerad auf der Schusslinie spot → foe (Mitte)
  const inLine = { x: 6.5, y: 0, z: 24 };
  const beside = { x: 12.5, y: 0, z: 22 };

  /** Bis zum ersten Schuss laufen lassen (Reaktionszeit, Gegenlenken); liefert die letzte Absicht. */
  function fireReady(b: BotBrain, mates: XYZ[]): ReturnType<BotBrain['think']> {
    let it = b.think(input({ visible: [foe], mates, pos: spot }));
    for (let i = 0; i < 40 && !it.fire && !it.held; i++) it = b.think(input({ visible: [foe], mates, pos: spot, now: 50 + i * 0.05 }));
    return it;
  }

  it('Kamerad in der Schusslinie: Feuer halten, seitlich treten, den Kameraden melden', () => {
    const it = fireReady(new BotBrain('c1', 'CT', 0.6, mulberry32(21)), [inLine]);
    expect(it.fire).toBeNull();
    expect(it.held).toMatchObject({ mate: 0 });
    expect(it.held!.to.z).toBeGreaterThan(spot.z);
    expect(it.state).toContain('Kamerad im Schussfeld');
    expect(it.strafe).not.toBeNull();
    expect(Math.hypot(it.strafe!.x, it.strafe!.z)).toBeCloseTo(1);
    // Seitenschritt senkrecht zur Schusslinie
    const dir = { x: foe.pos.x - spot.x, z: foe.pos.z - spot.z };
    expect(Math.abs(it.strafe!.x * dir.x + it.strafe!.z * dir.z)).toBeLessThan(0.2 * Math.hypot(dir.x, dir.z));
    expect(['walk', 'run']).toContain(it.speed);
  });

  it('Kamerad seitlich neben der Linie oder nicht vorhanden: normales Feuer', () => {
    expect(fireReady(new BotBrain('c1', 'CT', 0.6, mulberry32(21)), [beside]).fire).not.toBeNull();
    expect(fireReady(new BotBrain('c1', 'CT', 0.6, mulberry32(21)), []).fire).not.toBeNull();
  });

  it('Kamerad verlässt die Linie: der Bot schießt wieder', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(21));
    expect(fireReady(b, [inLine]).fire).toBeNull();
    const it = b.think(input({ visible: [foe], mates: [beside], pos: spot, now: 52 }));
    expect(it.fire).not.toBeNull();
    expect(it.held).toBeUndefined();
  });

  it('wer einen Kameraden am Schießen hindert und selbst nicht kämpft, tritt aus dessen Linie', () => {
    const b = new BotBrain('c2', 'CT', 0.6, mulberry32(22));
    const line = { from: { x: 10, y: 1.65, z: 10 }, to: { x: 10, y: 1.1, z: 40 } };
    const me = { x: 10.2, y: 0, z: 18 };
    const it = b.think(input({ pos: me, blocking: [line] }));
    expect(it.strafe).not.toBeNull();
    expect(it.strafe!.x).toBeGreaterThan(0.9); // mein Versatz ist +x → weiter nach +x
    expect(it.state).toContain('weicht aus');
    // Steht man ohnehin nicht in der Linie, passiert nichts
    expect(b.think(input({ pos: { x: 14, y: 0, z: 18 }, blocking: [line] })).strafe).toBeNull();
    // Im Kampf (Gegner sichtbar) bleibt der Bot, der Schütze weicht aus
    const fighter = new BotBrain('c3', 'CT', 0.6, mulberry32(23));
    const f = fighter.think(input({ pos: me, blocking: [line], visible: [enemy({ x: 12, y: 0, z: 40 }, 20)] }));
    expect(f.state).not.toContain('weicht aus');
  });

  it('beim Pflanzen oder Entschärfen weicht man nicht aus', () => {
    const b = new BotBrain('t9', 'T', 0.6, mulberry32(24));
    const plant = makeTask({ kind: 'plant', label: 'Pflanzen', goal: { x: 10, y: 0, z: 18 }, speed: 'run' });
    const line = { from: { x: 10, y: 1.65, z: 10 }, to: { x: 10, y: 1.1, z: 40 } };
    const lo = armed('T');
    giveWeapon(lo, 'c4');
    const it = b.think(input({ pos: { x: 10.1, y: 0, z: 18 }, lo, task: plant, blocking: [line] }));
    expect(it.use).toBe(true);
    expect(it.state).not.toContain('weicht aus');
  });

  it('Halter wirft keine HE auf Gegner, die direkt bei einem Kameraden stehen', () => {
    const mk = () => {
      const b = new BotBrain('c1', 'CT', 0.6, mulberry32(15));
      const lo = armed();
      lo.grenades.he = 1;
      const hold = makeTask({ kind: 'hold', label: 'Halten', goal: { x: 5.5, y: 0, z: 13.5 }, look: [{ x: 3, y: 0, z: 26 }], speed: 'run' });
      b.think(input({ task: hold, lo, pos: { x: 5.5, y: 0, z: 13.5 }, now: 40 }));
      const k = newKnowledge('CT');
      report(k, sighting(info, 'a', { x: 3, y: 0, z: 30 }, 49, 'heard'));
      report(k, sighting(info, 'b', { x: 4, y: 0, z: 32 }, 49, 'heard'));
      return { b, step: (now: number, ms: XYZ[]) => b.think(input({ task: hold, lo, pos: { x: 5.5, y: 0, z: 13.5 }, know: k, mates: ms, now })) };
    };
    // Kameraden mitten im Wirkungsbereich: kein Wurf
    const bad = mk();
    expect(bad.step(50, [{ x: 3.5, y: 0, z: 30 }, { x: 4.5, y: 0, z: 31 }]).state).not.toBe('Granate (he)');
    // Kameraden weit weg: Wurf wie gehabt
    const ok = mk();
    expect(ok.step(50, [{ x: 40, y: 0, z: 76 }]).state).toBe('Granate (he)');
  });

  it('laufender Wurf wird abgebrochen, wenn ein Kamerad in die Zone läuft', () => {
    const b = new BotBrain('c1', 'CT', 0.6, mulberry32(15));
    const lo = armed();
    lo.grenades.he = 1;
    const hold = makeTask({ kind: 'hold', label: 'Halten', goal: { x: 5.5, y: 0, z: 13.5 }, look: [{ x: 3, y: 0, z: 26 }], speed: 'run' });
    const at = { x: 5.5, y: 0, z: 13.5 };
    b.think(input({ task: hold, lo, pos: at, now: 40 }));
    const k = newKnowledge('CT');
    report(k, sighting(info, 'a', { x: 3, y: 0, z: 30 }, 49, 'heard'));
    report(k, sighting(info, 'b', { x: 4, y: 0, z: 32 }, 49, 'heard'));
    let it = b.think(input({ task: hold, lo, pos: at, know: k, now: 50 }));
    expect(it.state).toBe('Granate (he)');
    const runner = { x: 3.5, y: 0, z: 30.5 };
    const states = new Set<string>();
    for (let i = 1; i < 12; i++) {
      it = b.think(input({ task: hold, lo, pos: at, know: k, mates: [runner], now: 50 + i * 0.05, weapon: 'hegrenade' }));
      expect(it.throwNade).toBeNull();
      states.add(it.state);
    }
    expect([...states].some((s) => s.includes('Wurf abgebrochen'))).toBe(true);
  });
});

describe('Deckung finden', () => {
  it('Deckung hinter einer dünnen Wand zählt nur, wenn sie zu Fuß nahe erreichbar ist', () => {
    // Freie Fläche, dünne Wand (x = 0, z −20..20); Bot links der Wand, Bedrohung links weiter weg:
    // die nächste sichtgeschützte Stelle liegt hinter der Wand, ist aber nur um die Wand herum (> 40 m) erreichbar
    const b = new MapBuilder({ id: 'de_cover', name: 'c', description: '', bounds: { min: [-31, -1, -31], max: [31, 8, 31] }, env: BOT_TEST_ENV });
    b.floor(-30, -30, 30, 30, 0, 'concrete');
    b.box([-0.2, 0, -20], [0.2, 4, 20], 'concrete');
    b.spawn('T', -20, 0, 25, 0);
    b.spawn('CT', 20, 0, 25, 0);
    const cm = compileMap(b.data);
    const ci = analyzeMap({ nav: cm.nav, collider: cm.collider, sites: [], spawns: cm.spawns });
    expect(findCover(ci, cm.collider, { x: -1.5, y: 0, z: 0 }, { x: -12, y: 0, z: 0 }, 6)).toBeNull();
  });

  it('liefert eine nahe Position ohne Sichtlinie zur Bedrohung oder null', () => {
    const threat = { x: 3, y: 0, z: 40 };
    const c = findCover(info, m.collider, { x: 3, y: 0, z: 26 }, threat)!;
    expect(c).not.toBeNull();
    expect(m.collider.clear({ x: threat.x, y: 1.5, z: threat.z }, { x: c.x, y: c.y + 1.4, z: c.z })).toBe(false);
    expect(Math.hypot(c.x - 3, c.z - 26)).toBeLessThanOrEqual(9.5);
    // Mitten auf freier Fläche ohne Deckung in Reichweite
    expect(findCover(info, m.collider, { x: 40, y: 0, z: 76 }, { x: 40, y: 0, z: 72 }, 1.5)).toBeNull();
  });
});
