import * as THREE from 'three';
import { stretchMap } from '../../logic/stretch';
import { weaponGeom } from '../../logic/weaponGeom';
import { Builder, type Built, type Rig } from './builder';
import { c4, flashbang, hegrenade, knife, smokegrenade } from './gear';
import { awp, g3sg1, m249, m3, mac10, mp5, p90, scout, sg550, tmp, ump45, xm1014 } from './longguns';
import { deagle, elite, fiveseven, glock, p228, usp } from './pistols';
import { ak47, aug, famas, galil, m4a1, sg552 } from './rifles';

export type { AnchorName, PartName, Rig } from './builder';
export { worldMaterial } from './materials';

/**
 * Katalog der prozeduralen Waffenmodelle (eine Bau-Funktion je Modell-Id, siehe
 * `visual.model` in weapons.json). Koordinaten-Konvention: builder.ts.
 *  - `acquireView(id)`: Viewmodel (LOD 'view') als Klon einer gecachten Vorlage
 *    (Geometrien/Materialien geteilt). Selten genutzte Vorlagen werden verdrängt und entsorgt.
 *  - `worldGeometry(id)`: eine Geometrie (LOD 'world', Vertex-Farben, ≤ 600 Dreiecke),
 *    einmal je Id gebaut und geteilt (liegende Waffen, Soldaten klonen sie).
 */
const BUILDERS: Record<string, (b: Builder) => Rig> = {
  knife, glock, usp, p228, deagle, fiveseven, elite,
  m3, xm1014, mac10, tmp, mp5, ump45, p90,
  galil, famas, ak47, m4a1, sg552, aug,
  scout, awp, g3sg1, sg550, m249,
  hegrenade, flashbang, smokegrenade, c4,
};

export const MODEL_IDS: readonly string[] = Object.keys(BUILDERS);

export function hasWeaponModel(id: string): boolean {
  return id in BUILDERS;
}

/** Baukasten mit Tabellen-Daten (Anker) und Längsstauchung des Modells (logic/weaponGeom.ts). */
function makeBuilder(lod: 'view' | 'world', id: string): Builder {
  const geom = weaponGeom(id);
  return new Builder(lod, { geom, stretch: geom?.fit ? stretchMap(geom.fit) : undefined });
}

export type ViewWeapon = Built & { id: string; rig: Rig };

/** Baut ein Viewmodel neu (ohne Cache; für Tests/Vorlagen). */
export function buildViewWeapon(id: string): ViewWeapon | null {
  const fn = BUILDERS[id];
  if (!fn) return null;
  const b = makeBuilder('view', id);
  const rig = fn(b);
  return { ...b.build(), id, rig };
}

/** Baut die Welt-Geometrie neu (ohne Cache). */
export function buildWorldGeometry(id: string): THREE.BufferGeometry | null {
  const fn = BUILDERS[id];
  if (!fn) return null;
  const b = makeBuilder('world', id);
  fn(b);
  const g = b.buildWorld();
  g.userData.shared = true;
  return g;
}

const worldCache = new Map<string, THREE.BufferGeometry>();

/** Geteilte Welt-Geometrie (nicht entsorgen; zum Verändern klonen). */
export function worldGeometry(id: string): THREE.BufferGeometry | null {
  let g = worldCache.get(id);
  if (!g) {
    const built = buildWorldGeometry(id);
    if (!built) return null;
    g = built;
    worldCache.set(id, g);
  }
  return g;
}

const VIEW_CACHE_MAX = 6;
const viewCache = new Map<string, ViewWeapon>();

function disposeTemplate(t: ViewWeapon): void {
  t.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose(); // Materialien sind global geteilt
  });
}

/** Klont eine Vorlage und sammelt Teile/Anker des Klons per Namen ein. */
function cloneView(t: ViewWeapon): ViewWeapon {
  const root = t.root.clone(true);
  const parts: ViewWeapon['parts'] = {};
  const anchors: ViewWeapon['anchors'] = {};
  root.traverse((o) => {
    if (o.name.startsWith('part:')) parts[o.name.slice(5) as keyof typeof parts] = o;
    else if (o.name.startsWith('anchor:')) anchors[o.name.slice(7) as keyof typeof anchors] = o;
  });
  return { root, parts, anchors, tris: t.tris, meshes: t.meshes, id: t.id, rig: t.rig };
}

/**
 * Viewmodel für eine Modell-Id (Klon der gecachten Vorlage). `keep` = Ids, die gerade
 * benutzt werden (werden nie verdrängt).
 */
export function acquireView(id: string, keep: readonly string[] = []): ViewWeapon | null {
  let t = viewCache.get(id);
  if (t) {
    viewCache.delete(id); // LRU: ans Ende
    viewCache.set(id, t);
  } else {
    const built = buildViewWeapon(id);
    if (!built) return null;
    t = built;
    viewCache.set(id, t);
    for (const [k, v] of viewCache) {
      if (viewCache.size <= VIEW_CACHE_MAX) break;
      if (k === id || keep.includes(k)) continue;
      viewCache.delete(k);
      disposeTemplate(v);
    }
  }
  return cloneView(t);
}
