import { castBlockers, isRayCaster, type Blockers, type Vec3 } from './hitbox';
import type { GrenadeKind } from './weapons';

/**
 * Granaten-Logik (pure, kein Physik-Framework): ballistischer Flug mit
 * Abprall an achsenparallelen Boxen (Level-Solids + Boden), Zünder, dann
 * Wirkung: HE-Radialschaden mit Sichtlinie, Blend-Stärke, Rauchwolke.
 */
export type GrenadeState = {
  kind: GrenadeKind;
  pos: Vec3;
  vel: Vec3;
  /** Restzeit bis zur Wirkung (s). */
  fuse: number;
  /** true, wenn die Granate am Boden liegt. */
  resting: boolean;
  /** Zahl der Abpraller (Debug/Sound). */
  bounces: number;
  /** Wer hat geworfen (Schadenszuordnung). */
  owner: string;
  /** Wirkung ausgelöst? */
  detonated: boolean;
};

export const GRENADE = {
  gravity: 14,
  /** Abwurfgeschwindigkeit (m/s) beim vollen Wurf. */
  throwSpeed: 15,
  /** Radius der Kugel für die Kollision (m). */
  radius: 0.08,
  /** Energieerhalt beim Abprall (0..1). */
  restitution: 0.4,
  /** Reibung beim Rollen/Abprall (Anteil je Sekunde). */
  friction: 2.5,
  /** Zünderzeiten je Art. */
  fuse: { he: 2.2, flash: 1.8, smoke: 2.0 } as Record<GrenadeKind, number>,
  /** HE: Radius (m) und max. Schaden; Schaden fällt linear bis zum Rand ab. */
  heRadius: 9,
  heDamage: 98,
  /** Rauch: Radius (m) und Dauer (s). */
  smokeRadius: 3.5,
  smokeDuration: 18,
  /** Blend: Radius (m), volle Dauer (s) bei direktem Blick. */
  flashRadius: 25,
  flashDuration: 3.5,
} as const;

/** Granate aus Augenpunkt in Blickrichtung werfen (strength 0..1 — Links voll, Rechts halb). */
export function throwGrenade(kind: GrenadeKind, eye: Vec3, dir: Vec3, owner: string, strength = 1): GrenadeState {
  const speed = GRENADE.throwSpeed * Math.max(0.25, Math.min(1, strength));
  // Leicht nach oben werfen, damit flache Würfe nicht sofort am Boden liegen
  const lift = 0.12;
  const vx = dir.x * speed;
  const vy = (dir.y + lift) * speed;
  const vz = dir.z * speed;
  return {
    kind,
    pos: { x: eye.x + dir.x * 0.4, y: eye.y - 0.1 + dir.y * 0.4, z: eye.z + dir.z * 0.4 },
    vel: { x: vx, y: vy, z: vz },
    fuse: GRENADE.fuse[kind],
    resting: false,
    bounces: 0,
    owner,
    detonated: false,
  };
}

/** Strahl gegen Hindernisse; Quaderlisten (Altformat) haben zusätzlich den Hallenboden y = 0. */
function castWorld(solids: Blockers, o: Vec3, d: Vec3, maxT: number): { t: number; normal: Vec3 } | null {
  let hit = castBlockers(solids, o, d, maxT);
  if (!isRayCaster(solids) && d.y < -1e-9 && o.y >= 0) {
    const t = -o.y / d.y;
    if (t <= maxT && (!hit || t < hit.t)) hit = { t, normal: { x: 0, y: 1, z: 0 } };
  }
  return hit;
}

/**
 * Ein Simulationsschritt. Bewegt die Granate (Strahl entlang der Bahn), prallt an
 * Wänden, Böden und Rampen entlang der getroffenen Flächennormale ab, rollt auf
 * Böden aus und zählt den Zünder herunter. Liefert true, sobald die Granate zündet.
 */
