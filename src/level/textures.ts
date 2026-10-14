import * as THREE from 'three';

/**
 * Prozedurale Lager-Texturen (Canvas 2D → CanvasTexture): keine Asset-Downloads,
 * deterministisch, klein. Alle Funktionen cachen ihr Ergebnis.
 */
const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = true): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Kleiner deterministischer Zufall für Rauschen. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Betonboden: graues Rauschen + Fugenraster (1 Kachel = 2×2 m). */
export function floorTexture(): THREE.CanvasTexture {
  return make('floor', 256, (ctx, s) => {
    const r = rng(11);
    ctx.fillStyle = '#4a4e55';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 60 + Math.floor(r() * 40);
      ctx.fillStyle = `rgba(${v},${v + 2},${v + 6},0.35)`;
      ctx.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
    }
    ctx.strokeStyle = 'rgba(20,22,26,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  });
}

/** Wellblech-Wand mit Warnstreifen unten (1 Kachel = 4 m breit, volle Höhe). */
export function wallTexture(): THREE.CanvasTexture {
  return make('wall', 256, (ctx, s) => {
    ctx.fillStyle = '#5c6670';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, 0, 6, s);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 9, 0, 3, s);
    }
    // Sockel + Warnband
    ctx.fillStyle = '#2d3136';
    ctx.fillRect(0, s - 26, s, 26);
    for (let x = -20; x < s; x += 24) {
      ctx.fillStyle = '#d9b400';
      ctx.beginPath();
      ctx.moveTo(x, s - 26);
      ctx.lineTo(x + 12, s - 26);
      ctx.lineTo(x + 24, s - 14);
      ctx.lineTo(x + 12, s - 14);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/** Hochregal-Front: orange Steher, Traversen, Kartons/Paletten in den Fächern (1 Kachel = 1 Fach). */
export function rackTexture(): THREE.CanvasTexture {
  return make('rack', 256, (ctx, s) => {
    const r = rng(23);
    ctx.fillStyle = '#23272d';
    ctx.fillRect(0, 0, s, s);
    // Kartons (2–3 pro Fach)
    const n = 2 + Math.floor(r() * 2);
    const w = (s - 40) / n;
    for (let i = 0; i < n; i++) {
      const h = s * (0.45 + r() * 0.35);
      const shade = 120 + Math.floor(r() * 60);
      ctx.fillStyle = `rgb(${shade},${shade - 35},${shade - 70})`;
      ctx.fillRect(20 + i * w + 3, s - 22 - h, w - 6, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(20 + i * w + 3, s - 22 - h, w - 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(20 + i * w + 8, s - 22 - h * 0.6, w * 0.4, 10);
    }
    // Palette unten
    ctx.fillStyle = '#8a6a3c';
    ctx.fillRect(16, s - 22, s - 32, 8);
    ctx.fillStyle = '#6f5430';
    for (let x = 20; x < s - 20; x += 22) ctx.fillRect(x, s - 14, 10, 10);
    // Traverse (Querbalken) + Steher
    ctx.fillStyle = '#e8601c';
    ctx.fillRect(0, s - 6, s, 6);
    ctx.fillRect(0, 0, s, 4);
    ctx.fillStyle = '#2f5fb3';
    ctx.fillRect(0, 0, 12, s);
    ctx.fillRect(s - 12, 0, 12, s);
  });
}

/** Flächen-/Blocklager: Palette mit Folie/Kartons von oben und Seite (1 Kachel = 1 m). */
export function palletTexture(): THREE.CanvasTexture {
  return make('pallet', 128, (ctx, s) => {
    const r = rng(5);
    ctx.fillStyle = '#7a6a4a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3; i++) {
      const shade = 150 + Math.floor(r() * 50);
      ctx.fillStyle = `rgb(${shade},${shade - 30},${shade - 65})`;
      ctx.fillRect(6 + i * 40, 6, 34, s - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(6 + i * 40, 6, 34, 5);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  });
}

/** Holzkiste. */
export function crateTexture(): THREE.CanvasTexture {
  return make('crate', 128, (ctx, s) => {
    ctx.fillStyle = '#9c7a48';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < s; y += 22) ctx.fillRect(0, y, s, 3);
    ctx.fillStyle = '#6b5131';
    ctx.fillRect(0, 0, 12, s);
    ctx.fillRect(s - 12, 0, 12, s);
    ctx.fillRect(0, 0, s, 12);
    ctx.fillRect(0, s - 12, s, 12);
    ctx.strokeStyle = '#4d3a22';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(12, 12);
    ctx.lineTo(s - 12, s - 12);
    ctx.stroke();
  });
}

/** Gitterbox (Drahtgitter auf Stahl). */
export function cageTexture(): THREE.CanvasTexture {
  return make('cage', 128, (ctx, s) => {
    ctx.fillStyle = '#5a6168';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#aab2ba';
    ctx.lineWidth = 2;
    for (let i = 0; i <= s; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a4046';
    ctx.fillRect(0, s - 14, s, 14);
  });
}

/** Seecontainer: geripptes Blech in Firmenfarbe. */
export function containerTexture(color: string): THREE.CanvasTexture {
  return make('container-' + color, 128, (ctx, s) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, 0, 4, s);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 6, 0, 2, s);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, s - 10, s, 10);
  });
}

/** Bombenspot-Markierung (Boden-Decal): Kreis + Buchstabe. */
export function spotTexture(letter: string): THREE.CanvasTexture {
  return make('spot-' + letter, 256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = letter === 'A' ? '#ff5a4a' : '#ffb13a';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 150px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 + 6);
  }, false);
}

/** Hängeschild: dunkler Grund, farbiger Rahmen + Text. */
export function signTexture(text: string, color: string): THREE.CanvasTexture {
  return make('sign-' + text + color, 512, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const h = s * 0.3;
    const y0 = (s - h) / 2;
    ctx.fillStyle = '#14181d';
    ctx.fillRect(0, y0, s, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(6, y0 + 6, s - 12, h - 12);
    ctx.fillStyle = color;
    let size = Math.floor(h * 0.42);
    ctx.font = `bold ${size}px Arial`;
    while (ctx.measureText(text).width > s - 40 && size > 12) {
      size -= 2;
      ctx.font = `bold ${size}px Arial`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, s / 2, s / 2 + 4);
  }, false);
}


