import { describe, expect, it } from 'vitest';
import { addPlayer, beginRound, newMatch } from './match';
import { applySnapshot, packSnapshot, poseMsg, type NetMsg, type Snapshot } from './net';
import { publicLobby, passwordDigest } from './lobby';
import {
  NET_LIMITS, SNAP_SEQ, SnapSeqGate, chatText, clampNum, isBuyItem, isGrenadeKind, isHumanId, isNetId, isTeam, isWeaponId, num,
  parseEvent, parseNetMsg, parsePlayerSnap, parsePose, parseSnapshot, poseInBounds, senderAllowed, unitDir, vec3, wrapAngle,
} from './netValidate';

/** Gültiger Snapshot eines kleinen Matches (Basis für Manipulationen). */
function realSnap(): Snapshot {
  const m = newMatch();
  addPlayer(m, 'host-1', 'Anna', { team: 'T' });
  addPlayer(m, 'bot-0', 'Bot', { team: 'CT', bot: true });
  m.round.round = 1;
  beginRound(m, (team, i) => ({ x: i, y: 0, z: team === 'T' ? -5 : 5, yaw: 0, pitch: 0 }), () => 0);
  return JSON.parse(JSON.stringify(packSnapshot(m, 5, {
    nades: [{ id: 1, kind: 'he', p: [1, 2, 3] }],
    smokes: [{ pos: { x: 1, y: 0, z: 2 }, radius: 3, timeLeft: 5 }],
    bombPos: null,
    drops: [{ id: 4, weapon: 'ak47', p: [0, 0, 0] }],
    lobby: publicLobby({ name: 'S', maxPlayers: 8, pw: passwordDigest('R', 'x'), listed: true, hold: false, map: 'de_lager' }),
  })));
}

const BAD_NUMBERS: unknown[] = [NaN, Infinity, -Infinity, '5', null, undefined, {}, [], true, 1e300];

