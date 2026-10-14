import * as THREE from 'three';
import { Builder, type P3 } from './builder';
import { viewMaterial } from './materials';

/**
 * First-Person-Arme: behandschuhte Hände (geschlossen um einen Griff mit Radius r) und
 * Unterarme mit Teamfarben. Beides Low-Poly mit Vertex-Farben (Materialklasse cloth).
 *
 * Hand-Rahmen (siehe builder.ts): lokale +Y = Griffachse (Zeigefinger oben), +X = Handrücken,
 * die Finger umschließen den Griff über die −Z-Seite (rechte Hand). Die linke Hand ist das
 * Spiegelbild an der XY-Ebene (Finger über +Z). Handgelenk-Punkt in userData.wrist.
 * Unterarm: Ursprung = Handgelenk, verläuft entlang lokaler +Z zum Ellbogen.
 */
export type Team = 'T' | 'CT';
export type Side = 'R' | 'L';

type ArmPalette = {
  glove: number; palm: number; pad: number; tip: number; cuff: number;
  skin: number; sleeve: number; sleeveAlt: number[]; band: number; patch: number; fingerless: boolean; rolled: boolean;
};

const PAL: Record<Team, ArmPalette> = {
  T: {
    glove: 0x4a3524, palm: 0x5a4330, pad: 0x33251a, tip: 0xc4916a, cuff: 0x2e2117,
    skin: 0xc08d66, sleeve: 0xb19868, sleeveAlt: [0x8b7141, 0x6f6a3c, 0xc3a972], band: 0x9a8255, patch: 0xe8501c,
    fingerless: true, rolled: true,
  },
  CT: {
    glove: 0x2a2c30, palm: 0x34363a, pad: 0x4d5158, tip: 0x2a2c30, cuff: 0x16171a,
    skin: 0xd9b090, sleeve: 0x2a4170, sleeveAlt: [], band: 0x1d2d4d, patch: 0x4aa8ff,
    fingerless: false, rolled: false,
  },
};

/** [x, y, z] (Hand-lokal) → Autorenpunkt [x, y, f]. */
const h = (x: number, y: number, z: number): P3 => [x, y, -z];

const FINGERS = [
  { y: 0.027, r: 0.0096, len: [0.042, 0.026, 0.02] },
  { y: 0.008, r: 0.0101, len: [0.046, 0.029, 0.021] },
  { y: -0.011, r: 0.0095, len: [0.043, 0.027, 0.02] },
  { y: -0.028, r: 0.0085, len: [0.034, 0.021, 0.018] },
] as const;

/** Euler-Rotation, die lokale Achsen (lenAxis = Z) entlang dir legt (up ≈ +Y). */
function eulerAlong(dir: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)): P3 {
  const z = dir.clone().normalize();
  let x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return [e.x, e.y, e.z];
}

function flipWinding(g: THREE.BufferGeometry): void {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const s = a.itemSize;
    const arr = a.array as Float32Array;
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const i1 = (t + 1) * s + k;
        const i2 = (t + 2) * s + k;
        const tmp = arr[i1]!;
        arr[i1] = arr[i2]!;
        arr[i2] = tmp;
      }
    }
    a.needsUpdate = true;
  }
}

/** Spiegelt eine (nicht indizierte) Geometrie an der XY-Ebene (z → −z) inkl. Wicklung. */
function mirrorZ(g: THREE.BufferGeometry): void {
  g.scale(1, 1, -1);
  flipWinding(g);
}

/** Erste Mesh-Geometrie eines gebauten Builders (Hände/Unterarme haben nur eine Klasse). */
function single(b: Builder): THREE.BufferGeometry {
  const built = b.build();
  let geo: THREE.BufferGeometry | null = null;
  built.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !geo) geo = m.geometry;
  });
  return geo ?? new THREE.BufferGeometry();
}

