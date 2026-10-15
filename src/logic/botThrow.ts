import { stepGrenade, throwGrenade } from './grenade';
import type { Blockers } from './hitbox';
import type { GrenadeKind } from './weapons';
import type { XYZ } from './nav';

/**
 * Granatenwürfe für Bots (pure): Wurfrichtung und -stärke so suchen, dass die echte
 * Granatenphysik (`stepGrenade`, Abpraller an Wänden/Böden/Rampen) am Ziel zündet.
 * Generisch für jede Karte — keine vorab eingetragenen Wurfpositionen nötig.
 */
export type ThrowPlan = {
  kind: GrenadeKind;
  eye: XYZ;
  /** Wurfrichtung (normiert) und Stärke 0..1 wie beim Spieler (Links voll, Rechts halb). */
  dir: XYZ;
  strength: number;
  /** Zündpunkt laut Simulation und Abweichung zum Ziel (m). */
  land: XYZ;
  err: number;
};

/** Erlaubte Abweichung je Granatenart (m). */
export const THROW_TOL: Record<GrenadeKind, number> = { he: 3, flash: 5, smoke: 2.5 };

/** Richtung aus Yaw/Pitch (Kamera-Konvention: yaw 0 = −Z). */
function dirOf(yaw: number, pitch: number): XYZ {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

/** Flug simulieren bis zur Zündung; liefert den Zündpunkt. */
export function simulateThrow(solids: Blockers, kind: GrenadeKind, eye: XYZ, dir: XYZ, strength: number): { at: XYZ; t: number } {
  const g = throwGrenade(kind, eye, dir, 'sim', strength);
  const dt = 0.05;
  let t = 0;
  while (t < 8) {
    t += dt;
    if (stepGrenade(g, dt, solids)) break;
  }
  return { at: { ...g.pos }, t };
}

export type SolveOpts = {
  tol?: number;
  /** Blend: Zündpunkt muss diese Punkte sehen (sonst blendet sie niemanden). */
  mustSee?: XYZ[];
  /** Sichtprüfung (Kollisionswelt), nötig mit mustSee. */
  clear?: (a: XYZ, b: XYZ) => boolean;
  /** Zündpunkte aussortieren (z. B. bei Teamkameraden); sucht dann einen anderen Wurf. */
  reject?: (land: XYZ) => boolean;
};

/**
 * Bester Wurf vom Auge zum Ziel (Suche über Neigung, Stärke und kleine Seitenkorrektur),
 * oder null, wenn kein Wurf innerhalb der Toleranz landet. Rauch/HE: Abstand am Boden,
 * Blend: Abstand des Zündpunkts (in der Luft erwünscht) + Sicht auf `mustSee`.
 */
export function solveThrow(solids: Blockers, kind: GrenadeKind, eye: XYZ, target: XYZ, opts: SolveOpts = {}): ThrowPlan | null {
  const tol = opts.tol ?? THROW_TOL[kind];
  const dx = target.x - eye.x;
  const dz = target.z - eye.z;
  const flat = Math.hypot(dx, dz);
  if (flat < 1) return null;
  const yaw0 = Math.atan2(-dx, -dz);
  const strengths = flat < 9 ? [0.45, 0.7, 1] : flat < 16 ? [0.7, 1, 0.45] : [1, 0.7];
  let best = null as ThrowPlan | null;
  const score = (at: XYZ): number => {
    const horiz = Math.hypot(at.x - target.x, at.z - target.z);
    return kind === 'flash' ? Math.hypot(horiz, (at.y - target.y) * 0.7) : horiz + Math.abs(at.y - target.y) * 1.5;
  };
  for (const dyaw of [0, 0.06, -0.06]) {
    for (const strength of strengths) {
      for (let deg = -10; deg <= 70; deg += 5) {
        const dir = dirOf(yaw0 + dyaw, (deg * Math.PI) / 180);
        const r = simulateThrow(solids, kind, eye, dir, strength);
        const err = score(r.at);
        if (best && err >= best.err) continue;
        if (opts.mustSee?.length && opts.clear) {
          const up = { x: r.at.x, y: r.at.y + 0.1, z: r.at.z };
          if (!opts.mustSee.some((p) => opts.clear!(up, p))) continue;
        }
        if (opts.reject?.(r.at)) continue;
        best = { kind, eye, dir, strength, land: r.at, err };
        if (err < tol * 0.35) return best;
      }
    }
    if (best && best.err <= tol) return best;
  }
  return best && best.err <= tol ? best : null;
}
