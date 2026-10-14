/**
 * Umgebungsgeräusche: positionierte Schleifen der Karten-Emitter (`AmbientEmitter`,
 * Pegel über `emitterGain`), ein Grundteppich je Raumcharakter (Halle: Brummen +
 * Lüftung, draußen: Wind + Verkehr + Vögel …) mit weicher Überblendung beim
 * Raumwechsel und zufällige „Leben“-Ereignisse (Rückfahrwarner, Metallklappern,
 * Palette fällt, Durchsage-Gong, Tauben, Lkw-Hupe, Tür) in der Nähe von Emittern.
 */
import { emitterGain, type AmbientEmitter, type RoomKind } from '../logic/acoustics';
import { AMBIENT_SAMPLE, LIFE_EVENTS, ROOM_BED, SAMPLES, nextLifeDelay, pickLifeEvent } from '../logic/soundBank';
import { OCCLUSION, type V3 } from '../logic/audioMix';
import { mulberry32 } from '../logic/demo';
import type { AudioEngine, Voice } from './AudioEngine';

type EmitterState = { e: AmbientEmitter; key: string; voice: Voice | null; silentFor: number; occluded: boolean; checkIn: number };
type BedVoice = { key: string; voice: Voice | null; target: number };

/** Höchstens so viele Emitter gleichzeitig hörbar (nächste/lauteste gewinnen). */
const MAX_EMITTERS = 10;

export class Ambience {
  private emitters: EmitterState[] = [];
  private bed = new Map<string, BedVoice>();
  private bedRoom: RoomKind | null = null;
  private lifeIn = 4;
  private readonly rnd = mulberry32(0xa3b1);
  enabled = true;

  constructor(private readonly engine: AudioEngine) {}

  setEmitters(list: readonly AmbientEmitter[]): void {
    for (const s of this.emitters) if (s.voice) this.engine.stop(s.voice, 0.5);
    this.emitters = list
      .filter((e) => !!AMBIENT_SAMPLE[e.sound])
      .map((e, i) => ({ e, key: AMBIENT_SAMPLE[e.sound], voice: null, silentFor: 0, occluded: false, checkIn: (i % 10) * 0.05 }));
  }

  get emitterCount(): number {
    return this.emitters.length;
  }

  /** Aktive Emitter-/Teppich-Stimmen (Debug). */
  activeVoices(): number {
    let n = 0;
    for (const s of this.emitters) if (s.voice && !s.voice.ended) n += 1;
    for (const b of this.bed.values()) if (b.voice && !b.voice.ended) n += 1;
    return n;
  }

  /** Pro Frame: Pegel nachführen, Schleifen starten/stoppen, Raumteppich, Leben-Ereignisse. */
  tick(dt: number, listener: V3, room: RoomKind): void {
    const ctx = this.engine.ctx;
    if (!ctx || ctx.state !== 'running' || !this.enabled) return;
    const t = ctx.currentTime;
    this.tickBed(room, t);
    this.tickEmitters(dt, listener, t);
    this.tickLife(dt, listener, room);
  }

  private tickBed(room: RoomKind, t: number): void {
    if (room !== this.bedRoom) {
      this.bedRoom = room;
      const want = new Map(ROOM_BED[room].map((b) => [b.key, b.gain]));
      for (const [key, b] of this.bed) b.target = want.get(key) ?? 0;
      for (const [key, g] of want) if (!this.bed.has(key)) this.bed.set(key, { key, voice: null, target: g });
    }
    for (const [key, b] of this.bed) {
      if (!b.voice && b.target > 0) {
        b.voice = this.engine.play(key, { gain: 1 });
        if (b.voice) {
          b.voice.gain.gain.value = 0;
          b.voice.src.loopStart = 0;
        }
      }
      if (!b.voice) continue;
      const def = SAMPLES[key]!;
      b.voice.gain.gain.setTargetAtTime(def.gain * b.target, t, 1.2);
      if (b.target === 0 && b.voice.gain.gain.value < 0.002) {
        this.engine.stop(b.voice, 0.1);
        this.bed.delete(key);
      }
    }
  }

