import type { SolidBox } from './level';
import { Collider, colliderFor } from './collision';

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

/** Kollisionswelt: Collider (Karten mit Rampen/Raster) oder schlichte Quaderliste (Tests, Altformat). */
export type MoveWorld = Collider | readonly SolidBox[];

export function asCollider(world: MoveWorld): Collider {
  return world instanceof Collider ? world : colliderFor(world);
}

/**
 * Bodenhöhe unter dem Spieler: höchste Oberkante (Quader oder Rampe) im Fußabdruck, die
 * noch als Stufe erreichbar ist (≤ Fußhöhe + step). Sonst der implizite Boden des Colliders.
 * So werden Paletten, Kisten, Treppen, Rampen, Laufstege und Plattformen begehbar.
 */
export function groundHeight(x: number, z: number, feetY: number, world: MoveWorld, radius: number = PLAYER.radius, step: number = PLAYER.step): number {
  return asCollider(world).groundHeight(x, z, feetY, radius, step);
}

/**
 * Blockiert die Box die horizontale Bewegung eines Spielers mit dieser Fußhöhe?
 * Nicht blockierend: Stufen (Oberkante ≤ Fuß + step) und Objekte über dem Kopf.
 */
export function blocksAt(b: SolidBox, feetY: number, height: number = PLAYER.height, step: number = PLAYER.step): boolean {
  return b.maxY > feetY + step && b.minY < feetY + height;
}

/**
 * Löst die horizontale Position gegen alle blockierenden Elemente auf (XZ, Radius).
 * Wird je Achse getrennt aufgerufen (x vor z), damit man an Kanten entlanggleitet.
 * Rampen blockieren nur mit dem Teil, der höher als Fuß + Stufe liegt.
 */
export function resolveAxis(pos: { x: number; z: number }, world: MoveWorld, radius: number, feetY = 0, height: number = PLAYER.height): void {
  asCollider(world).resolve(pos, radius, feetY, height, PLAYER.step);
}

/**
 * Ein Bewegungs-Schritt (reine Logik, kein three).
 * Wendet Vertikalgeschwindigkeit, Kopf-Kollision, Boden-/Stufen-/Rampenlogik und
 * horizontale Verschiebung an. Liefert den neuen Zustand; verändert nichts extern.
 * Rampen: Bodenhöhe folgt der Schräge (bergab „klebt“ man am Boden, kein Hüpfen),
 * Rampen steiler als 40° wirken wie Wände; von Kanten fällt man herunter.
 */
export function stepPlayer(
  m: PlayerMotion,
  moveX: number,
  moveZ: number,
  jump: boolean,
  dt: number,
  world: MoveWorld,
  opts: { eye?: number; radius?: number; gravity?: number; jumpSpeed?: number; height?: number } = {},
): PlayerMotion {
  const col = asCollider(world);
  const eye = opts.eye ?? PLAYER.eye;
  const radius = opts.radius ?? PLAYER.radius;
  const gravity = opts.gravity ?? PLAYER.gravity;
  const jumpSpeed = opts.jumpSpeed ?? PLAYER.jumpSpeed;
  const height = opts.height ?? PLAYER.height;
  const step = PLAYER.step;
  dt = Math.min(dt, 0.05);

  const feet0 = m.y - eye;

  // --- Horizontal (achsengetrennt kollidieren, auf aktueller Fußhöhe) ---
  const px = { x: m.x + moveX * dt, z: m.z };
  col.resolve(px, radius, feet0, height, step);
  const pz = { x: px.x, z: m.z + moveZ * dt };
  col.resolve(pz, radius, feet0, height, step);
  // Erneut kollidieren, falls beide Achsen sich gegenseitig beeinflussen
  col.resolve(pz, radius, feet0, height, step);
  const x = pz.x;
  const z = pz.z;

  // --- Vertikal ---
  let vy = m.grounded && jump ? jumpSpeed : m.vy - gravity * dt;
  let feet = feet0 + vy * dt;
  let grounded = false;
  // Kopf: beim Aufsteigen unter Decken/Laufstegen stoppen
  if (vy > 0) {
    const ceil = col.ceilingAbove(x, z, feet0, radius);
    if (feet + height > ceil) {
      feet = Math.max(feet0, ceil - height);
      vy = 0;
    }
  }
  // Boden unter der neuen Position (Stufen: nur aufwärts bis step, sonst fallen)
  const ground = col.groundHeight(x, z, Math.max(feet0, feet), radius, step);
  if (feet <= ground && vy <= 0) {
    feet = ground;
    vy = 0;
    grounded = true;
  } else if (m.grounded && !jump && vy <= 0 && ground >= feet0 - step && ground <= feet0 + 1e-6) {
    // Am Boden bleiben: kleine Absätze und Rampen bergab ohne Fallen/Hüpfen
    feet = ground;
    vy = 0;
    grounded = true;
  }
  // Nur beim Gehen am Boden Stufen hochziehen; in der Luft zählt die echte Bahn
  if (m.grounded && !jump && ground > feet && ground <= feet0 + step) {
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
