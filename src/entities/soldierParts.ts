import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Team } from '../logic/economy';
import { LEG, type V3 } from './soldierAnim';
import { SHOULDER_X, SHOULDER_Y, TORSO_PIVOT_Y, armJoints, elbowPole, leftShoulder, rightShoulder } from './soldierHold';

export { SHOULDER_X, SHOULDER_Y, TORSO_PIVOT_Y };

/**
 * Prozedurale Low-Poly-Geometrie für den Soldaten (CS-1.6-Look).
 * Alles wird pro Körperteil zu EINER Geometrie mit Vertex-Farben verschmolzen
 * (ein Mesh/Draw-Call je Teil). Koordinaten: Füße bei y=0, Modell blickt +Z.
 */

type Palette = {
  cloth: number; clothAlt: number[]; pants: number; pantsAlt: number[];
  vest: number; pouch: number; gear: number; glove: number; boot: number; sole: number;
  skin: number; patch: number; cap: number; capAccent: number; accent: number; lens: number;
  pack: number; olive: number;
};

const PAL: Record<Team, Palette> = {
  T: {
    cloth: 0xb89c68, clothAlt: [0x8b7141, 0x6f6a3c, 0xc3a972], pants: 0xa98c5a, pantsAlt: [0x7d6638, 0x6a6338, 0xb59b69],
    vest: 0x5a4830, pouch: 0x7d6944, gear: 0x2a2218, glove: 0x2c2118, boot: 0x4a3322, sole: 0x1a1410,
    skin: 0xc99a72, patch: 0xf0551c, cap: 0x1c1c1e, capAccent: 0xa8281c, accent: 0xe8501c, lens: 0x000000,
    pack: 0x5b4d30, olive: 0x4f5a30,
  },
  CT: {
    cloth: 0x2d4a82, clothAlt: [], pants: 0x243e6e, pantsAlt: [],
    vest: 0x161b28, pouch: 0x2a3550, gear: 0x14161b, glove: 0x0e0f12, boot: 0x131417, sole: 0x08090a,
    skin: 0xd9b090, patch: 0x4aa8ff, cap: 0x1c2a48, capAccent: 0x2f4270, accent: 0x4aa8ff, lens: 0x74c8ff,
    pack: 0x1a2232, olive: 0x4a5a38,
  },
};

const col = new THREE.Color();
const mat = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const eul = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Sammelt Teilgeometrien (mit Vertex-Farben) und verschmilzt sie zu einer Geometrie. */
class GeoBuilder {
  private readonly list: THREE.BufferGeometry[] = [];

  private push(g: THREE.BufferGeometry, m: THREE.Matrix4, color: number, ao: number): void {
    g.applyMatrix4(m);
    g.deleteAttribute('uv');
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    col.setHex(color);
    const h = Math.max(1e-4, bb.max.y - bb.min.y);
    for (let i = 0; i < pos.count; i++) {
      // Gefälschte Umgebungsverdunklung: unten dunkler, oben heller
      const k = 1 - ao + ao * ((pos.getY(i) - bb.min.y) / h);
      colors[i * 3] = col.r * k;
      colors[i * 3 + 1] = col.g * k;
      colors[i * 3 + 2] = col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.list.push(g);
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, ry = 0, rz = 0, ao = 0.14): this {
    quat.setFromEuler(eul.set(rx, ry, rz));
    this.push(new THREE.BoxGeometry(w, h, d), mat.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(1, 1, 1)), color, ao);
    return this;
  }

