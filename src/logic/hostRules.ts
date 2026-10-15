import { bombCarrier, type MatchState } from './match';
import { ROUND, type RoundState } from './round';
import { PLAYER } from './move';
import type { GunState } from './fire';
import type { WeaponDef } from './weapons';

/** Grenzen der Host-Prüfung fremder Schüsse/Würfe (Posen kommen mit 20 Hz + Latenz → Spielraum). */
export const ORIGIN_CHECK = {
  /** Waagrechter Abstand Ursprung ↔ letzte bekannte Pose (m). */
  horizontal: 2.5,
  /** Senkrechter Abstand Ursprung ↔ Augenhöhe der Pose (m; Ducken/Springen). */
  vertical: 1.5,
} as const;

/** Kaufzeit: Aufwärmen, Kaufphase und die ersten 15 s der laufenden Runde. */
export function canBuyNow(round: Pick<RoundState, 'phase' | 'timer'>): boolean {
  return round.phase === 'warmup' || round.phase === 'freeze' || (round.phase === 'live' && round.timer > ROUND.roundTime - 15);
}

/** Liegt ein gemeldeter Schuss-/Wurf-Ursprung plausibel am Auge des Spielers? NaN → nein. */
export function originNearEye(origin: P3, pose: P3): boolean {
  const h = Math.hypot(origin.x - pose.x, origin.z - pose.z);
  const v = Math.abs(origin.y - (pose.y + PLAYER.eye));
  return h <= ORIGIN_CHECK.horizontal && v <= ORIGIN_CHECK.vertical;
}

/**
 * Munition eines fremden Schusses auf dem Host mitzählen (für Munitionskauf und Host-Wechsel):
 * false = kein Schuss mehr möglich (Magazin und Reserve leer) → Schuss verwerfen.
 * Leeres Magazin mit Reserve = der Client hat nachgeladen.
 */
export function consumeShot(gun: GunState | undefined, def: Pick<WeaponDef, 'mode' | 'magSize'>): boolean {
  if (!gun || def.mode !== 'hit') return true;
  if (gun.mag > 0) {
    gun.mag -= 1;
    return true;
  }
  if (gun.reserve > 0) {
    const take = Math.min(def.magSize, gun.reserve);
    gun.reserve -= take;
    gun.mag = take - 1;
    return true;
  }
  return false;
}

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
