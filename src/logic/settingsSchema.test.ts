import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import { SETTINGS_SECTIONS, allControls, applyControl, controlFromSlider, controlToSlider, percentControl, type RangeControl } from './settingsSchema';

describe('SETTINGS_SECTIONS', () => {
  it('jeder Regler zeigt auf ein existierendes Feld mit passendem Typ', () => {
    for (const c of allControls()) {
      const v = (DEFAULT_SETTINGS as Record<string, unknown>)[c.key];
      expect(v, c.key).not.toBeUndefined();
      if (c.kind === 'range') expect(typeof v).toBe('number');
      if (c.kind === 'toggle') expect(typeof v).toBe('boolean');
      if (c.kind === 'select' || c.kind === 'color') expect(typeof v).toBe('string');
    }
  });

  it('jedes Feld kommt höchstens einmal vor und Abschnitts-IDs sind eindeutig', () => {
    const keys = allControls().map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('deckt alle Einstellungen ab (nichts fällt aus dem Menü)', () => {
    const keys = new Set(allControls().map((c) => c.key));
    for (const k of Object.keys(DEFAULT_SETTINGS)) expect(keys.has(k as never), k).toBe(true);
  });

  it('Standardwerte liegen innerhalb der Regelbereiche und überleben den Roundtrip', () => {
    for (const c of allControls()) {
      if (c.kind !== 'range') continue;
      const v = DEFAULT_SETTINGS[c.key];
      const slider = controlToSlider(c, v);
      expect(slider, c.key).toBeGreaterThanOrEqual(c.min);
      expect(slider, c.key).toBeLessThanOrEqual(c.max);
      expect(controlFromSlider(c, slider)).toBeCloseTo(v, 6);
    }
  });

  it('Auswahllisten enthalten den Standardwert', () => {
    for (const c of allControls()) {
      if (c.kind !== 'select') continue;
      expect(c.options.map((o) => o.value)).toContain(DEFAULT_SETTINGS[c.key]);
    }
  });

  it('jeder Regler formatiert seinen Standardwert als nicht-leeren Text', () => {
    for (const c of allControls()) if (c.kind === 'range') expect(c.format(DEFAULT_SETTINGS[c.key]).length).toBeGreaterThan(0);
  });
});

describe('Regler-Abbildung', () => {
  const vol = percentControl('volume', 'Test');

  it('Prozent-Regler bildet 0..1 auf 0..100 ab', () => {
    expect(controlToSlider(vol, 0.7)).toBe(70);
    expect(controlFromSlider(vol, 35)).toBe(0.35);
    expect(vol.format(0.256)).toBe('26 %');
  });

  it('klemmt Slider-Werte und behandelt NaN', () => {
    expect(controlFromSlider(vol, 250)).toBe(1);
    expect(controlFromSlider(vol, -3)).toBe(0);
    expect(controlFromSlider(vol, NaN)).toBe(0);
  });

  it('identische Abbildung ohne eigene Funktionen', () => {
    const fov = allControls().find((c) => c.key === 'fov') as RangeControl;
    expect(controlToSlider(fov, 90)).toBe(90);
    expect(controlFromSlider(fov, 90)).toBe(90);
  });
});

describe('applyControl', () => {
  it('ändert nur das betroffene Feld und liefert eine Kopie', () => {
    const fov = allControls().find((c) => c.key === 'fov')!;
    const s = applyControl(DEFAULT_SETTINGS, fov, '100');
    expect(s.fov).toBe(100);
    expect(s).not.toBe(DEFAULT_SETTINGS);
    expect({ ...s, fov: DEFAULT_SETTINGS.fov }).toEqual(DEFAULT_SETTINGS);
  });

  it('setzt Schalter, Auswahl und Farbe; Ergebnis bleibt nach Bereinigung gültig', () => {
    const find = (k: string) => allControls().find((c) => c.key === k)!;
    let s = applyControl(DEFAULT_SETTINGS, find('invertY'), true);
    s = applyControl(s, find('crosshairStyle'), 'dot');
    s = applyControl(s, find('crosshairColor'), '#ABCDEF');
    s = applyControl(s, find('musicMuted'), 'true');
    const clean = sanitizeSettings(s);
    expect(clean).toMatchObject({ invertY: true, crosshairStyle: 'dot', crosshairColor: '#abcdef', musicMuted: true });
  });

  it('Empfindlichkeit läuft logarithmisch über den Slider', () => {
    const sens = allControls().find((c) => c.key === 'sensitivity')!;
    const lo = applyControl(DEFAULT_SETTINGS, sens, '0').sensitivity;
    const hi = applyControl(DEFAULT_SETTINGS, sens, '100').sensitivity;
    const mid = applyControl(DEFAULT_SETTINGS, sens, '50').sensitivity;
    expect(mid).toBeCloseTo(Math.sqrt(lo * hi), 9);
  });
});
