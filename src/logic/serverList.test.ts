import { describe, expect, it } from 'vitest';
import {
  GAME_VERSION, MAX_SERVERS, SERVER_LOCK_MS, SERVER_TTL_MS, cleanText, expireServers, filterServers, joinBlockReason, latencyInfo, mergeServer,
  normalizeRoomCode, playersText, sanitizeHeartbeat, serverStatusText, sortServers, validRoomCode, type Heartbeat, type ServerList,
} from './serverList';

const hb = (o: Partial<Heartbeat> = {}): Heartbeat => ({
  room: 'ABCDE', name: 'Lagerhalle 1', map: 'de_lagerstaub', players: 2, maxPlayers: 10, bots: 4,
  phase: 'live', round: 3, score: [2, 1], hasPassword: false, friendlyFire: false, version: GAME_VERSION, ...o,
});

describe('sanitizeHeartbeat', () => {
  it('übernimmt einen gültigen Heartbeat', () => {
    expect(sanitizeHeartbeat(hb())).toEqual(hb());
  });

  it('verwirft Nicht-Objekte und ungültige Raumcodes/Karten', () => {
    for (const raw of [null, 1, 'x', [], { ...hb(), room: 'ab' }, { ...hb(), room: '<script>' }, { ...hb(), map: '../x' }, { ...hb(), map: 7 }]) {
      expect(sanitizeHeartbeat(raw)).toBeNull();
    }
  });

  it('entschärft HTML/Steuerzeichen im Namen (XSS)', () => {
    const s = sanitizeHeartbeat({ ...hb(), name: '<img src=x onerror="alert(1)">\u0000Böse‮' });
    expect(s?.name).not.toMatch(/[<>"'&]/);
    expect(s?.name).toContain('Böse');
    expect(s?.name).not.toContain('‮');
  });

  it('kürzt lange Namen und ersetzt leere durch einen Standardnamen', () => {
    expect(sanitizeHeartbeat({ ...hb(), name: 'x'.repeat(100) })?.name.length).toBe(32);
    expect(sanitizeHeartbeat({ ...hb(), name: '   ' })?.name).toBe('Server ABCDE');
    expect(sanitizeHeartbeat({ ...hb(), name: 42 })?.name).toBe('Server ABCDE');
  });

  it('klemmt Zahlen und begrenzt Spieler auf maxPlayers', () => {
    const s = sanitizeHeartbeat({ ...hb(), players: 99, maxPlayers: 8, bots: -3, round: 1e9, score: [-1, 'x'] });
    expect(s).toMatchObject({ players: 8, maxPlayers: 8, bots: 0, round: 99, score: [0, 0] });
    expect(sanitizeHeartbeat({ ...hb(), maxPlayers: NaN })?.maxPlayers).toBe(10);
  });

  it('unbekannte Phase → live, Passwort nur bei echtem true', () => {
    expect(sanitizeHeartbeat({ ...hb(), phase: 'hack' })?.phase).toBe('live');
    expect(sanitizeHeartbeat({ ...hb(), hasPassword: 'yes' })?.hasPassword).toBe(false);
    expect(sanitizeHeartbeat({ ...hb(), hasPassword: true })?.hasPassword).toBe(true);
    expect(sanitizeHeartbeat({ ...hb(), friendlyFire: 'yes' })?.friendlyFire).toBe(false);
    expect(sanitizeHeartbeat({ ...hb(), friendlyFire: undefined })?.friendlyFire).toBe(false);
    expect(sanitizeHeartbeat({ ...hb(), friendlyFire: true })?.friendlyFire).toBe(true);
  });

  it('übernimmt Echo nur mit gültigen Typen', () => {
    expect(sanitizeHeartbeat({ ...hb(), echo: { to: 'me', t: 5 } })?.echo).toEqual({ to: 'me', t: 5 });
    expect(sanitizeHeartbeat({ ...hb(), echo: { to: 'me', t: 'x' } })?.echo).toBeUndefined();
    expect(sanitizeHeartbeat({ ...hb(), echo: 'x' })?.echo).toBeUndefined();
  });

  it('Region optional und bereinigt', () => {
    expect(sanitizeHeartbeat({ ...hb(), region: 'EU <b>' })?.region).toBe('EU b');
    expect(sanitizeHeartbeat(hb())?.region).toBeUndefined();
  });
});

describe('cleanText / Raumcodes', () => {
  it('entfernt gefährliche Zeichen und normalisiert Leerraum', () => {
    expect(cleanText('  a\n\tb  <c> ', 20)).toBe('a b c');
    expect(cleanText(null, 5, 'fb')).toBe('fb');
  });

  it('validiert und normalisiert Raumcodes', () => {
    expect(validRoomCode('K7Q2M')).toBe(true);
    expect(validRoomCode('k7q2m')).toBe(false);
    expect(validRoomCode('AB')).toBe(false);
    expect(normalizeRoomCode(' k7-q2 m ')).toBe('K7Q2M');
    expect(normalizeRoomCode('x'.repeat(30)).length).toBe(12);
  });
});

describe('mergeServer / expireServers', () => {
  it('legt neue Einträge an und aktualisiert vorhandene', () => {
    let l: ServerList = {};
    l = mergeServer(l, hb(), 1000, 'me');
    expect(l.ABCDE).toMatchObject({ firstSeen: 1000, lastSeen: 1000, latency: null, compatible: true });
    l = mergeServer(l, hb({ players: 5 }), 4000, 'me');
    expect(l.ABCDE).toMatchObject({ firstSeen: 1000, lastSeen: 4000, players: 5 });
    expect(Object.keys(l)).toHaveLength(1);
  });

  it('ist unveränderlich (neues Objekt)', () => {
    const a: ServerList = {};
    const b = mergeServer(a, hb(), 1, null);
    expect(a).toEqual({});
    expect(b).not.toBe(a);
  });

  it('misst die Latenz nur aus an uns gerichteten Echos und glättet sie', () => {
    let l = mergeServer({}, hb({ echo: { to: 'other', t: 900 } }), 1000, 'me');
    expect(l.ABCDE!.latency).toBeNull();
    l = mergeServer(l, hb({ echo: { to: 'me', t: 900 } }), 1000, 'me');
    expect(l.ABCDE!.latency).toBe(100);
    l = mergeServer(l, hb({ echo: { to: 'me', t: 1800 } }), 2000, 'me');
    expect(l.ABCDE!.latency).toBe(150);
    // ohne Echo bleibt der Wert, negative/absurde Werte werden ignoriert
    l = mergeServer(l, hb(), 3000, 'me');
    expect(l.ABCDE!.latency).toBe(150);
    l = mergeServer(l, hb({ echo: { to: 'me', t: 9000 } }), 3000, 'me');
    expect(l.ABCDE!.latency).toBe(150);
    expect('echo' in l.ABCDE!).toBe(false);
  });

  it('markiert Versionskonflikte als inkompatibel', () => {
    const l = mergeServer({}, hb({ version: '0.9' }), 1, null);
    expect(l.ABCDE!.compatible).toBe(false);
    expect(joinBlockReason(l.ABCDE!)).toBe('Andere Version (0.9)');
  });

  it('begrenzt die Anzahl der Einträge: der am längsten stille weicht, neue Server bleiben sichtbar', () => {
    let l: ServerList = {};
    for (let i = 0; i < MAX_SERVERS + 5; i++) l = mergeServer(l, hb({ room: `R${String(i).padStart(4, '0')}` }), i, null);
    expect(Object.keys(l)).toHaveLength(MAX_SERVERS);
    expect(l.R0000).toBeUndefined();
    expect(l.R0004).toBeUndefined();
    expect(l[`R${String(MAX_SERVERS + 4).padStart(4, '0')}`]).toBeDefined();
    // Ein aktiver Server (frischer Heartbeat) überlebt die Flut
    l = mergeServer(l, hb({ room: 'R0005' }), 10000, null);
    for (let i = 0; i < 50; i++) l = mergeServer(l, hb({ room: `F${String(i).padStart(4, '0')}` }), 10001 + i, null);
    expect(l.R0005).toBeDefined();
    expect(Object.keys(l)).toHaveLength(MAX_SERVERS);
  });

  it('frischer Eintrag: fremde Heartbeats ändern Karte und Schloss nicht; nach Verstummen schon', () => {
    let l = mergeServer({}, hb({ map: 'de_lager', hasPassword: true }), 1000, null);
    l = mergeServer(l, hb({ map: 'de_umschlag', hasPassword: false, players: 3 }), 2000, null);
    expect(l.ABCDE).toMatchObject({ map: 'de_lager', hasPassword: true, players: 3 });
    // Alter Melder seit > SERVER_LOCK_MS still (z. B. Host-Wechsel) → neuer Stand gilt
    l = mergeServer(l, hb({ map: 'de_umschlag', hasPassword: false }), 2000 + SERVER_LOCK_MS + 1, null);
    expect(l.ABCDE).toMatchObject({ map: 'de_umschlag', hasPassword: false });
  });

  it('lässt Einträge nach der TTL verfallen', () => {
    let l = mergeServer({}, hb(), 0, null);
    l = mergeServer(l, hb({ room: 'FGHJK' }), 8000, null);
    expect(expireServers(l, SERVER_TTL_MS)).toBe(l);
    const after = expireServers(l, SERVER_TTL_MS + 1);
    expect(Object.keys(after)).toEqual(['FGHJK']);
  });
});

describe('filterServers / sortServers', () => {
  const list = Object.values([
    hb({ room: 'AAAAA', name: 'Alpha', players: 0, maxPlayers: 10 }),
    hb({ room: 'BBBBB', name: 'Bravo', players: 10, maxPlayers: 10 }),
    hb({ room: 'CCCCC', name: 'Charlie', players: 4, maxPlayers: 10, hasPassword: true, map: 'de_rampe' }),
    hb({ room: 'DDDDD', name: 'Delta', players: 6, maxPlayers: 10, version: 'alt' }),
  ].reduce<ServerList>((l, h, i) => mergeServer(l, h, i, null), {}));

  it('filtert volle, leere, inkompatible und passwortgeschützte Server', () => {
    expect(filterServers(list, { notFull: true }).map((e) => e.room)).not.toContain('BBBBB');
    expect(filterServers(list, { notEmpty: true }).map((e) => e.room)).not.toContain('AAAAA');
    expect(filterServers(list, { sameVersion: true }).map((e) => e.room)).not.toContain('DDDDD');
    expect(filterServers(list, { noPassword: true }).map((e) => e.room)).not.toContain('CCCCC');
    expect(filterServers(list, {})).toHaveLength(4);
  });

  it('sucht in Name, Karte und Raumcode', () => {
    expect(filterServers(list, { search: 'rampe' }).map((e) => e.room)).toEqual(['CCCCC']);
    expect(filterServers(list, { search: 'bra' }).map((e) => e.room)).toEqual(['BBBBB']);
    expect(filterServers(list, { search: 'ddddd' }).map((e) => e.room)).toEqual(['DDDDD']);
  });

  it('sortiert nach Spielern absteigend, inkompatible zuletzt', () => {
    expect(sortServers(list).map((e) => e.room)).toEqual(['BBBBB', 'CCCCC', 'AAAAA', 'DDDDD']);
  });

  it('sortiert nach Name und Latenz (unbekannt zuletzt)', () => {
    expect(sortServers(list, 'name').map((e) => e.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(sortServers(list, 'name', 'desc').map((e) => e.name)).toEqual(['Charlie', 'Bravo', 'Alpha', 'Delta']);
    const withLat = list.map((e) => ({ ...e, latency: e.room === 'CCCCC' ? 20 : e.room === 'AAAAA' ? 90 : null }));
    expect(sortServers(withLat, 'latency').map((e) => e.room).slice(0, 2)).toEqual(['CCCCC', 'AAAAA']);
  });
});

describe('Anzeige-Helfer', () => {
  it('Status je Phase', () => {
    expect(serverStatusText(hb({ phase: 'lobby' }))).toBe('Lobby – wartet');
    expect(serverStatusText(hb({ phase: 'warmup' }))).toBe('Aufwärmen');
    expect(serverStatusText(hb({ phase: 'bomb', round: 7, score: [4, 2] }))).toBe('Runde 7 · 4:2');
  });

  it('Spieler mit Bots', () => {
    expect(playersText(hb())).toBe('2/10 (+4 Bots)');
    expect(playersText(hb({ bots: 0 }))).toBe('2/10');
  });

  it('Latenz-Klassen', () => {
    expect(latencyInfo(null)).toEqual({ text: '–', level: 'unknown' });
    expect(latencyInfo(40).level).toBe('good');
    expect(latencyInfo(120).level).toBe('ok');
    expect(latencyInfo(400)).toEqual({ text: '400 ms', level: 'bad' });
  });

  it('Beitritts-Sperrgrund', () => {
    const e = mergeServer({}, hb({ players: 10 }), 0, null).ABCDE!;
    expect(joinBlockReason(e)).toBe('Server voll');
    expect(joinBlockReason({ ...e, players: 3 })).toBeNull();
  });
});
