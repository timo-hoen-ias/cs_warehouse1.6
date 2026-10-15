import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { IDENTITY_STRETCH, type StretchMap } from '../../logic/stretch';
import type { AnimFamily, ChargeKind, ReloadStyle } from '../../logic/viewAnim';
import type { WeaponGeom } from '../../logic/weaponGeom';
import { UV_DENSITY, viewMaterial, type MatKind } from './materials';

/**
 * Prozeduraler Modell-Baukasten für Waffen (und Hände).
 *
 * KOORDINATEN-KONVENTION (für alle Modelle dieser Bibliothek):
 *  - Einheit Meter, echte Größe (der Viewmodel-Halter skaliert mit VIEW_SCALE).
 *  - Ursprung = Griffpunkt der rechten Hand (Mitte des Pistolengriffs auf Handhöhe).
 *  - Lauf zeigt nach −Z (wie die Kamera), +Y oben, +X rechts (aus Schützensicht).
 *  - Beim Autorisieren werden Punkte als [x, y, f] angegeben mit f = vorwärts = −z;
 *    Seitenprofile (für Extrusionen) als [f, y].
 *  - Die Waffenlänge wird über eine Längsstauchung (`fit` in logic/weaponGeom.ts, siehe stretch.ts)
 *    auf das echte Maß gebracht: der Baukasten bildet f aller Primitive, Teil-Drehpunkte und Anker
 *    darüber ab. Mündung, Griff- und Stützhand-Punkt sowie Auswurf kommen direkt aus der Tabelle.
 *  - Anker sind Object3D-Knoten (Name `anchor:<name>`): muzzle (Mündung), gripR/gripL
 *    (Handgriffe), magHold (Magazin greifen), chargeL (Spannhebel/Schlitten), boltR
 *    (Kammerstängel), port (Ladeöffnung), keypad (C4). Hand-Rahmen: lokale +Y = Griffachse
 *    (zeigt zum Zeigefinger), lokale +X = Richtung Handrücken, Radius in userData.r.
 *  - Animierte Teile sind eigene Knoten (Name `part:<name>`, Ursprung = Drehpunkt) mit
 *    genau einem Mesh: slide, slide2, charge, bolt, pump, mag, mag2, cover, pin, spoon, shell.
 *
 * Statische Geometrie wird je Materialklasse verschmolzen (ein Draw-Call je Klasse),
 * jedes Teil ist ein Mesh. LOD 'world' lässt Details weg, spart Segmente und verschmilzt
 * alles (Teile in Ruhelage) zu EINER Geometrie mit Vertex-Farben.
 */

export type Lod = 'view' | 'world';
/** Autorenpunkt [x rechts, y oben, f vorwärts]. */
export type P3 = readonly [number, number, number];
/** Profilpunkt der Seitenansicht [f vorwärts, y oben]. */
export type P2 = readonly [number, number];

export type PartName = 'slide' | 'slide2' | 'charge' | 'bolt' | 'pump' | 'mag' | 'mag2' | 'cover' | 'pin' | 'spoon' | 'shell';
export type AnchorName = 'muzzle' | 'muzzle2' | 'gripR' | 'gripL' | 'magHold' | 'magHold2' | 'chargeL' | 'boltR' | 'port' | 'keypad' | 'eject' | 'eject2';

/** Anker, deren Lage aus der Tabelle logic/weaponGeom.ts kommt (endgültige Koordinaten, ohne Stauchung). */
const TABLE_ANCHORS = ['muzzle', 'muzzle2', 'gripR', 'gripL'] as const;
/** Platzhalter für `at` bei Tabellen-Ankern (Position kommt aus der Tabelle). */
export const TBL: P3 = [0, 0, 0];

