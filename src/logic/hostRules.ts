import { bombCarrier, type MatchState } from './match';

/**
 * Host-Regeln (pure), die Spiel-Host (MatchDriver) und Headless-Simulation (botSim)
 * gleich anwenden: wer pflanzt bzw. entschärft gerade?
 */
export type P3 = { x: number; y: number; z: number };

/** Abstand (XZ), in dem man die gelegte Bombe entschärfen kann (m). */
export const DEFUSE_RADIUS = 2.0;
/** Höchster Höhenunterschied zur Bombe beim Entschärfen (m). */
export const DEFUSE_DY = 1.6;

export type BombInput = {
  plant: boolean;
  defuse: boolean;
  inSpot: 'a' | 'b' | null;
  hasKit: boolean;
  planter: string | null;
  defuser: string | null;
};

/**
 * Eingaben für die Bombe in diesem Tick: Pflanzen = lebender Träger hält E im Spot
 * (Bots mit C4 in der Hand; Menschen ziehen sie automatisch), Entschärfen = ein CT
 * hält E nahe der gelegten Bombe (Höhenunterschied begrenzt).
 */
export function bombInput(
  m: MatchState,
  opts: { siteAt: (p: P3) => 'a' | 'b' | null; eHeld: (id: string) => boolean; bombPos: P3 | null; spotCenter: (s: 'a' | 'b') => P3 },
): BombInput {
  const out: BombInput = { plant: false, defuse: false, inSpot: null, hasKit: false, planter: null, defuser: null };
  const carrier = bombCarrier(m);
  if (carrier && m.round.phase === 'live' && opts.eHeld(carrier.id)) {
    const s = opts.siteAt(carrier.pose);
    if (s && (carrier.weapon === 'c4' || !carrier.bot)) {
      out.plant = true;
      out.inSpot = s;
      out.planter = carrier.id;
    }
  }
  const spot = m.round.bomb.spot;
  if (m.round.phase === 'bomb' && spot) {
    const bp = opts.bombPos ?? opts.spotCenter(spot);
    for (const p of Object.values(m.players)) {
      if (!p.alive || p.team !== 'CT') continue;
      if (Math.hypot(p.pose.x - bp.x, p.pose.z - bp.z) > DEFUSE_RADIUS || Math.abs(p.pose.y - bp.y) > DEFUSE_DY) continue;
      if (!opts.eHeld(p.id)) continue;
      out.defuse = true;
      out.inSpot = spot;
      out.hasKit = p.loadout.defuseKit;
      out.defuser = p.id;
      break;
    }
  }
  return out;
}
