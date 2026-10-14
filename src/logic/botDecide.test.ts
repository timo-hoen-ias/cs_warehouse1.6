import { describe, expect, it } from 'vitest';
import { BOT, BOT_NAMES, aimError, decideBot, newBotMemory, reactionTime, visibleEnemy, type BotWorld } from './botDecide';

const wall = { minX: 10, maxX: 10.5, minY: 0, maxY: 6, minZ: -20, maxZ: 20 };

function world(over: Partial<BotWorld> = {}, self: Partial<BotWorld['self']> = {}): BotWorld {
  return {
    self: { id: 'me', team: 'T', pos: { x: 0, z: 0 }, hasBomb: false, weaponRange: 100, auto: true, skill: 1, index: 0, ...self },
    enemies: [],
    solids: [wall],
    smokes: [],
    zones: { a: { x: -30, z: 0 }, b: { x: 30, z: 0 }, t: { x: 0, z: -40 }, ct: { x: 0, z: 40 } },
    bomb: { phase: 'none', spot: null, pos: null },
    phase: 'live',
    plan: 'a',
    ...over,
  };
}
const rnd = () => 0.5;

describe('visibleEnemy', () => {
  it('nächster sichtbarer Gegner; Wand und Rauch blockieren; Sichtweite begrenzt', () => {
    const w = world({ enemies: [{ id: 'far', pos: { x: 8, z: 0 } }, { id: 'near', pos: { x: 4, z: 0 } }, { id: 'hidden', pos: { x: 15, z: 0 } }] });
    expect(visibleEnemy(w)!.id).toBe('near');
    expect(visibleEnemy(world({ enemies: [{ id: 'hidden', pos: { x: 15, z: 0 } }] }))).toBeNull();
    expect(visibleEnemy(world({ enemies: [{ id: 'x', pos: { x: 0, z: -100 } }] }))).toBeNull();
    const smoked = world({ enemies: [{ id: 'x', pos: { x: 5, z: 0 } }], smokes: [{ pos: { x: 2.5, y: 1, z: 0 }, radius: 1.5, timeLeft: 5 }] });
    expect(visibleEnemy(smoked)).toBeNull();
  });
});

describe('decideBot – Kampf', () => {
  it('schießt erst nach der Reaktionszeit, zielt dabei auf den Gegner', () => {
    const w = world({ enemies: [{ id: 'e', pos: { x: 8, z: 0 } }] });
    const mem = newBotMemory(rnd);
    const first = decideBot(w, mem, 0.016, rnd);
    expect(first.role).toBe('fight');
    expect(first.target).toBe('e');
    expect(first.lookAt).toEqual({ x: 8, z: 0 });
    expect(first.fire).toBe(false);
    expect(first.moveTo).toBeNull(); // auf Distanz: stehen und schießen
    let d = first;
    for (let i = 0; i < 60; i++) d = decideBot(w, mem, 0.05, rnd);
    expect(d.fire).toBe(true);
  });

  it('Burst-Rhythmus bei Automatik: Feuer wechselt mit Pausen; Semi feuert durchgehend', () => {
    const w = world({ enemies: [{ id: 'e', pos: { x: 8, z: 0 } }] });
    const mem = newBotMemory(rnd);
    const seq: boolean[] = [];
    for (let i = 0; i < 100; i++) seq.push(decideBot(w, mem, 0.05, rnd).fire);
    expect(seq.slice(40)).toContain(true);
    expect(seq.slice(40)).toContain(false);
    const semi = world({ enemies: [{ id: 'e', pos: { x: 8, z: 0 } }] }, { auto: false });
    const mem2 = newBotMemory(rnd);
    const seq2: boolean[] = [];
    for (let i = 0; i < 100; i++) seq2.push(decideBot(semi, mem2, 0.05, rnd).fire);
    expect(seq2.slice(40).every(Boolean)).toBe(true);
  });

  it('im Nahkampf rückt der Bot vor; außerhalb der Waffenreichweite kein Feuer', () => {
    const near = world({ enemies: [{ id: 'e', pos: { x: 3, z: 0 } }] });
    expect(decideBot(near, newBotMemory(rnd), 0.016, rnd).moveTo).toEqual({ x: 3, z: 0 });
    const far = world({ enemies: [{ id: 'e', pos: { x: 8, z: 0 } }] }, { weaponRange: 2 });
    const mem = newBotMemory(rnd);
    let d = decideBot(far, mem, 1, rnd);
    d = decideBot(far, mem, 1, rnd);
    expect(d.fire).toBe(false);
  });

  it('Freeze/Warmup/RoundEnd: keine Aktion', () => {
    for (const phase of ['freeze', 'warmup', 'roundEnd'] as const) {
      const d = decideBot(world({ phase, enemies: [{ id: 'e', pos: { x: 3, z: 0 } }] }), newBotMemory(rnd), 0.016, rnd);
      expect(d).toMatchObject({ moveTo: null, fire: false, plant: false, defuse: false });
    }
  });
});

