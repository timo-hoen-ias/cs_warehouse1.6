import type { Team } from './economy';
import type { RoundPhase } from './round';
import type { BombPhase } from './bombs';

/**
 * Kontextabhängiger Ziel-Hinweis in der Bildmitte (pure): sagt dem Spieler kurz, was jetzt
 * seine Aufgabe ist (T mit/ohne Bombe, CT, nach dem Legen), und blendet ihn nach wenigen
 * Sekunden aus. Tastenhinweise („E halten: …“) bleiben dagegen stehen, solange sie gelten.
 */

export type SiteId = 'a' | 'b';

export type HintInput = {
  phase: RoundPhase;
  team: Team;
  alive: boolean;
  /** Spieler trägt die C4. */
  hasBomb: boolean;
  /** Eine herrenlose C4 liegt am Boden. */
  bombDropped: boolean;
  bombPhase: BombPhase;
  /** Bombenspot der gelegten Bombe. */
  bombSpot: SiteId | null;
  /** Bombenspot, in dem der Spieler gerade steht. */
  inSite: SiteId | null;
  /** CT steht nah genug an der Bombe zum Entschärfen. */
  canDefuse: boolean;
  hasKit: boolean;
  siteNames: { a: string; b: string };
};

export type Hint = {
  text: string;
  /** Tastenhinweis: bleibt stehen, solange er gilt (kein Ausblenden). */
  sticky: boolean;
};

/** Anzeigedauer eines Ziel-Hinweises, danach Ausblenden (ms). */
export const HINT_SHOW_MS = 6000;
export const HINT_FADE_MS = 1200;

/** Gemeinsamer Wortanfang zweier Spotnamen („Serverschrank A“ / „Serverschrank B“ → „Serverschrank“), sonst ''. */
export function siteNoun(a: string, b: string): string {
  const wa = a.trim().split(/\s+/);
  const wb = b.trim().split(/\s+/);
  if (wa.length < 2 || wa.length !== wb.length) return '';
  const head = wa.slice(0, -1);
  return head.join(' ') === wb.slice(0, -1).join(' ') ? head.join(' ') : '';
}

const PLURAL: Record<string, string> = { Serverschrank: 'Serverschränke' };

/** „Serverschrank A oder B“ bzw. bei verschiedenen Namen „Halle oder Rampe“. */
export function eitherSite(n: { a: string; b: string }): string {
  const noun = siteNoun(n.a, n.b);
  if (!noun) return `${n.a} oder ${n.b}`;
  const last = (s: string): string => s.trim().split(/\s+/).pop()!;
  return `${noun} ${last(n.a)} oder ${last(n.b)}`;
}

/** Mehrzahl für „… verteidigen“ („Serverschränke“), sonst allgemein „Bombenspots“. */
export function sitesPlural(n: { a: string; b: string }): string {
  const noun = siteNoun(n.a, n.b);
  return PLURAL[noun] ?? 'Bombenspots';
}

/** Der aktuell passende Hinweis oder null (Tote, Aufwärmen, Kaufphase, Rundenende: keiner). */
export function objectiveHint(i: HintInput): Hint | null {
  if (!i.alive || (i.phase !== 'live' && i.phase !== 'bomb')) return null;
  const planted = i.bombPhase === 'planted' || i.bombPhase === 'defusing';
  const site = i.bombSpot ? i.siteNames[i.bombSpot] : null;
  const where = site ? ` bei ${site}` : '';

  if (i.team === 'CT') {
    if (planted && i.canDefuse) return { text: `E halten: Bombe entschärfen${i.hasKit ? ' (Kit)' : ''}`, sticky: true };
    if (planted) return { text: `Bombe${where} entschärfen!`, sticky: false };
    return { text: `${sitesPlural(i.siteNames)} verteidigen`, sticky: false };
  }
  // Terroristen
  if (planted) return { text: `Bombe${where} bewachen`, sticky: false };
  if (i.hasBomb) {
    if (i.inSite) return { text: `E halten: Bombe legen (${i.siteNames[i.inSite]})`, sticky: true };
    return { text: `Bombe zu ${eitherSite(i.siteNames)} bringen`, sticky: false };
  }
  if (i.bombDropped) return { text: 'Bombe aufheben', sticky: false };
  return { text: 'Bombenträger unterstützen', sticky: false };
}

export type ShownHint = { text: string; alpha: number };

/**
 * Blendet Ziel-Hinweise nach `HINT_SHOW_MS` aus. Ein neuer Text startet die Anzeige neu;
 * verschwindet der Hinweis (null) und kommt derselbe Text später wieder (neue Runde),
 * erscheint er ebenfalls erneut. Tastenhinweise sind immer voll sichtbar und lassen den
 * Ziel-Hinweis davor unberührt (nach dem Verlassen des Spots beginnt er nicht von vorn).
 */
export class HintFader {
  private text: string | null = null;
  private since = 0;

  update(h: Hint | null, now: number): ShownHint | null {
    if (!h) {
      this.text = null;
      return null;
    }
    if (h.sticky) return { text: h.text, alpha: 1 };
    if (h.text !== this.text) {
      this.text = h.text;
      this.since = now;
    }
    const age = now - this.since;
    if (age < HINT_SHOW_MS) return { text: h.text, alpha: 1 };
    const f = 1 - (age - HINT_SHOW_MS) / HINT_FADE_MS;
    return f > 0 ? { text: h.text, alpha: f } : null;
  }
}