export function stepGrenade(g: GrenadeState, dt: number, solids: Blockers): boolean {
  if (g.detonated) return false;
  dt = Math.min(dt, 0.05);
  g.fuse -= dt;

  if (!g.resting) {
    g.vel.y -= GRENADE.gravity * dt;
    const r = GRENADE.radius;
    let remaining = dt;
    let onGround = false;
    for (let iter = 0; iter < 3 && remaining > 1e-6; iter++) {
      const speed = Math.hypot(g.vel.x, g.vel.y, g.vel.z);
      if (speed < 1e-6) break;
      const dir = { x: g.vel.x / speed, y: g.vel.y / speed, z: g.vel.z / speed };
      const dist = speed * remaining;
      const hit = castWorld(solids, g.pos, dir, dist + r);
      if (!hit) {
        g.pos.x += g.vel.x * remaining;
        g.pos.y += g.vel.y * remaining;
        g.pos.z += g.vel.z * remaining;
        break;
      }
      const n = hit.normal;
      // An die Kontaktstelle setzen (Radius Abstand zur Fläche)
      g.pos = { x: g.pos.x + dir.x * hit.t + n.x * r, y: g.pos.y + dir.y * hit.t + n.y * r, z: g.pos.z + dir.z * hit.t + n.z * r };
      remaining *= Math.max(0, 1 - hit.t / Math.max(dist, 1e-6));
      const vn = g.vel.x * n.x + g.vel.y * n.y + g.vel.z * n.z;
      if (vn >= 0) continue;
      const vt = { x: g.vel.x - vn * n.x, y: g.vel.y - vn * n.y, z: g.vel.z - vn * n.z };
      const ground = n.y > 0.6;
      if (ground) onGround = true;
      if (ground && -vn < 1.2) {
        // Aufliegen: Normalanteil weg, nur noch rollen
        g.vel = vt;
      } else {
        // Abprall: Normalanteil gespiegelt + gedämpft, Querreibung
        g.vel = { x: vt.x * 0.8 - vn * n.x * GRENADE.restitution, y: vt.y * 0.8 - vn * n.y * GRENADE.restitution, z: vt.z * 0.8 - vn * n.z * GRENADE.restitution };
        g.bounces += 1;
      }
    }
    if (onGround) {
      // Rollreibung
      const f = Math.max(0, 1 - GRENADE.friction * dt);
      g.vel.x *= f;
      g.vel.z *= f;
      if (Math.abs(g.vel.y) < 0.6 && Math.hypot(g.vel.x, g.vel.y, g.vel.z) < 0.15) {
        g.vel = { x: 0, y: 0, z: 0 };
        g.resting = true;
      }
    }
  }

  if (g.fuse <= 0) {
    g.detonated = true;
    return true;
  }
  return false;
}

/** Freie Sichtlinie zwischen zwei Punkten (kein Hindernis dazwischen)? */
export function lineOfSight(a: Vec3, b: Vec3, solids: Blockers): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const hit = castBlockers(solids, a, { x: dx / dist, y: dy / dist, z: dz / dist }, dist);
  return !hit || hit.t >= dist;
}

/**
 * HE-Schaden auf ein Ziel: linearer Abfall bis zum Radius, 0 ohne Sichtlinie
 * (Explosion hinter Regal/Wand). Zielpunkt = Körpermitte.
 */
export function heDamageAt(center: Vec3, target: Vec3, solids: Blockers, radius: number = GRENADE.heRadius, max: number = GRENADE.heDamage): number {
  const d = Math.hypot(target.x - center.x, target.y - center.y, target.z - center.z);
  if (d >= radius) return 0;
  if (!lineOfSight(center, target, solids)) return 0;
  return Math.round(max * (1 - d / radius));
}

/**
 * Blend-Stärke 0..1 für einen Betrachter: Entfernung (bis flashRadius), Sichtlinie
 * und Blickwinkel (direkt hinsehen = 1, Rücken = 0.15 Restblendung).
 */
export function flashStrength(viewerEye: Vec3, viewDir: Vec3, flashPos: Vec3, solids: Blockers): number {
  const dx = flashPos.x - viewerEye.x;
  const dy = flashPos.y - viewerEye.y;
  const dz = flashPos.z - viewerEye.z;
  const d = Math.hypot(dx, dy, dz);
  if (d >= GRENADE.flashRadius) return 0;
  if (!lineOfSight(viewerEye, flashPos, solids)) return 0;
  const toFlash = { x: dx / Math.max(d, 1e-6), y: dy / Math.max(d, 1e-6), z: dz / Math.max(d, 1e-6) };
  const cos = toFlash.x * viewDir.x + toFlash.y * viewDir.y + toFlash.z * viewDir.z;
  // cos 1 = direkt hinsehen → 1; cos 0 (seitlich) → 0.55; cos -1 (Rücken) → 0.15
  const angle = 0.15 + 0.85 * Math.max(0, (cos + 1) / 2) ** 1.5;
  const dist = 1 - (d / GRENADE.flashRadius) * 0.5;
  return Math.min(1, Math.max(0, angle * dist));
}

/** Aktive Rauchwolke. */
export type Smoke = { pos: Vec3; radius: number; timeLeft: number };

/** Schneidet das Segment a→b eine der Rauchkugeln? (Sicht durch Rauch blockiert) */
export function segmentHitsSmoke(a: Vec3, b: Vec3, smokes: Smoke[]): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  for (const s of smokes) {
    if (s.timeLeft <= 0) continue;
    // nächster Punkt des Segments zur Kugelmitte
    let t = 0;
    if (len2 > 1e-9) t = ((s.pos.x - a.x) * dx + (s.pos.y - a.y) * dy + (s.pos.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const pz = a.z + dz * t;
    const d2 = (px - s.pos.x) ** 2 + (py - s.pos.y) ** 2 + (pz - s.pos.z) ** 2;
    if (d2 <= s.radius * s.radius) return true;
  }
  return false;
}

/** Sichtlinie inkl. Rauch: frei von Hindernissen UND nicht durch Rauch. */
export function canSee(a: Vec3, b: Vec3, solids: Blockers, smokes: Smoke[]): boolean {
  return lineOfSight(a, b, solids) && !segmentHitsSmoke(a, b, smokes);
}
