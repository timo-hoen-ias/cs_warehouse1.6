import * as THREE from 'three';
import { dropRest, restedBounds, type Bounds, type Lay } from '../logic/dropRest';
import { WEAPONS } from '../logic/weapons';
import { weaponGeom } from '../logic/weaponGeom';
import { worldGeometryParts, worldMaterial } from './models';

type Entry = { obj: THREE.Object3D; weapon: string; t: number };

/**
 * Darstellung liegender Waffen und der C4 (alle Clients). Nutzt die Welt-LOD der
 * prozeduralen Modelle (eine geteilte Geometrie je Waffe, ein Draw-Call), auf die linke Seite
 * gelegt (Granaten stehen, C4 liegt flach). Die Ruhelage rechnet logic/dropRest.ts aus den
 * Modellgrenzen: tiefster Punkt genau auf dem Boden. Die C4 bekommt eine blinkende LED
 * (zweites Mesh), damit man sie im Lager findet.
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
    holder.position.set(x, y, z);
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

  /** Liegendes Modell (Welt-LOD): Ruhelage aus den Modellgrenzen; Doppelwaffen als zwei Pistolen nebeneinander. */
  private weaponMesh(weapon: string): THREE.Object3D {
    const def = WEAPONS[weapon];
    const model = def?.visual.model ?? weapon;
    const parts = worldGeometryParts(model);
    const g = new THREE.Group();
    if (!parts.length) {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.08), worldMaterial()));
      return g;
    }
    const hold = weaponGeom(model)?.hold;
    const lay: Lay = hold === 'grenade' ? 'upright' : hold === 'bomb' ? 'flat' : 'side';
    let top = 0;
    parts.forEach((geo, i) => {
      const bb = geo.boundingBox!;
      const bounds: Bounds = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
      const rest = dropRest(bounds, lay);
      const mesh = new THREE.Mesh(geo, worldMaterial());
      mesh.castShadow = true;
      mesh.rotation.z = rest.rotZ;
      // Doppelwaffen: die beiden Pistolen liegen 0,2 m nebeneinander
      const lateral = parts.length > 1 ? (i === 0 ? 0.1 : -0.1) : 0;
      mesh.position.set(rest.offset[0] + lateral, rest.offset[1], rest.offset[2]);
      g.add(mesh);
      top = Math.max(top, restedBounds(bounds, rest).max[1]);
    });
    if (weapon === 'c4') g.add(this.ledMesh(top));
    return g;
  }

  private ledMesh(top: number): THREE.Object3D {
    this.led ??= new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), this.led);
    led.position.set(0.0, top + 0.005, -0.02);
    return led;
  }
}
