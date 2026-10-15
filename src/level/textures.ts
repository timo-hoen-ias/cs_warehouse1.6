import * as THREE from 'three';
import type { MaterialId } from '../logic/mapkit';
import { mulberry32 } from '../logic/rng';

/**
 * Prozedurale Lager-Texturen (Canvas 2D → CanvasTexture): keine Asset-Downloads,
 * deterministisch, gecacht. Albedo bewusst mittelhell — Farbton (tint) und gebackenes
 * Licht multiplizieren in der Vertexfarbe.
 */
const cache = new Map<string, THREE.CanvasTexture>();
let maxSize = 256;

/** Texturgröße (Grafikstufe „niedrig“ = 128 px). */
export function setTextureQuality(q: 'high' | 'low'): void {
  maxSize = q === 'low' ? 128 : 256;
}

type Draw = (ctx: CanvasRenderingContext2D, s: number, r: () => number) => void;

function make(key: string, draw: Draw, opts: { size?: number; repeat?: boolean; seed?: number } = {}): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const base = opts.size ?? 256;
  const size = maxSize < 256 ? Math.max(64, base / 2) : base;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Zeichnen immer im 256er-Maßstab, damit Details bei kleiner Größe gleich bleiben
  ctx.save();
  ctx.scale(size / 256, size / 256);
  draw(ctx, 256, mulberry32(opts.seed ?? hash(key)));
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noise(ctx: CanvasRenderingContext2D, s: number, r: () => number, n: number, alpha: number, dark = 0, light = 255, size = 3): void {
  for (let i = 0; i < n; i++) {
    const v = dark + Math.floor(r() * (light - dark));
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + r() * 0.6)})`;
    const w = 1 + r() * size;
    ctx.fillRect(r() * s, r() * s, w, w);
  }
}

function blotches(ctx: CanvasRenderingContext2D, s: number, r: () => number, n: number, color: string, maxR: number): void {
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, rad = 6 + r() * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // nahtlos: auch an den gegenüberliegenden Rändern zeichnen
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) ctx.fillRect(x - rad + dx, y - rad + dy, rad * 2, rad * 2);
  }
}

function crack(ctx: CanvasRenderingContext2D, s: number, r: () => number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let x = r() * s, y = r() * s;
  ctx.moveTo(x, y);
  for (let i = 0; i < 8; i++) {
    x += (r() - 0.5) * 30;
    y += (r() - 0.5) * 30;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

const DRAW: Record<MaterialId, Draw> = {
  concrete: (c, s, r) => {
    c.fillStyle = '#8f8d87';
    c.fillRect(0, 0, s, s);
    blotches(c, s, r, 14, 'rgba(70,66,60,0.18)', 40);
    blotches(c, s, r, 8, 'rgba(200,196,186,0.12)', 30);
    noise(c, s, r, 3000, 0.22, 60, 200, 2);
    for (let i = 0; i < 3; i++) crack(c, s, r, 'rgba(40,38,36,0.35)');
    c.fillStyle = 'rgba(40,40,40,0.45)';
    c.fillRect(0, 0, s, 2);
    c.fillRect(0, 0, 2, s);
  },
  concreteDark: (c, s, r) => {
    c.fillStyle = '#5f5e5a';
    c.fillRect(0, 0, s, s);
    blotches(c, s, r, 16, 'rgba(30,28,26,0.25)', 40);
    noise(c, s, r, 3000, 0.25, 30, 140, 2);
    for (let i = 0; i < 4; i++) crack(c, s, r, 'rgba(20,20,20,0.4)');
    c.fillStyle = 'rgba(20,20,20,0.5)';
    c.fillRect(0, 0, s, 2);
  },
  asphalt: (c, s, r) => {
    c.fillStyle = '#4b4a4a';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 9000, 0.35, 20, 160, 1.5);
    blotches(c, s, r, 10, 'rgba(25,24,24,0.3)', 46);
    blotches(c, s, r, 5, 'rgba(120,112,100,0.12)', 50);
    for (let i = 0; i < 3; i++) crack(c, s, r, 'rgba(15,15,15,0.55)');
  },
  paving: (c, s, r) => {
    c.fillStyle = '#7b766d';
    c.fillRect(0, 0, s, s);
    const bw = 32, bh = 16;
    for (let y = 0; y < s; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s + bw; x += bw) {
        const v = 100 + Math.floor(r() * 40);
        c.fillStyle = `rgb(${v + 12},${v + 8},${v})`;
        c.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    noise(c, s, r, 2500, 0.2, 40, 200, 2);
    blotches(c, s, r, 8, 'rgba(50,46,40,0.18)', 40);
  },
  plaster: (c, s, r) => {
    c.fillStyle = '#c4b8a2';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 6000, 0.18, 120, 240, 2);
    blotches(c, s, r, 12, 'rgba(120,100,80,0.15)', 50);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = 'rgba(90,80,70,0.1)';
      const x = r() * s;
      c.fillRect(x, 0, 2 + r() * 4, s);
    }
  },
  brick: (c, s, r) => {
    c.fillStyle = '#6a5b50';
    c.fillRect(0, 0, s, s);
    const bw = 22, bh = 8;
    for (let row = 0; row * bh < s; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s + bw; x += bw) {
        const v = r();
        const R = 118 + v * 34, G = 70 + v * 18, B = 56 + v * 12;
        c.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
        c.fillRect(x + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    noise(c, s, r, 3000, 0.18, 20, 200, 2);
    blotches(c, s, r, 6, 'rgba(30,25,20,0.2)', 60);
  },
  wallPaint: (c, s, r) => {
    c.fillStyle = '#b9bcb8';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 3500, 0.12, 120, 230, 2);
    blotches(c, s, r, 8, 'rgba(90,90,85,0.12)', 50);
  },
  wallTile: (c, s, r) => {
    c.fillStyle = '#9da3a2';
    c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) {
      const v = 205 + Math.floor(r() * 25);
      c.fillStyle = `rgb(${v},${v},${v - 4})`;
      c.fillRect(x + 1, y + 1, 30, 30);
    }
    noise(c, s, r, 1500, 0.1, 100, 200, 2);
  },
  corrugated: (c, s, r) => {
    c.fillStyle = '#9ba3aa';
    c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      const g = c.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.14)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      c.fillStyle = g;
      c.fillRect(x, 0, 16, s);
    }
    for (let i = 0; i < 10; i++) {
      c.fillStyle = `rgba(120,70,40,${0.05 + r() * 0.1})`;
      const x = r() * s;
      c.fillRect(x, r() * s * 0.5, 3, 40 + r() * 120);
    }
    noise(c, s, r, 1200, 0.1, 50, 200, 2);
    c.fillStyle = 'rgba(30,30,30,0.35)';
    c.fillRect(0, 0, s, 2);
  },
  corrugatedDark: (c, s, r) => {
    c.fillStyle = '#5b6570';
    c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x, 0, 5, s);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(x + 8, 0, 3, s);
    }
    noise(c, s, r, 1500, 0.12, 30, 160, 2);
  },
  metal: (c, s, r) => {
    c.fillStyle = '#8b9095';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(255,255,255,${r() * 0.06})`;
      c.fillRect(0, r() * s, s, 1);
    }
    noise(c, s, r, 1500, 0.12, 60, 200, 2);
    blotches(c, s, r, 4, 'rgba(40,40,40,0.15)', 40);
  },
  steel: (c, s, r) => {
    c.fillStyle = '#c9cacb';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 2000, 0.1, 100, 230, 2);
    blotches(c, s, r, 6, 'rgba(60,60,60,0.12)', 30);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(0, 0, s, 3);
    c.fillRect(0, 0, 3, s);
  },
  grating: (c, s) => {
    c.fillStyle = '#2b2d2f';
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#7d8286';
    for (let x = 0; x < s; x += 16) c.fillRect(x, 0, 4, s);
    c.fillStyle = '#676c70';
    for (let y = 0; y < s; y += 32) c.fillRect(0, y, s, 3);
  },
  wood: (c, s, r) => {
    c.fillStyle = '#9b7c55';
    c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      const v = r();
      c.fillStyle = `rgb(${150 + v * 30 | 0},${118 + v * 20 | 0},${78 + v * 15 | 0})`;
      c.fillRect(0, y + 1, s, 30);
      for (let i = 0; i < 6; i++) {
        c.fillStyle = 'rgba(80,55,30,0.25)';
        c.fillRect(0, y + 3 + r() * 26, s, 1);
      }
    }
    noise(c, s, r, 1500, 0.12, 40, 160, 2);
  },
  crate: (c, s, r) => {
    c.fillStyle = '#a5844f';
    c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      c.fillStyle = 'rgba(70,45,20,0.35)';
      c.fillRect(0, y, s, 3);
    }
    noise(c, s, r, 1500, 0.15, 60, 200, 2);
    c.fillStyle = '#6f5430';
    c.fillRect(0, 0, 26, s);
    c.fillRect(s - 26, 0, 26, s);
    c.fillRect(0, 0, s, 26);
    c.fillRect(0, s - 26, s, 26);
    c.strokeStyle = '#5d4426';
    c.lineWidth = 18;
    c.beginPath();
    c.moveTo(26, 26);
    c.lineTo(s - 26, s - 26);
    c.stroke();
    c.fillStyle = 'rgba(30,30,30,0.6)';
    c.font = 'bold 22px Arial';
    c.fillText('FRAGILE', 70, 140);
  },
  pallet: (c, s, r) => {
    c.fillStyle = '#4a3a26';
    c.fillRect(0, 0, s, s);
    for (let x = 6; x < s; x += 46) {
      const v = r();
      c.fillStyle = `rgb(${176 + v * 30 | 0},${140 + v * 20 | 0},${92 + v * 15 | 0})`;
      c.fillRect(x, 0, 34, s);
    }
    noise(c, s, r, 1200, 0.15, 40, 160, 2);
  },
  wrap: (c, s, r) => {
    c.fillStyle = '#d6d0c4';
    c.fillRect(0, 0, s, s);
    // Kartons unter der Folie
    for (let y = 0; y < s; y += 64) for (let x = 0; x < s; x += 85) {
      c.fillStyle = 'rgba(80,60,40,0.35)';
      c.fillRect(x, y, 85, 2);
      c.fillRect(x, y, 2, 64);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(x + 30, y, 12, 64);
    }
    for (let i = 0; i < 30; i++) {
      c.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.12})`;
      c.fillRect(0, r() * s, s, 2 + r() * 5);
    }
  },
  carton: (c, s, r) => {
    c.fillStyle = '#d2c1a0';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 2000, 0.12, 100, 220, 2);
    c.fillStyle = 'rgba(230,220,200,0.8)';
    c.fillRect(s / 2 - 14, 0, 28, s);
    c.fillStyle = 'rgba(60,40,20,0.4)';
    c.fillRect(0, 0, s, 3);
    c.fillRect(0, 0, 3, s);
    c.font = 'bold 18px Arial';
    c.fillStyle = 'rgba(40,40,40,0.55)';
    c.fillText('↑↑', 30, 60);
  },
  hazard: (c, s) => {
    c.fillStyle = '#1b1b1b';
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#e8b51c';
    for (let x = -s; x < s * 2; x += 64) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 32, 0);
      c.lineTo(x + 32 + s, s);
      c.lineTo(x + s, s);
      c.closePath();
      c.fill();
    }
  },
  tile: (c, s, r) => {
    c.fillStyle = '#6f7273';
    c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 64) for (let x = 0; x < s; x += 64) {
      const v = 150 + Math.floor(r() * 25);
      c.fillStyle = `rgb(${v},${v + 2},${v})`;
      c.fillRect(x + 1, y + 1, 62, 62);
    }
    noise(c, s, r, 1500, 0.1, 80, 200, 2);
  },
  roof: (c, s, r) => {
    c.fillStyle = '#7e8790';
    c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 64) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.fillRect(x, 0, 16, s);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(x + 28, 0, 12, s);
    }
    blotches(c, s, r, 10, 'rgba(60,50,40,0.2)', 50);
  },
  container: (c, s, r) => {
    c.fillStyle = '#d8d8d8';
    c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 24) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x, 0, 8, s);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(x + 12, 0, 4, s);
    }
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(110,60,30,${0.08 + r() * 0.16})`;
      c.fillRect(r() * s, r() * s, 3 + r() * 10, 10 + r() * 50);
    }
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 0, s, 8);
    c.fillRect(0, s - 8, s, 8);
  },
  rubber: (c, s, r) => {
    c.fillStyle = '#1e1e1e';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 1500, 0.2, 0, 80, 2);
  },
  cage: (c, s) => {
    c.clearRect(0, 0, s, s);
    c.strokeStyle = '#c3cad0';
    c.lineWidth = 4;
    for (let i = 0; i <= s; i += 32) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, s);
      c.moveTo(0, i);
      c.lineTo(s, i);
      c.stroke();
    }
    c.fillStyle = '#7b848c';
    c.fillRect(0, 0, s, 10);
    c.fillRect(0, s - 10, s, 10);
  },
  server: (c, s) => {
    c.fillStyle = '#18191b';
    c.fillRect(0, 0, s, s);
  },
  door: (c, s, r) => {
    c.fillStyle = '#d0d0d0';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 1500, 0.1, 100, 230, 2);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, 0, s, 4);
    c.fillRect(0, 0, 4, s);
    c.fillRect(s / 2 - 2, 0, 4, s);
    c.fillStyle = 'rgba(40,40,40,0.8)';
    c.fillRect(s * 0.8, s * 0.5, 20, 6);
  },
  gate: (c, s, r) => {
    c.fillStyle = '#c4c8cc';
    c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(0, y, s, 4);
      c.fillStyle = 'rgba(255,255,255,0.15)';
      c.fillRect(0, y + 6, s, 3);
      for (let x = 0; x < s; x += 64) {
        c.fillStyle = 'rgba(0,0,0,0.08)';
        c.fillRect(x + 6, y + 12, 52, 24);
      }
    }
    noise(c, s, r, 800, 0.1, 60, 200, 2);
  },
  epoxy: (c, s, r) => {
    c.fillStyle = '#7d8a83';
    c.fillRect(0, 0, s, s);
    blotches(c, s, r, 10, 'rgba(255,255,255,0.06)', 60);
    blotches(c, s, r, 8, 'rgba(30,40,35,0.12)', 40);
    noise(c, s, r, 1500, 0.08, 80, 200, 2);
  },
  gravel: (c, s, r) => {
    c.fillStyle = '#77716a';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 70 + Math.floor(r() * 110);
      c.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`;
      c.beginPath();
      c.arc(r() * s, r() * s, 1 + r() * 2.5, 0, Math.PI * 2);
      c.fill();
    }
  },
  black: (c, s, r) => {
    c.fillStyle = '#242424';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 800, 0.1, 0, 90, 2);
  },
  white: (c, s, r) => {
    c.fillStyle = '#dedede';
    c.fillRect(0, 0, s, s);
    noise(c, s, r, 1200, 0.08, 150, 255, 2);
  },
  emissive: (c, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, s, s);
  },
  sky: (c, s) => {
    c.fillStyle = '#8ab';
    c.fillRect(0, 0, s, s);
  },
  window: (c, s, r) => {
    // Rahmen + 2×2 Scheiben mit Himmelsspiegelung und Schmutz
    c.fillStyle = '#5d6266';
    c.fillRect(0, 0, s, s);
    const pane = (x: number, y: number, w: number, h: number): void => {
      const g = c.createLinearGradient(x, y, x + w * 0.4, y + h);
      g.addColorStop(0, '#8fa6b8');
      g.addColorStop(0.45, '#3b4a58');
      g.addColorStop(1, '#1f2830');
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      c.moveTo(x + w * 0.1, y + h);
      c.lineTo(x + w * 0.35, y);
      c.lineTo(x + w * 0.5, y);
      c.lineTo(x + w * 0.25, y + h);
      c.closePath();
      c.fill();
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(150,130,100,${r() * 0.12})`;
        c.fillRect(x + r() * w, y + h * (0.6 + r() * 0.4), 2 + r() * 6, 1 + r() * 3);
      }
    };
    pane(12, 12, 108, 108);
    pane(136, 12, 108, 108);
    pane(12, 136, 108, 108);
    pane(136, 136, 108, 108);
  },
  skylight: (c, s, r) => {
    c.fillStyle = '#e8eef2';
    c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 32) {
      c.fillStyle = 'rgba(80,90,100,0.35)';
      c.fillRect(x, 0, 4, s);
    }
    noise(c, s, r, 600, 0.08, 120, 200, 3);
  },
  // Sandwichpaneel (Kühlhaus): vertikale Fugen alle 1.2 m, flache Rippen, Nieten, leichter Reif unten
  panel: (c, s, r) => {
    c.fillStyle = '#d6dfe5';
    c.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fillRect(x + 2, 0, 4, s);
      c.fillStyle = 'rgba(40,60,80,0.07)';
      c.fillRect(x + 9, 0, 3, s);
    }
    for (const x of [0, s / 2]) {
      c.fillStyle = 'rgba(30,45,60,0.55)';
      c.fillRect(x, 0, 3, s);
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.fillRect(x + 3, 0, 2, s);
      for (let y = 10; y < s; y += 64) {
        c.fillStyle = 'rgba(70,80,90,0.7)';
        c.fillRect(x + 6, y, 3, 3);
      }
    }
    blotches(c, s, r, 10, 'rgba(120,150,175,0.14)', 50);
    noise(c, s, r, 1800, 0.1, 150, 255, 2);
    const g = c.createLinearGradient(0, s * 0.8, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.28)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  },
  // Reif/Eis: bläulich-weiß, Kristallstriche, Sprenkel
  frost: (c, s, r) => {
    c.fillStyle = '#c9dde9';
    c.fillRect(0, 0, s, s);
    blotches(c, s, r, 16, 'rgba(255,255,255,0.4)', 50);
    blotches(c, s, r, 10, 'rgba(110,160,200,0.22)', 40);
    c.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const x = r() * s, y = r() * s, a = r() * Math.PI, l = 3 + r() * 11;
      c.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    noise(c, s, r, 3000, 0.3, 200, 255, 2);
  },
  // Kopfsteinpflaster: gerundete Granitköpfe in versetzten Reihen, dunkle Fugen mit Moos/Schmutz
  cobble: (c, s, r) => {
    c.fillStyle = '#4a4640';
    c.fillRect(0, 0, s, s);
    const rows = 8, rh = s / rows;
    for (let row = 0; row < rows; row++) {
      const n = 6 + (row % 3 === 0 ? 1 : 0);
      const cw = s / n;
      const off = row % 2 ? cw / 2 : 0;
      for (let k = -1; k <= n; k++) {
        const cx = k * cw + off + cw / 2 + (r() - 0.5) * 2;
        const cy = row * rh + rh / 2 + (r() - 0.5) * 2;
        const v = 104 + Math.floor(r() * 56);
        const warm = r() < 0.35 ? 10 : 0;
        const rw = cw / 2 - 1.5 - r() * 1.5, rhh = rh / 2 - 1.2 - r() * 1.2;
        const g = c.createRadialGradient(cx - rw * 0.25, cy - rhh * 0.3, 1, cx, cy, Math.max(rw, rhh));
        g.addColorStop(0, `rgb(${v + 22 + warm},${v + 18},${v + 8})`);
        g.addColorStop(1, `rgb(${v - 18 + warm},${v - 20},${v - 28})`);
        c.fillStyle = g;
        for (const dx of [-s, 0, s]) {
          c.beginPath();
          c.ellipse(cx + dx, cy, rw, rhh, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    blotches(c, s, r, 7, 'rgba(60,70,40,0.16)', 36);
    blotches(c, s, r, 6, 'rgba(30,26,22,0.18)', 40);
    noise(c, s, r, 1200, 0.14, 40, 190, 2);
  },
  // Kanalwasser (Fleet): dunkles Blaugrün, helle Wellenstriche, Algenflecken
  water: (c, s, r) => {
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#2c4a4a');
    g.addColorStop(1, '#1f3a40');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    blotches(c, s, r, 12, 'rgba(70,100,60,0.22)', 46);
    blotches(c, s, r, 8, 'rgba(10,20,24,0.3)', 40);
    c.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = r() * s, y = r() * s, l = 14 + r() * 34;
      c.strokeStyle = `rgba(190,215,215,${0.07 + r() * 0.16})`;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + l / 2, y - 3 - r() * 3, x + l, y);
      c.stroke();
    }
    noise(c, s, r, 900, 0.1, 80, 200, 2);
  },
  // Jutesack: grobes Gewebe, Naht und Aufdruck-Andeutung
  sack: (c, s, r) => {
    c.fillStyle = '#b79c6a';
    c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      c.fillStyle = `rgba(90,66,34,${0.1 + r() * 0.12})`;
      c.fillRect(0, y, s, 1);
    }
    for (let x = 0; x < s; x += 4) {
      c.fillStyle = `rgba(250,230,180,${0.05 + r() * 0.1})`;
      c.fillRect(x, 0, 1, s);
    }
    blotches(c, s, r, 10, 'rgba(70,50,28,0.18)', 40);
    // Aufdruck (verwaschenes Rechteck + Streifen) und Heftnaht
    c.fillStyle = 'rgba(120,36,28,0.55)';
    c.fillRect(s * 0.18, s * 0.34, s * 0.64, s * 0.2);
    c.fillStyle = 'rgba(235,222,190,0.6)';
    c.fillRect(s * 0.22, s * 0.4, s * 0.56, s * 0.04);
    c.fillStyle = 'rgba(60,44,26,0.5)';
    c.fillRect(0, 0, s, 6);
    noise(c, s, r, 1500, 0.12, 60, 200, 1.5);
  },
  vent: (c, s) => {
    c.fillStyle = '#8a9096';
    c.fillRect(0, 0, s, s);
    for (let y = 10; y < s; y += 18) {
      c.fillStyle = '#2a2e32';
      c.fillRect(12, y, s - 24, 9);
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.fillRect(12, y + 9, s - 24, 2);
    }
  },
};

