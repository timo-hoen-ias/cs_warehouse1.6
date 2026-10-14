import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import type { Vec3 } from '../logic/hitbox';

const UP = new THREE.Vector3(0, 1, 0);

export type FxHit =
  | { kind: 'target'; part: 'head' | 'body'; point: Vec3; killed: boolean; normal: Vec3 }
  | { kind: 'wall'; point: Vec3; normal: Vec3 };

/** Ein temporärer Effekt mit eigenem Lebensdauer-Tick. */
type LiveFx = { obj: THREE.Object3D; life: number; tick: (dt: number, life: number) => void; done?: () => void };

/**
 * Schuss-Effekte (Needle-Behaviour): Mündungsfeuer (Licht + Flammen-Kegel + Rauch),
 * Tracer, Einschläge (Sparks + Decals, Blut bei Zieltreffern). Schlichte drei-Geometrie.
 */
@registerType
export class Fx extends Behaviour {
  onHitmarker?: (killed: boolean) => void;

  private readonly root = new THREE.Group();
  private readonly active = new Set<LiveFx>();
  private muzzleLight?: THREE.PointLight;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  /** Gesamtzahl je erzeugter Wand-Decals (Debug/Smoke). */
  wallDecals = 0;

  /** Anzahl aktiver Effekte (Debug/Smoke). */
  fxCount(): number {
    return this.active.size;
  }

  /** Debug: aktive Decals relativ zur Kamera (Anzahl + nächstes + größte Größe). */
  decalStats(): { count: number; nearest: number; maxSize: number } {
    const cam = this.context.mainCamera;
    const camPos = cam ? cam.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    let count = 0;
    let nearest = Infinity;
    let maxSize = 0;
    for (const fx of this.active) {
      if (!fx.obj.userData.isDecal) continue;
      count++;
      const wp = fx.obj.getWorldPosition(new THREE.Vector3());
      const d = wp.distanceTo(camPos);
      if (d < nearest) nearest = d;
      maxSize = Math.max(maxSize, fx.obj.userData.decalSize ?? 0);
    }
    return { count, nearest: count ? +nearest.toFixed(1) : 0, maxSize: +maxSize.toFixed(3) };
  }

  start(): void {
    this.context.scene.add(this.root);
  }

  onDestroy(): void {
    this.root.removeFromParent();
    this.active.clear();
  }

  update(): void {
    const dt = Math.min(this.context.time.deltaTime, 0.05);
    for (const fx of [...this.active]) {
      fx.life -= dt;
      if (fx.life <= 0) {
        fx.done?.();
        this.removeNode(fx.obj);
        this.active.delete(fx);
        continue;
      }
      fx.tick(dt, fx.life);
    }
  }

  // --- Öffentliche API ---

  muzzleFlash(muzzleWorld: Vec3, dir: Vec3, size = 1): void {
    const p = this.tmp.set(muzzleWorld.x, muzzleWorld.y, muzzleWorld.z);

    if (!this.muzzleLight) {
      this.muzzleLight = new THREE.PointLight(0xffc266, 0, 3.2);
      this.root.add(this.muzzleLight);
    }
    this.muzzleLight.position.copy(p);
    this.muzzleLight.intensity = 30;

    const flash = this.starFlash(size);
    flash.position.copy(p);
    flash.quaternion.setFromUnitVectors(UP, this.tmp2.set(dir.x, dir.y, dir.z).normalize());
    this.root.add(flash);
    this.addFx(flash, 0.05, (dt, life) => this.fade(flash, 0.05, life, dt));

    this.addFx(new THREE.Object3D(), 0.07, () => {
      if (this.muzzleLight) this.muzzleLight.intensity *= 0.1;
    });

    this.puff(p.clone(), 0.045, 0x5a6068, 0.35);
  }

