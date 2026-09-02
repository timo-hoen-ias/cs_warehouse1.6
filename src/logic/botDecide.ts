import { castParts, type PartBox } from './hitbox';

/** Datenmodell für Bot-Sichtentscheidung (pure). */
export type SightInput = {
  /** Position des Bots (Augenhöhe ~1.2). */
  from: { x: number; z: number };
  /** Spielerposition. */
  player: { x: number; z: number } | null;
  /** Ziel (z. B. Bombenspot), das der Bot sonst ansteuert. */
  goal: { x: number; z: number };
  maxRange: number;
  solids: PartBox[];
};

export type BotDecision = { target: { x: number; z: number }; canSee: boolean };

/**
 * Bot-Entscheidung: Spieler in Sicht (Entfernung + freie Sichtlinie) → Spieler
 * jagen, sonst zum goal laufen. Pur & testbar.
 */
export function decideBotMove(i: SightInput): BotDecision {
  if (!i.player) return { target: i.goal, canSee: false };
  const dx = i.player.x - i.from.x;
  const dz = i.player.z - i.from.z;
  const dist = Math.hypot(dx, dz);
  let canSee = false;
  if (dist <= i.maxRange) {
    const dir = { x: dx / dist, y: 0, z: dz / dist };
    const wall = castParts({ x: i.from.x, y: 1.2, z: i.from.z }, dir, i.solids);
    canSee = wall === null || wall.dist >= dist;
  }
  return { target: canSee ? { x: i.player.x, z: i.player.z } : i.goal, canSee };
}
