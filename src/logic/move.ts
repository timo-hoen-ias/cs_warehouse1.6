import type { SolidBox } from './level';
import { Collider, colliderFor } from './collision';
import { landSlow } from './fall';
import { u2m } from './units';

/** Bewegungsparameter (CS-1.6-Tempo, in Meter umgerechnet: 250 u/s = 6,2 m/s). */
export const PLAYER = {
  eye: 1.65, // Augen-/Kamera-Höhe über dem Fußpunkt
  crouchEye: 1.15, // Ziel-Höhe der Kamera beim Ducken (Stand bleibt kollisionsfrei)
  radius: 0.35, // Kollisionsradius (XZ)
  height: 1.8, // Körperhöhe (Kopf) für Decken/Unterquerungen
  step: 0.55, // Stufen bis zu dieser Höhe werden ohne Sprung erklommen
  gravity: 20, // ≈ sv_gravity 800 u/s²
  jumpSpeed: 6.65, // = 268,3 u/s (CS): Sprunghöhe v²/2g ≈ 1.1 m, mit Hocksprung ≈ 1.55 m
  /** Lauftempo mit dem Messer (Referenz der Kartenlaufzeiten); mit anderen Waffen: `weaponSpeed()`. */
  runSpeed: u2m(250),
  /** Alter Name von `runSpeed` (Kartenvalidator, Bots, Karten-Übersicht). */
  sprintSpeed: u2m(250),
  /** Schleichtempo (Shift) mit dem Messer: 52 % — leise, siehe `STEP.minSpeed`. */
  walkSpeed: u2m(250) * 0.52,
  /** Tempo geduckt mit dem Messer: 34 %. */
  crouchSpeed: u2m(250) * 0.34,
} as const;

