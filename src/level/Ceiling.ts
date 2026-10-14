import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CEILING, floorLight, lampGrid, spread, trussPositions } from '../logic/ceiling';
import { roofTexture } from './textures';

type Inner = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Hallendach (Darstellung): Trapezblech mit Lichtbändern, Fachwerkbinder mit Diagonalen,
 * Pfetten, Lüftungskanal, Sprinklerleitungen und abgehängte Hallenstrahler mit Lichtkegeln.
 * Alles instanziert bzw. zusammengeführt (wenige Draw-Calls). Positionen aus logic/ceiling.ts.
 */
export function buildCeiling(group: THREE.Group, inner: Inner, height: number, quality: 'high' | 'low'): void {
  const w = inner.maxX - inner.minX;
  const d = inner.maxZ - inner.minZ;
  const cx = (inner.minX + inner.maxX) / 2;
  const cz = (inner.minZ + inner.maxZ) / 2;
  const steel = new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.55, metalness: 0.6 });

  // Trapezblech (Unterseite des Dachs)
  const roofTex = roofTexture().clone();
  roofTex.needsUpdate = true;
  roofTex.repeat.set(w / 1.2, d / 6);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: roofTex, color: 0x6a727c, roughness: 0.6, metalness: 0.45 }));
  roof.rotation.x = Math.PI / 2;
  roof.position.set(cx, height, cz);
  group.add(roof);

  // Lichtbänder: zwischen jedem zweiten Binderpaar ein Oberlicht-Streifen über die ganze Hallentiefe
  const trussXs = trussPositions(inner);
  const skyGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < trussXs.length; i += 2) {
    const g = new THREE.PlaneGeometry(1.8, d - 2);
    g.rotateX(Math.PI / 2);
    g.translate((trussXs[i]! + trussXs[i + 1]!) / 2, height - 0.02, cz);
    skyGeos.push(g);
  }
  if (skyGeos.length) {
    const sky = new THREE.Mesh(mergeGeometries(skyGeos, false)!, new THREE.MeshBasicMaterial({ color: 0xc9dced, side: THREE.DoubleSide }));
    group.add(sky);
    skyGeos.forEach((g) => g.dispose());
  }

  // Fachwerkbinder: Ober-/Untergurt, Pfosten und Diagonalen (eine Geometrie, je Binder instanziert)
  const td = CEILING.trussDepth;
  const parts: THREE.BufferGeometry[] = [];
  const chord = (y: number): void => {
    const g = new THREE.BoxGeometry(0.22, 0.22, d);
    g.translate(0, y, 0);
    parts.push(g);
  };
  chord(-0.15);
  chord(-td);
  const panel = 2.5;
  const nPanels = Math.max(2, Math.round(d / panel));
  const pw = d / nPanels;
  for (let i = 0; i <= nPanels; i++) {
    const z = -d / 2 + i * pw;
    const post = new THREE.BoxGeometry(0.12, td - 0.15, 0.12);
    post.translate(0, -(td + 0.15) / 2, z);
    parts.push(post);
    if (i < nPanels) {
      const len = Math.hypot(pw, td - 0.15);
      const diag = new THREE.BoxGeometry(0.1, len, 0.1);
      diag.rotateX((i % 2 === 0 ? 1 : -1) * Math.atan2(pw, td - 0.15));
      diag.translate(0, -(td + 0.15) / 2, z + pw / 2);
      parts.push(diag);
    }
  }
  const trussGeo = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  const trusses = new THREE.InstancedMesh(trussGeo, steel, trussXs.length);
  const m4 = new THREE.Matrix4();
  trussXs.forEach((x, i) => trusses.setMatrixAt(i, m4.makeTranslation(x, height, cz)));
  trusses.castShadow = false;
  group.add(trusses);

  // Pfetten (quer, auf den Bindern)
  const purlinZs = spread(inner.minZ, inner.maxZ, 3);
  const purlins = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.18, 0.1), steel, purlinZs.length);
  purlinZs.forEach((z, i) => purlins.setMatrixAt(i, m4.makeTranslation(cx, height - 0.1, z)));
  group.add(purlins);

  // Lüftungskanal (verzinkt) längs der Halle, mit Flanschen
  const ductMat = new THREE.MeshStandardMaterial({ color: 0xb4bcc4, roughness: 0.35, metalness: 0.8 });
  const ductX = cx + w * 0.22;
  const ductY = height - td - 0.7;
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, d - 4, 16, 1, true), ductMat);
  duct.rotation.x = Math.PI / 2;
  duct.position.set(ductX, ductY, cz);
  group.add(duct);
  const flangeZs = spread(inner.minZ + 2, inner.maxZ - 2, 3);
  const flanges = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16), ductMat, flangeZs.length);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  flangeZs.forEach((z, i) => flanges.setMatrixAt(i, m4.compose(new THREE.Vector3(ductX, ductY, z), q, new THREE.Vector3(1, 1, 1))));
  group.add(flanges);
  // Abhänger des Kanals
  const hangerGeo = new THREE.BoxGeometry(0.04, td + 0.7 - 0.45, 0.04);
  const hangers = new THREE.InstancedMesh(hangerGeo, steel, flangeZs.length);
  flangeZs.forEach((z, i) => hangers.setMatrixAt(i, m4.makeTranslation(ductX, height - (td + 0.7 - 0.45) / 2, z)));
  group.add(hangers);

  // Sprinklerleitungen (rot) quer zur Halle
  const pipeZs = spread(inner.minZ, inner.maxZ, 6);
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5, metalness: 0.3 });
  const pipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, w, 8), pipeMat, pipeZs.length);
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  pipeZs.forEach((z, i) => pipes.setMatrixAt(i, m4.compose(new THREE.Vector3(cx, height - 0.55, z), qz, new THREE.Vector3(1, 1, 1))));
  group.add(pipes);

  // Hallenstrahler: Pendel, Reflektorhaube, leuchtende Abdeckung, optional Lichtkegel
  const lamps = lampGrid(inner);
  const lampY = height - CEILING.lampDrop;
  const cable = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, CEILING.lampDrop - td, 0.02), steel, lamps.length);
  const shade = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.42, 0.34, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }), lamps.length);
  const bulbGeo = new THREE.CircleGeometry(0.38, 16);
  bulbGeo.rotateX(Math.PI / 2);
  const bulb = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xfff3d6, side: THREE.DoubleSide }), lamps.length);
  lamps.forEach((l, i) => {
    cable.setMatrixAt(i, m4.makeTranslation(l.x, height - td - (CEILING.lampDrop - td) / 2, l.z + 0.6));
    shade.setMatrixAt(i, m4.makeTranslation(l.x, lampY + 0.17, l.z + 0.6));
    bulb.setMatrixAt(i, m4.makeTranslation(l.x, lampY + 0.01, l.z + 0.6));
  });
  group.add(cable, shade, bulb);

  if (quality === 'high') {
    // Lichtkegel (additiv, sehr transparent) — Atmosphäre in der staubigen Halle
    const coneH = lampY - 0.2;
    const coneGeo = new THREE.CylinderGeometry(0.38, 3.2, coneH, 20, 1, true);
    coneGeo.translate(0, -coneH / 2, 0);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.032, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cones = new THREE.InstancedMesh(coneGeo, coneMat, lamps.length);
    lamps.forEach((l, i) => cones.setMatrixAt(i, m4.makeTranslation(l.x, lampY, l.z + 0.6)));
    cones.renderOrder = 2;
    group.add(cones);
  }
}

