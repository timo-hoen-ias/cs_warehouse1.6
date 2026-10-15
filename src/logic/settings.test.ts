import { describe, expect, it } from 'vitest';
import {
  CROSSHAIR_SIZE_MAX,
  CROSSHAIR_SIZE_MIN,
  CROSSHAIR_GAP_MAX,
  CROSSHAIR_GAP_MIN,
  CROSSHAIR_THICKNESS_MAX,
  CROSSHAIR_THICKNESS_MIN,
  DEFAULT_SETTINGS,
  HUD_SCALE_MAX,
  HUD_SCALE_MIN,
  FOV_MAX,
  FOV_MIN,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  SETTINGS_KEY,
  formatSensitivity,
  loadSettings,
  normalizeHexColor,
  sanitizeSettings,
  saveSettings,
  sensitivityToSlider,
  sliderToSensitivity,
  type KeyValueStore,
} from './settings';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

describe('DEFAULT_SETTINGS', () => {
  it('hat die spezifizierten Standardwerte', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      sensitivity: 0.0022,
      invertY: false,
      fov: 75,
      volume: 0.7,
      crosshairColor: '#9ff09f',
      crosshairStyle: 'classic',
      crosshairSize: 9,
      showFps: false,
      bobbing: true,
      musicVolume: 0.5,
      musicMuted: false,
      hudScale: 1,
      crosshairGap: 3,
      crosshairThickness: 2,
      crosshairDynamic: true,
    });
  });
});

