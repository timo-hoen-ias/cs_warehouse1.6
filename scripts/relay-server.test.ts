import { describe, expect, it } from 'vitest';
import { RESERVED_KEYS, sortClientMessages } from './relay-server';

describe('Relay: Client-Nachrichten', () => {
  it('Steuerbefehle getrennt, Spielnachrichten mit gestempeltem Absender weiter', () => {
    const r = sortClientMessages([
      { key: 'join-room', data: { room: 'csw16-X' } },
      { key: 'ping', data: { time: 1 } },
      { key: 'csw16', data: { t: 'pose', id: 'me' } },
    ], 'conn-1');
    expect(r.control.map((m) => m.key)).toEqual(['join-room', 'ping']);
    expect(r.broadcast).toEqual([{ key: 'csw16', data: { t: 'pose', id: 'me', from: 'conn-1' } }]);
  });

  it('gefälschtes `from` des Clients wird überschrieben', () => {
    const r = sortClientMessages({ key: 'csw16', data: { t: 'fall', id: 'victim', v: 40, from: 'victim' } }, 'mallory');
    expect(r.broadcast[0]!.data).toMatchObject({ id: 'victim', from: 'mallory' });
  });

  it('reservierte Server-Schlüssel von Clients werden verworfen (kein gefälschtes „Host verlassen“)', () => {
    for (const key of ['user-left-room', 'connection-start-info', 'joined-room', 'user-joined-room', 'left-room', 'pong']) {
      expect(RESERVED_KEYS.has(key)).toBe(true);
      expect(sortClientMessages({ key, data: { userId: 'host' } }, 'mallory').broadcast).toEqual([]);
    }
    expect(sortClientMessages({ key: 'delete-all-state' }, 'x')).toEqual({ control: [], broadcast: [] });
  });

  it('Müll und Riesenlisten werden begrenzt', () => {
    expect(sortClientMessages(null, 'x')).toEqual({ control: [], broadcast: [] });
    expect(sortClientMessages('x', 'x')).toEqual({ control: [], broadcast: [] });
    expect(sortClientMessages({ key: 5 }, 'x').broadcast).toEqual([]);
    expect(sortClientMessages({ key: 'k'.repeat(65), data: {} }, 'x').broadcast).toEqual([]);
    const many = Array.from({ length: 1000 }, () => ({ key: 'csw16', data: { t: 'pose' } }));
    expect(sortClientMessages(many, 'x').broadcast.length).toBe(256);
    // Nicht-Objekt-Daten bleiben unverändert (kein Stempel möglich)
    expect(sortClientMessages({ key: 'csw16', data: 'text' }, 'x').broadcast[0]!.data).toBe('text');
  });
});
