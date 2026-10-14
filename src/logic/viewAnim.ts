/**
 * Viewmodel-Animation (pur, framework-frei, getestet in viewAnim.test.ts).
 *
 * Bausteine:
 *  - Easing-Kurven (`ease`) und Keyframe-Spuren (`sampleTrack`) mit normierten Zeiten 0..1,
 *    damit sich jeder Clip auf echte Dauern strecken lässt (Nachladezeit, Repetierzeit `cycle`).
 *  - Clips (`Clip`) aus benannten Spuren (`TrackName`): Wurzel-Offsets der Waffe (Kameraraum),
 *    Teile (Schlitten, Spannhebel, Kammerstängel, Pumpe, Magazin, Deckel, Splint, Bügel …)
 *    und Hand-Ziele (linke Hand an Magazin/Spannhebel/Ladeöffnung, rechte am Kammerstängel/Tastenfeld).
 *  - Mixer (`ViewAnimator`): eine Aktion (mit Überblendung) + additive Einmal-Overlays.
 *  - Prozedurale Schichten: Atmen, Lauf-Bob, Seitneigung beim Strafen, Sprint-Haltung,
 *    gedämpfte Feder für den Rückstoß.
 *  - Clip-Bibliothek: Ziehen, Inspizieren, Nachladen (Magazin, Pistole, Schrot Schuss für Schuss,
 *    Doppelpistole, MG mit Deckel), Repetieren (Kammer/Pumpe), Schlitten-Zyklus, Trockenschuss,
 *    Messer (Hieb/Stich), Granate (Splint ziehen, Wurf), C4 (Tippen beim Legen).
 *
 * Einheiten: Wurzel-Offsets px/py/pz in Metern im Kameraraum (+x rechts, +y oben, +z zur Kamera
 * hin = Rückstoß), Drehungen rx/ry/rz in Radiant (rx > 0 hebt die Mündung, ry > 0 schwenkt die
 * Mündung nach links, rz > 0 kantet die Waffe nach links). Teil-Spuren sind normiert
 * (0 = Ruhe, 1 = voller Weg); `mag` > 1 heißt „Magazin aus dem Schacht und weiter weg".
 * Hand-Offsets lhX…rhZ sind Meter im (unskalierten) Waffenraum.
 */

// ------------------------------------------------------------------ Easing

export type Ease =
  | 'linear' | 'step' | 'in' | 'out' | 'inOut'
  | 'inCubic' | 'outCubic' | 'inOutCubic' | 'outBack' | 'inBack' | 'outElastic';

export const EASES: readonly Ease[] = ['linear', 'step', 'in', 'out', 'inOut', 'inCubic', 'outCubic', 'inOutCubic', 'outBack', 'inBack', 'outElastic'];

/** Easing-Kurve; t wird auf 0..1 begrenzt, Ergebnis ist 0 bei t=0 und 1 bei t=1. */
export function ease(kind: Ease, t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  switch (kind) {
    case 'linear': return x;
    case 'step': return x < 1 ? 0 : 1;
    case 'in': return x * x;
    case 'out': return 1 - (1 - x) * (1 - x);
    case 'inOut': return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
    case 'inCubic': return x * x * x;
    case 'outCubic': return 1 - (1 - x) ** 3;
    case 'inOutCubic': return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
    case 'outBack': {
      const c1 = 1.70158;
      return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
    }
    case 'inBack': {
      const c1 = 1.70158;
      return (c1 + 1) * x * x * x - c1 * x * x;
    }
    case 'outElastic':
      if (x === 0 || x === 1) return x;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  }
}

// ------------------------------------------------------------------ Spuren + Clips

/** Keyframe: [Zeit 0..1, Wert, Easing des Segments VOM vorigen Key zu diesem]. */
export type Key = readonly [t: number, v: number, e?: Ease];
export type Track = readonly Key[];

/** Wert einer Spur zur normierten Zeit t (vor dem ersten/nach dem letzten Key: konstant). */
export function sampleTrack(track: Track, t: number): number {
  const n = track.length;
  if (n === 0) return 0;
  const first = track[0]!;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < n; i++) {
    const b = track[i]!;
    if (t < b[0]) {
      const a = track[i - 1]!;
      const span = b[0] - a[0];
      if (span <= 0) return b[1];
      return a[1] + (b[1] - a[1]) * ease(b[2] ?? 'inOut', (t - a[0]) / span);
    }
  }
  return track[n - 1]![1];
}

export const TRACKS = [
  // Wurzel der Waffe (Kameraraum)
  'px', 'py', 'pz', 'rx', 'ry', 'rz',
  // Teile
  'slide', 'slide2', 'charge', 'bolt', 'boltBack', 'pump', 'mag', 'mag2', 'magRot', 'magHide',
  'cover', 'pin', 'spoon', 'itemHide', 'shell',
  // Hände
  'lhMag', 'lhCharge', 'lhPort', 'lhX', 'lhY', 'lhZ', 'rhBolt', 'rhKey', 'rhX', 'rhY', 'rhZ',
] as const;
export type TrackName = (typeof TRACKS)[number];
export type Pose = Record<TrackName, number>;

export function emptyPose(): Pose {
  const p = {} as Pose;
  for (const k of TRACKS) p[k] = 0;
  return p;
}

export function resetPose(p: Pose): Pose {
  for (const k of TRACKS) p[k] = 0;
  return p;
}

