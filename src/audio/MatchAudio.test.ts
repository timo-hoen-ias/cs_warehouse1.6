import { describe, expect, it } from 'vitest';
import { MatchAudio, toV3, type AudioMover, type BombAudioState } from './MatchAudio';
import type { Sfx } from './Sfx';
import { WEAPONS } from '../logic/weapons';

type Call = [string, ...unknown[]];

/** Aufzeichnende Attrappe der Sfx-Fassade (nur die von MatchAudio genutzten Methoden). */
function fakeSfx(): { sfx: Sfx; calls: Call[] } {
  const calls: Call[] = [];
  const rec = (name: string) => (...a: unknown[]) => { calls.push([name, ...a]); };
  const sfx = {
    surface: () => 'metal',
    footstep: rec('footstep'), jump: rec('jump'), land: rec('land'), c4: rec('c4'), beep: rec('beep'),
    reload: rec('reload'), play: rec('play'), impact: rec('impact'), knifeHit: rec('knifeHit'), death: rec('death'),
  } as unknown as Sfx;
  return { sfx, calls };
}

const NO_BOMB: BombAudioState = { phase: 'none', progress: 0, fuseLeft: 40, spot: null };
const SPOTS = { a: { x: 10, z: 20 }, b: { x: -10, z: -20 } };

function walk(ma: MatchAudio, mover: Omit<AudioMover, 'x'>, speed: number, seconds: number, dt = 1 / 30): void {
  for (let t = 0, x = 0; t < seconds; t += dt, x += speed * dt) ma.update(dt, [{ ...mover, x }], NO_BOMB, null);
}

describe('MatchAudio · Schritte', () => {
  it('eigener Spieler: Schritte nicht positioniert, mit Oberfläche', () => {
    const { sfx, calls } = fakeSfx();
    const ma = new MatchAudio(() => sfx, () => SPOTS);
    walk(ma, { id: 'me', y: 0, z: 0, crouch: false, local: true, speed: 4.2 }, 4.2, 2);
    const steps = calls.filter((c) => c[0] === 'footstep');
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps[0]![1]).toBe('metal');
    expect(steps[0]![2]).toBeNull();
  });
  it('geduckt lautlos; entfernte Spieler positioniert (Tempo geschätzt)', () => {
    const { sfx, calls } = fakeSfx();
    const ma = new MatchAudio(() => sfx, () => SPOTS);
    walk(ma, { id: 'me', y: 0, z: 0, crouch: true, local: true, speed: 2.4 }, 2.4, 2);
    expect(calls.filter((c) => c[0] === 'footstep').length).toBe(0);
    walk(ma, { id: 'bot', y: 0, z: 5, crouch: false, local: false }, 4, 2);
    const steps = calls.filter((c) => c[0] === 'footstep');
    expect(steps.length).toBeGreaterThan(2);
    expect(steps[0]![2]).toMatchObject({ z: 5 });
  });
  it('Teleport erzeugt keinen Schritt, Sprung wird erkannt', () => {
    const { sfx, calls } = fakeSfx();
    const ma = new MatchAudio(() => sfx, () => SPOTS);
    ma.update(0.05, [{ id: 'p', x: 0, y: 0, z: 0, crouch: false, local: false }], NO_BOMB, null);
    ma.update(0.05, [{ id: 'p', x: 50, y: 0, z: 0, crouch: false, local: false }], NO_BOMB, null);
    expect(calls.length).toBe(0);
    const ys = [0, 0, 0.3, 0.55, 0.75, 0.9, 0.95, 0.9, 0.75, 0.5, 0.2, 0, 0, 0, 0];
    for (const y of ys) ma.update(0.05, [{ id: 'p', x: 50, y, z: 0, crouch: false, local: false }], NO_BOMB, null);
    expect(calls.some((c) => c[0] === 'jump')).toBe(true);
    expect(calls.some((c) => c[0] === 'land')).toBe(true);
  });
});