/** GoldSrc-Bewegungsmodell (sv_accelerate 5, sv_friction 4, sv_stopspeed 100, sv_airaccelerate 10). */
export const MOVE = {
  accelerate: 5,
  airAccelerate: 10,
  friction: 4,
  /** Unterhalb dieses Tempos bremst die Reibung mit konstanter Kraft (schneller Stopp). */
  stopSpeed: u2m(100),
  /** In der Luft zählt für die Beschleunigung nur dieser Anteil des Wunschtempos (Air-Strafing). */
  airWishCap: u2m(30),
  /** Bunnyhop-Grenze: über Faktor × Waffentempo wird beim Absprung gebremst … */
  bhopCap: 1.2,
  /** … und auf diesen Anteil des Tempos zurückgesetzt (CS 1.6: ×0.8). */
  bhopPenalty: 0.8,
  /** Shift = leise gehen. */
  walkFactor: 0.52,
  /** Ctrl = ducken. */
  crouchFactor: 0.34,
  /** Beine anziehen im Hocksprung (18 u): zusätzliche Reichweite nach oben. */
  tuck: u2m(18),
  /** Stufenhöhe in der Luft (am Boden `PLAYER.step`): Landen auf Kanten nur wenn der Fuß fast oben ist. */
  airStep: 0.25,
  /** Teilschritt der Simulation (s). */
  sub: 1 / 60,
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
  opts: { eye?: number; radius?: number; gravity?: number; jumpSpeed?: number; height?: number; airStep?: number; lift?: number } = {},
): PlayerMotion {
  // Große Zeitschritte (niedrige Bildrate) in Teilschritte zerlegen statt zu kappen → Tempo bleibt echt
  if (dt > 0.05) {
    const n = Math.min(8, Math.ceil(dt / 0.05));
    let s = m;
    for (let i = 0; i < n; i++) s = stepPlayer(s, moveX, moveZ, jump && i === 0, dt / n, world, opts);
    return s;
  }
  const col = asCollider(world);
  const eye = opts.eye ?? PLAYER.eye;
  const radius = opts.radius ?? PLAYER.radius;
  const gravity = opts.gravity ?? PLAYER.gravity;
  const jumpSpeed = opts.jumpSpeed ?? PLAYER.jumpSpeed;
  const height = opts.height ?? PLAYER.height;
  const step = PLAYER.step;

  const feet0 = m.y - eye;
  // In der Luft: kleinere Stufenhöhe (echte Sprunghöhe zählt) und optional angezogene Beine (Hocksprung)
  const air = !m.grounded;
  const stepH = air ? (opts.airStep ?? step) : step;
  const lift = air ? (opts.lift ?? 0) : 0;
  const feetC = feet0 + lift;

  // --- Horizontal (achsengetrennt kollidieren, auf aktueller Fußhöhe) ---
  const px = { x: m.x + moveX * dt, z: m.z };
  col.resolve(px, radius, feetC, height, stepH);
  const pz = { x: px.x, z: m.z + moveZ * dt };
  col.resolve(pz, radius, feetC, height, stepH);
  // Erneut kollidieren, falls beide Achsen sich gegenseitig beeinflussen
  col.resolve(pz, radius, feetC, height, stepH);
  const x = pz.x;
  const z = pz.z;

  // --- Vertikal ---
  let vy = m.grounded && jump ? jumpSpeed : m.vy - gravity * dt;
  let feet = feet0 + vy * dt;
  let grounded = false;
  // Kopf: beim Aufsteigen unter Decken/Laufstegen stoppen
  if (vy > 0) {
    const ceil = col.ceilingAbove(x, z, feetC, radius);
    if (feet + lift + height > ceil) {
      feet = Math.max(feet0, ceil - height - lift);
      vy = 0;
    }
  }
  // Boden unter der neuen Position (Stufen: nur aufwärts bis step, sonst fallen)
  const ground = col.groundHeight(x, z, Math.max(feet0, feet) + lift, radius, stepH);
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

// ----------------------------------------------------------------------------- GoldSrc-Bewegung

/** Körperzustand mit Horizontalgeschwindigkeit (Boden-Reibung, Beschleunigung, Luftsteuerung). */
export type Body = PlayerMotion & {
  /** Horizontalgeschwindigkeit (m/s). */
  vx: number;
  vz: number;
  /** Sprungtaste war im letzten Schritt gedrückt (neuer Sprung erst nach Loslassen → kein Dauer-Bunnyhop). */
  jumpHeld: boolean;
};

export function newBody(x: number, feetY: number, z: number): Body {
  return { x, y: feetY + PLAYER.eye, z, vy: 0, grounded: true, vx: 0, vz: 0, jumpHeld: false };
}

/** Eingabe eines Bewegungs-Schritts. */
export type BodyInput = {
  /** Wunschrichtung (Welt, XZ); Länge ≤ 1 (0 = keine Taste). */
  wishX: number;
  wishZ: number;
  /** Lauftempo mit der gehaltenen Waffe (m/s), siehe `weaponSpeed()`. */
  run: number;
  /** Shift gehalten: leise gehen (52 %). */
  walk: boolean;
  /** Ctrl gehalten bzw. geduckt (34 %; in der Luft: Beine anziehen). */
  crouch: boolean;
  jump: boolean;
};

export type BodyResult = {
  body: Body;
  /** In diesem Schritt abgesprungen. */
  jumped: boolean;
  /** Aufprallgeschwindigkeit (m/s) bei einer Landung in diesem Schritt, sonst 0. */
  landSpeed: number;
};

/** Höchsttempo (m/s) am Boden: Waffentempo × Haltung (Ducken schlägt Gehen). */
export function topSpeed(run: number, walk: boolean, crouch: boolean): number {
  return run * (crouch ? MOVE.crouchFactor : walk ? MOVE.walkFactor : 1);
}

/** Horizontaltempo (m/s). */
export function speedXZ(b: { vx: number; vz: number }): number {
  return Math.hypot(b.vx, b.vz);
}

/** Wunschrichtung (Länge 0 oder 1) aus Tasten + Yaw. */
export function wishDir(keys: Omit<MoveKeys, 'sprint'>, yaw: number): { x: number; z: number } {
  const v = wishSpeed({ ...keys, sprint: false }, yaw, 1, 1);
  return v;
}

/** Bodenreibung (GoldSrc PM_Friction): konstante Bremskraft unter `stopSpeed`, darüber proportional. */
export function applyFriction(vx: number, vz: number, dt: number): { vx: number; vz: number } {
  const speed = Math.hypot(vx, vz);
  if (speed < 0.002) return { vx: 0, vz: 0 };
  const control = Math.max(speed, MOVE.stopSpeed);
  const next = Math.max(0, speed - control * MOVE.friction * dt);
  const k = next / speed;
  return { vx: vx * k, vz: vz * k };
}

/**
 * Beschleunigung in Wunschrichtung (GoldSrc PM_Accelerate / PM_AirAccelerate).
 * `wishSpeed` = Zieltempo (Haltung eingerechnet), `ref` = Basistempo der Waffe: Die Beschleunigung
 * richtet sich nach `ref`, damit Schleichen/Ducken (langsames Ziel) nicht von der Reibung erstickt werden.
 */
export function accelerate(vx: number, vz: number, dirX: number, dirZ: number, wishSpeed: number, ref: number, air: boolean, dt: number): { vx: number; vz: number } {
  if (wishSpeed <= 0) return { vx, vz };
  const target = air ? Math.min(wishSpeed, MOVE.airWishCap) : wishSpeed;
  const add = target - (vx * dirX + vz * dirZ);
  if (add <= 0) return { vx, vz };
  const acc = Math.min((air ? MOVE.airAccelerate : MOVE.accelerate) * Math.max(ref, wishSpeed) * dt, add);
  return { vx: vx + dirX * acc, vz: vz + dirZ * acc };
}

/** Bunnyhop-Bremse beim Absprung (CS 1.6 PM_PreventMegaBunnyJumping). */
export function bhopLimit(vx: number, vz: number, run: number): { vx: number; vz: number } {
  const cap = MOVE.bhopCap * run;
  const spd = Math.hypot(vx, vz);
  if (cap <= 0 || spd <= cap) return { vx, vz };
  const k = (cap / spd) * MOVE.bhopPenalty;
  return { vx: vx * k, vz: vz * k };
}

/**
 * Ein Bewegungs-Schritt im GoldSrc-Stil (rein, kein three): Reibung am Boden, Beschleunigung
 * zum Wunschtempo, Air-Strafing in der Luft, Absprung mit Bunnyhop-Bremse, Hocksprung (Beine
 * anziehen), Wand-Gleiten (Tempo in der Wand geht verloren) und Landung (Tempoverlust, Aufprall).
 * Kollision/Boden/Rampen übernimmt `stepPlayer`; große Zeitschritte werden in 1/60 s zerlegt.
 */
export function stepBody(b: Body, input: BodyInput, dt: number, world: MoveWorld, opts: { height?: number } = {}): BodyResult {
  if (dt <= 0) return { body: b, jumped: false, landSpeed: 0 };
  const n = Math.min(10, Math.max(1, Math.ceil(dt / MOVE.sub - 1e-9)));
  const h = dt / n;
  const mag = Math.min(1, Math.hypot(input.wishX, input.wishZ));
  const len = Math.hypot(input.wishX, input.wishZ);
  const dirX = len > 0 ? input.wishX / len : 0;
  const dirZ = len > 0 ? input.wishZ / len : 0;
  const wish = topSpeed(input.run, input.walk, input.crouch) * mag;
  let cur = b;
  let jumped = false;
  let landSpeed = 0;
  for (let i = 0; i < n; i++) {
    let { vx, vz } = cur;
    const wasGrounded = cur.grounded;
    const jumpNow = wasGrounded && input.jump && !cur.jumpHeld;
    if (jumpNow) {
      ({ vx, vz } = bhopLimit(vx, vz, input.run));
      jumped = true;
    } else if (wasGrounded) {
      ({ vx, vz } = applyFriction(vx, vz, h));
    }
    ({ vx, vz } = accelerate(vx, vz, dirX, dirZ, wish, input.run, !wasGrounded || jumpNow, h));

    const next = stepPlayer(cur, vx, vz, jumpNow, h, world, { height: opts.height, airStep: MOVE.airStep, lift: input.crouch ? MOVE.tuck : 0 });

    // Tatsächlich zurückgelegter Weg: blockierte Achsen verlieren ihr Tempo (Gleiten an Wänden)
    const ax = (next.x - cur.x) / h;
    const az = (next.z - cur.z) / h;
    if (Math.abs(ax) < Math.abs(vx) - 1e-3) vx = ax;
    if (Math.abs(az) < Math.abs(vz) - 1e-3) vz = az;

    if (!wasGrounded && next.grounded) {
      const impact = Math.max(0, -(cur.vy - PLAYER.gravity * h));
      landSpeed = Math.max(landSpeed, impact);
      const k = landSlow(impact);
      vx *= k;
      vz *= k;
    }
    cur = { ...next, vx, vz, jumpHeld: input.jump };
  }
  return { body: cur, jumped, landSpeed };
}
