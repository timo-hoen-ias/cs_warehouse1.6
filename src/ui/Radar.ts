import { radarDots, radarRange, siteLabelState, worldToRadar, clampToEdge, type RadarPlayer, type RadarView } from '../logic/radar';
import type { Raster } from '../logic/overview';

/** Kartenbild fürs Radar je Höhenband (undefined = ganze Karte in einem Bild). */
export type RadarSource = {
  /** Höhenband für eine Fußhöhe (undefined, wenn die Karte keine gestapelten Ebenen hat). */
  bandOf(y: number): number | undefined;
  raster(band: number | undefined): Raster;
  /** Alle Höhenbänder, auf denen man stehen kann (zum Vorrendern im Leerlauf). */
  bands?(): number[];
};

export type RadarSite = { id: 'A' | 'B'; x: number; y: number; z: number };

export type RadarFrame = {
  self: { id: string; x: number; y: number; z: number; yaw: number };
  team: 'T' | 'CT';
  others: readonly RadarPlayer[];
  /** Gegner, die das Team gerade sieht. */
  spotted: (id: string) => boolean;
  /** Bekannte Bombe: gelegt (alle sehen sie) oder liegend (nur T). */
  bomb: { x: number; y: number; z: number; kind: 'planted' | 'dropped' } | null;
  /** Zeit (ms) fürs Blinken. */
  now: number;
};

type Layer = { canvas: HTMLCanvasElement; minX: number; minZ: number; w: number; h: number };

const COLOR = {
  T: '#f0a53a',
  CT: '#6fa8ff',
  enemy: '#ff4a3c',
  siteA: '#ff6a52',
  siteB: '#ffb43a',
  bomb: '#ff3b2b',
  dropped: '#ffd24a',
};

/** Auslegung der Radar-Zeichnung in „Design-Pixeln“ (Radar = 230 × 230, skaliert mit der Canvas-Größe). */
const DESIGN = 230;

/**
 * Radar-Zeichnung (Canvas 2D): dunkles Panel (CSS), vorgerenderte Kartenebene um den Spieler
 * gedreht oder Norden-oben, Bombenspot-Beschriftung, Bombe, Mitspieler/gesichtete Gegner mit
 * Etagenpfeil, eigener Pfeil mit Sichtkegel in der Mitte. Mathematik in `logic/radar.ts`.
 */
export class Radar {
  rotate = true;
  zoom = 1;
  private source: RadarSource | null = null;
  private sites: RadarSite[] = [];
  private readonly layers = new Map<number | 'flat', Layer>();
  /** Noch nicht gerenderte Höhenbänder (werden nacheinander im Leerlauf vorbereitet). */
  private pending: number[] = [];
  private lastPrefetch = 0;