export type Clip = {
  name: string;
  /** Dauer in Sekunden (Key-Zeiten sind normiert). */
  duration: number;
  tracks: Partial<Record<TrackName, Track>>;
  /** Endlosschleife (C4 tippen). */
  loop?: boolean;
  /** Am Ende stehen bleiben, bis ein anderer Clip übernimmt (Granate gezogen). */
  hold?: boolean;
};

/** Addiert die Clip-Werte zur Zeit `time` (Sekunden) gewichtet auf `out`. */
export function sampleClip(clip: Clip, time: number, out: Pose, weight = 1): Pose {
  if (weight === 0) return out;
  const d = Math.max(1e-6, clip.duration);
  let t = time / d;
  if (clip.loop) t = t - Math.floor(t);
  for (const name in clip.tracks) {
    const tr = clip.tracks[name as TrackName];
    if (tr) out[name as TrackName] += sampleTrack(tr, t) * weight;
  }
  return out;
}

/** Prüft Key-Zeiten (0..1, aufsteigend) und endliche Werte; liefert Fehlertexte. */
export function validateClip(clip: Clip): string[] {
  const errs: string[] = [];
  if (!(clip.duration > 0) || !Number.isFinite(clip.duration)) errs.push(`${clip.name}: Dauer ${clip.duration}`);
  for (const name in clip.tracks) {
    const tr = clip.tracks[name as TrackName]!;
    let last = -Infinity;
    for (const [t, v] of tr) {
      if (t < 0 || t > 1) errs.push(`${clip.name}.${name}: Zeit ${t} außerhalb 0..1`);
      if (t < last) errs.push(`${clip.name}.${name}: Zeiten nicht aufsteigend (${t} < ${last})`);
      if (!Number.isFinite(v)) errs.push(`${clip.name}.${name}: Wert ${v}`);
      last = t;
    }
  }
  return errs;
}

// ------------------------------------------------------------------ Mixer

type Running = { clip: Clip; time: number; weight: number; fade: number; dir: 1 | -1 };

/**
 * Mixer: genau eine Aktion (Ziehen, Nachladen, Inspizieren …) mit Überblendung beim Wechsel,
 * dazu additive Einmal-Overlays (Schlitten-Zyklus, Trockenschuss). Nicht haltende Clips enden
 * von selbst (ihre Spuren laufen auf 0 zurück), haltende bleiben auf dem letzten Wert stehen.
 */
export class ViewAnimator {
  private action: Running | null = null;
  private fading: Running[] = [];
  private overlays: Running[] = [];

  /** Startet eine Aktion; die bisherige wird über `fade` Sekunden ausgeblendet. */
  play(clip: Clip, fade = 0.08): void {
    if (this.action) this.fadeOut(this.action, fade);
    this.action = { clip, time: 0, weight: fade > 0 ? 0 : 1, fade, dir: 1 };
  }

  /** Beendet die aktuelle Aktion weich. */
  stop(fade = 0.12): void {
    if (this.action) this.fadeOut(this.action, fade);
    this.action = null;
  }

  /** Alles sofort verwerfen (Waffenwechsel). */
  clear(): void {
    this.action = null;
    this.fading = [];
    this.overlays = [];
  }

  /** Additiver Einmal-Clip (läuft parallel zur Aktion). */
  overlay(clip: Clip): void {
    this.overlays.push({ clip, time: 0, weight: 1, fade: 0, dir: 1 });
    if (this.overlays.length > 6) this.overlays.shift();
  }

  /** Name der laufenden Aktion (null = Ruhe). */
  current(): string | null {
    return this.action?.clip.name ?? null;
  }

  /** Fortschritt 0..1 der laufenden Aktion (0 ohne Aktion). */
  progress(): number {
    const a = this.action;
    if (!a) return 0;
    const t = a.time / Math.max(1e-6, a.clip.duration);
    return a.clip.loop ? t - Math.floor(t) : Math.min(1, t);
  }

  /** Läuft gerade eine Aktion mit diesem Namen (Präfix-Vergleich)? */
  isPlaying(prefix: string): boolean {
    return !!this.action && this.action.clip.name.startsWith(prefix);
  }

  tick(dt: number): void {
    if (dt <= 0) return;
    const a = this.action;
    if (a) {
      a.time += dt;
      if (a.weight < 1) a.weight = a.fade > 0 ? Math.min(1, a.weight + dt / a.fade) : 1;
      if (!a.clip.loop && !a.clip.hold && a.time >= a.clip.duration) this.action = null;
    }
    for (const f of this.fading) {
      f.time = f.clip.loop || f.time < f.clip.duration ? f.time + dt : f.time;
      f.weight = f.fade > 0 ? Math.max(0, f.weight - dt / f.fade) : 0;
    }
    this.fading = this.fading.filter((f) => f.weight > 0);
    for (const o of this.overlays) o.time += dt;
    this.overlays = this.overlays.filter((o) => o.time < o.clip.duration);
  }

  /** Summe aller laufenden Clips (Aktion + ausblendende + Overlays) in `out`. */
  sample(out: Pose): Pose {
    resetPose(out);
    for (const f of this.fading) sampleClip(f.clip, Math.min(f.time, f.clip.loop ? f.time : f.clip.duration), out, f.weight);
    const a = this.action;
    if (a) sampleClip(a.clip, a.clip.loop ? a.time : Math.min(a.time, a.clip.duration), out, a.weight);
    for (const o of this.overlays) sampleClip(o.clip, o.time, out, 1);
    return out;
  }

  private fadeOut(r: Running, fade: number): void {
    if (fade <= 0) return;
    r.fade = fade * Math.max(0.01, r.weight); // bereits halb eingeblendete Clips schneller weg
    this.fading.push(r);
    if (this.fading.length > 3) this.fading.shift();
  }
}

