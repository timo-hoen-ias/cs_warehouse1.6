/**
 * Synthetische Ersatzklänge (reines WebAudio, keine Dateien) — die frühere Sfx-Synthese.
 * Springt ein, solange ein Sample noch lädt oder nicht geladen werden konnte.
 */
import type { WeaponType } from '../logic/weapons';

export type SynthName = 'hit' | 'hurt' | 'kill' | 'headshot' | 'death' | 'reload' | 'empty' | 'throw' | 'boom' | 'flash' | 'smoke'
  | 'planted' | 'defused' | 'roundStart' | 'win' | 'lose' | 'buy' | 'beep' | 'switch' | 'plantTick';

export class SynthFallback {
  private noise: AudioBuffer | null = null;

  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode) {
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Schuss je Waffentyp, `gain` bereits nach Entfernung. */
  shot(type: WeaponType, gain: number): void {
    switch (type) {
      case 'pistol': this.bang(0.08, 900, 140, 0.5 * gain, 0.01); break;
      case 'smg': this.bang(0.07, 1100, 180, 0.45 * gain, 0.008); break;
      case 'rifle': this.bang(0.12, 700, 110, 0.7 * gain, 0.012); break;
      case 'mg': this.bang(0.12, 600, 100, 0.7 * gain, 0.012); break;
      case 'shotgun': this.bang(0.22, 400, 70, 0.9 * gain, 0.02); break;
      case 'sniper': this.bang(0.3, 500, 60, 1.0 * gain, 0.02); break;
      case 'knife': this.click(0.03, 900, 0.15 * gain); break;
      default: this.bang(0.08, 800, 120, 0.5 * gain, 0.01);
    }
  }

  step(gain: number): void {
    if (gain < 0.01) return;
    this.burst(0.05, 180 + Math.random() * 120, gain);
    this.tone('sine', 90 + Math.random() * 30, 0.06, gain * 0.6);
  }

  beep(gain: number): void {
    this.tone('square', 2600, 0.06, gain);
  }

  play(name: SynthName, strength = 1): void {
    const s = Math.max(0, Math.min(1, strength));
    switch (name) {
      case 'hit': this.tone('square', 1800, 0.04, 0.18); break;
      case 'hurt': this.tone('sawtooth', 160, 0.12, 0.3); this.burst(0.08, 300, 0.2); break;
      case 'kill': this.tone('square', 2200, 0.05, 0.22); this.tone('square', 2900, 0.06, 0.18, 0.06); break;
      case 'headshot': this.tone('square', 2600, 0.05, 0.25); this.tone('square', 3400, 0.05, 0.22, 0.05); this.tone('sine', 4200, 0.12, 0.2, 0.1); this.burst(0.08, 3000, 0.2); break;
      case 'death': this.sweep('sawtooth', 300, 60, 0.6, 0.35); break;
      case 'reload': this.click(0.05, 1200, 0.25); this.click(0.05, 800, 0.25, 0.25); this.click(0.04, 1500, 0.2, 0.55); break;
      case 'empty': this.click(0.03, 2500, 0.25); break;
      case 'throw': this.burst(0.06, 2000, 0.12); break;
      case 'boom': this.bang(0.6, 200, 30, 1.0 * s, 0.03); break;
      case 'flash': this.tone('sine', 3200, 0.9 + s, 0.3 * s + 0.05); this.burst(0.15, 4000, 0.4 * s); break;
      case 'smoke': this.burst(0.5, 500, 0.2); break;
      case 'planted': this.tone('square', 880, 0.12, 0.3); this.tone('square', 1320, 0.12, 0.3, 0.14); break;
      case 'defused': this.tone('sine', 1320, 0.15, 0.3); this.tone('sine', 1760, 0.2, 0.3, 0.16); break;
      case 'roundStart': this.tone('triangle', 660, 0.1, 0.25); this.tone('triangle', 880, 0.14, 0.25, 0.12); break;
      case 'win': this.tone('triangle', 523, 0.12, 0.3); this.tone('triangle', 659, 0.12, 0.3, 0.13); this.tone('triangle', 784, 0.25, 0.3, 0.26); break;
      case 'lose': this.tone('triangle', 392, 0.14, 0.3); this.tone('triangle', 330, 0.3, 0.3, 0.16); break;
      case 'buy': this.click(0.04, 1800, 0.2); this.click(0.04, 2400, 0.2, 0.06); break;
      case 'beep': this.tone('square', 2000, 0.05, 0.2); break;
      case 'plantTick': this.click(0.02, 3000, 0.1); break;
      case 'switch': this.click(0.03, 900, 0.15); break;
    }
  }

  // --- Synthese-Bausteine ---

  private bang(len: number, fStart: number, fEnd: number, gain: number, attack: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fStart * 4, t);
    filter.frequency.exponentialRampToValueAtTime(fEnd, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + len + 0.05);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fStart * 0.25, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, fEnd * 0.4), t + len);
    const og = ctx.createGain();
    og.gain.setValueAtTime(Math.max(0.0002, gain * 0.8), t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.8);
    osc.connect(og).connect(this.out);
    osc.start(t);
    osc.stop(t + len);
  }

  private tone(type: OscillatorType, freq: number, len: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  private sweep(type: OscillatorType, f0: number, f1: number, len: number, gain: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + len);
  }

  private burst(len: number, cutoff: number, gain: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  private click(len: number, freq: number, gain: number, delay = 0): void {
    this.tone('square', freq, len, gain, delay);
  }
}
