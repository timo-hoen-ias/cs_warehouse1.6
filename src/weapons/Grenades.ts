import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import type { GrenadeKind } from '../logic/weapons';
import type { Vec3 } from '../logic/hitbox';
import { GRENADE } from '../logic/grenade';
import type { Fx } from './Fx';
import { isBounce } from '../logic/audioMix';

type NadeView = { mesh: THREE.Mesh; target: THREE.Vector3; kind: GrenadeKind; last?: Vec3; vel?: Vec3; quiet?: number };
type Cloud = { group: THREE.Group; life: number; total: number };
type Blast = { obj: THREE.Object3D; life: number; total: number; light?: THREE.PointLight };

/**
 * Granaten-Darstellung (alle Clients): fliegende Granaten (Host: Simulation,
 * Client: Snapshot-Positionen interpoliert), Explosion (HE), Blitz (Flash),
 * Rauchwolke (Smoke, ~18 s). Keine Spiellogik — die liegt im Host-Driver.
 */
@registerType
export class Grenades extends Behaviour {
  fx!: Fx;
  /** Audio: Granate prallt ab (aus der sichtbaren Bahn erkannt, Host und Client). */
  onBounce?: (at: Vec3, kind: GrenadeKind) => void;
  private readonly root = new THREE.Group();
  private readonly views = new Map<number, NadeView>();
  private readonly clouds: Cloud[] = [];
  private readonly blasts: Blast[] = [];
  private readonly geo = new THREE.SphereGeometry(GRENADE.radius * 1.4, 10, 8);
  private readonly mats: Record<GrenadeKind, THREE.MeshStandardMaterial> = {
    he: new THREE.MeshStandardMaterial({ color: 0x3e5a2e, roughness: 0.6, metalness: 0.3 }),
    flash: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.6 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.6, metalness: 0.4 }),
  };
  private readonly puffGeo = new THREE.SphereGeometry(1, 8, 6);

  start(): void {
    this.context.scene.add(this.root);
  }

  onDestroy(): void {
    this.root.removeFromParent();
  }

  spawn(id: number, kind: GrenadeKind, at: Vec3): void {
    if (this.views.has(id)) return;
    const mesh = new THREE.Mesh(this.geo, this.mats[kind]);
    mesh.position.set(at.x, at.y, at.z);
    mesh.castShadow = true;
    this.root.add(mesh);
    this.views.set(id, { mesh, target: mesh.position.clone(), kind });
  }

  /** Client: Positionen aus dem Snapshot übernehmen. */
  syncPositions(list: { id: number; kind: GrenadeKind; p: [number, number, number] }[]): void {
    const seen = new Set<number>();
    for (const n of list) {
      seen.add(n.id);
      if (!this.views.has(n.id)) this.spawn(n.id, n.kind, { x: n.p[0], y: n.p[1], z: n.p[2] });
      this.views.get(n.id)!.target.set(n.p[0], n.p[1], n.p[2]);
    }
  }

  /** Pro Frame: Host liefert exakte Positionen, Client interpoliert zum Ziel. */
  tick(dt: number, hostPositions: { id: number; p: Vec3 }[] | null): void {
    if (hostPositions) {
      for (const h of hostPositions) {
        const v = this.views.get(h.id);
        if (v) v.mesh.position.set(h.p.x, h.p.y, h.p.z);
      }
    } else {
      for (const v of this.views.values()) v.mesh.position.lerp(v.target, Math.min(1, dt * 12));
    }
    if (this.onBounce && dt > 0) this.detectBounces(dt);
    for (const c of [...this.clouds]) {
      c.life -= dt;
      const k = c.life / c.total;
      // Aufblähen in den ersten 1.5 s, dann halten, am Ende ausdünnen
      const grow = Math.min(1, (c.total - c.life) / 1.5);
      c.group.scale.setScalar(0.3 + 0.7 * grow);
      c.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m) m.opacity = 0.85 * Math.min(1, k * 4);
      });
      if (c.life <= 0) {
        this.root.remove(c.group);
        this.clouds.splice(this.clouds.indexOf(c), 1);
      }
    }
    for (const b of [...this.blasts]) {
      b.life -= dt;
      const k = Math.max(0, b.life / b.total);
      b.obj.scale.setScalar(1 + (1 - k) * 3);
      b.obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m) m.opacity = k;
      });
      if (b.light) b.light.intensity = 80 * k;
      if (b.life <= 0) {
        this.root.remove(b.obj);
        if (b.light) this.root.remove(b.light);
        this.blasts.splice(this.blasts.indexOf(b), 1);
      }
    }
  }

  /** Wirkung anzeigen und Granate entfernen. */
  private detectBounces(dt: number): void {
    for (const v of this.views.values()) {
      const p = { x: v.mesh.position.x, y: v.mesh.position.y, z: v.mesh.position.z };
      if (v.last) {
        const vel = { x: (p.x - v.last.x) / dt, y: (p.y - v.last.y) / dt, z: (p.z - v.last.z) / dt };
        v.quiet = Math.max(0, (v.quiet ?? 0) - dt);
        if (v.vel && v.quiet <= 0 && isBounce(v.vel, vel)) {
          v.quiet = 0.12;
          this.onBounce?.(p, v.kind);
        }
        v.vel = vel;
      }
      v.last = p;
    }
  }

  detonate(id: number, kind: GrenadeKind, at: Vec3, scale = 1): void {
    const v = this.views.get(id);
    if (v) {
      this.root.remove(v.mesh);
      this.views.delete(id);
    }
    const pos = new THREE.Vector3(at.x, at.y, at.z);
    if (kind === 'he') {
      const ball = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      ball.position.copy(pos);
      ball.scale.setScalar(0.6 * scale);
      const light = new THREE.PointLight(0xffa040, 80 * scale, 18 * scale);
      light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
      this.root.add(ball, light);
      this.blasts.push({ obj: ball, life: 0.45, total: 0.45, light });
      this.fx.lights?.explosion(at, scale);
      // Funken + Rauch über Fx
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.fx.impact({ kind: 'wall', point: { x: at.x + Math.cos(a) * 0.3, y: at.y + 0.2, z: at.z + Math.sin(a) * 0.3 }, normal: { x: 0, y: 1, z: 0 } }, { x: Math.cos(a), y: 0.3, z: Math.sin(a) });
      }
    } else if (kind === 'flash') {
      const ball = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      ball.position.copy(pos);
      ball.scale.setScalar(0.4);
      const light = new THREE.PointLight(0xffffff, 120, 25);
      light.position.copy(pos);
      this.root.add(ball, light);
      this.blasts.push({ obj: ball, life: 0.25, total: 0.25, light });
      this.fx.lights?.flash(at);
    } else {
      const group = new THREE.Group();
      group.position.copy(pos);
      const mat = new THREE.MeshBasicMaterial({ color: 0xb8bec6, transparent: true, opacity: 0.85, depthWrite: false });
      for (let i = 0; i < 14; i++) {
        const puff = new THREE.Mesh(this.puffGeo, mat);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * GRENADE.smokeRadius * 0.6;
        puff.position.set(Math.cos(a) * r, 0.4 + Math.random() * GRENADE.smokeRadius * 0.7, Math.sin(a) * r);
        puff.scale.setScalar(GRENADE.smokeRadius * (0.45 + Math.random() * 0.35));
        group.add(puff);
      }
      this.root.add(group);
      this.clouds.push({ group, life: GRENADE.smokeDuration, total: GRENADE.smokeDuration });
    }
  }

  clearAll(): void {
    for (const v of this.views.values()) this.root.remove(v.mesh);
    this.views.clear();
    for (const c of this.clouds) this.root.remove(c.group);
    this.clouds.length = 0;
  }

  count(): number {
    return this.views.size;
  }
}
