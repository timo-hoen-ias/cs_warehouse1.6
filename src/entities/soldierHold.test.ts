import { describe, expect, it } from 'vitest';
import { WEAPON_GEOM } from '../logic/weaponGeom';
import { ARM, ARM_REACH, EYE_Y, IDLE_LEFT, armJoints, dist, elbowPole, holdPlan, holdPoint, leftShoulder, rightShoulder } from './soldierHold';

const ENTRIES = Object.entries(WEAPON_GEOM);

describe('Soldaten-Haltung: Koordinaten', () => {
  it('holdPoint spiegelt x (Rechte des Schützen = −x des Soldaten) und legt f nach +z', () => {
    const p = holdPoint({ origin: { x: 0, y: 1, z: 0 }, pitch: 0 }, [0.02, 0.05, 0.3]);
    expect(p.x).toBeCloseTo(-0.02, 9);
    expect(p.y).toBeCloseTo(1.05, 9);
    expect(p.z).toBeCloseTo(0.3, 9);
  });

  it('Neigung hebt die Mündung (pitch > 0), Länge bleibt erhalten', () => {
    const plan = { origin: { x: 0, y: 1, z: 0 }, pitch: 0.5 };
    const p = holdPoint(plan, [0, 0, 1]);
    expect(p.y).toBeCloseTo(1 + Math.sin(0.5), 9);
    expect(p.z).toBeCloseTo(Math.cos(0.5), 9);
    expect(Math.hypot(p.y - 1, p.z)).toBeCloseTo(1, 9);
  });

  it('Schultern: rechts bei −x, links bei +x, gleiche Höhe', () => {
    expect(rightShoulder().x).toBeLessThan(0);
    expect(leftShoulder().x).toBeGreaterThan(0);
    expect(rightShoulder().y).toBe(leftShoulder().y);
  });
});

describe('Soldaten-Haltung je Waffe', () => {
  it('Hand-Ziele fallen mit den Griffpunkten der Tabelle zusammen', () => {
    for (const [id, g] of ENTRIES) {
      const plan = holdPlan(g);
      const r = holdPoint(plan, g.gripR);
      expect(dist(plan.right, r), `${id} rechts`).toBeLessThan(1e-9);
      if (plan.leftGrips) {
        const l = holdPoint(plan, g.gripL);
        expect(dist(plan.left, l), `${id} links`).toBeLessThan(1e-9);
      } else {
        expect(plan.left, id).toEqual(IDLE_LEFT);
      }
    }
  });

  it('beide Hände sind mit festen Armlängen erreichbar (Schusshand ≤ Reichweite, Stützhand ≤ 2 cm darüber)', () => {
    for (const [id, g] of ENTRIES) {
      const plan = holdPlan(g);
      expect(dist(plan.right, rightShoulder()), `${id} rechte Hand`).toBeLessThanOrEqual(ARM_REACH);
      expect(dist(plan.left, leftShoulder()), `${id} linke Hand`).toBeLessThanOrEqual(ARM_REACH + 0.02);
    }
  });

  it('Gewehre: Schaftkappe liegt an der rechten Schulter, Waffe waagerecht', () => {
    for (const [id, g] of ENTRIES) {
      if (g.hold !== 'rifle') continue;
      const plan = holdPlan(g);
      const butt = holdPoint(plan, g.butt!);
      expect(plan.pitch, id).toBe(0);
      expect(butt.y, id).toBeCloseTo(1.36, 6);
      expect(butt.x, id).toBeCloseTo(-0.1, 6);
      expect(butt.z, id).toBeLessThan(0.1);
      expect(butt.z, id).toBeGreaterThanOrEqual(-0.1001);
    }
  });

  it('Pistolen: ausgestreckt, Visierlinie auf Augenhöhe, Mündung vor dem Körper', () => {
    for (const [id, g] of ENTRIES) {
      if (g.hold !== 'pistol') continue;
      const plan = holdPlan(g);
      const sight = holdPoint(plan, g.sightRear!);
      expect(Math.abs(sight.y - (EYE_Y - 0.025)), id).toBeLessThan(0.001);
      expect(holdPoint(plan, g.muzzle).z, id).toBeGreaterThan(0.45);
    }
  });

  it('Mündung liegt bei jeder Schusswaffe vor dem Körper, auf Brust- bis Kopfhöhe, nahe der Mittelachse', () => {
    for (const [id, g] of ENTRIES) {
      if (g.hold === 'grenade' || g.hold === 'bomb' || g.hold === 'knife') continue;
      const m = holdPoint(holdPlan(g), g.muzzle);
      expect(m.z, id).toBeGreaterThan(0.45);
      expect(m.y, id).toBeGreaterThan(1.2);
      expect(m.y, id).toBeLessThan(1.65);
      expect(Math.abs(m.x), id).toBeLessThan(0.3);
    }
  });

  it('Schaft und Griff berühren den Körper nicht über dem Kopf: Waffe bleibt unter Scheitelhöhe', () => {
    for (const [id, g] of ENTRIES) {
      const plan = holdPlan(g);
      for (const p of [g.muzzle, g.gripR, g.gripL, ...(g.butt ? [g.butt] : [])]) expect(holdPoint(plan, p).y, id).toBeLessThan(1.7);
    }
  });

  it('Elite: zwei Pistolen nebeneinander, beide Hände an je einem Griff', () => {
    const g = WEAPON_GEOM.elite!;
    const plan = holdPlan(g);
    expect(plan.leftGrips).toBe(true);
    expect(plan.left.x - plan.right.x).toBeCloseTo(0.24, 6); // Modellabstand
    expect(plan.right.x).toBeLessThan(0);
    expect(plan.left.x).toBeGreaterThan(0);
  });

  it('Messer/Granate: rechte Hand hält, linker Arm hängt locker; C4 mit beiden Händen', () => {
    for (const id of ['knife', 'hegrenade', 'flashbang', 'smokegrenade']) expect(holdPlan(WEAPON_GEOM[id]!).leftGrips, id).toBe(false);
    const c4 = holdPlan(WEAPON_GEOM.c4!);
    expect(c4.leftGrips).toBe(true);
    expect(Math.abs(c4.right.x - c4.left.x)).toBeLessThan(0.2);
  });

  it('Messerklinge zeigt nach vorn-oben', () => {
    const g = WEAPON_GEOM.knife!;
    const plan = holdPlan(g);
    const tip = holdPoint(plan, g.muzzle);
    expect(tip.z).toBeGreaterThan(plan.origin.z + 0.15);
    expect(tip.y).toBeGreaterThan(plan.origin.y + 0.05);
  });
});

