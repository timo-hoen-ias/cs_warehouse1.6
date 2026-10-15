/**
 * Spieler-Einstellungen (framework-frei): Standardwerte, Bereinigung beliebiger
 * Eingaben, Persistenz über ein injiziertes Key-Value-Storage und die
 * logarithmische Slider-Abbildung der Mausempfindlichkeit.
 */

export type CrosshairStyle = 'classic' | 'dot' | 'circle';

export type Settings = {
  /** Radiant pro Mauspixel. */
  sensitivity: number;
  invertY: boolean;
  /** Vertikaler Sichtwinkel in Grad. */
  fov: number;
  /** Gesamtlautstärke 0..1. */
  volume: number;
  /** Kanal Effekte (Schüsse, Schritte, Explosionen) 0..1. */
  volumeEffects: number;
  /** Kanal Umgebung (Hallenbrummen, Wind, Maschinen) 0..1. */
  volumeAmbience: number;
  /** Kanal Oberfläche (Menü, Treffer-Rückmeldung, Rundensignale) 0..1. */
  volumeUi: number;
  /** CSS-Hex '#rrggbb'. */
  crosshairColor: string;
  crosshairStyle: CrosshairStyle;
  /** Linienlänge in px. */
  crosshairSize: number;
  showFps: boolean;
  /** Kopfbewegung (Head-Bob) an/aus. */
  bobbing: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.0022,
  invertY: false,
  fov: 75,
  volume: 0.8,
  volumeEffects: 1,
  volumeAmbience: 0.7,
  volumeUi: 0.8,
  crosshairColor: '#9ff09f',
  crosshairStyle: 'classic',
  crosshairSize: 9,
  showFps: false,
  bobbing: true,
};

export const SENSITIVITY_MIN = 0.0004;
export const SENSITIVITY_MAX = 0.012;
export const FOV_MIN = 60;
export const FOV_MAX = 110;
export const CROSSHAIR_SIZE_MIN = 3;
export const CROSSHAIR_SIZE_MAX = 20;

export const CROSSHAIR_STYLES: readonly CrosshairStyle[] = ['classic', 'dot', 'circle'];

export const SETTINGS_KEY = 'csw16.settings';

export type KeyValueStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function num(v: unknown, def: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

/** Normalisiert '#rrggbb' (beliebige Groß-/Kleinschreibung) auf Kleinbuchstaben, sonst null. */
export function normalizeHexColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

/** Führt unbekannte/teilweise/kaputte Eingaben mit den Standardwerten zusammen und klemmt Zahlen. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const style = CROSSHAIR_STYLES.find((s) => s === r.crosshairStyle) ?? d.crosshairStyle;
  return {
    sensitivity: num(r.sensitivity, d.sensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX),
    invertY: bool(r.invertY, d.invertY),
    fov: num(r.fov, d.fov, FOV_MIN, FOV_MAX),
    volume: num(r.volume, d.volume, 0, 1),
    volumeEffects: num(r.volumeEffects, d.volumeEffects, 0, 1),
    volumeAmbience: num(r.volumeAmbience, d.volumeAmbience, 0, 1),
    volumeUi: num(r.volumeUi, d.volumeUi, 0, 1),
    crosshairColor: normalizeHexColor(r.crosshairColor) ?? d.crosshairColor,
    crosshairStyle: style,
    crosshairSize: num(r.crosshairSize, d.crosshairSize, CROSSHAIR_SIZE_MIN, CROSSHAIR_SIZE_MAX),
    showFps: bool(r.showFps, d.showFps),
    bobbing: bool(r.bobbing, d.bobbing),
  };
}

export function loadSettings(store: KeyValueStore | null): Settings {
  if (!store) return sanitizeSettings(null);
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return sanitizeSettings(null);
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(store: KeyValueStore | null, s: Settings): void {
  if (!store) return;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* privat/blockiert/Kontingent voll */ }
}

const LOG_RANGE = Math.log(SENSITIVITY_MAX / SENSITIVITY_MIN);

/** Empfindlichkeit → Slider 0..100 (logarithmisch zwischen den Klemmgrenzen). */
export function sensitivityToSlider(sens: number): number {
  const s = num(sens, DEFAULT_SETTINGS.sensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX);
  return (Math.log(s / SENSITIVITY_MIN) / LOG_RANGE) * 100;
}

/** Slider 0..100 → Empfindlichkeit (Umkehrung von `sensitivityToSlider`). */
export function sliderToSensitivity(v: number): number {
  const t = num(v, sensitivityToSlider(DEFAULT_SETTINGS.sensitivity), 0, 100) / 100;
  return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, SENSITIVITY_MIN * Math.exp(t * LOG_RANGE)));
}

/** Anzeige-Text relativ zum Standard, z. B. '1.00×' (Standard = 1). */
export function formatSensitivity(sens: number): string {
  const s = num(sens, DEFAULT_SETTINGS.sensitivity, SENSITIVITY_MIN, SENSITIVITY_MAX);
  return `${(s / DEFAULT_SETTINGS.sensitivity).toFixed(2)}×`;
}