/** Textur eines Render-Materials. */
export function materialTexture(mat: MaterialId): THREE.CanvasTexture {
  return make('mat-' + mat, DRAW[mat], { size: mat === 'cage' || mat === 'grating' ? 128 : 256 });
}

/** Serverschrank-Front: perforierte Tür, Einschübe, Status-LEDs. */
export function serverFrontTexture(): THREE.CanvasTexture {
  return make('server-front', (c, s, r) => {
    c.fillStyle = '#121315';
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#26282c';
    c.fillRect(16, 8, s - 32, s - 16);
    for (let y = 14; y < s - 14; y += 11) {
      c.fillStyle = '#34373c';
      c.fillRect(20, y, s - 40, 8);
      for (let x = 26; x < s - 30; x += 6) {
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(x, y + 2, 3, 4);
      }
    }
    c.fillStyle = '#9aa0a8';
    c.fillRect(s - 26, s / 2 - 20, 5, 40);
    void r;
  }, { repeat: false });
}

/** LED-Leiste (additiv über die Serverfront gelegt). */
export function serverLedTexture(): THREE.CanvasTexture {
  return make('server-leds', (c, s, r) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, s, s);
    for (let y = 14; y < s - 14; y += 11) {
      for (let k = 0; k < 4; k++) {
        if (r() < 0.25) continue;
        const col = r() < 0.7 ? '#33ff77' : r() < 0.6 ? '#33aaff' : '#ffaa22';
        c.fillStyle = col;
        c.fillRect(30 + k * 9 + r() * 4, y + 2, 4, 3);
      }
    }
  }, { repeat: false });
}

