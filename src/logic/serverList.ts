/**
 * Server-Erkennung (framework-frei). Jeder Host sendet alle ~3 s einen Heartbeat in
 * einen gemeinsamen Discovery-Raum (`csw16-lobby`) desselben Netzwerk-Backends
 * (Needle oder eigenes Relay); Browser im Serverbrowser sammeln die Einträge mit
 * Ablaufzeit. Alle Felder kommen von fremden Clients → strikt bereinigen (XSS,
 * Typen, Grenzen) und nie ungeprüft ins DOM.
 */

/** Gemeinsamer Raum aller Heartbeats (eigene WebSocket-Verbindung, nicht der Spielraum). */
export const DISCOVERY_ROOM = 'csw16-lobby';
/** Nachrichten-Key: Heartbeat eines Hosts. */
export const HEARTBEAT_KEY = 'csw16-hb';
/** Nachrichten-Key: Anfrage eines Browsers („alle Hosts bitte sofort melden“, mit Zeitstempel fürs Ping). */
export const QUERY_KEY = 'csw16-q';
/** Spiel-/Protokollversion: Server mit anderer Version sind nicht beitretbar. */
export const GAME_VERSION = '1.6.5';
export const HEARTBEAT_INTERVAL_MS = 3000;
/** Eintrag verfällt ohne Heartbeat nach dieser Zeit. */
export const SERVER_TTL_MS = 10000;
export const MAX_SERVERS = 200;

export type ServerPhase = 'lobby' | 'warmup' | 'freeze' | 'live' | 'bomb' | 'roundEnd' | 'ended';
const PHASES: readonly ServerPhase[] = ['lobby', 'warmup', 'freeze', 'live', 'bomb', 'roundEnd', 'ended'];

export type Heartbeat = {
  /** Raumcode (ohne Präfix), z. B. 'K7Q2M'. */
  room: string;
  name: string;
  map: string;
  /** Menschliche Spieler. */
  players: number;
  maxPlayers: number;
  bots: number;
  phase: ServerPhase;
  round: number;
  score: [number, number];
  hasPassword: boolean;
  version: string;
  region?: string;
  /** Antwort auf eine Anfrage: Absender-ID + dessen Zeitstempel (für die Latenz). */
  echo?: { to: string; t: number };
};

export type ServerEntry = Heartbeat & {
  firstSeen: number;
  lastSeen: number;
  /** Gemessene Rundlaufzeit in ms (über den Discovery-Server), null = unbekannt. */
  latency: number | null;
  compatible: boolean;
};

export type ServerList = Record<string, ServerEntry>;

/** Entfernt Steuerzeichen und HTML-relevante Zeichen, kürzt; leer → Fallback. */
export function cleanText(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\t\n\r]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return s.length ? s : fallback;
}

function int(v: unknown, min: number, max: number, def: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Gültiger Raumcode (wie `roomCode()` bzw. manuell eingegeben). */
export function validRoomCode(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Z0-9]{3,12}$/.test(v);
}

/** Normalisiert Nutzereingaben eines Raumcodes (Großbuchstaben, nur A–Z/0–9). */
export function normalizeRoomCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/** Prüft und bereinigt einen empfangenen Heartbeat. Ungültig → null. */
export function sanitizeHeartbeat(raw: unknown): Heartbeat | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!validRoomCode(r.room)) return null;
  const map = typeof r.map === 'string' && /^[a-z0-9_]{1,32}$/.test(r.map) ? r.map : null;
  if (!map) return null;
  const maxPlayers = int(r.maxPlayers, 1, 32, 10);
  const score = Array.isArray(r.score) ? r.score : [];
  const hb: Heartbeat = {
    room: r.room,
    name: cleanText(r.name, 32, `Server ${r.room}`),
    map,
    players: int(r.players, 0, maxPlayers, 0),
    maxPlayers,
    bots: int(r.bots, 0, 32, 0),
    phase: PHASES.find((p) => p === r.phase) ?? 'live',
    round: int(r.round, 0, 99, 0),
    score: [int(score[0], 0, 99, 0), int(score[1], 0, 99, 0)],
    hasPassword: r.hasPassword === true,
    version: cleanText(r.version, 16, '?'),
  };
  const region = cleanText(r.region, 24);
  if (region) hb.region = region;
  const echo = r.echo as Record<string, unknown> | undefined;
  if (echo && typeof echo === 'object' && typeof echo.to === 'string' && typeof echo.t === 'number' && Number.isFinite(echo.t)) {
    hb.echo = { to: echo.to.slice(0, 64), t: echo.t };
  }
  return hb;
}

/**
 * Solange ein Eintrag frisch ist (letzter Heartbeat jünger als das), ändern weitere
 * Heartbeats für denselben Raum Karte und Passwort-Kennzeichen nicht: ein fremder
 * Client könnte sonst einen fremden Server mit falscher Karte/ohne Schloss anzeigen.
 * Erst wenn der bisherige Melder verstummt (Host-Wechsel), gilt der neue Stand.
 */
export const SERVER_LOCK_MS = HEARTBEAT_INTERVAL_MS * 2;

/**
 * Übernimmt einen (bereinigten) Heartbeat in die Liste (neues Objekt). Latenz nur aus
 * einer an uns adressierten Antwort; sonst bleibt der alte Messwert. Volle Liste: der
 * am längsten stille Eintrag weicht (Flut neuer Räume verdrängt keine aktiven Server dauerhaft).
 */