  private tickEmitters(dt: number, l: V3, t: number): void {
    // Kandidaten nach Pegel sortieren, nur die stärksten spielen
    const scored = this.emitters.map((s) => ({ s, g: emitterGain(s.e, l.x, l.y, l.z) }));
    scored.sort((a, b) => b.g - a.g);
    scored.forEach(({ s, g }, rank) => {
      const audible = g > 0.003 && rank < MAX_EMITTERS;
      if (audible) {
        s.silentFor = 0;
        if (!s.voice) {
          s.voice = this.engine.play(s.key, { pos: { x: s.e.pos[0], y: s.e.pos[1], z: s.e.pos[2] }, gain: 1 });
          if (s.voice) s.voice.gain.gain.value = 0;
        }
        if (!s.voice) return;
        // Verdeckung gestaffelt alle ~0.5 s prüfen (Raycast ist teuer)
        s.checkIn -= dt;
        if (s.checkIn <= 0 && this.engine.occluded) {
          s.checkIn = 0.5;
          try {
            s.occluded = this.engine.occluded(l, { x: s.e.pos[0], y: s.e.pos[1], z: s.e.pos[2] });
          } catch {
            s.occluded = false;
          }
        }
        const def = SAMPLES[s.key]!;
        const target = def.gain * g * (s.occluded ? OCCLUSION.gain + 0.15 : 1);
        s.voice.gain.gain.setTargetAtTime(target, t, 0.35);
        s.voice.filter?.frequency.setTargetAtTime(s.occluded ? OCCLUSION.cutoff * 1.5 : 20000, t, 0.35);
      } else if (s.voice) {
        s.voice.gain.gain.setTargetAtTime(0, t, 0.4);
        s.silentFor += dt;
        if (s.silentFor > 2.5) {
          this.engine.stop(s.voice, 0.1);
          s.voice = null;
        }
      }
    });
  }

  private tickLife(dt: number, l: V3, room: RoomKind): void {
    this.lifeIn -= dt;
    if (this.lifeIn > 0) return;
    this.lifeIn = nextLifeDelay(room, this.rnd);
    const ev = pickLifeEvent(room, this.rnd);
    if (!ev) return;
    // Bevorzugt in der Nähe eines Emitters im passenden Abstand, sonst zufällig um den Hörer
    const near = this.emitters.filter((s) => {
      const d = Math.hypot(s.e.pos[0] - l.x, s.e.pos[2] - l.z);
      return d >= ev.minDist * 0.6 && d <= ev.maxDist;
    });
    let pos: V3;
    if (near.length && this.rnd() < 0.7) {
      const s = near[Math.floor(this.rnd() * near.length)]!;
      pos = { x: s.e.pos[0] + (this.rnd() - 0.5) * 6, y: s.e.pos[1] + 1, z: s.e.pos[2] + (this.rnd() - 0.5) * 6 };
    } else {
      const a = this.rnd() * Math.PI * 2;
      const d = ev.minDist + (ev.maxDist - ev.minDist) * this.rnd();
      pos = { x: l.x + Math.cos(a) * d, y: l.y + (ev.key === 'life.pigeons' ? 6 : 0.5), z: l.z + Math.sin(a) * d };
    }
    this.engine.play(ev.key, { pos, occlude: false });
  }

  /** Lazy-Samples vorab laden, die für Raum/Emitter gebraucht werden. */
  prefetch(rooms: readonly RoomKind[]): void {
    for (const r of rooms) for (const b of ROOM_BED[r]) this.engine.request(b.key);
    for (const s of this.emitters) this.engine.request(s.key);
    for (const e of LIFE_EVENTS) if (e.rooms.some((r) => rooms.includes(r))) this.engine.request(e.key);
  }

  stopAll(): void {
    for (const s of this.emitters) if (s.voice) this.engine.stop(s.voice, 0.3);
    for (const b of this.bed.values()) if (b.voice) this.engine.stop(b.voice, 0.3);
    this.bed.clear();
    this.bedRoom = null;
    for (const s of this.emitters) s.voice = null;
  }
}
