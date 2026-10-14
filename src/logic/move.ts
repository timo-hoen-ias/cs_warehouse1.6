import type { SolidBox } from './level';

/** Bewegungsparameter (CS-angelehnt, justierbar). */
export const PLAYER = {
  eye: 1.65, // Augen-/Kamera-Höhe über dem Fußpunkt
  crouchEye: 1.15, // Ziel-Höhe der Kamera beim Ducken (Stand bleibt kollisionsfrei)
  crouchSpeed: 2.4, // max. Laufgeschwindigkeit beim Ducken
  radius: 0.35, // Kollisionsradius (XZ)
  height: 1.8, // Körperhöhe (Kopf) für Decken/Unterquerungen
  step: 0.55, // Stufen bis zu dieser Höhe werden ohne Sprung erklommen
  gravity: 20,
  jumpSpeed: 7, // Sprunghöhe ≈ v²/2g ≈ 1.2 m → Kisten/Paletten bis 1.1 m
  walkSpeed: 4.2, // CS-Sprint ~ 4.3 m/s? leicht erhöht für Lagerspacing
  sprintSpeed: 6.2,
} as const;

export type PlayerMotion = {
  x: number;
  /** Augenhöhe in Weltkoordinaten (Fußpunkt = y − eye). */
  y: number;
  z: number;
  vy: number;
  grounded: boolean;
};

/** Überlappt der Kreis (x,z,radius) die XZ-Fläche der Box? */
function overlapsXz(b: SolidBox, x: number, z: number, radius: number): boolean {
  return x > b.minX - radius && x < b.maxX + radius && z > b.minZ - radius && z < b.maxZ + radius;
}

/**
 * Bodenhöhe unter dem Spieler: höchste Oberkante einer Box im Fußabdruck, die
 * noch als Stufe erreichbar ist (≤ Fußhöhe + step). Sonst Hallenboden (0).
 * So werden Paletten, Kisten, Treppenstufen, Laufstege und Regaldächer begehbar.
 */
export function groundHeight(x: number, z: number, feetY: number, solids: SolidBox[], radius: number = PLAYER.radius, step: number = PLAYER.step): number {
  let ground = 0;
  for (const b of solids) {
    if (b.maxY <= ground) continue;
    if (b.maxY > feetY + step) continue;
    // Fußabdruck leicht enger als der Kollisionsradius, damit man an Kanten nicht „in der Luft“ steht
    if (!overlapsXz(b, x, z, radius * 0.6)) continue;
    ground = b.maxY;
  }
  return ground;
}

/**
 * Blockiert die Box die horizontale Bewegung eines Spielers mit dieser Fußhöhe?
 * Nicht blockierend: Stufen (Oberkante ≤ Fuß + step) und Objekte über dem Kopf.
 */
export function blocksAt(b: SolidBox, feetY: number, height: number = PLAYER.height, step: number = PLAYER.step): boolean {
  return b.maxY > feetY + step && b.minY < feetY + height;
}

/**
 * Löst die horizontale Position gegen alle soliden Boxen auf (XZ, Radius).
 * Wird je Achse getrennt aufgerufen (x vor z), damit man an Kanten entlanggleitet.
 * Port von resolveCollisions aus ias.warehouse-map (WalkControls), erweitert um
 * die Fußhöhe (Stufen/Unterquerungen blockieren nicht).
 */
export function resolveAxis(pos: { x: number; z: number }, solids: SolidBox[], radius: number, feetY = 0): void {
  for (const b of solids) {
    if (!blocksAt(b, feetY)) continue;
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
 * Wendet Vertikalgeschwindigkeit + Boden-/Stufenlogik und horizontale Verschiebung an.
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

  const feet0 = m.y - eye;

  // --- Horizontal (achsengetrennt kollidieren, auf aktueller Fußhöhe) ---
  let x = m.x + moveX * dt;
  const px = { x, z: m.z };
  resolveAxis(px, solids, radius, feet0);
  x = px.x;
  const pz = { x, z: m.z + moveZ * dt };
  resolveAxis(pz, solids, radius, feet0);
  // Erneut kollidieren, falls beide Achsen sich gegenseitig beeinflussen
  resolveAxis(pz, solids, radius, feet0);
  x = pz.x;
  const z = pz.z;

  // --- Vertikal ---
  let vy = m.grounded && jump ? jumpSpeed : m.vy - gravity * dt;
  let feet = feet0 + vy * dt;
  let grounded = false;
  // Boden unter der neuen Position (Stufen: nur aufwärts bis step, sonst fallen)
  const ground = groundHeight(x, z, Math.max(feet0, feet), solids, radius);
  if (feet <= ground && vy <= 0) {
    feet = ground;
    vy = 0;
    grounded = true;
  } else if (m.grounded && !jump && feet0 >= ground - 1e-6 && ground >= feet0 - PLAYER.step && feet < ground) {
    // Sanft auf die Stufe/den Boden setzen (kein Fallen beim Gehen über kleine Höhenunterschiede)
    feet = ground;
    vy = 0;
    grounded = true;
  }
  // Nur beim Gehen am Boden Stufen hochziehen; in der Luft zählt die echte Bahn
  if (m.grounded && !jump && ground > feet && ground <= feet0 + PLAYER.step) {
    feet = ground;
    vy = 0;
    grounded = true;
  }

  return { x, y: feet + eye, z, vy, grounded };
}

/** Prüft, ob ein Punkt (XZ) frei von soliden Boxen ist (Spieler-Spawn etc.). */
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
