import * as THREE from 'three';
import type { World } from '../game/World';
import { CEILING } from '../logic/ceiling';

/**
 * Hallenbeleuchtung: Die vielen Strahler werden durch ein weiches Oberlicht (gerichtet, fast
 * senkrecht, mit Schatten) plus Himmels-/Bodenreflex angenähert; die Lichtflecken am Boden
 * kommen aus der gebackenen Licht-Map. Auf „hoch“ setzen zwei Spotlights die Bombenspots in
 * Szene (warmes Arbeitslicht) — echte Lichter kosten pro Pixel, daher sparsam.
 */
export function setupLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, world: World, quality: 'high' | 'low'): void {
  const inner = world.inner;
  const cx = (inner.minX + inner.maxX) / 2;
  const cz = (inner.minZ + inner.maxZ) / 2;
  const span = Math.max(inner.maxX - inner.minX, inner.maxZ - inner.minZ) / 2 + 4;

  scene.background = new THREE.Color(0x0e1014);
  scene.fog = new THREE.Fog(0x12151a, 45, 160);

  // Reflex: kühles Oberlicht von oben, warmer Bodenreflex von unten
  scene.add(new THREE.HemisphereLight(0xc9d6e6, 0x4a3f30, 0.62));

  // Oberlicht der Strahlerfelder: fast senkrecht, leicht schräg → Regale werfen kurze Schatten
  const key = new THREE.DirectionalLight(0xfff0d8, 1.25);
  key.position.set(cx + 10, world.height + 30, cz + 6);
  key.target.position.set(cx, 0, cz);
  key.castShadow = quality === 'high';
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = world.height + 60;
  key.shadow.camera.left = -span;
  key.shadow.camera.right = span;
  key.shadow.camera.top = span;
  key.shadow.camera.bottom = -span;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);

  if (quality === 'high') {
    // Arbeitslicht über den Bombenspots
    for (const [spot, color] of [[world.zones.a, 0xffd2a0], [world.zones.b, 0xffe2b8]] as const) {
      const s = new THREE.SpotLight(color, 60, 18, 0.62, 0.65, 1.6);
      s.position.set(spot.x, world.height - CEILING.lampDrop, spot.z);
      s.target.position.set(spot.x, 0, spot.z);
      scene.add(s, s.target);
    }
  }

  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}
