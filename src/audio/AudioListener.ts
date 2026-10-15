import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import type { Sfx } from './Sfx';

/**
 * Hängt den Audio-Hörer an die Hauptkamera (Position + Blickrichtung) und treibt
 * Raumhall/Ambience pro Frame an. Echte Frame-Zeit, aber gedeckelt (Pegel-Glättung).
 */
@registerType
export class AudioListener extends Behaviour {
  sfx!: Sfx;
  private readonly lPos = new THREE.Vector3();
  private readonly lFwd = new THREE.Vector3();
  private readonly lUp = new THREE.Vector3();
  private readonly lQ = new THREE.Quaternion();

  update(): void {
    const cam = this.context.mainCamera;
    if (!cam || !this.sfx) return;
    cam.getWorldPosition(this.lPos);
    cam.getWorldQuaternion(this.lQ);
    this.lFwd.set(0, 0, -1).applyQuaternion(this.lQ);
    this.lUp.set(0, 1, 0).applyQuaternion(this.lQ);
    this.sfx.tick(Math.min(this.context.time.deltaTime, 0.1), this.lPos, this.lFwd, this.lUp);
  }
}
