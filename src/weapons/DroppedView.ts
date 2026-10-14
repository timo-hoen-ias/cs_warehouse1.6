import * as THREE from 'three';
import { WEAPONS } from '../logic/weapons';
import { worldGeometry, worldMaterial } from './models';

type Entry = { obj: THREE.Object3D; weapon: string; t: number };

/**
 * Darstellung liegender Waffen und der C4 (alle Clients). Nutzt die Welt-LOD der
 * prozeduralen Modelle (eine geteilte Geometrie je Waffe, ein Draw-Call), auf die
 * rechte Seite gelegt und auf den Boden gesetzt. Die C4 liegt flach und bekommt eine
 * blinkende LED (zweites Mesh), damit man sie im Lager findet.
 */
export class DroppedView {
  readonly root = new THREE.Group();
  private readonly items = new Map<number, Entry>();
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
    holder.add(this.weaponMesh(weapon));
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

  /** Liegendes Modell: Welt-LOD, Waffe auf der Seite, Unterkante auf dem Boden, um die Mitte gedreht. */
  private weaponMesh(weapon: string): THREE.Object3D {
    const def = WEAPONS[weapon];
    const geo = worldGeometry(def?.visual.model ?? weapon);
    const g = new THREE.Group();
    if (!geo) {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.08), worldMaterial()));
      return g;
    }
    const mesh = new THREE.Mesh(geo, worldMaterial());
    mesh.castShadow = true;
    // Granaten/C4 stehen bzw. liegen flach, Waffen liegen auf der rechten Seite
    if (def?.type !== 'grenade' && def?.type !== 'bomb') mesh.rotation.z = Math.PI / 2;
    g.add(mesh);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const c = box.getCenter(new THREE.Vector3());
    mesh.position.set(-c.x, -box.min.y - 0.035, -c.z);
    if (weapon === 'c4') g.add(this.ledMesh(box.max.y - box.min.y - 0.035));
    return g;
  }

  private ledMesh(top: number): THREE.Object3D {
    this.led ??= new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), this.led);
    led.position.set(0.0, top + 0.005, -0.02);
    return led;
  }
}