  cyl(rTop: number, rBot: number, h: number, sides: number, x: number, y: number, z: number, color: number, rx = 0, ry = 0, rz = 0, ao = 0.14): this {
    quat.setFromEuler(eul.set(rx, ry, rz));
    this.push(new THREE.CylinderGeometry(rTop, rBot, h, sides, 1), mat.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(1, 1, 1)), color, ao);
    return this;
  }

  /** Ellipsoid bzw. Halbkugel (half = obere Hälfte), niedrige Segmentzahl. */
  ellipsoid(rx: number, ry: number, rz: number, x: number, y: number, z: number, color: number, half = false, ao = 0.12): this {
    const g = half ? new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(1, 8, 6);
    this.push(g, mat.compose(new THREE.Vector3(x, y, z), quat.identity(), new THREE.Vector3(rx, ry, rz)), color, ao);
    return this;
  }

  /** Kegelstumpf von a nach b (r0 bei a, r1 bei b). */
  seg(a: V3, b: V3, r0: number, r1: number, color: number, sides = 6, ao = 0.14): this {
    const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = dir.length();
    if (len < 1e-5) return this;
    quat.setFromUnitVectors(UP, dir.normalize());
    this.push(new THREE.CylinderGeometry(r1, r0, len, sides, 1), mat.compose(new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), quat, new THREE.Vector3(1, 1, 1)), color, ao);
    return this;
  }

  /** Dünne Tarnflecken auf einer senkrechten Zylinderfläche (Achse x0/z0, Radius r). */
  camo(count: number, seed: number, x0: number, z0: number, y0: number, y1: number, r: number, colors: number[], size = 0.07): this {
    if (!colors.length) return this;
    let s = seed;
    const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const y = y0 + rnd() * (y1 - y0);
      const w = size * (0.6 + rnd() * 0.9);
      const hh = size * (0.5 + rnd() * 0.8);
      const c = colors[Math.floor(rnd() * colors.length)]!;
      this.box(w, hh, 0.012, x0 + Math.sin(a) * (r + 0.002), y, z0 + Math.cos(a) * (r + 0.002), c, 0, a, 0, 0.05);
    }
    return this;
  }

  /** Verschmilzt alles (Farben pro Vertex) und verschiebt um (-ox, -oy, -oz). */
  build(ox = 0, oy = 0, oz = 0): THREE.BufferGeometry {
    const merged = mergeGeometries(this.list, false)!;
    for (const g of this.list) g.dispose();
    this.list.length = 0;
    merged.translate(-ox, -oy, -oz);
    merged.computeBoundingSphere();
    return merged;
  }
}

// ------------------------------------------------------------------ Oberkörper

