import { describe, expect, it } from 'vitest';
import {
  admitPlayer, authProof, holdWarmup, kickReasonText, lobbyActive, lobbyFromPublic, makeNonce, passwordDigest, publicLobby,
  sanitizePublicLobby, type AdmitInput, type LobbyConfig,
} from './lobby';
import { ROUND, newRoundState } from './round';

const cfg = (o: Partial<LobbyConfig> = {}): LobbyConfig => ({ name: 'Test', maxPlayers: 4, pw: null, listed: true, hold: false, ...o });
const inp = (o: Partial<AdmitInput> = {}): AdmitInput => ({ humans: 1, nonce: null, proof: undefined, id: 'p1', ...o });

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

  it('hängt von Raum und Passwort ab (Raumcode wirkt als Salz)', () => {
    const d = passwordDigest('ABCDE', 'geheim');
    expect(passwordDigest('ABCDF', 'geheim')).not.toBe(d);
    expect(passwordDigest('ABCDE', 'Geheim')).not.toBe(d);
    expect(passwordDigest('ABCDE', 'geheim ')).not.toBe(d);
  });
});

describe('authProof / makeNonce', () => {
  it('Antwort hängt von Prüfsumme, Nonce und ID ab und enthält die Prüfsumme nicht', () => {
    const d = passwordDigest('ABCDE', 'x')!;
    const p = authProof(d, 'n1', 'id1');
    expect(p).toMatch(/^[0-9a-f]{16}$/);
    expect(p).not.toBe(d);
    expect(authProof(d, 'n1', 'id1')).toBe(p);
    expect(authProof(d, 'n2', 'id1')).not.toBe(p);
    expect(authProof(d, 'n1', 'id2')).not.toBe(p);
    expect(authProof(passwordDigest('ABCDE', 'y')!, 'n1', 'id1')).not.toBe(p);
  });

  it('Nonce: 16 Hex-Zeichen', () => {
    expect(makeNonce()).toMatch(/^[0-9a-f]{16}$/);
    expect(makeNonce(() => 0)).toBe('0000000000000000');
  });
});

