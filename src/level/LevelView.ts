import * as THREE from 'three';
import type { DecorKind, Facing, MapData, MaterialId } from '../logic/mapkit';
import { LEVEL_HIGH, LEVEL_LOW, buildLevelMesh, sampleLight, type LevelBake } from '../logic/levelmesh';
import { luminance, type RGB } from '../logic/bake';
import { decalTexture, glowTexture, materialTexture, serverFrontTexture, serverLedTexture, setTextureQuality, signTexture } from './textures';
import { decorGeometry, decorGlows } from './decor';

export type LevelBuild = {
  group: THREE.Group;
  bake: LevelBake;
  /** Gebackenes Licht an einem Punkt (für Figuren/Viewmodel-Helligkeit). */
  probe(x: number, y: number, z: number): RGB;
  stats: { meshes: number; verts: number; tris: number; instances: number; ms: number };
};

/**
 * Baut die Kartendarstellung: Levelgeometrie je Material/Kachel mit gebackenem
 * Vertex-Licht (unbeleuchtete Materialien → sehr günstig, auch in Software-GL),
 * instanzierte Deko, Schilder, Bodenmarkierungen, Himmel mit Sonne und Skyline,
 * auf „hoch“ zusätzlich Lichtkegel unter den Hallenleuchten.
 */
