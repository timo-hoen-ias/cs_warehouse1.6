import { mulberry32 } from '../logic/demo';

/**
 * Animierter Menü-Hintergrund. Schnittstelle, damit später ein echter 3D-Flug durch
 * die gewählte Karte (Engine-Szene hinter dem halbtransparenten Menü) eingesetzt
 * werden kann: `showMainMenu({ backdrop })` nimmt jedes Objekt mit diesen Methoden.
 */
export interface MenuBackdropLike {
  /** Hängt sich an den Container und beginnt zu animieren. */
  mount(container: HTMLElement): void;
  /** Animation anhalten/fortsetzen (z. B. verborgener Tab, Unterseite verdeckt alles). */
  setPaused(paused: boolean): void;
  /** Akzentfarbe/Stimmung je nach gewählter Karte (optional). */
  setMood?(seed: number): void;
  dispose(): void;
}

type Bay = { side: -1 | 1; z: number; boxes: { lvl: number; z0: number; z1: number; h: number; d: number; tone: number; wrap: boolean }[]; upright: number };
type Mote = { x: number; y: number; z: number; vx: number; vy: number; s: number; tw: number };

const BAY = 2.8; // Fachlänge (m)
const AISLE = 2.4; // halbe Gassenbreite
const DEPTH = 1.3; // Regaltiefe
const LEVELS = [0.15, 1.75, 3.35, 4.95];
const RACK_H = 6.4;
const HALL_H = 9;
const CAM_Y = 1.75;
const FAR = 70;

/**
 * Key-Art auf Canvas: langsamer Kameraflug durch eine Hochregalgasse (echte
 * Perspektivprojektion), Hallenstrahler mit Lichtkegeln, Rolltor mit Gegenlicht,
 * Bodenmarkierungen, schwebender Staub, Maus-Parallaxe. Läuft gedrosselt (30 fps),
 * pausiert bei verborgenem Tab, rendert auf schwachen Geräten in reduzierter Auflösung.
 */
export class MenuBackdrop implements MenuBackdropLike {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private paused = false;
  private t = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private scale = 1;
  private mx = 0;
  private my = 0;
  private pmx = 0;
  private pmy = 0;
  private bays: Bay[] = [];
  private motes: Mote[] = [];
  private seed = 7;

  constructor(private readonly quality: 'high' | 'low' = 'high') {}

  mount(container: HTMLElement): void {
    const c = document.createElement('canvas');
    c.className = 'mm-bg';
    container.prepend(c);
    this.canvas = c;
    this.ctx = c.getContext('2d', { alpha: false });
    this.build();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointer);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onResize();
    this.raf = requestAnimationFrame(this.frame);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setMood(seed: number): void {
    if (seed === this.seed) return;
    this.seed = seed;
    this.build();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas?.remove();
    this.canvas = null;
  }

  // ---------------------------------------------------------------- Aufbau

