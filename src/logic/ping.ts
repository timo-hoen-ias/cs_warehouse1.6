/**
 * Ping-Messung (pure): Der Host schickt regelmäßig `ping` (laufende Nummer) an alle,
 * jeder Client antwortet sofort mit `pong` (gleiche Nummer). Die Rundlaufzeit misst der
 * Host mit seiner eigenen Uhr — der Client kann sie nicht schönen, nur verzögern.
 * Angezeigt wird der Median der letzten Messungen (ein Ausreißer verfälscht nichts).
 * Ältere Clients ignorieren die unbekannten Nachrichten → Ping bleibt dort „unbekannt“.
 */

/** Abstand zwischen zwei Ping-Runden (ms). */
export const PING_INTERVAL_MS = 2000;
/** Keine Antwort so lange → Ping gilt wieder als unbekannt (ms). */
export const PING_EXPIRE_MS = 9000;
/** Plausibilitätsgrenze einer einzelnen Messung (ms); alles darüber wird verworfen. */
export const PING_MAX_MS = 5000;
/** Anzahl Messungen für den Median. */
export const PING_WINDOW = 5;
/** Wert für „noch nicht gemessen“ (Anzeige „–“). */
export const PING_UNKNOWN = -1;

type Sample = { list: number[]; lastN: number; lastAt: number };

/** Median einer nichtleeren Liste. */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Host-seitige Buchführung der Ping-Runden. Alle Zeiten in ms der lokalen Uhr (`performance.now()`). */
export class PingTracker {
  private seq = 0;
  private nextAt = 0;
  private readonly sent = new Map<number, number>();
  private readonly samples = new Map<string, Sample>();

  /** Liefert die Nummer eines jetzt zu sendenden Pings, sonst null. */
  due(now: number): number | null {
    if (now < this.nextAt) return null;
    this.nextAt = now + PING_INTERVAL_MS;
    const n = ++this.seq;
    this.sent.set(n, now);
    for (const [k, t] of this.sent) if (now - t > PING_EXPIRE_MS) this.sent.delete(k);
    return n;
  }

  /**
   * Antwort verbuchen. Gültig nur für einen tatsächlich gesendeten Ping und nur einmal je
   * Spieler (neuere Nummer als die letzte akzeptierte). Gibt die Rundlaufzeit zurück, sonst null.
   */
  pong(id: string, n: unknown, now: number): number | null {
    if (typeof n !== 'number' || !Number.isInteger(n)) return null;
    const t0 = this.sent.get(n);
    if (t0 === undefined) return null;
    const s = this.samples.get(id) ?? { list: [], lastN: 0, lastAt: now };
    if (n <= s.lastN) return null;
    const rtt = now - t0;
    if (!(rtt >= 0) || rtt > PING_MAX_MS) return null;
    s.lastN = n;
    s.lastAt = now;
    s.list.push(rtt);
    if (s.list.length > PING_WINDOW) s.list.shift();
    this.samples.set(id, s);
    return rtt;
  }

  /** Geglätteter Ping (ms, ganzzahlig) oder `PING_UNKNOWN`. */
  get(id: string, now: number): number {
    const s = this.samples.get(id);
    if (!s || !s.list.length || now - s.lastAt > PING_EXPIRE_MS) return PING_UNKNOWN;
    return Math.round(median(s.list));
  }

  forget(id: string): void {
    this.samples.delete(id);
  }
}

type PingPlayer = { id: string; bot: boolean; ping: number };

/**
 * Pings in die Spielerliste schreiben: Bots und der Host selbst haben 0 (kein Netz),
 * entfernte Menschen den gemessenen Wert bzw. `PING_UNKNOWN`.
 */
export function applyPings(players: Iterable<PingPlayer>, hostId: string, tracker: PingTracker, now: number): void {
  for (const p of players) {
    if (p.bot || p.id === hostId) p.ping = 0;
    else p.ping = tracker.get(p.id, now);
  }
}