  private canvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement | null, private readonly font: () => string) {
    this.canvas = canvas;
  }

  /** Ziel-Canvas setzen (das HUD hängt es erst beim Einhängen ins DOM an). */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  setSource(src: RadarSource): void {
    this.source = src;
    this.layers.clear();
    this.pending = src.bands?.() ?? [];
  }

  setSites(sites: RadarSite[]): void {
    this.sites = sites;
  }

  /** Karten-Canvas der Ebene (einmal pro Band gerendert, dann zwischengespeichert). */
  private layer(band: number | undefined): Layer | null {
    if (!this.source) return null;
    const key = band ?? 'flat';
    let l = this.layers.get(key);
    if (!l) {
      const r = this.source.raster(band);
      const canvas = document.createElement('canvas');
      canvas.width = r.w;
      canvas.height = r.h;
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
      l = { canvas, minX: r.minX, minZ: r.minZ, w: r.w / r.pxPerM, h: r.h / r.pxPerM };
      this.layers.set(key, l);
    }
    return l;
  }

  draw(f: RadarFrame): void {
    const cv = this.canvas;
    const c = cv?.getContext('2d');
    if (!c || !cv) return;
    const size = cv.width;
    const px = size / DESIGN;
    const view: RadarView = { size, range: radarRange(this.zoom), rotate: this.rotate };
    const me = f.self;
    c.clearRect(0, 0, size, size);

    // 1) Karte: um den Spieler zentriert, optional mit dem Blick gedreht
    const band = this.source?.bandOf(me.y);
    const layer = this.layer(band);
    if (layer) {
      const k = size / 2 / view.range;
      c.save();
      c.translate(size / 2, size / 2);
      c.scale(k, k);
      if (this.rotate) c.rotate(me.yaw);
      c.translate(-me.x, -me.z);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(layer.canvas, layer.minX, layer.minZ, layer.w, layer.h);
      c.restore();
    }

    // 2) Bombenspots: Ring + Buchstabe (nicht mitgedreht)
    this.drawSites(c, me, view, band, px);

    // 3) Bombe
    if (f.bomb) this.drawBomb(c, me, view, f.bomb, f.now, px);

    // 4) Mitspieler und gesichtete Gegner
    for (const d of radarDots(me, f.others, f.team, f.spotted, view, 7 * px)) this.drawDot(c, d, f.now, px);

    // 5) Eigener Pfeil + Sichtkegel
    this.drawSelf(c, me.yaw, size, px);

    // 6) Nächstes Höhenband vorbereiten (höchstens eines je 350 ms, nächstgelegene zuerst) → kein Ruckeln beim Etagenwechsel
    if (this.pending.length && f.now - this.lastPrefetch > 350) {
      this.lastPrefetch = f.now;
      const cur = band ?? 0;
      this.pending.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
      const next = this.pending.shift()!;
      if (!this.layers.has(next)) this.layer(next);
    }
  }

  private drawSites(c: CanvasRenderingContext2D, me: RadarFrame['self'], view: RadarView, band: number | undefined, px: number): void {
    const size = view.size;
    c.font = `800 ${Math.round(17 * px)}px ${this.font()}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const placed: { x: number; y: number }[] = [];
    // eigene Etage zuerst, damit blasse Beschriftungen anderer Etagen nicht darüber liegen
    const order = [...this.sites].sort((a, b) => Number(siteLabelState(b.y, band) === 'same') - Number(siteLabelState(a.y, band) === 'same'));
    for (const s of order) {
      const state = siteLabelState(s.y, band);
      const p = worldToRadar(me.x, me.z, me.yaw, s.x, s.z, view);
      const e = clampToEdge(p.x, p.y, size, 13 * px);
      if (state === 'other' && placed.some((q) => Math.hypot(q.x - e.x, q.y - e.y) < 26 * px)) continue; // B unter A: nicht doppelt
      placed.push(e);
      const col = s.id === 'A' ? COLOR.siteA : COLOR.siteB;
      const a = (state === 'same' ? 1 : 0.38) * (e.clamped ? 0.8 : 1);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(8,12,14,.7)';
      c.beginPath();
      c.arc(e.x, e.y, 12 * px, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 2 * px;
      c.strokeStyle = col;
      c.stroke();
      c.fillStyle = col;
      c.fillText(s.id, e.x, e.y + px);
    }
    c.globalAlpha = 1;
  }

  private drawBomb(c: CanvasRenderingContext2D, me: RadarFrame['self'], view: RadarView, bomb: NonNullable<RadarFrame['bomb']>, now: number, px: number): void {
    const p = worldToRadar(me.x, me.z, me.yaw, bomb.x, bomb.z, view);
    const e = clampToEdge(p.x, p.y, view.size, 9 * px);
    const planted = bomb.kind === 'planted';
    const blink = planted ? Math.floor(now / 350) % 2 === 0 : true;
    if (planted) {
      // pulsierender Ring, auch am Rand erkennbar
      const t = (now % 1000) / 1000;
      c.strokeStyle = `rgba(255,59,43,${0.55 * (1 - t)})`;
      c.lineWidth = 2 * px;
      c.beginPath();
      c.arc(e.x, e.y, (7 + t * 12) * px, 0, Math.PI * 2);
      c.stroke();
    }
    const w = 15 * px;
    const h = 10 * px;
    c.fillStyle = 'rgba(0,0,0,.75)';
    c.fillRect(e.x - w / 2 - px, e.y - h / 2 - px, w + 2 * px, h + 2 * px);
    c.fillStyle = planted ? (blink ? COLOR.bomb : '#ffb3a8') : COLOR.dropped;
    c.fillRect(e.x - w / 2, e.y - h / 2, w, h);
    c.fillStyle = '#1a0806';
    c.fillRect(e.x - 4.5 * px, e.y - 2.5 * px, 9 * px, 5 * px);
    c.fillStyle = planted ? COLOR.bomb : COLOR.dropped;
    c.fillRect(e.x - 3 * px, e.y - px, 2 * px, 2 * px);
    c.fillRect(e.x + px, e.y - px, 2 * px, 2 * px);
  }

  private drawDot(c: CanvasRenderingContext2D, d: ReturnType<typeof radarDots>[number], now: number, px: number): void {
    const col = d.enemy ? COLOR.enemy : COLOR[d.team];
    c.globalAlpha = d.alpha;
    if (d.enemy) {
      // gesichteter Gegner: roter Punkt mit Ring
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      c.strokeStyle = `rgba(255,74,60,${0.35 + 0.3 * pulse})`;
      c.lineWidth = 2 * px;
      c.beginPath();
      c.arc(d.x, d.y, 8 * px, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = col;
    c.strokeStyle = 'rgba(0,0,0,.8)';
    c.lineWidth = 1.6 * px;
    c.beginPath();
    c.arc(d.x, d.y, 4.6 * px, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Blickrichtung (0 = oben)
    c.strokeStyle = col;
    c.lineWidth = 1.8 * px;
    c.beginPath();
    c.moveTo(d.x, d.y);
    c.lineTo(d.x - Math.sin(d.heading) * 10 * px, d.y - Math.cos(d.heading) * 10 * px);
    c.stroke();
    // Etagenpfeil
    if (d.marker) {
      const dir = d.marker === 'up' ? -1 : 1;
      const ax = d.x + 8 * px;
      const ay = d.y + dir * -0.5 * px;
      c.fillStyle = '#fff';
      c.strokeStyle = 'rgba(0,0,0,.85)';
      c.lineWidth = 1.2 * px;
      c.beginPath();
      c.moveTo(ax, ay + dir * 4 * px);
      c.lineTo(ax - 3.4 * px, ay - dir * 2.6 * px);
      c.lineTo(ax + 3.4 * px, ay - dir * 2.6 * px);
      c.closePath();
      c.stroke();
      c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawSelf(c: CanvasRenderingContext2D, yaw: number, size: number, px: number): void {
    const cx = size / 2;
    c.save();
    c.translate(cx, cx);
    // gedrehte Karte: Pfeil zeigt immer nach oben; sonst in Blickrichtung (Norden oben)
    if (!this.rotate) c.rotate(-yaw);
    const reach = size * 0.34;
    const grad = c.createRadialGradient(0, 0, 0, 0, 0, reach);
    grad.addColorStop(0, 'rgba(255,255,255,.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, reach, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    c.closePath();
    c.fill();
    c.fillStyle = '#fff';
    c.strokeStyle = 'rgba(0,0,0,.85)';
    c.lineWidth = 1.6 * px;
    c.beginPath();
    c.moveTo(0, -8.5 * px);
    c.lineTo(-6 * px, 6 * px);
    c.lineTo(0, 3 * px);
    c.lineTo(6 * px, 6 * px);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
