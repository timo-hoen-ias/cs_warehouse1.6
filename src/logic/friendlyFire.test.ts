import { describe, expect, it } from 'vitest';
import { DEFAULT_FRIENDLY_FIRE, friendlyFireText, teamDamageBlocked } from './friendlyFire';

const t1 = { id: 'a', team: 'T' as const };
const t2 = { id: 'b', team: 'T' as const };
const ct = { id: 'c', team: 'CT' as const };

describe('Friendly Fire', () => {
  it('Standard ist aus (wie öffentliche CS-Server)', () => {
    expect(DEFAULT_FRIENDLY_FIRE).toBe(false);
  });

  it('aus: Schaden unter Teamkameraden ist blockiert, gegen Gegner nicht', () => {
    expect(teamDamageBlocked(false, t1, t2)).toBe(true);
    expect(teamDamageBlocked(false, ct, t2)).toBe(false);
    expect(teamDamageBlocked(false, t1, ct)).toBe(false);
  });

  it('an: nichts ist blockiert', () => {
    expect(teamDamageBlocked(true, t1, t2)).toBe(false);
    expect(teamDamageBlocked(true, t1, ct)).toBe(false);
  });

  it('Eigenschaden (eigene HE) und Schaden ohne Angreifer (Bombe, Sturz) bleiben immer wirksam', () => {
    expect(teamDamageBlocked(false, t1, t1)).toBe(false);
    expect(teamDamageBlocked(false, null, t1)).toBe(false);
    expect(teamDamageBlocked(false, undefined, t1)).toBe(false);
  });

  it('Beschriftung', () => {
    expect(friendlyFireText(true)).toBe('Friendly Fire an');
    expect(friendlyFireText(false)).toBe('Friendly Fire aus');
  });
});
