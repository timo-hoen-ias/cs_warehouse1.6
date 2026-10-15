import { describe, expect, it } from 'vitest';
import {
  BOT_DIFFICULTIES, MENU_ENTRIES, SCREEN_TITLES, clampMaxPlayers, currentScreen, difficultyForSkill, fillForTeamSize, goBack, initialMenu,
  defaultSetup, moveFocus, openScreen, parseLaunch, roomLink, sanitizeSavedSetup, teamSizeForFill, validServerUrl,
} from './menu';

describe('roomLink', () => {
  it('setzt Raum/Karte/Server und entfernt Test-/Geheim-Parameter', () => {
    const l = roomLink('http://h:3000/?auto=1&pw=geheim&quality=low&fill=4', 'K7Q2M', 'de_rampe', 'ws://x:9100/socket');
    const u = new URL(l);
    expect(u.searchParams.get('room')).toBe('K7Q2M');
    expect(u.searchParams.get('map')).toBe('de_rampe');
    expect(u.searchParams.get('server')).toBe('ws://x:9100/socket');
    expect(u.searchParams.get('quality')).toBe('low');
    for (const k of ['auto', 'pw', 'fill']) expect(u.searchParams.has(k)).toBe(false);
    expect(new URL(roomLink(l, 'AAAAA', 'de_x')).searchParams.has('server')).toBe(false);
  });
});

describe('sanitizeSavedSetup', () => {
  it('Standard bei Unsinn', () => {
    expect(sanitizeSavedSetup(null, 'de_x', ['de_x'])).toEqual(defaultSetup('de_x'));
    expect(sanitizeSavedSetup('x', 'de_x', ['de_x']).mapId).toBe('de_x');
  });

  it('übernimmt gültige Werte, verwirft unbekannte Karten, klemmt Zahlen, speichert kein Passwort', () => {
    const s = sanitizeSavedSetup({ name: '<b>Neo</b>', mapId: 'de_alt', team: 'CT', fillTo: 99, botSkill: 3, server: 'javascript:x', maxPlayers: 1, listed: false, password: 'x' }, 'de_x', ['de_x']);
    expect(s).toMatchObject({ name: 'bNeo/b', mapId: 'de_x', team: 'CT', fillTo: 32, botSkill: 1, server: '', maxPlayers: 2, listed: false, password: '' });
    expect(sanitizeSavedSetup({ mapId: 'de_y' }, 'de_x', ['de_x', 'de_y']).mapId).toBe('de_y');
    expect(sanitizeSavedSetup({ friendlyFire: true }, 'de_x', ['de_x']).friendlyFire).toBe(true);
    expect(sanitizeSavedSetup({ friendlyFire: 'ja' }, 'de_x', ['de_x']).friendlyFire).toBe(false);
  });
});

describe('Menü-Zustandsmaschine', () => {
  it('startet im Hauptmenü', () => {
    const s = initialMenu();
    expect(currentScreen(s)).toBe('main');
    expect(goBack(s)).toBe(s);
  });

  it('öffnet Unterseiten und kehrt mit Zurück ins Hauptmenü', () => {
    const s = openScreen(initialMenu(), 'single');
    expect(s.stack).toEqual(['main', 'single']);
    expect(currentScreen(goBack(s))).toBe('main');
  });

  it('Unterseiten ersetzen sich gegenseitig (kein endloser Stapel)', () => {
    let s = openScreen(initialMenu(), 'settings');
    s = openScreen(s, 'help');
    s = openScreen(s, 'credits');
    expect(s.stack).toEqual(['main', 'credits']);
  });

  it('Serverbrowser → Server erstellen → Zurück landet im Browser', () => {
    let s = openScreen(initialMenu(), 'browser');
    s = openScreen(s, 'create');
    expect(s.stack).toEqual(['main', 'browser', 'create']);
    s = goBack(s);
    expect(currentScreen(s)).toBe('browser');
  });

  it('bereits offener Bildschirm springt zurück statt zu stapeln', () => {
    let s = openScreen(initialMenu(), 'browser');
    s = openScreen(s, 'create');
    s = openScreen(s, 'browser');
    expect(s.stack).toEqual(['main', 'browser']);
    expect(openScreen(s, 'main').stack).toEqual(['main']);
  });

  it('Startbildschirm per Parameter', () => {
    expect(initialMenu('browser').stack).toEqual(['main', 'browser']);
  });

  it('jeder Eintrag hat einen Titel', () => {
    for (const e of MENU_ENTRIES) expect(SCREEN_TITLES[e.screen]).toBeTruthy();
    expect(MENU_ENTRIES.map((e) => e.screen)).toEqual(['single', 'browser', 'create', 'settings', 'help', 'credits', 'quit']);
  });
});

describe('moveFocus', () => {
  it('läuft am Ende um', () => {
    expect(moveFocus(0, 1, 3)).toBe(1);
    expect(moveFocus(2, 1, 3)).toBe(0);
    expect(moveFocus(0, -1, 3)).toBe(2);
    expect(moveFocus(1, -7, 3)).toBe(0);
  });

  it('robust bei leerer Liste/NaN', () => {
    expect(moveFocus(5, 1, 0)).toBe(0);
    expect(moveFocus(NaN, 1, 4)).toBe(1);
  });
});

