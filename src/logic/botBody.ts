import type { Intent } from './botBrain';
import type { Collider } from './collision';
import type { Pose } from './match';
import { PLAYER, stepPlayer, type PlayerMotion } from './move';
import { findPath, nearestNode, type NavGraph, type XYZ } from './nav';

/**
 * Körper eines Bots (pure): setzt die Absicht des Gehirns in Bewegung um —
 * Wegplanung über die Navigation abschnittsweise entlang der Routen-Wegpunkte,
 * Tempo (Rennen/Gehen/Schleichen/Ducken), Strafen im Kampf (nur auf begehbarem
 * Boden), Abstand zu Teamkameraden (kein Gänsemarsch, kein Stapeln),
 * Festfahr-Erkennung mit Neuplanung und weiches Drehen (im Kampf schneller).
 * Bewegung läuft über dieselbe Physik wie Spieler (`stepPlayer`).
 */
export const BODY = {
  run: PLAYER.sprintSpeed * 0.96,
  walk: PLAYER.walkSpeed,
  /** Schleichen: unter der Hörschwelle der Schritte (STEP.minSpeed 2.6). */
  sneak: 2.4,
  crouch: PLAYER.crouchSpeed,
  /** Drehrate (rad/s): ruhig bzw. im Kampf (+ Skill-Anteil). */
  turnCalm: 3.2,
  turnSnap: 5,
  turnSnapSkill: 9,
  /** Neu planen frühestens nach (s). */
  repath: 0.6,
  /** Wegpunkt erreicht (m). */
  waypoint: 0.55,
  /** Routen-Wegpunkt (Portal) erreicht (m). */
  viaReach: 2.6,
  /** Abstand zu Kameraden in Laufrichtung (m) und Abstoßen bei Berührung. */
  spacing: 3,
  separate: 1.1,
  /** Festgefahren: weniger als 0.35 m in so vielen Sekunden. */
  stuck: 1.2,
} as const;

export type BodyEnv = { col: Collider; nav: NavGraph; now: number; skill: number; mates: readonly XYZ[] };

/**
 * Restliche Wegpunkte: bereits abgehakte entfallen, ebenso solche, an denen der Bot
 * offensichtlich schon vorbei ist (zum nächsten Wegpunkt näher als dieser selbst).
 */
