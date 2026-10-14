import { describe, expect, it } from 'vitest';
import { buyItem } from './loadout';
import { addPlayer, beginRound, newMatch } from './match';
import { applySnapshot, electHost, lerpPose, packSnapshot, poseMsg, roomCode, sanitizeName } from './net';

describe('electHost', () => {
  it('wer am längsten im Raum ist (erste ID in Beitrittsreihenfolge) wird Host; leer → null', () => {
    expect(electHost(['zeta', 'alpha', 'mid'])).toBe('zeta');
    // Neuzugang mit „kleinerer“ ID übernimmt nicht
    expect(electHost(['m', 'n', 'a'])).toBe('m');
    // Host verlässt den Raum → nächster in der Reihenfolge
    expect(electHost(['n', 'a'])).toBe('n');
    expect(electHost([])).toBeNull();
  });
});

describe('Snapshot pack/apply', () => {
  it('Roundtrip überträgt Runde, Spieler, Inventar-Anzeige und entfernt verschwundene Spieler', () => {
    const host = newMatch();
    addPlayer(host, 'a', 'Anna', { team: 'T' });
    addPlayer(host, 'b', 'Bert', { team: 'CT', bot: true });
    host.round.round = 1;
    beginRound(host, (team, i) => ({ x: i, y: 0, z: team === 'T' ? -10 : 10, yaw: 0, pitch: 0 }), () => 0);
    const a = host.players['a']!;
    a.money.amount = 5000;
    buyItem(a.loadout, a.money, 'ak47', 'T');
    buyItem(a.loadout, a.money, 'kevlar', 'T');
    buyItem(a.loadout, a.money, 'flashbang', 'T');
    a.kills = 3;
    host.round.tRounds = 2;
    host.lossStreak.CT = 1;

    const snap = packSnapshot(host, 7, { nades: [], smokes: [{ pos: { x: 1, y: 0, z: 2 }, radius: 3, timeLeft: 5 }], bombPos: null });
    expect(snap.seq).toBe(7);
    expect(snap.players).toHaveLength(2);
    expect(snap.smokes[0]).toEqual({ p: [1, 0, 2], r: 3, t: 5 });

    const client = newMatch();
    addPlayer(client, 'ghost', 'Alt', { team: 'CT' });
    applySnapshot(client, snap);
    expect(Object.keys(client.players).sort()).toEqual(['a', 'b']);
    const ca = client.players['a']!;
    expect(ca.name).toBe('Anna');
    expect(ca.kills).toBe(3);
    expect(ca.money.amount).toBe(a.money.amount);
    expect(ca.loadout.primary).toBe('ak47');
    expect(ca.loadout.armor).toBe(100);
    expect(ca.loadout.grenades.flash).toBe(1);
    expect(ca.loadout.bomb).toBe(a.loadout.bomb);
    expect(ca.loadout.guns['ak47']).toBeDefined();
    expect(client.round.tRounds).toBe(2);
    expect(client.lossStreak.CT).toBe(1);
    expect(client.players['b']!.bot).toBe(true);

    // Waffe wechselt → Munitionszustand wird ersetzt
    a.loadout.primary = 'awp';
    applySnapshot(client, packSnapshot(host, 8, { nades: [], smokes: [], bombPos: [1, 2, 3] }));
    expect(client.players['a']!.loadout.primary).toBe('awp');
    expect(client.players['a']!.loadout.guns['ak47']).toBeUndefined();
  });

  it('Snapshot ist eine Kopie (Mutation des Hosts ändert den Snapshot nicht)', () => {
    const host = newMatch();
    const snap = packSnapshot(host, 1, { nades: [], smokes: [], bombPos: null });
    host.round.timer = 1;
    expect(snap.round.timer).not.toBe(1);
  });
});

describe('lerpPose / poseMsg', () => {
  it('interpoliert Position und nimmt beim Yaw den kürzesten Weg', () => {
    const a = { x: 0, y: 0, z: 0, yaw: 3.0, pitch: 0 };
    const b = { x: 10, y: 0, z: 0, yaw: -3.0, pitch: 1 };
    const m = lerpPose(a, b, 0.5);
    expect(m.x).toBe(5);
    expect(Math.abs(m.yaw)).toBeCloseTo(Math.PI, 5);
    expect(m.pitch).toBe(0.5);
    expect(lerpPose(a, b, 2).x).toBe(10);
  });

  it('poseMsg rundet auf mm', () => {
    const msg = poseMsg('p', { x: 1.23456, y: 1.65, z: -2.00049, yaw: 0.1, pitch: 0 }, 'ak47', true, false, false);
    expect(msg).toMatchObject({ t: 'pose', id: 'p', x: 1.235, z: -2, w: 'ak47', c: true });
  });
});

describe('roomCode / sanitizeName', () => {
  it('Raumcode: 5 Zeichen ohne verwechselbare Buchstaben, deterministisch bei festem rnd', () => {
    const code = roomCode(() => 0.5);
    expect(code).toHaveLength(5);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    expect(roomCode(() => 0.5)).toBe(code);
  });

  it('Namen werden bereinigt und gekürzt', () => {
    expect(sanitizeName('<b>Timo</b>')).toBe('bTimo/b');
    expect(sanitizeName('   ')).toBe('Spieler');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
  });
});