/** Torso + Kopf + Rucksack + Weste (alles statisch → ein Mesh). Ursprung = Hüftdrehpunkt. */
export function buildTorsoGeometry(team: Team): THREE.BufferGeometry {
  const p = PAL[team];
  const b = new GeoBuilder();
  const T = team === 'T';
  // Becken, Gürtel, Holster
  b.box(0.4, 0.16, 0.25, 0, 0.9, 0, p.pants);
  b.box(0.42, 0.05, 0.27, 0, 0.98, 0, p.gear);
  b.box(0.07, 0.16, 0.1, -0.24, 0.86, 0.02, p.gear);
  b.box(0.03, 0.05, 0.05, -0.24, 0.96, 0.0, p.gear);
  b.box(0.08, 0.08, 0.06, -0.14, 0.98, 0.15, p.pouch);
  b.box(0.08, 0.08, 0.06, -0.05, 0.98, 0.15, p.pouch);
  b.box(0.1, 0.08, 0.06, 0.12, 0.98, 0.15, p.pouch);
  // Hemd
  b.box(0.4, 0.2, 0.24, 0, 1.08, 0, p.cloth);
  b.box(0.45, 0.3, 0.25, 0, 1.28, 0, p.cloth);
  if (T) b.camo(10, 7, 0, 0, 1.0, 1.4, 0.2, p.clothAlt, 0.09);
  // Weste: Front-/Rückenplatte, Seitenteile, Schulterriemen
  b.box(0.4, 0.38, 0.07, 0, 1.22, 0.13, p.vest);
  b.box(0.4, 0.38, 0.06, 0, 1.22, -0.13, p.vest);
  b.box(0.06, 0.22, 0.27, -0.215, 1.1, 0, p.vest);
  b.box(0.06, 0.22, 0.27, 0.215, 1.1, 0, p.vest);
  b.box(0.1, 0.04, 0.31, -0.125, 1.425, 0, p.vest);
  b.box(0.1, 0.04, 0.31, 0.125, 1.425, 0, p.vest);
  // Magazintaschen (+ Klappen) vorn
  for (const x of [-0.125, 0, 0.125]) {
    b.box(0.095, 0.13, 0.05, x, 1.1, 0.19, p.pouch);
    b.box(0.095, 0.035, 0.056, x, 1.17, 0.19, p.gear);
  }
  // Granate rechts, Funkgerät/Brusttaschen links
  b.cyl(0.026, 0.026, 0.1, 6, 0.17, 1.31, 0.19, p.olive);
  b.cyl(0.014, 0.014, 0.02, 6, 0.17, 1.37, 0.19, p.gear);
  if (T) {
    b.box(0.085, 0.07, 0.05, -0.12, 1.31, 0.19, p.pouch);
    b.box(0.085, 0.07, 0.05, -0.02, 1.31, 0.19, p.pouch);
  } else {
    b.box(0.055, 0.11, 0.045, -0.15, 1.33, 0.19, p.gear);
    b.cyl(0.006, 0.006, 0.16, 4, -0.16, 1.46, 0.19, p.gear, 0.12, 0, 0);
    b.box(0.02, 0.02, 0.01, -0.15, 1.28, 0.218, p.lens);
  }
  // Rucksack
  if (T) {
    b.box(0.34, 0.4, 0.15, 0, 1.2, -0.23, p.pack);
    b.box(0.07, 0.2, 0.12, -0.2, 1.12, -0.22, p.pouch);
    b.box(0.07, 0.2, 0.12, 0.2, 1.12, -0.22, p.pouch);
    b.cyl(0.07, 0.07, 0.4, 8, 0, 1.45, -0.24, p.olive, 0, 0, Math.PI / 2);
  } else {
    b.box(0.32, 0.36, 0.12, 0, 1.2, -0.21, p.pack);
    b.box(0.14, 0.17, 0.06, -0.06, 1.28, -0.3, p.gear);
    b.cyl(0.007, 0.007, 0.3, 4, -0.1, 1.5, -0.3, p.gear, -0.12, 0, 0.1);
    b.box(0.1, 0.12, 0.05, 0.08, 1.12, -0.29, p.pouch);
  }
  // Hals + Kopf
  b.cyl(0.06, 0.065, 0.09, 6, 0, 1.43, 0, T ? p.cap : p.skin);
  b.ellipsoid(0.112, 0.128, 0.12, 0, 1.53, 0, p.skin, false, 0.1);
  if (T) {
    // Sturmhaube (unteres Gesicht + Oberkopf, Augenschlitz bleibt Haut), Stirnband, Knoten
    b.box(0.218, 0.105, 0.232, 0, 1.468, 0, p.cap);
    b.ellipsoid(0.118, 0.092, 0.126, 0, 1.572, 0, p.cap, true);
    b.box(0.246, 0.036, 0.256, 0, 1.585, 0, p.capAccent, 0, 0, 0, 0.08);
    b.box(0.05, 0.07, 0.04, 0.04, 1.575, -0.14, p.capAccent, 0, 0, 0.3);
    b.box(0.035, 0.1, 0.014, 0.08, 1.51, -0.152, p.capAccent, 0, 0, 0.25);
    b.box(0.035, 0.016, 0.012, -0.045, 1.55, 0.118, p.gear, 0, 0, 0, 0);
    b.box(0.035, 0.016, 0.012, 0.045, 1.55, 0.118, p.gear, 0, 0, 0, 0);
  } else {
    // Helm, Ohrenschutz, Stirnlampe, Schutzbrille
    b.ellipsoid(0.138, 0.125, 0.15, 0, 1.55, -0.005, p.cap, true, 0.2);
    b.box(0.292, 0.026, 0.3, 0, 1.553, -0.005, p.capAccent, 0, 0, 0, 0.05);
    b.box(0.022, 0.09, 0.11, -0.135, 1.51, -0.01, p.capAccent);
    b.box(0.022, 0.09, 0.11, 0.135, 1.51, -0.01, p.capAccent);
    b.box(0.06, 0.04, 0.04, 0, 1.625, 0.15, p.gear);
    b.box(0.24, 0.05, 0.24, 0, 1.54, -0.005, p.gear, 0, 0, 0, 0.05);
    b.box(0.2, 0.065, 0.03, 0, 1.54, 0.115, p.gear, 0, 0, 0, 0.05);
    b.box(0.085, 0.05, 0.03, -0.052, 1.54, 0.13, p.lens, 0, 0, 0, 0);
    b.box(0.085, 0.05, 0.03, 0.052, 1.54, 0.13, p.lens, 0, 0, 0, 0);
    b.box(0.03, 0.04, 0.03, 0, 1.495, 0.118, p.skin);
    b.box(0.1, 0.03, 0.02, 0, 1.46, 0.105, p.gear, 0, 0, 0, 0); // Kinnriemen/Mikrofon
  }
  return b.build(0, TORSO_PIVOT_Y, 0);
}

// ------------------------------------------------------------------ Arme

/**
 * Ein Arm (Schulter → Ellbogen → Handgelenk → Hand), Ursprung der Geometrie = Schulterpunkt.
 * `side` = Körperseite des Soldaten (R bei −x, L bei +x; der Soldat blickt nach +z). `hand` = Handflächenmitte
 * (absolut, Soldatenhaltung aus soldierHold.ts); Segmentlängen sind fest.
 */
