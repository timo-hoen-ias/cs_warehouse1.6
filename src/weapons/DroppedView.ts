import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { WEAPONS } from '../logic/weapons';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
function assetBase(): string {
  const root = BASE_URL.startsWith('http') ? BASE_URL : new URL(BASE_URL, window.location.href).href;
  return new URL('assets/weapons/obj/', root).href;
}

/** Länge (m) liegender Waffen je Typ (Modelle werden darauf skaliert). */
const LEN: Record<string, number> = { pistol: 0.28, smg: 0.5, rifle: 0.8, sniper: 1.1, shotgun: 0.85, mg: 0.95 };

type Entry = { obj: THREE.Object3D; weapon: string; t: number };

/**
 * Darstellung liegender Waffen und der C4 (alle Clients). OBJ-Modelle werden je
 * Datei einmal geladen und geklont; bis dahin (oder ohne Modell) ein Platzhalter.
 * Die C4 bekommt eine blinkende LED, damit man sie im Lager findet.
 */
export class DroppedView {
  readonly root = new THREE.Group();
  private readonly items = new Map<number, Entry>();
  private readonly cache = new Map<string, Promise<THREE.Object3D | null>>();
  private led?: THREE.MeshBasicMaterial;

  /** Sollzustand übernehmen (Snapshot oder Ereignisse). */
  sync(list: readonly { id: number; weapon: string; x: number; y: number; z: number }[]): void {
    const seen = new Set<number>();
    for (const d of list) {
      seen.add(d.id);
      if (!this.items.has(d.id)) this.add(d.id, d.weapon, d.x, d.y, d.z);
    }
    for (const id of [...this.items.keys()]) if (!seen.has(id)) this.remove(id);
  }

  add(id: number, weapon: string, x: number, y: number, z: number): void {
    if (this.items.has(id)) return;
    const holder = new THREE.Group();
    holder.position.set(x, y + 0.04, z);
    holder.rotation.y = (id * 2.399) % (Math.PI * 2); // zufällig wirkende, aber stabile Drehung
    this.root.add(holder);
    const entry: Entry = { obj: holder, weapon, t: 0 };
    this.items.set(id, entry);
    if (weapon === 'c4') {
      holder.add(this.bombMesh());
      return;
    }
    const def = WEAPONS[weapon];
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(LEN[def?.type ?? 'rifle'] ?? 0.6, 0.06, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.5 }));
    holder.add(fallback);
    if (!def?.visual.model) return;
    this.load(def.visual.model).then((proto) => {
      if (!proto || !this.items.has(id)) return;
      const clone = proto.clone(true);
      const box = new THREE.Box3().setFromObject(clone);
      const size = box.getSize(new THREE.Vector3());
      const s = (LEN[def.type] ?? 0.6) / Math.max(size.x, size.y, size.z, 1e-3);
      clone.scale.setScalar(s);
      // Modelle haben den Lauf entlang +X und stehen aufrecht → flach hinlegen
      clone.rotation.x = Math.PI / 2;
      clone.position.y = 0.03;
      holder.remove(fallback);
      fallback.geometry.dispose();
      holder.add(clone);
    }).catch(() => undefined);
  }

  remove(id: number): void {
    const e = this.items.get(id);
    if (!e) return;
    this.root.remove(e.obj);
    this.items.delete(id);
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  /** LED der C4 blinken lassen. */
  tick(time: number): void {
    if (this.led) this.led.color.setHex(Math.floor(time * 2) % 2 === 0 ? 0xff2a1a : 0x330000);
  }

  count(): number {
    return this.items.size;
  }

  private bombMesh(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.8 }));
    body.position.y = 0.05;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: 0x1e2226 }));
    pad.position.set(0.05, 0.11, 0);
    this.led ??= new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), this.led);
    led.position.set(-0.1, 0.11, 0.05);
    g.add(body, pad, led);
    return g;
  }

  private load(model: string): Promise<THREE.Object3D | null> {
    let p = this.cache.get(model);
    if (!p) {
      const base = assetBase();
      const loader = new OBJLoader();
      loader.setResourcePath(base);
      p = loader.loadAsync(base + model + '.obj').then((o) => o as THREE.Object3D).catch(() => null);
      this.cache.set(model, p);
    }
    return p;
  }
}
