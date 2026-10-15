import { describe, expect, it } from 'vitest';
import { admitPlayer, holdWarmup, kickReasonText, lobbyActive, passwordDigest, sanitizeLobbyConfig, type LobbyConfig } from './lobby';
import { ROUND, newRoundState } from './round';

const cfg = (o: Partial<LobbyConfig> = {}): LobbyConfig => ({ name: 'Test', maxPlayers: 4, pw: null, listed: true, hold: false, ...o });

describe('passwordDigest', () => {
  it('leeres Passwort → null (offener Server)', () => {
    expect(passwordDigest('ABCDE', '')).toBeNull();
  });

  it('deterministisch, 16 Hex-Zeichen, kein Klartext', () => {
    const d = passwordDigest('ABCDE', 'geheim')!;
    expect(d).toMatch(/^[0-9a-f]{16}$/);
    expect(passwordDigest('ABCDE', 'geheim')).toBe(d);
    expect(d).not.toContain('geheim');
  });

  it('hängt von Raum und Passwort ab', () => {
    const d = passwordDigest('ABCDE', 'geheim');
    expect(passwordDigest('ABCDF', 'geheim')).not.toBe(d);
    expect(passwordDigest('ABCDE', 'Geheim')).not.toBe(d);
    expect(passwordDigest('ABCDE', 'geheim ')).not.toBe(d);
  });
});

describe('admitPlayer', () => {
  it('ohne Konfiguration immer erlaubt', () => {
    expect(admitPlayer(null, 99, undefined)).toEqual({ ok: true });
  });

  it('prüft das Passwort', () => {
    const pw = passwordDigest('ABCDE', 'x');
    expect(admitPlayer(cfg({ pw }), 1, null)).toEqual({ ok: false, reason: 'password' });
    expect(admitPlayer(cfg({ pw }), 1, 'falsch')).toEqual({ ok: false, reason: 'password' });
    expect(admitPlayer(cfg({ pw }), 1, pw)).toEqual({ ok: true });
  });

  it('prüft das Spielerlimit (ohne den Neuen gezählt)', () => {
    expect(admitPlayer(cfg({ maxPlayers: 4 }), 3, null)).toEqual({ ok: true });
    expect(admitPlayer(cfg({ maxPlayers: 4 }), 4, null)).toEqual({ ok: false, reason: 'full' });
  });

  it('prüft die Version, wenn beide bekannt sind', () => {
    expect(admitPlayer(cfg(), 0, null, '1', '2')).toEqual({ ok: false, reason: 'version' });
    expect(admitPlayer(cfg(), 0, null, '2', '2')).toEqual({ ok: true });
    expect(admitPlayer(cfg(), 0, null, undefined, '2')).toEqual({ ok: true });
  });

  it('Gründe haben deutsche Texte', () => {
    expect(kickReasonText('password')).toMatch(/Passwort/);
    expect(kickReasonText('full')).toMatch(/voll/);
    expect(kickReasonText('???')).toBe('Vom Server getrennt');
  });
});

describe('holdWarmup / lobbyActive', () => {
  it('hält den Aufwärm-Timer vor Runde 1', () => {
    const r = newRoundState();
    r.timer = 0.2;
    holdWarmup(r, true);
    expect(r.timer).toBe(ROUND.warmupTime);
    expect(lobbyActive(r, { hold: true })).toBe(true);
  });

  it('wirkt nicht ohne Halten, außerhalb des Aufwärmens oder nach Runde 0', () => {
    const r = newRoundState();
    r.timer = 1;
    holdWarmup(r, false);
    expect(r.timer).toBe(1);
    r.phase = 'freeze';
    holdWarmup(r, true);
    expect(r.timer).toBe(1);
    const later = { ...newRoundState(), round: 3, timer: 1 };
    holdWarmup(later, true);
    expect(later.timer).toBe(1);
    expect(lobbyActive(later, { hold: true })).toBe(false);
    expect(lobbyActive(newRoundState(), null)).toBe(false);
  });
});

describe('sanitizeLobbyConfig', () => {
  it('übernimmt gültige Werte', () => {
    const c = cfg({ pw: passwordDigest('ABCDE', 'x'), hold: true });
    expect(sanitizeLobbyConfig(c)).toEqual(c);
  });

  it('bereinigt Namen, klemmt Spielerzahl, verwirft kaputte Prüfsummen', () => {
    expect(sanitizeLobbyConfig({ name: '<b>x</b>', maxPlayers: 99, pw: 'klartext', hold: 'ja' })).toEqual({
      name: 'bx/b', maxPlayers: 16, pw: null, listed: true, hold: false,
    });
    expect(sanitizeLobbyConfig({ maxPlayers: 0 })?.maxPlayers).toBe(2);
    expect(sanitizeLobbyConfig(null)).toBeNull();
    expect(sanitizeLobbyConfig({ listed: false })?.listed).toBe(false);
  });
});
