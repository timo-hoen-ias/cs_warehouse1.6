import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VIEW_SCALE } from '../../logic/viewAnim';
import { viewPoint } from '../../logic/viewPlace';
import { WEAPONS } from '../../logic/weapons';
import { WEAPON_GEOM, weaponGeom } from '../../logic/weaponGeom';
import { forearmGeometry, handGeometry } from './arms';
import { frameQuat } from './builder';
import { MODEL_IDS, acquireView, buildViewWeapon, buildWorldGeometry, hasWeaponModel, worldGeometry } from './index';

/** Budgets aus der Aufgabe: Viewmodel inkl. Arme ≤ 12 Draw-Calls / ~8k Dreiecke, Welt ≤ 2 / 600. */
const ARM_MESHES = 4;
const MAX_VIEW_CALLS = 12;
const MAX_VIEW_TRIS = 8000;
const MAX_WORLD_TRIS = 600;

function armTris(): number {
  const hand = handGeometry('CT', 'R', 0.02, true).geo.getAttribute('position').count / 3;
  const fore = forearmGeometry('T', 'R').getAttribute('position').count / 3;
  return 2 * hand + 2 * fore;
}

describe('Waffenmodell-Katalog', () => {
  it('jede Waffe aus weapons.json hat ein Modell', () => {
    for (const w of Object.values(WEAPONS)) expect(hasWeaponModel(w.visual.model), w.id).toBe(true);
    expect(hasWeaponModel('gibtsnicht')).toBe(false);
    expect(buildViewWeapon('gibtsnicht')).toBeNull();
  });

  it('Viewmodels halten das Budget (Draw-Calls, Dreiecke inkl. Arme)', () => {
    const arms = armTris();
    expect(arms).toBeLessThan(3600);
    for (const id of MODEL_IDS) {
      const v = buildViewWeapon(id)!;
      let meshes = 0;
      v.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes, id).toBe(v.meshes);
      expect(meshes + ARM_MESHES, id).toBeLessThanOrEqual(MAX_VIEW_CALLS);
      expect(v.tris + arms, id).toBeLessThanOrEqual(MAX_VIEW_TRIS);
      expect(v.tris, id).toBeGreaterThan(150);
    }
  });

  it('Welt-LOD: eine Geometrie mit Vertex-Farben, ≤ 600 Dreiecke', () => {
    for (const id of MODEL_IDS) {
      const g = buildWorldGeometry(id)!;
      const tris = g.getAttribute('position').count / 3;
      expect(tris, id).toBeLessThanOrEqual(MAX_WORLD_TRIS);
      expect(tris, id).toBeGreaterThan(20);
      expect(g.getAttribute('color'), id).toBeDefined();
      expect(g.index).toBeNull();
    }
    // gecacht und geteilt
    expect(worldGeometry('ak47')).toBe(worldGeometry('ak47'));
    expect(worldGeometry('ak47')!.userData.shared).toBe(true);
  });

  it('Modelle sind unterscheidbar (keine zwei mit gleicher Größe und Dreieckszahl)', () => {
    const seen = new Map<string, string>();
    for (const id of MODEL_IDS) {
      const g = worldGeometry(id)!;
      const s = g.boundingBox!.getSize(new THREE.Vector3());
      const key = `${s.x.toFixed(3)}|${s.y.toFixed(3)}|${s.z.toFixed(3)}|${g.getAttribute('position').count}`;
      expect(seen.get(key), `${id} gleicht ${seen.get(key)}`).toBeUndefined();
      seen.set(key, id);
    }
  });

  it('Proportionen: Längen je Klasse plausibel (Pistole < MP < Gewehr < Sniper)', () => {
    const len = (id: string): number => worldGeometry(id)!.boundingBox!.getSize(new THREE.Vector3()).z;
    expect(len('glock')).toBeLessThan(0.25);
    expect(len('deagle')).toBeGreaterThan(len('glock'));
    expect(len('mp5')).toBeGreaterThan(0.5);
    expect(len('ak47')).toBeGreaterThan(len('mp5'));
    expect(len('awp')).toBeGreaterThan(len('ak47'));
    expect(len('awp')).toBeGreaterThan(1.1);
    expect(len('hegrenade')).toBeLessThan(0.12);
  });

  it('Anker und Teile passen zur Animations-Beschreibung (Rig)', () => {
    for (const id of MODEL_IDS) {
      const v = buildViewWeapon(id)!;
      const { rig, parts, anchors } = v;
      expect(anchors.gripR, id).toBeDefined();
      expect(anchors.gripL, id).toBeDefined();
      expect(anchors.muzzle, id).toBeDefined();
      // Mündung liegt vor dem Griff
      v.root.updateMatrixWorld(true);
      const m = anchors.muzzle!.getWorldPosition(new THREE.Vector3());
      expect(m.z, id).toBeLessThan(0);
      if (rig.cycle === 'slide') expect(parts.slide, id).toBeDefined();
      if (rig.cycle === 'charge' || rig.charge === 'charge') expect(parts.charge, id).toBeDefined();
      if (rig.charge === 'slide') expect(parts.slide, id).toBeDefined();
      if (rig.boltAction) {
        expect(parts.bolt, id).toBeDefined();
        expect(anchors.boltR, id).toBeDefined();
      }
      if (rig.pumpAction) expect(parts.pump, id).toBeDefined();
      if (rig.reload === 'mag' || rig.reload === 'pistol' || rig.reload === 'mg') {
        expect(parts.mag, id).toBeDefined();
        expect(anchors.magHold, id).toBeDefined();
      }
      if (rig.reload === 'mag' && (rig.charge === 'charge' || rig.charge === 'slide')) expect(anchors.chargeL, id).toBeDefined();
      if (rig.reload === 'shell') {
        expect(parts.shell, id).toBeDefined();
        expect(anchors.port, id).toBeDefined();
      }
      if (rig.reload === 'mg') expect(parts.cover, id).toBeDefined();
      if (rig.dual) {
        expect(parts.slide2, id).toBeDefined();
        expect(parts.mag2, id).toBeDefined();
        expect(anchors.muzzle2, id).toBeDefined();
      }
      if (rig.family === 'grenade') {
        expect(parts.pin, id).toBeDefined();
        expect(parts.spoon, id).toBeDefined();
      }
      if (rig.family === 'bomb') expect(anchors.keypad, id).toBeDefined();
      // Teile merken sich ihre Ruhelage
      for (const p of Object.values(parts)) expect(p!.userData.rest).toHaveLength(3);
    }
  });

  it('Typen der Waffen und Familien der Modelle stimmen überein', () => {
    for (const w of Object.values(WEAPONS)) {
      const v = buildViewWeapon(w.visual.model)!;
      expect(v.rig.family, w.id).toBe(w.type);
    }
  });

  it('acquireView liefert Klone mit eigenen Knoten, aber geteilten Geometrien', () => {
    const a = acquireView('m4a1')!;
    const b = acquireView('m4a1')!;
    expect(a.root).not.toBe(b.root);
    expect(a.parts.mag).not.toBe(b.parts.mag);
    expect(a.anchors.gripL).toBeDefined();
    const geoA = (a.parts.mag!.children[0] as THREE.Mesh).geometry;
    const geoB = (b.parts.mag!.children[0] as THREE.Mesh).geometry;
    expect(geoA).toBe(geoB);
  });
});