/** Bewegungs-/Animations-Beschreibung eines Modells (vom ViewModel ausgewertet). */
export type Rig = {
  family: AnimFamily;
  reload: ReloadStyle;
  /** Womit wird manuell gespannt (Spur `charge`)? */
  charge: ChargeKind;
  /** Was läuft beim Schuss zurück (Schlitten/Verschluss)? */
  cycle: 'slide' | 'charge' | 'none';
  boltAction?: boolean;
  pumpAction?: boolean;
  /** Schlitten bleibt nach dem letzten Schuss hinten. */
  slideLock?: boolean;
  dual?: boolean;
  /** Wege (m) bzw. Winkel (rad) der Teile bei Spurwert 1. */
  travel: { slide: number; charge: number; bolt: number; boltLift: number; pump: number; mag: number; cover: number; pin: number };
  /** Magazin raus (Richtung im Modellraum, x/y/z!) und danach weg (z. B. nach unten). */
  magDir: P3;
  magAway: P3;
  /** Splint-Zugrichtung (Modellraum x/y/z). */
  pinDir: P3;
};

export function makeRig(family: AnimFamily, r: Partial<Rig> = {}): Rig {
  return {
    family,
    reload: 'none',
    charge: 'none',
    cycle: 'none',
    ...r,
    travel: { slide: 0.03, charge: 0.06, bolt: 0.09, boltLift: 1.0, pump: 0.09, mag: 0.06, cover: 1.0, pin: 0.06, ...(r.travel ?? {}) },
    magDir: r.magDir ?? [0, -1, 0],
    magAway: r.magAway ?? [-0.15, -1, 0],
    pinDir: r.pinDir ?? [-1, 0, 0],
  };
}

export type PrimOpts = {
  /** Materialklasse (Standard: steel); innerhalb eines Teils gilt die Teil-Klasse. */
  m?: MatKind;
  /** Detail: nur im LOD 'view'. */
  d?: boolean;
  /** Euler-Drehung (Modellraum) um den Einsetzpunkt. */
  rot?: P3;
  /** Gefälschte Umgebungsverdunklung nach unten zeigender Flächen (0..1). */
  ao?: number;
  /** Seitenzahl runder Formen. */
  sides?: number;
};

export type Built = {
  root: THREE.Group;
  parts: Partial<Record<PartName, THREE.Object3D>>;
  anchors: Partial<Record<AnchorName, THREE.Object3D>>;
  tris: number;
  meshes: number;
};

type AnchorSpec = { name: AnchorName; at: P3; axis: P3; back: P3; r: number; trigger: boolean; part: PartName | '' };
type PartSpec = { name: PartName; pivot: P3; mat: MatKind };

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const col = new THREE.Color();

/** [x, y, f] → three-Vektor (z = −f). */
export function v3(p: P3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], -p[2]);
}

