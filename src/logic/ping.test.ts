import { describe, expect, it } from 'vitest';
import { applyPings, median, PING_EXPIRE_MS, PING_INTERVAL_MS, PING_MAX_MS, PING_UNKNOWN, PING_WINDOW, PingTracker } from './ping';

describe('median', () => {
  it('ungerade und gerade Anzahl, unsortiert', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 40, 20, 30])).toBe(25);
    expect(median([7])).toBe(7);
  });
});

describe('PingTracker', () => {
  it('sendet beim ersten Aufruf sofort, dann erst nach dem Intervall; Nummern steigen', () => {
    const t = new PingTracker();
    expect(t.due(1000)).toBe(1);
    expect(t.due(1000 + PING_INTERVAL_MS - 1)).toBeNull();
    expect(t.due(1000 + PING_INTERVAL_MS)).toBe(2);
  });

  it('misst die Rundlaufzeit mit der Host-Uhr', () => {
    const t = new PingTracker();
    const n = t.due(5000)!;
    expect(t.pong('a', n, 5042)).toBe(42);
    expect(t.get('a', 5042)).toBe(42);
  });

  it('unbekannt, solange nichts gemessen wurde', () => {
    const t = new PingTracker();
    t.due(0);
    expect(t.get('a', 10)).toBe(PING_UNKNOWN);
  });

  it('verwirft erfundene, doppelte, alte und ungültige Antworten', () => {
    const t = new PingTracker();
    const n1 = t.due(0)!;
    expect(t.pong('a', 99, 10)).toBeNull(); // nie gesendet
    expect(t.pong('a', '1', 10)).toBeNull();
    expect(t.pong('a', 1.5, 10)).toBeNull();
    expect(t.pong('a', n1, 20)).toBe(20);
    expect(t.pong('a', n1, 30)).toBeNull(); // doppelt
    const n2 = t.due(PING_INTERVAL_MS)!;
    expect(t.pong('a', n2, PING_INTERVAL_MS + 50)).toBe(50);
    expect(t.pong('a', n1, PING_INTERVAL_MS + 60)).toBeNull(); // älter als die letzte akzeptierte
    // anderer Spieler darf dieselbe Nummer einmal nutzen
    expect(t.pong('b', n2, PING_INTERVAL_MS + 80)).toBe(80);
  });

  it('verwirft unplausibel lange Laufzeiten', () => {
    const t = new PingTracker();
    const n = t.due(0)!;
    expect(t.pong('a', n, PING_MAX_MS + 1)).toBeNull();
    expect(t.get('a', PING_MAX_MS + 1)).toBe(PING_UNKNOWN);
  });

  it('glättet per Median über die letzten Messungen (Ausreißer stört nicht)', () => {
    const t = new PingTracker();
    let now = 0;
    for (const rtt of [40, 42, 400, 38, 41]) {
      const n = t.due(now)!;
      t.pong('a', n, now + rtt);
      now += PING_INTERVAL_MS;
    }
    expect(t.get('a', now)).toBe(41);
  });

  it('behält nur das Fenster der letzten Messungen', () => {
    const t = new PingTracker();
    let now = 0;
    for (let i = 0; i < PING_WINDOW + 3; i++) {
      const n = t.due(now)!;
      t.pong('a', n, now + (i < 3 ? 500 : 20));
      now += PING_INTERVAL_MS;
    }
    expect(t.get('a', now)).toBe(20);
  });

  it('wird wieder unbekannt, wenn lange keine Antwort kam; forget löscht', () => {
    const t = new PingTracker();
    const n = t.due(0)!;
    t.pong('a', n, 30);
    expect(t.get('a', 30 + PING_EXPIRE_MS)).toBe(30);
    expect(t.get('a', 30 + PING_EXPIRE_MS + 1)).toBe(PING_UNKNOWN);
    t.pong('b', n, 40);
    t.forget('b');
    expect(t.get('b', 40)).toBe(PING_UNKNOWN);
  });
});

describe('applyPings', () => {
  it('Bots und Host = 0, Clients gemessen, ungemessene = unbekannt', () => {
    const t = new PingTracker();
    const n = t.due(0)!;
    t.pong('c1', n, 55);
    const players = [
      { id: 'h', bot: false, ping: 7 },
      { id: 'bot-1', bot: true, ping: 9 },
      { id: 'c1', bot: false, ping: 0 },
      { id: 'c2', bot: false, ping: 0 },
    ];
    applyPings(players, 'h', t, 100);
    expect(players.map((p) => p.ping)).toEqual([0, 0, 55, PING_UNKNOWN]);
  });
});
