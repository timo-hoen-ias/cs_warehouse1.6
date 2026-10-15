import { describe, expect, it } from 'vitest';
import { analyzeMap } from './botMap';
import { BotSystem, botSkill, type BotActions } from './botSystem';
import { buildBotTestMap } from './botTestMap';
import { compileMap } from './mapcompile';
import { addPlayer, beginRound, newMatch, type MatchPlayer, type MatchState } from './match';
import { resolveRay } from './combat';
import { humanPartBoxes } from './hitbox';
import { mulberry32 } from './rng';
import { WEAPONS } from './weapons';
import type { XYZ } from './nav';

const map = compileMap(buildBotTestMap());
const info = analyzeMap({ nav: map.nav, collider: map.collider, sites: map.sites, spawns: map.spawns });

function setup(perTeam = 3): { m: MatchState; bots: BotSystem } {
  const m = newMatch();
  const bots = new BotSystem(info, { skill: 0.7, seed: 3 });
  for (let i = 0; i < perTeam * 2; i++) bots.add(addPlayer(m, `bot-${i}`, `B${i}`, { bot: true, team: i % 2 ? 'CT' : 'T' }));
  m.round.round = 3;
  for (const p of Object.values(m.players)) p.money.amount = 6000;
  beginRound(m, (team, i) => {
    const s = map.spawns[team][i]!;
    return { x: s.pos[0], y: s.pos[1], z: s.pos[2], yaw: s.yaw, pitch: 0 };
  }, mulberry32(1));
  bots.roundStart(m);
  return { m, bots };
}

function recorder() {
  const log = { fire: [] as { id: string; dirs: XYZ[] }[], nades: [] as string[], radio: [] as string[] };
  const act: BotActions = {
    fire: (id, _w, _o, dirs) => log.fire.push({ id, dirs }),
    throwNade: (id, kind) => log.nades.push(`${id}:${kind}`),
    radio: (_id, text) => log.radio.push(text),
  };
  return { log, act };
}

