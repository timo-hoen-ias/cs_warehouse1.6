import type { SolidBox } from './level';

/** Bewegungsparameter (CS-angelehnt, justierbar). */
export const PLAYER = {
  eye: 1.65, // Augen-/Kamera-Höhe über Boden
  crouchEye: 1.15, // Ziel-Höhe der Kamera beim Ducken (Stand bleibt kollisionsfrei)
  crouchSpeed: 2.4, // max. Laufgeschwindigkeit beim Ducken
  radius: 0.35, // Kollisionsradius (XZ)
  gravity: 20,
  jumpSpeed: 7,
  walkSpeed: 4.2, // CS-Sprint ~ 4.3 m/s? leicht erhöht für Lagerspacing
  sprintSpeed: 6.2,
} as const;

export type PlayerMotion = {
  x: number;
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
};

/**
 * Löst die horizontale Position gegen alle soliden Boxen auf (XZ, Radius).
 * Wird je Achse getrennt aufgerufen (x vor z), damit man an Kanten entlanggleitet.
 * Port von resolveCollisions aus ias.warehouse-map (WalkControls).
 */
export function resolveAxis(pos: { x: number; z: number }, solids: SolidBox[], radius: number): void {
  for (const b of solids) {
    const minX = b.minX - radius;
    const maxX = b.maxX + radius;
    const minZ = b.minZ - radius;
    const maxZ = b.maxZ + radius;
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
      const dl = pos.x - minX;
      const dr = maxX - pos.x;
      const dt = pos.z - minZ;
      const db = maxZ - pos.z;
      const min = Math.min(dl, dr, dt, db);
      if (min === dl) pos.x = minX;
      else if (min === dr) pos.x = maxX;
      else if (min === dt) pos.z = minZ;
      else pos.z = maxZ;
    }
  }
}

/**
 * Ein Bewegungs-Schritt (reine Logik, kein three).
 * Wendet Vertikalgeschwindigkeit + Kollision und horizontale Verschiebung an.
 * Returns neuen Zustand; verändert nichts extern.
 */
export function stepPlayer(
  m: PlayerMotion,
  moveX: number,
  moveZ: number,
  jump: boolean,
  dt: number,
  solids: SolidBox[],
  opts: { eye?: number; radius?: number; gravity?: number; jumpSpeed?: number } = {},
): PlayerMotion {
  const eye = opts.eye ?? PLAYER.eye;
  const radius = opts.radius ?? PLAYER.radius;
  const gravity = opts.gravity ?? PLAYER.gravity;
  const jumpSpeed = opts.jumpSpeed ?? PLAYER.jumpSpeed;
  dt = Math.min(dt, 0.05);

  // --- Vertikal ---
  let vy = m.grounded && jump ? jumpSpeed : m.vy - gravity * dt;
  let y = m.y + vy * dt;
  let grounded = false;
  if (y <= eye) {
    y = eye;
    vy = 0;
    grounded = true;
  }

  // --- Horizontal (achsengetrennt kollidieren) ---
  let x = m.x + moveX * dt;
  resolveAxis({ x, z: m.z }, solids, radius);
  const collidedX = { x, z: m.z };
  x = collidedX.x;

  let z = m.z + moveZ * dt;
  resolveAxis({ x, z }, solids, radius);

  // Erneut kollidieren, falls beide Achsen sich gegenseitig beeinflussen
  const px = { x, z };
  resolveAxis(px, solids, radius);

  return { x: px.x, y, z: px.z, vy, grounded };
}

/** Prüft, ob ein Punkt (XZ) frei von solidern Boxen ist (Spieler-Spawn etc.). */
export function pointFree(x: number, z: number, solids: SolidBox[], radius: number = PLAYER.radius): boolean {
  return solids.every((b) => x <= b.minX - radius || x >= b.maxX + radius || z <= b.minZ - radius || z >= b.maxZ + radius);
}

export type MoveKeys = { w: boolean; s: boolean; a: boolean; d: boolean; sprint: boolean };

/** Vorwärts-Vektor in der XZ-Ebene aus dem Yaw (Kamera blickt bei yaw=0 in -Z). */
export function forwardFromYaw(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Rechts-Vektor (XZ) aus dem Yaw. */
export function rightFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** Gewünschte horizontale Bewegung (m/s) aus Tasten + Yaw, sprint-fähig. */
export function wishSpeed(keys: MoveKeys, yaw: number, walk: number = PLAYER.walkSpeed, sprint: number = PLAYER.sprintSpeed): { x: number; z: number } {
  const f = forwardFromYaw(yaw);
  const r = rightFromYaw(yaw);
  let mx = 0;
  let mz = 0;
  if (keys.w) (mx += f.x), (mz += f.z);
  if (keys.s) (mx -= f.x), (mz -= f.z);
  if (keys.d) (mx += r.x), (mz += r.z);
  if (keys.a) (mx -= r.x), (mz -= r.z);
  const len = Math.hypot(mx, mz);
  if (len === 0) return { x: 0, z: 0 };
  const speed = keys.sprint ? sprint : walk;
  return { x: (mx / len) * speed, z: (mz / len) * speed };
}
