import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LevelFile, Prop } from '../shared/level';
import { computeSolids, type SolidBox } from '../logic/level';
import { BASE_H, LEVEL_GAP, SLOT, cellLocalPosition, cellSize, gangPlätze, isCatchAll, layoutRacks, type RackPlacement } from '../logic/layout';
import { propSolid } from '../logic/props';
import { mulberry32 } from '../logic/demo';
import { cageTexture, containerTexture, crateTexture, floorTexture, palletTexture, signTexture, spotTexture, wallTexture } from './textures';

export type LevelBuild = {
  group: THREE.Group;
  solids: SolidBox[];
  /** Begehbare Innenfläche (für Radar). */
  inner: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const CONTAINER_COLORS = ['#b5432b', '#2b6cb0', '#2f855a', '#b7791f'];
const POST = 0.09;
const BEAM_H = 0.12;

/** Instanz-Sammler: ein InstancedMesh je Bauteil für das ganze Level (wenige Draw-Calls). */
class Instances {
  private readonly list: { m: THREE.Matrix4; c?: THREE.Color }[] = [];
  constructor(private readonly geo: THREE.BufferGeometry, private readonly mat: THREE.Material, private readonly shadow = true) {}
  add(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, color?: THREE.Color): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    this.list.push({ m, c: color });
  }
  build(): THREE.InstancedMesh | null {
    if (!this.list.length) return null;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.list.length);
    this.list.forEach((e, i) => {
      mesh.setMatrixAt(i, e.m);
      if (e.c) mesh.setColorAt(i, e.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/**
 * Baut ein Level (LevelFile) als drei.js-Gruppe: Boden mit Markierungen, Wände,
 * Regale mit echter Struktur (Steher, Traversen, Paletten, Kartons — instanziert),
 * Requisiten, Zwischenebenen/Rampe, Beschilderung, Hallendach. Kollision läuft
 * über dieselben soliden Boxen (Regale/Wände aus computeSolids + Props + Strukturen).
 */
export function buildLevelView(level: LevelFile): LevelBuild {
  const group = new THREE.Group();
  const props = level.props ?? [];
  const structures = level.structures ?? [];
  const solids = [...computeSolids(level.lager), ...props.map(propSolid), ...structures];
  const racks = layoutRacks(level.lager.lagerorte);

  const walls = solids.filter((s) => s.kind === 'wall');
  const byLabel = (l: string) => walls.find((w) => w.label === l)!;
  const inner = { minX: byLabel('wand-west').maxX, maxX: byLabel('wand-ost').minX, minZ: byLabel('wand-nord').maxZ, maxZ: byLabel('wand-sued').minZ };
  const height = walls[0]?.maxY ?? 6;

  buildFloor(group, inner, racks);
  buildCeiling(group, inner, height);
  for (const b of walls) {
    const tex = wallTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 4, 1);
    addSolidBox(group, b, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  }
  buildRacks(group, racks);
  for (const p of props) addProp(group, p);
  for (const st of structures) addStructure(group, st);
  buildSigns(group, level, height);

  // Bombenspots als Boden-Decals
  for (const [letter, v] of [['A', level.zones.a], ['B', level.zones.b]] as const) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: spotTexture(letter), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(v[0], 0.02, v[2]);
    group.add(mesh);
  }
  return { group, solids, inner };
}

// ---------------------------------------------------------------- Regale

function buildRacks(group: THREE.Group, racks: RackPlacement[]): void {
  const rnd = mulberry32(31);
  const steel = new THREE.MeshStandardMaterial({ color: 0x2f5fb3, roughness: 0.45, metalness: 0.55 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8601c, roughness: 0.5, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ map: palletTexture(), roughness: 0.9 });
  const carton = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  // Kleinteile werfen keine Schatten (Schattenpass wäre sonst der teuerste Teil des Frames)
  const posts = new Instances(new THREE.BoxGeometry(POST, 1, POST), steel, false);
  const beams = new Instances(new THREE.BoxGeometry(1, BEAM_H, 0.07), orange, false);
  const pallets = new Instances(new THREE.BoxGeometry(1, 1, 1), wood, false);
  const cartons = new Instances(new THREE.BoxGeometry(1, 1, 1), carton, false);
  const backMat = new THREE.MeshStandardMaterial({ color: 0x1d2127, roughness: 1, side: THREE.DoubleSide });
  const shades = [0xb08a5a, 0xc39a67, 0x9c7a4c, 0xd1b48c, 0x8a6c45, 0xbfa37a];

  for (const r of racks) {
    const [ox, , oz] = r.origin;
    const w = r.size.w;
    const d = r.size.d;
    const h = r.size.h;
    if (!r.flat) {
      // Steher je Slot-Grenze, vorne und hinten
      for (let i = 0; i <= r.depth; i++) {
        const z = oz - d / 2 + i * SLOT;
        for (const sx of [-1, 1]) posts.add(ox + sx * (w / 2 - POST / 2), h / 2, z, 1, h, 1);
      }
      // Traversen je Ebene (vorne/hinten über die ganze Tiefe)
      for (let lv = 0; lv <= r.levels; lv++) {
        const y = Math.min(h - BEAM_H / 2, BASE_H + lv * (r.cellH + LEVEL_GAP) - BEAM_H / 2);
        for (const sx of [-1, 1]) beams.add(ox + sx * (w / 2 - 0.035), y, oz, d, 1, 1);
      }
      // Rückwand in der Regalmitte → keine Sicht durch leere Fächer (Kollision = Box)
      const back = new THREE.Mesh(new THREE.PlaneGeometry(d, h), backMat);
      back.rotation.y = Math.PI / 2;
      back.position.set(ox, h / 2, oz);
      group.add(back);
    }
    // Paletten + Kartons je Platz mit Bestand
    for (const platz of gangPlätze(r.ort, r.kind, r.gang)) {
      if (isCatchAll(platz)) continue;
      const [lx, ly, lz] = cellLocalPosition(platz, r);
      const c = cellSize(platz);
      const baseY = ly - c.h / 2;
      const filled = platz.bestaende.length > 0 || rnd() < 0.35;
      pallets.add(ox + lx, baseY + 0.07, oz + lz, c.w * 0.95, 0.14, c.d * 0.95);
      if (!filled) continue;
      const n = 1 + Math.floor(rnd() * 2);
      const bh = Math.max(0.2, (c.h - 0.2) * (0.45 + rnd() * 0.5));
      for (let k = 0; k < n; k++) {
        const bw = c.w * (n === 1 ? 0.82 : 0.4);
        const bx = ox + lx + (n === 1 ? 0 : (k === 0 ? -1 : 1) * c.w * 0.22);
        const color = new THREE.Color(shades[Math.floor(rnd() * shades.length)]!);
        cartons.add(bx, baseY + 0.14 + bh / 2, oz + lz, bw, bh, c.d * 0.8, color);
      }
    }
  }
  for (const inst of [posts, beams, pallets, cartons]) {
    const m = inst.build();
    if (m) group.add(m);
  }
}

// ---------------------------------------------------------------- Boden / Dach / Schilder

/** Bodenplatte bis zur Innenkante der Wände + gelbe Sicherheitsmarkierungen um Regale. */
function buildFloor(group: THREE.Group, inner: LevelBuild['inner'], racks: RackPlacement[]): void {
  const w = inner.maxX - inner.minX;
  const d = inner.maxZ - inner.minZ;
  const t = floorTexture().clone();
  t.needsUpdate = true;
  t.repeat.set(w / 2, d / 2);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((inner.minX + inner.maxX) / 2, 0, (inner.minZ + inner.maxZ) / 2);
  mesh.receiveShadow = true;
  group.add(mesh);

  // Markierungen: Rahmen 0.4 m außerhalb jeder Regal-Grundfläche, 0.1 m breit (ein Mesh)
  const geos: THREE.BufferGeometry[] = [];
  const strip = (x: number, z: number, sx: number, sz: number): void => {
    const g = new THREE.PlaneGeometry(sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.012, z);
    geos.push(g);
  };
  for (const r of racks) {
    const [ox, , oz] = r.origin;
    const hw = r.size.w / 2 + 0.4;
    const hd = r.size.d / 2 + 0.4;
    strip(ox, oz - hd, hw * 2, 0.1);
    strip(ox, oz + hd, hw * 2, 0.1);
    strip(ox - hw, oz, 0.1, hd * 2);
    strip(ox + hw, oz, 0.1, hd * 2);
  }
  if (geos.length) {
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const marks = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: 0xd9b400, transparent: true, opacity: 0.75, depthWrite: false }));
      group.add(marks);
    }
    for (const g of geos) g.dispose();
  }
}