// ------------------------------------------------------------------ Prozedurale Schichten

export type PoseDelta = { px: number; py: number; pz: number; rx: number; ry: number; rz: number };

export function zeroDelta(): PoseDelta {
  return { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
}

/** Atmen im Stand (Sekunden-Uhr t, amount 0..1). */
export function breathe(t: number, amount = 1): PoseDelta {
  const a = amount;
  return {
    px: Math.sin(t * 0.8) * 0.0012 * a,
    py: Math.sin(t * 1.6) * 0.0022 * a,
    pz: 0,
    rx: Math.sin(t * 1.6 + 0.6) * 0.006 * a,
    ry: Math.sin(t * 0.55) * 0.004 * a,
    rz: Math.sin(t * 0.8 + 1.1) * 0.005 * a,
  };
}

/** Lauf-Bob (Achter-Figur): Phase in Radiant (ein Schritt = π), amount 0..~1.6. */
export function walkBob(phase: number, amount: number): PoseDelta {
  const a = amount;
  return {
    px: Math.sin(phase) * 0.009 * a,
    py: (Math.cos(2 * phase) - 1) * 0.0055 * a,
    pz: 0,
    rx: Math.cos(2 * phase) * 0.008 * a,
    ry: Math.sin(phase) * 0.012 * a,
    rz: Math.sin(phase) * 0.018 * a,
  };
}

/** Bob-Phase fortschreiben: Schritttempo folgt der Geschwindigkeit (m/s). */
export function advanceViewBob(phase: number, speed: number, dt: number): number {
  if (speed <= 0.3 || dt <= 0) return phase;
  return phase + speed * 1.55 * dt;
}

/** Bob-Stärke aus Tempo (Laufen ≈ 1, Sprint ≈ 1.5, geduckt gedämpft). */
export function viewBobAmount(speed: number, walkSpeed: number, crouched: boolean): number {
  if (speed <= 0.3) return 0;
  const s = Math.min(1.6, speed / Math.max(0.1, walkSpeed));
  return s * (crouched ? 0.45 : 1);
}

/** Seitneigung beim Strafen: seitliche Geschwindigkeit (m/s, + = rechts). */
export function strafeLean(lateral: number): PoseDelta {
  const l = Math.max(-1, Math.min(1, lateral / 5));
  return { px: -l * 0.006, py: 0, pz: 0, rx: 0, ry: 0, rz: l * 0.07 };
}

/** Familien für Ziehen/Sprint/Inspizieren (aus dem Waffentyp abgeleitet). */
export type AnimFamily = 'knife' | 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'mg' | 'grenade' | 'bomb';

/** Gesenkte Sprint-Haltung (weight 0..1). */
export function sprintPose(weight: number, family: AnimFamily): PoseDelta {
  const w = Math.max(0, Math.min(1, weight));
  if (family === 'pistol' || family === 'grenade' || family === 'bomb') {
    return { px: -0.01 * w, py: -0.045 * w, pz: 0.015 * w, rx: -0.55 * w, ry: 0.12 * w, rz: 0.15 * w };
  }
  if (family === 'knife') return { px: -0.005 * w, py: -0.03 * w, pz: 0.01 * w, rx: -0.3 * w, ry: 0.1 * w, rz: 0.25 * w };
  return { px: -0.02 * w, py: -0.035 * w, pz: 0.02 * w, rx: -0.3 * w, ry: 0.55 * w, rz: 0.38 * w };
}

/** Gedämpfte Feder (Position x, Geschwindigkeit v). */
export type Spring = { x: number; v: number };

/**
 * Feder-Schritt mit Teilschritten (stabil auch bei großen dt / niedriger Bildrate).
 * freq = Eigenfrequenz (rad/s), zeta = Dämpfungsgrad (1 = kritisch).
 */
export function springStep(s: Spring, target: number, freq: number, zeta: number, dt: number): Spring {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const acc = -freq * freq * (s.x - target) - 2 * zeta * freq * s.v;
    s.v += acc * h;
    s.x += s.v * h;
  }
  return s;
}

/** Feder-Konstanten des Rückstoßes (Rückweg z, Mündungshub rx, Rolle rz). */
export const KICK = { freq: 32, zeta: 0.5, back: 13, rise: 42, roll: 6, maxBack: 0.06, maxRise: 0.3 } as const;

/** Geschwindigkeits-Impulse für einen Rückstoß der Stärke amount (≈0.02 Pistole … 0.16 AWP). */
export function kickImpulse(amount: number, rnd = 0.5): { back: number; rise: number; roll: number } {
  const a = Math.max(0, amount);
  return { back: a * KICK.back, rise: a * KICK.rise, roll: (rnd - 0.5) * 2 * a * KICK.roll };
}

// ------------------------------------------------------------------ Haltung (Daten)

/** Gesamtskalierung der Viewmodel-Modelle (echte Meter → Kameraraum, CS-typisch verkleinert). */
export const VIEW_SCALE = 0.5;

/**
 * Ellbogen-Richtungspunkte relativ zur Waffenposition (Kameraraum, m): Unterarme zeigen vom
 * Handgelenk dorthin (liegen außerhalb des Bildes).
 */
