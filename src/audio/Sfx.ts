/**
 * Spiel-Audio (Fassade): echte, bearbeitete Aufnahmen aus `assets/audio/` mit
 * 3D-Positionierung, Raumhall, Verdeckung, Ambience und Tinnitus — fällt
 * automatisch auf die WebAudio-Synthese zurück, solange Samples laden oder fehlen.
 * Startet erst nach der ersten Nutzergeste (Browser-Policy).
 *
 * Schnittstelle für Karte/Bots/Driver (alle Aufrufe sind gefahrlos, auch ohne Audio):
 *  - `setAcoustics(zones, emitters)`  Raumzonen + Ambient-Quellen der Karte
 *  - `setOcclusion(fn)` / `setSurfaceLookup(fn)`  Welt-Raycast / Oberfläche am Punkt
 *  - `tick(dt, pos, fwd)`  Hörer = Kamera, pro Frame
 *  - `shot(w, pos|dist)`, `bullet(o, ends, walls)`, `footstep(surface, pos|null, speed)`,
 *    `jump/land`, `explosion(kind, pos)`, `flashed(s)`, `c4(...)`, `beep(pos)`, `ui(name)` …
 */
import { WEAPONS } from '../logic/weapons';
import { SAMPLES, STEP_SAMPLE, SURFACE_IMPACT, weaponSounds, type ImpactMaterial } from '../logic/soundBank';
import {
  beepPitch, dist, earRing, flybyCheck, flybyGain, nearFarMix, stepGain, type V3,
} from '../logic/audioMix';
import { roomAt, type AcousticZone, type AmbientEmitter, type RoomKind, type Surface } from '../logic/acoustics';
import { mulberry32 } from '../logic/rng';
import { AudioEngine, type AudioStats, type Voice } from './AudioEngine';
import { Ambience } from './Ambience';
import { SynthFallback, type SynthName } from './SynthFallback';

export type SfxName = SynthName;

export type UiSound = 'click' | 'back' | 'change' | 'chat' | 'buy' | 'hitmarker' | 'kill' | 'radio' | 'roundStart' | 'win' | 'lose';

/** Alte Namen → neue Samples (Altschnittstelle `play`). */
const LEGACY: Record<SfxName, string> = {
  hit: 'ui.hitmarker', hurt: 'pain', kill: 'ui.kill', headshot: 'headshot', death: 'death', reload: 'reload.rifle', empty: 'dryfire',
  throw: 'nade.throw', boom: 'he.near', flash: 'flash.bang', smoke: 'smoke.hiss', planted: 'c4.planted', defused: 'c4.defused',
  roundStart: 'ui.roundStart', win: 'ui.win', lose: 'ui.lose', buy: 'ui.buy', beep: 'ui.radio', switch: 'pickup', plantTick: 'c4.press',
};

export class Sfx {
  readonly engine: AudioEngine;
  readonly ambience: Ambience;
  private synth: SynthFallback | null = null;
  private zones: readonly AcousticZone[] = [];
  private fallbackRoom: RoomKind = 'hall';
  private surfaceAt: ((x: number, y: number, z: number) => Surface) | null = null;
  private readonly rnd = mulberry32(0xc5);
  private ring: Voice | null = null;
  /** Schalldämpfer-Zustand je Waffe (USP/M4A1), Standard aus der Tabelle. */
  readonly silenced: Record<string, boolean> = {};
  /** Wird nach dem Entsperren aufgerufen (z. B. Ambience vorladen). */
  onUnlock?: () => void;

  constructor(quality: 'high' | 'low' = 'high') {
    this.engine = new AudioEngine(quality);
    this.ambience = new Ambience(this.engine);
  }

  /** Nach Nutzergeste aufrufen. */
  unlock(): void {
    const fresh = !this.engine.ctx;
    this.engine.unlock();
    const ctx = this.engine.ctx;
    if (fresh && ctx) {
      const out = this.engine.busNode('effects');
      if (out) this.synth = new SynthFallback(ctx, out);
      this.ambience.prefetch([this.fallbackRoom, ...new Set(this.zones.map((z) => z.kind))]);
      this.onUnlock?.();
    }
  }

  /** Altschnittstelle: nur Gesamtlautstärke. */
  setVolume(v: number): void {
    this.engine.setVolumes({ volume: v, volumeEffects: 1, volumeAmbience: 0.7, volumeUi: 0.8 });
  }

  setVolumes(s: { volume: number; volumeEffects: number; volumeAmbience: number; volumeUi: number }): void {
    this.engine.setVolumes(s);
  }