  private build(): void {
    const rnd = mulberry32(this.seed * 131 + 17);
    this.bays = [];
    const count = Math.ceil(FAR / BAY) + 2;
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < count; i++) {
        const boxes: Bay['boxes'] = [];
        for (let lvl = 0; lvl < LEVELS.length; lvl++) {
          if (rnd() < 0.12) continue; // leeres Fach
          let z = 0.1;
          while (z < BAY - 0.5) {
            const len = 0.9 + rnd() * 0.5;
            if (z + len > BAY - 0.1) break;
            if (rnd() < 0.85) boxes.push({ lvl, z0: z, z1: z + len, h: 0.7 + rnd() * 0.65, d: 0.8 + rnd() * 0.4, tone: rnd(), wrap: rnd() < 0.35 });
            z += len + 0.08;
          }
        }
        this.bays.push({ side, z: i * BAY, boxes, upright: rnd() });
      }
    }
    this.motes = Array.from({ length: this.quality === 'low' ? 60 : 160 }, () => ({
      x: (rnd() - 0.5) * 7, y: rnd() * 7, z: 2 + rnd() * 30, vx: (rnd() - 0.5) * 0.08, vy: (rnd() - 0.5) * 0.05, s: 0.6 + rnd() * 1.6, tw: rnd() * 6.28,
    }));
  }

  private readonly onResize = (): void => {
    const c = this.canvas;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Auflösung begrenzen (Füllrate): low = 0.5, sonst bis 1920 px Breite
    const target = this.quality === 'low' ? 0.6 : Math.min(dpr, 1920 / Math.max(1, window.innerWidth));
    this.scale = Math.max(0.4, target);
    this.w = Math.max(2, Math.round(window.innerWidth * this.scale));
    this.h = Math.max(2, Math.round(window.innerHeight * this.scale));
    c.width = this.w;
    c.height = this.h;
  };

  private readonly onPointer = (e: PointerEvent): void => {
    this.mx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    this.my = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  };

  private readonly onVisibility = (): void => {
    this.last = 0;
  };

  // ---------------------------------------------------------------- Rendern

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (this.paused || document.hidden) { this.last = 0; return; }
    const minDt = this.quality === 'low' ? 1 / 20 : 1 / 30;
    const dt = this.last ? (now - this.last) / 1000 : 0;
    if (this.last && dt < minDt) return;
    this.last = now;
    this.t += Math.min(dt, 0.1);
    this.pmx += (this.mx - this.pmx) * 0.04;
    this.pmy += (this.my - this.pmy) * 0.04;
    this.draw();
  };

  private draw(): void {
    const c = this.ctx;
    if (!c) return;
    const { w, h } = this;
    const t = this.t;
    // Kamera: langsamer Dolly vorwärts, sanftes Schwanken, Maus-Parallaxe
    const camZ = t * 0.55;
    const camX = Math.sin(t * 0.07) * 0.35 + this.pmx * 0.35;
    const camY = CAM_Y + Math.sin(t * 0.11) * 0.08 - this.pmy * 0.2;
    const f = h * 0.95;
    const vx = w * 0.5 - this.pmx * w * 0.015 + Math.sin(t * 0.05) * w * 0.01;
    const vy = h * 0.43 - this.pmy * h * 0.01;
    const P = (x: number, y: number, z: number): [number, number] => {
      const zz = Math.max(0.05, z - camZ);
      return [vx + ((x - camX) * f) / zz, vy - ((y - camY) * f) / zz];
    };
    const fog = (z: number): number => Math.min(1, Math.max(0, (z - camZ) / FAR)) ** 0.8;
    const mix = (a: number[], b: number[], k: number): string => `rgb(${Math.round(a[0]! + (b[0]! - a[0]!) * k)},${Math.round(a[1]! + (b[1]! - a[1]!) * k)},${Math.round(a[2]! + (b[2]! - a[2]!) * k)})`;
    const FOG = [22, 28, 36];

    // Hintergrund: Hallenrückwand + Dach
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#07090c');
    bg.addColorStop(0.42, '#1a222c');
    bg.addColorStop(0.5, '#141a21');
    bg.addColorStop(1, '#07080a');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    // Rolltor am Ende der Gasse (Gegenlicht)
    const [dx0, dy0] = P(-2.1, 4.2, FAR);
    const [dx1, dy1] = P(2.1, 0, FAR);
    const glow = c.createRadialGradient((dx0 + dx1) / 2, dy1, 0, (dx0 + dx1) / 2, dy1, h * 0.55);
    glow.addColorStop(0, 'rgba(255,214,150,.55)');
    glow.addColorStop(0.25, 'rgba(255,170,90,.18)');
    glow.addColorStop(1, 'rgba(255,170,90,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,226,180,.85)';
    c.fillRect(dx0, dy1 - (dy1 - dy0) * 0.18, dx1 - dx0, (dy1 - dy0) * 0.18);
    c.fillStyle = '#20262d';
    c.fillRect(dx0, dy0, dx1 - dx0, (dy1 - dy0) * 0.82);
    // Lamellen
    c.fillStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i < 12; i++) c.fillRect(dx0, dy0 + ((dy1 - dy0) * 0.82 * i) / 12, dx1 - dx0, 1);

    // Boden mit Spiegelung und Markierungen
    const [, horizonY] = P(0, 0, FAR * 3);
    const floor = c.createLinearGradient(0, horizonY, 0, h);
    floor.addColorStop(0, '#1c2229');
    floor.addColorStop(1, '#0a0c0f');
    c.fillStyle = floor;
    c.beginPath();
    const fl = P(-AISLE - DEPTH, 0, camZ + 0.3);
    const fr = P(AISLE + DEPTH, 0, camZ + 0.3);
    const fl2 = P(-AISLE - DEPTH, 0, FAR + camZ);
    const fr2 = P(AISLE + DEPTH, 0, FAR + camZ);
    c.moveTo(fl[0], h); c.lineTo(fl2[0], fl2[1]); c.lineTo(fr2[0], fr2[1]); c.lineTo(fr[0], h); c.closePath();
    c.fill();
    // Torlicht-Reflexion auf dem Boden
    const refl = c.createLinearGradient(0, dy1, 0, h);
    refl.addColorStop(0, 'rgba(255,200,140,.28)');
    refl.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = refl;
    c.beginPath();
    const rl = P(-1.4, 0, camZ + 1);
    const rr = P(1.4, 0, camZ + 1);
    c.moveTo(dx0 + (dx1 - dx0) * 0.25, dy1); c.lineTo(dx1 - (dx1 - dx0) * 0.25, dy1); c.lineTo(rr[0], h); c.lineTo(rl[0], h); c.closePath();
    c.fill();
    // Gelbe Fahrbahnlinien (gestrichelt, wandern mit der Kamera)
    for (const lx of [-AISLE + 0.15, AISLE - 0.15]) {
      for (let z = Math.ceil(camZ) ; z < camZ + FAR; z += 1.5) {
        const a = P(lx - 0.06, 0, z);
        const b = P(lx + 0.06, 0, z);
        const a2 = P(lx - 0.06, 0, z + 0.9);
        const b2 = P(lx + 0.06, 0, z + 0.9);
        const k = fog(z);
        c.fillStyle = mix([230, 180, 30], FOG, k);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(b2[0], b2[1]); c.lineTo(a2[0], a2[1]); c.closePath(); c.fill();
      }
    }

    // Dachbinder
    c.strokeStyle = 'rgba(70,80,92,.55)';
    c.lineWidth = Math.max(1, h / 500);
    for (let z = Math.ceil(camZ / 5) * 5; z < camZ + FAR; z += 5) {
      const a = P(-AISLE - DEPTH - 2, HALL_H, z);
      const b = P(AISLE + DEPTH + 2, HALL_H, z);
      const m = P(0, HALL_H + 1, z);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(m[0], m[1]); c.lineTo(b[0], b[1]); c.stroke();
    }

    // Regale: von hinten nach vorne zeichnen (Maler-Algorithmus)
    const perSide = this.bays.length / 2;
    const first = Math.floor(camZ / BAY) - 1;
    for (let j = perSide - 1; j >= 0; j--) {
      const idx = first + j;
      for (const side of [0, 1]) {
        const b = this.bays[side * perSide + (((idx % perSide) + perSide) % perSide)]!;
        this.drawBay(c, b, idx * BAY, camZ, P, fog, mix, FOG);
      }
    }

    // Hallenstrahler mit Lichtkegeln (additiv)
    c.globalCompositeOperation = 'lighter';
    for (let z = Math.ceil((camZ + 1) / 6) * 6; z < camZ + 48; z += 6) {
      const k = fog(z);
      const lamp = P(0, HALL_H - 1.2, z);
      const fl0 = P(-AISLE * 0.9, 0, z - 0.6);
      const fr0 = P(AISLE * 0.9, 0, z + 0.6);
      const alpha = 0.16 * (1 - k);
      const cone = c.createLinearGradient(0, lamp[1], 0, fl0[1]);
      cone.addColorStop(0, `rgba(255,220,170,${alpha * 1.6})`);
      cone.addColorStop(1, 'rgba(255,220,170,0)');
      c.fillStyle = cone;
      c.beginPath(); c.moveTo(lamp[0] - 2, lamp[1]); c.lineTo(fl0[0], fl0[1]); c.lineTo(fr0[0], fl0[1]); c.lineTo(lamp[0] + 2, lamp[1]); c.closePath(); c.fill();
      const r = Math.max(2, (f * 0.35) / Math.max(0.5, z - camZ));
      const g = c.createRadialGradient(lamp[0], lamp[1], 0, lamp[0], lamp[1], r * 3);
      g.addColorStop(0, `rgba(255,236,200,${0.9 * (1 - k)})`);
      g.addColorStop(0.2, `rgba(255,200,140,${0.35 * (1 - k)})`);
      g.addColorStop(1, 'rgba(255,200,140,0)');
      c.fillStyle = g;
      c.fillRect(lamp[0] - r * 3, lamp[1] - r * 3, r * 6, r * 6);
      // Lichtfleck auf dem Boden
      const spot = P(0, 0, z);
      const sr = Math.max(4, (f * 2.2) / Math.max(0.5, z - camZ));
      const sg = c.createRadialGradient(spot[0], spot[1], 0, spot[0], spot[1], sr);
      sg.addColorStop(0, `rgba(255,210,150,${0.12 * (1 - k)})`);
      sg.addColorStop(1, 'rgba(255,210,150,0)');
      c.fillStyle = sg;
      c.save(); c.translate(spot[0], spot[1]); c.scale(1, 0.28); c.translate(-spot[0], -spot[1]);
      c.fillRect(spot[0] - sr, spot[1] - sr, sr * 2, sr * 2);
      c.restore();
    }
    // Staub im Licht
    for (const m of this.motes) {
      m.x += m.vx * 0.03; m.y += m.vy * 0.03 + Math.sin(t * 0.5 + m.tw) * 0.002;
      if (m.y > 7) m.y = 0.2; if (m.y < 0.1) m.y = 6.9;
      if (m.x > 3.5) m.x = -3.5; if (m.x < -3.5) m.x = 3.5;
      let z = m.z - ((t * 0.55) % 30);
      if (z < 0.8) z += 30;
      const [sx, sy] = P(m.x, m.y, z + camZ);
      const size = Math.max(0.6, (m.s * f * 0.004) / Math.max(0.6, z - 0.5));
      const a = (0.25 + 0.25 * Math.sin(t * 1.3 + m.tw)) * (1 - fog(z + camZ));
      c.fillStyle = `rgba(255,236,200,${a})`;
      c.fillRect(sx, sy, size, size);
    }
    c.globalCompositeOperation = 'source-over';
  }

  private drawBay(
    c: CanvasRenderingContext2D, b: Bay, z: number, camZ: number,
    P: (x: number, y: number, z: number) => [number, number],
    fog: (z: number) => number, mix: (a: number[], b: number[], k: number) => string, FOG: number[],
  ): void {
    if (z + BAY < camZ + 0.2 || z > camZ + FAR) return;
    const s = b.side;
    const xIn = s * AISLE;
    const xOut = s * (AISLE + DEPTH);
    const k = fog(z);
    // Belichtung: nahe Regale liegen im Schatten (Licht kommt von den Strahlern weiter vorne)
    const lit = Math.min(1, Math.max(0.38, (z - camZ) / 9));
    const L = (c: number[]): number[] => c.map((v) => v * lit);
    const quad = (pts: [number, number][], color: string): void => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
      c.closePath();
      c.fill();
    };
    // Rückwand des Fachs (dunkel)
    quad([P(xOut, 0, z), P(xOut, RACK_H, z), P(xOut, RACK_H, z + BAY), P(xOut, 0, z + BAY)], mix([12, 14, 18], FOG, k));
    // Waren
    for (const box of b.boxes) {
      const y0 = LEVELS[box.lvl]! + 0.14;
      const y1 = y0 + box.h;
      const x0 = xIn + s * (DEPTH - box.d) * 0.5;
      const base = box.wrap ? [150, 160, 168] : box.tone < 0.6 ? [138, 98, 58] : box.tone < 0.85 ? [118, 84, 50] : [80, 92, 104];
      const shade = 0.55 + 0.25 * box.tone;
      const face = base.map((v) => v * shade);
      // Palette
      quad([P(x0, y0 - 0.14, z + box.z0), P(x0, y0, z + box.z0), P(x0, y0, z + box.z1), P(x0, y0 - 0.14, z + box.z1)], mix(L([96, 72, 44]), FOG, k));
      // Front zur Gasse
      quad([P(x0, y0, z + box.z0), P(x0, y1, z + box.z0), P(x0, y1, z + box.z1), P(x0, y0, z + box.z1)], mix(L(face), FOG, k));
      // Stirnseite (zur Kamera)
      quad([P(x0, y0, z + box.z0), P(x0, y1, z + box.z0), P(x0 + s * box.d, y1, z + box.z0), P(x0 + s * box.d, y0, z + box.z0)], mix(L(face.map((v) => v * 0.7)), FOG, k));
      // Oberseite (nur unterhalb der Augenhöhe sichtbar)
      if (y1 < 1.75) quad([P(x0, y1, z + box.z0), P(x0 + s * box.d, y1, z + box.z0), P(x0 + s * box.d, y1, z + box.z1), P(x0, y1, z + box.z1)], mix(L(face.map((v) => v * 1.15)), FOG, k));
      // Klebeband/Etikett
      if (!box.wrap) {
        const ym = (y0 + y1) / 2;
        quad([P(x0, ym - 0.03, z + box.z0), P(x0, ym + 0.03, z + box.z0), P(x0, ym + 0.03, z + box.z1), P(x0, ym - 0.03, z + box.z1)], mix(L([170, 145, 105]), FOG, Math.min(1, k * 1.1)));
      }
    }
    // Traversen (orange) je Ebene
    for (const y of LEVELS) {
      quad([P(xIn, y, z), P(xIn, y + 0.14, z), P(xIn, y + 0.14, z + BAY), P(xIn, y, z + BAY)], mix(L([186, 92, 34]), FOG, k));
    }
    // Steher (blau) vorne und hinten am Fachanfang
    const uw = 0.09;
    for (const x of [xIn, xOut]) {
      quad([P(x, 0, z), P(x, RACK_H, z), P(x, RACK_H, z + uw), P(x, 0, z + uw)], mix(L([36, 64, 112]), FOG, k));
    }
    // Stirnfläche Steher (zur Gasse)
    quad([P(xIn, 0, z), P(xIn, RACK_H, z), P(xIn + s * 0.09, RACK_H, z), P(xIn + s * 0.09, 0, z)], mix(L([48, 84, 140]), FOG, k));
    // Anfahrschutz (gelb/schwarz) unten am Steher
    quad([P(xIn - s * 0.02, 0, z - 0.05), P(xIn - s * 0.02, 0.45, z - 0.05), P(xIn - s * 0.02, 0.45, z + 0.2), P(xIn - s * 0.02, 0, z + 0.2)], mix(L([210, 165, 40]), FOG, k));
  }
}
