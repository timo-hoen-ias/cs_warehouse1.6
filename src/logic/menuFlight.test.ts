import { describe, expect, it } from 'vitest';
import { MAPS, mapById } from '../maps';
import { compileMap } from './mapcompile';
import { findPath } from './nav';
import {
  LoadGate, angleDiff, FLIGHT_EYE, FLIGHT_SPEED, FlightPath, flightPose, joinLegs, planFlight, polylineLength, resample, smoothPolyline, tourStops, yawOf, type V3,
} from './menuFlight';

const P = (x: number, y: number, z: number): V3 => ({ x, y, z });

describe('Linien-Helfer', () => {
  it('joinLegs entfernt doppelte Nahtpunkte', () => {
    const line = joinLegs([[P(0, 0, 0), P(1, 0, 0)], [P(1, 0, 0), P(2, 0, 0)]]);
    expect(line).toHaveLength(3);
  });

  it('Länge offen/geschlossen', () => {
    const sq = [P(0, 0, 0), P(4, 0, 0), P(4, 0, 3)];
    expect(polylineLength(sq)).toBe(7);
    expect(polylineLength(sq, true)).toBe(12);
  });

  it('resample: gleichmäßige Abstände, auch über Ecken; geschlossen ohne Doppelpunkt', () => {
    const sq = [P(0, 0, 0), P(10, 0, 0), P(10, 0, 10), P(0, 0, 10)];
    const r = resample(sq, 1, true);
    expect(r).toHaveLength(40);
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!;
      const b = r[(i + 1) % r.length]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(1, 5);
    }
    const open = resample([P(0, 0, 0), P(2.5, 0, 0)], 1, false);
    expect(open.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('smoothPolyline: offen behält Enden, glättet Zickzack; zu kurz bleibt unverändert', () => {
    const zig = [P(0, 0, 0), P(1, 1, 0), P(2, 0, 0), P(3, 1, 0), P(4, 0, 0), P(5, 0, 0)];
    const s = smoothPolyline(zig, 2, false);
    expect(s[0]).toEqual(zig[0]);
    expect(s[5]).toEqual(zig[5]);
    expect(Math.max(...s.slice(1, 5).map((p) => p.y))).toBeLessThan(0.8);
    expect(smoothPolyline([P(0, 0, 0), P(1, 0, 0)], 3, false)).toHaveLength(2);
  });

  it('smoothPolyline geschlossen läuft um', () => {
    const ring = resample([P(0, 0, 0), P(10, 0, 0), P(10, 0, 10), P(0, 0, 10)], 1, true);
    const s = smoothPolyline(ring, 3, true);
    expect(s).toHaveLength(ring.length);
    // Ecken werden nach innen gezogen
    expect(s[0]!.x).toBeGreaterThan(0.3);
  });
});

describe('FlightPath', () => {
  const ring = [P(0, 0, 0), P(20, 0, 0), P(20, 0, 20), P(0, 0, 20)];
  const path = new FlightPath(ring, 0.5, 2);

  it('Länge ≈ Umfang (Glättung kürzt die Ecken leicht)', () => {
    expect(path.length).toBeGreaterThan(70);
    expect(path.length).toBeLessThanOrEqual(80.5);
  });

  it('at ist umlaufend und gleichmäßig (konstantes Tempo)', () => {
    const a = path.at(3);
    const b = path.at(3 + path.length);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
    // negative Werte laufen rückwärts um
    const c = path.at(-1);
    const d = path.at(path.length - 1);
    expect(Math.hypot(c.x - d.x, c.z - d.z)).toBeLessThan(1e-6);
    for (const s of [3, 8, 25, 30]) { // gerade Abschnitte (Ecken kürzen die Sehne)
      const p = path.at(s);
      const q = path.at(s + 1);
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeGreaterThan(0.85);
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('Blick', () => {
  it('yaw 0 = −Z, +X = −π/2', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0);
    expect(yawOf(1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(angleDiff(yawOf(0, 1), Math.PI))).toBeLessThan(1e-9);
  });

  it('angleDiff nimmt den kürzesten Weg', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(0.2);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2);
  });

  it('flightPose: Augenhöhe über dem Boden, Blick grob in Fahrtrichtung, Pendeln begrenzt', () => {
    // gerade Strecke entlang +X, geschlossen als langer Ring
    const ring = [P(0, 2, 0), P(200, 2, 0), P(200, 2, 4), P(0, 2, 4)];
    const path = new FlightPath(ring, 0.5, 2);
    let maxDev = 0;
    for (let t = 0; t < 40; t += 0.5) {
      const pose = flightPose(path, t);
      expect(pose.y).toBeGreaterThan(2 + FLIGHT_EYE - 0.05);
      expect(pose.y).toBeLessThan(2 + FLIGHT_EYE + 0.05);
      maxDev = Math.max(maxDev, Math.abs(angleDiff(pose.yaw, yawOf(1, 0))));
      expect(Math.abs(pose.pitch)).toBeLessThan(0.2);
    }
    expect(maxDev).toBeLessThan(0.5);
    // Position folgt dem Tempo
    expect(flightPose(path, 10).x).toBeCloseTo(path.at(10 * FLIGHT_SPEED).x);
  });
});

describe('Rundreise auf echten Karten', () => {
  for (const m of MAPS) {
    it(`${m.id}: Stationen + Rundweg in der Karte, zusammenhängend`, () => {
      const data = mapById(m.id).build();
      const c = compileMap(data);
      const stops = tourStops({ nav: c.nav, spawns: data.spawns, sites: data.sites });
      expect(stops.length).toBeGreaterThanOrEqual(4);
      // T-Spawn zuerst; beide Bombenspots sind dabei
      const t = data.spawns.find((s) => s.team === 'T')!;
      expect(stops[0]).toEqual(P(t.pos[0], t.pos[1], t.pos[2]));
      for (const s of data.sites) expect(stops.some((p) => Math.hypot(p.x - s.plant[0], p.z - s.plant[2]) < 1)).toBe(true);
      // Stationen liegen nicht dicht beieinander
      for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) expect(Math.hypot(stops[i]!.x - stops[j]!.x, (stops[i]!.y - stops[j]!.y) * 3, stops[i]!.z - stops[j]!.z)).toBeGreaterThanOrEqual(14 - 1e-6);

      const line = planFlight(c.nav, (a, b) => findPath(c.nav, c.collider, a, b), stops);
      expect(line).not.toBeNull();
      expect(polylineLength(line!, true)).toBeGreaterThan(150);
      for (const p of line!) {
        expect(p.x).toBeGreaterThan(data.bounds.min[0]);
        expect(p.x).toBeLessThan(data.bounds.max[0]);
        expect(p.z).toBeGreaterThan(data.bounds.min[2]);
        expect(p.z).toBeLessThan(data.bounds.max[2]);
      }
      // keine Sprünge: Nachbarpunkte (Knotenabstand 1 m, Herunterspringen/Treppen eingeschlossen)
      let maxStep = 0;
      for (let i = 1; i < line!.length; i++) maxStep = Math.max(maxStep, Math.hypot(line![i]!.x - line![i - 1]!.x, line![i]!.y - line![i - 1]!.y, line![i]!.z - line![i - 1]!.z));
      expect(maxStep).toBeLessThan(8);
      // die Bahn lässt sich abfliegen
      const path = new FlightPath(line!);
      const pose = flightPose(path, 100);
      expect(Number.isFinite(pose.x + pose.y + pose.z + pose.yaw + pose.pitch)).toBe(true);
    });
  }

  it('planFlight: zu wenige Stationen oder zu kurzer Weg → null', () => {
    const g = { x: new Float32Array([0, 1]), y: new Float32Array(2), z: new Float32Array(2) };
    expect(planFlight(g, () => null, [P(0, 0, 0)])).toBeNull();
    expect(planFlight(g, () => ({ nodes: [0, 1] }), [P(0, 0, 0), P(1, 0, 0)])).toBeNull(); // nur 2 m
    expect(planFlight(g, () => null, [P(0, 0, 0), P(1, 0, 0)])).toBeNull();
  });

  it('tourStops ohne Spawns/Bereiche liefert nur die Bombenspots', () => {
    const stops = tourStops({ nav: { areas: [] }, spawns: [], sites: [{ plant: [0, 0, 0] }, { plant: [50, 0, 0] }] });
    expect(stops).toHaveLength(2);
  });
});

describe('LoadGate (Kartenwechsel im Menü)', () => {
  it('Aufräumen vor begin(): der neue Ladevorgang bleibt gültig', () => {
    const g = new LoadGate();
    const first = g.begin();
    // Kartenwechsel: alte Welt entfernen (invalidiert) und erst danach neu beginnen
    g.invalidate();
    const second = g.begin();
    expect(g.current(first)).toBe(false);
    expect(g.current(second)).toBe(true);
  });

  it('der frühere Fehler: begin() vor dem Aufräumen → sofort veraltet', () => {
    const g = new LoadGate();
    const t = g.begin();
    g.invalidate(); // hide3d() → releaseWorld() nach dem Token
    expect(g.current(t)).toBe(false);
  });
});