describe('decideBot – Erinnerung', () => {
  it('jagt die letzte bekannte Position, vergisst nach BOT.memory Sekunden', () => {
    const mem = newBotMemory(rnd);
    decideBot(world({ enemies: [{ id: 'e', pos: { x: 6, z: 2 } }] }), mem, 0.016, rnd);
    const lost = world();
    const d = decideBot(lost, mem, 0.5, rnd);
    expect(d.role).toBe('hunt');
    expect(d.moveTo).toEqual({ x: 6, z: 2 });
    let last = d;
    for (let i = 0; i < 20; i++) last = decideBot(lost, mem, 0.5, rnd);
    expect(last.role).not.toBe('hunt');
    expect(mem.lastSeen).toBeNull();
  });
});

describe('decideBot – Rollen', () => {
  it('T mit Bombe läuft zum Plan-Spot und pflanzt dort', () => {
    const w = world({}, { hasBomb: true });
    const d = decideBot(w, newBotMemory(rnd), 0.016, rnd);
    expect(d.moveTo).toEqual(w.zones.a);
    expect(d.plant).toBe(false);
    const at = world({}, { hasBomb: true, pos: { x: -29.5, z: 0.5 } });
    const d2 = decideBot(at, newBotMemory(rnd), 0.016, rnd);
    expect(d2.plant).toBe(true);
    expect(d2.moveTo).toBeNull();
    expect(d2.role).toBe('plant');
  });

  it('T ohne Bombe begleitet zum Plan-Spot (mit Versatz), hält dort', () => {
    const d = decideBot(world({ plan: 'b' }), newBotMemory(rnd), 0.016, rnd);
    expect(d.role).toBe('goal');
    expect(Math.hypot(d.moveTo!.x - 30, d.moveTo!.z)).toBeLessThan(4);
    const there = decideBot(world({ plan: 'b' }, { pos: { x: 30, z: 0 } }), newBotMemory(rnd), 0.016, rnd);
    expect(there.role).toBe('hold');
  });

  it('CT bewacht abwechselnd A/B; nach Plant → zur Bombe und entschärfen', () => {
    const ctA = decideBot(world({}, { team: 'CT', index: 0 }), newBotMemory(rnd), 0.016, rnd);
    const ctB = decideBot(world({}, { team: 'CT', index: 1 }), newBotMemory(rnd), 0.016, rnd);
    expect(ctA.moveTo!.x).toBeLessThan(0);
    expect(ctB.moveTo!.x).toBeGreaterThan(0);
    const planted = world({ bomb: { phase: 'planted', spot: 'b', pos: { x: 31, z: 1 } } }, { team: 'CT' });
    expect(decideBot(planted, newBotMemory(rnd), 0.016, rnd).moveTo).toEqual({ x: 31, z: 1 });
    const atBomb = world({ bomb: { phase: 'planted', spot: 'b', pos: { x: 31, z: 1 } } }, { team: 'CT', pos: { x: 31.5, z: 1 } });
    const d = decideBot(atBomb, newBotMemory(rnd), 0.016, rnd);
    expect(d.defuse).toBe(true);
    expect(d.role).toBe('defuse');
  });

  it('T nach Plant verteidigt die Bombe; Entschärfen wird bei nahem Feind abgebrochen', () => {
    const planted = world({ bomb: { phase: 'planted', spot: 'a', pos: { x: -30, z: 0 } } });
    const d = decideBot(planted, newBotMemory(rnd), 0.016, rnd);
    expect(['goal', 'hold']).toContain(d.role);
    expect(Math.hypot(d.moveTo!.x + 30, d.moveTo!.z)).toBeLessThan(6);
    const underFire = world({ bomb: { phase: 'planted', spot: 'b', pos: { x: 31, z: 1 } }, enemies: [{ id: 'e', pos: { x: 35, z: 1 } }] }, { team: 'CT', pos: { x: 31.5, z: 1 } });
    expect(decideBot(underFire, newBotMemory(rnd), 0.016, rnd).defuse).toBe(false);
  });
});

