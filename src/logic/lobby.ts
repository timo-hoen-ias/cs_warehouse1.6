import { ROUND, type RoundState } from './round';
import { cleanText } from './serverList';

/**
 * Server-Regeln für Online-Spiele (framework-frei): Beitritt prüfen (Passwort per
 * Challenge-Response, Spielerlimit, Version, Karte), Serverlobby (Aufwärmen wird
 * gehalten, bis der Host startet) und die öffentliche Server-Konfiguration, die mit
 * dem Snapshot wandert (damit ein neuer Host nach einer Host-Migration dieselben
 * Regeln anwendet). Die Passwort-Prüfsumme selbst verlässt den Host nie.
 */

export const MAX_PLAYERS_MIN = 2;
export const MAX_PLAYERS_MAX = 16;

/** Konfiguration eines Online-Servers (nur auf dem Host vollständig, mit Prüfsumme). */
export type LobbyConfig = {
  /** Anzeigename im Serverbrowser. */
  name: string;
  maxPlayers: number;
  /** Passwort-Prüfsumme (nie Klartext), null = offen. Wird nie gesendet. */
  pw: string | null;
  /** Im Serverbrowser anzeigen. */
  listed: boolean;
  /** Aufwärmen halten, bis der Host „Spiel starten“ drückt. */
  hold: boolean;
  /** Karten-ID des Servers (Beitretende laden dieselbe Karte). */
  map?: string;
  /** Gesamtzahl Spieler, die der Host mit Bots auffüllt (übersteht Host-Migration). */
  fillTo?: number;
  /** Bot-Stärke 0..1 (übersteht Host-Migration). */
  botSkill?: number;
  /** Friendly Fire (Teamschaden), Standard aus; übersteht Host-Migration. */
  friendlyFire?: boolean;
};

/** Öffentlicher Teil der Konfiguration (im Snapshot an alle): statt der Prüfsumme nur „hat Passwort“. */
export type PublicLobby = {
  name: string;
  maxPlayers: number;
  hasPassword: boolean;
  listed: boolean;
  hold: boolean;
  map: string | null;
  fillTo: number | null;
  botSkill: number | null;
  friendlyFire: boolean;
};

export type KickReason = 'password' | 'full' | 'version' | 'map';

/**
 * Prüfsumme eines Passworts, an den Raum gebunden (FNV-1a, 2×32 Bit). Kein
 * kryptografischer Schutz — verhindert nur Klartext im Raum-Verkehr. Leer → null.
 */
