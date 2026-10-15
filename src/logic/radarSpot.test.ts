import { describe, expect, it } from 'vitest';
import { SPOT, SpotTracker } from './radarSpot';

const mates = [{ id: 'm1' }, { id: 'm2' }];
const foes = [{ id: 'e1' }, { id: 'e2' }];

describe('SpotTracker', () => {
  it('Gegner ist sichtbar, solange ein Betrachter ihn sieht, und kurz danach', () => {
    const t = new SpotTracker();
    t.update(10, mates, foes, (v, e) => v.id === 'm2' && e.id === 'e1');
    expect(t.isSpotted('e1', 10)).toBe(true);
    expect(t.isSpotted('e2', 10)).toBe(false);
    expect(t.isSpotted('e1', 10 + SPOT.hold - 0.01)).toBe(true);
    expect(t.isSpotted('e1', 10 + SPOT.hold + 0.01)).toBe(false);
  });

  it('erneute Sichtung verlängert die Anzeige', () => {
    const t = new SpotTracker();
    t.update(0, mates, foes, () => true);
    t.update(1, mates, foes, () => true);
    expect(t.isSpotted('e2', 1 + SPOT.hold - 0.01)).toBe(true);
  });

  it('prüft höchstens einmal je Takt und meldet, ob geprüft wurde', () => {
    const t = new SpotTracker();
    let calls = 0;
    const sees = (): boolean => { calls++; return false; };
    expect(t.update(5, mates, foes, sees)).toBe(true);
    const first = calls;
    expect(t.update(5 + SPOT.interval / 2, mates, foes, sees)).toBe(false);
    expect(calls).toBe(first);
    expect(t.update(5 + SPOT.interval, mates, foes, sees)).toBe(true);
  });

  it('bricht je Ziel nach dem ersten sehenden Betrachter ab (Sparsamkeit)', () => {
    const t = new SpotTracker();
    let calls = 0;
    t.update(0, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ id: 'x' }], () => { calls++; return true; });
    expect(calls).toBe(1);
  });

  it('ohne Betrachter (tot) wird niemand gesichtet; clear vergisst alles', () => {
    const t = new SpotTracker();
    t.update(0, [], foes, () => true);
    expect(t.isSpotted('e1', 0)).toBe(false);
    t.update(1, mates, foes, () => true);
    expect(t.isSpotted('e1', 1)).toBe(true);
    t.clear();
    expect(t.isSpotted('e1', 1)).toBe(false);
    // nach clear sofort wieder prüfbar
    expect(t.update(1.01, mates, foes, () => true)).toBe(true);
  });

  it('alte Einträge werden aufgeräumt (kein Wachstum über Runden)', () => {
    const t = new SpotTracker();
    t.update(0, mates, [{ id: 'gone' }], () => true);
    t.update(100, mates, [], () => true);
    expect(t.isSpotted('gone', 100)).toBe(false);
  });
});
