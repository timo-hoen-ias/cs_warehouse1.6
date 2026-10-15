import { mulberry32 } from '../logic/rng';
import { renderOverview, type Raster } from '../logic/overview';
import { loadMapData } from '../maps';

/** Karteneintrag, wie ihn die Registry liefert — Vorschau-/Radar-Bild optional (später). */
export type MapLike = { id: string; name: string; description: string; radar?: unknown; preview?: unknown };

/** Bild-URL der Karte, falls die Registry eine liefert (nur relative/https-Pfade). */
export function mapImage(m: MapLike): string | null {
  const v = typeof m.preview === 'string' ? m.preview : typeof m.radar === 'string' ? m.radar : null;
  if (!v) return null;
  return /^(https:\/\/|\.?\/?[\w\-./]+\.(png|jpe?g|webp|svg)$)/i.test(v) ? v : null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Seed je Karte (stabil, z. B. für die Hintergrund-Stimmung). */
export function mapSeed(id: string): number {
  return hash(id) % 1000;
}

/**
 * Stilisierte Radar-Vorschau als Platzhalter (wenn die Karte kein Bild mitbringt):
 * Grundriss mit Regalblöcken, Gassen, Bombenspots A/B und Spawns T/CT —
 * deterministisch aus der Karten-ID.
 */
export function drawMapPreview(canvas: HTMLCanvasElement, m: MapLike): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = canvas.width;
  const h = canvas.height;
  const rnd = mulberry32(hash(m.id));
  const bg = c.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#16202a');
  bg.addColorStop(1, '#0c1117');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  // Raster
  c.strokeStyle = 'rgba(140,180,220,.07)';
  c.lineWidth = 1;
  const g = Math.max(8, Math.round(w / 16));
  for (let x = 0; x < w; x += g) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke(); }
  for (let y = 0; y < h; y += g) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke(); }
  // Hallenumriss
  const pad = w * 0.06;
  c.strokeStyle = 'rgba(200,215,230,.55)';
  c.lineWidth = Math.max(1.5, w / 160);
  c.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  // Regalblöcke in Reihen (Gassen frei lassen)
  const cols = 3 + Math.floor(rnd() * 3);
  const rows = 2 + Math.floor(rnd() * 3);
  const cw = (w - pad * 2) / cols;
  const rh = (h - pad * 2) / rows;
  c.fillStyle = 'rgba(150,170,190,.5)';
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (rnd() < 0.22) continue;
      const vertical = rnd() < 0.5;
      const x0 = pad + i * cw + cw * 0.18;
      const y0 = pad + j * rh + rh * 0.2;
      const bw = cw * 0.64;
      const bh = rh * 0.6;
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        if (vertical) c.fillRect(x0 + (k * bw) / n, y0, Math.max(2, bw / n - bw * 0.12), bh);
        else c.fillRect(x0, y0 + (k * bh) / n, bw, Math.max(2, bh / n - bh * 0.14));
      }
    }
  }
  // Spots und Spawns
  const spot = (x: number, y: number, label: string, color: string, r: number): void => {
    c.fillStyle = color.replace('1)', '.22)');
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = color;
    c.lineWidth = Math.max(1.5, w / 140);
    c.stroke();
    c.fillStyle = color;
    c.font = `800 ${Math.round(r * 1.1)}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'sans-serif'}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, x, y + 1);
  };
  const r = Math.max(8, w * 0.07);
  const aLeft = rnd() < 0.5;
  spot(aLeft ? w * 0.22 : w * 0.78, h * 0.3, 'A', 'rgba(255,110,90,1)', r);
  spot(aLeft ? w * 0.78 : w * 0.22, h * 0.36 + rnd() * h * 0.1, 'B', 'rgba(255,110,90,1)', r);
  spot(w * (0.4 + rnd() * 0.2), h * 0.84, 'T', 'rgba(240,165,58,1)', r * 0.8);
  spot(w * (0.4 + rnd() * 0.2), h * 0.14, 'CT', 'rgba(111,168,255,1)', r * 0.8);
  // Vignette
  const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.55)');
  c.fillStyle = v;
  c.fillRect(0, 0, w, h);
}

const overviewCache = new Map<string, HTMLCanvasElement | null>();

/** Draufsicht der Karte (logic/overview, wie das HUD-Radar) als Canvas; null, wenn die Karte nicht baubar ist. */
function overviewCanvas(id: string): HTMLCanvasElement | null {
  if (overviewCache.has(id)) return overviewCache.get(id)!;
  let cv: HTMLCanvasElement | null = null;
  try {
    const r: Raster = renderOverview(loadMapData(id), { pxPerM: 3, radar: true });
    cv = document.createElement('canvas');
    cv.width = r.w;
    cv.height = r.h;
    cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  } catch {
    cv = null;
  }
  overviewCache.set(id, cv);
  return cv;
}

/** Radar-Draufsicht eingepasst (contain) auf dunklem Raster-Hintergrund. */
function drawOverviewPreview(canvas: HTMLCanvasElement, src: HTMLCanvasElement): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = canvas.width;
  const h = canvas.height;
  const bg = c.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#16202a');
  bg.addColorStop(1, '#0c1117');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(140,180,220,.07)';
  const g = Math.max(8, Math.round(w / 16));
  for (let x = 0; x < w; x += g) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke(); }
  for (let y = 0; y < h; y += g) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke(); }
  const pad = Math.round(Math.min(w, h) * 0.06);
  const k = Math.min((w - pad * 2) / src.width, (h - pad * 2) / src.height);
  const dw = src.width * k;
  const dh = src.height * k;
  c.imageSmoothingEnabled = true;
  c.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Vorschau-Element: Bild aus der Registry, sonst Radar-Draufsicht der Karte, sonst stilisierter Platzhalter. */
export function mapPreviewElement(m: MapLike, w = 320, h = 180): HTMLElement {
  const img = mapImage(m);
  if (img) {
    const el = document.createElement('img');
    el.src = img;
    el.alt = m.name;
    el.loading = 'lazy';
    return el;
  }
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ov = overviewCanvas(m.id);
  if (ov) drawOverviewPreview(cv, ov);
  else drawMapPreview(cv, m);
  return cv;
}