export const ARM_HINT: Record<AnimFamily, { right: [number, number, number]; left: [number, number, number] }> = {
  knife: { right: [0.1, -0.2, 0.2], left: [-0.12, -0.2, 0.2] },
  pistol: { right: [0.12, -0.18, 0.2], left: [-0.14, -0.18, 0.2] },
  smg: { right: [0.1, -0.18, 0.2], left: [-0.17, -0.15, 0.2] },
  rifle: { right: [0.1, -0.18, 0.2], left: [-0.17, -0.15, 0.2] },
  sniper: { right: [0.1, -0.18, 0.2], left: [-0.17, -0.15, 0.2] },
  shotgun: { right: [0.1, -0.18, 0.2], left: [-0.17, -0.15, 0.2] },
  mg: { right: [0.1, -0.18, 0.2], left: [-0.18, -0.15, 0.2] },
  grenade: { right: [0.1, -0.2, 0.2], left: [-0.12, -0.2, 0.18] },
  bomb: { right: [0.12, -0.2, 0.18], left: [-0.12, -0.2, 0.18] },
};

// ------------------------------------------------------------------ Clip-Bibliothek

/** Womit wird manuell gespannt (Spur `charge` bzw. Kammer/Pumpe)? */
export type ChargeKind = 'slide' | 'charge' | 'bolt' | 'pump' | 'none';
/** Nachlade-Stil des Modells. */
export type ReloadStyle = 'mag' | 'pistol' | 'shell' | 'dual' | 'mg' | 'none';

type Tracks = Partial<Record<TrackName, Track>>;

/** Ziehen: Waffe kommt von unten rechts, je Familie mit eigenem Schwung (+ Spannen/Repetieren). */
export function drawClip(family: AnimFamily, charge: ChargeKind = 'none'): Clip {
  const root = (from: [number, number, number, number, number, number], settle = 0.62): Tracks => ({
    px: [[0, from[0]], [settle, 0, 'outCubic'], [1, 0]],
    py: [[0, from[1]], [settle, 0.004, 'outBack'], [settle + 0.12, 0], [1, 0]],
    pz: [[0, from[2]], [settle, 0, 'outCubic'], [1, 0]],
    rx: [[0, from[3]], [settle, 0.03, 'outCubic'], [settle + 0.15, 0], [1, 0]],
    ry: [[0, from[4]], [settle, 0, 'outCubic'], [1, 0]],
    rz: [[0, from[5]], [settle, -0.02, 'outCubic'], [settle + 0.15, 0], [1, 0]],
    lhY: [[0, -0.25], [settle * 0.8, 0, 'outCubic'], [1, 0]],
  });
  switch (family) {
    case 'knife': {
      const t = root([0.06, -0.16, 0.04, -1.1, -0.4, 0.9], 0.55);
      return { name: 'draw', duration: 0.62, tracks: { ...t, ry: [[0, -0.4], [0.3, 1.2, 'out'], [0.62, 0, 'inOut'], [1, 0]] } };
    }
    case 'pistol':
      return { name: 'draw', duration: 0.5, tracks: { ...root([0.03, -0.14, 0.03, -0.9, 0.2, 0.7], 0.7), slide: [[0, 0], [0.55, 0], [0.68, 0.35, 'out'], [0.8, 0, 'in']] } };
    case 'grenade':
      return { name: 'draw', duration: 0.5, tracks: root([0.04, -0.16, 0.02, -0.8, 0.1, 0.4], 0.7) };
    case 'bomb':
      return { name: 'draw', duration: 0.6, tracks: root([0.0, -0.18, 0.03, -0.7, 0, 0.3], 0.7) };
    default: {
      const long = family === 'sniper' || family === 'mg';
      const tr = root([0.05, -0.17, 0.05, -0.85, 0.45, 0.6], 0.5);
      const extra: Tracks = {};
      if (charge === 'charge' || charge === 'slide') {
        extra.lhCharge = [[0, 0], [0.5, 0], [0.62, 1], [0.84, 1], [0.95, 0]];
        extra.charge = [[0, 0], [0.64, 0], [0.72, 1, 'out'], [0.77, 0, 'in']];
        extra.rz = [[0, 0.6], [0.5, -0.02, 'outCubic'], [0.62, 0.12], [0.78, 0.1], [1, 0]];
        extra.py = [[0, -0.17], [0.5, 0.004, 'outBack'], [0.77, 0.004], [0.8, 0.012, 'out'], [1, 0]];
      } else if (charge === 'bolt') {
        extra.rhBolt = [[0, 0], [0.48, 0], [0.58, 1], [0.86, 1], [0.95, 0]];
        extra.bolt = [[0, 0], [0.58, 0], [0.63, 1], [0.8, 1], [0.84, 0]];
        extra.boltBack = [[0, 0], [0.63, 0], [0.7, 1, 'out'], [0.76, 0, 'in']];
        extra.rz = [[0, 0.6], [0.5, -0.02, 'outCubic'], [0.6, 0.14], [0.84, 0.12], [1, 0]];
      } else if (charge === 'pump') {
        extra.pump = [[0, 0], [0.55, 0], [0.66, 1, 'out'], [0.76, 0, 'inOut']];
        extra.rx = [[0, -0.85], [0.5, 0.03, 'outCubic'], [0.66, -0.05], [0.78, 0.02], [1, 0]];
      }
      return { name: 'draw', duration: long ? 0.95 : family === 'smg' ? 0.7 : 0.8, tracks: { ...tr, ...extra } };
    }
  }
}

