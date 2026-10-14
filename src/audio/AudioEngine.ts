/**
 * WebAudio-Kern: Kontext, Kanäle (Effekte/Ambience/Oberfläche → Master → Limiter),
 * Sample-Lader mit Cache (lazy, Ogg Vorbis oder AAC je nach Browser), 3D-Stimmen
 * (PannerNode HRTF/equalpower + eigene Abstandskurve + Luft-Tiefpass + Verdeckung),
 * Raumhall (zwei ConvolverNodes, überblendet beim Raumwechsel) und Tinnitus-Dämpfung.
 *
 * Mischentscheidungen kommen aus `src/logic/audioMix.ts`, Daten aus `src/logic/soundBank.ts`,
 * Hall-Impulsantworten aus `src/logic/reverb.ts`.
 */
import { SAMPLES, sampleFiles, type AudioBus, type SampleDef } from '../logic/soundBank';
import {
  OCCLUSION, airLowpass, busGains, dist, distanceGain, pickVariant, randomPitch, reverbSend, type BusGains, type V3,
} from '../logic/audioMix';
import { REVERB, buildImpulse } from '../logic/reverb';
import type { RoomKind } from '../logic/acoustics';
import { mulberry32 } from '../logic/demo';

export type PlayOpts = {
  /** Weltposition (null/fehlend = am Hörer, nicht positioniert). */
  pos?: V3 | null;
  /** Zusätzliche Lautstärke (linear). */
  gain?: number;
  /** Feste Abspielrate statt Zufall. */
  rate?: number;
  /** Feste Variante (0-basiert). */
  variant?: number;
  /** Start-Verzögerung in s. */
  delay?: number;
  /** Abstand überschreiben (Altschnittstelle ohne Position). */
  dist?: number;
  /** Hall-Anteil überschreiben. */
  reverb?: number;
  /** Verdeckung prüfen (Standard: ja bei positionierten Effekten). */
  occlude?: boolean;
};

export type Voice = {
  key: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode | null;
  panner: PannerNode | null;
  send: GainNode | null;
  started: number;
  level: number;
  ended: boolean;
};

export type AudioStats = {
  state: string;
  loaded: number;
  failed: number;
  pending: number;
  voices: number;
  room: RoomKind;
  format: string;
  quality: 'high' | 'low';
  /** Gespielte Stimmen je Gruppe (Präfix vor dem ersten Punkt, z. B. fire, step, impact). */
  played: Record<string, number>;
};

const MAX_VOICES = 48;
const FAR_SILENT = 0.002;

type BufferEntry = { buf: AudioBuffer | null; promise: Promise<AudioBuffer | null> | null; failed: boolean };

export class AudioEngine {
  ctx: AudioContext | null = null;
  quality: 'high' | 'low';
  readonly listener: V3 = { x: 0, y: 1.6, z: 0 };
  /** Raum am Hörerort (steuert Hall). */
  room: RoomKind = 'outdoor';
  /** Sichtlinien-Test für Verdeckung (z. B. Welt-Raycast); fehlt → nie verdeckt. */
  occluded: ((from: V3, to: V3) => boolean) | null = null;

  private master: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private duck: GainNode | null = null;
  private readonly buses = new Map<AudioBus, GainNode>();
  private gains: BusGains = { master: 0.6, effects: 1, ambience: 0.5, ui: 0.6 };
  private readonly buffers = new Map<string, BufferEntry>();
  private readonly voices = new Set<Voice>();
  private readonly lastVariant = new Map<string, number>();
  private readonly rnd = mulberry32(0x5eed);
  private ext: 'ogg' | 'm4a' = 'ogg';
  private reverbIn: GainNode | null = null;
  private convs: { conv: ConvolverNode; out: GainNode; room: RoomKind | null }[] = [];
  private activeConv = 0;
  private readonly irCache = new Map<RoomKind, AudioBuffer>();
  private readonly played: Record<string, number> = {};
  private loadQueue: string[] = [];
  private loading = 0;