describe('admitPlayer', () => {
  it('ohne Konfiguration erlaubt (Version/Karte werden trotzdem geprüft)', () => {
    expect(admitPlayer(null, inp({ humans: 99 }))).toEqual({ ok: true });
    expect(admitPlayer(null, inp({ version: '1', hostVersion: '2' }))).toEqual({ ok: false, reason: 'version' });
    expect(admitPlayer(null, inp({ map: 'de_a', hostMap: 'de_b' }))).toEqual({ ok: false, reason: 'map' });
  });

  it('Passwort per Challenge-Response: erste Meldung → Anfrage, dann nur die richtige Antwort', () => {
    const pw = passwordDigest('ABCDE', 'x')!;
    const c = cfg({ pw });
    expect(admitPlayer(c, inp())).toEqual({ ok: false, reason: 'challenge' });
    // Noch keine Anfrage gestellt, aber schon eine „Antwort“ → erst Anfrage
    expect(admitPlayer(c, inp({ proof: 'abc' }))).toEqual({ ok: false, reason: 'challenge' });
    expect(admitPlayer(c, inp({ nonce: 'n' }))).toEqual({ ok: false, reason: 'challenge' });
    expect(admitPlayer(c, inp({ nonce: 'n', proof: null }))).toEqual({ ok: false, reason: 'password' });
    expect(admitPlayer(c, inp({ nonce: 'n', proof: 'falsch' }))).toEqual({ ok: false, reason: 'password' });
    // Die Prüfsumme selbst ist keine gültige Antwort mehr (sie war früher im Snapshot)
    expect(admitPlayer(c, inp({ nonce: 'n', proof: pw }))).toEqual({ ok: false, reason: 'password' });
    // Antwort eines anderen Spielers (mitgehört) gilt nicht für diese ID
    expect(admitPlayer(c, inp({ nonce: 'n', proof: authProof(pw, 'n', 'other') }))).toEqual({ ok: false, reason: 'password' });
    expect(admitPlayer(c, inp({ nonce: 'n', proof: authProof(pw, 'n', 'p1') }))).toEqual({ ok: true });
  });

  it('prüft das Spielerlimit (ohne den Neuen gezählt)', () => {
    expect(admitPlayer(cfg({ maxPlayers: 4 }), inp({ humans: 3 }))).toEqual({ ok: true });
    expect(admitPlayer(cfg({ maxPlayers: 4 }), inp({ humans: 4 }))).toEqual({ ok: false, reason: 'full' });
  });

  it('prüft Version und Karte, wenn beide bekannt sind', () => {
    expect(admitPlayer(cfg(), inp({ version: '1', hostVersion: '2' }))).toEqual({ ok: false, reason: 'version' });
    expect(admitPlayer(cfg(), inp({ version: '2', hostVersion: '2' }))).toEqual({ ok: true });
    expect(admitPlayer(cfg(), inp({ hostVersion: '2' }))).toEqual({ ok: true });
    expect(admitPlayer(cfg(), inp({ map: 'de_x', hostMap: 'de_y' }))).toEqual({ ok: false, reason: 'map' });
    expect(admitPlayer(cfg(), inp({ map: 'de_x', hostMap: 'de_x' }))).toEqual({ ok: true });
  });

  it('Gründe haben deutsche Texte', () => {
    expect(kickReasonText('password')).toMatch(/Passwort/);
    expect(kickReasonText('full')).toMatch(/voll/);
    expect(kickReasonText('map')).toMatch(/Karte/);
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

describe('publicLobby / sanitizePublicLobby / lobbyFromPublic', () => {
  it('der Snapshot-Teil enthält nie die Prüfsumme', () => {
    const c = cfg({ pw: passwordDigest('ABCDE', 'x'), hold: true, map: 'de_lager', fillTo: 8, botSkill: 0.85 });
    const pub = publicLobby(c);
    expect(pub).toEqual({ name: 'Test', maxPlayers: 4, hasPassword: true, listed: true, hold: true, map: 'de_lager', fillTo: 8, botSkill: 0.85 });
    expect(JSON.stringify(pub)).not.toContain(c.pw!);
    expect(sanitizePublicLobby(pub)).toEqual(pub);
  });

  it('bereinigt Namen, klemmt Zahlen, verwirft kaputte Karten und Typen', () => {
    expect(sanitizePublicLobby({ name: '<b>x</b>', maxPlayers: 99, hasPassword: 'ja', hold: 'ja', map: '../x', fillTo: 1e9, botSkill: NaN })).toEqual({
      name: 'bx/b', maxPlayers: 16, hasPassword: false, listed: true, hold: false, map: null, fillTo: 32, botSkill: null,
    });
    expect(sanitizePublicLobby({ maxPlayers: 0 })?.maxPlayers).toBe(2);
    expect(sanitizePublicLobby({ maxPlayers: Infinity })?.maxPlayers).toBe(10);
    expect(sanitizePublicLobby(null)).toBeNull();
    expect(sanitizePublicLobby([1])).toBeNull();
    expect(sanitizePublicLobby('x')).toBeNull();
    expect(sanitizePublicLobby({ listed: false })?.listed).toBe(false);
    expect(sanitizePublicLobby({ botSkill: -3 })?.botSkill).toBe(0);
  });

  it('Host-Migration: neuer Host übernimmt Regeln und nutzt die eigene Prüfsumme', () => {
    const pw = passwordDigest('ABCDE', 'x');
    const pub = publicLobby(cfg({ pw, map: 'de_lager', fillTo: 8, botSkill: 0.3 }));
    expect(lobbyFromPublic(pub, pw)).toEqual(cfg({ pw, map: 'de_lager', fillTo: 8, botSkill: 0.3 }));
    // Ohne eigene Prüfsumme bleibt der Server offen (die alte wird nie verteilt)
    expect(lobbyFromPublic(pub, null).pw).toBeNull();
    // Offener Server bleibt offen, auch wenn der neue Host eine Prüfsumme hätte
    expect(lobbyFromPublic(publicLobby(cfg()), pw).pw).toBeNull();
    expect(lobbyFromPublic(publicLobby(cfg()), null)).toEqual(cfg());
  });
});
