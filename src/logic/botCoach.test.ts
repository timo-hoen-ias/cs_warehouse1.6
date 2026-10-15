import { describe, expect, it } from 'vitest';
import { analyzeMap, routesTo, siteInfo, type BotMapInfo } from './botMap';
import { BOMB_ESCAPE, CTCoach, RETAKE, TCoach, bombEscape, retakeHopeless, retakeSiteClear, saveSpot, type CoachBot, type CoachCtx } from './botCoach';
import { markDead, newKnowledge, report, sighting } from './botKnowledge';
import { buildBotTestMap } from './botTestMap';
import { compileMap } from './mapcompile';
import type { XYZ } from './nav';
import { mulberry32 } from './rng';
import type { BotRadioKey } from './radio';

const m = compileMap(buildBotTestMap());
const info: BotMapInfo = analyzeMap({ nav: m.nav, collider: m.collider, sites: m.sites, spawns: m.spawns });
const nades = (n = 1) => ({ he: n, flash: n, smoke: n });

function bot(id: string, pos: XYZ, extra: Partial<CoachBot> = {}): CoachBot {
  return { id, pos, hasBomb: false, hasKit: false, nades: nades(), fighting: false, ...extra };
}

function ctx(team: 'T' | 'CT', bots: CoachBot[], over: Partial<CoachCtx> = {}, radio: [string, BotRadioKey][] = []): CoachCtx {
  return {
    info, now: 0, elapsed: 0, timeLeft: 115, bots, enemyAlive: 5, know: newKnowledge(team),
    bomb: { phase: 'none', spot: null, pos: null, dropped: null, fuseLeft: 0 },
    rnd: mulberry32(3), radio: (id, key) => radio.push([id, key]), ...over,
  };
}

const tSpawn = (i: number): XYZ => ({ x: 36 + i * 2, y: 0, z: 74 });
const ctSpawn = (i: number): XYZ => ({ x: 36 + i * 2, y: 0, z: 4 });
const d2 = (a: XYZ, b: XYZ) => Math.hypot(a.x - b.x, a.z - b.z);