  constructor(quality: 'high' | 'low' = 'high') {
    this.quality = quality;
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Nach Nutzergeste: Kontext anlegen bzw. fortsetzen, Grund-Samples vorladen. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.ext = pickFormat();
      // Master-Kette: Kanäle → [Tinnitus-Tiefpass + Ducking] → Master → Limiter → Ausgang
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.2;
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(limiter);
      this.duck = ctx.createGain();
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 22000;
      this.muffle.Q.value = 0.5;
      this.muffle.connect(this.duck).connect(this.master);
      for (const bus of ['effects', 'ambience', 'ui'] as AudioBus[]) {
        const g = ctx.createGain();
        g.connect(bus === 'ui' ? this.master : this.muffle);
        this.buses.set(bus, g);
      }
      // Hall: Send-Eingang → zwei Faltungen (A/B für weiche Raumwechsel) → Effekt-Kanal
      this.reverbIn = ctx.createGain();
      for (let i = 0; i < 2; i++) {
        const conv = ctx.createConvolver();
        conv.normalize = true;
        const out = ctx.createGain();
        out.gain.value = 0;
        this.reverbIn.connect(conv).connect(out).connect(this.buses.get('effects')!);
        this.convs.push({ conv, out, room: null });
      }
      this.applyGains();
      this.setRoom(this.room, true);
      // Alle nicht-lazy Samples im Hintergrund laden
      for (const [key, def] of Object.entries(SAMPLES)) if (!def.lazy) this.request(key);
    } catch {
      this.ctx = null;
    }
  }

  // ------------------------------------------------------------------ Lautstärke

  setVolumes(g: { volume: number; volumeEffects: number; volumeAmbience: number; volumeUi: number }): void {
    this.gains = busGains(g);
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.gains.master, t, 0.03);
    this.buses.get('effects')?.gain.setTargetAtTime(this.gains.effects, t, 0.03);
    this.buses.get('ambience')?.gain.setTargetAtTime(this.gains.ambience, t, 0.03);
    this.buses.get('ui')?.gain.setTargetAtTime(this.gains.ui, t, 0.03);
  }

  /** Tinnitus/Betäubung: Effekte+Ambience dumpf und leiser, erholt sich über `duration` s. */
  muffleFor(cutoff: number, duck: number, duration: number): void {
    if (!this.ctx || !this.muffle || !this.duck) return;
    const t = this.ctx.currentTime;
    const f = this.muffle.frequency;
    const g = this.duck.gain;
    f.cancelScheduledValues(t);
    g.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(200, cutoff), t);
    g.setValueAtTime(Math.max(0.05, duck), t);
    // Erst halten, dann exponentiell zurück
    f.setTargetAtTime(22000, t + duration * 0.4, duration * 0.25);
    g.setTargetAtTime(1, t + duration * 0.4, duration * 0.25);
  }

  // ------------------------------------------------------------------ Hörer & Raum

  setListener(pos: V3, fwd: V3, up: V3 = { x: 0, y: 1, z: 0 }): void {
    this.listener.x = pos.x;
    this.listener.y = pos.y;
    this.listener.z = pos.z;
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x;
      l.forwardY.value = fwd.y;
      l.forwardZ.value = fwd.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  /** Hall auf den Raum am Hörerort umstellen (weiche Überblendung). */
  setRoom(room: RoomKind, immediate = false): void {
    if (!this.ctx || this.convs.length < 2) {
      this.room = room;
      return;
    }
    if (room === this.room && this.convs[this.activeConv]!.room === room) return;
    this.room = room;
    const next = this.convs[this.activeConv]!.room === null ? this.activeConv : 1 - this.activeConv;
    const cur = this.convs[1 - next]!;
    const slot = this.convs[next]!;
    if (slot.room !== room) {
      slot.conv.buffer = this.impulse(room);
      slot.room = room;
    }
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.01 : 0.4;
    slot.out.gain.setTargetAtTime(1, t, tc);
    if (cur !== slot) cur.out.gain.setTargetAtTime(0, t, tc);
    this.activeConv = next;
  }

  private impulse(room: RoomKind): AudioBuffer {
    let b = this.irCache.get(room);
    if (b) return b;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const [l, r] = buildImpulse(REVERB[room], sr, mulberry32(room.length * 977 + 13), this.quality === 'low' ? 1.2 : 3.5);
    b = ctx.createBuffer(2, l.length, sr);
    b.getChannelData(0).set(l);
    b.getChannelData(1).set(r);
    this.irCache.set(room, b);
    return b;
  }

  // ------------------------------------------------------------------ Laden

  /** Sample (alle Varianten) laden lassen; liefert true, wenn bereits fertig. */
  request(key: string): boolean {
    const def = SAMPLES[key];
    if (!def || !this.ctx) return false;
    let ready = true;
    for (const f of sampleFiles(def)) {
      const e = this.buffers.get(f);
      if (e?.buf) continue;
      ready = false;
      if (!e) {
        this.buffers.set(f, { buf: null, promise: null, failed: false });
        this.loadQueue.push(f);
      }
    }
    this.pump();
    return ready;
  }

  private pump(): void {
    while (this.loading < 6 && this.loadQueue.length) {
      const f = this.loadQueue.shift()!;
      const entry = this.buffers.get(f)!;
      this.loading += 1;
      entry.promise = this.fetchDecode(f)
        .then((buf) => {
          entry.buf = buf;
          entry.failed = !buf;
          return buf;
        })
        .finally(() => {
          this.loading -= 1;
          this.pump();
        });
    }
  }

  private async fetchDecode(file: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const url = new URL(`assets/audio/${file}.${this.ext}`, document.baseURI).href;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      return await new Promise<AudioBuffer | null>((resolve) => {
        // Callback-Form: funktioniert auch in älterem Safari
        const p = ctx.decodeAudioData(data, (b) => resolve(b), () => resolve(null));
        if (p && typeof (p as Promise<AudioBuffer>).catch === 'function') (p as Promise<AudioBuffer>).catch(() => resolve(null));
      });
    } catch {
      return null;
    }
  }

  private buffer(def: SampleDef, variant: number): AudioBuffer | null {
    const files = sampleFiles(def);
    return this.buffers.get(files[Math.min(variant, files.length - 1)]!)?.buf ?? null;
  }

  // ------------------------------------------------------------------ Abspielen

  /**
   * Spielt ein Sample. Liefert die Stimme oder null (nicht geladen, unhörbar,
   * Kontext gesperrt) — der Aufrufer kann dann die Synthese als Ersatz nehmen.
   */
  play(key: string, opts: PlayOpts = {}): Voice | null {
    const def = SAMPLES[key];
    const ctx = this.ctx;
    if (!def || !ctx || ctx.state !== 'running') return null;
    if (!this.request(key)) {
      // Teilweise geladen? Dann eine geladene Variante nehmen
      const any = sampleFiles(def).findIndex((f) => !!this.buffers.get(f)?.buf);
      if (any < 0) return null;
      opts = { ...opts, variant: any };
    }
    const variant = opts.variant ?? pickVariant(def.variants, this.lastVariant.get(key) ?? -1, this.rnd);
    this.lastVariant.set(key, variant);
    const buf = this.buffer(def, variant);
    if (!buf) return null;

    const pos = opts.pos ?? null;
    const d = pos ? dist(pos, this.listener) : opts.dist ?? 0;
    // Nur Effekte werden hier nach Abstand gedämpft; Ambience regelt ihre Pegel selbst (emitterGain)
    const spatial = def.bus === 'effects';
    let level = def.gain * (opts.gain ?? 1) * (spatial ? distanceGain(d, def.ref, def.maxDist) : 1);
    let cutoff = spatial ? airLowpass(d) : def.loop ? 22000 : 0;
    if (pos && def.bus === 'effects' && (opts.occlude ?? true) && d > 2.5 && this.occluded) {
      try {
        if (this.occluded(this.listener, pos)) {
          level *= OCCLUSION.gain;
          cutoff = Math.min(cutoff, OCCLUSION.cutoff);
        }
      } catch { /* Raycast-Fehler → unverdeckt */ }
    }
    if (level < FAR_SILENT) return null;
    this.limitVoices(key, def);

    const t = ctx.currentTime + Math.max(0, opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? randomPitch(def.pitch, this.rnd);
    src.loop = !!def.loop;
    const gain = ctx.createGain();
    gain.gain.value = level;
    let node: AudioNode = src;
    let filter: BiquadFilterNode | null = null;
    if (cutoff > 0 && (cutoff < 20000 || def.loop)) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = 0.4;
      node = node.connect(filter);
    }
    node.connect(gain);
    let panner: PannerNode | null = null;
    if (pos) {
      panner = this.createPanner(pos);
      gain.connect(panner).connect(this.buses.get(def.bus)!);
    } else gain.connect(this.buses.get(def.bus)!);
    let send: GainNode | null = null;
    const wet = def.bus === 'effects' && this.reverbIn ? reverbSend(d, REVERB[this.room].wet, opts.reverb ?? def.reverb) : 0;
    if (wet > 0.01) {
      send = ctx.createGain();
      send.gain.value = wet;
      (panner ?? gain).connect(send).connect(this.reverbIn!);
    }
    const voice: Voice = { key, src, gain, filter, panner, send, started: t, level, ended: false };
    src.onended = () => this.release(voice);
    src.start(t);
    this.voices.add(voice);
    const group = key.split('.')[0]!;
    this.played[group] = (this.played[group] ?? 0) + 1;
    return voice;
  }

  createPanner(pos: V3): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = this.quality === 'high' ? 'HRTF' : 'equalpower';
    p.distanceModel = 'linear';
    p.rolloffFactor = 0; // Abstandsdämpfung macht distanceGain()
    p.refDistance = 1;
    p.maxDistance = 10000;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  /** Stimme ausblenden und stoppen. */
  stop(v: Voice, fade = 0.05): void {
    if (v.ended || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, Math.max(0.005, fade / 3));
    try {
      v.src.stop(t + fade + 0.02);
    } catch { /* schon gestoppt */ }
  }

  private release(v: Voice): void {
    if (v.ended) return;
    v.ended = true;
    this.voices.delete(v);
    try {
      v.src.disconnect();
      v.gain.disconnect();
      v.filter?.disconnect();
      v.panner?.disconnect();
      v.send?.disconnect();
    } catch { /* egal */ }
  }

  private limitVoices(key: string, def: SampleDef): void {
    if (def.maxVoices) {
      const same = [...this.voices].filter((v) => v.key === key && !v.ended && !SAMPLES[v.key]?.loop);
      if (same.length >= def.maxVoices) this.stop(same.sort((a, b) => a.started - b.started)[0]!, 0.02);
    }
    if (this.voices.size >= MAX_VOICES) {
      // Leiseste Einmal-Stimme opfern (Schleifen bleiben)
      const victims = [...this.voices].filter((v) => !SAMPLES[v.key]?.loop && !v.ended).sort((a, b) => a.level - b.level);
      if (victims[0]) this.stop(victims[0], 0.02);
    }
  }

  /** Kanal-Knoten (für die Synthese-Ersatzklänge). */
  busNode(bus: AudioBus): GainNode | null {
    return this.buses.get(bus) ?? null;
  }

  stats(): AudioStats {
    let loaded = 0;
    let failed = 0;
    let pending = 0;
    for (const e of this.buffers.values()) {
      if (e.buf) loaded += 1;
      else if (e.failed) failed += 1;
      else pending += 1;
    }
    return {
      state: this.ctx?.state ?? 'none', loaded, failed, pending, voices: this.voices.size, room: this.room, format: this.ext, quality: this.quality,
      played: { ...this.played },
    };
  }

  /** Aktive Stimmen eines Schlüssels (Debug/Tests). */
  activeKeys(): string[] {
    return [...this.voices].map((v) => v.key);
  }
}

/** Ogg Vorbis, wo möglich (Chromium/Firefox), sonst AAC/M4A (Safari). */
function pickFormat(): 'ogg' | 'm4a' {
  try {
    const a = document.createElement('audio');
    if (a.canPlayType('audio/ogg; codecs="vorbis"')) return 'ogg';
    if (a.canPlayType('audio/mp4; codecs="mp4a.40.2"')) return 'm4a';
  } catch { /* kein DOM */ }
  return 'ogg';
}
