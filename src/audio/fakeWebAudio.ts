/**
 * Minimale WebAudio-Attrappe für Node-Tests der Audio-Schicht (kein Klang, nur
 * Graph-Aufbau, Parameter und Start/Stopp werden nachgebildet). Nur für *.test.ts.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

class FakeParam {
  value: number;
  events: { kind: string; v: number; t: number }[] = [];
  constructor(v = 0) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number): this { this.value = v; this.events.push({ kind: 'set', v, t }); return this; }
  setTargetAtTime(v: number, t: number): this { this.value = v; this.events.push({ kind: 'target', v, t }); return this; }
  linearRampToValueAtTime(v: number, t: number): this { this.value = v; this.events.push({ kind: 'lin', v, t }); return this; }
  exponentialRampToValueAtTime(v: number, t: number): this { this.value = v; this.events.push({ kind: 'exp', v, t }); return this; }
  cancelScheduledValues(): this { return this; }
}

class FakeNode {
  outputs: FakeNode[] = [];
  constructor(readonly kind: string, readonly ctx: FakeAudioContext) {}
  connect<T>(n: T): T { this.outputs.push(n as unknown as FakeNode); return n; }
  disconnect(): void { this.outputs = []; }
}

export class FakeBuffer {
  constructor(readonly duration: number, readonly numberOfChannels = 1, readonly sampleRate = 48000) {}
  get length(): number { return Math.round(this.duration * this.sampleRate); }
  getChannelData(): Float32Array { return new Float32Array(this.length); }
  copyToChannel(): void { /* nichts */ }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  started = -1;
  stopped = -1;
  start(t = 0): void { this.started = t; this.ctx.sources.push(this); }
  stop(t = 0): void { this.stopped = t; }
  /** Test-Helfer: Ende auslösen. */
  end(): void { this.onended?.(); }
}

export class FakeAudioContext {
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  sampleRate = 48000;
  readonly sources: FakeSource[] = [];
  readonly destination = new FakeNode('destination', this);
  readonly listener = {
    positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
    forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(-1),
    upX: new FakeParam(), upY: new FakeParam(1), upZ: new FakeParam(),
  };
  /** Dauer je dekodierter Datei (Test steuert sie über den URL-Namen). */
  static durationFor: (url: string) => number = () => 0.5;
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  createGain(): any { const n = new FakeNode('gain', this) as any; n.gain = new FakeParam(1); return n; }
  createBiquadFilter(): any { const n = new FakeNode('biquad', this) as any; n.type = 'lowpass'; n.frequency = new FakeParam(350); n.Q = new FakeParam(1); return n; }
  createDynamicsCompressor(): any {
    const n = new FakeNode('comp', this) as any;
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam();
    return n;
  }
  createConvolver(): any { const n = new FakeNode('conv', this) as any; n.buffer = null; n.normalize = true; return n; }
  createPanner(): any {
    const n = new FakeNode('panner', this) as any;
    n.positionX = new FakeParam(); n.positionY = new FakeParam(); n.positionZ = new FakeParam();
    return n;
  }
  createOscillator(): any {
    const n = new FakeNode('osc', this) as any;
    n.frequency = new FakeParam(440); n.start = () => undefined; n.stop = () => undefined; n.type = 'sine';
    return n;
  }
  createBufferSource(): any { return new FakeSource('source', this); }
  createBuffer(ch: number, len: number, sr: number): any { return new FakeBuffer(len / sr, ch, sr); }
  decodeAudioData(data: ArrayBuffer & { url?: string }, ok?: (b: any) => void): Promise<any> {
    const b = new FakeBuffer(FakeAudioContext.durationFor(data.url ?? ''));
    ok?.(b);
    return Promise.resolve(b);
  }
}

/** Globale Browser-Objekte für die Audio-Schicht nachbilden (window, document, fetch). */
export function installFakeAudio(opts: { failUrls?: (url: string) => boolean } = {}): { contexts: FakeAudioContext[]; restore: () => void } {
  const g = globalThis as any;
  const saved = { window: g.window, document: g.document, fetch: g.fetch };
  const contexts: FakeAudioContext[] = [];
  class Ctx extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  }
  g.window = { AudioContext: Ctx };
  g.document = { baseURI: 'http://test/', createElement: () => ({ canPlayType: (t: string) => (t.includes('ogg') ? 'probably' : '') }) };
  g.fetch = async (url: string) => {
    if (opts.failUrls?.(url)) return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { url }) };
  };
  return {
    contexts,
    restore: () => {
      g.window = saved.window;
      g.document = saved.document;
      g.fetch = saved.fetch;
    },
  };
}

/** Wartet, bis alle anstehenden Lade-Promises durch sind. */
export async function flush(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}