describe('Arm-Gelenke (Zwei-Knochen-IK mit festen Längen)', () => {
  it('Segmentlängen bleiben fest, Hand sitzt hinter dem Handgelenk', () => {
    for (const [id, g] of ENTRIES) {
      const plan = holdPlan(g);
      for (const side of ['R', 'L'] as const) {
        const sh = side === 'R' ? rightShoulder() : leftShoulder();
        const hand = side === 'R' ? plan.right : plan.left;
        const j = armJoints(sh, hand, elbowPole(side));
        expect(dist(sh, j.elbow), `${id} ${side} Oberarm`).toBeCloseTo(ARM.upper, 3);
        expect(dist(j.elbow, j.wrist), `${id} ${side} Unterarm`).toBeLessThanOrEqual(ARM.fore + 1e-3);
        expect(dist(j.wrist, hand), `${id} ${side} Hand`).toBeLessThanOrEqual(ARM.hand + 0.02);
      }
    }
  });

  it('Ellbogen weicht nach außen/unten aus (nicht über die Schulter)', () => {
    const g = WEAPON_GEOM.ak47!;
    const plan = holdPlan(g);
    const jr = armJoints(rightShoulder(), plan.right, elbowPole('R'));
    expect(jr.elbow.x).toBeLessThan(rightShoulder().x + 0.01); // außen = −x
    expect(jr.elbow.y).toBeLessThan(rightShoulder().y);
    const jl = armJoints(leftShoulder(), plan.left, elbowPole('L'));
    expect(jl.elbow.x).toBeGreaterThan(leftShoulder().x - 0.15);
    expect(jl.elbow.y).toBeLessThan(leftShoulder().y);
  });

  it('zu weit entferntes Ziel: Arm gestreckt, Handgelenk liegt auf der Linie zur Hand', () => {
    const far = { x: -0.25, y: 1.37, z: 2 };
    const j = armJoints(rightShoulder(), far, elbowPole('R'));
    expect(dist(rightShoulder(), j.wrist)).toBeCloseTo(ARM.upper + ARM.fore, 3);
    expect(j.wrist.z).toBeGreaterThan(0.6);
  });
});