/** Hallendach (dunkel) + Träger + Leuchtbalken (instanziert). */
function buildCeiling(group: THREE.Group, inner: LevelBuild['inner'], height: number): void {
  const w = inner.maxX - inner.minX;
  const d = inner.maxZ - inner.minZ;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x1b1f25, roughness: 1, side: THREE.DoubleSide }));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set((inner.minX + inner.maxX) / 2, height, (inner.minZ + inner.maxZ) / 2);
  group.add(mesh);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x3a4149, roughness: 0.8 });
  const step = 8;
  const beamXs: number[] = [];
  for (let x = inner.minX + step / 2; x < inner.maxX; x += step) beamXs.push(x);
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.5, d), beamMat, beamXs.length);
  const m4 = new THREE.Matrix4();
  beamXs.forEach((x, i) => beams.setMatrixAt(i, m4.makeTranslation(x, height - 0.25, (inner.minZ + inner.maxZ) / 2)));
  group.add(beams);
  const lampPos: [number, number][] = [];
  for (const x of beamXs) for (let z = inner.minZ + 6; z < inner.maxZ; z += 12) lampPos.push([x, z]);
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.08, 1.6), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }), lampPos.length);
  lampPos.forEach(([x, z], i) => lamps.setMatrixAt(i, m4.makeTranslation(x, height - 0.55, z)));
  group.add(lamps);
}