describe('T-Trainer', () => {
  it('Split: Sammeln am Bereitstellungsraum (verteilt); Rush: ohne Halt, „Los, los, los!“, Träger pflanzt nach kurzer Verzögerung', () => {
    const split = new TCoach({ kind: 'split', site: 'a', fakeSite: null, executeAt: 30 });
    const sb = [0, 1, 2, 3].map((i) => bot(`t${i}`, tSpawn(i)));
    split.start(ctx('T', sb));
    expect(split.stage).toBe('gather');
    const goals = sb.map((b) => split.tasks.get(b.id)!.goal!);
    for (let i = 0; i < goals.length; i++) for (let j = i + 1; j < goals.length; j++) expect(d2(goals[i]!, goals[j]!)).toBeGreaterThan(1.5);
    const coach = new TCoach({ kind: 'rush', site: 'a', fakeSite: null, executeAt: 0 });
    const bots = [0, 1, 2, 3].map((i) => bot(`t${i}`, tSpawn(i), { hasBomb: i === 1 }));
    const radio: [string, BotRadioKey][] = [];
    coach.start(ctx('T', bots, {}, radio));
    expect(coach.stage).toBe('execute');
    expect(radio.some(([, k]) => k === 'go')).toBe(true);
    expect(coach.tasks.get('t0')!.label).toContain('Spot A');
    expect(coach.tasks.get('t0')!.urgent).toBe(true);
    // Träger wartet noch kurz, danach Pflanz-Auftrag
    expect(coach.tasks.get('t1')?.kind).not.toBe('plant');
    coach.update(ctx('T', bots, { now: 2, elapsed: 2 }, radio));
    const plant = coach.tasks.get('t1')!;
    expect(plant.kind).toBe('plant');
    expect(d2(plant.goal!, siteInfo(info, 'a')!.plant)).toBeLessThan(1);
  });

  it('Split: beide Gruppen warten gesammelt bis zum Ausführzeitpunkt (Uhr = Spielzeit, nicht 0)', () => {
    const coach = new TCoach({ kind: 'split', site: 'a', fakeSite: null, executeAt: 35 });
    const bots = [0, 1, 2, 3].map((i) => bot(`t${i}`, tSpawn(i), { hasBomb: i === 1 }));
    coach.start(ctx('T', bots, { now: 1000, elapsed: 0 }));
    expect(coach.groups).toHaveLength(2);
    coach.update(ctx('T', bots, { now: 1005, elapsed: 5 }));
    expect(coach.stage).toBe('gather');
    // eine Gruppe da, die andere noch unterwegs, Zeit noch nicht erreicht → warten
    const first = coach.groups[0]!.members;
    for (const b of bots) if (first.includes(b.id)) b.pos = coach.tasks.get(b.id)!.goal!;
    coach.update(ctx('T', bots, { now: 1020, elapsed: 20 }));
    expect(coach.stage).toBe('gather');
    // alle da → los
    bots.forEach((b) => (b.pos = coach.tasks.get(b.id)!.goal!));
    coach.update(ctx('T', bots, { now: 1022, elapsed: 22 }));
    expect(coach.stage).toBe('execute');
  });

  it('Ausführen mit Granaten: Blend in den Spot, Rauch auf die CT-Position', () => {
    const coach = new TCoach({ kind: 'rush', site: 'a', fakeSite: null, executeAt: 0 });
    const bots = [0, 1, 2].map((i) => bot(`t${i}`, tSpawn(i)));
    coach.start(ctx('T', bots));
    const all = bots.flatMap((b) => coach.tasks.get(b.id)!.nades);
    expect(all.some((n) => n.kind === 'flash')).toBe(true);
    expect(all.some((n) => n.kind === 'smoke')).toBe(true);
  });

  it('Default: erst Kontrolle halten, zum Ausführzeitpunkt sammeln am weniger verteidigten Spot', () => {
    const coach = new TCoach({ kind: 'default', site: 'a', fakeSite: null, executeAt: 45 });
    const bots = [0, 1, 2, 3, 4].map((i) => bot(`t${i}`, tSpawn(i), { hasBomb: i === 0 }));
    coach.start(ctx('T', bots));
    expect(coach.stage).toBe('setup');
    for (const b of bots) {
      const t = coach.tasks.get(b.id)!;
      expect(t.kind).toBe('hold');
      expect(t.roam).toBe(true);
    }
    const k = newKnowledge('T');
    report(k, sighting(info, 'c1', { x: 10, y: 0, z: 18 }, 40, 'seen'));
    report(k, sighting(info, 'c2', { x: 6, y: 0, z: 14 }, 41, 'seen'));
    coach.update(ctx('T', bots, { now: 46, elapsed: 46, know: k }));
    expect(coach.stage).toBe('gather');
    expect(coach.target).toBe('b');
    expect(coach.tasks.get('t0')!.label).toContain('Sammeln B');
  });

  it('Zeitdruck: spätestens bei < 40 s wird ausgeführt', () => {
    const coach = new TCoach({ kind: 'default', site: 'b', fakeSite: null, executeAt: 70 });
    const bots = [bot('t0', tSpawn(0), { hasBomb: true }), bot('t1', tSpawn(1))];
    coach.start(ctx('T', bots));
    coach.update(ctx('T', bots, { now: 30, elapsed: 30, timeLeft: 38 }));
    expect(coach.stage).toBe('gather');
  });

  it('liegende C4: der Nächste hebt sie auf; danach zurück in den Abschnitt', () => {
    const coach = new TCoach({ kind: 'rush', site: 'a', fakeSite: null, executeAt: 0 });
    const bots = [bot('t0', { x: 3, y: 0, z: 50 }), bot('t1', tSpawn(1))];
    coach.start(ctx('T', bots));
    const dropped = { x: 3, y: 0, z: 45 };
    coach.update(ctx('T', bots, { now: 10, elapsed: 10, bomb: { phase: 'none', spot: null, pos: null, dropped, fuseLeft: 0 } }));
    expect(coach.tasks.get('t0')!.kind).toBe('pickup');
    expect(coach.tasks.get('t1')!.kind).not.toBe('pickup');
    bots[1]!.hasBomb = true; // jemand anderes hat sie aufgehoben
    coach.update(ctx('T', bots, { now: 11, elapsed: 11 }));
    expect(coach.tasks.get('t0')!.kind).not.toBe('pickup');
  });

  it('neuer Träger während des Ausführens bekommt den Pflanz-Auftrag', () => {
    const coach = new TCoach({ kind: 'rush', site: 'b', fakeSite: null, executeAt: 0 });
    const bots = [bot('t0', tSpawn(0)), bot('t1', tSpawn(1))];
    coach.start(ctx('T', bots));
    expect(coach.stage).toBe('execute');
    expect(coach.tasks.get('t1')!.kind).toBe('hold');
    bots[1]!.hasBomb = true;
    coach.update(ctx('T', bots, { now: 30, elapsed: 30 }));
    expect(coach.tasks.get('t1')!.kind).toBe('plant');
  });

  it('nach dem Plant: Positionen mit Blick auf die CT-Eingänge, nicht auf der Bombe; Entschärfen gehört → zur Bombe', () => {
    const coach = new TCoach({ kind: 'rush', site: 'a', fakeSite: null, executeAt: 0 });
    const bomb = siteInfo(info, 'a')!.plant;
    const bots = [0, 1, 2].map((i) => bot(`t${i}`, { x: bomb.x + i, y: 0, z: bomb.z }));
    coach.start(ctx('T', bots));
    const planted = { phase: 'planted' as const, spot: 'a' as const, pos: bomb, dropped: null, fuseLeft: 38 };
    coach.update(ctx('T', bots, { now: 40, elapsed: 40, bomb: planted }));
    expect(coach.stage).toBe('planted');
    for (const b of bots) {
      const t = coach.tasks.get(b.id)!;
      expect(t.label).toBe('Bombe verteidigen');
      expect(d2(t.goal!, bomb)).toBeGreaterThanOrEqual(3);
      expect(t.look.length).toBeGreaterThan(0);
    }
    // mindestens einer deckt die Bombe selbst (Sichtlinie), einer einen Eingang
    const seesBomb = bots.filter((b) => {
      const g = coach.tasks.get(b.id)!.goal!;
      return info.col.clear({ x: g.x, y: g.y + 1.6, z: g.z }, { x: bomb.x, y: bomb.y + 1.2, z: bomb.z });
    });
    expect(seesBomb.length).toBeGreaterThanOrEqual(1);
    expect(bots.some((b) => coach.tasks.get(b.id)!.look[0] !== bomb)).toBe(true);
    coach.update(ctx('T', bots, { now: 50, elapsed: 50, bomb: { ...planted, phase: 'defusing', fuseLeft: 28 } }));
    expect(coach.tasks.get('t0')!.kind).toBe('hunt');
    // kurz vor der Explosion: Abstand halten
    coach.update(ctx('T', bots, { now: 75, elapsed: 75, bomb: { ...planted, fuseLeft: 3 } }));
    expect(coach.tasks.get('t1')!.label).toBe('Abstand zur Bombe');
  });
});