/** Handgeometrie um einen Griff mit Radius r (trigger: Zeigefinger am Abzug). */
export function buildHandGeometry(team: Team, side: Side, r: number, trigger: boolean): { geo: THREE.BufferGeometry; wrist: THREE.Vector3 } {
  const p = PAL[team];
  const b = new Builder('view');
  const o = { m: 'cloth' as const, ao: 0.18 };
  const R = r + 0.0098;
  const Rk = r + 0.017;
  const thK = -0.55;
  const wrap = Math.min(3.3, 0.095 / R);
  const lenScale = wrap / (0.095 / R);
  const P = (v: THREE.Vector3): P3 => h(v.x, v.y, v.z);

  // Handrücken (abgerundet) von der Knöchellinie zum Handgelenk + Innenhand
  const K = new THREE.Vector3(Math.cos(thK) * Rk, 0, Math.sin(thK) * Rk);
  const W = new THREE.Vector3(r + 0.017, -0.016, 0.052 + r * 0.3);
  const dKW = W.clone().sub(K);
  const L = dKW.length();
  const rot = eulerAlong(dKW);
  const mid = K.clone().add(W).multiplyScalar(0.5);
  const out = new THREE.Vector3(1, 0, 0);
  b.sphere(1, P(mid.clone().addScaledVector(out, 0.004)), p.glove, { ...o, rot, scale: [0.0135, 0.041, L * 0.56], sides: 10 });
  b.sphere(1, P(mid.clone().addScaledVector(out, -0.006)), p.palm, { ...o, rot, scale: [0.011, 0.038, L * 0.5], sides: 8 });
  // Knöchelschutz (nur CT: Hartschale), T: Lederhandschuh ohne Schale
  if (team === 'CT') b.sphere(1, P(K.clone().addScaledVector(out, 0.012).add(new THREE.Vector3(0, 0, 0.01))), p.pad, { ...o, rot, scale: [0.006, 0.034, 0.012], sides: 8 });
  // Daumenballen + Handballen
  b.sphere(1, h(0.004, 0.016, r + 0.012), p.palm, { ...o, scale: [0.017, 0.022, 0.016], sides: 8 });
  b.sphere(1, h(r + 0.004, -0.026, r * 0.5 + 0.02), p.palm, { ...o, scale: [0.014, 0.02, 0.016], sides: 8 });

  // Finger: Knöchel → Kreisbahn um den Griff, Gelenke gerundet
  FINGERS.forEach((f, i) => {
    const pts: THREE.Vector3[] = [new THREE.Vector3(Math.cos(thK) * Rk, f.y, Math.sin(thK) * Rk)];
    if (trigger && i === 0) {
      pts.push(pts[0]!.clone().add(new THREE.Vector3(-0.01, -0.002, -0.035)));
      pts.push(pts[1]!.clone().add(new THREE.Vector3(-0.007, -0.014, -0.01)));
      pts.push(pts[2]!.clone().add(new THREE.Vector3(-0.001, -0.011, 0.005)));
    } else {
      let th = thK - 0.18;
      for (const len of f.len) {
        th -= (len * lenScale) / R;
        pts.push(new THREE.Vector3(Math.cos(th) * R, f.y - 0.002, Math.sin(th) * R));
      }
    }
    b.sphere(f.r * 1.08, P(pts[0]!), p.glove, { ...o, sides: 6 });
    for (let k = 0; k < 3; k++) {
      const rr = f.r * (1 - k * 0.08);
      const color = k === 2 && p.fingerless ? p.tip : p.glove;
      b.seg(P(pts[k]!), P(pts[k + 1]!), rr, rr * 0.95, color, { ...o, sides: 7 });
      b.sphere(rr * (k === 2 ? 0.92 : 1), P(pts[k + 1]!), color, { ...o, sides: 6 });
    }
  });

  // Daumen: Ballen hinten am Griff → links nach vorn
  const T = [
    new THREE.Vector3(0.006, 0.02, r + 0.016),
    new THREE.Vector3(-(r + 0.004) * 0.75, 0.031, r * 0.62),
    new THREE.Vector3(-(r + 0.01), 0.034, -0.006),
    new THREE.Vector3(-(r + 0.009), 0.032, -0.03),
  ];
  const TR = [0.0125, 0.0108, 0.0096];
  for (let k = 0; k < 3; k++) {
    const color = k === 2 && p.fingerless ? p.tip : p.glove;
    b.seg(P(T[k]!), P(T[k + 1]!), TR[k]!, TR[k]! * 0.93, color, { ...o, sides: 7 });
    b.sphere(TR[k]! * 0.95, P(T[k + 1]!), color, { ...o, sides: 6 });
  }

  // Bündchen / Handgelenk mit Klettriegel
  const cuffEnd = W.clone().add(new THREE.Vector3(-0.002, -0.01, 0.042));
  b.seg(P(W.clone().add(new THREE.Vector3(-0.006, 0.004, -0.014))), P(cuffEnd), 0.025, 0.028, p.cuff, { ...o, sides: 10 });
  b.box([0.008, 0.026, 0.026], P(W.clone().add(new THREE.Vector3(0.024, -0.004, 0.016))), p.pad, { ...o, rot: eulerAlong(cuffEnd.clone().sub(W)) });

  const geo = single(b);
  const wrist = cuffEnd.clone();
  if (side === 'L') {
    mirrorZ(geo);
    wrist.z = -wrist.z;
  }
  geo.computeBoundingSphere();
  return { geo, wrist };
}