describe('Bot-System', () => {
  it('persönlicher Skill streut deterministisch um den Grundwert', () => {
    expect(botSkill(0.6, 'bot-1')).toBe(botSkill(0.6, 'bot-1'));
    for (const id of ['bot-0', 'bot-1', 'bot-7']) expect(Math.abs(botSkill(0.6, id) - 0.6)).toBeLessThanOrEqual(0.12);
    expect(botSkill(1, 'bot-3')).toBeLessThanOrEqual(1);
  });

  it('Rundenstart: Teamkauf (Vollkauf), Pläne beider Teams, Aufträge für alle Bots', () => {
    const { m, bots } = setup();
    expect(bots.buyKind.T).toBe('full');
    for (const p of Object.values(m.players)) {
      expect(p.loadout.primary).not.toBeNull();
      expect(p.loadout.armor).toBe(100);
      expect(bots.state(p.id)!.task).not.toBeNull();
    }
    expect(Object.values(m.players).filter((p) => p.team === 'CT').every((p) => p.loadout.defuseKit)).toBe(true);
    expect(bots.tPlan()).not.toBeNull();
    expect(bots.coachCT!.stage).toBe('hold');
  });

  it('Kaufzeit: niemand läuft; live: Bots laufen los', () => {
    const { m, bots } = setup();
    const { act } = recorder();
    const w = { match: m, smokes: [], bombPos: null, dropped: null, crouching: () => false };
    const start = { ...m.players['bot-0']!.pose };
    m.round.phase = 'freeze';
    for (let i = 0; i < 10; i++) { m.time += 0.05; bots.tick(w, 0.05, act); }
    expect(m.players['bot-0']!.pose.x).toBeCloseTo(start.x, 3);
    m.round.phase = 'live';
    m.round.timer = 115;
    const before = Object.values(m.players).map((p) => ({ ...p.pose }));
    for (let i = 0; i < 60; i++) { m.time += 0.05; bots.tick(w, 0.05, act); }
    const moved = Object.values(m.players).map((p, i) => Math.hypot(p.pose.x - before[i]!.x, p.pose.z - before[i]!.z));
    expect(moved.filter((d) => d > 3).length).toBeGreaterThanOrEqual(4);
  });

  it('sichtbarer Gegner: Meldung ans Team (Funk), Feuer über die Aktionen', () => {
    const { m, bots } = setup(1);
    const { log, act } = recorder();
    m.round.phase = 'live';
    m.round.timer = 115;
    const t = m.players['bot-0']!;
    const ct = m.players['bot-1']!;
    // CT steht im Mittelgang 15 m vor dem T, Blick zueinander
    t.pose = { x: 40, y: 0, z: 50, yaw: 0, pitch: 0 };
    ct.pose = { x: 40, y: 0, z: 35, yaw: Math.PI, pitch: 0 };
    bots.place(t);
    bots.place(ct);
    const w = { match: m, smokes: [], bombPos: null, dropped: null, crouching: () => false };
    for (let i = 0; i < 60; i++) { m.time += 0.05; bots.tick(w, 0.05, act); }
    expect(log.fire.length).toBeGreaterThan(0);
    expect(log.radio).toContain('Gegner gesichtet!');
    expect(bots.know.T.enemies.has('bot-1')).toBe(true);
    // Funk nicht gespammt
    expect(log.radio.length).toBeLessThanOrEqual(4);
  });

  it('enge Gasse: kein Schuss trifft je einen Kameraden, und es wird trotzdem auf den Gegner geschossen', () => {
    const { m, bots } = setup(3);
    const { act } = recorder();
    m.round.phase = 'live';
    m.round.timer = 115;
    // Drei T hintereinander im Mittelgang (z 66/60/54), drei CT am anderen Ende, Blick zueinander
    const ts = Object.values(m.players).filter((p) => p.team === 'T');
    const cts = Object.values(m.players).filter((p) => p.team === 'CT');
    ts.forEach((p, i) => { p.pose = { x: 40, y: 0, z: 66 - i * 6, yaw: 0, pitch: 0 }; bots.place(p); });
    cts.forEach((p, i) => { p.pose = { x: 39 + i, y: 0, z: 36, yaw: Math.PI, pitch: 0 }; bots.place(p); });
    let shots = 0;
    let teamHits = 0;
    const checking: BotActions = {
      ...act,
      fire: (id, w, o, dirs) => {
        const shooter = m.players[id]!;
        const targets = Object.values(m.players).filter((p) => p.alive && p.id !== id).map((p) => ({ id: p.id, parts: humanPartBoxes({ x: p.pose.x, y: p.pose.y, z: p.pose.z }, bots.crouching(p.id) ? 0.75 : 1) }));
        for (const d of dirs) {
          const hit = resolveRay(o, d, WEAPONS[w]!.range, map.collider, targets, id);
          shots++;
          if (hit.kind === 'target' && m.players[hit.id]!.team === shooter.team) teamHits++;
        }
      },
    };
    const w = { match: m, smokes: [], bombPos: null, dropped: null, crouching: () => false };
    for (let i = 0; i < 400; i++) { m.time += 0.05; bots.tick(w, 0.05, checking); }
    expect(shots).toBeGreaterThan(10);
    expect(teamHits).toBe(0);
  });

  it('Kamerad steht im Weg: der Schütze tritt erst zur Seite und schießt dann (nie aus der Linie)', () => {
    const { m, bots } = setup(2);
    const { act } = recorder();
    m.round.phase = 'live';
    m.round.timer = 115;
    const [t1, t2] = Object.values(m.players).filter((p) => p.team === 'T') as [MatchPlayer, MatchPlayer];
    const ct = Object.values(m.players).find((p) => p.team === 'CT')!;
    t1.pose = { x: 40, y: 0, z: 56, yaw: 0, pitch: 0 };
    t2.pose = { x: 40, y: 0, z: 52, yaw: 0, pitch: 0 };
    ct.pose = { x: 40, y: 0, z: 34, yaw: Math.PI, pitch: 0 };
    for (const p of [t1, t2, ct]) bots.place(p);
    const w = { match: m, smokes: [], bombPos: null, dropped: null, crouching: () => false };
    // t2 wird festgehalten und steht genau in der Linie t1 → CT
    const put = (x: number): void => {
      const b = bots.body(t2.id)!;
      b.pose.x = b.motion.x = x;
      b.pose.z = b.motion.z = 52;
      t2.pose = { ...b.pose };
    };
    const shotsAt: Record<string, number[]> = { [t1.id]: [], [t2.id]: [] };
    const rec: BotActions = { ...act, fire: (id) => { shotsAt[id]?.push(m.players[id]!.pose.x); } };
    for (let i = 0; i < 100; i++) {
      m.time += 0.05;
      put(40);
      bots.tick(w, 0.05, rec);
    }
    expect(shotsAt[t2.id]!.length).toBeGreaterThan(0);
    expect(shotsAt[t1.id]!.length).toBeGreaterThan(0);
    // t1 hat sich erst aus der Linie hinter t2 bewegt (≥ 0.7 m Versatz bei 4 m Abstand zu t2)
    for (const x of shotsAt[t1.id]!) expect(Math.abs(x - 40)).toBeGreaterThanOrEqual(0.7);
  });

  it('Ereignisse: Schuss gehört → Wissen; Kill → als tot markiert, Kamerad gefallen', () => {
    const { m, bots } = setup(1);
    m.round.phase = 'live';
    const ct = m.players['bot-1']!;
    bots.notify({ k: 'shot', id: 'bot-0', pos: { x: 40, y: 0, z: 45 }, weapon: 'ak47' }, m);
    expect(bots.know.CT.enemies.get('bot-0')?.source).toBe('shot');
    bots.notify({ k: 'kill', victim: 'bot-1', killer: 'bot-0', pos: { x: ct.pose.x, y: 0, z: ct.pose.z } }, m);
    expect(bots.know.T.dead.has('bot-1')).toBe(true);
    expect(bots.know.CT.mateDeaths).toHaveLength(1);
  });

  it('Blendung macht den Bot handlungsunfähig', () => {
    const { m, bots } = setup(1);
    const { act } = recorder();
    m.round.phase = 'live';
    bots.blind('bot-0', 3);
    bots.tick({ match: m, smokes: [], bombPos: null, dropped: null, crouching: () => false }, 0.05, act);
    expect(bots.state('bot-0')!.state).toBe('geblendet');
  });

  it('Bewegungs-Tabelle vergisst Spieler, die das Match verlassen haben', () => {
    const { m, bots } = setup(1);
    const { act } = recorder();
    const w = { match: m, smokes: [], bombPos: null, dropped: null, crouching: () => false };
    for (let i = 0; i < 40; i++) addPlayer(m, `peer-${i}`, `P${i}`, { team: 'T' });
    bots.tick(w, 0.05, act);
    expect(bots.trackedMotions).toBe(42);
    for (let i = 0; i < 40; i++) delete m.players[`peer-${i}`];
    bots.tick(w, 0.05, act);
    expect(bots.trackedMotions).toBe(2);
  });
});
