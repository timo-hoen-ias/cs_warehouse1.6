/**
 * Mischentscheidungen fürs Audio (pure, framework-frei, testbar): Varianten-Wahl,
 * Tonhöhen-Streuung, Abstands-Lautstärke/-Tiefpass, Nah/Fern-Überblendung,
 * Verdeckung, Schritt-Takt, Vorbeiflug-Erkennung, Tinnitus nach Blendgranate,
 * Sprung/Landung, Granaten-Abpraller und Lautstärke-Kanäle.
 */
import type { Settings } from './settings';
import type { Surface } from './acoustics';
import { nearestAabbDistance, type Aabb } from './hitbox';

export type V3 = { x: number; y: number; z: number };

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

// ----------------------------------------------------------------------------- Kanäle

export type BusGains = { master: number; effects: number; ambience: number; ui: number };

/** Lautstärke-Kanäle aus den Einstellungen (geklemmt 0..1, Kurve: quadratisch fürs Ohr). */
export function busGains(s: Pick<Settings, 'volume' | 'volumeEffects' | 'volumeAmbience' | 'volumeUi'>): BusGains {
  const curve = (v: number): number => {
    const c = clamp(Number.isFinite(v) ? v : 0, 0, 1);
    return c * c;
  };
  return { master: curve(s.volume), effects: curve(s.volumeEffects), ambience: curve(s.volumeAmbience), ui: curve(s.volumeUi) };
}

// ----------------------------------------------------------------------------- Variation

/** Zufällige Variante 0..count-1 ohne direkte Wiederholung von `last`. */
export function pickVariant(count: number, last: number, rnd: () => number): number {
  if (count <= 1) return 0;
  if (last < 0 || last >= count) return Math.min(count - 1, Math.floor(rnd() * count));
  const i = Math.min(count - 2, Math.floor(rnd() * (count - 1)));
  return i >= last ? i + 1 : i;
}

/** Abspielrate gleichverteilt in [min, max]. */
export function randomPitch(range: readonly [number, number], rnd: () => number): number {
  const [a, b] = range;
  return a + (b - a) * rnd();
}

// ----------------------------------------------------------------------------- Entfernung

/**
 * Lautstärke über Entfernung: bis `ref` voll, danach (ref/d)^0.85 (etwas sanfter
 * als physikalisch, damit Schüsse wie in CS weit tragen) und zum Rand `maxDist`
 * weich auf 0 ausgeblendet.
 */
export function distanceGain(d: number, ref: number, maxDist: number): number {
  if (d >= maxDist) return 0;
  const inv = d <= ref ? 1 : Math.pow(ref / d, 0.85);
  const fadeStart = maxDist * 0.6;
  const edge = d <= fadeStart ? 1 : 1 - smooth((d - fadeStart) / (maxDist - fadeStart));
  return inv * edge;
}