describe('decideBot – liegende Bombe', () => {
  it('T ohne Bombe läuft zur liegenden C4; CT ignoriert sie', () => {
    const w = world({ bomb: { phase: 'none', spot: null, pos: null, dropped: { x: 5, z: 7 } } });
    expect(decideBot(w, newBotMemory(rnd), 0.016, rnd).moveTo).toEqual({ x: 5, z: 7 });
    const ct = world({ bomb: { phase: 'none', spot: null, pos: null, dropped: { x: 5, z: 7 } } }, { team: 'CT' });
    expect(decideBot(ct, newBotMemory(rnd), 0.016, rnd).moveTo).not.toEqual({ x: 5, z: 7 });
  });
});

describe('aimError / reactionTime / Namen', () => {
  it('Zielfehler sinkt mit Zielzeit und Skill', () => {
    expect(aimError(0, 1)).toBeGreaterThan(aimError(BOT.aimSettleTime, 1));
    expect(aimError(0, 0)).toBeGreaterThan(aimError(0, 1));
    expect(aimError(10, 1)).toBeCloseTo(BOT.aimErrorSettled * 0.5, 5);
  });

  it('Reaktionszeit liegt im Band; hoher Skill = Minimum', () => {
    expect(reactionTime(1, rnd)).toBeCloseTo(BOT.reactionMin, 5);
    const r = reactionTime(0, rnd);
    expect(r).toBeGreaterThan(BOT.reactionMin);
    expect(r).toBeLessThanOrEqual(BOT.reactionMax);
  });

  it('genug eindeutige Bot-Namen', () => {
    expect(new Set(BOT_NAMES).size).toBe(BOT_NAMES.length);
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('Höhenebenen', () => {
  it('Sichtlinie nutzt die Fußhöhe: Gegner über einer Decke ist unsichtbar, auf gleicher Ebene sichtbar', () => {
    const slab = { minX: -20, maxX: 20, minY: 3.5, maxY: 4, minZ: -20, maxZ: 20 };
    const upstairs = world({ solids: [slab], enemies: [{ id: 'up', pos: { x: 5, y: 4, z: 0 } }] }, { pos: { x: 0, y: 0, z: 0 } });
    expect(visibleEnemy(upstairs)).toBeNull();
    const same = world({ solids: [slab], enemies: [{ id: 'up', pos: { x: 5, y: 4, z: 0 } }] }, { pos: { x: 0, y: 4, z: 0 } });
    expect(visibleEnemy(same)!.id).toBe('up');
  });

  it('Spot auf anderer Ebene gilt nicht als erreicht (Höhenunterschied zählt beim Pflanzen)', () => {
    const zones = { a: { x: 0, y: 4, z: 0 }, b: { x: 30, y: 0, z: 0 }, t: { x: 0, z: -40 }, ct: { x: 0, z: 40 } };
    const below = decideBot(world({ zones, solids: [] }, { hasBomb: true, pos: { x: 0, y: 0, z: 0 } }), newBotMemory(rnd), 0.016, rnd);
    expect(below.plant).toBe(false);
    expect(below.moveTo).toEqual({ x: 0, y: 4, z: 0 });
    const onTop = decideBot(world({ zones, solids: [] }, { hasBomb: true, pos: { x: 0, y: 4, z: 0 } }), newBotMemory(rnd), 0.016, rnd);
    expect(onTop.plant).toBe(true);
  });
});