/** Inspizieren (Taste F): Waffe drehen, Seite und Oberseite zeigen, zurück. */
export function inspectClip(family: AnimFamily): Clip {
  switch (family) {
    case 'knife':
      return {
        name: 'inspect', duration: 2.6, tracks: {
          px: [[0, 0], [0.15, -0.05], [0.5, -0.04], [0.62, -0.03], [0.9, -0.02], [1, 0]],
          py: [[0, 0], [0.15, 0.03], [0.5, 0.035], [0.62, 0.02], [0.9, 0.02], [1, 0]],
          rx: [[0, 0], [0.15, 0.25], [0.5, 0.3], [0.62, -0.1], [0.9, -0.1], [1, 0]],
          ry: [[0, 0], [0.15, 0.6], [0.5, 0.7], [0.62, -0.4], [0.9, -0.35], [1, 0]],
          rz: [[0, 0], [0.15, 1.3, 'outCubic'], [0.5, 1.4], [0.62, -1.1, 'inOutCubic'], [0.9, -1.0], [1, 0]],
        },
      };
    case 'pistol':
      return {
        name: 'inspect', duration: 2.3, tracks: {
          px: [[0, 0], [0.18, -0.04], [0.5, -0.04], [0.62, -0.03], [0.88, -0.03], [1, 0]],
          py: [[0, 0], [0.18, 0.03], [0.5, 0.032], [0.62, 0.025], [0.88, 0.025], [1, 0]],
          rx: [[0, 0], [0.18, 0.1], [0.5, 0.12], [0.62, 0.3], [0.88, 0.32], [1, 0]],
          ry: [[0, 0], [0.18, 0.9, 'outCubic'], [0.5, 1.0], [0.62, -0.5, 'inOutCubic'], [0.88, -0.45], [1, 0]],
          rz: [[0, 0], [0.18, 0.5], [0.5, 0.55], [0.62, -0.6], [0.88, -0.55], [1, 0]],
        },
      };
    case 'grenade':
    case 'bomb':
      return {
        name: 'inspect', duration: 1.8, tracks: {
          px: [[0, 0], [0.2, -0.03], [0.8, -0.03], [1, 0]],
          py: [[0, 0], [0.2, 0.03], [0.8, 0.03], [1, 0]],
          rx: [[0, 0], [0.2, 0.3], [0.5, 0.35], [0.6, 0.1], [0.85, 0.1], [1, 0]],
          ry: [[0, 0], [0.2, 0.8], [0.5, 0.85], [0.6, -0.5], [0.85, -0.5], [1, 0]],
          rz: [[0, 0], [0.2, 0.3], [0.85, 0.2], [1, 0]],
        },
      };
    default:
      return {
        name: 'inspect', duration: family === 'sniper' || family === 'mg' ? 3.0 : 2.7, tracks: {
          px: [[0, 0], [0.16, -0.045], [0.5, -0.05], [0.6, -0.02], [0.88, -0.02], [1, 0]],
          py: [[0, 0], [0.16, 0.035], [0.5, 0.04], [0.6, 0.02], [0.88, 0.022], [1, 0]],
          pz: [[0, 0], [0.16, 0.03], [0.5, 0.03], [0.6, 0.0], [1, 0]],
          rx: [[0, 0], [0.16, 0.12], [0.5, 0.15], [0.6, 0.32], [0.88, 0.34], [1, 0]],
          ry: [[0, 0], [0.16, 0.75, 'outCubic'], [0.5, 0.82], [0.6, 0.15, 'inOutCubic'], [0.88, 0.12], [1, 0]],
          rz: [[0, 0], [0.16, 0.45], [0.5, 0.5], [0.6, -0.75, 'inOutCubic'], [0.88, -0.7], [1, 0]],
        },
      };
  }
}

/** Schlitten-/Verschluss-Zyklus nach einem Schuss (additiv). */
export function cycleClip(track: 'slide' | 'slide2' | 'charge', interval: number): Clip {
  const d = Math.max(0.045, Math.min(0.11, interval * 0.85));
  return { name: 'cycle', duration: d, tracks: { [track]: [[0, 0], [0.3, 1, 'out'], [1, 0, 'inOut']] } };
}

/** Trockenschuss (leeres Magazin): kurzes Zucken des Abzugsfingers. */
export function dryFireClip(): Clip {
  return {
    name: 'dry', duration: 0.16, tracks: {
      pz: [[0, 0], [0.3, 0.004, 'out'], [1, 0]],
      rx: [[0, 0], [0.3, -0.012, 'out'], [1, 0]],
      rhZ: [[0, 0], [0.3, 0.004], [1, 0]],
    },
  };
}

/** Repetieren nach dem Schuss (AWP/Scout): Hand zum Kammerstängel, hoch, zurück, vor, runter. */
export function boltCycleClip(duration: number): Clip {
  return {
    name: 'bolt', duration: Math.max(0.3, duration), tracks: {
      rhBolt: [[0, 0], [0.12, 0], [0.3, 1], [0.8, 1], [0.95, 0]],
      bolt: [[0, 0], [0.3, 0], [0.38, 1, 'out'], [0.7, 1], [0.78, 0, 'in']],
      boltBack: [[0, 0], [0.38, 0], [0.5, 1, 'out'], [0.62, 0, 'in']],
      rz: [[0, 0], [0.25, 0.16], [0.8, 0.14], [1, 0]],
      rx: [[0, 0], [0.25, -0.05], [0.5, -0.03], [0.62, -0.06], [1, 0]],
      py: [[0, 0], [0.25, -0.012], [0.8, -0.01], [1, 0]],
      px: [[0, 0], [0.25, -0.012], [0.8, -0.01], [1, 0]],
    },
  };
}