  impact(hit: FxHit, rayDir: Vec3): void {
    const blood = hit.kind === 'target';
    const color = hit.kind === 'target' ? (hit.part === 'head' ? 0xd03030 : 0x8a1f1f) : 0x9aa3ad;

    // Frische Vektoren — NICHT this.tmp/this.tmp2 teilen (die werden unten überschrieben).
    const p = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
    const n = blood ? 6 : 10;

    // Sparks
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(
        rayDir.x + (Math.random() - 0.5) * 0.7,
        rayDir.y + (Math.random() - 0.5) * 0.7,
        rayDir.z + (Math.random() - 0.5) * 0.7,
      ).normalize();
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.015, 0.05),
        new THREE.MeshBasicMaterial({ color, transparent: true }),
      );
      spark.position.copy(p);
      this.root.add(spark);
      this.addFx(spark, 0.22, (dt) => {
        spark.position.addScaledVector(dir, 2.6 * dt);
        (spark.material as THREE.MeshBasicMaterial).opacity *= Math.pow(0.2, dt);
      }, () => (spark.material as THREE.Material).dispose());
    }

    // Decal — konstant klein (wie echte Treffer) und FLACH auf der Oberfläche:
    // Quaternion legt die Kreis-Ebene parallel zur Treffer-Normalen, nicht zur Kamera.
    if (!blood) this.wallDecals += 1;
    const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
    const group = new THREE.Group();
    // CircleGeometry liegt in der XY-Ebene (Normale +Z) → +Z auf die Oberflächen-Normale drehen.
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    if (blood) {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.02, 10),
        new THREE.MeshBasicMaterial({ color: 0x7a1010, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      group.add(dot);
    } else {
      // Einschuss: dunkler Kern (0.05 m) + heller Rand (0.05–0.07 m) — konstant klein
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.07, 18),
        new THREE.MeshBasicMaterial({ color: 0xd7dde2, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      );
      const core = new THREE.Mesh(
        new THREE.CircleGeometry(0.05, 16),
        new THREE.MeshBasicMaterial({ color: 0x05060a, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      group.add(rim, core);
    }

    // Position: Trefferpunkt + minimaler Versatz entlang der Normalen (kein Z-Fighting)
    group.position.copy(p).addScaledVector(normal, 0.005);
    group.userData.isDecal = true;
    group.userData.decalSize = blood ? 0.02 : 0.07;

    this.root.add(group);
    const life = blood ? 1.5 : 12;
    this.addFx(group, life, (dt, l) => this.fade(group, life, l, dt), () => {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose();
      });
    });

    if (blood) this.puff(p.clone(), 0.06, 0x6a1414, 0.5);
    if (hit.kind === 'target') this.onHitmarker?.(hit.killed);
  }

  /** Hülsenauswurf: kleine Messing-Box startet am Auswurffenster und fliegt in Auswurfrichtung, dreht sich, fällt. */
  shell(port: Vec3, dir: Vec3): void {
    const start = new THREE.Vector3(port.x, port.y, port.z);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.03), new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.8, roughness: 0.3 }));
    shell.position.copy(start);
    const vel = new THREE.Vector3(dir.x, dir.y, dir.z).normalize().multiplyScalar(2.2 + Math.random() * 0.9);
    vel.x += (Math.random() - 0.5) * 0.4;
    vel.y += (Math.random() - 0.5) * 0.4;
    vel.z += (Math.random() - 0.5) * 0.4;
    const spin = new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    this.root.add(shell);
    this.addFx(shell, 0.9, (dt) => {
      vel.y -= 9.8 * dt;
      shell.position.addScaledVector(vel, dt);
      shell.rotation.x += spin.x * dt;
      shell.rotation.y += spin.y * dt;
      shell.rotation.z += spin.z * dt;
    }, () => {
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
    });
  }

  tracer(from: Vec3, to: Vec3): void {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(from.x, from.y, from.z),
        new THREE.Vector3(to.x, to.y, to.z),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
    );
    this.root.add(line);
    this.addFx(line, 0.05, (dt, life) => this.fade(line, 0.05, life, dt), () => {
      (line.geometry as THREE.BufferGeometry).dispose();
      (line.material as THREE.Material).dispose();
    });
  }

  /** Kurzer Blitz bei Zieltreffer (optional stärker bei Kill). */
  hitBlink(): void {
    // bewusst leicht — Hauptfeedback ist Hitmarker + Blut
  }

  // --- Intern ---

  private addFx(obj: THREE.Object3D, life: number, tick?: (dt: number, life: number) => void, done?: () => void): void {
    this.active.add({ obj, life, tick: tick ?? (() => {}), done });
  }

  private starFlash(size: number): THREE.Mesh {
    const h = size;
    const verts = new Float32Array([
      0, 0, 0, 0.07, 0.02, -h,
      0, 0, 0, -0.06, 0.03, -h,
      0, 0, 0, 0.02, 0.09, -h,
      0, 0, 0, 0.04, -0.07, -h,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 10;
    return mesh;
  }

  private puff(pos: THREE.Vector3, scale: number, color: number, life: number): void {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(scale, 6, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 }),
    );
    m.position.copy(pos);
    this.root.add(m);
    this.addFx(m, life, (dt, l) => {
      m.scale.addScalar(dt * 0.8);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.3 * Math.max(0, l / life);
    }, () => {
      (m.geometry as THREE.BufferGeometry).dispose();
      (m.material as THREE.Material).dispose();
    });
  }

  private fade(obj: THREE.Object3D, total: number, life: number, dt: number): void {
    const k = Math.max(0, life / total);
    obj.traverse((o) => {
      const m = o as THREE.Mesh | THREE.Line;
      const mat = m.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial | undefined;
      if (mat && 'opacity' in mat) mat.opacity = Math.max(0.001, k);
    });
    void dt;
  }

  private removeNode(obj: THREE.Object3D): void {
    obj.removeFromParent();
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}
