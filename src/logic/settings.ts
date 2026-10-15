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
  /** Menümusik-Lautstärke 0..1. */
  musicVolume: number;
  /** Menümusik stumm (Lautsprecher-Knopf im Menü). */
  musicMuted: boolean;
  /** HUD-Skalierung relativ zur automatischen Bildschirmanpassung (0.75..1.5). */
  hudScale: number;
  /** Fadenkreuz: Abstand der Linien zur Mitte in px (ohne Streuung). */
  crosshairGap: number;
  /** Fadenkreuz: Linienstärke in px. */
  crosshairThickness: number;
  /** Fadenkreuz öffnet sich mit der Streuung (dynamisch wie in CS 1.6). */
  crosshairDynamic: boolean;
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
  musicVolume: 0.5,
  musicMuted: false,
  hudScale: 1,
  crosshairGap: 3,
  crosshairThickness: 2,
  crosshairDynamic: true,
};

export const SENSITIVITY_MIN = 0.0004;
export const SENSITIVITY_MAX = 0.012;
export const FOV_MIN = 60;
export const FOV_MAX = 110;
export const CROSSHAIR_SIZE_MIN = 3;
export const CROSSHAIR_SIZE_MAX = 20;
export const CROSSHAIR_GAP_MIN = 0;
export const CROSSHAIR_GAP_MAX = 12;
export const CROSSHAIR_THICKNESS_MIN = 1;
export const CROSSHAIR_THICKNESS_MAX = 4;
export const HUD_SCALE_MIN = 0.75;
export const HUD_SCALE_MAX = 1.5;

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
    musicVolume: num(r.musicVolume, d.musicVolume, 0, 1),
    musicMuted: bool(r.musicMuted, d.musicMuted),
    hudScale: num(r.hudScale, d.hudScale, HUD_SCALE_MIN, HUD_SCALE_MAX),
    crosshairGap: num(r.crosshairGap, d.crosshairGap, CROSSHAIR_GAP_MIN, CROSSHAIR_GAP_MAX),
    crosshairThickness: num(r.crosshairThickness, d.crosshairThickness, CROSSHAIR_THICKNESS_MIN, CROSSHAIR_THICKNESS_MAX),
    crosshairDynamic: bool(r.crosshairDynamic, d.crosshairDynamic),
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