function smooth(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/** Luftdämpfung: Tiefpass-Grenzfrequenz (Hz) fällt mit der Entfernung (Höhen verschwinden zuerst). */
export function airLowpass(d: number): number {
  return clamp(22000 * Math.exp(-Math.max(0, d) / 55), 1500, 22000);
}

/** Gleichleistungs-Überblendung Nahklang → Fernklang zwischen `start` und `end` Metern. */
export function nearFarMix(d: number, start = 14, end = 45): { near: number; far: number } {
  const t = clamp((d - start) / (end - start), 0, 1);
  return { near: Math.cos((t * Math.PI) / 2), far: Math.sin((t * Math.PI) / 2) };
}

/** Verdeckung durch Wände: gedämpft + dumpf. */
export const OCCLUSION = { gain: 0.45, cutoff: 900 } as const;

/** Hall-Anteil wächst mit der Entfernung (ferne Quellen klingen „im Raum“). */
export function reverbSend(d: number, roomWet: number, sampleReverb: number): number {
  return clamp(roomWet * sampleReverb * (0.45 + 0.55 * clamp(d / 30, 0, 1)), 0, 1.5);
}

export function dist(a: V3, b: V3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// ----------------------------------------------------------------------------- Schritte

export const STEP = {
  /** Unter dieser Geschwindigkeit (m/s) lautlos: 140 u/s (CS: Shift-Schleichen = 52 % von 250 u/s ≈ 3.2 m/s bleibt darunter). */
  minSpeed: 3.47,
  /** Schrittlänge = base + perSpeed · v (m). */
  strideBase: 1.15,
  stridePerSpeed: 0.12,
  /** Lautstärke beim normalen Gehen relativ zum Sprint. */
  walkGain: 0.7,
  sprintSpeed: 6.2,
} as const;

/** Schrittlänge in Metern bei Geschwindigkeit `speed`. */
export function stepStride(speed: number): number {
  return STEP.strideBase + STEP.stridePerSpeed * Math.max(0, speed);
}

/** Lautstärke eines Schritts (0 = lautlos: geduckt oder schleichend). */
export function stepGain(speed: number, crouch: boolean): number {
  if (crouch || speed < STEP.minSpeed) return 0;
  const t = clamp((speed - STEP.minSpeed) / (STEP.sprintSpeed - STEP.minSpeed), 0, 1);
  return STEP.walkGain + (1 - STEP.walkGain) * t;
}

export type StepState = { acc: number; foot: 0 | 1 };

/**
 * Schritt-Takt: summiert die zurückgelegte Strecke; liefert `true`, wenn ein
 * Schritt fällig ist (wechselnd linker/rechter Fuß). Teleports (> 2 m pro Frame) zählen nicht.
 */
export function advanceStep(s: StepState, moved: number, speed: number, crouch: boolean): boolean {
  if (moved > 2 || stepGain(speed, crouch) <= 0) return false;
  s.acc += moved;
  if (s.acc < stepStride(speed)) return false;
  s.acc = 0;
  s.foot = s.foot === 0 ? 1 : 0;
  return true;
}

// ----------------------------------------------------------------------------- Vorbeiflug

export type Flyby = { point: V3; dist: number; t: number };

/**
 * Fliegt ein Schuss (Segment o → end) am Hörer vorbei? Ja, wenn der nächste Punkt
 * des Segments näher als `radius` liegt, der Hörer nicht der Schütze ist und die
 * Kugel nicht schon vor ihm endet (Treffer am Hörer selbst zählt als Treffer, nicht Vorbeiflug).
 */
export function flybyCheck(o: V3, end: V3, l: V3, radius = 2, minFromShooter = 4): Flyby | null {
  const dx = end.x - o.x;
  const dy = end.y - o.y;
  const dz = end.z - o.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-6) return null;
  if (dist(o, l) < minFromShooter) return null;
  const t = ((l.x - o.x) * dx + (l.y - o.y) * dy + (l.z - o.z) * dz) / len2;
  if (t <= 0 || t >= 1) return null;
  const point = { x: o.x + dx * t, y: o.y + dy * t, z: o.z + dz * t };
  const d = dist(point, l);
  if (d > radius) return null;
  // Endet die Kugel kurz hinter dem Hörer (< 0.5 m), ist es eher ein Treffer
  if (Math.sqrt(len2) * (1 - t) < 0.5) return null;
  return { point, dist: d, t };
}

/** Vorbeiflug-Lautstärke: je näher, desto lauter. */
export function flybyGain(d: number, radius = 2): number {
  return clamp(1 - d / radius, 0, 1) * 0.8 + 0.2;
}

// ----------------------------------------------------------------------------- Blendgranate

export type EarRing = { duration: number; gain: number; cutoff: number; duck: number };

/**
 * Tinnitus nach Blendgranate: Dauer/Lautstärke des Pfeifens, Tiefpass und
 * Absenkung der übrigen Geräusche abhängig von der Blendstärke (0..1).
 */
export function earRing(amount: number): EarRing {
  const a = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
  if (a < 0.1) return { duration: 0, gain: 0, cutoff: 22000, duck: 1 };
  return {
    duration: 1 + 4.5 * a,
    gain: 0.15 + 0.5 * a,
    cutoff: Math.round(4500 - 3800 * a),
    duck: 1 - 0.75 * a,
  };
}

// ----------------------------------------------------------------------------- Sprung / Landung

export type VerticalState = { y: number; air: boolean; minVy: number; still: number; init: boolean };

export function newVertical(): VerticalState {
  return { y: 0, air: false, minVy: 0, still: 0, init: false };
}

export type VerticalEvent = { kind: 'jump' } | { kind: 'land'; strength: number } | null;

/**
 * Erkennt Absprung/Landung aus der Fußhöhe pro Frame. Treppenstufen (ein
 * einzelner Sprung der Höhe ohne anhaltende Geschwindigkeit) lösen nichts aus.
 */
export function trackVertical(s: VerticalState, y: number, dt: number): VerticalEvent {
  if (!s.init || dt <= 0) {
    s.y = y;
    s.init = true;
    return null;
  }
  const dy = y - s.y;
  s.y = y;
  const vy = dy / dt;
  // Stufe hoch/runter: ein einzelner großer Satz, aber nur, wenn wir am Boden sind
  if (!s.air && Math.abs(dy) > 0.25 && Math.abs(vy) > 14) return null;
  if (!s.air) {
    if (vy > 2.5) {
      s.air = true;
      s.minVy = 0;
      s.still = 0;
      return { kind: 'jump' };
    }
    if (vy < -2.5) {
      s.air = true;
      s.minVy = vy;
      s.still = 0;
    }
    return null;
  }
  s.minVy = Math.min(s.minVy, vy);
  if (Math.abs(vy) < 0.05) s.still += 1;
  else s.still = 0;
  if (s.still >= 2) {
    s.air = false;
    const strength = clamp(-s.minVy / 12, 0, 1);
    s.minVy = 0;
    return strength > 0.15 ? { kind: 'land', strength } : null;
  }
  return null;
}

// ----------------------------------------------------------------------------- Granaten

/** Abpraller: Richtungswechsel der Geschwindigkeit (vertikal hoch nach Fall oder horizontal umgedreht). */
export function isBounce(prev: V3, v: V3): boolean {
  const ps = Math.hypot(prev.x, prev.y, prev.z);
  if (ps < 1.2) return false;
  if (prev.y < -1 && v.y > 0.2) return true;
  const ph = Math.hypot(prev.x, prev.z);
  const vh = Math.hypot(v.x, v.z);
  if (ph > 1 && vh > 0.3) {
    const dot = (prev.x * v.x + prev.z * v.z) / (ph * vh);
    if (dot < -0.2) return true;
  }
  return false;
}

// ----------------------------------------------------------------------------- C4

/**
 * Anzahl Tastendrücke beim Bombe-Legen, die zwischen zwei Fortschrittswerten fällig
 * werden: Drücke bei k/count (k = 0..count-1) mit prev < k/count ≤ now. Beim Start
 * des Legens prev < 0 übergeben, damit der erste Druck sofort kommt.
 */
export function keypadPresses(prev: number, now: number, count = 7): number {
  if (!(now > prev)) return 0;
  let n = 0;
  for (let k = 0; k < count; k++) {
    const th = k / count;
    if (th > prev && th <= now) n += 1;
  }
  return n;
}

/** Kurz vor der Explosion wird das Piepen höher (CS: hektischer Ton am Ende). */
export function beepPitch(fuseLeft: number): number {
  return fuseLeft < 1.5 ? 1.25 : fuseLeft < 5 ? 1.1 : 1;
}

// ----------------------------------------------------------------------------- Welt-Anbindung

const SURFACES: readonly Surface[] = ['concrete', 'metal', 'grate', 'wood', 'gravel', 'tile'];

/** Beliebigen Wert (z. B. aus `World.surfaceAt`) auf eine bekannte Oberfläche abbilden (Standard Beton). */
export function asSurface(v: unknown): Surface {
  return SURFACES.includes(v as Surface) ? (v as Surface) : 'concrete';
}

/** Sichtlinie a → b durch eine Box blockiert? (`margin`: Treffer direkt am Ziel zählen nicht.) */
export function segmentBlocked(a: V3, b: V3, boxes: readonly Aabb[], margin = 0.35): boolean {
  const len = dist(a, b);
  if (len <= margin * 2) return false;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len, z: (b.z - a.z) / len };
  return nearestAabbDistance(a, dir, boxes as Aabb[], len) < len - margin;
}