/** Hängende Schilder: Bereiche (Wareneingang/Versand/Spots) + Gangnummern. */
function buildSigns(group: THREE.Group, level: LevelFile, height: number): void {
  const sign = (text: string, color: string, x: number, z: number, rotY = 0, w = 4): void => {
    const tex = signTexture(text, color);
    tex.repeat.set(1, 0.3);
    tex.offset.set(0, 0.35);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    // Zwei einseitige Flächen Rücken an Rücken → Text von beiden Seiten lesbar (nicht gespiegelt)
    for (const flip of [0, Math.PI]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3), mat);
      mesh.position.set(x, height - 1.4, z);
      mesh.rotation.y = rotY + flip;
      group.add(mesh);
    }
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), new THREE.MeshBasicMaterial({ color: 0x777777 }));
    chain.position.set(x, height - 0.5, z);
    group.add(chain);
  };
  const z = level.zones;
  sign('WARENEINGANG', '#ffb070', z.t[0], z.t[2] + 4, 0, 5);
  sign('VERSAND', '#8fc0ff', z.ct[0], z.ct[2] - 4, 0, 5);
  sign('BOMBENSPOT A', '#ff5a4a', z.a[0], z.a[2], Math.PI / 2, 4.5);
  sign('BOMBENSPOT B', '#ffb13a', z.b[0], z.b[2], Math.PI / 2, 4.5);
  const racks = layoutRacks(level.lager.lagerorte);
  const seen = new Set<string>();
  let n = 1;
  for (const r of racks) {
    const key = r.ort.lagerkennung;
    if (seen.has(key)) continue;
    seen.add(key);
    sign(`GANG ${n++} · ${key}`, '#dfe6ee', r.origin[0], r.origin[2] - r.size.d / 2 - 1.5, 0, 3);
  }
}

// ---------------------------------------------------------------- Boxen

function addSolidBox(group: THREE.Group, b: SolidBox, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
  const geo = new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

const STRUCT_MATS: Partial<Record<SolidBox['kind'], THREE.Material>> = {};
function structMat(kind: SolidBox['kind']): THREE.Material {
  let m = STRUCT_MATS[kind];
  if (m) return m;
  switch (kind) {
    case 'platform': m = new THREE.MeshStandardMaterial({ map: cageTexture(), color: 0x8a949c, roughness: 0.6, metalness: 0.5 }); break;
    case 'step': m = new THREE.MeshStandardMaterial({ color: 0x6a6f76, roughness: 0.95 }); break;
    case 'pillar': m = new THREE.MeshStandardMaterial({ color: 0x2f5fb3, roughness: 0.5, metalness: 0.5 }); break;
    case 'rail': m = new THREE.MeshStandardMaterial({ color: 0xd9b400, roughness: 0.5, metalness: 0.4 }); break;
    case 'dock': m = new THREE.MeshStandardMaterial({ map: floorTexture(), color: 0x9aa0a8, roughness: 0.95 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: 0x888888 });
  }
  STRUCT_MATS[kind] = m;
  return m;
}

/** Struktur-Teil rendern: Plattform (Gitterrost), Stufen (Beton), Stützen (Stahl), Geländer (gelb), Rampe (Beton). */
function addStructure(group: THREE.Group, s: SolidBox): void {
  addSolidBox(group, s, structMat(s.kind));
  if (s.kind === 'dock') {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(s.maxX - s.minX, 0.02, 0.3), new THREE.MeshBasicMaterial({ color: 0xd9b400 }));
    edge.position.set((s.minX + s.maxX) / 2, s.maxY + 0.01, s.minZ + 0.15);
    group.add(edge);
  }
}

/** Requisite rendern (Paletten-Stapel, Gitterbox, Kiste, Container). */
function addProp(group: THREE.Group, p: Prop): void {
  const s = propSolid(p);
  let mat: THREE.Material;
  switch (p.kind) {
    case 'pallet': {
      const t = palletTexture().clone();
      t.needsUpdate = true;
      t.repeat.set(1, Math.max(1, Math.round(p.size[1] / 0.55)));
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
      break;
    }
    case 'cage':
      mat = new THREE.MeshStandardMaterial({ map: cageTexture(), roughness: 0.6, metalness: 0.3 });
      break;
    case 'crate':
      mat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 });
      break;
    case 'container': {
      const color = CONTAINER_COLORS[Math.abs(Math.round(p.pos[0] + p.pos[2])) % CONTAINER_COLORS.length]!;
      const t = containerTexture(color).clone();
      t.needsUpdate = true;
      t.repeat.set(Math.max(1, Math.round(Math.max(p.size[0], p.size[2]) / 1.2)), 1);
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.25 });
      break;
    }
  }
  addSolidBox(group, s, mat);
}
