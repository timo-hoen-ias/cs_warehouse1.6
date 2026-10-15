import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioContext, flush, installFakeAudio } from './fakeWebAudio';
import { Sfx } from './Sfx';
import { SAMPLES, sampleFiles } from '../logic/soundBank';

let env: ReturnType<typeof installFakeAudio>;

async function ready(opts: Parameters<typeof installFakeAudio>[0] = {}): Promise<{ sfx: Sfx; ctx: FakeAudioContext }> {
  env = installFakeAudio(opts);
  const sfx = new Sfx('low');
  sfx.unlock();
  await flush();
  return { sfx, ctx: env.contexts[0]! };
}

const keysOf = (sfx: Sfx): string[] => sfx.engine.activeKeys();

beforeEach(() => {
  FakeAudioContext.durationFor = () => 0.5;
});
afterEach(() => env?.restore());

describe('Sfx · Laden', () => {
  it('lädt alle nicht-lazy Samples im gewählten Format', async () => {
    const { sfx } = await ready();
    const eager = Object.values(SAMPLES).filter((d) => !d.lazy).reduce((n, d) => n + sampleFiles(d).length, 0);
    const st = sfx.stats();
    expect(st.loaded).toBeGreaterThanOrEqual(eager);
    expect(st.failed).toBe(0);
    expect(st.format).toBe('ogg');
    expect(st.state).toBe('running');
  });
  it('fehlende Dateien → Synthese statt Fehler', async () => {
    const { sfx, ctx } = await ready({ failUrls: (u) => u.includes('weapons/') });
    expect(sfx.stats().failed).toBeGreaterThan(0);
    const before = ctx.sources.length;
    expect(() => sfx.shot('ak47', 0)).not.toThrow();
    // Synthese erzeugt Rausch-Quellen statt Sample-Stimmen
    expect(ctx.sources.length).toBeGreaterThan(before);
    expect(keysOf(sfx).some((k) => k.startsWith('fire.'))).toBe(false);
  });
  it('ohne Entsperren ist alles stumm und wirft nicht', () => {
    env = installFakeAudio();
    const sfx = new Sfx();
    expect(() => {
      sfx.shot('awp', { x: 1, y: 1, z: 1 });
      sfx.footstep('metal', null, 5);
      sfx.flashed(1);
      sfx.play('win');
      sfx.tick(0.016, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 });
    }).not.toThrow();
    expect(sfx.stats().state).toBe('none');
  });
});

describe('Sfx · Schüsse', () => {
  it('nah: Nahklang + Hülse; fern: nur Fernklang; jenseits der Hörweite: nichts', async () => {
    const { sfx } = await ready();
    sfx.tick(0.016, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 });
    sfx.shot('ak47', 0);
    expect(keysOf(sfx)).toEqual(expect.arrayContaining(['fire.ak47', 'shell']));
    const n0 = keysOf(sfx).length;
    sfx.shot('ak47', { x: 0, y: 1.6, z: -80 });
    const added = keysOf(sfx).slice(n0);
    expect(added).toEqual(['far.rifle']);
    const n1 = keysOf(sfx).length;
    sfx.shot('glock', { x: 0, y: 1.6, z: -400 });
    expect(keysOf(sfx).length).toBe(n1);
  });
  it('AWP repetiert, USP standardmäßig gedämpft, Vorbeiflug am Hörer', async () => {
    const { sfx } = await ready();
    sfx.shot('awp', 0);
    expect(keysOf(sfx)).toContain('cycle.bolt');
    sfx.shot('usp', 0);
    expect(keysOf(sfx)).toContain('fire.usp_sil');
    sfx.shotAt('m4a1', { x: 0, y: 1.6, z: -30 }, [{ x: 0.5, y: 1.6, z: 20 }], [{ x: 0.5, y: 1.6, z: 20 }]);
    expect(keysOf(sfx)).toEqual(expect.arrayContaining(['flyby', 'impact.concrete']));
  });
  it('Stimmen-Limit je Sample', async () => {
    const { sfx, ctx } = await ready();
    const stoppedBefore = ctx.sources.filter((s) => s.stopped >= 0).length;
    for (let i = 0; i < 10; i++) sfx.footstep('concrete', { x: 1, y: 0, z: 1 }, 5);
    // max. 8 gleichzeitige Schritte → die zwei ältesten werden gestoppt
    expect(SAMPLES['step.concrete']!.maxVoices).toBe(8);
    expect(ctx.sources.filter((s) => s.stopped >= 0).length - stoppedBefore).toBe(2);
  });
});

describe('Sfx · Blendung, Raum, Ambience', () => {
  it('Blendung: Pfeifton + Tiefpass, schwache Blendung nichts', async () => {
    const { sfx } = await ready();
    sfx.flashed(0.05);
    expect(keysOf(sfx)).not.toContain('ear.ring');
    sfx.flashed(0.9);
    expect(keysOf(sfx)).toContain('ear.ring');
  });
  it('Raumwechsel über Zonen, Emitter starten in Reichweite', async () => {
    const { sfx } = await ready();
    sfx.setAcoustics(
      [{ kind: 'tunnel', min: [0, 0, 0], max: [10, 5, 10] }],
      [{ sound: 'machine', pos: [50, 1, 50], radius: 20 }],
      'outdoor',
    );
    await flush();
    sfx.tick(0.016, { x: 5, y: 1.6, z: 5 }, { x: 0, y: 0, z: -1 });
    await flush();
    sfx.tick(0.016, { x: 5, y: 1.6, z: 5 }, { x: 0, y: 0, z: -1 });
    expect(sfx.stats().room).toBe('tunnel');
    expect(keysOf(sfx)).toContain('amb.tunnel');
    expect(keysOf(sfx)).not.toContain('amb.machine');
    // Zur Maschine gehen → draußen + Maschine hörbar
    sfx.tick(0.016, { x: 45, y: 1.6, z: 45 }, { x: 0, y: 0, z: -1 });
    await flush();
    sfx.tick(0.016, { x: 45, y: 1.6, z: 45 }, { x: 0, y: 0, z: -1 });
    expect(sfx.stats().room).toBe('outdoor');
    expect(keysOf(sfx)).toContain('amb.machine');
    expect(sfx.stats().ambienceVoices).toBeGreaterThan(1);
  });
  it('Lautstärke-Kanäle wirken ohne Fehler', async () => {
    const { sfx } = await ready();
    expect(() => sfx.setVolumes({ volume: 0.5, volumeEffects: 0.2, volumeAmbience: 0, volumeUi: 1 })).not.toThrow();
  });
});
