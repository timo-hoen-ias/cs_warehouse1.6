/**
 * Synthetisierte Spiel-Sounds (WebAudio, keine Assets): Schüsse je Waffentyp,
 * Treffer, Kill, Nachladen, Granaten, Bombe, Rundenjingle. Lautstärke nach
 * Entfernung. Startet erst nach der ersten Nutzergeste (Browser-Policy).
 */
import { WEAPONS } from '../logic/weapons';

export type SfxName = 'hit' | 'hurt' | 'kill' | 'death' | 'reload' | 'empty' | 'throw' | 'boom' | 'flash' | 'smoke'
  | 'planted' | 'defused' | 'roundStart' | 'win' | 'lose' | 'buy' | 'beep' | 'switch' | 'plantTick';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.7;

  /** Nach Nutzergeste aufrufen. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private get ok(): boolean {
    return !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  /** Schuss einer Waffe in `dist` Metern Entfernung (0 = eigener). */
  shot(weaponId: string, dist = 0): void {
    if (!this.ok) return;
    const def = WEAPONS[weaponId];
    if (!def || def.mode !== 'hit') {
      if (def?.mode === 'melee') this.play('switch', 0.4);
      return;
    }
    const gain = Math.max(0.05, 1 - dist / 70);
    switch (def.type) {
      case 'pistol': this.bang(0.08, 900, 140, 0.5 * gain, 0.01); break;
      case 'smg': this.bang(0.07, 1100, 180, 0.45 * gain, 0.008); break;
      case 'rifle': this.bang(0.12, 700, 110, 0.7 * gain, 0.012); break;
      case 'mg': this.bang(0.12, 600, 100, 0.7 * gain, 0.012); break;
      case 'shotgun': this.bang(0.22, 400, 70, 0.9 * gain, 0.02); break;
      case 'sniper': this.bang(0.3, 500, 60, 1.0 * gain, 0.02); break;
      default: this.bang(0.08, 800, 120, 0.5 * gain, 0.01);
    }
  }

  play(name: SfxName, strength = 1): void {
    if (!this.ok) return;
    const s = Math.max(0, Math.min(1, strength));
    switch (name) {
      case 'hit': this.tone('square', 1800, 0.04, 0.18); break;
      case 'hurt': this.tone('sawtooth', 160, 0.12, 0.3); this.burst(0.08, 300, 0.2); break;
      case 'kill': this.tone('square', 2200, 0.05, 0.22); this.tone('square', 2900, 0.06, 0.18, 0.06); break;
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
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // Knall: Rauschen mit Tiefpass + tiefer Sinus-Punch
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fStart * 4, t);
    filter.frequency.exponentialRampToValueAtTime(fEnd, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + len + 0.05);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fStart * 0.25, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, fEnd * 0.4), t + len);
    const og = ctx.createGain();
    og.gain.setValueAtTime(gain * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.8);
    osc.connect(og).connect(this.master!);
    osc.start(t);
    osc.stop(t + len);
  }

  private tone(type: OscillatorType, freq: number, len: number, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  private sweep(type: OscillatorType, f0: number, f1: number, len: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + len);
  }

  private burst(len: number, cutoff: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  private click(len: number, freq: number, gain: number, delay = 0): void {
    this.tone('square', freq, len, gain, delay);
  }
}