describe('T: Abstand zur Bombe', () => {
  it('Fluchtpunkt liegt außerhalb der Explosion, auf der eigenen Seite der Bombe', () => {
    for (const site of ['a', 'b'] as const) {
      const bomb = siteInfo(info, site)!.plant;
      const from = { x: bomb.x + 2, y: bomb.y, z: bomb.z + 6 };
      const p = bombEscape(info, site, bomb, from);
      expect(Math.hypot(p.x - bomb.x, (p.y - bomb.y) * 1.5, p.z - bomb.z)).toBeGreaterThanOrEqual(BOMB_ESCAPE.safe);
      // weg von der Bombe (eigene Seite), nicht an ihr vorbei
      expect((p.x - bomb.x) * (from.x - bomb.x) + (p.z - bomb.z) * (from.z - bomb.z)).toBeGreaterThanOrEqual(0);
      expect(d2(p, from)).toBeLessThan(BOMB_ESCAPE.safe + 8);
    }
  });
});

describe('CT-Trainer', () => {
  it('Aufstellung: Halte-Aufträge mit Blickpunkt, Anker markiert', () => {
    const coach = new CTCoach();
    const bots = [0, 1, 2, 3, 4].map((i) => bot(`c${i}`, ctSpawn(i)));
    coach.start(ctx('CT', bots), null);
    expect(coach.stage).toBe('hold');
    const tasks = bots.map((b) => coach.tasks.get(b.id)!);
    for (const t of tasks) {
      expect(t.kind).toBe('hold');
      expect(t.look).toHaveLength(1);
    }
    expect(tasks.filter((t) => t.anchor).length).toBeGreaterThanOrEqual(2);
  });

  it('Rotation bei Druck auf einen Spot: Rotierer gehen hin, der Anker des anderen Spots bleibt', () => {
    const coach = new CTCoach();
    const bots = [0, 1, 2, 3, 4].map((i) => bot(`c${i}`, ctSpawn(i)));
    coach.start(ctx('CT', bots), null);
    const anchorB = [...coach.assign].find(([, a]) => a.anchor && a.site === 'b')![0];
    const k = newKnowledge('CT');
    report(k, sighting(info, 't1', { x: 3, y: 0, z: 30 }, 30, 'seen'));
    report(k, sighting(info, 't2', { x: 3, y: 0, z: 34 }, 30, 'seen'));
    report(k, sighting(info, 't3', { x: 10, y: 0, z: 20 }, 30, 'heard'));
    coach.update(ctx('CT', bots, { now: 31, elapsed: 31, know: k }));
    expect(coach.stage).toBe('rotate');
    expect(coach.called).toBe('a');
    expect(coach.tasks.get(anchorB)!.label).toContain('Anker');
    const rotated = bots.filter((b) => coach.tasks.get(b.id)!.label === 'Rotation A');
    expect(rotated.length).toBeGreaterThanOrEqual(1);
    for (const b of rotated) expect(coach.tasks.get(b.id)!.urgent).toBe(true);
  });

  it('Retake: Sammeln vor den Eingängen, gemeinsam rein, Kit-Träger entschärft (mit Rauch)', () => {
    const coach = new CTCoach();
    const bots = [bot('c0', { x: 40, y: 0, z: 5 }), bot('c1', { x: 30, y: 0, z: 18 }, { hasKit: true }), bot('c2', { x: 66, y: 0, z: 18 })];
    const radio: [string, BotRadioKey][] = [];
    coach.start(ctx('CT', bots), null);
    const bomb = siteInfo(info, 'a')!.plant;
    const planted = { phase: 'planted' as const, spot: 'a' as const, pos: bomb, dropped: null, fuseLeft: 38 };
    coach.update(ctx('CT', bots, { now: 50, elapsed: 50, bomb: planted, enemyAlive: 2 }, radio));
    expect(coach.stage).toBe('retake');
    expect(radio.some(([, k]) => k === 'regroup')).toBe(true);
    for (const b of bots) expect(coach.tasks.get(b.id)!.label).toContain('Sammeln Retake');
    // noch niemand da → kein Angriff
    coach.update(ctx('CT', bots, { now: 51, elapsed: 51, bomb: { ...planted, fuseLeft: 37 }, enemyAlive: 2 }, radio));
    expect(bots.every((b) => coach.tasks.get(b.id)!.kind === 'move')).toBe(true);
    // alle am Sammelpunkt → los
    bots.forEach((b) => (b.pos = coach.tasks.get(b.id)!.goal!));
    coach.update(ctx('CT', bots, { now: 55, elapsed: 55, bomb: { ...planted, fuseLeft: 33 }, enemyAlive: 2 }, radio));
    const def = coach.tasks.get('c1')!;
    expect(def.kind).toBe('defuse');
    expect(def.nades.some((n) => n.kind === 'smoke')).toBe(true);
    expect(coach.tasks.get('c0')!.label).toContain('Retake');
  });

  it('Retake: Gegner an der Bombe gemeldet → erst räumen, dann entschärfen', () => {
    const coach = new CTCoach();
    const bots = [bot('c0', { x: 40, y: 0, z: 5 }), bot('c1', { x: 30, y: 0, z: 18 }, { hasKit: true })];
    coach.start(ctx('CT', bots), null);
    const bomb = siteInfo(info, 'a')!.plant;
    const planted = { phase: 'planted' as const, spot: 'a' as const, pos: bomb, dropped: null, fuseLeft: 38 };
    const k = newKnowledge('CT');
    coach.update(ctx('CT', bots, { now: 50, elapsed: 50, bomb: planted, enemyAlive: 2, know: k }));
    bots.forEach((b) => (b.pos = coach.tasks.get(b.id)!.goal!));
    report(k, sighting(info, 't1', { x: bomb.x + 4, y: bomb.y, z: bomb.z + 3 }, 53, 'seen'));
    coach.update(ctx('CT', bots, { now: 54, elapsed: 54, bomb: { ...planted, fuseLeft: 34 }, enemyAlive: 2, know: k }));
    // Gegner an der Bombe: der Kit-Träger räumt mit, statt sofort zu entschärfen
    expect(coach.tasks.get('c1')!.kind).toBe('hold');
    expect(coach.tasks.get('c1')!.label).toContain('räumen');
    // Gegner tot → entschärfen
    markDead(k, 't1');
    coach.update(ctx('CT', bots, { now: 60, elapsed: 60, bomb: { ...planted, fuseLeft: 28 }, enemyAlive: 1, know: k }));
    expect(coach.tasks.get('c1')!.kind).toBe('defuse');
  });

  it('Retake aussichtslos (1 gegen 3) → Waffen retten statt einzeln reinlaufen', () => {
    const coach = new CTCoach();
    const bots = [bot('c0', { x: 40, y: 0, z: 5 }, { hasKit: true })];
    coach.start(ctx('CT', bots), null);
    const bomb = siteInfo(info, 'a')!.plant;
    coach.update(ctx('CT', bots, { now: 50, elapsed: 50, bomb: { phase: 'planted', spot: 'a', pos: bomb, dropped: null, fuseLeft: 38 }, enemyAlive: 3 }));
    expect(coach.stage).toBe('save');
    expect(coach.tasks.get('c0')!.label).toBe('Retten');
    expect(retakeHopeless(1, 3)).toBe(true);
    expect(retakeHopeless(2, 4)).toBe(true);
    expect(retakeHopeless(1, 2)).toBe(false);
    expect(retakeHopeless(3, 5)).toBe(false);
    expect(retakeHopeless(2, 3)).toBe(false);
  });

  it('Retten: CT-Spawn, außer er liegt nah an der Bombe — dann der am weitesten entfernte Ort', () => {
    const a = siteInfo(info, 'a')!.plant;
    const d = (p: XYZ, q: XYZ) => Math.hypot(p.x - q.x, p.z - q.z);
    if (d(info.spawn.CT, a) >= 30) expect(saveSpot(info, a)).toEqual(info.spawn.CT);
    const near = { ...info.spawn.CT, x: info.spawn.CT.x + 5 };
    const away = saveSpot(info, near);
    expect(d(away, near)).toBeGreaterThan(30);
  });

  it('Spot geräumt: keine frischen Meldungen nahe der Bombe, Gegner tot oder Zeitnot', () => {
    const k = newKnowledge('CT');
    const bomb = { x: 0, y: 0, z: 0 };
    expect(retakeSiteClear({ enemyAlive: 2, know: k, now: 10 }, bomb, false)).toBe(true);
    report(k, sighting(info, 't1', { x: 5, y: 0, z: 5 }, 9, 'heard'));
    expect(retakeSiteClear({ enemyAlive: 2, know: k, now: 10 }, bomb, false)).toBe(false);
    expect(retakeSiteClear({ enemyAlive: 2, know: k, now: 10 }, bomb, true)).toBe(true);
    expect(retakeSiteClear({ enemyAlive: 2, know: k, now: 10 + RETAKE.clearAge + 1 }, bomb, false)).toBe(true);
    expect(retakeSiteClear({ enemyAlive: 0, know: k, now: 10 }, bomb, false)).toBe(true);
  });

  it('keine Zeit mehr zum Entschärfen → retten', () => {
    const coach = new CTCoach();
    const bots = [bot('c0', { x: 70, y: 0, z: 5 })];
    coach.start(ctx('CT', bots), null);
    const bomb = siteInfo(info, 'a')!.plant;
    coach.update(ctx('CT', bots, { now: 90, elapsed: 90, bomb: { phase: 'planted', spot: 'a', pos: bomb, dropped: null, fuseLeft: 6 } }));
    expect(coach.stage).toBe('save');
    expect(coach.tasks.get('c0')!.label).toBe('Retten');
  });

  it('gesichtete liegende C4 wird bewacht', () => {
    const coach = new CTCoach();
    const bots = [0, 1, 2, 3].map((i) => bot(`c${i}`, ctSpawn(i)));
    coach.start(ctx('CT', bots), null);
    const k = newKnowledge('CT');
    k.bomb = { pos: { x: 40, y: 0, z: 40 }, t: 20, state: 'dropped' };
    coach.update(ctx('CT', bots, { now: 21, elapsed: 21, know: k }));
    expect(bots.some((b) => coach.tasks.get(b.id)!.label === 'C4 bewachen')).toBe(true);
    expect(routesTo(info, 'T', 'a').length).toBeGreaterThan(0);
  });
});