describe('Teamgröße / Schwierigkeit / Spielerlimit', () => {
  it('Teamgröße ↔ Spieler gesamt', () => {
    expect(fillForTeamSize(3)).toBe(6);
    expect(fillForTeamSize(5)).toBe(10);
    expect(fillForTeamSize(0)).toBe(2);
    expect(teamSizeForFill(6)).toBe(3);
    expect(teamSizeForFill(5)).toBe(3);
    expect(teamSizeForFill(99)).toBe(8);
    expect(teamSizeForFill(NaN)).toBe(3);
  });

  it('Schwierigkeit zum Skill', () => {
    expect(difficultyForSkill(0.3).label).toBe('Leicht');
    expect(difficultyForSkill(0.62).label).toBe('Normal');
    expect(difficultyForSkill(0.9).label).toBe('Schwer');
    expect(difficultyForSkill(1).label).toBe('Experte');
    expect(difficultyForSkill(NaN).label).toBe('Normal');
    for (const d of BOT_DIFFICULTIES) expect(d.skill).toBeGreaterThanOrEqual(0), expect(d.skill).toBeLessThanOrEqual(1);
  });

  it('Spielerlimit 2..16', () => {
    expect(clampMaxPlayers(1)).toBe(2);
    expect(clampMaxPlayers(40)).toBe(16);
    expect(clampMaxPlayers(NaN)).toBe(10);
  });
});

describe('validServerUrl', () => {
  it('nur ws/wss', () => {
    expect(validServerUrl('ws://localhost:9100/socket')).toBe('ws://localhost:9100/socket');
    expect(validServerUrl(' wss://x.de/socket ')).toBe('wss://x.de/socket');
    expect(validServerUrl('javascript:alert(1)')).toBe('');
    expect(validServerUrl('http://x')).toBe('');
    expect(validServerUrl('ws://a"onload=1')).toBe('');
    expect(validServerUrl(null)).toBe('');
  });
});

describe('parseLaunch', () => {
  it('ohne Parameter: Menü, nichts vorbelegt', () => {
    expect(parseLaunch('', 'de_x')).toEqual({ auto: null, room: '', map: '', server: '', screen: 'main' });
  });

  it('?auto=1&fill=4 startet offline mit Standardkarte (Smoke-Test)', () => {
    const l = parseLaunch('?auto=1&fill=4&quality=low', 'de_x');
    expect(l.auto).toMatchObject({ mode: 'offline', mapId: 'de_x', fillTo: 4, team: 'T', name: 'Smoke', room: '', lobby: false });
  });

  it('Friendly Fire: Standard aus, ?ff=1 schaltet es ein, Einladungslink verrät es nicht', () => {
    expect(defaultSetup('de_x').friendlyFire).toBe(false);
    expect(parseLaunch('?auto=1', 'de_x').auto!.friendlyFire).toBe(false);
    expect(parseLaunch('?auto=1&ff=1', 'de_x').auto!.friendlyFire).toBe(true);
    expect(parseLaunch('?auto=1&ff=0', 'de_x').auto!.friendlyFire).toBe(false);
    expect(new URL(roomLink('http://h/?auto=1&ff=1', 'AAAAA', 'de_x')).searchParams.has('ff')).toBe(false);
  });

  it('?auto=1 mit Raum tritt bei (Netztest)', () => {
    const l = parseLaunch('?auto=1&room=nettest&server=ws%3A%2F%2Flocalhost%3A9100%2Fsocket&name=Anna&team=CT&fill=4', 'de_x');
    expect(l.auto).toMatchObject({ mode: 'join', room: 'NETTEST', server: 'ws://localhost:9100/socket', name: 'Anna', team: 'CT' });
  });

  it('?auto=1&host=1 hostet mit Servername, Limit, Passwort; Lobby nur auf Wunsch', () => {
    const l = parseLaunch('?auto=1&host=1&room=ABCDE&sname=Testserver&max=6&pw=x', 'de_x');
    expect(l.auto).toMatchObject({ mode: 'host', room: 'ABCDE', serverName: 'Testserver', maxPlayers: 6, password: 'x', listed: true, lobby: false });
    expect(parseLaunch('?auto=1&host=1&room=ABCDE&lobby=1&listed=0', 'de_x').auto).toMatchObject({ lobby: true, listed: false });
  });

  it('Einladungslink belegt Raum/Karte/Server vor, ohne zu starten', () => {
    const l = parseLaunch('?room=k7q2m&map=de_rampe&server=ws://h:1/socket', 'de_x');
    expect(l).toMatchObject({ auto: null, room: 'K7Q2M', map: 'de_rampe', server: 'ws://h:1/socket' });
  });

  it('bereinigt Karten-IDs, ungültige Teams und Server', () => {
    const l = parseLaunch('?auto=1&map=../evil<x>&team=X&server=javascript:1&fill=abc', 'de_x');
    expect(l.auto).toMatchObject({ mapId: 'evilx', team: 'T', server: '', fillTo: 4 });
  });

  it('?menu=browser öffnet den Serverbrowser; Unbekanntes → Hauptmenü', () => {
    expect(parseLaunch('?menu=browser', 'd').screen).toBe('browser');
    expect(parseLaunch('?menu=quit', 'd').screen).toBe('main');
    expect(parseLaunch('?menu=<x>', 'd').screen).toBe('main');
  });
});
