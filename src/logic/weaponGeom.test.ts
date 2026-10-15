import { describe, expect, it } from 'vitest';
import { angleBetween, aimError, aimRotation, sightError, viewAxis, viewPoint, type ViewPlace } from './viewPlace';
import { VIEW_SCALE } from './viewAnim';
import { TYPE_VISUAL, WEAPONS } from './weapons';
import { WEAPON_GEOM, weaponGeom } from './weaponGeom';

/** Echte Gesamtlängen (m) aus Datenblättern, unabhängig von der Tabelle: [min, max]. */
const REAL_LENGTH: Record<string, [number, number]> = {
  knife: [0.28, 0.34],
  glock: [0.18, 0.2],
  usp: [0.21, 0.24],
  p228: [0.19, 0.21],
  deagle: [0.26, 0.28],
  fiveseven: [0.19, 0.21],
  elite: [0.21, 0.23],
  m3: [0.95, 1.05],
  xm1014: [0.95, 1.05],
  mac10: [0.5, 0.56],
  tmp: [0.28, 0.32],
  mp5: [0.55, 0.69],
  ump45: [0.65, 0.7],
  p90: [0.49, 0.51],
  galil: [0.95, 1.0],
  famas: [0.74, 0.78],
  ak47: [0.86, 0.9],
  m4a1: [0.83, 0.85],
  sg552: [0.95, 1.01],
  aug: [0.79, 0.82],
  scout: [0.98, 1.02],
  awp: [1.16, 1.2],
  g3sg1: [1.0, 1.04],
  sg550: [0.98, 1.02],
  m249: [1.02, 1.06],
  hegrenade: [0.06, 0.08],
  flashbang: [0.04, 0.06],
  smokegrenade: [0.055, 0.07],
  c4: [0.18, 0.22],
};

const GUNS = Object.entries(WEAPON_GEOM).filter(([, g]) => g.hold === 'pistol' || g.hold === 'dual' || g.hold === 'rifle');

function placeOf(id: string): ViewPlace {
  const v = WEAPONS[id]!.visual;
  return { pos: v.pos, rot: v.rot, scale: VIEW_SCALE };
}