/** Pumpen nach dem Schuss (M3): Vorderschaft zurück und vor, Waffe nickt. */
export function pumpClip(duration: number): Clip {
  return {
    name: 'pump', duration: Math.max(0.3, duration), tracks: {
      pump: [[0, 0], [0.18, 0], [0.42, 1, 'out'], [0.66, 0, 'inOut']],
      rx: [[0, 0], [0.18, 0.0], [0.42, -0.07], [0.66, 0.02], [1, 0]],
      pz: [[0, 0], [0.42, 0.012], [0.66, 0], [1, 0]],
      rz: [[0, 0], [0.42, 0.06], [1, 0]],
    },
  };
}

export type ReloadOpts = {
  /** Echte Nachladezeit (s). */
  duration: number;
  /** Magazin war leer (Schlitten gefangen / Spannen am Ende). */
  empty: boolean;
  charge: ChargeKind;
  /** Schrot: nachzuladende Patronen (≥ 1). */
  shells?: number;
};

/** Nachlade-Clip passend zum Stil (null = Waffe lädt nicht nach). */
export function reloadClip(style: ReloadStyle, o: ReloadOpts): Clip | null {
  switch (style) {
    case 'mag': return magReload(o);
    case 'pistol': return pistolReload(o);
    case 'shell': return shellReload(o);
    case 'dual': return dualReload(o);
    case 'mg': return mgReload(o);
    default: return null;
  }
}

/** Wurzel kippt nach links (Magazinschacht zur Kamera), am Ende Schlag beim Einsetzen. */
function tiltTracks(tilt: number, insertAt: number, endAt: number): Tracks {
  return {
    rz: [[0, 0], [0.12, tilt, 'out'], [insertAt - 0.02, tilt * 0.85], [insertAt + 0.02, tilt * 1.08, 'out'], [endAt, tilt * 0.55], [1, 0, 'inOut']],
    rx: [[0, 0], [0.12, 0.1, 'out'], [insertAt - 0.02, 0.06], [insertAt + 0.02, 0.13, 'out'], [insertAt + 0.08, 0.05], [1, 0]],
    py: [[0, 0], [0.12, 0.02], [insertAt - 0.02, 0.012], [insertAt + 0.02, 0.028, 'out'], [insertAt + 0.1, 0.012], [1, 0]],
    px: [[0, 0], [0.12, -0.025], [endAt, -0.02], [1, 0]],
  };
}

/** Gewehr/MP/Sniper: Magazin fällt, linke Hand holt ein neues, Schlag, ggf. spannen. */
function magReload(o: ReloadOpts): Clip {
  const ins = 0.6;
  const tr: Tracks = {
    ...tiltTracks(0.3, ins, 0.82),
    mag: [[0, 0], [0.14, 0], [0.3, 10, 'in'], [0.36, 10], [0.52, 1, 'outCubic'], [ins, 0, 'inCubic']],
    magRot: [[0, 0], [0.14, 0], [0.3, 0.9, 'in'], [0.33, 0.25, 'step'], [0.52, 0.05], [ins, 0]],
    lhY: [[0, 0], [0.1, 0], [0.28, -0.6, 'in'], [0.34, 0, 'step']],
    lhMag: [[0, 0], [0.335, 0], [0.34, 1, 'step']],
  };
  const lhMag = tr.lhMag as Key[];
  if (o.empty && o.charge === 'bolt') {
    lhMag.push([0.66, 1], [0.76, 0]);
    tr.rhBolt = [[0, 0], [0.64, 0], [0.7, 1], [0.9, 1], [0.96, 0]];
    tr.bolt = [[0, 0], [0.7, 0], [0.74, 1, 'out'], [0.85, 1], [0.88, 0, 'in']];
    tr.boltBack = [[0, 0], [0.74, 0], [0.79, 1, 'out'], [0.83, 0, 'in']];
  } else if (o.empty && (o.charge === 'charge' || o.charge === 'slide')) {
    lhMag.push([0.64, 1], [0.7, 0]);
    tr.lhCharge = [[0, 0], [0.64, 0], [0.71, 1], [0.86, 1], [0.95, 0]];
    tr.charge = [[0, 0], [0.73, 0], [0.79, 1, 'out'], [0.82, 0, 'in']];
  } else {
    lhMag.push([0.64, 1], [0.78, 0]);
  }
  return { name: 'reload', duration: o.duration, tracks: tr };
}

/** Pistole: Magazin fällt, neues rein, Schlitten schnellt vor (wenn leer). */
function pistolReload(o: ReloadOpts): Clip {
  const ins = 0.58;
  const tr: Tracks = {
    ...tiltTracks(0.22, ins, 0.8),
    mag: [[0, 0], [0.12, 0], [0.28, 10, 'in'], [0.34, 10], [0.5, 1, 'outCubic'], [ins, 0, 'inCubic']],
    magRot: [[0, 0], [0.12, 0], [0.28, 0.7, 'in'], [0.31, 0.2, 'step'], [0.5, 0.0]],
    lhY: [[0, 0], [0.08, 0], [0.26, -0.5, 'in'], [0.32, 0, 'step']],
    lhMag: [[0, 0], [0.315, 0], [0.32, 1, 'step'], [0.62, 1], [0.76, 0]],
  };
  if (o.empty) tr.slide = [[0, 1], [0.7, 1], [0.73, 0, 'in']];
  return { name: 'reload', duration: o.duration, tracks: tr };
}