export function buildArmGeometry(team: Team, side: 'L' | 'R', hand: V3): THREE.BufferGeometry {
  const p = PAL[team];
  const sgn = side === 'L' ? 1 : -1; // nach außen
  const S: V3 = side === 'L' ? leftShoulder() : rightShoulder();
  const H = hand;
  const { elbow: E, wrist: W } = armJoints(S, H, elbowPole(side));
  const fx = H.x - W.x, fy = H.y - W.y, fz = H.z - W.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const T = team === 'T';
  const b = new GeoBuilder();
  b.ellipsoid(0.075, 0.07, 0.07, S.x + sgn * 0.01, S.y - 0.01, S.z, p.cloth);
  b.seg(S, E, 0.06, 0.052, p.cloth, 6);
  b.seg(E, W, 0.052, 0.042, p.cloth, 6);
  // Ellbogenschützer und Handschuh (Handschuh reicht vom Handgelenk über die Handflächenmitte hinaus)
  b.box(0.08, 0.07, 0.08, E.x, E.y, E.z, p.gear);
  b.seg(W, { x: H.x + (fx / fl) * 0.05, y: H.y + (fy / fl) * 0.05, z: H.z + (fz / fl) * 0.05 }, 0.047, 0.043, p.glove, 6, 0.08);
  b.box(0.034, 0.034, 0.07, H.x - sgn * 0.045, H.y + 0.01, H.z + 0.03, p.glove, 0, 0, 0, 0.05);
  // Schulterabzeichen (Teamfarbe) außen am Oberarm
  const ux = S.x + (E.x - S.x) * 0.3 + sgn * 0.066;
  const uy = S.y + (E.y - S.y) * 0.3 - 0.01;
  const uz = S.z + (E.z - S.z) * 0.3;
  b.box(0.014, 0.075, 0.06, ux, uy, uz, p.patch, 0, 0, 0, 0);
  if (T) b.camo(3, side === 'L' ? 11 : 12, (S.x + E.x) / 2, (S.z + E.z) / 2, Math.min(S.y, E.y), Math.max(S.y, E.y), 0.05, p.clothAlt, 0.05);
  return b.build(S.x, S.y, S.z);
}

// ------------------------------------------------------------------ Beine

/** Oberschenkel; Ursprung = Hüftgelenk, zeigt nach unten. */
export function buildThighGeometry(team: Team, side: 'L' | 'R'): THREE.BufferGeometry {
  const p = PAL[team];
  const sgn = side === 'L' ? -1 : 1;
  const b = new GeoBuilder();
  b.ellipsoid(0.09, 0.07, 0.09, 0, 0, 0, p.pants);
  b.seg({ x: 0, y: 0, z: 0 }, { x: 0, y: -LEG.thigh, z: 0 }, 0.088, 0.072, p.pants, 7);
  // Cargotasche außen
  b.box(0.03, 0.13, 0.11, sgn * 0.09, -0.17, 0.0, p.pouch);
  b.box(0.034, 0.03, 0.115, sgn * 0.09, -0.115, 0.0, p.pants);
  if (team === 'T') b.camo(8, side === 'L' ? 21 : 22, 0, 0, -0.38, -0.02, 0.08, p.pantsAlt, 0.08);
  return b.build();
}

/** Unterschenkel + Stiefel + Knieschützer; Ursprung = Kniegelenk. */
export function buildShinGeometry(team: Team, side: 'L' | 'R'): THREE.BufferGeometry {
  const p = PAL[team];
  const b = new GeoBuilder();
  const ankleY = -LEG.shin;
  b.seg({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.2, z: 0 }, 0.072, 0.064, p.pants, 7);
  if (team === 'T') b.camo(5, side === 'L' ? 31 : 32, 0, 0, -0.19, -0.02, 0.07, p.pantsAlt, 0.07);
  b.ellipsoid(0.07, 0.065, 0.07, 0, 0, 0, p.pants);
  // Knieschützer vorn
  b.box(0.115, 0.105, 0.05, 0, 0.005, 0.075, p.gear, 0.1);
  b.box(0.095, 0.04, 0.05, 0, 0.045, 0.08, p.vest, 0.1);
  // Stiefelschaft + Fuß + Sohle
  b.seg({ x: 0, y: -0.17, z: 0 }, { x: 0, y: ankleY - 0.02, z: 0 }, 0.075, 0.07, p.boot, 7);
  b.box(0.115, 0.1, 0.285, 0, ankleY - 0.065, 0.065, p.boot);
  b.box(0.12, 0.028, 0.295, 0, -LEG.shin - LEG.ankle + 0.014, 0.065, p.sole, 0, 0, 0, 0);
  b.box(0.1, 0.04, 0.07, 0, ankleY - 0.075, 0.2, p.sole, 0, 0, 0, 0.05); // Kappe
  b.box(0.09, 0.02, 0.016, 0, -0.205, 0.07, p.sole, 0, 0, 0, 0); // Schnürsenkel-Blende
  return b.build();
}