describe('Geometrie-Tabelle der Waffenmodelle', () => {
  it('deckt jedes Modell aus weapons.json ab (und nur solche)', () => {
    const models = new Set(Object.values(WEAPONS).map((w) => w.visual.model));
    for (const m of models) expect(weaponGeom(m), m).toBeDefined();
    for (const id of Object.keys(WEAPON_GEOM)) expect(models.has(id), id).toBe(true);
    expect(weaponGeom('gibtsnicht')).toBeUndefined();
  });

  it('echte Längen: Tabelle liegt im Datenblatt-Bereich', () => {
    for (const [id, g] of Object.entries(WEAPON_GEOM)) {
      const r = REAL_LENGTH[id];
      expect(r, `${id} ohne Referenzlänge`).toBeDefined();
      expect(g.length, id).toBeGreaterThanOrEqual(r![0]);
      expect(g.length, id).toBeLessThanOrEqual(r![1]);
    }
  });

  it('Klassen-Reihenfolge der Längen: Pistole < MP < Gewehr < Scharfschütze', () => {
    const L = (id: string): number => WEAPON_GEOM[id]!.length;
    expect(L('glock')).toBeLessThan(L('deagle'));
    expect(L('deagle')).toBeLessThan(L('mp5'));
    expect(L('p90')).toBeLessThan(L('ak47'));
    expect(L('m4a1')).toBeLessThan(L('ak47') + 0.001);
    expect(L('ak47')).toBeLessThan(L('awp'));
    expect(L('m249')).toBeGreaterThan(L('ak47'));
  });

  it('Länge = Mündung − Schaftkappe (±3 cm) bei Waffen mit Schaft', () => {
    for (const [id, g] of GUNS) {
      if (!g.butt) continue;
      expect(Math.abs(g.muzzle[2] - g.butt[2] - g.length), id).toBeLessThan(0.03);
    }
  });

  it('Schusswaffen haben eine Schaftkappe hinter der Schusshand (außer Pistolen/Kompakt-MPs)', () => {
    for (const [id, g] of GUNS) {
      if (g.hold !== 'rifle') continue;
      expect(g.butt, id).toBeDefined();
      expect(g.butt![2], id).toBeLessThan(-0.2);
    }
  });

  it('Mündung liegt vorn: vor Schusshand, Stützhand und Kimme/Korn', () => {
    for (const [id, g] of GUNS) {
      expect(g.muzzle[2], id).toBeGreaterThan(g.gripR[2] + 0.1);
      expect(g.muzzle[2], id).toBeGreaterThanOrEqual(g.gripL[2]);
      if (g.sightFront) expect(g.muzzle[2], id).toBeGreaterThanOrEqual(g.sightFront[2]);
      expect(Math.abs(g.muzzle[0]), id).toBeLessThan(0.3); // Elite: zweite Pistole links
    }
    for (const [id, g] of GUNS) if (g.muzzle2) expect(g.muzzle2[2], id).toBeCloseTo(g.muzzle[2], 3);
  });

  it('Schusshand am Pistolengriff (Ursprung), Stützhand je nach Waffenart', () => {
    for (const [id, g] of GUNS) {
      expect(Math.hypot(...g.gripR), id).toBeLessThan(0.01);
      const d = g.gripL[2] - g.gripR[2];
      if (g.hold === 'rifle') expect(d, id).toBeGreaterThan(0.12); // Vorderschaft / Magazinschacht
      else if (g.hold === 'pistol' && g.length < 0.25) expect(Math.hypot(g.gripL[0] - g.gripR[0], d), id).toBeLessThan(0.06); // Tassengriff
    }
    // Elites: linke Hand an der linken Pistole
    const e = WEAPON_GEOM.elite!;
    expect(e.gripL[0]).toBeCloseTo(e.muzzle2![0], 3);
  });

  it('Auswurffenster: hinter der Mündung, rechts am Gehäuse (P90: unten)', () => {
    for (const [id, g] of GUNS) {
      expect(g.eject, id).toBeDefined();
      const e = g.eject!;
      expect(e[2], id).toBeLessThan(g.muzzle[2] - 0.05);
      if (g.butt) expect(e[2], id).toBeGreaterThan(g.butt[2]);
      if (id === 'p90') {
        expect(e[1], id).toBeLessThan(-0.05);
        expect(g.ejectDir![1], id).toBeLessThan(-0.5);
      } else {
        expect(e[0], id).toBeGreaterThan(0.008);
        expect(e[1], id).toBeGreaterThan(g.muzzle[1] - 0.05);
      }
    }
    expect(WEAPON_GEOM.elite!.eject2![0]).toBeCloseTo(WEAPON_GEOM.elite!.muzzle2![0] + 0.013, 3);
  });

  it('Sichtlinie: Kimme hinter Korn, nahezu parallel zur Laufachse, Höhe plausibel', () => {
    for (const [id, g] of GUNS) {
      if (!g.sightRear || !g.sightFront) continue;
      expect(g.sightRear[2], id).toBeLessThan(g.sightFront[2] - 0.05);
      const dy = g.sightFront[1] - g.sightRear[1];
      const df = g.sightFront[2] - g.sightRear[2];
      expect(Math.abs(Math.atan2(dy, df)), id).toBeLessThan(0.09); // ≤ ~5°
      const h = (g.sightRear[1] + g.sightFront[1]) / 2 - g.muzzle[1];
      expect(h, id).toBeGreaterThan(0.005);
      expect(h, id).toBeLessThan(0.13);
    }
  });

  it('Haltungsarten passen zum Waffentyp', () => {
    for (const w of Object.values(WEAPONS)) {
      const hold = weaponGeom(w.visual.model)!.hold;
      if (w.type === 'pistol') expect(['pistol', 'dual'], w.id).toContain(hold);
      if (w.type === 'rifle' || w.type === 'sniper' || w.type === 'shotgun' || w.type === 'mg') expect(hold, w.id).toBe('rifle');
      if (w.type === 'grenade') expect(hold, w.id).toBe('grenade');
      if (w.type === 'bomb') expect(hold, w.id).toBe('bomb');
      if (w.type === 'knife') expect(hold, w.id).toBe('knife');
    }
  });

  it('fit-Stützstellen sind aufsteigend und stauchen nur außerhalb des Griffbereichs', () => {
    for (const [id, g] of Object.entries(WEAPON_GEOM)) {
      if (!g.fit) continue;
      for (let i = 1; i < g.fit.length; i++) {
        expect(g.fit[i]![0], id).toBeGreaterThan(g.fit[i - 1]![0]);
        expect(g.fit[i]![1], id).toBeGreaterThan(g.fit[i - 1]![1]);
      }
      // Griff, Abzug und Magazinschacht (−0.05 … 0.1) bleiben unverzerrt
      const map = (f: number): number => {
        for (let i = 1; i < g.fit!.length; i++) {
          const [a0, b0] = g.fit![i - 1]!;
          const [a1, b1] = g.fit![i]!;
          if (f <= a1) return b0 + ((f - a0) * (b1 - b0)) / (a1 - a0);
        }
        return f;
      };
      expect(map(-0.05), id).toBeCloseTo(-0.05, 6);
      expect(map(0.09), id).toBeCloseTo(0.09, 6);
    }
  });
});

