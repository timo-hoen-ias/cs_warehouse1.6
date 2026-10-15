import * as THREE from 'three';
import type { MapData } from '../logic/mapkit';
import { luminance, type RGB } from '../logic/bake';

/**
 * Beleuchtung dynamischer Objekte (Figuren, Waffen, liegende Items): Die Levelgeometrie
 * ist vorgebacken und unbeleuchtet; für bewegte Objekte gibt es Himmelslicht + Sonne,
 * deren Stärke einer Lichtsonde aus dem gebackenen Licht an der Kamera folgt (drinnen
 * dunkler, draußen sonnig), plus auf „hoch“ bis zu vier echte Punktlichter, die die
 * nächstgelegenen Kartenlampen spiegeln (Obergrenze echter Lichter).
 */
export class LevelLighting {
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly points: THREE.PointLight[] = [];
  private readonly lamps: { pos: THREE.Vector3; color: THREE.Color; intensity: number; range: number }[];
  private timer = 0;
  private level = 1;
  private sunVis = 1;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, private readonly map: MapData, private readonly probe: (x: number, y: number, z: number) => RGB, quality: 'high' | 'low') {
    const env = map.env;
    scene.background = new THREE.Color(env.skyHorizon);
    scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar);
    this.hemi = new THREE.HemisphereLight(env.skyTop, 0x6a5a48, 1.2);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity * 1.6);
    const d = new THREE.Vector3(...env.sunDir).normalize();
    this.sun.position.copy(d.multiplyScalar(100));
    scene.add(this.sun, this.sun.target);
    this.lamps = map.lights.filter((l) => l.kind !== 'window').map((l) => ({ pos: new THREE.Vector3(...l.pos), color: new THREE.Color(l.color), intensity: l.intensity, range: l.range }));
    if (quality === 'high') {
      for (let i = 0; i < 4; i++) {
        const p = new THREE.PointLight(0xffffff, 0, 10, 1.6);
        scene.add(p);
        this.points.push(p);
      }
    }
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  }

  /** Pro Frame: Sonde an der Kamera auswerten (gedämpft), Punktlichter umhängen. */
  update(cam: THREE.Vector3, dt: number): void {
    const L = this.probe(cam.x, cam.y - 1.2, cam.z);
    const lum = Math.min(2, luminance(L));
    // draußen ≈ 1.2+, in Hallen 0.2–0.5
    const target = Math.max(0.12, Math.min(1.4, lum));
    this.level += (target - this.level) * Math.min(1, dt * 3);
    this.hemi.intensity = 0.35 + this.level * 0.9;
    const sunTarget = lum > 0.9 ? 1 : lum > 0.5 ? 0.5 : 0.08;
    this.sunVis += (sunTarget - this.sunVis) * Math.min(1, dt * 2);
    this.sun.intensity = this.map.env.sunIntensity * 1.6 * this.sunVis;
    if (!this.points.length) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.4;
    const near = this.lamps
      .map((l) => ({ l, d: l.pos.distanceTo(cam) }))
      .filter((e) => e.d < e.l.range * 1.2)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.points.length);
    this.points.forEach((p, i) => {
      const e = near[i];
      if (!e) {
        p.intensity = 0;
        return;
      }
      p.position.copy(e.l.pos);
      p.color.copy(e.l.color);
      p.distance = e.l.range;
      p.intensity = e.l.intensity * 6;
    });
  }
}
