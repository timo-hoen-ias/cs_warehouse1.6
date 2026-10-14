import * as THREE from 'three';
import type { LevelFile, Prop } from '../shared/level';
import { computeSolids, type SolidBox } from '../logic/level';
import { layoutRacks } from '../logic/layout';
import { propSolid } from '../logic/props';
import { cageTexture, containerTexture, crateTexture, floorTexture, palletTexture, rackTexture, spotTexture, wallTexture } from './textures';

export type LevelBuild = {
  group: THREE.Group;
  solids: SolidBox[];
  /** Begehbare Innenfläche (für Radar). */
  inner: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const CONTAINER_COLORS = ['#b5432b', '#2b6cb0', '#2f855a', '#b7791f'];

/**
 * Baut ein Level (LevelFile) als drei.js-Gruppe: Boden, Wände, Regale, Requisiten,
 * Bombenspot-Markierungen. Kollision passiert über dieselben soliden Boxen
 * (Regale/Wände aus computeSolids + Props) — Sicht und Physik stimmen überein.
 */
export function buildLevelView(level: LevelFile): LevelBuild {
  const group = new THREE.Group();
  const props = level.props ?? [];
  const solids = [...computeSolids(level.lager), ...props.map(propSolid)];
  const racks = layoutRacks(level.lager.lagerorte);
  const rackKind = new Map(racks.map((r) => [r.key, r.kind]));

  const floorTex = floorTexture();
  const wallTex = wallTexture();
  const rackTex = rackTexture();
  const palletTex = palletTexture();
  const walls = solids.filter((s) => s.kind === 'wall');
  const inner = {
    minX: Math.min(...walls.map((w) => w.maxX).filter((_, i) => walls[i]!.label === 'wand-west')),
    maxX: Math.max(...walls.map((w) => w.minX).filter((_, i) => walls[i]!.label === 'wand-ost')),
    minZ: Math.min(...walls.map((w) => w.maxZ).filter((_, i) => walls[i]!.label === 'wand-nord')),
    maxZ: Math.max(...walls.map((w) => w.minZ).filter((_, i) => walls[i]!.label === 'wand-sued')),
  };

  buildFloor(group, inner, floorTex);
  buildCeiling(group, inner, walls[0]?.maxY ?? 6);

  for (const b of solids) {
    if (b.kind === 'wall') {
      const tex = wallTex.clone();
      tex.needsUpdate = true;
      const len = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      tex.repeat.set(len / 4, 1);
      addSolidBox(group, b, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    } else if (b.kind === 'rack') {
      const kind = rackKind.get(b.label);
      const h = b.maxY - b.minY;
      if (kind === 'rack') {
        // Hochregal: Fach-Kachel je Slot (1 m) × Ebene (~0.7 m)
        const tex = rackTex.clone();
        tex.needsUpdate = true;
        const w = b.maxX - b.minX;
        const d = b.maxZ - b.minZ;
        const levels = Math.max(1, Math.round((h - 0.5) / 0.7));
        const mats = [
          rackMat(tex, d, levels), rackMat(tex, d, levels),  // ±X (Längsseiten)
          new THREE.MeshStandardMaterial({ color: 0x3b4149, roughness: 0.9 }), // oben
          new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.9 }), // unten
          rackMat(tex, w, levels), rackMat(tex, w, levels),  // ±Z (Stirnseiten)
        ];
        addSolidBox(group, b, mats);
      } else {
        // Flächen-/Blocklager: niedrige Palettenblöcke
        const tex = palletTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(b.maxX - b.minX)), Math.max(1, Math.round(b.maxZ - b.minZ)));
        addSolidBox(group, b, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      }
    }
  }

  for (const p of props) addProp(group, p);

  // Bombenspots als Boden-Decals
  for (const [letter, v] of [['A', level.zones.a], ['B', level.zones.b]] as const) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: spotTexture(letter), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(v[0], 0.015, v[2]);
    group.add(mesh);
  }

  return { group, solids, inner };
}

function rackMat(tex: THREE.CanvasTexture, len: number, levels: number): THREE.MeshStandardMaterial {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(1, Math.round(len)), levels);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
}

/** Bodenplatte bis zur Innenkante der Wände. */
function buildFloor(group: THREE.Group, inner: LevelBuild['inner'], tex: THREE.CanvasTexture): void {
  const w = inner.maxX - inner.minX;
  const d = inner.maxZ - inner.minZ;
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / 2, d / 2);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((inner.minX + inner.maxX) / 2, 0, (inner.minZ + inner.maxZ) / 2);
  mesh.receiveShadow = true;
  group.add(mesh);
}

/** Hallendach (dunkel, von unten sichtbar) + Träger. */
function buildCeiling(group: THREE.Group, inner: LevelBuild['inner'], height: number): void {
  const w = inner.maxX - inner.minX;
  const d = inner.maxZ - inner.minZ;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x1b1f25, roughness: 1, side: THREE.DoubleSide }));
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set((inner.minX + inner.maxX) / 2, height, (inner.minZ + inner.maxZ) / 2);
  group.add(mesh);
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x3a4149, roughness: 0.8 });
  const step = 8;
  for (let x = inner.minX + step / 2; x < inner.maxX; x += step) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, d), beamMat);
    beam.position.set(x, height - 0.25, (inner.minZ + inner.maxZ) / 2);
    group.add(beam);
  }
  // Hallenbeleuchtung: Leuchtbalken (emissiv, kein echtes Licht → günstig)
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
  for (let x = inner.minX + step / 2; x < inner.maxX; x += step) {
    for (let z = inner.minZ + 6; z < inner.maxZ; z += 12) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 1.6), lampMat);
      lamp.position.set(x, height - 0.55, z);
      group.add(lamp);
    }
  }
}

function addSolidBox(group: THREE.Group, b: SolidBox, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
  const geo = new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Requisite rendern (Paletten-Stapel, Gitterbox, Kiste, Container). */
function addProp(group: THREE.Group, p: Prop): void {
  const s = propSolid(p);
  let mat: THREE.Material | THREE.Material[];
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
