/**
 * Menü-Klänge (WebAudio, synthetisiert, keine Assets): kurzes Tick beim Überfahren,
 * metallischer Klick beim Bestätigen, tieferer Ton für „Zurück“, Startsignal.
 * Startet erst nach einer Nutzergeste (Autoplay-Regeln).
 */
export type UiSoundName = 'hover' | 'click' | 'back' | 'start' | 'error';

export class UiSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private lastHover = 0;
  volume = 0.7;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume * 0.35;
      this.out.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.out) this.out.gain.value = v * 0.35;
  }

  play(name: UiSoundName): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || ctx.state !== 'running' || this.volume <= 0) return;
    const t = ctx.currentTime;
    if (name === 'hover') {
      if (t - this.lastHover < 0.04) return;
      this.lastHover = t;
      this.tone(2400, 1800, 0.035, 0.18, 'square', t);
    } else if (name === 'click') {
      this.tone(1300, 900, 0.05, 0.35, 'square', t);
      this.tone(2600, 2000, 0.04, 0.18, 'triangle', t + 0.03);
      this.noise(0.03, 0.25, 4000, t);
    } else if (name === 'back') {
      this.tone(700, 420, 0.08, 0.3, 'triangle', t);
    } else if (name === 'start') {
      this.tone(220, 880, 0.35, 0.3, 'sawtooth', t);
      this.noise(0.4, 0.2, 1200, t);
    } else if (name === 'error') {
      this.tone(180, 140, 0.16, 0.35, 'square', t);
      this.tone(180, 140, 0.16, 0.35, 'square', t + 0.2);
    }
  }

  private tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType, at: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(lp).connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq: number, at: number): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.out!);
    src.start(at);
  }
}

/** Gemeinsame Instanz für Menü und Lobby. */
export const uiSound = new UiSound();