export function passwordDigest(room: string, password: string): string | null {
  if (!password) return null;
  const text = `csw16:${room}:${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    h2 ^= h2 >>> 15;
  }
  return h1.toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Antwort auf eine Passwort-Anfrage des Hosts: an Prüfsumme, Einmalwert (Nonce) und die
 * eigene Spieler-ID gebunden. Wer mithört, lernt weder die Prüfsumme noch kann er die
 * Antwort für eine andere ID oder eine andere Anfrage wiederverwenden.
 */
export function authProof(digest: string, nonce: string, id: string): string {
  return passwordDigest(`${nonce}:${id}`, digest)!;
}

/** Zufälliger Einmalwert für eine Passwort-Anfrage (16 Hex-Zeichen). */
export function makeNonce(rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(rnd() * 16).toString(16);
  return s;
}

export type AdmitInput = {
  /** Menschen im Match ohne den Neuen. */
  humans: number;
  /** Spielversion des Neuen (undefined = unbekannt) und des Hosts. */
  version?: string;
  hostVersion?: string;
  /** Karte des Neuen (undefined = unbekannt) und des Hosts. */
  map?: string;
  hostMap?: string;
  /** Offene Passwort-Anfrage an diese ID (null = noch keine gestellt). */
  nonce: string | null;
  /** Antwort des Neuen: undefined = erste Meldung (noch keine Antwort), null = kein Passwort. */
  proof: string | null | undefined;
  /** ID des Neuen (Teil der Antwort). */
  id: string;
};

export type AdmitResult = { ok: true } | { ok: false; reason: KickReason } | { ok: false; reason: 'challenge' };

/**
 * Darf ein neuer Mensch beitreten? Fehlende Konfiguration (Offline/alte Hosts) = nur
 * Version/Karte prüfen. Passwortserver: erste Meldung → 'challenge' (Host stellt eine
 * Anfrage mit Nonce), Antwort muss `authProof(pw, nonce, id)` sein.
 */
export function admitPlayer(cfg: LobbyConfig | null, a: AdmitInput): AdmitResult {
  if (a.version !== undefined && a.hostVersion !== undefined && a.version !== a.hostVersion) return { ok: false, reason: 'version' };
  if (a.map !== undefined && a.hostMap !== undefined && a.map !== a.hostMap) return { ok: false, reason: 'map' };
  if (!cfg) return { ok: true };
  if (a.humans >= cfg.maxPlayers) return { ok: false, reason: 'full' };
  if (cfg.pw) {
    if (a.nonce === null || a.proof === undefined) return { ok: false, reason: 'challenge' };
    if (a.proof !== authProof(cfg.pw, a.nonce, a.id)) return { ok: false, reason: 'password' };
  }
  return { ok: true };
}

export function kickReasonText(reason: string): string {
  switch (reason) {
    case 'password': return 'Falsches oder fehlendes Server-Passwort';
    case 'full': return 'Der Server ist voll';
    case 'version': return 'Andere Spielversion als der Server';
    case 'map': return 'Der Server spielt eine andere Karte';
    default: return 'Vom Server getrennt';
  }
}

/**
 * Serverlobby: solange gehalten wird, läuft der Aufwärm-Timer nicht ab (der Host
 * startet manuell). Wirkt nur in der Aufwärmphase vor Runde 1.
 */
export function holdWarmup(round: RoundState, hold: boolean): void {
  if (!hold || round.phase !== 'warmup' || round.round !== 0) return;
  round.timer = Math.max(round.timer, ROUND.warmupTime);
}

/** Ist die Serverlobby (gehaltenes Aufwärmen) gerade aktiv? */
export function lobbyActive(round: Pick<RoundState, 'phase' | 'round'>, cfg: Pick<LobbyConfig, 'hold'> | null): boolean {
  return !!cfg?.hold && round.phase === 'warmup' && round.round === 0;
}

const MAP_ID = /^[a-z0-9_]{1,32}$/;

function finiteOr(v: unknown, lo: number, hi: number, round: boolean): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const x = Math.min(hi, Math.max(lo, v));
  return round ? Math.round(x) : x;
}

/** Öffentlicher Teil für den Snapshot (ohne Prüfsumme). */
export function publicLobby(cfg: LobbyConfig): PublicLobby {
  return {
    name: cfg.name,
    maxPlayers: cfg.maxPlayers,
    hasPassword: !!cfg.pw,
    listed: cfg.listed,
    hold: cfg.hold,
    map: cfg.map ?? null,
    fillTo: cfg.fillTo ?? null,
    botSkill: cfg.botSkill ?? null,
    friendlyFire: cfg.friendlyFire === true,
  };
}

/** Bereinigt eine empfangene öffentliche Konfiguration (Snapshot fremder Hosts). Ungültig → null. */
export function sanitizePublicLobby(raw: unknown): PublicLobby | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    name: cleanText(r.name, 32, 'Lagerserver'),
    maxPlayers: finiteOr(r.maxPlayers, MAX_PLAYERS_MIN, MAX_PLAYERS_MAX, true) ?? 10,
    hasPassword: r.hasPassword === true,
    listed: r.listed !== false,
    hold: r.hold === true,
    map: typeof r.map === 'string' && MAP_ID.test(r.map) ? r.map : null,
    fillTo: finiteOr(r.fillTo, 0, 32, true),
    botSkill: finiteOr(r.botSkill, 0, 1, false),
    friendlyFire: r.friendlyFire === true,
  };
}

/**
 * Neuer Host nach einer Host-Migration: öffentliche Konfiguration + eigene Prüfsumme
 * (mit der er selbst beigetreten ist). Ohne eigene Prüfsumme bleibt der Server offen —
 * die alte Prüfsumme wird nie verteilt.
 */
export function lobbyFromPublic(pub: PublicLobby, ownDigest: string | null | undefined): LobbyConfig {
  const cfg: LobbyConfig = {
    name: pub.name,
    maxPlayers: pub.maxPlayers,
    pw: pub.hasPassword && ownDigest ? ownDigest : null,
    listed: pub.listed,
    hold: pub.hold,
    friendlyFire: pub.friendlyFire,
  };
  if (pub.map) cfg.map = pub.map;
  if (pub.fillTo !== null) cfg.fillTo = pub.fillTo;
  if (pub.botSkill !== null) cfg.botSkill = pub.botSkill;
  return cfg;
}