describe('Viewmodel-Ruhelage (viewPlace)', () => {
  it('viewPoint ohne Drehung: pos + scale · (x, y, −f)', () => {
    const p = viewPoint({ pos: { x: 0.1, y: -0.1, z: -0.3 }, rot: { x: 0, y: 0, z: 0 }, scale: 0.5 }, [0.02, 0.04, 0.2]);
    expect(p.x).toBeCloseTo(0.11, 9);
    expect(p.y).toBeCloseTo(-0.08, 9);
    expect(p.z).toBeCloseTo(-0.4, 9);
  });

  it('Gier (ry > 0) schwenkt die Mündung nach links, Nicken (rx > 0) hebt sie', () => {
    const base: ViewPlace = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0.2, z: 0 }, scale: 1 };
    expect(viewPoint(base, [0, 0, 1]).x).toBeLessThan(-0.15);
    const up = viewPoint({ ...base, rot: { x: 0.2, y: 0, z: 0 } }, [0, 0, 1]);
    expect(up.y).toBeGreaterThan(0.15);
    expect(up.z).toBeLessThan(-0.9);
    const ax = viewAxis({ ...base, rot: { x: 0, y: 0, z: 0.7 } }); // Rollen ändert die Laufachse nicht
    expect(ax.z).toBeCloseTo(-1, 9);
  });

  it('aimRotation zielt die Laufachse genau aufs Fadenkreuz', () => {
    const geom = { muzzle: [0, 0.08, 0.4] as const };
    for (const pos of [{ x: 0.13, y: -0.12, z: -0.27 }, { x: 0.2, y: -0.05, z: -0.4 }, { x: 0.06, y: -0.2, z: -0.2 }]) {
      const rot = aimRotation(pos, 0.5, geom, 0.04, 8);
      expect(aimError({ pos, rot, scale: 0.5 }, geom, 8)).toBeLessThan(1e-6);
      expect(rot.z).toBe(0.04);
    }
    // Ziel liegt links oben der Waffe → Mündung nach links (ry > 0) und oben (rx > 0)
    const r = aimRotation({ x: 0.13, y: -0.12, z: -0.27 }, 0.5, geom);
    expect(r.y).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThan(0);
  });

  it('angleBetween', () => {
    expect(angleBetween({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 9);
    expect(angleBetween({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -3 })).toBeCloseTo(0, 9);
  });

  it('jede Schusswaffe: Laufachse zeigt aufs Fadenkreuz (≤ 0,5° bei 10 m)', () => {
    let n = 0;
    for (const w of Object.values(WEAPONS)) {
      if (!TYPE_VISUAL[w.type].aim) continue;
      const g = weaponGeom(w.visual.model)!;
      const err = aimError(placeOf(w.id), g);
      expect(err, w.id).toBeLessThan((0.5 * Math.PI) / 180);
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(24);
  });

  it('jede Schusswaffe: Sichtlinie (Kimme → Korn) trifft das Fadenkreuz (≤ 5°)', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!TYPE_VISUAL[w.type].aim) continue;
      const g = weaponGeom(w.visual.model)!;
      expect(sightError(placeOf(w.id), g), w.id).toBeLessThan((5 * Math.PI) / 180);
    }
  });

  it('Mündung liegt unten rechts vor der Kamera, Griffpunkt = Halter-Position (Hand-Ziel)', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!TYPE_VISUAL[w.type].aim) continue;
      const g = weaponGeom(w.visual.model)!;
      const place = placeOf(w.id);
      const m = viewPoint(place, g.muzzle);
      expect(m.z, w.id).toBeLessThan(-0.25);
      expect(m.z, w.id).toBeGreaterThan(-0.8);
      expect(m.x, w.id).toBeGreaterThan(0);
      expect(m.y, w.id).toBeLessThan(0);
      // die rechte Hand sitzt auf dem Griffpunkt = Halter-Ursprung
      const hand = viewPoint(place, g.gripR);
      expect(hand.x, w.id).toBeCloseTo(w.visual.pos.x, 6);
      expect(hand.y, w.id).toBeCloseTo(w.visual.pos.y, 6);
      expect(hand.z, w.id).toBeCloseTo(w.visual.pos.z, 6);
    }
  });

  it('Mündung ragt nicht über die Bildmitte hinaus (Fadenkreuz bleibt frei)', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!TYPE_VISUAL[w.type].aim) continue;
      const g = weaponGeom(w.visual.model)!;
      const m = viewPoint(placeOf(w.id), g.muzzle);
      const sy = m.y / -m.z; // Tangens der Höhe (negativ = unter der Mitte)
      const sx = m.x / -m.z;
      expect(sy, w.id).toBeLessThan(-0.08);
      expect(sx, w.id).toBeGreaterThan(0.08);
    }
  });
});