describe('Hand-Rahmen und Arme', () => {
  it('frameQuat: lokale +Y zeigt entlang der Achse, +X zum Handrücken (orthogonalisiert)', () => {
    const q = frameQuat([0, 0, 1], [0.3, -1, 0]);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(y.z).toBeCloseTo(-1, 6); // f vorwärts = −z
    expect(x.y).toBeLessThan(-0.9);
    expect(Math.abs(x.dot(y))).toBeLessThan(1e-6);
  });

  it('Hände: gecacht je Team/Seite/Radius, linke Hand gespiegelt (Handgelenk z umgekehrt)', () => {
    const r = handGeometry('T', 'R', 0.02, false);
    const l = handGeometry('T', 'L', 0.02, false);
    expect(handGeometry('T', 'R', 0.0201, false)).toBe(r);
    expect(r.wrist.z).toBeGreaterThan(0);
    expect(l.wrist.z).toBeCloseTo(-r.wrist.z, 9);
    expect(handGeometry('CT', 'R', 0.02, false)).not.toBe(r);
    // Teamfarben unterscheiden sich
    const cT = r.geo.getAttribute('color').getX(0);
    const cCT = handGeometry('CT', 'R', 0.02, false).geo.getAttribute('color').getX(0);
    expect(cT).not.toBeCloseTo(cCT, 3);
  });

  it('Unterarm verläuft vom Handgelenk entlang +Z', () => {
    const g = forearmGeometry('CT', 'L');
    g.computeBoundingBox();
    expect(g.boundingBox!.min.z).toBeGreaterThan(-0.02);
    expect(g.boundingBox!.max.z).toBeGreaterThan(0.4);
  });
});

