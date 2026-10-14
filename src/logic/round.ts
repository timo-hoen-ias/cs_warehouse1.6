import type { Team } from './economy';
import { BOMB, isBombActive, tickBomb, type BombState } from './bombs';

/** Rundenphasen des de_-Modus. */
export type RoundPhase =
  | 'warmup'    // Vor der ersten Runde (Spaß, kein Ziel)
  | 'freeze'    // Kaufen möglich, Bewegung gesperrt
  | 'live'      // Runde läuft
  | 'bomb'      // Bombe gepflanzt — Unterzustand von live, separat gezählt fürs HUD
  | 'roundEnd'; // Ergebnis wird kurz angezeigt

export const ROUND = {
  warmupTime: 5,
  freezeTime: 6,
  buyTime: 10,      // Kaufen auch nach Freeze bis live noch kurz möglich (vereinfacht: = freeze)
  roundTime: 115,   // CS de_: 1:45
  roundEndTime: 4,  // Anzeige Ergebnis
  scoreToWin: 16,   // erste auf 16
} as const;

export type RoundResult =
  | { outcome: 'ct_win' | 't_win' | 't_win_explode' | 'ct_win_defuse'; reason: string }
  | null;

export type RoundState = {
  phase: RoundPhase;
  timer: number;          // Restzeit der aktuellen Phase
  round: number;          // 1-basiert
  ctRounds: number;
  tRounds: number;
  bomb: BombState;
  result: RoundResult;
};

export function newRoundState(): RoundState {
  return {
    phase: 'warmup',
    timer: ROUND.warmupTime,
    round: 0,
    ctRounds: 0,
    tRounds: 0,
    bomb: { phase: 'none', progress: 0, fuseLeft: 0, spot: null, hasKit: false },
    result: null,
  };
}

export type RoundInput = {
  /** Alle lebenden Spieler je Team (Kill-Eliminierung). */
  alive: { T: number; CT: number };
  /** Spieleraktionen für die Bombe. */
  bombAction: { plant: boolean; defuse: boolean };
  /** Spieler auf welchem Spot? */
  inSpot: 'a' | 'b' | null;
  hasKit: boolean;
};

/**
 * Tickt die Runde. Reduziert Timer, treibt die Bombe, wechselt Phasen und
 * entscheidet Sieg/Niederlage. Rückgabe: Ergebnis, wenn die Runde endete.
 */
export function tickRound(s: RoundState, input: RoundInput, dt: number): RoundResult {
  dt = Math.min(dt, 0.1);

  // Bombe in live UND bomb ticken (nach dem Plant ist die Phase 'bomb')
  if (s.phase === 'live' || s.phase === 'bomb') {
    const wasBomb = s.phase === 'bomb';
    tickBomb(s.bomb, dt, input.bombAction, { inSpot: input.inSpot, hasKit: input.hasKit });
    // Aktive Bombe → 'bomb'; nach Defuse/Explosion in 'bomb' bleiben, damit der
    // Switch darunter den Endzustand verarbeiten kann (sonst ginge er verloren).
    if (isBombActive(s.bomb)) s.phase = 'bomb';
    else if (!wasBomb) s.phase = 'live';
  }

  s.timer -= dt;

  switch (s.phase) {
    case 'warmup':
      if (s.timer <= 0) startRound(s);
      break;

    case 'freeze':
      if (s.timer <= 0) {
        s.phase = 'live';
        s.timer = ROUND.roundTime;
        resetBomb(s);
      }
      break;

    case 'live': {
      // Eliminierung beendet die Runde
      if (input.alive.T === 0) return finish(s, { outcome: 'ct_win', reason: 'Terroristen eliminiert' });
      if (input.alive.CT === 0) return finish(s, { outcome: 't_win', reason: 'Counter-Terroristen eliminiert' });
      if (s.timer <= 0) return finish(s, { outcome: 'ct_win', reason: 'Zeit abgelaufen' });
      break;
    }

    case 'bomb': {
      // CS-Regel: nach dem Plant zählt nur noch die Bombe — tote T beenden die Runde nicht,
      // tote CT (niemand kann mehr entschärfen) schon (als normaler T-Sieg).
      if (input.alive.CT === 0) return finish(s, { outcome: 't_win', reason: 'Counter-Terroristen eliminiert' });
      if (s.bomb.phase === 'exploded') return finish(s, { outcome: 't_win_explode', reason: 'Bombe explodiert' });
      if (s.bomb.phase === 'defused') return finish(s, { outcome: 'ct_win_defuse', reason: 'Bombe entschärft' });
      break;
    }

    case 'roundEnd':
      if (s.timer <= 0) startRound(s);
      break;
  }
  return null;
}

/** Erlaubt dem Kauf-Menü Zugriff während freeze (und warmup). */
export function canBuy(s: RoundState): boolean {
  return s.phase === 'warmup' || s.phase === 'freeze';
}

function startRound(s: RoundState): void {
  s.round += 1;
  s.phase = 'freeze';
  s.timer = ROUND.freezeTime;
  s.result = null;
  resetBomb(s);
}

function resetBomb(s: RoundState): void {
  s.bomb = { phase: 'none', progress: 0, fuseLeft: 0, spot: null, hasKit: s.bomb.hasKit };
}

function finish(s: RoundState, r: RoundResult): RoundResult {
  if (s.phase === 'roundEnd') return null; // schon beendet
  s.result = r;
  s.phase = 'roundEnd';
  s.timer = ROUND.roundEndTime;
  if (r?.outcome === 'ct_win' || r?.outcome === 'ct_win_defuse') s.ctRounds += 1;
  else if (r?.outcome === 't_win' || r?.outcome === 't_win_explode') s.tRounds += 1;
  return r;
}

/** Prüft Match-Sieg (16 Runden). */
export function matchWon(s: RoundState): Team | null {
  if (s.ctRounds >= ROUND.scoreToWin) return 'CT';
  if (s.tRounds >= ROUND.scoreToWin) return 'T';
  return null;
}