describe('Grundprüfungen', () => {
  it('IDs: Muster, Länge und keine Prototyp-Schlüssel', () => {
    for (const ok of ['a', 'bot-3', 'f3b1c2d4-1111-2222-3333-444455556666', 'local', 'A_b.c:d']) expect(isNetId(ok)).toBe(true);
    for (const bad of ['', 'x'.repeat(65), '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '<img>', 'a b', 'ä', 5, null, undefined, {}, ['a']]) {
      expect(isNetId(bad)).toBe(false);
    }
    expect(isHumanId('peer-1')).toBe(true);
    expect(isHumanId('bot-1')).toBe(false);
  });

  it('Aufzählungen: Team, Granate, Waffe, Kaufartikel', () => {
    expect(isTeam('T') && isTeam('CT')).toBe(true);
    for (const bad of ['t', 'auto', '', null, 1, '__proto__']) expect(isTeam(bad)).toBe(false);
    expect(isGrenadeKind('he') && isGrenadeKind('flash') && isGrenadeKind('smoke')).toBe(true);
    for (const bad of ['toString', 'constructor', '__proto__', 'molotov', 1, null]) expect(isGrenadeKind(bad)).toBe(false);
    expect(isWeaponId('ak47') && isWeaponId('knife_stab') && isWeaponId('c4')).toBe(true);
    for (const bad of ['toString', '__proto__', 'constructor', 'AK47', '', 5, null]) expect(isWeaponId(bad)).toBe(false);
    expect(isBuyItem('kevlar') && isBuyItem('m4a1') && isBuyItem('defusekit')).toBe(true);
    for (const bad of ['toString', '__proto__', 'ammo1', 5]) expect(isBuyItem(bad)).toBe(false);
  });

  it('Zahlen und Vektoren: nur endlich und begrenzt', () => {
    expect(num(3)).toBe(3);
    for (const bad of BAD_NUMBERS) expect(num(bad)).toBeNull();
    expect(num(NET_LIMITS.coord + 1)).toBeNull();
    expect(clampNum(NaN, 0, 10, 7)).toBe(7);
    expect(clampNum(99, 0, 10, 7)).toBe(10);
    expect(clampNum('3', 0, 10, 7)).toBe(7);
    expect(vec3([1, 2, 3])).toEqual([1, 2, 3]);
    for (const bad of [[1, 2], [1, 2, 3, 4], [1, NaN, 3], [1, '2', 3], 'abc', null, { 0: 1, 1: 2, 2: 3, length: 3 }]) expect(vec3(bad)).toBeNull();
  });

  it('Richtungen werden normalisiert; Null-, Riesen- und NaN-Vektoren verworfen', () => {
    const d = unitDir([0, 0, -1.001])!;
    expect(Math.hypot(...d)).toBeCloseTo(1, 12);
    expect(unitDir([0.6, 0.8, 0])).toEqual([0.6, 0.8, 0]);
    for (const bad of [[0, 0, 0], [1e-9, 0, 0], [2, 0, 0], [NaN, 0, 1], [0, 0, Infinity], 'x', [1, 0]]) expect(unitDir(bad)).toBeNull();
  });

  it('Winkel falten, Chattext ohne Steuerzeichen und gekürzt', () => {
    expect(wrapAngle(Math.PI * 4 + 0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(chatText('  hallo\u0000‮ welt  ')).toBe('hallo welt');
    expect(chatText('x'.repeat(5000))!.length).toBe(NET_LIMITS.chat);
    expect(chatText('   ')).toBeNull();
    expect(chatText(42)).toBeNull();
  });

  it('Kartengrenzen mit Rand', () => {
    const b = { min: [0, 0, 0] as [number, number, number], max: [100, 20, 100] as [number, number, number] };
    expect(poseInBounds({ x: 50, y: 5, z: 50 }, b)).toBe(true);
    expect(poseInBounds({ x: -5, y: -20, z: 105 }, b)).toBe(true);
    expect(poseInBounds({ x: 500, y: 5, z: 50 }, b)).toBe(false);
    expect(poseInBounds({ x: 50, y: 99, z: 50 }, b)).toBe(false);
  });
});

describe('Posen', () => {
  const good = () => ({ ...poseMsg('p1', { x: 1, y: 2, z: 3, yaw: 10, pitch: 0.3 }, 'ak47', true, false, true) });

  it('gültige Pose bleibt erhalten (Gierwinkel gefaltet, Flags als Booleans)', () => {
    const p = parsePose({ ...good(), c: 'ja', extra: '<script>' })!;
    expect(p).toMatchObject({ t: 'pose', id: 'p1', x: 1, y: 2, z: 3, w: 'ak47', c: false, m: false, e: true });
    expect(p.yaw).toBeCloseTo(wrapAngle(10));
    expect((p as Record<string, unknown>).extra).toBeUndefined();
  });

  it('NaN/Strings/Riesenwerte, unbekannte Waffe und böse IDs → verworfen', () => {
    for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) for (const bad of BAD_NUMBERS) expect(parsePose({ ...good(), [k]: bad })).toBeNull();
    expect(parsePose({ ...good(), w: 'toString' })).toBeNull();
    expect(parsePose({ ...good(), id: '__proto__' })).toBeNull();
    expect(parsePose({ ...good(), pitch: 50 })!.pitch).toBeCloseTo(Math.PI / 2);
  });
});

describe('Snapshot', () => {
  it('echter Snapshot übersteht die Prüfung unverändert', () => {
    const s = realSnap();
    expect(parseSnapshot(s)).toEqual(s);
  });

  it('HTML/Strings in Zahlenfeldern werden zu Zahlen (kein XSS über Runde, Kills, HP)', () => {
    const s = realSnap() as unknown as Record<string, any>;
    s.round.round = '<img src=x onerror=alert(1)>';
    s.round.tRounds = '<b>';
    s.players[0].kills = '<img src=x>';
    s.players[0].hp = '<svg onload=alert(1)>';
    s.players[0].name = '<img src=x onerror=alert(1)>';
    s.players[0].ping = { toString: '<x>' };
    const p = parseSnapshot(s)!;
    expect(p.round.round).toBe(0);
    expect(p.round.tRounds).toBe(0);
    expect(p.players[0]!.kills).toBe(0);
    expect(p.players[0]!.hp).toBe(0);
    expect(p.players[0]!.name).not.toMatch(/[<>"'&]/);
    expect(p.players[0]!.ping).toBe(-1);
    expect(JSON.stringify(p)).not.toMatch(/<|onerror|onload/);
  });

  it('Aufzählungen: kaputtes Team → Spieler weg, kaputte Phase → Snapshot weg', () => {
    const s = realSnap() as unknown as Record<string, any>;
    s.players[0].team = 'toString';
    expect(parseSnapshot(s)!.players.map((p) => p.id)).toEqual(['bot-0']);
    const t = realSnap() as unknown as Record<string, any>;
    t.round.phase = 'boom';
    expect(parseSnapshot(t)).toBeNull();
    const u = realSnap() as unknown as Record<string, any>;
    u.round.bomb.phase = '__proto__';
    expect(parseSnapshot(u)).toBeNull();
    const v = realSnap() as unknown as Record<string, any>;
    v.winner = 'X';
    expect(parseSnapshot(v)!.winner).toBeNull();
  });

  it('`__proto__`-IDs und doppelte IDs werden verworfen; applySnapshot verschmutzt nichts', () => {
    const s = realSnap() as unknown as Record<string, any>;
    s.players.push({ ...s.players[0], id: '__proto__', name: 'evil', hp: 1 }, { ...s.players[0], id: 'constructor' }, { ...s.players[1] });
    const p = parseSnapshot(s)!;
    expect(p.players.map((x) => x.id)).toEqual(['host-1', 'bot-0']);
    const m = newMatch();
    applySnapshot(m, p);
    expect(Object.keys(m.players).sort()).toEqual(['bot-0', 'host-1']);
    expect(({} as Record<string, unknown>).hp).toBeUndefined();
    // Auch ungeprüft: applySnapshot nutzt nur eigene Schlüssel
    const raw = realSnap();
    raw.players.push({ ...raw.players[0]!, id: '__proto__' });
    const m2 = newMatch();
    applySnapshot(m2, raw);
    expect(Object.getPrototypeOf(m2.players)).toBeNull();
    expect(({} as Record<string, unknown>).name).toBeUndefined();
  });

  it('riesige Arrays → verworfen, Waffen nur aus der Tabelle, Seq/Zeit endlich', () => {
    const s = realSnap() as unknown as Record<string, any>;
    s.players = Array.from({ length: NET_LIMITS.players + 1 }, (_, i) => ({ ...realSnap().players[0], id: `p${i}` }));
    expect(parseSnapshot(s)).toBeNull();
    const t = realSnap() as unknown as Record<string, any>;
    t.drops = Array.from({ length: NET_LIMITS.drops + 1 }, () => t.drops[0]);
    expect(parseSnapshot(t)).toBeNull();
    const u = realSnap() as unknown as Record<string, any>;
    u.players[0].weapon = 'toString';
    u.players[0].primary = 'glock'; // Pistole im Primär-Slot
    u.players[0].secondary = '__proto__';
    u.players[0].nades = [NaN, 99, '3'];
    u.drops[0].weapon = 'constructor';
    u.nades[0].kind = 'toString';
    u.smokes[0].r = Infinity;
    const p = parseSnapshot(u)!;
    expect(p.players[0]).toMatchObject({ weapon: 'knife', primary: null, secondary: null, nades: [0, 5, 0] });
    expect(p.drops).toEqual([]);
    expect(p.nades).toEqual([]);
    expect(p.smokes[0]!.r).toBe(0);
    for (const seq of [NaN, -1, 1.5, 1e15, '7']) expect(parseSnapshot({ ...realSnap(), seq })).toBeNull();
    expect(parseSnapshot({ ...realSnap(), time: Infinity })).toBeNull();
    expect(parseSnapshot({ ...realSnap(), bombPos: [NaN, 0, 0] })!.bombPos).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('snap')).toBeNull();
  });

  it('Lobby im Snapshot: nur öffentliche Felder, nie eine Prüfsumme', () => {
    const s = realSnap();
    expect(s.lobby).toMatchObject({ hasPassword: true, map: 'de_lager' });
    expect(JSON.stringify(s)).not.toContain(passwordDigest('R', 'x')!);
    const p = parseSnapshot({ ...s, lobby: { ...s.lobby, pw: 'abcdef0123456789' } })!;
    expect((p.lobby as Record<string, unknown>).pw).toBeUndefined();
  });

  it('Spieler-Einträge: Grenzen und Booleans', () => {
    const p = parsePlayerSnap({ id: 'a', name: 5, team: 'CT', bot: 'yes', hp: 1e9, alive: 1, money: -5, kills: 1e9, deaths: -3, weapon: 'm4a1', armor: 999, helmet: 'x', bomb: 1, kit: true, primary: 'm4a1', secondary: 'usp', nades: 'x', ping: NaN })!;
    expect(p).toMatchObject({ name: 'Spieler', bot: false, hp: 100, alive: false, money: 0, kills: 9999, deaths: 0, armor: 100, helmet: false, bomb: false, kit: true, primary: 'm4a1', secondary: 'usp', nades: [0, 0, 0], ping: -1 });
  });
});

describe('Ereignisse', () => {
  it('gültige Ereignisse bleiben erhalten', () => {
    const evs = [
      { k: 'kill', killer: null, victim: 'a', weapon: 'fall', hs: false },
      { k: 'hit', victim: 'a', attacker: 'b', dmg: 27, part: 'head', from: [0, 1, 2], at: [3, 4, 5] },
      { k: 'spawn', id: 'a', x: 1, y: 2, z: 3, yaw: 0.5, fresh: true },
      { k: 'shot', id: 'a', w: 'ak47', o: [0, 1, 0], ends: [[1, 1, 1]], walls: [] },
      { k: 'nade', id: 3, kind: 'smoke', owner: 'a', o: [0, 1, 0], v: [1, 2, 3] },
      { k: 'boom', id: -1, kind: 'he', at: [0, 0, 0] },
      { k: 'bomb', what: 'planted', by: 'a', spot: 'b' },
      { k: 'round', what: 'end', round: 3, outcome: 't_win', reason: 'Alle tot' },
      { k: 'buy', id: 'a', item: 'ammo1', ok: true },
      { k: 'match', winner: 'CT' },
      { k: 'drop', item: { id: 2, weapon: 'c4', x: 1, y: 0, z: 2 }, by: null },
      { k: 'pickup', id: 2, by: 'a', weapon: 'c4' },
      { k: 'join', id: 'a', name: 'Anna', team: 'T' },
      { k: 'leave', id: 'a', name: 'Anna' },
      { k: 'kick', id: 'a', reason: 'map', map: 'de_lager' },
      { k: 'auth', id: 'a', nonce: '0123456789abcdef' },
    ];
    for (const e of evs) expect(parseEvent(e)).toEqual(e);
  });

  it('kaputte Ereignisse → null', () => {
    const bad = [
      { k: 'kill', killer: '__proto__', victim: 'a', weapon: 'x' },
      { k: 'kill', killer: null, victim: 'a', weapon: '<img src=x>' },
      { k: 'hit', victim: 'a', attacker: null, dmg: 5, part: 'body', from: [NaN, 0, 0], at: [0, 0, 0] },
      { k: 'spawn', id: 'a', x: '1', z: 0, yaw: 0 },
      { k: 'shot', id: 'a', w: 'ak47', o: [0, 0, 0], ends: Array.from({ length: 100 }, () => [0, 0, 0]), walls: [] },
      { k: 'nade', id: 1.5, kind: 'he', owner: 'a', o: [0, 0, 0], v: [0, 0, 0] },
      { k: 'boom', id: 1, kind: 'toString', at: [0, 0, 0] },
      { k: 'bomb', what: 'nuke', by: null, spot: null },
      { k: 'round', what: 'mid', round: 1 },
      { k: 'buy', id: 'a', item: '<b>', ok: true },
      { k: 'match', winner: 'X' },
      { k: 'drop', item: { id: 1, weapon: 'toString', x: 0, y: 0, z: 0 }, by: null },
      { k: 'join', id: 'a', name: 'x', team: 'auto' },
      { k: 'kick', id: 'a', reason: '<script>' },
      { k: 'auth', id: 'a', nonce: 'zz' },
      { k: 'unknown' },
      null, 'ev', [1],
    ];
    for (const e of bad) expect(parseEvent(e)).toBeNull();
  });

  it('Texte werden bereinigt, Zahlen geklemmt', () => {
    expect(parseEvent({ k: 'hit', victim: 'a', attacker: null, dmg: 1e9, part: 'leg', from: [0, 0, 0], at: [0, 0, 0] })).toMatchObject({ dmg: 1000, part: 'body' });
    expect(parseEvent({ k: 'round', what: 'start', round: '<b>', reason: '<img src=x>' })).toEqual({ k: 'round', what: 'start', round: 0, reason: 'img src=x' });
    expect(parseEvent({ k: 'join', id: 'a', name: '<script>', team: 'T' })).toMatchObject({ name: 'script' });
    expect(parseEvent({ k: 'kick', id: 'a', reason: 'map', map: '../../x' })).toEqual({ k: 'kick', id: 'a', reason: 'map' });
  });
});

describe('parseNetMsg (Client-Nachrichten)', () => {
  it('Schuss: Waffe, Ursprung und normierte Richtungen, Strahlen begrenzt', () => {
    const m = parseNetMsg({ t: 'fire', id: 'a', w: 'm3', o: [0, 1.6, 0], d: [[0, 0, -2 / 2.001]], seq: 3 })!;
    expect(m).toMatchObject({ t: 'fire', id: 'a', w: 'm3', seq: 3 });
    expect(Math.hypot(...(m as Extract<NetMsg, { t: 'fire' }>).d[0]!)).toBeCloseTo(1, 12);
    for (const bad of [
      { t: 'fire', id: 'a', w: 'toString', o: [0, 0, 0], d: [[0, 0, 1]] },
      { t: 'fire', id: 'a', w: 'ak47', o: [0, NaN, 0], d: [[0, 0, 1]] },
      { t: 'fire', id: 'a', w: 'ak47', o: [0, 0, 0], d: [] },
      { t: 'fire', id: 'a', w: 'ak47', o: [0, 0, 0], d: [[0, 0, 0]] },
      { t: 'fire', id: 'a', w: 'ak47', o: [0, 0, 0], d: [['0', 0, 1]] },
      { t: 'fire', id: 'a', w: 'ak47', o: [0, 0, 0], d: Array.from({ length: 1e5 }, () => [0, 0, 1]) },
      { t: 'fire', id: '__proto__', w: 'ak47', o: [0, 0, 0], d: [[0, 0, 1]] },
    ]) expect(parseNetMsg(bad)).toBeNull();
  });

  it('Wurf: nur he/flash/smoke, endliche normierte Richtung, Stärke 0..1', () => {
    expect(parseNetMsg({ t: 'throw', id: 'a', kind: 'he', o: [0, 1, 0], d: [0, 0, 1], s: 7 })).toMatchObject({ s: 1 });
    for (const bad of [
      { t: 'throw', id: 'a', kind: 'toString', o: [0, 1, 0], d: [0, 0, 1], s: 1 },
      { t: 'throw', id: 'a', kind: 'he', o: [0, 1, 0], d: ['x', 0, 1], s: 1 },
      { t: 'throw', id: 'a', kind: 'he', o: [0, 1, 0], d: [0, 0, 1], s: NaN },
      { t: 'throw', id: 'a', kind: 'he', o: [Infinity, 1, 0], d: [0, 0, 1], s: 1 },
    ]) expect(parseNetMsg(bad)).toBeNull();
  });

  it('Hallo: Team nur T/CT/auto, Antwort-Feld unterscheidet „fehlt“ und „ungültig“', () => {
    expect(parseNetMsg({ t: 'hello', id: 'a', name: '<b>Bob</b>', team: 'auto', v: '1.6', map: 'de_lager' })).toEqual({ t: 'hello', id: 'a', name: 'bBob/b', team: 'auto', v: '1.6', map: 'de_lager' });
    expect(parseNetMsg({ t: 'hello', id: 'a', name: 'x', team: 'T', pr: 'nope' })).toMatchObject({ pr: null });
    expect(parseNetMsg({ t: 'hello', id: 'a', name: 'x', team: 'T', pr: '0123456789abcdef' })).toMatchObject({ pr: '0123456789abcdef' });
    expect(parseNetMsg({ t: 'hello', id: 'a', name: 'x', team: 'T', map: '../evil' })).toEqual({ t: 'hello', id: 'a', name: 'x', team: 'T' });
    for (const team of ['spec', '', null, 'toString', 1]) expect(parseNetMsg({ t: 'hello', id: 'a', name: 'x', team })).toBeNull();
    expect(parseNetMsg({ t: 'team', id: 'a', team: 'auto' })).toBeNull();
    expect(parseNetMsg({ t: 'team', id: 'a', team: 'CT' })).toEqual({ t: 'team', id: 'a', team: 'CT' });
  });

  it('Kauf/Munition/Drop/Sturz/Chat/Ping', () => {
    expect(parseNetMsg({ t: 'buy', id: 'a', item: 'kevlar' })).toEqual({ t: 'buy', id: 'a', item: 'kevlar' });
    expect(parseNetMsg({ t: 'buy', id: 'a', item: '__proto__' })).toBeNull();
    expect(parseNetMsg({ t: 'ammo', id: 'a', slot: 3 })).toBeNull();
    expect(parseNetMsg({ t: 'dropreq', id: 'a', w: 'constructor' })).toBeNull();
    expect(parseNetMsg({ t: 'fall', id: 'a', v: NaN })).toBeNull();
    expect(parseNetMsg({ t: 'fall', id: 'a', v: 20 })).toEqual({ t: 'fall', id: 'a', v: 20 });
    expect(parseNetMsg({ t: 'chat', id: 'a', name: 'x', text: '', team: 'T' })).toBeNull();
    expect(parseNetMsg({ t: 'chat', id: 'a', name: 'x', text: 'hi', team: 'toString', teamOnly: 'ja' })).toEqual({ t: 'chat', id: 'a', name: 'x', text: 'hi', team: null, teamOnly: false });
    expect(parseNetMsg({ t: 'ping', n: 1.5, h: 'a' })).toBeNull();
    expect(parseNetMsg({ t: 'pong', id: 'a', n: 4 })).toEqual({ t: 'pong', id: 'a', n: 4 });
    expect(parseNetMsg({ t: 'unknown' })).toBeNull();
    expect(parseNetMsg(null)).toBeNull();
    expect(parseNetMsg('x')).toBeNull();
  });

  it('Sammel-Posen: ungültige Einträge fallen weg, zu lange Listen komplett', () => {
    const good = poseMsg('bot-1', { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, 'ak47', false, true, false);
    const m = parseNetMsg({ t: 'poses', h: 'host', p: [good, { ...good, x: NaN }, { ...good, id: '__proto__' }] })!;
    expect(m).toEqual({ t: 'poses', h: 'host', p: [good] });
    expect(parseNetMsg({ t: 'poses', h: 'host', p: Array.from({ length: NET_LIMITS.poses + 1 }, () => good) })).toBeNull();
    expect(parseNetMsg({ t: 'poses', h: '<x>', p: [] })).toBeNull();
  });

  it('Snapshot-/Ereignis-Hüllen: Host-Kennung muss eine gültige ID sein', () => {
    expect(parseNetMsg({ t: 'snap', s: realSnap(), h: 'h1' })).toMatchObject({ t: 'snap', h: 'h1' });
    expect(parseNetMsg({ t: 'snap', s: realSnap(), h: 5 })).toBeNull();
    expect(parseNetMsg({ t: 'snap', s: { seq: 1 }, h: 'h1' })).toBeNull();
    expect(parseNetMsg({ t: 'ev', e: { k: 'match', winner: 'T' }, h: '__proto__' })).toBeNull();
  });
});

describe('senderAllowed', () => {
  const ev: NetMsg = { t: 'ev', e: { k: 'match', winner: 'T' }, h: 'host' };
  it('Host-Nachrichten nur mit h = aktueller Host (und passendem Relay-Absender)', () => {
    expect(senderAllowed(ev, null, 'host')).toBe(true);
    expect(senderAllowed({ ...ev, h: 'other' }, null, 'host')).toBe(false);
    expect(senderAllowed({ t: 'ev', e: { k: 'match', winner: 'T' } }, null, 'host')).toBe(false);
    expect(senderAllowed(ev, 'host', 'host')).toBe(true);
    expect(senderAllowed(ev, 'mallory', 'host')).toBe(false);
    expect(senderAllowed(ev, null, '')).toBe(false);
    expect(senderAllowed({ t: 'poses', p: [], h: 'host' }, 'mallory', 'host')).toBe(false);
  });

  it('Client-Nachrichten: Relay-Absender muss die behauptete ID sein (Host darf für Bots chatten)', () => {
    const fall: NetMsg = { t: 'fall', id: 'victim', v: 30 };
    expect(senderAllowed(fall, null, 'host')).toBe(true);
    expect(senderAllowed(fall, 'victim', 'host')).toBe(true);
    expect(senderAllowed(fall, 'mallory', 'host')).toBe(false);
    const chat: NetMsg = { t: 'chat', id: 'bot-2', name: 'Bot', text: '[Funk] Los', team: 'T', teamOnly: true };
    expect(senderAllowed(chat, 'host', 'host')).toBe(true);
    expect(senderAllowed(chat, 'mallory', 'host')).toBe(false);
  });

  it('Client-Nachrichten im Namen von Bots oder des Hosts werden immer verworfen (deren Eingaben prüft niemand)', () => {
    const fire: NetMsg = { t: 'fire', id: 'bot-0', w: 'awp', o: [0, 0, 0], d: [[0, 0, 1]], seq: 0 };
    expect(senderAllowed(fire, null, 'host')).toBe(false);
    expect(senderAllowed({ t: 'fall', id: 'host', v: 40 }, null, 'host')).toBe(false);
    expect(senderAllowed({ t: 'throw', id: 'host', kind: 'he', o: [0, 0, 0], d: [0, 0, 1], s: 1 }, null, 'host')).toBe(false);
    expect(senderAllowed({ t: 'hello', id: 'bot-9', name: 'x', team: 'T' }, null, 'host')).toBe(false);
    // Chat des Hosts selbst ist normal
    expect(senderAllowed({ t: 'chat', id: 'host', name: 'H', text: 'hi', team: null }, null, 'host')).toBe(true);
    expect(senderAllowed({ t: 'chat', id: 'host', name: 'H', text: 'hi', team: null }, 'host', 'host')).toBe(true);
  });
});

describe('SnapSeqGate', () => {
  it('nur neuere Sequenzen im Fenster', () => {
    const g = new SnapSeqGate();
    expect(g.accept(5, 0)).toBe(true);
    expect(g.accept(5, 0.1)).toBe(false);
    expect(g.accept(4, 0.1)).toBe(false);
    expect(g.accept(6, 0.2)).toBe(true);
    expect(g.accept(6 + SNAP_SEQ.maxJump + 1, 0.3)).toBe(false);
    expect(g.accept(NaN, 0.3)).toBe(false);
    expect(g.accept(-1, 0.3)).toBe(false);
  });

  it('gefälschter Riesenwert friert nicht ein: nach einer Sekunde ohne Gültiges wird neu synchronisiert', () => {
    const g = new SnapSeqGate();
    expect(g.accept(1e15, 0)).toBe(true); // erster Snapshot nach Host-Wechsel: gilt
    // echter Host sendet weiter kleine Werte → erst abgelehnt …
    expect(g.accept(10, 0.1)).toBe(false);
    expect(g.accept(11, 0.5)).toBe(false);
    // … nach > 1 s ohne akzeptierten Snapshot wieder synchron
    expect(g.accept(12, 1.2)).toBe(true);
    expect(g.accept(13, 1.3)).toBe(true);
    // Fälschung mitten im Strom wird abgelehnt
    expect(g.accept(1e15, 1.35)).toBe(false);
    expect(g.accept(14, 1.4)).toBe(true);
  });

  it('reset beim Host-Wechsel', () => {
    const g = new SnapSeqGate();
    g.accept(100, 0);
    g.reset();
    expect(g.last).toBe(-1);
    expect(g.accept(1, 0.1)).toBe(true);
  });
});