/** Schild: dunkler Grund, farbiger Rahmen, Text + optionale Unterzeile. */
export function signTexture(text: string, color: string, bg = '#16191d', sub?: string): THREE.CanvasTexture {
  return make(`sign-${text}-${color}-${bg}-${sub ?? ''}`, (c, s) => {
    const h = s / 2;
    c.clearRect(0, 0, s, s);
    c.fillStyle = bg;
    c.fillRect(0, 0, s, h);
    c.strokeStyle = color;
    c.lineWidth = 6;
    c.strokeRect(5, 5, s - 10, h - 10);
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let size = sub ? 52 : 70;
    c.font = `bold ${size}px Arial`;
    while (c.measureText(text).width > s - 30 && size > 12) {
      size -= 2;
      c.font = `bold ${size}px Arial`;
    }
    c.fillText(text, s / 2, sub ? h * 0.42 : h / 2 + 3);
    if (sub) {
      // Unterzeile verkleinern, bis sie ins Schild passt
      let subSize = 22;
      c.font = `bold ${subSize}px Arial`;
      while (c.measureText(sub).width > s - 30 && subSize > 9) {
        subSize -= 1;
        c.font = `bold ${subSize}px Arial`;
      }
      c.fillStyle = 'rgba(230,230,230,0.85)';
      c.fillText(sub, s / 2, h * 0.78);
    }
  }, { repeat: false, size: 512 });
}

