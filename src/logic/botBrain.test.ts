import { describe, expect, it } from 'vitest';
import { analyzeMap, siteInfo, type BotMapInfo } from './botMap';
import { BotBrain, findCover, type BrainInput, type SeenEnemy } from './botBrain';
import { makeTask, type Task } from './botCoach';
import { newKnowledge, report, sighting } from './botKnowledge';
import { buildBotTestMap } from './botTestMap';
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
    let thrown = null;
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

describe('Deckung finden', () => {
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
