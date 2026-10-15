/**
 * Minimaler Relay-Server (Bun) mit dem Needle-Engine-Raum-Protokoll — für
 * LAN-Spiele ohne Internet und für den lokalen Zwei-Client-Test.
 *   bun scripts/relay-server.ts [port]        (Standard 9100)
 * Client: Lobby-Feld „Server“ oder URL ?server=ws://<host>:9100/socket
 *
 * Protokoll (Untermenge des Needle-Backends):
 *   → {key:'join-room', data:{room, viewOnly}}  ← {key:'joined-room', room, viewId, allowEditing, inRoom:[…]} an den Joiner,
 *                                                  {key:'user-joined-room', data:{userId}} an die anderen
 *   → {key:'leave-room', data:{room}}           ← {key:'left-room', room} / {key:'user-left-room', data:{userId}}
 *   → {key:'ping', data}                        ← {key:'pong', data}
 *   → beliebige {key, data} (oder Array davon)  → Broadcast an alle anderen im Raum, `data.from` = Absender-ID
 *   Reservierte Server-Schlüssel (user-left-room, connection-start-info, …) von Clients werden verworfen.
 * Beim Verbinden: {key:'connection-start-info', data:{id, stamp:true}}.
 */
type Client = { id: string; room: string | null };
type Msg = { key: string; data?: unknown; room?: string };

const port = Number(process.argv[2] ?? process.env.PORT ?? 9100);
const rooms = new Map<string, Set<import('bun').ServerWebSocket<Client>>>();

function membersOf(room: string): Set<import('bun').ServerWebSocket<Client>> {
  let set = rooms.get(room);
  if (!set) {
    set = new Set();
    rooms.set(room, set);
  }
  return set;
}

function leave(ws: import('bun').ServerWebSocket<Client>): void {
  const room = ws.data.room;
  if (!room) return;
  const set = rooms.get(room);
  set?.delete(ws);
  ws.data.room = null;
  if (set && set.size === 0) rooms.delete(room);
  const note = JSON.stringify({ key: 'user-left-room', data: { userId: ws.data.id } });
  for (const other of set ?? []) other.send(note);
  log(`${ws.data.id} verlässt ${room} (${set?.size ?? 0} übrig)`);
}

function log(s: string): void {
  console.log(`[relay] ${new Date().toISOString().slice(11, 19)} ${s}`);
}

/**
 * Schlüssel des Raum-Protokolls, die nur der Server senden darf. Kämen sie von einem
 * Client, könnte er z. B. „user-left-room“ für den Host fälschen (alle wählen einen neuen
 * Host → zwei Hosts) oder per „connection-start-info“ fremde Verbindungs-IDs setzen.
 */
export const RESERVED_KEYS = new Set([
  'connection-start-info', 'joined-room', 'left-room', 'user-joined-room', 'user-left-room', 'room-state-sent',
  'all-room-state-deleted', 'pong', 'response-has-owner', 'response-is-owner', 'gained-ownership', 'lost-ownership',
  'gained-ownership-broadcast', 'lost-ownership-broadcast', 'remove-ownership',
]);

/**
 * Eingehende Client-Nachrichten sortieren (pure): Steuerbefehle (join/leave/ping) getrennt,
 * reservierte Server-Schlüssel verworfen, alles andere zum Weiterleiten — mit
 * `data.from` = Verbindungs-ID des Absenders (vom Server gesetzt, Client-Werte überschrieben),
 * damit Empfänger behauptete Spieler-IDs prüfen können.
 */
export function sortClientMessages(parsed: unknown, senderId: string): { control: Msg[]; broadcast: Msg[] } {
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const control: Msg[] = [];
  const broadcast: Msg[] = [];
  for (const m of list.slice(0, 256) as Msg[]) {
    if (!m || typeof m !== 'object' || typeof m.key !== 'string' || m.key.length > 64) continue;
    switch (m.key) {
      case 'join-room':
      case 'leave-room':
      case 'ping':
        control.push(m);
        break;
      case 'delete-state':
      case 'delete-all-state':
        break;
      default: {
        if (RESERVED_KEYS.has(m.key)) break;
        const d = m.data;
        const data = d && typeof d === 'object' && !Array.isArray(d) ? { ...(d as Record<string, unknown>), from: senderId } : d;
        broadcast.push({ key: m.key, data });
      }
    }
  }
  return { control, broadcast };
}

export function handleMessage(ws: import('bun').ServerWebSocket<Client>, raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const { control, broadcast } = sortClientMessages(parsed, ws.data.id);
  for (const m of control) {
    switch (m.key) {
      case 'join-room': {
        const room = String((m.data as { room?: string })?.room ?? '').slice(0, 128);
        if (!room) break;
        if (ws.data.room && ws.data.room !== room) leave(ws);
        const set = membersOf(room);
        set.add(ws);
        ws.data.room = room;
        const inRoom = [...set].map((c) => c.data.id);
        ws.send(JSON.stringify({ key: 'joined-room', room, viewId: room, allowEditing: true, inRoom }));
        const note = JSON.stringify({ key: 'user-joined-room', data: { userId: ws.data.id } });
        for (const other of set) if (other !== ws) other.send(note);
        log(`${ws.data.id} betritt ${room} (${set.size} drin)`);
        break;
      }
      case 'leave-room':
        leave(ws);
        ws.send(JSON.stringify({ key: 'left-room', room: String((m.data as { room?: string })?.room ?? '') }));
        break;
      case 'ping':
        ws.send(JSON.stringify({ key: 'pong', data: m.data }));
        break;
    }
  }
  if (broadcast.length && ws.data.room) {
    const payload = JSON.stringify(broadcast.length === 1 ? broadcast[0] : broadcast);
    for (const other of rooms.get(ws.data.room) ?? []) if (other !== ws) other.send(payload);
  }
}

if (import.meta.main) {
  Bun.serve<Client>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === '/socket' || url.pathname === '/') {
        const id = crypto.randomUUID();
        if (server.upgrade(req, { data: { id, room: null } })) return undefined;
        return new Response('WebSocket erwartet', { status: 400 });
      }
      if (url.pathname === '/status') {
        return Response.json({ rooms: [...rooms.entries()].map(([name, set]) => ({ name, users: set.size })) });
      }
      return new Response('cs_warehouse1.6 relay', { status: 200 });
    },
    websocket: {
      open(ws) {
        // `stamp`: dieser Server setzt `data.from` bei weitergeleiteten Nachrichten (Transport prüft damit IDs)
        ws.send(JSON.stringify({ key: 'connection-start-info', data: { id: ws.data.id, stamp: true } }));
        log(`${ws.data.id} verbunden`);
      },
      message(ws, message) {
        if (typeof message === 'string') handleMessage(ws, message);
      },
      close(ws) {
        leave(ws);
      },
    },
  });
  log(`Relay läuft auf ws://0.0.0.0:${port}/socket  (Status: http://localhost:${port}/status)`);
}