/**
 * Gebackene Boden-Licht-Map: helle Lichtflecken unter den Strahlern, dunklere Ränder.
 * Wird als `lightMap` auf den Hallenboden gelegt (kostet zur Laufzeit nichts).
 */
export function floorLightMap(inner: Inner, size = 256): THREE.CanvasTexture {
  const w = inner.maxX - inner.minX;
  const d = inner.maxZ - inner.minZ;
  const cw = size;
  const ch = Math.max(16, Math.round((size * d) / w));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch);
  const lamps = lampGrid(inner).map((l) => ({ x: l.x, z: l.z + 0.6 }));
  for (let py = 0; py < ch; py++) {
    // PlaneGeometry (rotiert −90° um X): v=0 liegt bei maxZ, v=1 bei minZ → Canvas-Zeile 0 = minZ
    const z = inner.minZ + ((py + 0.5) / ch) * d;
    for (let px = 0; px < cw; px++) {
      const x = inner.minX + ((px + 0.5) / cw) * w;
      // nur die Lichtflecken backen (Grundhelligkeit liefern die Echtzeit-Lichter)
      const v = Math.round(255 * Math.max(0, floorLight(x, z, lamps, 0) ));
      const o = (py * cw + px) * 4;
      img.data[o] = Math.min(255, v + 6);
      img.data[o + 1] = v;
      img.data[o + 2] = Math.max(0, v - 10);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = true;
  return tex;
}