/** Alle Eckpunkte des Viewmodels im Modellraum als [x, y, f] (Teile in Ruhelage). */
function viewVerts(id: string): [number, number, number][] {
  const v = buildViewWeapon(id)!;
  v.root.updateMatrixWorld(true);
  const out: [number, number, number][] = [];
  const p = new THREE.Vector3();
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      out.push([p.x, p.y, -p.z]);
    }
  });
  return out;
}

/** Kleinster Abstand eines Modellpunkts [x, y, f] zur Oberfläche des Viewmodels (Dreiecke, Teile in Ruhelage). */
function surfaceDistance(id: string, q: readonly [number, number, number]): number {
  const v = buildViewWeapon(id)!;
  v.root.updateMatrixWorld(true);
  const target = new THREE.Vector3(q[0], q[1], -q[2]);
  const tri = new THREE.Triangle();
  const c = new THREE.Vector3();
  let best = Infinity;
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 3) {
      tri.a.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      tri.b.fromBufferAttribute(pos, i + 1).applyMatrix4(m.matrixWorld);
      tri.c.fromBufferAttribute(pos, i + 2).applyMatrix4(m.matrixWorld);
      best = Math.min(best, tri.closestPointToPoint(target, c).distanceTo(target));
    }
  });
  return best;
}

function anchorPos(v: ReturnType<typeof buildViewWeapon>, name: 'muzzle' | 'muzzle2' | 'gripR' | 'gripL' | 'eject' | 'eject2'): [number, number, number] | undefined {
  const o = v!.anchors[name];
  if (!o) return undefined;
  const p = o.getWorldPosition(new THREE.Vector3());
  return [p.x, p.y, -p.z];
}