/** Doppelpistole: beide Magazine fallen, Waffen nach unten, geladen zurück. */
function dualReload(o: ReloadOpts): Clip {
  const tr: Tracks = {
    mag: [[0, 0], [0.1, 0], [0.26, 10, 'in'], [0.5, 10], [0.52, 0, 'step']],
    mag2: [[0, 0], [0.12, 0], [0.28, 10, 'in'], [0.5, 10], [0.52, 0, 'step']],
    magRot: [[0, 0], [0.1, 0], [0.28, 0.8, 'in'], [0.52, 0, 'step']],
    py: [[0, 0], [0.1, 0.02], [0.3, 0.02], [0.42, -0.26, 'inCubic'], [0.6, -0.26], [0.78, 0.01, 'outCubic'], [0.86, 0], [1, 0]],
    rx: [[0, 0], [0.1, 0.25], [0.3, 0.3], [0.42, -0.6], [0.6, -0.6], [0.78, 0.05], [1, 0]],
    rz: [[0, 0], [0.1, 0.1], [0.3, 0.12], [0.6, 0], [1, 0]],
  };
  if (o.empty) {
    tr.slide = [[0, 1], [0.8, 1], [0.83, 0, 'in']];
    tr.slide2 = [[0, 1], [0.84, 1], [0.87, 0, 'in']];
  }
  return { name: 'reload', duration: o.duration, tracks: tr };
}

/** MG: Deckel auf, Kasten raus, neuer Kasten, Gurt, Deckel zu. */
function mgReload(o: ReloadOpts): Clip {
  const tr: Tracks = {
    ...tiltTracks(0.2, 0.62, 0.86),
    lhCharge: [[0, 0], [0.04, 0], [0.12, 1], [0.2, 1], [0.24, 0], [0.7, 0], [0.75, 1], [0.84, 1], [0.92, 0]],
    cover: [[0, 0], [0.12, 0], [0.2, 1, 'out'], [0.76, 1], [0.84, 0, 'in']],
    mag: [[0, 0], [0.24, 0], [0.38, 10, 'in'], [0.42, 10], [0.56, 1, 'outCubic'], [0.62, 0, 'inCubic']],
    magRot: [[0, 0], [0.24, 0], [0.38, 0.5, 'in'], [0.41, 0.15, 'step'], [0.56, 0]],
    lhY: [[0, 0], [0.22, 0], [0.36, -0.6, 'in'], [0.42, 0, 'step']],
    lhMag: [[0, 0], [0.415, 0], [0.42, 1, 'step'], [0.64, 1], [0.7, 0]],
  };
  if (o.empty) tr.charge = [[0, 0], [0.88, 0], [0.92, 1, 'out'], [0.95, 0, 'in']];
  return { name: 'reload', duration: o.duration, tracks: tr };
}

/** Schrotflinte: Schuss für Schuss in die Ladeöffnung, am Ende ggf. pumpen/spannen. */
function shellReload(o: ReloadOpts): Clip {
  const n = Math.max(1, Math.round(o.shells ?? 1));
  const start = 0.14;
  const finish = o.empty ? 0.74 : 0.86;
  const w = (finish - start) / n;
  const shell: Key[] = [[0, 0]];
  const lhY: Key[] = [[0, 0]];
  const lhZ: Key[] = [[0, 0]];
  for (let i = 0; i < n; i++) {
    const a = start + i * w;
    // Hand runter (Patrone greifen) → Patrone sichtbar → hoch zur Öffnung → hineindrücken → weg
    lhY.push([a + w * 0.05, 0], [a + w * 0.35, -0.16, 'in'], [a + w * 0.7, 0.0, 'out'], [a + w * 0.82, 0.018, 'out'], [a + w * 0.98, 0]);
    lhZ.push([a + w * 0.7, 0], [a + w * 0.82, -0.012], [a + w * 0.98, 0]);
    shell.push([a + w * 0.34, 0], [a + w * 0.36, 1, 'step'], [a + w * 0.82, 1], [a + w * 0.84, 0, 'step']);
  }
  const tr: Tracks = {
    rz: [[0, 0], [start, -0.45, 'out'], [finish, -0.42], [1, 0]],
    rx: [[0, 0], [start, 0.16, 'out'], [finish, 0.14], [1, 0]],
    py: [[0, 0], [start, 0.03], [finish, 0.028], [1, 0]],
    px: [[0, 0], [start, -0.02], [finish, -0.02], [1, 0]],
    lhPort: [[0, 0], [0.04, 0], [start, 1], [finish, 1], [Math.min(1, finish + 0.08), 0]],
    lhY, lhZ, shell,
  };
  if (o.empty && o.charge === 'pump') {
    tr.pump = [[0, 0], [finish + 0.06, 0], [finish + 0.14, 1, 'out'], [finish + 0.22, 0, 'inOut']];
  } else if (o.empty && o.charge === 'charge') {
    tr.lhCharge = [[0, 0], [finish + 0.02, 0], [finish + 0.08, 1], [finish + 0.2, 1], [Math.min(1, finish + 0.25), 0]];
    tr.charge = [[0, 0], [finish + 0.1, 0], [finish + 0.15, 1, 'out'], [finish + 0.18, 0, 'in']];
  }
  return { name: 'reload', duration: o.duration, tracks: tr };
}

