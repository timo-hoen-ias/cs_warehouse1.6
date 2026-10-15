import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMBIENT_SAMPLE, LIFE_EVENTS, ROOM_BED, SAMPLES, STEP_SAMPLE, SURFACE_IMPACT, nextLifeDelay, pickLifeEvent, sampleFiles, weaponSounds,
} from './soundBank';
import { WEAPONS } from './weapons';
import { mulberry32 } from './rng';
import type { RoomKind } from './acoustics';

const AUDIO_DIR = fileURLToPath(new URL('../../assets/audio', import.meta.url));
const ROOMS: RoomKind[] = ['outdoor', 'hall', 'room', 'tunnel', 'cold'];

describe('SAMPLES ↔ assets/audio', () => {
  it('jede Datei existiert als .ogg und .m4a und ist nicht leer', () => {
    for (const [key, def] of Object.entries(SAMPLES)) {
      for (const f of sampleFiles(def)) {
        for (const ext of ['ogg', 'm4a']) {
          const p = resolve(AUDIO_DIR, `${f}.${ext}`);
          expect(existsSync(p), `${key}: ${f}.${ext}`).toBe(true);
          expect(statSync(p).size, `${key}: ${f}.${ext}`).toBeGreaterThan(200);
        }
      }
    }
  });
  it('sinnvolle Parameter (Hörweite, Lautstärke, Tonhöhe)', () => {
    for (const [key, d] of Object.entries(SAMPLES)) {
      expect(d.variants, key).toBeGreaterThanOrEqual(1);
      expect(d.gain, key).toBeGreaterThan(0);
      expect(d.gain, key).toBeLessThanOrEqual(1.2);
      expect(d.maxDist, key).toBeGreaterThanOrEqual(d.ref);
      expect(d.pitch[0], key).toBeLessThanOrEqual(d.pitch[1]);
      if (d.loop) expect(d.bus, key).toBe('ambience');
    }
  });
  it('Gesamtgröße der Audio-Assets bleibt im Rahmen (< 6 MB)', () => {
    let total = 0;
    for (const def of Object.values(SAMPLES)) for (const f of sampleFiles(def)) for (const ext of ['ogg', 'm4a']) total += statSync(resolve(AUDIO_DIR, `${f}.${ext}`)).size;
    expect(total).toBeLessThan(6 * 1024 * 1024);
  });
  it('Quellenangaben (CREDITS.md) vorhanden', () => {
    const credits = readFileSync(resolve(AUDIO_DIR, 'CREDITS.md'), 'utf8');
    expect(credits).toContain('CC-BY-SA');
    expect(credits).toContain('redeclipse/sounds');
  });
  it('sampleFiles hängt nur bei Varianten Nummern an', () => {
    expect(sampleFiles({ ...SAMPLES['dryfire']!, variants: 1 })).toEqual(['weapons/dryfire']);
    expect(sampleFiles(SAMPLES['fire.ak47']!)).toEqual(['weapons/ak47_1', 'weapons/ak47_2']);
  });
});