export function buildLevelView(map: MapData, quality: 'high' | 'low' = 'high'): LevelBuild {
  const t0 = performance.now();
  setTextureQuality(quality);
  const group = new THREE.Group();
  group.name = 'level';
  const { parts, bake } = buildLevelMesh(map, quality === 'high' ? LEVEL_HIGH : LEVEL_LOW);
  const stats = { meshes: 0, verts: 0, tris: 0, instances: 0, ms: 0 };

  // ---------------------------------------------------------------- Levelgeometrie
  const mats = new Map<MaterialId, THREE.MeshBasicMaterial>();
  const matFor = (m: MaterialId): THREE.MeshBasicMaterial => {
    let mat = mats.get(m);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ vertexColors: true, map: m === 'emissive' ? null : materialTexture(m) });
      if (m === 'cage') {
        mat.alphaTest = 0.5;
        mat.side = THREE.DoubleSide;
      }
      mats.set(m, mat);
    }
    return mat;
  };
  for (const p of parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(p.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(p.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(p.indices, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(...p.center), p.radius);
    const mesh = new THREE.Mesh(geo, matFor(p.mat));
    mesh.matrixAutoUpdate = false;
    mesh.name = `lvl-${p.mat}`;
    group.add(mesh);
    stats.meshes++;
    stats.verts += p.positions.length / 3;
    stats.tris += p.indices.length / 3;
  }

  const light = (x: number, y: number, z: number, n: [number, number, number] = [0, 1, 0]): RGB => sampleLight(bake, [x, y, z], n);

  // ---------------------------------------------------------------- Deko (instanziert)
  const byKind = new Map<DecorKind, typeof map.decor>();
  for (const d of map.decor) {
    const list = byKind.get(d.kind);
    if (list) list.push(d);
    else byKind.set(d.kind, [d]);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tmpC = new THREE.Color();
  const instanced = (kind: DecorKind, geo: THREE.BufferGeometry, mat: THREE.Material, list: typeof map.decor, glow: boolean): void => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((d, i) => {
      q.setFromAxisAngle(up, d.rot ?? 0);
      const s = d.scale ?? [1, 1, 1];
      m4.compose(new THREE.Vector3(...d.pos), q, new THREE.Vector3(s[0], s[1], s[2]));
      mesh.setMatrixAt(i, m4);
      tmpC.set(d.tint ?? 0xffffff).convertSRGBToLinear();
      const L = glow ? ([1, 1, 1] as RGB) : light(d.pos[0], d.pos[1] + 0.5, d.pos[2]);
      mesh.setColorAt(i, new THREE.Color(tmpC.r * L[0], tmpC.g * L[1], tmpC.b * L[2]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = `decor-${kind}`;
    mesh.computeBoundingSphere();
    group.add(mesh);
    stats.instances += list.length;
  };
  const decorMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const [kind, list] of byKind) {
    instanced(kind, decorGeometry(kind, quality === 'low'), decorMat, list, decorGlows(kind));
    if (kind === 'serverRack') {
      const front = new THREE.MeshBasicMaterial({ map: serverFrontTexture() });
      instanced('serverLeds', new THREE.PlaneGeometry(0.56, 1.9).translate(0, 1.0, 0.505), front, list, false);
      const leds = new THREE.MeshBasicMaterial({ map: serverLedTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      instanced('serverLeds', new THREE.PlaneGeometry(0.56, 1.9).translate(0, 1.0, 0.51), leds, list.map((d) => ({ ...d, tint: 0xffffff })), true);
    }
  }

  // ---------------------------------------------------------------- Schilder
  const facingRot: Record<Facing, number> = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 };
  const facingN: Record<Facing, [number, number, number]> = { pz: [0, 0, 1], nz: [0, 0, -1], px: [1, 0, 0], nx: [-1, 0, 0] };
  for (const s of map.signs) {
    const color = '#' + (s.color ?? 0xffd040).toString(16).padStart(6, '0');
    const bg = '#' + (s.bg ?? 0x16191d).toString(16).padStart(6, '0');
    const tex = signTexture(s.text, color, bg, s.sub);
    const L = light(s.pos[0], s.pos[1], s.pos[2], facingN[s.facing]);
    const k = Math.max(0.55, Math.min(1.3, luminance(L) * 1.4));
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(k, k, k) });
    // Textur: obere Hälfte = Schild
    const geo = new THREE.PlaneGeometry(s.w, s.h);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5);
    const mesh = new THREE.Mesh(geo, mat);
    const n = facingN[s.facing];
    mesh.position.set(s.pos[0] + n[0] * 0.03, s.pos[1], s.pos[2] + n[2] * 0.03);
    mesh.rotation.y = facingRot[s.facing];
    group.add(mesh);
  }

  // ---------------------------------------------------------------- Bodenmarkierungen
  for (const d of map.decals) {
    const L = light(d.pos[0], d.pos[1], d.pos[2]);
    const c = new THREE.Color(d.color ?? 0xffffff).convertSRGBToLinear();
    const mat = new THREE.MeshBasicMaterial({
      map: d.kind === 'line' ? null : decalTexture(d.kind, d.text),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      opacity: d.kind === 'grid' ? 0.7 : d.kind === 'stain' ? 0.9 : 0.85,
      color: new THREE.Color(c.r * L[0], c.g * L[1], c.b * L[2]),
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.size[0], d.size[1]), mat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI / 2, d.rot ?? 0, 0);
    mesh.position.set(d.pos[0], d.pos[1], d.pos[2]);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // ---------------------------------------------------------------- Himmel, Sonne, Skyline
  group.add(buildSky(map));

  // ---------------------------------------------------------------- Lichtkegel (nur hoch)
  if (quality === 'high') {
    const coneGeo = new THREE.CylinderGeometry(0.35, 2.6, 5.5, 16, 1, true).translate(0, -2.75, 0);
    const cols = new Float32Array(coneGeo.getAttribute('position').count * 3);
    const pos = coneGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, 1 + pos.getY(i) / 5.5) * 0.05;
      cols[i * 3] = k;
      cols[i * 3 + 1] = k * 0.92;
      cols[i * 3 + 2] = k * 0.78;
    }
    coneGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const coneMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const lamps = map.decor.filter((d) => d.kind === 'lampHall');
    if (lamps.length) {
      const cones = new THREE.InstancedMesh(coneGeo, coneMat, lamps.length);
      lamps.forEach((d, i) => cones.setMatrixAt(i, m4.makeTranslation(d.pos[0], d.pos[1] - 0.25, d.pos[2])));
      cones.instanceMatrix.needsUpdate = true;
      cones.renderOrder = 2;
      cones.computeBoundingSphere();
      group.add(cones);
    }
    // Leuchthöfe um alle Lampen
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe6c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    for (const l of map.lights) {
      if (l.kind === 'window') continue;
      const sp = new THREE.Sprite(glowMat);
      sp.position.set(l.pos[0], l.pos[1] + 0.12, l.pos[2]);
      const sz = l.kind === 'tube' ? 1.4 : 1.1;
      sp.scale.set(sz, sz, sz);
      group.add(sp);
    }
  }

  // Lichtsonde (gecacht auf 2-m-Raster)
  const probes = new Map<string, RGB>();
  const probe = (x: number, y: number, z: number): RGB => {
    const k = `${Math.round(x / 2)},${Math.round(y / 2)},${Math.round(z / 2)}`;
    let v = probes.get(k);
    if (!v) {
      const a = light(Math.round(x / 2) * 2, Math.round(y / 2) * 2 + 1.2, Math.round(z / 2) * 2, [0, 1, 0]);
      const b = light(Math.round(x / 2) * 2, Math.round(y / 2) * 2 + 1.2, Math.round(z / 2) * 2, [0.7, 0.2, 0.7]);
      v = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      probes.set(k, v);
    }
    return v;
  };

  stats.ms = performance.now() - t0;
  return { group, bake, probe, stats };
}

/** Himmelskuppel mit Verlauf, Sonnenscheibe und Industrie-Skyline (folgt der Kamera). */
function buildSky(map: MapData): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'sky';
  const geo = new THREE.SphereGeometry(200, 32, 16);
  const pos = geo.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const top = new THREE.Color(map.env.skyTop);
  const hor = new THREE.Color(map.env.skyHorizon);
  const fog = new THREE.Color(map.env.fogColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 200;
    if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.55));
    else c.copy(hor).lerp(fog, Math.min(1, -y * 4));
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -100;
  root.add(dome);
  // Sonne
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff0c8, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  const sd = new THREE.Vector3(...map.env.sunDir).normalize();
  sun.position.copy(sd.multiplyScalar(180));
  sun.scale.set(42, 42, 42);
  sun.renderOrder = -99;
  root.add(sun);
  // Skyline: dunkle Hallen, Kräne, Schornsteine am Horizont
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 2048, 128);
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sil = new THREE.Color(map.env.fogColor).multiplyScalar(0.62);
  ctx.fillStyle = `rgb(${sil.r * 255 | 0},${sil.g * 255 | 0},${sil.b * 255 | 0})`;
  for (let x = 0; x < 2048;) {
    const w = 40 + rnd() * 140;
    const h = 18 + rnd() * 46;
    ctx.fillRect(x, 128 - h, w, h);
    if (rnd() < 0.25) ctx.fillRect(x + w * 0.3, 128 - h - 40 - rnd() * 30, 6, 60); // Schornstein
    if (rnd() < 0.15) {
      ctx.fillRect(x + w * 0.5, 128 - h - 70, 5, 70);
      ctx.fillRect(x + w * 0.5 - 50, 128 - h - 70, 110, 5); // Kran
    }
    x += w + rnd() * 30;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(190, 190, 34, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  band.position.y = 4;
  band.renderOrder = -98;
  root.add(band);
  // Kuppel folgt der Kamera (nie abgeschnitten, keine Parallaxe)
  dome.onBeforeRender = (_r, _s, cam) => {
    root.position.set(cam.position.x, cam.position.y * 0.15, cam.position.z);
    root.updateMatrixWorld(true);
  };
  return root;
}
