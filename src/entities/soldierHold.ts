import type { P3, WeaponGeom } from '../logic/weaponGeom';
import { LEG, solveTwoBone } from './soldierAnim';

/**
 * Waffenhaltung des Soldaten (Dritte Person), rein rechnerisch (kein three).
 *
 * Soldatenraum (absolut, Füße bei y = 0, Standhaltung): +z = vorwärts (Blickrichtung des Modells),
 * +y oben, +x = LINKE Körperseite (der Soldat blickt nach +z, seine Rechte liegt bei −x).
 * Modellpunkte einer Waffe [x rechts, y oben, f vorwärts] (weaponGeom.ts) werden gespiegelt in diesen
 * Raum gelegt: (x, y, f) → (−x, y, f), dann um die x-Achse nach oben geneigt (`pitch`) und verschoben.
 *
 * Die Haltung hängt nur von der Tabelle ab: Gewehre/MPs werden mit der Schaftkappe an die rechte Schulter
 * gelegt, Pistolen beidhändig ausgestreckt (Visierlinie auf Augenhöhe), Messer/Granate in der rechten Hand
 * (linker Arm locker), C4 mit beiden Händen vor dem Bauch. Hand-Ziele = Griffpunkte der Tabelle.
 */
export type V3 = { x: number; y: number; z: number };

export const SHOULDER_X = 0.25;
export const SHOULDER_Y = 1.37;
export const TORSO_PIVOT_Y = LEG.hipY;
export const EYE_Y = 1.545;

/** Armsegmente (m): Schulter → Ellbogen → Handgelenk → Handflächenmitte. */
export const ARM = { upper: 0.34, fore: 0.33, hand: 0.07 } as const;
/** Größte Reichweite Schulter → Handflächenmitte (Arm leicht gebeugt). */
export const ARM_REACH = (ARM.upper + ARM.fore + ARM.hand) * 0.985;

export type HoldPlan = {
  /** Ursprung der Waffe (= Griffpunkt der Schusshand) im Soldatenraum. */
  origin: V3;
  /** Neigung der Mündung nach oben (rad). */
  pitch: number;
  /** Hand-Ziele (Handflächenmitte) im Soldatenraum. */
  right: V3;
  left: V3;
  /** Linker Arm greift die Waffe (sonst hängt er locker). */
  leftGrips: boolean;
};

export const rightShoulder = (): V3 => ({ x: -SHOULDER_X, y: SHOULDER_Y, z: 0 });
export const leftShoulder = (): V3 => ({ x: SHOULDER_X, y: SHOULDER_Y, z: 0 });
/** Ruhelage der freien linken Hand (Arm hängt leicht gebeugt nach vorn). */
export const IDLE_LEFT: V3 = { x: 0.3, y: 0.95, z: 0.12 };

/** Modellpunkt → Soldatenraum. */
export function holdPoint(plan: Pick<HoldPlan, 'origin' | 'pitch'>, p: P3): V3 {
  const c = Math.cos(plan.pitch);
  const s = Math.sin(plan.pitch);
  const x = -p[0];
  const y = p[1] * c + p[2] * s;
  const z = -p[1] * s + p[2] * c;
  return { x: plan.origin.x + x, y: plan.origin.y + y, z: plan.origin.z + z };
}

export function dist(a: V3, b: V3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Verkleinert z in 5-mm-Schritten, bis die linke Hand erreichbar ist (oder `zMin` erreicht). */
function pullBack(make: (z: number) => HoldPlan, z0: number, zMin: number): HoldPlan {
  let z = z0;
  let plan = make(z);
  while (z > zMin && dist(plan.left, leftShoulder()) > ARM_REACH) {
    z -= 0.005;
    plan = make(z);
  }
  return plan;
}

/** Haltung für ein Modell (aus der Tabelle). */
export function holdPlan(geom: WeaponGeom): HoldPlan {
  const build = (origin: V3, pitch: number, leftGrips: boolean): HoldPlan => {
    const plan = { origin, pitch } as HoldPlan;
    plan.right = holdPoint(plan, geom.gripR);
    plan.leftGrips = leftGrips;
    plan.left = leftGrips ? holdPoint(plan, geom.gripL) : IDLE_LEFT;
    return plan;
  };
  switch (geom.hold) {
    case 'rifle': {
      // Schaftkappe an der rechten Schulter (leicht vor der Brust), Waffe waagerecht, dicht an den Körper
      const butt = geom.butt ?? [0, 0, -0.3];
      const make = (zb: number): HoldPlan => build({ x: -0.1, y: 1.36 - butt[1], z: zb - butt[2] }, 0, true);
      return pullBack(make, 0.04, -0.1);
    }
    case 'pistol': {
      // Beidhändig ausgestreckt, Visierlinie in Augenhöhe, Waffenmitte vor dem rechten Auge
      const sightY = geom.sightRear?.[1] ?? geom.muzzle[1] + 0.02;
      return pullBack((z) => build({ x: -0.04, y: EYE_Y - 0.025 - sightY, z }, 0, true), 0.55, 0.3);
    }
    case 'dual':
      // Zwei Pistolen nebeneinander (Modellabstand 0,24 m), vor den Schultern
      return pullBack((z) => build({ x: -0.12, y: 1.4, z }, 0.03, true), 0.5, 0.3);
    case 'knife':
      return build({ x: -0.2, y: 1.05, z: 0.34 }, 0.45, false);
    case 'grenade':
      return build({ x: -0.17, y: 1.2, z: 0.34 }, 0, false);
    case 'bomb':
      return build({ x: -0.065, y: 1.12, z: 0.32 }, 0, true);
  }
}

/** Ellbogen-Richtung (Pol) je Seite: nach außen, unten und leicht hinten. */
export const elbowPole = (side: 'L' | 'R'): V3 => ({ x: side === 'L' ? 0.6 : -0.6, y: -1, z: -0.25 });

/**
 * Arm-Gelenke für Schulter S und Hand H (Handflächenmitte): Handgelenk liegt `ARM.hand` vor der Hand
 * auf der Linie Schulter → Hand, der Ellbogen ergibt sich aus den festen Segmentlängen (Zwei-Knochen-IK).
 * Ist H zu weit entfernt, bleibt der Arm gestreckt und das Handgelenk entsprechend kürzer.
 */
export function armJoints(shoulder: V3, hand: V3, pole: V3): { elbow: V3; wrist: V3 } {
  const d = dist(shoulder, hand) || 1;
  const dir = { x: (hand.x - shoulder.x) / d, y: (hand.y - shoulder.y) / d, z: (hand.z - shoulder.z) / d };
  const reach = ARM.upper + ARM.fore - 1e-4;
  const wl = Math.min(reach, Math.max(0, d - ARM.hand));
  const wrist = { x: shoulder.x + dir.x * wl, y: shoulder.y + dir.y * wl, z: shoulder.z + dir.z * wl };
  return { elbow: solveTwoBone(shoulder, wrist, ARM.upper, ARM.fore, pole), wrist };
}
