/**
 * UI-Skalierung (framework-frei): Das HUD ist für eine Referenz-Auflösung von
 * 1920×1080 entworfen und wird über eine CSS-Variable (`--u` = px pro Design-Pixel)
 * skaliert. Maßgeblich ist die kleinere Achse, damit Ultrawide nicht aufbläht;
 * Grenzen verhindern Mini-HUDs auf kleinen und Riesen-HUDs auf 8K-Displays.
 */

export const UI_REF_WIDTH = 1920;
export const UI_REF_HEIGHT = 1080;
export const UI_SCALE_MIN = 0.6;
export const UI_SCALE_MAX = 2.4;
/** Breitestes Seitenverhältnis, über das sich das HUD ausdehnt (≈21:9 inkl. 3440×1440); Super-Ultrawide bekommt Ränder. */
export const HUD_MAX_ASPECT = 2.4;

function finite(v: number, def: number): number {
  return Number.isFinite(v) ? v : def;
}

/**
 * Skalierungsfaktor fürs HUD: min(Breite/1920, Höhe/1080), geklemmt, mal Nutzerfaktor
 * (Einstellung `hudScale`). Auf 3 Nachkommastellen gerundet (stabile CSS-Werte).
 */
export function computeUiScale(width: number, height: number, userScale = 1): number {
  const w = Math.max(1, finite(width, UI_REF_WIDTH));
  const h = Math.max(1, finite(height, UI_REF_HEIGHT));
  const base = Math.min(w / UI_REF_WIDTH, h / UI_REF_HEIGHT);
  const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, base));
  const user = Math.min(1.5, Math.max(0.75, finite(userScale, 1)));
  return Math.round(clamped * user * 1000) / 1000;
}

/**
 * Seitliche Einrückung (px je Seite), damit HUD-Elemente auf sehr breiten
 * Monitoren (32:9) nicht in die Augenwinkel rutschen. 0 bis 21:9.
 */
export function hudSideInset(width: number, height: number, maxAspect = HUD_MAX_ASPECT): number {
  const w = Math.max(0, finite(width, 0));
  const h = Math.max(0, finite(height, 0));
  if (h === 0) return 0;
  const maxW = h * maxAspect;
  return w > maxW ? Math.round((w - maxW) / 2) : 0;
}

/**
 * Pixelgröße eines Canvas für gestochen scharfe Darstellung: CSS-Größe × Gerätepixel-
 * verhältnis, gedeckelt (Speicher), mindestens 1.
 */
export function canvasPixels(cssSize: number, devicePixelRatio: number, max = 1024): number {
  const dpr = Math.min(3, Math.max(1, finite(devicePixelRatio, 1)));
  return Math.max(1, Math.min(max, Math.round(Math.max(0, finite(cssSize, 0)) * dpr)));
}
