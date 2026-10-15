import * as THREE from 'three';
import {
  DYN_LIGHT_MAX, addLight, createPool, explosionLight, flashLight, muzzleLight, selectLights, tickPool,
  type LightPool, type LightSpec, type Vec3,
} from '../logic/dynlight';

/**
 * Dynamisches Licht für die unbeleuchtete, vorgebackene Levelgeometrie: Ein kleines Uniform-Array
 * (bis zu `max` Punktlichter: Position + Radius, Farbe × Helligkeit) wird per `onBeforeCompile` in
 * die Basis-Materialien gehängt und addiert Licht nach Entfernung (quadratisch bis zum Radius) und
 * Flächenausrichtung (aus Bildschirm-Ableitungen) — ohne Schatten, ohne zusätzliche Szenenlichter.
 * Gespeist wird es von Fx (Mündungsfeuer) und Granaten/C4 (Explosion, Blendgranate); die Auswahl nach
 * Kameranähe und die Lebensdauer-Kurven stehen in `src/logic/dynlight.ts`.
 */
export class DynamicLights {
  /** Gleichzeitig gerenderte Lichter (niedrig 2, hoch 6). */
  readonly max: number;
  private readonly pool: LightPool = createPool();
  private readonly cam = new THREE.Vector3();
  private readonly uniforms: {
    uDynA: { value: THREE.Vector4[] };
    uDynC: { value: THREE.Vector3[] };
    uDynCount: { value: number };
  };
  /** Debug/Smoke: aktuell ans Shader-Array übergebene Lichter. */
  active = 0;

  constructor(quality: 'high' | 'low' = 'high') {
    this.max = DYN_LIGHT_MAX[quality];
    const far = new THREE.Vector4(0, -1e5, 0, 1);
    this.uniforms = {
      uDynA: { value: Array.from({ length: Math.max(1, this.max) }, () => far.clone()) },
      uDynC: { value: Array.from({ length: Math.max(1, this.max) }, () => new THREE.Vector3()) },
      uDynCount: { value: 0 },
    };
  }

  /** Mündungsfeuer an `pos` (size ≈ Effekt-Skala der Waffe). */
  muzzle(pos: Vec3, size = 1): void {
    this.add(muzzleLight(pos, size));
  }

  /** HE-/C4-Explosion (scale 1 = HE, 3 = C4). */
  explosion(pos: Vec3, scale = 1): void {
    this.add(explosionLight(pos, scale));
  }

  /** Blendgranate. */
  flash(pos: Vec3): void {
    this.add(flashLight(pos));
  }

  add(spec: LightSpec): void {
    if (this.max <= 0) return;
    addLight(this.pool, spec, this.cam);
    this.write(); // schon im selben Frame sichtbar (Auswahl nach der zuletzt bekannten Kameraposition)
  }

  /** Pro Frame: altern lassen, wichtigste Lichter für die Kamera ins Uniform-Array schreiben. */
  update(dt: number, camPos: Vec3): void {
    this.cam.set(camPos.x, camPos.y, camPos.z);
    tickPool(this.pool, dt);
    this.write();
  }

  /** Wichtigste Lichter für die Kamera ins Uniform-Array schreiben. */
  private write(): void {
    const sel = selectLights(this.pool, this.cam, this.max);
    this.active = sel.length;
    this.uniforms.uDynCount.value = sel.length;
    sel.forEach((l, i) => {
      this.uniforms.uDynA.value[i]!.set(l.x, l.y, l.z, l.radius);
      this.uniforms.uDynC.value[i]!.set(l.r, l.g, l.b);
    });
  }

  /** Anzahl lebender Lichter im Pool (Debug/Smoke). */
  poolSize(): number {
    return this.pool.lights.length;
  }

  /**
   * Hängt das Licht-Uniform-Array in ein Basis-Material (MeshBasicMaterial; auch instanziert).
   * `albedo`: `'map'` = Oberflächenfarbe aus Textur/Materialfarbe ohne das gebackene Licht (Levelgeometrie, Schilder);
   * `'tint'` = Farbton der Vertex-/Instanzfarben, auf feste Helligkeit normiert (Deko, Markierungen: dort steckt das
   * gebackene Licht schon in der Farbe).
   */
  patch<M extends THREE.MeshBasicMaterial>(mat: M, albedo: 'map' | 'tint' = 'map'): M {
    if (this.max <= 0) return mat;
    const u = this.uniforms;
    const max = this.max;
    mat.onBeforeCompile = (shader) => {
      const base = albedo === 'map'
        ? 'vec3 dynBase = diffuseColor.rgb;\n  #include <color_fragment>'
        : '#include <color_fragment>\n  vec3 dynBase = diffuseColor.rgb / max(max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), 0.02) * 0.55;';
      shader.uniforms.uDynA = u.uDynA;
      shader.uniforms.uDynC = u.uDynC;
      shader.uniforms.uDynCount = u.uDynCount;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDynPos;')
        .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 dynP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  dynP = instanceMatrix * dynP;
  #endif
  vDynPos = (modelMatrix * dynP).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
#define DYN_MAX ${max}
uniform vec4 uDynA[DYN_MAX];
uniform vec3 uDynC[DYN_MAX];
uniform int uDynCount;
varying vec3 vDynPos;`)
        .replace('#include <color_fragment>', base)
        .replace('#include <opaque_fragment>', `
  if (uDynCount > 0) {
    // Flächenrichtung aus Ableitungen (zur Kamera gewandt: Licht hinter einer Wand strahlt die Vorderseite nicht an)
    vec3 dynN = normalize(cross(dFdx(vDynPos), dFdy(vDynPos)) + vec3(1e-9));
    vec3 dynL = vec3(0.0);
    for (int i = 0; i < DYN_MAX; i++) {
      if (i >= uDynCount) break;
      vec3 d = uDynA[i].xyz - vDynPos;
      float dist = length(d);
      float a = clamp(1.0 - dist / uDynA[i].w, 0.0, 1.0);
      float nl = clamp(dot(dynN, d / max(dist, 0.001)), 0.0, 1.0);
      dynL += uDynC[i] * (a * a) * (0.15 + 0.85 * nl);
    }
    outgoingLight += dynBase * dynL;
  }
  #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => `dyn${max}${albedo}`;
    return mat;
  }
}
