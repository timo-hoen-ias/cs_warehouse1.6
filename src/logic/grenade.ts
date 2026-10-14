import { castParts, rayIntersectAabb, type Aabb, type PartBox, type Vec3 } from './hitbox';
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

/**
 * Ein Simulationsschritt. Bewegt die Granate, prallt an Solids/Boden ab und
 * zählt den Zünder herunter. Liefert true, sobald die Granate in diesem Schritt zündet.
 */
export function stepGrenade(g: GrenadeState, dt: number, solids: Aabb[]): boolean {
  if (g.detonated) return false;
  dt = Math.min(dt, 0.05);
  g.fuse -= dt;

  if (!g.resting) {
    g.vel.y -= GRENADE.gravity * dt;
    // Achsengetrennt bewegen und je Achse abprallen (robust gegen Ecken)
    moveAxis(g, 'x', g.vel.x * dt, solids);
    moveAxis(g, 'y', g.vel.y * dt, solids);
    moveAxis(g, 'z', g.vel.z * dt, solids);

    // Boden
    if (g.pos.y <= GRENADE.radius) {
      g.pos.y = GRENADE.radius;
      if (g.vel.y < 0) {
        g.vel.y = -g.vel.y * GRENADE.restitution;
        g.bounces += 1;
        if (Math.abs(g.vel.y) < 1.2) g.vel.y = 0;
      }
      // Rollreibung
      const f = Math.max(0, 1 - GRENADE.friction * dt);
      g.vel.x *= f;
      g.vel.z *= f;
      if (g.vel.y === 0 && Math.hypot(g.vel.x, g.vel.z) < 0.15) {
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

function moveAxis(g: GrenadeState, axis: 'x' | 'y' | 'z', delta: number, solids: Aabb[]): void {
  if (delta === 0) return;
  const next = g.pos[axis] + delta;
  const r = GRENADE.radius;
  const p = { ...g.pos, [axis]: next } as Vec3;
  for (const b of solids) {
    if (p.x + r <= b.minX || p.x - r >= b.maxX || p.y + r <= b.minY || p.y - r >= b.maxY || p.z + r <= b.minZ || p.z - r >= b.maxZ) continue;
    // Kollision auf dieser Achse: an die Fläche setzen, Geschwindigkeit spiegeln
    const lo = axis === 'x' ? b.minX : axis === 'y' ? b.minY : b.minZ;
    const hi = axis === 'x' ? b.maxX : axis === 'y' ? b.maxY : b.maxZ;
    p[axis] = delta > 0 ? lo - r : hi + r;
    g.vel[axis] = -g.vel[axis] * GRENADE.restitution;
    // Querreibung an der Wand
    for (const other of ['x', 'y', 'z'] as const) if (other !== axis) g.vel[other] *= 0.8;
    g.bounces += 1;
    break;
  }
  g.pos[axis] = p[axis];
}

/** Freie Sichtlinie zwischen zwei Punkten (keine Solid-Box dazwischen)? */
export function lineOfSight(a: Vec3, b: Vec3, solids: Aabb[]): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  for (const box of solids) {
    const t = rayIntersectAabb(a, dir, box);
    if (t !== null && t > 0.01 && t < dist) return false;
  }
  return true;
}

/**
 * HE-Schaden auf ein Ziel: linearer Abfall bis zum Radius, 0 ohne Sichtlinie
 * (Explosion hinter Regal/Wand). Zielpunkt = Körpermitte.
 */
export function heDamageAt(center: Vec3, target: Vec3, solids: Aabb[], radius = GRENADE.heRadius, max = GRENADE.heDamage): number {
  const d = Math.hypot(target.x - center.x, target.y - center.y, target.z - center.z);
  if (d >= radius) return 0;
  if (!lineOfSight(center, target, solids)) return 0;
  return Math.round(max * (1 - d / radius));
}

/**
 * Blend-Stärke 0..1 für einen Betrachter: Entfernung (bis flashRadius), Sichtlinie
 * und Blickwinkel (direkt hinsehen = 1, Rücken = 0.15 Restblendung).
 */
export function flashStrength(viewerEye: Vec3, viewDir: Vec3, flashPos: Vec3, solids: Aabb[]): number {
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

/** Sichtlinie inkl. Rauch: frei von Solids UND nicht durch Rauch. */
export function canSee(a: Vec3, b: Vec3, solids: PartBox[], smokes: Smoke[]): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > 1e-6) {
    const hit = castParts(a, { x: dx / dist, y: dy / dist, z: dz / dist }, solids);
    if (hit && hit.dist < dist) return false;
  }
  return !segmentHitsSmoke(a, b, smokes);
}
