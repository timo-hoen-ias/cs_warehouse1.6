import * as THREE from 'three';
import { DamageTarget, registerTarget, unregisterTarget } from './DamageTarget';
import { humanPartBoxes, type PartBox } from '../logic/hitbox';
import type { WeaponDef } from '../logic/weapons';

const BODY_COLOR = 0x9aa5ad;
const HEAD_COLOR = 0x5c6b73;
const DEAD_COLOR = 0x3a3f44;

/**
 * Trainingspuppe (M1): sichtbare Box (Körper + Kopf) + DamageTarget.
 * Liefert Weltraum-Hitboxen (humanPartBoxes) für den puren Shooter-Raycast.
 * Wird in M2 Grundlage für Bots.
 */
export class TargetDummy extends DamageTarget {
  readonly root = new THREE.Group();

  private readonly matBody: THREE.MeshStandardMaterial;
  private readonly matHead: THREE.MeshStandardMaterial;
  private readonly boxes = humanPartBoxes({ x: 0, y: 0, z: 0 });

  constructor() {
    super(100);
    this.matBody = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.8 });
    this.matHead = new THREE.MeshStandardMaterial({ color: HEAD_COLOR, roughness: 0.7 });

    const body = this.boxes.find((p) => p.part === 'body')!;
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(body.box.maxX - body.box.minX, body.box.maxY - body.box.minY, body.box.maxZ - body.box.minZ), this.matBody);
    bodyMesh.position.set((body.box.minX + body.box.maxX) / 2, (body.box.minY + body.box.maxY) / 2, (body.box.minZ + body.box.maxZ) / 2);

    const head = this.boxes.find((p) => p.part === 'head')!;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(head.box.maxX - head.box.minX, head.box.maxY - head.box.minY, head.box.maxZ - head.box.minZ), this.matHead);
    headMesh.position.set((head.box.minX + head.box.maxX) / 2, (head.box.minY + head.box.maxY) / 2, (head.box.minZ + head.box.maxZ) / 2);

    this.root.add(bodyMesh, headMesh);
    registerTarget(this);
  }

  /** Verschiebt die Puppe (Fußpunkt). */
  setPosition(x: number, z: number, y = 0): void {
    this.root.position.set(x, y, z);
  }

  addTo(parent: THREE.Object3D): void {
    parent.add(this.root);
  }

  /** Weltraum-Hitboxen (root-Weltposition als Fußpunkt). */
  override partBoxes(): PartBox[] {
    this.root.updateWorldMatrix(true, false);
    const wp = this.root.getWorldPosition(new THREE.Vector3());
    return humanPartBoxes({ x: wp.x, y: wp.y, z: wp.z });
  }

  dispose(): void {
    unregisterTarget(this);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    this.root.removeFromParent();
  }

  override takeHit(part: 'head' | 'body', def: WeaponDef): boolean {
    const killed = super.takeHit(part, def);
    if (killed) {
      this.matBody.color.setHex(DEAD_COLOR);
      this.matHead.color.setHex(DEAD_COLOR);
    }
    return killed;
  }

  /** Kurzer roter Blitz am getroffenen Teil. */
  override flashHit(): void {
    const mat = this.health.alive ? this.matBody : null;
    if (!mat) return;
    mat.emissive.setHex(0x990000);
    setTimeout(() => { mat.emissive.setHex(0x000000); }, 90);
  }
}
