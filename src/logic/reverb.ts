/**
 * Nachhall je Raumcharakter (pure): Parameter-Tabelle und prozedural erzeugte
 * Impulsantworten (Stereo-Float-Arrays) für einen ConvolverNode.
 *
 * Aufbau einer Impulsantwort: Vorverzögerung → frühe Reflexionen (diskrete Echos,
 * draußen: Gebäude-Slapback) → diffuser Nachhall (Rauschen mit exponentiellem
 * Abfall auf −60 dB nach `decay`, über die Zeit zunehmend tiefpassgefiltert) →
 * optional Flatterecho (Tunnel: periodische Reflexionen zwischen parallelen Wänden).
 */
import type { RoomKind } from './acoustics';

export type ReverbSpec = {
  /** Nachhallzeit RT60 in s. */
  decay: number;
  /** Vorverzögerung bis zum diffusen Teil (s). */
  preDelay: number;
  /** Frühe Reflexionen: [Verzögerung s, Pegel]. */
  early: readonly (readonly [number, number])[];
  /** Grenzfrequenz am Anfang des Nachhalls (Hz). */
  brightness: number;
  /** Grenzfrequenz am Ende des Nachhalls (Hz): je kleiner, desto dumpfer. */
  damping: number;
  /** Pegel des diffusen Nachhalls relativ zu den frühen Reflexionen. */
  diffuse: number;
  /** Flatterecho (Periode s, Pegel). */
  flutter?: { period: number; gain: number };
  /** Hall-Anteil (Send) für Quellen in diesem Raum. */
  wet: number;
};

export const REVERB: Readonly<Record<RoomKind, ReverbSpec>> = {
  // Draußen: kaum Nachhall, aber deutliche Gebäude-Echos (Slapback)
  outdoor: { decay: 0.5, preDelay: 0.01, early: [[0.07, 0.35], [0.16, 0.28], [0.29, 0.2], [0.47, 0.12]], brightness: 6000, damping: 1500, diffuse: 0.25, wet: 0.35 },
  // Große Lagerhalle: lang, hell am Anfang, viele Reflexionen
  hall: { decay: 2.6, preDelay: 0.03, early: [[0.021, 0.5], [0.037, 0.4], [0.055, 0.35], [0.083, 0.3], [0.12, 0.22]], brightness: 9000, damping: 2200, diffuse: 0.8, wet: 0.55 },
  // Kleiner Raum (Büro/Lager-Kammer): kurz, dicht
  room: { decay: 0.55, preDelay: 0.005, early: [[0.006, 0.6], [0.011, 0.45], [0.017, 0.35], [0.024, 0.25]], brightness: 7000, damping: 2500, diffuse: 0.7, wet: 0.4 },
  // Tunnel/Gang: metallisches Flatterecho
  tunnel: { decay: 1.8, preDelay: 0.012, early: [[0.018, 0.5], [0.036, 0.4]], brightness: 7500, damping: 1800, diffuse: 0.6, flutter: { period: 0.034, gain: 0.45 }, wet: 0.6 },
  // Kühlraum: gedämpft (Isolierpaneele, Ware)
  cold: { decay: 0.8, preDelay: 0.008, early: [[0.01, 0.35], [0.02, 0.25]], brightness: 3500, damping: 1200, diffuse: 0.5, wet: 0.3 },
};

/** Länge der Impulsantwort in Samples (Vorverzögerung + RT60, gedeckelt). */
export function impulseLength(spec: ReverbSpec, sampleRate: number, maxSeconds = 4): number {
  return Math.max(1, Math.round(Math.min(maxSeconds, spec.preDelay + spec.decay) * sampleRate));
}

/**
 * Erzeugt eine Stereo-Impulsantwort. `rnd` liefert Zufall 0..1 (deterministisch
 * testbar); `maxSeconds` kürzt lange Hallfahnen (niedrige Grafikstufe).
 */
export function buildImpulse(spec: ReverbSpec, sampleRate: number, rnd: () => number, maxSeconds = 4): [Float32Array, Float32Array] {
  const n = impulseLength(spec, sampleRate, maxSeconds);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const pre = Math.round(spec.preDelay * sampleRate);
  const k60 = Math.log(1000) / Math.max(0.05, spec.decay); // e^-k·t = −60 dB bei t = decay
  for (let ch = 0; ch < 2; ch++) {
    const d = out[ch]!;
    // Frühe Reflexionen (leicht unterschiedlich je Kanal für Breite)
    for (const [t, g] of spec.early) {
      const i = Math.round((t + (ch ? 0.0013 : 0)) * sampleRate);
      if (i < n) d[i] += g * (rnd() < 0.5 ? -1 : 1);
    }
    // Diffuser Teil mit zeitabhängigem Tiefpass (Einpol-Filter)
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sampleRate;
      const cutoff = spec.damping + (spec.brightness - spec.damping) * Math.exp(-t / (spec.decay * 0.35));
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      lp += a * ((rnd() * 2 - 1) - lp);
      const fadeIn = Math.min(1, (i - pre) / (0.004 * sampleRate));
      d[i] += lp * spec.diffuse * Math.exp(-k60 * t) * fadeIn;
    }
    // Flatterecho
    if (spec.flutter) {
      const step = Math.round(spec.flutter.period * sampleRate);
      for (let i = pre + step, k = 1; i < n; i += step, k++) {
        const t = (i - pre) / sampleRate;
        d[i] += spec.flutter.gain * Math.exp(-k60 * t) * (k % 2 ? 1 : -1);
      }
    }
  }
  // Auf Spitzenwert 1 normieren (der Send-Pegel regelt die Lautstärke)
  let peak = 0;
  for (const d of out) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]!));
  if (peak > 0) for (const d of out) for (let i = 0; i < n; i++) d[i] /= peak;
  return out;
}