/** Messer: leichter Hieb (zwei Varianten im Wechsel) oder schwerer Stich. */
export function knifeClip(heavy: boolean, variant = 0): Clip {
  if (heavy) {
    return {
      name: 'stab', duration: 0.95, tracks: {
        pz: [[0, 0], [0.28, 0.05, 'out'], [0.4, -0.15, 'outCubic'], [0.55, -0.14], [1, 0]],
        py: [[0, 0], [0.28, 0.02], [0.4, 0.035], [0.55, 0.03], [1, 0]],
        px: [[0, 0], [0.28, 0.01], [0.4, -0.06], [0.55, -0.055], [1, 0]],
        rx: [[0, 0], [0.28, 0.35, 'out'], [0.4, -0.15, 'outCubic'], [0.55, -0.12], [1, 0]],
        ry: [[0, 0], [0.28, -0.2], [0.4, 0.25], [0.55, 0.22], [1, 0]],
        rz: [[0, 0], [0.28, -0.3], [0.4, 0.2], [1, 0]],
      },
    };
  }
  const s = variant % 2 === 0 ? 1 : -1; // 1: rechts → links, -1: Rückhand links → rechts
  return {
    name: 'slash', duration: 0.42, tracks: {
      px: [[0, 0], [0.18, 0.05 * s, 'out'], [0.42, -0.15 * s, 'outCubic'], [1, 0]],
      py: [[0, 0], [0.18, 0.04], [0.42, -0.02, 'outCubic'], [1, 0]],
      pz: [[0, 0], [0.18, 0.02], [0.42, -0.05, 'outCubic'], [1, 0]],
      rx: [[0, 0], [0.18, 0.25], [0.42, -0.25, 'outCubic'], [1, 0]],
      ry: [[0, 0], [0.18, -0.5 * s], [0.42, 0.9 * s, 'outCubic'], [1, 0]],
      rz: [[0, 0], [0.18, -0.45 * s], [0.42, 0.75 * s, 'outCubic'], [1, 0]],
    },
  };
}

/** Granate: Splint ziehen und ausholen (bleibt in der Ausholhaltung stehen). */
export function pullPinClip(): Clip {
  return {
    name: 'pin', duration: 0.42, hold: true, tracks: {
      pin: [[0, 0], [0.25, 0], [0.7, 1, 'out'], [1, 1]],
      lhX: [[0, 0], [0.25, 0], [0.7, -0.03], [1, -0.05]],
      lhY: [[0, 0], [0.7, -0.02], [1, -0.12]],
      px: [[0, 0], [1, 0.015]],
      py: [[0, 0], [0.5, 0.01], [1, 0.045, 'out']],
      pz: [[0, 0], [0.5, 0.0], [1, 0.07, 'out']],
      rx: [[0, 0], [0.5, 0.1], [1, 0.45, 'out']],
      rz: [[0, 0], [1, -0.2, 'out']],
    },
  };
}

/** Granate: Wurf nach vorn, Löffel springt ab, Granate verlässt die Hand. */
export function throwClip(): Clip {
  return {
    name: 'throw', duration: 0.5, tracks: {
      pin: [[0, 1], [1, 1]],
      spoon: [[0, 0], [0.38, 0], [0.7, 1]],
      itemHide: [[0, 0], [0.42, 0], [0.44, 1, 'step'], [1, 1]],
      pz: [[0, 0.07], [0.35, -0.16, 'inCubic'], [0.5, -0.12], [1, 0.02]],
      py: [[0, 0.045], [0.35, 0.04], [0.6, -0.08], [1, -0.3, 'in']],
      rx: [[0, 0.45], [0.35, -0.55, 'inCubic'], [0.6, -0.7], [1, -0.9]],
      rz: [[0, -0.2], [0.35, 0.15], [1, 0.2]],
      lhY: [[0, -0.12], [1, -0.3]],
    },
  };
}

/** C4 legen: Waffe gesenkt und gekippt, rechte Hand tippt auf dem Tastenfeld (Schleife). */
export function plantClip(): Clip {
  const keysX = [0, 0.012, -0.01, 0.006, -0.004, 0.01];
  const rhX: Key[] = [];
  const rhY: Key[] = [];
  const n = keysX.length;
  for (let i = 0; i < n; i++) {
    const a = i / n;
    rhX.push([a, keysX[i]!], [a + 0.5 / n, keysX[i]!]);
    rhY.push([a, 0.012], [a + 0.35 / n, -0.004, 'in'], [a + 0.6 / n, 0.012, 'out']);
  }
  rhX.push([1, keysX[0]!]);
  rhY.push([1, 0.012]);
  return {
    name: 'plant', duration: 1.2, loop: true, tracks: {
      rhKey: [[0, 1], [1, 1]],
      rhX, rhY,
      py: [[0, -0.03], [1, -0.03]],
      pz: [[0, -0.01], [1, -0.01]],
      rx: [[0, 0.5], [0.5, 0.52], [1, 0.5]],
      px: [[0, -0.03], [1, -0.03]],
    },
  };
}

/** Rising-Edge-Zähler einer Spur (Schwelle 0.5) über `steps` Abtastungen — z. B. Patronen-Einschübe. */
export function countPulses(track: Track, steps = 2000): number {
  let n = 0;
  let prev = sampleTrack(track, 0) > 0.5;
  for (let i = 1; i <= steps; i++) {
    const on = sampleTrack(track, i / steps) > 0.5;
    if (on && !prev) n++;
    prev = on;
  }
  return n;
}

/** Waffentyp → Animationsfamilie (Typen decken sich; Hilfsfunktion für Lesbarkeit). */
export function familyOf(type: string): AnimFamily {
  const f = ['knife', 'pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'mg', 'grenade', 'bomb'] as const;
  return (f as readonly string[]).includes(type) ? (type as AnimFamily) : 'rifle';
}
