import {
  DISCOVERY_ROOM, HEARTBEAT_INTERVAL_MS, HEARTBEAT_KEY, QUERY_KEY, SERVER_TTL_MS, expireServers, mergeServer, sanitizeHeartbeat,
  type Heartbeat, type ServerList,
} from '../logic/serverList';

/**
 * Server-Erkennung über eine zweite, schlanke WebSocket-Verbindung zum selben
 * Netzwerk-Backend wie das Spiel (Needle-Server oder eigenes Relay). Needle
 * `context.connection` kann nur einen Raum gleichzeitig — der Spielraum bleibt dort,
 * die Erkennung läuft im gemeinsamen Raum `csw16-lobby` über dieses Protokoll:
 *   → {key:'join-room', data:{room, viewOnly:false}}
 *   → {key:'csw16-hb', data: Heartbeat}         (Host, alle 3 s und als Antwort)
 *   → {key:'csw16-q',  data:{from, t}}          (Browser: „bitte melden“, t = eigene Uhr fürs Ping)
 * Der Server verteilt jede Nachricht an alle anderen im Raum — funktioniert daher
 * mit jedem Backend, das das Needle-Raumprotokoll spricht (auch scripts/relay-server.ts).
 */

/** Standard-Backend der Needle Engine (wie `context.connection` ohne eigenen Server). */
export const NEEDLE_DEFAULT_SOCKET = 'wss://networking-2.needle.tools/socket';

export function discoveryUrl(server: string): string {
  return server || NEEDLE_DEFAULT_SOCKET;
}

type Msg = { key?: string; data?: unknown };

/** Robuste WebSocket-Verbindung mit Raum-Beitritt und Wiederverbindung. */
class DiscoverySocket {
  onMessage?: (key: string, data: unknown) => void;
  onOpen?: () => void;
  id: string | null = null;
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 1000;
  private ping = 0;
  private retryTimer = 0;

  constructor(private readonly url: string) {}

  connect(): void {
    if (this.closed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.schedule();
      return;
    }
    this.ws.onopen = () => {
      this.retry = 1000;
      this.raw({ key: 'join-room', data: { room: DISCOVERY_ROOM, viewOnly: false } });
      clearInterval(this.ping);
      this.ping = window.setInterval(() => this.raw({ key: 'ping', data: { time: Date.now() } }), 15000);
    };
    this.ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let parsed: Msg | Msg[];
      try { parsed = JSON.parse(ev.data) as Msg | Msg[]; } catch { return; }
      for (const m of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!m || typeof m.key !== 'string') continue;
        if (m.key === 'connection-start-info') this.id = (m.data as { id?: string })?.id ?? null;
        else if (m.key === 'joined-room') this.onOpen?.();
        else this.onMessage?.(m.key, m.data);
      }
    };
    this.ws.onclose = () => {
      clearInterval(this.ping);
      this.schedule();
    };
    this.ws.onerror = () => { /* onclose folgt */ };
  }

  get ready(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Verbindungszustand für die Anzeige (erste Verbindung läuft noch → 'connecting'). */
  get state(): 'connecting' | 'open' | 'closed' {
    const r = this.ws?.readyState;
    if (r === WebSocket.OPEN) return 'open';
    return this.retry <= 2000 && r !== WebSocket.CLOSED ? 'connecting' : 'closed';
  }

  send(key: string, data: unknown): void {
    this.raw({ key, data });
  }

  private raw(m: Msg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private schedule(): void {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), this.retry);
    this.retry = Math.min(15000, this.retry * 2);
  }

  close(): void {
    this.closed = true;
    clearInterval(this.ping);
    clearTimeout(this.retryTimer);
    try { this.ws?.close(); } catch { /* egal */ }
    this.ws = null;
  }
}

/** Serverbrowser-Seite: sammelt Heartbeats, fragt aktiv nach, misst Latenz. */
export class ServerBrowserClient {
  onChange?: (list: ServerList) => void;
  onStatus?: (state: 'connecting' | 'open' | 'closed') => void;
  list: ServerList = {};
  private sock: DiscoverySocket | null = null;
  private timer = 0;
  private url = '';

  start(server: string): void {
    const url = discoveryUrl(server);
    if (this.sock && url === this.url) return;
    this.stop();
    this.url = url;
    this.list = {};
    const s = new DiscoverySocket(url);
    s.onOpen = () => { this.onStatus?.('open'); this.refresh(); };
    s.onMessage = (key, data) => {
      if (key !== HEARTBEAT_KEY) return;
      const hb = sanitizeHeartbeat(data);
      if (!hb) return;
      this.list = mergeServer(this.list, hb, Date.now(), s.id);
      this.onChange?.(this.list);
    };
    s.connect();
    this.sock = s;
    this.timer = window.setInterval(() => {
      const next = expireServers(this.list, Date.now(), SERVER_TTL_MS);
      if (next !== this.list) { this.list = next; this.onChange?.(this.list); }
      this.onStatus?.(s.state);
    }, 1000);
  }

  /** Alle Hosts um sofortige Meldung bitten (mit Zeitstempel fürs Ping). */
  refresh(): void {
    if (!this.sock?.ready) return;
    this.sock.send(QUERY_KEY, { from: this.sock.id ?? '', t: Date.now() });
  }

  stop(): void {
    clearInterval(this.timer);
    this.sock?.close();
    this.sock = null;
  }
}

/**
 * Host-Seite: meldet den laufenden Server alle 3 s und beantwortet Anfragen (mit Echo
 * fürs Ping). `info()` liefert null, solange dieser Client nicht Host ist oder der
 * Server nicht gelistet werden soll — dann wird nichts gesendet.
 */
export class ServerAnnouncer {
  private sock: DiscoverySocket | null = null;
  private timer = 0;
  private lastAnswer = 0;

  constructor(private readonly server: string, private readonly info: () => Heartbeat | null) {}

  /** Discovery-Verbindung offen (nur auf dem Host)? */
  get active(): boolean {
    return !!this.sock;
  }

  start(): void {
    if (this.sock) return;
    const s = new DiscoverySocket(discoveryUrl(this.server));
    s.onOpen = () => this.beat();
    s.onMessage = (key, data) => {
      if (key !== QUERY_KEY) return;
      const now = Date.now();
      if (now - this.lastAnswer < 150) return; // Anfragen-Flut drosseln
      this.lastAnswer = now;
      const q = data as { from?: unknown; t?: unknown } | null;
      const echo = q && typeof q.from === 'string' && typeof q.t === 'number' ? { to: q.from.slice(0, 64), t: q.t } : undefined;
      this.beat(echo);
    };
    s.connect();
    this.sock = s;
    this.timer = window.setInterval(() => this.beat(), HEARTBEAT_INTERVAL_MS);
  }

  private beat(echo?: { to: string; t: number }): void {
    const hb = this.info();
    if (!hb || !this.sock?.ready) return;
    this.sock.send(HEARTBEAT_KEY, echo ? { ...hb, echo } : hb);
  }

  stop(): void {
    if (!this.sock) return;
    clearInterval(this.timer);
    this.sock.close();
    this.sock = null;
  }
}