  /** Karte: Raumzonen + Ambient-Quellen; `fallback` = Raum außerhalb aller Zonen. */
  setAcoustics(zones: readonly AcousticZone[], emitters: readonly AmbientEmitter[], fallback: RoomKind = 'hall'): void {
    this.zones = zones;
    this.fallbackRoom = fallback;
    this.ambience.setEmitters(emitters);
    if (this.engine.ctx) this.ambience.prefetch([fallback, ...new Set(zones.map((z) => z.kind))]);
  }

  /** Sichtlinien-Test (true = Wand dazwischen). */
  setOcclusion(fn: ((from: V3, to: V3) => boolean) | null): void {
    this.engine.occluded = fn;
  }

  /** Oberfläche unter einem Punkt (Schritte/Einschläge). */
  setSurfaceLookup(fn: ((x: number, y: number, z: number) => Surface) | null): void {
    this.surfaceAt = fn;
  }

  surface(p: V3): Surface {
    try {
      return this.surfaceAt?.(p.x, p.y, p.z) ?? 'concrete';
    } catch {
      return 'concrete';
    }
  }

  /** Raum an einem Punkt (kleinste Zone, sonst Rückfall). */
  roomAt(p: V3): RoomKind {
    return roomAt(this.zones, p.x, p.y, p.z, this.fallbackRoom);
  }

  /** Pro Frame: Hörer an die Kamera, Raumhall, Ambience. */
  tick(dt: number, pos: V3, fwd: V3, up?: V3): void {
    this.engine.setListener(pos, fwd, up);
    if (!this.engine.running) return;
    const room = this.roomAt(pos);
    if (room !== this.engine.room) this.engine.setRoom(room);
    this.ambience.tick(dt, pos, room);
  }

  stats(): AudioStats & { emitters: number; ambienceVoices: number } {
    return { ...this.engine.stats(), emitters: this.ambience.emitterCount, ambienceVoices: this.ambience.activeVoices() };
  }

  // ------------------------------------------------------------------ Waffen

  private posOf(at: number | V3 | null | undefined): { pos: V3 | null; d: number } {
    if (at === null || at === undefined || typeof at === 'number') return { pos: null, d: typeof at === 'number' ? at : 0 };
    return { pos: at, d: dist(at, this.engine.listener) };
  }

  /**
   * Schuss: `at` = Position des Schützen (oder Abstand in m, 0 = eigener Schuss).
   * Nah-/Fernklang werden nach Entfernung überblendet; eigene Schüsse bekommen
   * Hülsenfall und ggf. Repetieren.
   */
  shot(weaponId: string, at: number | V3 = 0, opts: { silenced?: boolean } = {}): void {
    if (!this.engine.ctx) return;
    const def = WEAPONS[weaponId];
    const ws = weaponSounds(weaponId, opts.silenced ?? this.silenced[weaponId]);
    if (!def || !ws) return;
    const { pos, d } = this.posOf(at);
    const local = !pos && d <= 0;
    if (def.mode === 'melee') {
      if (!this.engine.play(ws.fire, { pos, dist: d })) this.synth?.shot('knife', 1);
      return;
    }
    if (def.mode !== 'hit') return;
    const nf = nearFarMix(d, ws.silenced ? 8 : 14, ws.silenced ? 25 : 45);
    const near = nf.near > 0.02 ? this.engine.play(ws.fire, { pos, dist: d, gain: nf.near }) : null;
    const far = ws.far && nf.far > 0.02 ? this.engine.play(ws.far, { pos, dist: d, gain: nf.far }) : null;
    if (!near && !far && !this.engine.request(ws.fire)) {
      // Noch nicht geladen → Synthese (geladen, aber stumm = zu weit weg)
      const g = Math.max(0.05, 1 - d / 70);
      if (this.engine.running) this.synth?.shot(def.type, ws.silenced ? g * 0.4 : g);
    }
    // Mechanik: Repetieren (AWP/Scout/M3) und Hülse
    if (ws.cycle) this.engine.play(ws.cycle, { pos, dist: d, delay: ws.cycle === 'cycle.bolt' ? 0.45 : 0.3 });
    if (ws.shell && (local || d < 12)) {
      const feet = pos ? { x: pos.x + 0.4, y: pos.y - 1.4, z: pos.z } : null;
      this.engine.play(ws.shell, { pos: feet, dist: d, delay: 0.35 + this.rnd() * 0.25, gain: local ? 0.8 : 1 });
    }
  }

  /**
   * Fremder Schuss (Ereignis): Knall am Schützen, Vorbeiflug am Hörer, Einschläge an Wänden.
   * `walls` = Einschlagpunkte (Oberfläche über `setSurfaceLookup`).
   */
  shotAt(weaponId: string, origin: V3, ends: readonly V3[], walls: readonly V3[] = []): void {
    this.shot(weaponId, origin);
    this.bullet(origin, ends, walls);
  }