describe('weaponSounds', () => {
  it('jede Waffe hat einen existierenden Schussklang', () => {
    for (const id of Object.keys(WEAPONS)) {
      const ws = weaponSounds(id);
      expect(ws, id).not.toBeNull();
      expect(SAMPLES[ws!.fire], `${id} → ${ws!.fire}`).toBeDefined();
      expect(SAMPLES[ws!.draw], id).toBeDefined();
      if (ws!.far) expect(SAMPLES[ws!.far], id).toBeDefined();
      if (ws!.reload) expect(SAMPLES[ws!.reload], id).toBeDefined();
      if (ws!.cycle) expect(SAMPLES[ws!.cycle], id).toBeDefined();
      if (ws!.shell) expect(SAMPLES[ws!.shell], id).toBeDefined();
    }
  });
  it('jede Feuerwaffe klingt eigen (eigene Datei)', () => {
    const guns = Object.values(WEAPONS).filter((w) => w.mode === 'hit');
    const fires = new Set(guns.map((w) => weaponSounds(w.id, false)!.fire));
    expect(fires.size).toBe(guns.length);
  });
  it('Schalldämpfer: TMP immer, USP standardmäßig, M4A1 umschaltbar', () => {
    expect(weaponSounds('tmp')!.silenced).toBe(true);
    expect(weaponSounds('tmp', false)!.silenced).toBe(true);
    expect(weaponSounds('usp')!.fire).toBe('fire.usp_sil');
    expect(weaponSounds('usp', false)!.fire).toBe('fire.usp');
    expect(weaponSounds('m4a1')!.fire).toBe('fire.m4a1');
    expect(weaponSounds('m4a1', true)!.fire).toBe('fire.m4a1_sil');
    expect(weaponSounds('m4a1', true)!.far).toBeNull();
    expect(weaponSounds('ak47', true)!.silenced).toBe(false);
  });
  it('Repetierer, Pumpe, Schrot-Einzelladen, Messer, Granate', () => {
    expect(weaponSounds('awp')!.cycle).toBe('cycle.bolt');
    expect(weaponSounds('scout')!.cycle).toBe('cycle.bolt');
    expect(weaponSounds('g3sg1')!.cycle).toBeNull();
    expect(weaponSounds('m3')!.cycle).toBe('cycle.pump');
    expect(weaponSounds('xm1014')!.cycle).toBeNull();
    expect(weaponSounds('m3')!.shellReload).toBe(true);
    expect(weaponSounds('m3')!.shell).toBe('shell.shotgun');
    expect(weaponSounds('knife')!.fire).toBe('knife.slash');
    expect(weaponSounds('knife_stab')!.fire).toBe('knife.stab');
    expect(weaponSounds('hegrenade')!.fire).toBe('nade.throw');
    expect(weaponSounds('gibtsnicht')).toBeNull();
  });
  it('Fernklang je Klasse, Scharfschützen am weitesten hörbar', () => {
    expect(weaponSounds('ak47')!.far).toBe('far.rifle');
    expect(weaponSounds('awp')!.far).toBe('far.sniper');
    expect(SAMPLES['fire.awp']!.maxDist).toBeGreaterThan(SAMPLES['fire.glock']!.maxDist);
    expect(SAMPLES['fire.tmp']!.maxDist).toBeLessThan(SAMPLES['fire.mp5']!.maxDist);
  });
});

describe('Oberflächen, Ambience, Leben', () => {
  it('jede Oberfläche und jede Ambient-Quelle hat ein Sample', () => {
    for (const k of Object.values(STEP_SAMPLE)) expect(SAMPLES[k], k).toBeDefined();
    for (const k of Object.values(AMBIENT_SAMPLE)) expect(SAMPLES[k]?.loop, k).toBe(true);
    for (const m of Object.values(SURFACE_IMPACT)) expect(SAMPLES[`impact.${m}`], m).toBeDefined();
  });
  it('jeder Raum hat einen Grundteppich aus Schleifen', () => {
    for (const r of ROOMS) {
      expect(ROOM_BED[r].length).toBeGreaterThan(0);
      for (const b of ROOM_BED[r]) expect(SAMPLES[b.key]?.loop, b.key).toBe(true);
    }
  });
  it('Leben-Ereignisse: gewichtete Wahl passt zum Raum, Pausen im Rahmen', () => {
    for (const e of LIFE_EVENTS) {
      expect(SAMPLES[e.key], e.key).toBeDefined();
      expect(e.maxDist).toBeGreaterThan(e.minDist);
    }
    const rnd = mulberry32(11);
    for (const r of ROOMS) {
      for (let i = 0; i < 50; i++) {
        const e = pickLifeEvent(r, rnd);
        expect(e).not.toBeNull();
        expect(e!.rooms).toContain(r);
        const d = nextLifeDelay(r, rnd);
        expect(d).toBeGreaterThanOrEqual(6);
        expect(d).toBeLessThanOrEqual(30);
      }
    }
    // Hupe nur draußen
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickLifeEvent('hall', rnd)!.key);
    expect(seen.has('life.horn')).toBe(false);
    expect(seen.size).toBeGreaterThan(3);
  });
});
