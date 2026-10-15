import {
  CROSSHAIR_GAP_MAX,
  CROSSHAIR_GAP_MIN,
  CROSSHAIR_SIZE_MAX,
  CROSSHAIR_SIZE_MIN,
  CROSSHAIR_THICKNESS_MAX,
  CROSSHAIR_THICKNESS_MIN,
  FOV_MAX,
  FOV_MIN,
  HUD_SCALE_MAX,
  HUD_SCALE_MIN,
  formatSensitivity,
  sensitivityToSlider,
  sliderToSensitivity,
  type Settings,
} from './settings';

/**
 * Datengetriebene Beschreibung des Einstellungsmenüs (framework-frei): Abschnitte
 * mit Reglern, Schaltern, Auswahllisten und Farbwählern. Das DOM-Menü
 * (`ui/SettingsMenu.ts`) rendert nur diese Tabelle — ein neuer Regler (z. B. eine
 * weitere Lautstärke-Kategorie) ist ein Eintrag hier plus ein Feld in `settings.ts`.
 */

type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
export type NumericSettingKey = KeysOfType<Settings, number>;
export type BooleanSettingKey = KeysOfType<Settings, boolean>;
export type StringSettingKey = KeysOfType<Settings, string>;

export type RangeControl = {
  kind: 'range';
  key: NumericSettingKey;
  label: string;
  /** Regler-Bereich (Slider-Einheiten). */
  min: number;
  max: number;
  step: number;
  /** Einstellungswert → Slider (Standard: identisch). */
  toSlider?: (v: number) => number;
  /** Slider → Einstellungswert (Standard: identisch). */
  fromSlider?: (v: number) => number;
  /** Anzeige des aktuellen Werts. */
  format: (v: number) => string;
  hint?: string;
};

export type ToggleControl = { kind: 'toggle'; key: BooleanSettingKey; label: string; hint?: string };
export type SelectControl = { kind: 'select'; key: StringSettingKey; label: string; options: { value: string; label: string }[]; hint?: string };
export type ColorControl = { kind: 'color'; key: StringSettingKey; label: string; swatches: string[]; hint?: string };

export type SettingControl = RangeControl | ToggleControl | SelectControl | ColorControl;

export type SettingsSection = { id: string; title: string; controls: SettingControl[] };

const percent = (v: number): string => `${Math.round(v * 100)} %`;
const toPercent = (v: number): number => Math.round(v * 100);
const fromPercent = (v: number): number => v / 100;

/** Prozent-Regler (Wert 0..1, Slider 0..100). */
export function percentControl(key: NumericSettingKey, label: string, hint?: string): RangeControl {
  return { kind: 'range', key, label, min: 0, max: 100, step: 1, toSlider: toPercent, fromSlider: fromPercent, format: percent, hint };
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'mouse',
    title: 'Maus & Sicht',
    controls: [
      {
        kind: 'range', key: 'sensitivity', label: 'Mausempfindlichkeit', min: 0, max: 100, step: 0.1,
        toSlider: sensitivityToSlider, fromSlider: sliderToSensitivity, format: formatSensitivity,
        hint: 'Logarithmisch, 1.00× = Standard',
      },
      { kind: 'toggle', key: 'invertY', label: 'Maus Y invertieren' },
      { kind: 'range', key: 'fov', label: 'Sichtfeld (vertikal)', min: FOV_MIN, max: FOV_MAX, step: 1, format: (v) => `${Math.round(v)}°` },
      { kind: 'toggle', key: 'bobbing', label: 'Kopfbewegung beim Laufen' },
    ],
  },
  {
    id: 'audio',
    title: 'Ton',
    controls: [
      percentControl('volume', 'Gesamtlautstärke'),
      percentControl('volumeEffects', 'Effekte', 'Schüsse, Schritte, Explosionen'),
      percentControl('volumeAmbience', 'Umgebung', 'Hallenbrummen, Wind, Maschinen'),
      percentControl('volumeUi', 'Oberfläche', 'Menü, Treffer-Rückmeldung, Rundensignale'),
      percentControl('musicVolume', 'Menümusik'),
      { kind: 'toggle', key: 'musicMuted', label: 'Menümusik stumm' },
    ],
  },
  {
    id: 'crosshair',
    title: 'Fadenkreuz',
    controls: [
      {
        kind: 'select', key: 'crosshairStyle', label: 'Stil',
        options: [{ value: 'classic', label: 'Klassisch' }, { value: 'dot', label: 'Punkt' }, { value: 'circle', label: 'Kreis' }],
      },
      { kind: 'color', key: 'crosshairColor', label: 'Farbe', swatches: ['#9ff09f', '#50ff50', '#ffff40', '#40ffff', '#ff60ff', '#ffffff', '#ff4040'] },
      { kind: 'range', key: 'crosshairSize', label: 'Linienlänge', min: CROSSHAIR_SIZE_MIN, max: CROSSHAIR_SIZE_MAX, step: 1, format: (v) => `${Math.round(v)} px` },
      { kind: 'range', key: 'crosshairGap', label: 'Abstand zur Mitte', min: CROSSHAIR_GAP_MIN, max: CROSSHAIR_GAP_MAX, step: 1, format: (v) => `${Math.round(v)} px` },
      { kind: 'range', key: 'crosshairThickness', label: 'Linienstärke', min: CROSSHAIR_THICKNESS_MIN, max: CROSSHAIR_THICKNESS_MAX, step: 1, format: (v) => `${Math.round(v)} px` },
      { kind: 'toggle', key: 'crosshairDynamic', label: 'Dynamisch (öffnet sich mit der Streuung)' },
    ],
  },
  {
    id: 'hud',
    title: 'HUD & Anzeige',
    controls: [
      {
        kind: 'range', key: 'hudScale', label: 'HUD-Größe', min: HUD_SCALE_MIN * 100, max: HUD_SCALE_MAX * 100, step: 5,
        toSlider: toPercent, fromSlider: fromPercent, format: percent,
        hint: 'Relativ zur automatischen Anpassung an die Bildschirmgröße',
      },
      { kind: 'toggle', key: 'showFps', label: 'FPS anzeigen' },
    ],
  },
];

/** Alle Regler in Menü-Reihenfolge. */
export function allControls(sections: SettingsSection[] = SETTINGS_SECTIONS): SettingControl[] {
  return sections.flatMap((s) => s.controls);
}

/** Slider-Position eines Einstellungswerts. */
export function controlToSlider(c: RangeControl, value: number): number {
  return c.toSlider ? c.toSlider(value) : value;
}

/** Einstellungswert aus einer Slider-Position (auf den Regelbereich geklemmt). */
export function controlFromSlider(c: RangeControl, slider: number): number {
  const v = Math.min(c.max, Math.max(c.min, Number.isFinite(slider) ? slider : c.min));
  return c.fromSlider ? c.fromSlider(v) : v;
}

/** Wendet eine Regler-Eingabe (Rohwert aus dem DOM) auf eine Kopie der Einstellungen an. */
export function applyControl(s: Settings, c: SettingControl, raw: string | boolean): Settings {
  const next = { ...s } as Record<string, unknown>;
  switch (c.kind) {
    case 'range': next[c.key] = controlFromSlider(c, Number(raw)); break;
    case 'toggle': next[c.key] = raw === true || raw === 'true'; break;
    case 'select': next[c.key] = String(raw); break;
    case 'color': next[c.key] = String(raw); break;
  }
  return next as Settings;
}