export function mergeServer(list: ServerList, hb: Heartbeat, now: number, selfId: string | null, version = GAME_VERSION): ServerList {
  const prev = Object.hasOwn(list, hb.room) ? list[hb.room] : undefined;
  let base = list;
  if (!prev && Object.keys(list).length >= MAX_SERVERS) {
    let oldest: string | null = null;
    for (const [room, e] of Object.entries(list)) if (oldest === null || e.lastSeen < list[oldest]!.lastSeen) oldest = room;
    base = { ...list };
    if (oldest !== null) delete base[oldest];
  }
  let latency = prev?.latency ?? null;
  if (hb.echo && selfId && hb.echo.to === selfId) {
    const rtt = now - hb.echo.t;
    if (rtt >= 0 && rtt < 30000) latency = Math.round(prev?.latency != null ? prev.latency * 0.5 + rtt * 0.5 : rtt);
  }
  const { echo: _echo, ...rest } = hb;
  void _echo;
  const locked = !!prev && now - prev.lastSeen <= SERVER_LOCK_MS;
  return {
    ...base,
    [hb.room]: {
      ...rest,
      map: locked ? prev!.map : rest.map,
      hasPassword: locked ? prev!.hasPassword : rest.hasPassword,
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
      latency,
      compatible: hb.version === version,
    },
  };
}

/** Entfernt Einträge ohne Heartbeat seit `ttl` ms. Gibt dieselbe Liste zurück, wenn nichts verfiel. */
export function expireServers(list: ServerList, now: number, ttl = SERVER_TTL_MS): ServerList {
  const keep = Object.entries(list).filter(([, e]) => now - e.lastSeen <= ttl);
  if (keep.length === Object.keys(list).length) return list;
  return Object.fromEntries(keep);
}

export type ServerFilter = {
  notFull?: boolean;
  notEmpty?: boolean;
  /** Nur kompatible Version. */
  sameVersion?: boolean;
  noPassword?: boolean;
  /** Teilstring in Name, Karte oder Raumcode (ohne Groß-/Kleinschreibung). */
  search?: string;
};

export function isFull(e: Pick<Heartbeat, 'players' | 'maxPlayers'>): boolean {
  return e.players >= e.maxPlayers;
}

export function filterServers(entries: ServerEntry[], f: ServerFilter): ServerEntry[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return entries.filter((e) => {
    if (f.notFull && isFull(e)) return false;
    if (f.notEmpty && e.players === 0) return false;
    if (f.sameVersion && !e.compatible) return false;
    if (f.noPassword && e.hasPassword) return false;
    if (q && !`${e.name} ${e.map} ${e.room}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export type ServerSortKey = 'name' | 'map' | 'players' | 'latency' | 'status';

const PHASE_ORDER: Record<ServerPhase, number> = { lobby: 0, warmup: 1, freeze: 2, live: 3, bomb: 3, roundEnd: 3, ended: 4 };

/**
 * Sortiert stabil: inkompatible Server immer ans Ende; bei Gleichstand nach Spielern
 * (absteigend), dann Name. Unbekannte Latenz zählt als sehr hoch.
 */
export function sortServers(entries: ServerEntry[], key: ServerSortKey = 'players', dir: 'asc' | 'desc' = key === 'players' ? 'desc' : 'asc'): ServerEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  const cmp = (a: ServerEntry, b: ServerEntry): number => {
    switch (key) {
      case 'name': return a.name.localeCompare(b.name, 'de');
      case 'map': return a.map.localeCompare(b.map);
      case 'players': return a.players - b.players;
      case 'latency': return (a.latency ?? 99999) - (b.latency ?? 99999);
      case 'status': return PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
    }
  };
  return [...entries].sort((a, b) => {
    if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
    const c = cmp(a, b) * sign;
    if (c !== 0) return c;
    return b.players - a.players || a.name.localeCompare(b.name, 'de') || a.room.localeCompare(b.room);
  });
}

/** Statusspalte im Serverbrowser. */
export function serverStatusText(e: Pick<Heartbeat, 'phase' | 'round' | 'score'>): string {
  switch (e.phase) {
    case 'lobby': return 'Lobby – wartet';
    case 'warmup': return 'Aufwärmen';
    case 'ended': return 'Match beendet';
    default: return `Runde ${e.round} · ${e.score[0]}:${e.score[1]}`;
  }
}

/** Spalte „Spieler“: „3/10 (+5 Bots)“. */
export function playersText(e: Pick<Heartbeat, 'players' | 'maxPlayers' | 'bots'>): string {
  return `${e.players}/${e.maxPlayers}${e.bots ? ` (+${e.bots} Bots)` : ''}`;
}

/** Latenz-Anzeige mit Güteklasse für die Farbe. */
export function latencyInfo(ms: number | null): { text: string; level: 'good' | 'ok' | 'bad' | 'unknown' } {
  if (ms === null || !Number.isFinite(ms)) return { text: '–', level: 'unknown' };
  const v = Math.max(0, Math.round(ms));
  return { text: `${v} ms`, level: v < 80 ? 'good' : v < 160 ? 'ok' : 'bad' };
}

/** Kann man beitreten? Grund für die Anzeige, wenn nicht. */
export function joinBlockReason(e: Pick<ServerEntry, 'compatible' | 'players' | 'maxPlayers' | 'version'>): string | null {
  if (!e.compatible) return `Andere Version (${e.version})`;
  if (isFull(e)) return 'Server voll';
  return null;
}
