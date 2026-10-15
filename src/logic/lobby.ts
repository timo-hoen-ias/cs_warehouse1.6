import { ROUND, type RoundState } from './round';
import { cleanText } from './serverList';

/**
 * Server-Regeln für Online-Spiele (framework-frei): Beitritt prüfen (Passwort,
 * Spielerlimit, Version), Serverlobby (Aufwärmen wird gehalten, bis der Host
 * startet) und die Server-Konfiguration, die mit dem Snapshot wandert (damit
 * ein neuer Host nach einer Host-Migration dieselben Regeln anwendet).
 */

export const MAX_PLAYERS_MIN = 2;
export const MAX_PLAYERS_MAX = 16;

/** Konfiguration eines Online-Servers (im Snapshot an alle verteilt). */
export type LobbyConfig = {
  /** Anzeigename im Serverbrowser. */
  name: string;
  maxPlayers: number;
  /** Passwort-Prüfsumme (nie Klartext), null = offen. */
  pw: string | null;
  /** Im Serverbrowser anzeigen. */
  listed: boolean;
  /** Aufwärmen halten, bis der Host „Spiel starten“ drückt. */
  hold: boolean;
};

export type KickReason = 'password' | 'full' | 'version';

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
 * Darf ein neuer Mensch beitreten? `humans` = Menschen im Match ohne den Neuen.
 * Fehlende Konfiguration (Offline/alte Hosts) = immer erlaubt.
 */
export function admitPlayer(cfg: LobbyConfig | null, humans: number, givenDigest: string | null | undefined, version?: string, hostVersion?: string): { ok: true } | { ok: false; reason: KickReason } {
  if (version !== undefined && hostVersion !== undefined && version !== hostVersion) return { ok: false, reason: 'version' };
  if (!cfg) return { ok: true };
  if (cfg.pw && givenDigest !== cfg.pw) return { ok: false, reason: 'password' };
  if (humans >= cfg.maxPlayers) return { ok: false, reason: 'full' };
  return { ok: true };
}

export function kickReasonText(reason: string): string {
  switch (reason) {
    case 'password': return 'Falsches oder fehlendes Server-Passwort';
    case 'full': return 'Der Server ist voll';
    case 'version': return 'Andere Spielversion als der Server';
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

/** Bereinigt eine empfangene Konfiguration (Snapshot fremder Hosts). */
export function sanitizeLobbyConfig(raw: unknown): LobbyConfig | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const max = typeof r.maxPlayers === 'number' && Number.isFinite(r.maxPlayers) ? Math.round(r.maxPlayers) : 10;
  return {
    name: cleanText(r.name, 32, 'Lagerserver'),
    maxPlayers: Math.min(MAX_PLAYERS_MAX, Math.max(MAX_PLAYERS_MIN, max)),
    pw: typeof r.pw === 'string' && /^[0-9a-f]{16}$/.test(r.pw) ? r.pw : null,
    listed: r.listed !== false,
    hold: r.hold === true,
  };
}