  /** Vorbeiflug (nächster Strahl) + Einschläge. */
  bullet(origin: V3, ends: readonly V3[], walls: readonly V3[] = []): void {
    if (!this.engine.running) return;
    let best: { point: V3; dist: number } | null = null;
    for (const e of ends) {
      const f = flybyCheck(origin, e, this.engine.listener);
      if (f && (!best || f.dist < best.dist)) best = f;
    }
    if (best) this.engine.play('flyby', { pos: best.point, gain: flybyGain(best.dist), occlude: false });
    for (const w of walls.slice(0, 3)) this.impact(SURFACE_IMPACT[this.surface(w)], w);
  }

  /** Einschlag an einer Wand (Material über die Oberfläche am Punkt). */
  wallHit(pos: V3): void {
    this.impact(SURFACE_IMPACT[this.surface(pos)], pos);
  }

  /** Einschlag auf Material; Metall/Beton gelegentlich mit Querschläger. */
  impact(material: ImpactMaterial, pos: V3): void {
    if (!this.engine.running) return;
    this.engine.play(`impact.${material}`, { pos });
    if ((material === 'metal' && this.rnd() < 0.35) || (material === 'concrete' && this.rnd() < 0.12)) {
      this.engine.play('ricochet', { pos, delay: 0.01 + this.rnd() * 0.03 });
    }
  }

  /** Nachladen: Klasse bestimmt das Sample; Schrot lädt Patronen einzeln (`shells` über `duration`). */
  reload(weaponId: string, duration = 0, shells = 1, at: V3 | null = null): void {
    const ws = weaponSounds(weaponId);
    if (!ws?.reload) return;
    if (ws.shellReload) {
      const n = Math.max(1, Math.min(8, shells));
      const step = duration > 0 ? duration / n : 0.5;
      for (let i = 0; i < n; i++) this.engine.play(ws.reload, { pos: at, delay: 0.25 + i * step * 0.9 });
      if (ws.cycle) this.engine.play(ws.cycle, { pos: at, delay: 0.25 + n * step * 0.9 });
      return;
    }
    if (!this.engine.play(ws.reload, { pos: at, delay: 0.05 })) this.synth?.play('reload');
  }

  /** Waffe ziehen (Granate: Stift ziehen). */
  draw(weaponId: string): void {
    const ws = weaponSounds(weaponId);
    if (!ws) return;
    this.engine.play(ws.draw);
    if (WEAPONS[weaponId]?.mode === 'throw') this.engine.play('nade.pin', { delay: 0.18 });
  }

  dryFire(): void {
    if (!this.engine.play('dryfire')) this.synth?.play('empty');
  }

  /** Messer trifft Körper bzw. Wand. */
  knifeHit(target: 'body' | 'wall', pos: V3 | null = null): void {
    this.engine.play(target === 'body' ? 'knife.hit' : 'knife.wall', { pos });
  }

  // ------------------------------------------------------------------ Spieler

  /**
   * Schritt auf `surface`. `pos` = Fußpunkt (null = eigener Spieler), `speed` in m/s.
   * Geduckt/schleichend lautlos (siehe `stepGain`).
   */
  footstep(surface: Surface, pos: V3 | null, speed: number, crouch = false): void {
    const g = stepGain(speed, crouch);
    if (g <= 0 || !this.engine.running) return;
    const key = STEP_SAMPLE[surface] ?? 'step.concrete';
    const p = pos ? { x: pos.x, y: pos.y + 0.3, z: pos.z } : null;
    if (!this.engine.play(key, { pos: p, gain: pos ? g : g * 0.55 })) {
      this.synth?.step(pos ? Math.max(0, 0.35 * (1 - dist(pos, this.engine.listener) / 30)) : 0.12);
    }
  }

  /** Altschnittstelle: Schritt in `d` Metern (0 = eigener). */
  step(d: number): void {
    this.footstep('concrete', null, d <= 0 ? 4.2 : 4.2, false);
  }

  jump(surface: Surface, pos: V3 | null): void {
    this.footstep(surface, pos, 4.5);
  }

  land(surface: Surface, pos: V3 | null, strength = 0.5): void {
    if (!this.engine.running) return;
    const p = pos ? { x: pos.x, y: pos.y + 0.3, z: pos.z } : null;
    const k = 0.4 + 0.6 * Math.max(0, Math.min(1, strength));
    this.engine.play(STEP_SAMPLE[surface] ?? 'step.concrete', { pos: p, gain: (pos ? 1 : 0.6) * k });
    this.engine.play('land', { pos: p, gain: (pos ? 0.9 : 0.6) * k });
  }

