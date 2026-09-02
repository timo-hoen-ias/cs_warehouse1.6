import * as THREE from 'three';
import type { LevelFile } from '../shared/level';
import { computeSolids, type SolidBox } from '../logic/level';

const COLORS = {
  floor: 0x2a2f36,
  rack: 0x4c545e,
  rackEdge: 0x3a4046,
  wall: 0x22262c,
};

export type LevelBuild = {
  group: THREE.Group;
  solids: SolidBox[];
};

/**
 * Baut ein Level (LevelFile) als drei.js-Gruppe: Boden, Wände, Regale.
 * Kollision passiert über die soliden Boxen (computeSolids) — dieselben Werte
 * bekommt der FpsPlayer. Zell-Deko folgt in M1.
 */
export function buildLevelView(level: LevelFile): LevelBuild {
  const group = new THREE.Group();
  const solids = computeSolids(level.lager);

  const floorMat = new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95, metalness: 0 });
  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.85 });
  const rackMat = new THREE.MeshStandardMaterial({ color: COLORS.rack, roughness: 0.9 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: COLORS.rackEdge });

  buildFloor(group, solids, floorMat);
  for (const b of solids) {
    if (b.kind === 'wall') addSolidBox(group, b, wallMat);
    else if (b.kind === 'rack') addSolidBox(group, b, rackMat, edgeMat);
  }
  return { group, solids };
}

/** Bodenplatte bis zur Innenkante der Wände. */
function buildFloor(group: THREE.Group, solids: SolidBox[], mat: THREE.Material): void {
  const walls = solids.filter((s) => s.kind === 'wall');
  const pad = 0.05;
  const minX = Math.min(...walls.map((w) => w.minX)) + pad;
  const maxX = Math.max(...walls.map((w) => w.maxX)) - pad;
  const minZ = Math.min(...walls.map((w) => w.minZ)) + pad;
  const maxZ = Math.max(...walls.map((w) => w.maxZ)) - pad;
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addSolidBox(group: THREE.Group, b: SolidBox, mat: THREE.Material, edgeMat?: THREE.Material): void {
  const geo = new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  if (edgeMat) {
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, edgeMat);
    line.position.copy(mesh.position);
    group.add(line);
  }
}
