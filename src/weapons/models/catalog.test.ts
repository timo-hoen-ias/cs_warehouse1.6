import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WEAPONS } from '../../logic/weapons';
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