/** Bodenmarkierungen (transparente Decals). */
export function decalTexture(kind: string, text = ''): THREE.CanvasTexture {
  return make(`decal-${kind}-${text}`, (c, s, r) => {
    c.clearRect(0, 0, s, s);
    switch (kind) {
      case 'letter':
        c.strokeStyle = '#ffffff';
        c.lineWidth = 12;
        c.beginPath();
        c.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = '#ffffff';
        c.font = 'bold 150px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, s / 2, s / 2 + 6);
        break;
      case 'stripes':
        c.fillStyle = '#e8b51c';
        for (let x = -s; x < s * 2; x += 48) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x + 24, 0);
          c.lineTo(x + 24 + s, s);
          c.lineTo(x + s, s);
          c.closePath();
          c.fill();
        }
        break;
      case 'grid':
        c.strokeStyle = 'rgba(255,255,255,0.25)';
        c.lineWidth = 2;
        for (let i = 0; i <= s; i += 32) {
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, s);
          c.moveTo(0, i);
          c.lineTo(s, i);
          c.stroke();
        }
        break;
      case 'stain': {
        for (let i = 0; i < 6; i++) {
          const x = s / 2 + (r() - 0.5) * s * 0.4, y = s / 2 + (r() - 0.5) * s * 0.4, rad = s * (0.15 + r() * 0.2);
          const g = c.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, 'rgba(20,18,15,0.45)');
          g.addColorStop(1, 'rgba(20,18,15,0)');
          c.fillStyle = g;
          c.fillRect(0, 0, s, s);
        }
        break;
      }
      case 'frost': {
        // Reif-/Eisfleck: weiche weiße Flecken mit Kristallstrichen
        for (let i = 0; i < 9; i++) {
          const x = s / 2 + (r() - 0.5) * s * 0.5, y = s / 2 + (r() - 0.5) * s * 0.5, rad = s * (0.12 + r() * 0.22);
          const g = c.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, 'rgba(235,246,255,0.75)');
          g.addColorStop(1, 'rgba(235,246,255,0)');
          c.fillStyle = g;
          c.fillRect(0, 0, s, s);
        }
        c.lineWidth = 1;
        for (let i = 0; i < 90; i++) {
          const a = r() * Math.PI * 2, d = r() * s * 0.4, x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, b = r() * Math.PI, l = 3 + r() * 9;
          c.strokeStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l);
          c.stroke();
        }
        break;
      }
      case 'arrow':
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(s / 2, 10);
        c.lineTo(s - 30, s * 0.45);
        c.lineTo(s * 0.62, s * 0.45);
        c.lineTo(s * 0.62, s - 10);
        c.lineTo(s * 0.38, s - 10);
        c.lineTo(s * 0.38, s * 0.45);
        c.lineTo(30, s * 0.45);
        c.closePath();
        c.fill();
        break;
      default:
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, s, s);
    }
  }, { repeat: false });
}

/** Weicher Lichtkegel/Leuchthof (radialer Verlauf). */
export function glowTexture(): THREE.CanvasTexture {
  return make('glow', (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  }, { repeat: false, size: 128 });
}