/** Unterarm (Handgelenk → Ellbogen entlang +Z, Länge ~0.45 m). */
export function buildForearmGeometry(team: Team, side: Side): THREE.BufferGeometry {
  const p = PAL[team];
  const b = new Builder('view');
  const o = { m: 'cloth' as const, ao: 0.25, sides: 9 };
  const z = (v: number): number => -v; // +Z lokal = f negativ
  const out = side === 'R' ? 1 : -1;
  // Profil [Radius, Abstand vom Handgelenk] → Drehkörper entlang +Z (Lathe-Achse f, daher negativ)
  const lathe = (prof: [number, number][], color: number): void => {
    const pts = prof.map(([r, d]) => [r, -d] as [number, number]).reverse();
    b.lathe(pts, [0, 0, 0], color, { ...o, axis: 'f', sides: 10 });
  };
  if (p.rolled) {
    lathe([[0.023, 0], [0.026, 0.035], [0.031, 0.08], [0.035, 0.13], [0.036, 0.19]], p.skin);
    lathe([[0.04, 0.165], [0.044, 0.18], [0.045, 0.21], [0.043, 0.235]], p.band);
    lathe([[0.042, 0.225], [0.045, 0.28], [0.048, 0.4], [0.05, 0.5]], p.sleeve);
    p.sleeveAlt.forEach((c, i) => {
      const a = 0.6 + i * 2.1;
      b.box([0.03, 0.022, 0.05], [Math.cos(a) * 0.047, Math.sin(a) * 0.047, z(0.3 + i * 0.05)], c, { ...o, d: true, rot: [0, 0, a + Math.PI / 2] });
    });
  } else {
    lathe([[0.029, -0.004], [0.031, 0.03], [0.03, 0.04]], p.cuff);
    lathe([[0.029, 0.03], [0.032, 0.06], [0.037, 0.13], [0.042, 0.25], [0.048, 0.5]], p.sleeve);
    b.box([0.012, 0.03, 0.035], [out * 0.034, 0.0, z(0.05)], p.band, { ...o, sides: undefined });
    b.box([0.006, 0.03, 0.04], [out * 0.044, 0.004, z(0.3)], p.patch, { ...o, sides: undefined, d: true });
  }
  const geo = single(b);
  geo.computeBoundingSphere();
  return geo;
}

const handCache = new Map<string, { geo: THREE.BufferGeometry; wrist: THREE.Vector3 }>();
const armCache = new Map<string, THREE.BufferGeometry>();

/** Gecachte Hand (Schlüssel: Team, Seite, Griffradius in mm, Abzugsfinger). */
export function handGeometry(team: Team, side: Side, r: number, trigger: boolean): { geo: THREE.BufferGeometry; wrist: THREE.Vector3 } {
  const rr = Math.round(Math.max(0.006, Math.min(0.04, r)) * 1000) / 1000;
  const key = `${team}|${side}|${rr}|${trigger ? 1 : 0}`;
  let e = handCache.get(key);
  if (!e) {
    e = buildHandGeometry(team, side, rr, trigger);
    handCache.set(key, e);
  }
  return e;
}

export function forearmGeometry(team: Team, side: Side): THREE.BufferGeometry {
  const key = `${team}|${side}`;
  let g = armCache.get(key);
  if (!g) {
    g = buildForearmGeometry(team, side);
    armCache.set(key, g);
  }
  return g;
}

/** Material der Arme (geteilt). */
export function armMaterial(): THREE.Material {
  return viewMaterial('cloth');
}