describe('Modelle passen zur Geometrie-Tabelle (logic/weaponGeom.ts)', () => {
  it('jedes Modell hat Tabellen-Daten und umgekehrt', () => {
    for (const id of MODEL_IDS) expect(weaponGeom(id), id).toBeDefined();
    for (const id of Object.keys(WEAPON_GEOM)) expect(hasWeaponModel(id), id).toBe(true);
  });

  it('Anker (Mündung, Schusshand, Stützhand, Auswurf) sitzen exakt auf den Tabellenpunkten', () => {
    for (const id of MODEL_IDS) {
      const g = WEAPON_GEOM[id]!;
      const v = buildViewWeapon(id)!;
      v.root.updateMatrixWorld(true);
      const check = (name: 'muzzle' | 'muzzle2' | 'gripR' | 'gripL' | 'eject' | 'eject2'): void => {
        const want = g[name];
        const got = anchorPos(v, name);
        if (!want) {
          expect(got, `${id}.${name} unerwartet`).toBeUndefined();
          return;
        }
        expect(got, `${id}.${name} fehlt`).toBeDefined();
        for (let k = 0; k < 3; k++) expect(got![k]!, `${id}.${name}[${k}]`).toBeCloseTo(want[k]!, 6);
      };
      for (const n of ['muzzle', 'muzzle2', 'gripR', 'gripL', 'eject', 'eject2'] as const) check(n);
    }
  });

  it('echte Länge: gebautes Viewmodel und Welt-Modell stimmen (±4 % bzw. ±8 %)', () => {
    for (const id of MODEL_IDS) {
      const g = WEAPON_GEOM[id]!;
      const f = viewVerts(id).map((p) => p[2]);
      const lenView = Math.max(...f) - Math.min(...f);
      expect(Math.abs(lenView - g.length) / g.length, `${id} Ansicht ${lenView.toFixed(3)} vs ${g.length}`).toBeLessThan(0.04);
      const wb = worldGeometry(id)!.boundingBox!;
      const lenWorld = wb.max.z - wb.min.z;
      expect(Math.abs(lenWorld - g.length) / g.length, `${id} Welt ${lenWorld.toFixed(3)} vs ${g.length}`).toBeLessThan(0.08);
    }
  });

  it('Mündung ist der vorderste Punkt (±2 cm), Schaftkappe der hinterste (±2 cm)', () => {
    for (const [id, g] of Object.entries(WEAPON_GEOM)) {
      if (g.hold === 'grenade' || g.hold === 'bomb') continue;
      const f = viewVerts(id).map((p) => p[2]);
      expect(Math.abs(Math.max(...f) - g.muzzle[2]), `${id} Mündung`).toBeLessThan(0.02);
      if (g.butt) expect(Math.abs(Math.min(...f) - g.butt[2]), `${id} Schaftkappe`).toBeLessThan(0.02);
    }
  });

  it('Laufachse: an der Mündung hat das Modell Material auf Höhe der Seelenachse', () => {
    for (const [id, g] of Object.entries(WEAPON_GEOM)) {
      if (g.hold === 'grenade' || g.hold === 'bomb' || g.hold === 'knife') continue;
      const near = viewVerts(id).filter((p) => Math.abs(p[2] - g.muzzle[2]) < 0.02 && Math.abs(p[0] - g.muzzle[0]) < 0.03);
      expect(near.length, id).toBeGreaterThan(0);
      expect(Math.min(...near.map((p) => p[1])), id).toBeLessThan(g.muzzle[1] + 0.003);
      expect(Math.max(...near.map((p) => p[1])), id).toBeGreaterThan(g.muzzle[1] - 0.003);
    }
  });

  it('Kimme und Korn liegen an der Oberkante der Geometrie (±8 mm)', () => {
    for (const [id, g] of Object.entries(WEAPON_GEOM)) {
      const verts = viewVerts(id);
      for (const s of [g.sightRear, g.sightFront]) {
        if (!s) continue;
        const near = verts.filter((p) => Math.abs(p[2] - s[2]) < 0.015 && Math.abs(p[0] - s[0]) < 0.04);
        expect(near.length, `${id} @${s[2]}`).toBeGreaterThan(0);
        expect(Math.abs(Math.max(...near.map((p) => p[1])) - s[1]), `${id} Sichthöhe`).toBeLessThan(0.008);
      }
    }
  });

  it('Hand-Punkte liegen am Modell: Schuss- und Stützhand höchstens 3,5 cm von der Oberfläche', () => {
    for (const [id, g] of Object.entries(WEAPON_GEOM)) {
      if (g.hold === 'grenade' || g.hold === 'bomb' || g.hold === 'knife') continue;
      for (const [name, grip] of [['gripR', g.gripR], ['gripL', g.gripL]] as const) {
        expect(surfaceDistance(id, grip), `${id}.${name}`).toBeLessThan(0.035);
      }
    }
  });

  it('Halter-Transform (three, Euler YXZ, Skalierung) stimmt mit der reinen Ruhelage-Rechnung überein', () => {
    for (const id of ['glock', 'ak47', 'awp', 'm249', 'p90']) {
      const def = WEAPONS[id]!;
      const g = WEAPON_GEOM[def.visual.model]!;
      const v = buildViewWeapon(id)!;
      const holder = new THREE.Group();
      holder.rotation.order = 'YXZ';
      holder.position.set(def.visual.pos.x, def.visual.pos.y, def.visual.pos.z);
      holder.rotation.set(def.visual.rot.x, def.visual.rot.y, def.visual.rot.z);
      holder.scale.setScalar(VIEW_SCALE);
      holder.add(v.root);
      holder.updateMatrixWorld(true);
      const place = { pos: def.visual.pos, rot: def.visual.rot, scale: VIEW_SCALE };
      for (const name of ['muzzle', 'gripR', 'gripL', 'eject'] as const) {
        const want = viewPoint(place, g[name]!);
        const got = v.anchors[name]!.getWorldPosition(new THREE.Vector3());
        expect(got.x, `${id}.${name}.x`).toBeCloseTo(want.x, 6);
        expect(got.y, `${id}.${name}.y`).toBeCloseTo(want.y, 6);
        expect(got.z, `${id}.${name}.z`).toBeCloseTo(want.z, 6);
      }
    }
  });

  it('Hand-Ziele: Schusshand = Halter-Ursprung, Stützhand ≤ 0,5 m davon entfernt (Armlänge im Bild)', () => {
    for (const w of Object.values(WEAPONS)) {
      const g = WEAPON_GEOM[w.visual.model]!;
      const place = { pos: w.visual.pos, rot: w.visual.rot, scale: VIEW_SCALE };
      const r = viewPoint(place, g.gripR);
      const l = viewPoint(place, g.gripL);
      expect(Math.hypot(l.x - r.x, l.y - r.y, l.z - r.z), w.id).toBeLessThan(0.5);
    }
  });
});