export function remainingVia(via: readonly XYZ[], done: number, at: XYZ): XYZ[] {
  let i = Math.min(done, via.length);
  while (i < via.length - 1) {
    const a = via[i]!;
    const b = via[i + 1]!;
    const dAB = Math.hypot(b.x - a.x, b.z - a.z);
    const dPB = Math.hypot(b.x - at.x, b.z - at.z);
    if (dPB < dAB - 1 && Math.abs(at.y - a.y) < 3) i++;
    else break;
  }
  return via.slice(i).map((p) => ({ ...p }));
}

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class BotBody {
  motion: PlayerMotion;
  pose: Pose;
  crouch = false;
  /** Horizontale Geschwindigkeit (m/s) im letzten Schritt. */
  speed = 0;
  /** Sekunden ohne Bewegung (Gegenlenken, Genauigkeit). */
  stillFor = 0;
  /** Summe der Zeit, in der der Bot laufen wollte, aber festsaß (Statistik). */
  stuckTotal = 0;
  /** Längste zusammenhängende Festsitz-Zeit (Statistik). */
  stuckMax = 0;
  path: XYZ[] = [];
  pathAt = 0;
  private via: XYZ[] = [];
  /** Herkunft der Wegpunkte (Auftrag) und bereits abgehakte Anzahl je Liste. */
  private viaSrc: XYZ[] | null = null;
  private viaDone = new WeakMap<XYZ[], number>();
  private goal: XYZ | null = null;
  private planKey = '';
  private repathAt = 0;
  private stuckT = 0;
  private stuckRef = { x: 0, z: 0 };
  private stuckRun = 0;
  private unstick: { x: number; z: number; until: number } | null = null;

  constructor(pose: Pose) {
    this.pose = { ...pose };
    this.motion = { x: pose.x, y: pose.y + PLAYER.eye, z: pose.z, vy: 0, grounded: true };
    this.stuckRef = { x: pose.x, z: pose.z };
  }

  /** Neu aufsetzen (Spawn). */
  reset(pose: Pose): void {
    this.pose = { ...pose };
    this.motion = { x: pose.x, y: pose.y + PLAYER.eye, z: pose.z, vy: 0, grounded: true };
    this.path = [];
    this.pathAt = 0;
    this.via = [];
    this.goal = null;
    this.planKey = '';
    this.crouch = false;
    this.speed = 0;
    this.stillFor = 0;
    this.stuckT = 0;
    this.stuckRun = 0;
    this.stuckMax = 0;
    this.stuckTotal = 0;
    this.unstick = null;
    this.stuckRef = { x: pose.x, z: pose.z };
  }

  get feet(): XYZ {
    return { x: this.pose.x, y: this.pose.y, z: this.pose.z };
  }

  get eye(): XYZ {
    return { x: this.pose.x, y: this.pose.y + (this.crouch ? PLAYER.crouchEye : PLAYER.eye), z: this.pose.z };
  }

  /** Nächster Wegpunkt (für den Blick in Laufrichtung). */
  get ahead(): XYZ | null {
    return this.path[Math.min(this.pathAt + 1, this.path.length - 1)] ?? this.path[this.pathAt] ?? null;
  }

  step(it: Intent, dt: number, env: BodyEnv): void {
    this.crouch = it.crouch;
    let vx = 0;
    let vz = 0;
    const want = it.speed === 'stop' ? 0 : it.speed === 'sneak' ? BODY.sneak : it.speed === 'walk' ? BODY.walk : BODY.run;
    const speed = this.crouch ? Math.min(want, BODY.crouch) : want;
    let wantsMove = false;
    if (speed > 0 && it.strafe) {
      const nx = this.pose.x + it.strafe.x * 0.7;
      const nz = this.pose.z + it.strafe.z * 0.7;
      const n = nearestNode(env.nav, nx, this.pose.y, nz, 0.9);
      if (n >= 0 && Math.abs(env.nav.y[n]! - this.pose.y) < 0.6) {
        vx = it.strafe.x * speed;
        vz = it.strafe.z * speed;
      }
    } else if (speed > 0 && it.goal) {
      const dir = this.follow(it, env);
      if (dir) {
        vx = dir.x * speed;
        vz = dir.z * speed;
        wantsMove = true;
      }
    }
    // Festgefahren: kurz seitlich ausweichen
    if (this.unstick && env.now < this.unstick.until && wantsMove) {
      vx = this.unstick.x * BODY.walk;
      vz = this.unstick.z * BODY.walk;
    } else this.unstick = null;
    // Abstand zu Kameraden: nicht auflaufen, bei Berührung auseinander
    if (vx || vz) {
      const l = Math.hypot(vx, vz);
      let slow = 1;
      for (const m of env.mates) {
        const dx = m.x - this.pose.x;
        const dz = m.z - this.pose.z;
        if (Math.abs(m.y - this.pose.y) > 1.5) continue;
        const d = Math.hypot(dx, dz);
        if (d < 0.05 || d > BODY.spacing) continue;
        const ahead = (dx * vx + dz * vz) / (d * l);
        if (ahead > 0.6 && d < BODY.spacing) slow = Math.min(slow, Math.max(0.3, (d - 0.8) / (BODY.spacing - 0.8)));
        if (d < BODY.separate) {
          vx -= (dx / d) * 1.6;
          vz -= (dz / d) * 1.6;
        }
      }
      vx *= slow;
      vz *= slow;
    }
    const before = { x: this.pose.x, z: this.pose.z };
    this.motion = stepPlayer(this.motion, vx, vz, false, dt, env.col);
    this.pose.x = this.motion.x;
    this.pose.y = this.motion.y - PLAYER.eye;
    this.pose.z = this.motion.z;
    const moved = Math.hypot(this.pose.x - before.x, this.pose.z - before.z);
    this.speed = dt > 0 ? moved / dt : 0;
    this.stillFor = this.speed < 0.3 ? this.stillFor + dt : 0;
    this.trackStuck(wantsMove, dt, env);
    this.turn(it, dt, env.skill, vx, vz);
  }

  /** Richtung (XZ, normiert) zum nächsten Wegpunkt; plant bei Bedarf neu. */
  private follow(it: Intent, env: BodyEnv): { x: number; z: number } | null {
    const goal = it.goal!;
    const key = `${it.plan}|${goal.x.toFixed(0)},${goal.y.toFixed(0)},${goal.z.toFixed(0)}`;
    if (key !== this.planKey) {
      const moved = !this.goal || Math.hypot(this.goal.x - goal.x, this.goal.z - goal.z) > 2 || Math.abs(this.goal.y - goal.y) > 1.5;
      const replan = it.plan !== Number(this.planKey.split('|')[0]) || moved;
      this.planKey = key;
      if (replan) {
        this.viaSrc = it.via;
        this.via = remainingVia(it.via, this.viaDone.get(it.via) ?? 0, this.feet);
        this.goal = { ...goal };
        this.path = [];
        this.pathAt = 0;
        this.repathAt = 0;
      }
    }
    // Erreichte Routen-Wegpunkte abhaken (Fortschritt je Wegpunktliste merken)
    while (this.via.length) {
      const v = this.via[0]!;
      if (Math.hypot(v.x - this.pose.x, v.z - this.pose.z) < BODY.viaReach && Math.abs(v.y - this.pose.y) < 2) {
        this.via.shift();
        this.path = [];
        if (this.viaSrc) this.viaDone.set(this.viaSrc, this.viaSrc.length - this.via.length);
      } else break;
    }
    const sub = this.via[0] ?? this.goal!;
    const dSub = Math.hypot(sub.x - this.pose.x, sub.z - this.pose.z);
    // Ziel von einem Kameraden besetzt → daneben stehen bleiben statt zu drängeln
    const occupied = dSub < 2.4 && env.mates.some((m) => Math.hypot(m.x - sub.x, m.z - sub.z) < 0.9 && Math.abs(m.y - sub.y) < 1.2);
    const atGoal = !this.via.length && (dSub < 0.35 || occupied) && Math.abs(sub.y - this.pose.y) < 1.3;
    if (atGoal) {
      this.path = [];
      return null;
    }
    if ((!this.path.length || this.pathAt >= this.path.length) && env.now >= this.repathAt) {
      const res = findPath(env.nav, env.col, this.feet, sub, { avoid: it.avoid });
      this.repathAt = env.now + BODY.repath;
      if (res) {
        this.path = res.points;
        this.pathAt = 0;
      } else if (this.via.length) {
        // Wegpunkt unerreichbar → überspringen
        this.via.shift();
        if (this.viaSrc) this.viaDone.set(this.viaSrc, this.viaSrc.length - this.via.length);
        this.path = [];
        return null;
      } else this.path = [];
    }
    let wp = this.path[this.pathAt];
    while (wp && Math.hypot(wp.x - this.pose.x, wp.z - this.pose.z) < BODY.waypoint && Math.abs(wp.y - this.pose.y) < 1.4) {
      this.pathAt++;
      wp = this.path[this.pathAt];
    }
    if (!wp) {
      // Pfad zu Ende, aber Ziel nicht ganz erreicht: direkt hin (letzter Meter)
      const dx = sub.x - this.pose.x;
      const dz = sub.z - this.pose.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.35 || l > 2.5) return null;
      return { x: dx / l, z: dz / l };
    }
    const dx = wp.x - this.pose.x;
    const dz = wp.z - this.pose.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  private trackStuck(wantsMove: boolean, dt: number, env: BodyEnv): void {
    if (!wantsMove) {
      this.stuckT = 0;
      this.stuckRun = 0;
      this.stuckRef = { x: this.pose.x, z: this.pose.z };
      return;
    }
    this.stuckT += dt;
    if (Math.hypot(this.pose.x - this.stuckRef.x, this.pose.z - this.stuckRef.z) > 0.35) {
      this.stuckT = 0;
      this.stuckRun = 0;
      this.stuckRef = { x: this.pose.x, z: this.pose.z };
      return;
    }
    if (this.stuckT > BODY.stuck) {
      this.stuckTotal += this.stuckT;
      this.stuckRun += this.stuckT;
      this.stuckMax = Math.max(this.stuckMax, this.stuckRun);
      this.stuckT = 0;
      this.path = [];
      this.repathAt = 0;
      // seitlich ausweichen (deterministisch aus der Position)
      const a = (Math.floor(this.pose.x * 7 + this.pose.z * 13) % 8) * (Math.PI / 4);
      this.unstick = { x: Math.cos(a), z: Math.sin(a), until: env.now + 0.4 };
    }
  }

  private turn(it: Intent, dt: number, skill: number, vx: number, vz: number): void {
    let yaw = this.pose.yaw;
    let pitch = this.pose.pitch;
    const eye = this.eye;
    if (it.look) {
      const dx = it.look.x - eye.x;
      const dy = it.look.y - eye.y;
      const dz = it.look.z - eye.z;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1e-6);
    } else if (Math.hypot(vx, vz) > 0.5) {
      yaw = Math.atan2(-vx, -vz);
      pitch = 0;
    }
    const rate = it.snap ? BODY.turnSnap + BODY.turnSnapSkill * Math.min(1, Math.max(0, skill)) : BODY.turnCalm;
    const dyaw = wrap(yaw - this.pose.yaw);
    const step = rate * dt;
    this.pose.yaw = wrap(this.pose.yaw + Math.max(-step, Math.min(step, dyaw)));
    const dp = pitch - this.pose.pitch;
    this.pose.pitch += Math.max(-step, Math.min(step, dp));
  }

  /** Winkel (rad) zwischen Blickrichtung und Richtung zu einem Punkt. */
  aimOff(p: XYZ): number {
    const eye = this.eye;
    const dx = p.x - eye.x;
    const dy = p.y - eye.y;
    const dz = p.z - eye.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const c = Math.cos(this.pose.pitch);
    const fx = -Math.sin(this.pose.yaw) * c;
    const fy = Math.sin(this.pose.pitch);
    const fz = -Math.cos(this.pose.yaw) * c;
    return Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy + dz * fz) / l)));
  }
}