/** Orthonormaler Hand-Rahmen: +Y = axis, +X ≈ back (orthogonalisiert), Eingaben in [x, y, f]. */
export function frameQuat(axis: P3, back: P3): THREE.Quaternion {
  const y = v3(axis).normalize();
  const xb = v3(back);
  const x = xb.sub(y.clone().multiplyScalar(xb.dot(y))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export class Builder {
  private readonly buckets = new Map<string, THREE.BufferGeometry[]>();
  private readonly partSpecs = new Map<PartName, PartSpec>();
  private readonly anchorSpecs: AnchorSpec[] = [];
  private active: PartSpec | null = null;

  private readonly stretch: StretchMap;
  private readonly geom?: WeaponGeom;

  constructor(readonly lod: Lod, opts: { stretch?: StretchMap; geom?: WeaponGeom } = {}) {
    this.stretch = opts.stretch ?? IDENTITY_STRETCH;
    this.geom = opts.geom;
  }

  get view(): boolean {
    return this.lod === 'view';
  }

  // ---------------------------------------------------------------- Struktur

  /** Animiertes Teil: alle Primitive in fn landen (mit Teil-Material) im Teil-Knoten. */
  part(name: PartName, pivot: P3, mat: MatKind, fn: () => void): this {
    const spec: PartSpec = { name, pivot: this.fp(pivot), mat };
    this.partSpecs.set(name, spec);
    const prev = this.active;
    this.active = spec;
    fn();
    this.active = prev;
    return this;
  }

  /** Anker (Hand-/Mündungspunkt); innerhalb von part() hängt er am Teil. */
  anchor(name: AnchorName, at: P3, o: { axis?: P3; back?: P3; r?: number; trigger?: boolean; part?: PartName } = {}): this {
    const fromTable = this.geom && (TABLE_ANCHORS as readonly string[]).includes(name) ? this.geom[name as (typeof TABLE_ANCHORS)[number]] : undefined;
    this.anchorSpecs.push({
      name, at: fromTable ?? this.fp(at), axis: o.axis ?? [0, 1, 0], back: o.back ?? [1, 0, 0], r: o.r ?? 0.02, trigger: o.trigger ?? false,
      part: o.part ?? this.active?.name ?? '',
    });
    return this;
  }

  // ---------------------------------------------------------------- Primitive

  /** Quader: size = [Breite x, Höhe y, Länge f], at = Mittelpunkt. */
  box(size: P3, at: P3, color: number, o: PrimOpts = {}): this {
    if (this.skip(o)) return this;
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    return this.place(g, at, color, o);
  }

  /**
   * Seitenprofil [f, y] (beliebiges Polygon, optional mit Löchern) quer extrudiert (Breite x),
   * mit Fase (bevel) an allen Kanten im LOD 'view'.
   */
  ext(profile: readonly P2[], width: number, color: number, o: PrimOpts & { x?: number; bevel?: number; holes?: readonly (readonly P2[])[] } = {}): this {
    if (this.skip(o)) return this;
    const shape = new THREE.Shape(profile.map(([f, y]) => new THREE.Vector2(f, y)));
    for (const h of o.holes ?? []) shape.holes.push(new THREE.Path(h.map(([f, y]) => new THREE.Vector2(f, y))));
    const bevel = this.view ? Math.min(o.bevel ?? 0.0018, width * 0.3) : 0;
    const depth = Math.max(1e-4, width - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 3,
    });
    // Profil-X (f) → −z, Profil-Y → y, Extrusion → x (zentriert)
    tmpM.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    g.applyMatrix4(tmpM);
    g.translate(-depth / 2 + (o.x ?? 0), 0, 0);
    if (o.rot) {
      // Drehung um den Profil-Schwerpunkt wäre teuer zu erklären → um den Ursprung (selten genutzt)
      g.applyQuaternion(tmpQ.setFromEuler(tmpE.set(o.rot[0], o.rot[1], o.rot[2])));
    }
    return this.add(g, color, o);
  }

  /** Zylinder/Kegelstumpf: rA am negativen Ende (hinten/unten/links), rB am positiven. */
  cyl(rA: number, rB: number, len: number, at: P3, color: number, o: PrimOpts & { axis?: 'f' | 'y' | 'x'; open?: boolean } = {}): this {
    if (this.skip(o)) return this;
    const g = new THREE.CylinderGeometry(rB, rA, len, this.sides(o.sides ?? 10), 1, o.open ?? false);
    this.alignAxis(g, o.axis ?? 'f');
    return this.place(g, at, color, o);
  }

  /** Drehkörper: Profil [Radius, Position entlang Achse] (aufsteigend), Achse f/y/x. */
  lathe(profile: readonly (readonly [number, number])[], at: P3, color: number, o: PrimOpts & { axis?: 'f' | 'y' | 'x' } = {}): this {
    if (this.skip(o)) return this;
    const g = new THREE.LatheGeometry(profile.map(([r, a]) => new THREE.Vector2(Math.max(r, 1e-4), a)), this.sides(o.sides ?? 12));
    this.alignAxis(g, o.axis ?? 'f');
    return this.place(g, at, color, o);
  }

  /** Kegelstumpf zwischen zwei Punkten. */
  seg(a: P3, b: P3, rA: number, rB: number, color: number, o: PrimOpts = {}): this {
    if (this.skip(o)) return this;
    const va = v3(a);
    const vb = v3(b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    if (len < 1e-6) return this;
    const g = new THREE.CylinderGeometry(rB, rA, len, this.sides(o.sides ?? 6), 1);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.applyQuaternion(tmpQ);
    const mid = va.add(vb).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    return this.add(g, color, o);
  }

  /** Kugel/Ellipsoid. */
  sphere(r: number, at: P3, color: number, o: PrimOpts & { scale?: P3 } = {}): this {
    if (this.skip(o)) return this;
    const s = this.sides(o.sides ?? 10);
    const g = new THREE.SphereGeometry(r, s, Math.max(3, Math.round(s * 0.6)));
    if (o.scale) g.scale(o.scale[0], o.scale[1], o.scale[2]);
    return this.place(g, at, color, o);
  }

  /** Torus (Ring) in der XY-Ebene (Achse z), per rot drehbar. */
  torus(R: number, r: number, at: P3, color: number, o: PrimOpts & { arc?: number } = {}): this {
    if (this.skip(o)) return this;
    const g = new THREE.TorusGeometry(R, r, this.view ? 4 : 3, this.sides(o.sides ?? 12), o.arc ?? Math.PI * 2);
    return this.place(g, at, color, o);
  }

  // ---------------------------------------------------------------- Bauen

  /** LOD 'view': Gruppe mit Meshes je Materialklasse, Teil-Knoten und Ankern. */
  build(): Built {
    const root = new THREE.Group();
    root.name = 'weapon';
    const parts: Built['parts'] = {};
    const anchors: Built['anchors'] = {};
    let tris = 0;
    let meshes = 0;
    const nodeOf = (part: PartName | ''): THREE.Object3D => (part ? parts[part] ?? root : root);

    for (const spec of this.partSpecs.values()) {
      const node = new THREE.Group();
      node.name = 'part:' + spec.name;
      node.position.copy(v3(spec.pivot));
      node.userData.rest = node.position.toArray();
      parts[spec.name] = node;
      root.add(node);
    }
    for (const [key, list] of this.buckets) {
      const [part, mat] = key.split('|') as [PartName | '', MatKind];
      const geo = mergeAll(list);
      if (!geo) continue;
      tris += geo.getAttribute('position').count / 3;
      const mesh = new THREE.Mesh(geo, viewMaterial(mat));
      mesh.name = (part || 'static') + ':' + mat;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      nodeOf(part).add(mesh);
      meshes++;
    }
    for (const a of this.anchorSpecs) {
      const o = new THREE.Object3D();
      o.name = 'anchor:' + a.name;
      const parent = nodeOf(a.part);
      const pos = v3(a.at);
      if (a.part && parts[a.part]) pos.sub(v3(this.partSpecs.get(a.part)!.pivot));
      o.position.copy(pos);
      o.quaternion.copy(frameQuat(a.axis, a.back));
      o.userData.r = a.r;
      o.userData.trigger = a.trigger;
      parent.add(o);
      anchors[a.name] = o;
    }
    // Auswurffenster(r) nur aus der Tabelle (kein Modellteil nötig)
    for (const name of ['eject', 'eject2'] as const) {
      const at = this.geom?.[name];
      if (!at) continue;
      const o = new THREE.Object3D();
      o.name = 'anchor:' + name;
      o.position.copy(v3(at));
      root.add(o);
      anchors[name] = o;
    }
    return { root, parts, anchors, tris, meshes };
  }

  /** LOD 'world': eine Geometrie (Teile in Ruhelage, Vertex-Farben). */
  buildWorld(): THREE.BufferGeometry {
    const all: THREE.BufferGeometry[] = [];
    for (const [key, list] of this.buckets) {
      const part = key.split('|')[0] as PartName | '';
      const pivot = part ? this.partSpecs.get(part)?.pivot : undefined;
      for (const g of list) {
        if (pivot) {
          const p = v3(pivot);
          g.translate(p.x, p.y, p.z);
        }
        all.push(g);
      }
    }
    const geo = mergeAll(all) ?? new THREE.BufferGeometry();
    geo.deleteAttribute('uv');
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  // ---------------------------------------------------------------- intern

  /** Punkt [x, y, f] durch die Längsstauchung schicken. */
  private fp(p: P3): P3 {
    return [p[0], p[1], this.stretch.map(p[2])];
  }

  private skip(o: PrimOpts): boolean {
    return !!o.d && !this.view;
  }

  private sides(n: number): number {
    return this.view ? n : Math.max(4, Math.round(n * 0.5));
  }

  private alignAxis(g: THREE.BufferGeometry, axis: 'f' | 'y' | 'x'): void {
    if (axis === 'f') g.rotateX(-Math.PI / 2); // +Y → −Z (vorwärts)
    else if (axis === 'x') g.rotateZ(-Math.PI / 2); // +Y → +X
  }

  private place(g: THREE.BufferGeometry, at: P3, color: number, o: PrimOpts): this {
    if (o.rot) g.applyQuaternion(tmpQ.setFromEuler(tmpE.set(o.rot[0], o.rot[1], o.rot[2])));
    const p = v3(at);
    g.translate(p.x, p.y, p.z);
    return this.add(g, color, o);
  }

  /** Längsstauchung auf Eckpunkte (z = −f) und Normalen (Inverse-Transponierte: nz / Steigung). */
  private applyStretch(g: THREE.BufferGeometry): void {
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const f = -pos.getZ(i);
      pos.setZ(i, -this.stretch.map(f));
      const k = this.stretch.slope(f);
      if (k !== 1) {
        const nx = nrm.getX(i);
        const ny = nrm.getY(i);
        const nz = nrm.getZ(i) / k;
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm.setXYZ(i, nx / l, ny / l, nz / l);
      }
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
  }

  /** Normalisiert die Geometrie (nicht indiziert, Normalen, Box-UV, Farben) und legt sie ab. */
  private add(src: THREE.BufferGeometry, color: number, o: PrimOpts): this {
    const g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (this.stretch !== IDENTITY_STRETCH) this.applyStretch(g);
    const mat: MatKind = this.active?.mat ?? o.m ?? 'steel';
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const colors = new Float32Array(n * 3);
    const dens = UV_DENSITY[mat];
    const ao = o.ao ?? 0.28;
    col.setHex(color);
    // Vertex-Farben im linearen Raum (three-Farben sind linear) → direkt verwendbar
    for (let i = 0; i < n; i++) {
      const nx = Math.abs(nrm.getX(i));
      const ny = nrm.getY(i);
      const nz = Math.abs(nrm.getZ(i));
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (nx >= Math.abs(ny) && nx >= nz) {
        uv[i * 2] = z * dens;
        uv[i * 2 + 1] = y * dens;
      } else if (Math.abs(ny) >= nz) {
        uv[i * 2] = z * dens;
        uv[i * 2 + 1] = x * dens;
      } else {
        uv[i * 2] = x * dens;
        uv[i * 2 + 1] = y * dens;
      }
      const k = 1 - ao * (0.5 - 0.5 * ny);
      colors[i * 3] = col.r * k;
      colors[i * 3 + 1] = col.g * k;
      colors[i * 3 + 2] = col.b * k;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const part = this.active;
    if (part && this.view) {
      tmpV.copy(v3(part.pivot));
      g.translate(-tmpV.x, -tmpV.y, -tmpV.z);
    } else if (part) {
      // Welt-LOD: Teile werden beim Bauen wieder an den Drehpunkt geschoben
      tmpV.copy(v3(part.pivot));
      g.translate(-tmpV.x, -tmpV.y, -tmpV.z);
    }
    const key = (this.view && part ? part.name : part ? part.name : '') + '|' + (this.view ? mat : 'world');
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    list.push(g);
    return this;
  }
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
  if (!merged) return null;
  if (merged !== list[0]) for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}