  pain(pos: V3 | null = null): void {
    if (!this.engine.play('pain', { pos })) this.synth?.play('hurt');
  }

  death(pos: V3 | null = null): void {
    if (!this.engine.play('death', { pos })) this.synth?.play('death');
  }

  // ------------------------------------------------------------------ Granaten / Explosionen

  grenade(event: 'pin' | 'throw' | 'bounce', pos: V3 | null = null): void {
    const key = event === 'pin' ? 'nade.pin' : event === 'throw' ? 'nade.throw' : 'nade.bounce';
    if (!this.engine.play(key, { pos }) && event === 'throw') this.synth?.play('throw');
  }

  /** Explosion am Ort; HE/C4 mit Nah-/Fern-Überblendung. */
  explosion(kind: 'he' | 'flash' | 'smoke' | 'c4', pos: V3): void {
    if (!this.engine.ctx) return;
    const d = dist(pos, this.engine.listener);
    let ok: Voice | null = null;
    if (kind === 'he' || kind === 'c4') {
      const nf = nearFarMix(d, kind === 'c4' ? 35 : 25, kind === 'c4' ? 110 : 75);
      const nearKey = kind === 'c4' ? 'c4.explode' : 'he.near';
      const farKey = kind === 'c4' ? 'c4.explode.far' : 'he.far';
      if (nf.near > 0.02) ok = this.engine.play(nearKey, { pos, gain: nf.near, occlude: d > 30 });
      if (nf.far > 0.02) ok = this.engine.play(farKey, { pos, gain: nf.far }) ?? ok;
      if (!ok) this.synth?.play('boom', Math.max(0.2, 1 - d / 60));
      return;
    }
    ok = this.engine.play(kind === 'flash' ? 'flash.bang' : 'smoke.hiss', { pos });
    if (!ok) this.synth?.play(kind === 'flash' ? 'flash' : 'smoke', 0.5);
  }

  /** Geblendet: Pfeifton + dumpfe Umgebung, Dauer/Stärke nach `amount` (0..1). */
  flashed(amount: number): void {
    const er = earRing(amount);
    if (er.duration <= 0 || !this.engine.ctx) return;
    this.engine.muffleFor(er.cutoff, er.duck, er.duration);
    if (this.ring) this.engine.stop(this.ring, 0.1);
    this.ring = this.engine.play('ear.ring', { gain: er.gain });
    if (this.ring) {
      const g = this.ring.gain.gain;
      const t = this.engine.ctx.currentTime;
      g.setValueAtTime(this.ring.level, t);
      g.setTargetAtTime(0, t + er.duration * 0.35, er.duration * 0.25);
    } else this.synth?.play('flash', amount);
  }

  // ------------------------------------------------------------------ C4

  c4(event: 'press' | 'planted' | 'defuse' | 'defused', pos: V3 | null = null): void {
    const key = event === 'press' ? 'c4.press' : event === 'planted' ? 'c4.planted' : event === 'defuse' ? 'c4.defuse' : 'c4.defused';
    if (!this.engine.play(key, { pos })) this.synth?.play(event === 'press' ? 'plantTick' : event === 'planted' ? 'planted' : event === 'defused' ? 'defused' : 'switch');
  }

  /** Bomben-Piepen am Ort (oder Abstand in m); kurz vor Schluss höher. */
  beep(at: number | V3, fuseLeft = 99): void {
    const { pos, d } = this.posOf(at);
    if (!this.engine.play('c4.beep', { pos, dist: d, rate: beepPitch(fuseLeft), occlude: false })) {
      if (this.engine.running) this.synth?.beep(Math.max(0.03, 0.3 * (1 - d / 60)));
    }
  }

  // ------------------------------------------------------------------ Oberfläche

  ui(name: UiSound): void {
    const key = `ui.${name}`;
    if (!SAMPLES[key]) return;
    this.engine.play(key);
  }

  /** Altschnittstelle (nicht positioniert). */
  play(name: SfxName, strength = 1): void {
    if (!this.engine.ctx) return;
    const key = LEGACY[name];
    let ok: Voice | null = null;
    if (key === 'he.near') {
      ok = this.engine.play('he.near', { gain: Math.max(0.2, strength) });
    } else if (key) ok = this.engine.play(key);
    if (name === 'hurt') this.engine.play('impact.flesh', { gain: 0.7 });
    if (!ok && this.engine.running) this.synth?.play(name, strength);
  }
}