describe('MatchAudio · Bombe', () => {
  it('Legen: 7 Tastendrücke am Bombenplatz (Akteur unbekannt) bzw. lokal', () => {
    const { sfx, calls } = fakeSfx();
    const ma = new MatchAudio(() => sfx, () => SPOTS);
    for (let p = 0; p <= 1; p += 0.05) ma.update(0.1, [], { phase: 'planting', progress: p, fuseLeft: 40, spot: 'a' }, null);
    const presses = calls.filter((c) => c[0] === 'c4');
    expect(presses.length).toBe(7);
    expect(presses[0]![2]).toMatchObject({ x: 10, z: 20 });
    const local = fakeSfx();
    const mb = new MatchAudio(() => local.sfx, () => SPOTS);
    for (let p = 0; p <= 1; p += 0.05) mb.update(0.1, [], { phase: 'planting', progress: p, fuseLeft: 40, spot: 'a' }, null, null);
    expect(local.calls.filter((c) => c[0] === 'c4').every((c) => c[2] === null)).toBe(true);
  });
  it('Entschärfen einmal, Piepen schneller gegen Ende', () => {
    const { sfx, calls } = fakeSfx();
    const ma = new MatchAudio(() => sfx, () => SPOTS);
    const bombPos = { x: 1, y: 0.2, z: 2 };
    for (let t = 0; t < 5; t += 0.1) ma.update(0.1, [], { phase: 'planted', progress: 1, fuseLeft: 40 - t, spot: 'b' }, bombPos);
    const early = calls.filter((c) => c[0] === 'beep').length;
    calls.length = 0;
    for (let t = 0; t < 5; t += 0.1) ma.update(0.1, [], { phase: 'defusing', progress: t / 10, fuseLeft: 6 - t, spot: 'b' }, bombPos);
    expect(calls.filter((c) => c[0] === 'c4' && c[1] === 'defuse').length).toBe(1);
    expect(calls.filter((c) => c[0] === 'beep').length).toBeGreaterThan(early);
    expect(calls.find((c) => c[0] === 'beep')![1]).toEqual(bombPos);
  });
});

describe('MatchAudio · Ereignisse', () => {
  it('Nachladen: Schrot zählt fehlende Patronen', () => {
    const { sfx, calls } = fakeSfx();
    const ma = new MatchAudio(() => sfx, () => SPOTS);
    const m3 = WEAPONS['m3']!;
    ma.localReload('m3', { mag: m3.magSize - 3, reserve: 32, reloadLeft: 1.5 });
    expect(calls[0]).toEqual(['reload', 'm3', 1.5, 3]);
  });
  it('Treffer: eigener Schmerz, fremder Körpertreffer positioniert, Messer-Treffer', () => {
    const { sfx, calls } = fakeSfx();
    const ma = new MatchAudio(() => sfx, () => SPOTS);
    const e = { k: 'hit' as const, victim: 'me', attacker: 'x', dmg: 10, part: 'body' as const, from: [0, 0, 0] as [number, number, number], at: [1, 1, 1] as [number, number, number] };
    ma.hit(e, 'me', 'ak47');
    expect(calls[0]).toEqual(['play', 'hurt']);
    calls.length = 0;
    ma.hit({ ...e, victim: 'bot', attacker: 'me', part: 'head' }, 'me', 'knife');
    expect(calls).toEqual([['impact', 'flesh', toV3([1, 1, 1])], ['knifeHit', 'body']]);
    calls.length = 0;
    ma.hit({ ...e, victim: 'bot', attacker: 'me', part: 'head' }, 'me', 'deagle');
    expect(calls[1]).toEqual(['play', 'headshot']);
  });
  it('ohne Sfx passiert nichts', () => {
    const ma = new MatchAudio(() => undefined, () => SPOTS);
    expect(() => ma.update(0.1, [{ id: 'a', x: 0, y: 0, z: 0, crouch: false, local: true }], NO_BOMB, null)).not.toThrow();
  });
});