describe('sanitizeSettings', () => {
  it('liefert bei Nicht-Objekten die Standardwerte', () => {
    for (const raw of [undefined, null, 42, 'x', true, [], [1, 2]]) {
      expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('gibt eine Kopie zurück, nicht das Default-Objekt selbst', () => {
    const s = sanitizeSettings({});
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s).not.toBe(DEFAULT_SETTINGS);
    s.fov = 100;
    expect(DEFAULT_SETTINGS.fov).toBe(75);
  });

  it('übernimmt gültige vollständige Werte unverändert', () => {
    const full = {
      sensitivity: 0.005,
      invertY: true,
      fov: 90,
      volume: 0.25,
      crosshairColor: '#ff0000',
      crosshairStyle: 'circle' as const,
      crosshairSize: 14,
      showFps: true,
      bobbing: false,
      musicVolume: 0.3,
      musicMuted: true,
      hudScale: 1.25,
      crosshairGap: 6,
      crosshairThickness: 3,
      crosshairDynamic: false,
    };
    expect(sanitizeSettings(full)).toEqual(full);
  });

  it('füllt teilweise Eingaben mit Standardwerten auf', () => {
    expect(sanitizeSettings({ fov: 100, showFps: true })).toEqual({ ...DEFAULT_SETTINGS, fov: 100, showFps: true });
  });

  it('ignoriert unbekannte Felder', () => {
    const s = sanitizeSettings({ foo: 1, fov: 80 }) as Record<string, unknown>;
    expect(s.foo).toBeUndefined();
    expect(s.fov).toBe(80);
  });

  it('klemmt Zahlen auf die Grenzen', () => {
    const lo = sanitizeSettings({ sensitivity: -1, fov: 10, volume: -3, crosshairSize: 0 });
    expect(lo.sensitivity).toBe(SENSITIVITY_MIN);
    expect(lo.fov).toBe(FOV_MIN);
    expect(lo.volume).toBe(0);
    expect(lo.crosshairSize).toBe(CROSSHAIR_SIZE_MIN);
    const hi = sanitizeSettings({ sensitivity: 5, fov: 500, volume: 9, crosshairSize: 99 });
    expect(hi.sensitivity).toBe(SENSITIVITY_MAX);
    expect(hi.fov).toBe(FOV_MAX);
    expect(hi.volume).toBe(1);
    expect(hi.crosshairSize).toBe(CROSSHAIR_SIZE_MAX);
  });

  it('akzeptiert die Grenzwerte selbst', () => {
    expect(sanitizeSettings({ fov: 60 }).fov).toBe(60);
    expect(sanitizeSettings({ fov: 110 }).fov).toBe(110);
    expect(sanitizeSettings({ volume: 0 }).volume).toBe(0);
    expect(sanitizeSettings({ volume: 1 }).volume).toBe(1);
  });

  it('verwirft NaN und Infinity feldweise (Default statt Klemmung)', () => {
    const s = sanitizeSettings({ sensitivity: NaN, fov: Infinity, volume: -Infinity, crosshairSize: NaN });
    expect(s.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
    expect(s.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(s.crosshairSize).toBe(DEFAULT_SETTINGS.crosshairSize);
  });

  it('verwirft falsche Typen feldweise, ohne andere Felder zu beeinflussen', () => {
    const s = sanitizeSettings({
      sensitivity: '0.005',
      invertY: 'true',
      fov: null,
      volume: {},
      crosshairColor: 123,
      crosshairStyle: 7,
      crosshairSize: [9],
      showFps: 1,
      bobbing: 'yes',
      musicVolume: '0.4',
      musicMuted: 'nein',
      hudScale: null,
      crosshairGap: {},
      crosshairThickness: '2',
      crosshairDynamic: 0,
    });
    expect(s).toEqual(DEFAULT_SETTINGS);
    const mixed = sanitizeSettings({ sensitivity: 'abc', fov: 100, invertY: 0, showFps: true });
    expect(mixed.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity);
    expect(mixed.fov).toBe(100);
    expect(mixed.invertY).toBe(false);
    expect(mixed.showFps).toBe(true);
  });

  it('prüft den Fadenkreuz-Stil gegen die erlaubten Werte', () => {
    expect(sanitizeSettings({ crosshairStyle: 'dot' }).crosshairStyle).toBe('dot');
    expect(sanitizeSettings({ crosshairStyle: 'circle' }).crosshairStyle).toBe('circle');
    expect(sanitizeSettings({ crosshairStyle: 'classic' }).crosshairStyle).toBe('classic');
    expect(sanitizeSettings({ crosshairStyle: 'cross' }).crosshairStyle).toBe('classic');
    expect(sanitizeSettings({ crosshairStyle: 'DOT' }).crosshairStyle).toBe('classic');
  });

  it('ersetzt ungültige Farben durch den Standard', () => {
    for (const c of ['red', '#fff', '#12345', '#1234567', '#gggggg', 'ff0000', '', ' #ff0000', 'rgb(1,2,3)', null, 5]) {
      expect(sanitizeSettings({ crosshairColor: c }).crosshairColor).toBe(DEFAULT_SETTINGS.crosshairColor);
    }
  });

  it('normalisiert gültige Farben auf Kleinbuchstaben', () => {
    expect(sanitizeSettings({ crosshairColor: '#FFAA00' }).crosshairColor).toBe('#ffaa00');
  });

  it('ist idempotent', () => {
    const once = sanitizeSettings({ sensitivity: 99, fov: 1, crosshairColor: '#ABCDEF', crosshairStyle: 'dot' });
    expect(sanitizeSettings(once)).toEqual(once);
  });
});

describe('neue Einstellungen (Musik, HUD-Skalierung, Fadenkreuz-Details)', () => {
  it('klemmt Musiklautstärke auf 0..1', () => {
    expect(sanitizeSettings({ musicVolume: -0.5 }).musicVolume).toBe(0);
    expect(sanitizeSettings({ musicVolume: 3 }).musicVolume).toBe(1);
    expect(sanitizeSettings({ musicVolume: 0.42 }).musicVolume).toBe(0.42);
    expect(sanitizeSettings({ musicVolume: NaN }).musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  it('klemmt die HUD-Skalierung auf ihre Grenzen', () => {
    expect(sanitizeSettings({ hudScale: 0.1 }).hudScale).toBe(HUD_SCALE_MIN);
    expect(sanitizeSettings({ hudScale: 9 }).hudScale).toBe(HUD_SCALE_MAX);
    expect(sanitizeSettings({ hudScale: 1.1 }).hudScale).toBe(1.1);
    expect(sanitizeSettings({ hudScale: Infinity }).hudScale).toBe(1);
  });

  it('klemmt Fadenkreuz-Abstand und -Stärke', () => {
    expect(sanitizeSettings({ crosshairGap: -2 }).crosshairGap).toBe(CROSSHAIR_GAP_MIN);
    expect(sanitizeSettings({ crosshairGap: 50 }).crosshairGap).toBe(CROSSHAIR_GAP_MAX);
    expect(sanitizeSettings({ crosshairThickness: 0 }).crosshairThickness).toBe(CROSSHAIR_THICKNESS_MIN);
    expect(sanitizeSettings({ crosshairThickness: 10 }).crosshairThickness).toBe(CROSSHAIR_THICKNESS_MAX);
  });

  it('übernimmt Schalter nur als echte Booleans', () => {
    expect(sanitizeSettings({ musicMuted: true, crosshairDynamic: false })).toMatchObject({ musicMuted: true, crosshairDynamic: false });
    expect(sanitizeSettings({ musicMuted: 1, crosshairDynamic: 'false' })).toMatchObject({ musicMuted: false, crosshairDynamic: true });
  });

  it('alte gespeicherte Einstellungen (ohne neue Felder) bekommen die Standardwerte', () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify({ fov: 90, volume: 0.2 }) });
    const s = loadSettings(store);
    expect(s.fov).toBe(90);
    expect(s.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(s.hudScale).toBe(1);
  });
});

describe('normalizeHexColor', () => {
  it('akzeptiert nur #rrggbb', () => {
    expect(normalizeHexColor('#9ff09f')).toBe('#9ff09f');
    expect(normalizeHexColor('#ABCDEF')).toBe('#abcdef');
    expect(normalizeHexColor('#abc')).toBeNull();
    expect(normalizeHexColor('abcdef')).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
    expect(normalizeHexColor(0xffffff)).toBeNull();
  });
});

describe('loadSettings', () => {
  it('liefert Standardwerte bei null-Store', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('liefert Standardwerte, wenn nichts gespeichert ist', () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS);
  });

  it('liest und bereinigt gespeicherte Werte', () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify({ fov: 200, invertY: true, crosshairColor: 'nope' }) });
    expect(loadSettings(store)).toEqual({ ...DEFAULT_SETTINGS, fov: FOV_MAX, invertY: true });
  });

  it('fällt bei kaputtem JSON auf Standardwerte zurück', () => {
    expect(loadSettings(memoryStore({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('fällt bei JSON mit falschem Typ auf Standardwerte zurück', () => {
    expect(loadSettings(memoryStore({ [SETTINGS_KEY]: '"text"' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStore({ [SETTINGS_KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStore({ [SETTINGS_KEY]: '[1]' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('wirft nicht, wenn getItem wirft', () => {
    const store: KeyValueStore = { getItem: () => { throw new Error('blockiert'); }, setItem: () => {} };
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('schreibt unter SETTINGS_KEY und ist per loadSettings lesbar (Roundtrip)', () => {
    const store = memoryStore();
    const s = { ...DEFAULT_SETTINGS, fov: 95, crosshairStyle: 'dot' as const, sensitivity: 0.004 };
    saveSettings(store, s);
    expect(Object.keys(store.data)).toEqual([SETTINGS_KEY]);
    expect(loadSettings(store)).toEqual(s);
  });

  it('wirft nicht bei null-Store', () => {
    expect(() => saveSettings(null, DEFAULT_SETTINGS)).not.toThrow();
  });

  it('wirft nicht, wenn setItem wirft', () => {
    const store: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('Kontingent'); } };
    expect(() => saveSettings(store, DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe('Slider-Abbildung der Empfindlichkeit', () => {
  it('Endpunkte: Minimum -> 0, Maximum -> 100', () => {
    expect(sensitivityToSlider(SENSITIVITY_MIN)).toBe(0);
    expect(sensitivityToSlider(SENSITIVITY_MAX)).toBeCloseTo(100, 9);
    expect(sliderToSensitivity(0)).toBe(SENSITIVITY_MIN);
    expect(sliderToSensitivity(100)).toBeCloseTo(SENSITIVITY_MAX, 12);
    expect(sliderToSensitivity(100)).toBeLessThanOrEqual(SENSITIVITY_MAX);
  });

  it('ist logarithmisch: die Mitte ist das geometrische Mittel', () => {
    expect(sliderToSensitivity(50)).toBeCloseTo(Math.sqrt(SENSITIVITY_MIN * SENSITIVITY_MAX), 12);
  });

  it('Roundtrip Slider -> Empfindlichkeit -> Slider', () => {
    for (let v = 0; v <= 100; v += 0.5) {
      expect(sensitivityToSlider(sliderToSensitivity(v))).toBeCloseTo(v, 7);
    }
  });

  it('Roundtrip Empfindlichkeit -> Slider -> Empfindlichkeit (relativ 1e-9)', () => {
    for (const s of [SENSITIVITY_MIN, 0.0005, 0.001, DEFAULT_SETTINGS.sensitivity, 0.0035, 0.007, 0.011, SENSITIVITY_MAX]) {
      const back = sliderToSensitivity(sensitivityToSlider(s));
      expect(Math.abs(back - s) / s).toBeLessThan(1e-9);
    }
  });

  it('ist streng monoton steigend', () => {
    let prev = -Infinity;
    for (let v = 0; v <= 100; v += 1) {
      const s = sliderToSensitivity(v);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
    prev = -Infinity;
    for (let s = SENSITIVITY_MIN; s <= SENSITIVITY_MAX; s += 0.0002) {
      const v = sensitivityToSlider(s);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('klemmt Werte außerhalb des Bereichs', () => {
    expect(sensitivityToSlider(0)).toBe(0);
    expect(sensitivityToSlider(1)).toBeCloseTo(100, 9);
    expect(sliderToSensitivity(-50)).toBe(SENSITIVITY_MIN);
    expect(sliderToSensitivity(500)).toBeLessThanOrEqual(SENSITIVITY_MAX);
    expect(sliderToSensitivity(500)).toBeCloseTo(SENSITIVITY_MAX, 12);
  });

  it('behandelt NaN mit dem Standardwert', () => {
    expect(sensitivityToSlider(NaN)).toBeCloseTo(sensitivityToSlider(DEFAULT_SETTINGS.sensitivity), 12);
    expect(sliderToSensitivity(NaN)).toBeCloseTo(DEFAULT_SETTINGS.sensitivity, 12);
  });

  it('der Standardwert liegt strikt zwischen den Endpunkten', () => {
    const v = sensitivityToSlider(DEFAULT_SETTINGS.sensitivity);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(100);
  });
});

describe('formatSensitivity', () => {
  it('zeigt den Standard als 1.00×', () => {
    expect(formatSensitivity(DEFAULT_SETTINGS.sensitivity)).toBe('1.00×');
  });

  it('zeigt Vielfache des Standards', () => {
    expect(formatSensitivity(0.0044)).toBe('2.00×');
    expect(formatSensitivity(0.0011)).toBe('0.50×');
  });

  it('klemmt und behandelt NaN', () => {
    expect(formatSensitivity(NaN)).toBe('1.00×');
    expect(formatSensitivity(100)).toBe(`${(SENSITIVITY_MAX / DEFAULT_SETTINGS.sensitivity).toFixed(2)}×`);
  });
});
