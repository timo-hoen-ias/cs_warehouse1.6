/** Bomben-Zustandslogik (de_-Modus), pure & testbar. */

export type BombPhase = 'none' | 'planting' | 'planted' | 'defusing' | 'exploded' | 'defused';

export const BOMB = {
  plantTime: 3.2,   // s, Taste E im Spot halten
  fuseTime: 40,     // s bis Explosion nach Plant
  defuseTime: 10,   // s ohne Kit
  defuseKitTime: 5, // s mit Kit
} as const;

export type BombState = {
  phase: BombPhase;
  /** Fortschritt der aktuellen Interaktion (0..1). */
  progress: number;
  /** Restzeit der Zündschnur nach Plant. */
  fuseLeft: number;
  /** Auf welchem Spot liegt die Bombe ('a'|'b'|null). */
  spot: 'a' | 'b' | null;
  hasKit: boolean;
};

export function newBomb(): BombState {
  return { phase: 'none', progress: 0, fuseLeft: 0, spot: null, hasKit: false };
}

/**
 * Tick in Sekunden. Erwartet pro Tick einen "Action"-Wunsch (Taste E gedrückt)
 * und ob der Spieler auf einem Spot/der Bombe steht.
 */
export function tickBomb(
  b: BombState,
  dt: number,
  action: { plant: boolean; defuse: boolean },
  ctx: { inSpot: 'a' | 'b' | null; hasKit: boolean },
): void {
  b.hasKit = ctx.hasKit;

  if (b.phase === 'none') {
    if (ctx.inSpot && action.plant) {
      b.phase = 'planting';
      b.spot = ctx.inSpot;
      b.progress = 0;
    }
    return;
  }

  if (b.phase === 'planting') {
    if (!ctx.inSpot || !action.plant) {
      b.phase = 'none'; // abgebrochen
      b.progress = 0;
      b.spot = null;
      return;
    }
    b.progress += dt / BOMB.plantTime;
    if (b.progress >= 1) {
      b.phase = 'planted';
      b.fuseLeft = BOMB.fuseTime;
      b.progress = 0;
    }
    return;
  }

  if (b.phase === 'planted') {
    b.fuseLeft = Math.max(0, b.fuseLeft - dt);
    if (b.fuseLeft <= 0) {
      b.phase = 'exploded';
      return;
    }
    if (action.defuse && ctx.inSpot === b.spot) {
      b.phase = 'defusing';
      b.progress = 0;
    }
    return;
  }

  if (b.phase === 'defusing') {
    // Defuse nur auf dem Spot der Bombe; Abbruch wenn losgelassen/weg
    if (!action.defuse || ctx.inSpot !== b.spot) {
      b.phase = 'planted';
      b.progress = 0;
      return;
    }
    const total = ctx.hasKit ? BOMB.defuseKitTime : BOMB.defuseTime;
    b.progress += dt / total;
    if (b.progress >= 1) {
      b.phase = 'defused';
      b.fuseLeft = 0;
      b.progress = 0;
      b.spot = null;
    }
    return;
  }
}

export function isBombActive(b: BombState): boolean {
  return b.phase === 'planted' || b.phase === 'defusing';
}
