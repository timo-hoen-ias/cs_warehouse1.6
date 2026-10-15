import type { BrushOpts, MapBuilder, MaterialId } from './mapkit';
import { localPoint, place, worldDir, type PropOpts } from './propgeom';
import { mulberry32 } from './rng';

/**
 * Bahn-Requisiten (pure): Gleis mit Schwellen, Güterwagen (gedeckt, Kessel, Flach, Lok),
 * Prellbock, Signal, Fahrleitung, Efeu-Bewuchs und Hallenbinder. Lokale Länge entlang X,
 * Front +Z, (x, y, z) = Fußpunkt-Mitte auf Schienenfuß-Höhe (y = Boden). Wagenmaße in
 * `WAGON` — Karten setzen Wagen mit `WAGON.pitch` Abstand (Puffer berühren sich).
 *
 * Güterwagen sind begehbar gedacht: Boden liegt auf `WAGON.floor`, Türen (`doors`) geben
 * das Innere frei, Verladerampen (`ramp`) führen hinauf; das Dach ist nur Navigationsboden,
 * wenn die Karte einen Aufgang baut (`walkRoof`).
 */
export type RailPropKind = 'track' | 'cargoContainer' | 'boxcar' | 'tankcar' | 'flatcar' | 'loco' | 'bufferStop' | 'signal' | 'catenary' | 'ivy' | 'truss';

export const RAIL_KINDS: readonly RailPropKind[] = ['track', 'cargoContainer', 'boxcar', 'tankcar', 'flatcar', 'loco', 'bufferStop', 'signal', 'catenary', 'ivy', 'truss'];

export function isRailKind(kind: string): kind is RailPropKind {
  return (RAIL_KINDS as readonly string[]).includes(kind);
}

/** Maße (m): Wagenkörper, Abstand zweier Wagen (Puffer berühren sich), Boden-/Dachhöhe über Schienenfuß. */
export const WAGON = { length: 14, pitch: 14.6, width: 3, floor: 1.3, roof: 3.6, locoLength: 18, gauge: 1.435, railTop: 0.17 } as const;

/** Wagenfarben: Oxidrot, Grün, Braun, Grau, Blau, Ocker. */
const WAGON_TINTS = [0x8a3a2c, 0x3f6a48, 0x6a4a34, 0x7a7f84, 0x35557a, 0xb08a2a];
const CONTAINER_TINTS = [0xa8432b, 0x2b5f9e, 0x2f7d4f, 0xb7791f, 0x8a8f96, 0x6b3a7a];
const IVY = [0x4a7a34, 0x3a6a2c, 0x5a8a3c, 0x2f5a28, 0x6a8a3a];

export function railProp(b: MapBuilder, kind: RailPropKind, x: number, y: number, z: number, o: PropOpts = {}): void {
  const rot = o.rot ?? 0;
  const rnd = mulberry32(o.seed ?? Math.floor(Math.abs(x * 73.1 + z * 37.7 + y * 11.3)) + 7);
  const yaw = (rot * Math.PI) / 2;
  const box = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: MaterialId, extra: BrushOpts = {}) => {
    const [a, c, bb, d] = place(x, z, rot, lx0, lz0, lx1, lz1);
    return b.box([a, y + ly0, c], [bb, y + ly1, d], mat, { tag: 'prop', noNav: ly1 >= 1.9 ? true : undefined, ...extra });
  };
  /** Reine Optik: keine Kollision, kein Schatten, kein Navigationsboden. */
  const deco = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: MaterialId, tint?: number, extra: BrushOpts = {}) =>
    box(lx0, ly0, lz0, lx1, ly1, lz1, mat, { collide: 'none', noNav: true, occlude: false, tint, ...extra });
  const decor = (k: Parameters<MapBuilder['decor']>[0], lx: number, ly: number, lz: number, scale?: [number, number, number], tint?: number) => {
    const [wx, wz] = localPoint(x, z, rot, lx, lz);
    b.decor(k, [wx, y + ly, wz], yaw, scale, tint);
  };

  switch (kind) {
    case 'track': {
      // Schotterbett (Optik), Schienen im Regelspur-Abstand, Schwellen alle 0.8 m
      const len = o.len ?? 20;
      deco(-len / 2, 0, -1.8, len / 2, 0.03, 1.8, 'gravel', 0x5a554e, { uv: 2 });
      for (const s of [-1, 1]) {
        const c = (s * WAGON.gauge) / 2;
        deco(-len / 2, 0.03, c - 0.035, len / 2, WAGON.railTop, c + 0.035, 'steel', 0x6e5646);
        deco(-len / 2, 0.03, c - 0.08, len / 2, 0.06, c + 0.08, 'steel', 0x4a4038);
      }
      for (let lx = -len / 2 + 0.4; lx < len / 2; lx += 0.8) deco(lx - 0.13, 0.03, -1.3, lx + 0.13, 0.12, 1.3, 'wood', 0x40342a, { uv: 1 });
      break;
    }
    case 'cargoContainer': {
      // Frachtcontainer (len 6.06 = 20 ft, 12.19 = 40 ft); Türplatte ohne Schattenwurf (sonst wird das Stirnende schwarz gebacken)
      const len = o.len ?? 6.06;
      const tint = o.tint ?? CONTAINER_TINTS[Math.floor(rnd() * CONTAINER_TINTS.length)]!;
      box(-len / 2, 0, -1.22, len / 2, 2.59, 1.22, 'container', { tint });
      deco(len / 2, 0.05, -1.15, len / 2 + 0.04, 2.5, 1.15, 'door', 0x9a9a9a);
      deco(-len / 2 - 0.04, 0.05, -1.15, -len / 2, 2.5, 1.15, 'container', tint);
      break;
    }
    case 'boxcar':
    case 'tankcar':
    case 'flatcar': {
      wagon(kind);
      break;
    }
    case 'loco': {
      loco();
      break;
    }
    case 'bufferStop': {
      // Prellbock: massiver Block mit rot-weißem Pufferbalken (Zug kommt aus −X)
      box(-0.45, 0, -1.3, 0.45, 0.95, 1.3, 'concrete', { tint: 0x8a8a86 });
      box(-0.6, 0.95, -1.4, 0.3, 1.3, 1.4, 'hazard', { collide: 'none', noNav: true });
      deco(-0.7, 0.45, -0.9, -0.45, 0.85, -0.5, 'rubber', 0x222222);
      deco(-0.7, 0.45, 0.5, -0.45, 0.85, 0.9, 'rubber', 0x222222);
      break;
    }
    case 'signal': {
      // Signalmast mit Lichtsignal (n: 0 rot, 1 grün, 2 gelb), Schild nach +Z
      const lit = [0xff3a24, 0x40ff70, 0xffc030][o.n ?? 0] ?? 0xff3a24;
      box(-0.1, 0, -0.1, 0.1, 5.2, 0.1, 'steel', { tint: 0x555a60, tag: 'pillar' });
      box(-0.3, 4.3, 0.1, 0.3, 5.6, 0.3, 'black', { tint: 0x26282a, collide: 'none', noNav: true, occlude: false });
      for (let i = 0; i < 3; i++) {
        const on = i === (o.n ?? 0) ? 1 : 0;
        deco(-0.12, 5.25 - i * 0.4, 0.3, 0.12, 5.5 - i * 0.4, 0.32, on ? 'emissive' : 'black', on ? lit : 0x1a1a1a);
      }
      deco(-0.18, 2.4, 0.1, 0.18, 2.8, 0.12, 'white', 0xe8e8e0);
      const [wx, wz] = localPoint(x, z, rot, 0, 0.9);
      b.light({ kind: 'lamp', pos: [wx, y + 5.0, wz], color: lit, intensity: 0.45, range: 7 });
      break;
    }
    case 'catenary': {
      // Fahrleitung: Fahrdraht über dem Gleis, Masten mit Ausleger alle 24 m (nur Optik, Mast als Pfeiler)
      const len = o.len ?? 48;
      deco(-len / 2, 6.0, -0.03, len / 2, 6.07, 0.03, 'black', 0x2a2a2a);
      deco(-len / 2, 6.45, -0.03, len / 2, 6.5, 0.03, 'black', 0x2a2a2a);
      const n = Math.max(1, Math.round(len / 24));
      for (let i = 0; i <= n; i++) {
        const lx = -len / 2 + (len * i) / n;
        box(lx - 0.15, 0, 3.0, lx + 0.15, 7.2, 3.3, 'steel', { tint: 0x5c6268, tag: 'pillar' });
        deco(lx - 0.07, 6.4, -0.1, lx + 0.07, 6.55, 3.2, 'steel', 0x5c6268);
        deco(lx - 0.05, 6.07, -0.05, lx + 0.05, 6.45, 0.05, 'steel', 0x3a3a3a);
        deco(lx - 0.35, 0, 2.9, lx + 0.35, 0.5, 3.4, 'concrete', 0x8a8a86);
      }
      break;
    }
    case 'ivy': {
      // Efeu an einer Wand: Rückseite bei lokal z = 0, Länge len, Höhe h; Blattflächen + Ranken
      const len = o.len ?? 6;
      const h = o.h ?? 3;
      let lx = -len / 2;
      while (lx < len / 2 - 0.2) {
        const w = Math.min(0.8 + rnd() * 1.2, len / 2 - lx);
        const hh = h * (0.35 + rnd() * 0.65);
        const up = rnd() < 0.7;
        const d = 0.1 + rnd() * 0.12;
        deco(lx, up ? 0 : h - hh, 0, lx + w, up ? hh : h, d, 'foliage', IVY[Math.floor(rnd() * IVY.length)]);
        if (rnd() < 0.5) deco(lx + w * 0.3, 0, 0, lx + w * 0.3 + 0.1, h * (0.8 + rnd() * 0.2), d + 0.06, 'foliage', IVY[Math.floor(rnd() * IVY.length)]);
        lx += w * (0.7 + rnd() * 0.3);
      }
      break;
    }
    case 'truss': {
      // Hallenbinder (Vierendeel): Ober-/Untergurt und Pfosten alle 2 m, nur Optik
      const len = o.len ?? 20;
      const h = o.h ?? 2.4;
      const tint = o.tint ?? 0x4a5662;
      deco(-len / 2, h - 0.22, -0.14, len / 2, h, 0.14, 'steel', tint);
      deco(-len / 2, 0, -0.14, len / 2, 0.22, 0.14, 'steel', tint);
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= n; i++) {
        const lx = -len / 2 + (len * i) / n;
        deco(lx - 0.06, 0.2, -0.08, lx + 0.06, h - 0.2, 0.08, 'steel', tint);
      }
      break;
    }
  }

  /** Radsatz-Drehgestelle: Rahmen + je 4 Räder. */
  function bogies(centers: number[], span = 0.9): void {
    for (const bx of centers) {
      for (const s of [-1, 1]) deco(bx - 1.4, 0.5, s * 0.92 - 0.09, bx + 1.4, 0.82, s * 0.92 + 0.09, 'black', 0x2c2c2e);
      deco(bx - 0.3, 0.7, -0.9, bx + 0.3, 0.95, 0.9, 'black', 0x2c2c2e);
      for (const wx of [-span, span]) for (const s of [-1, 1]) decor('wheel', bx + wx, 0.66, s * 0.73);
      for (const wx of [-span, span]) deco(bx + wx - 0.04, 0.58, -0.78, bx + wx + 0.04, 0.72, 0.78, 'steel', 0x3a3a3a);
    }
  }

  function buffers(hl: number, y0 = 0.95): void {
    for (const e of [-1, 1]) for (const s of [-1, 1]) {
      deco(e > 0 ? hl : -hl - 0.3, y0, s * 0.9 - 0.15, e > 0 ? hl + 0.3 : -hl, y0 + 0.25, s * 0.9 + 0.15, 'black', 0x303030);
    }
  }

  function wagon(k: 'boxcar' | 'tankcar' | 'flatcar'): void {
    const HL = WAGON.length / 2;
    const HW = WAGON.width / 2;
    const F = WAGON.floor;
    const R = WAGON.roof;
    const tint = o.tint ?? WAGON_TINTS[Math.floor(rnd() * WAGON_TINTS.length)]!;
    const doors = o.doors ?? 'closed';
    const bodyMat: MaterialId = o.worn ? 'rust' : 'corrugated';
    if (k === 'boxcar') {
      const open = (s: number): boolean => doors === 'both' || (doors === 'front' && s === 1);
      box(-HL, 0.95, -HW, HL, F, HW, 'steel', { tint: 0x3b3b3e, top: 'wood', noNav: doors === 'closed' });
      for (const e of [-1, 1]) box(e > 0 ? HL - 0.12 : -HL, F, -HW, e > 0 ? HL : -HL + 0.12, R, HW, bodyMat, { tint, uv: 2.6 });
      for (const s of [-1, 1]) {
        const lz0 = s > 0 ? HW - 0.12 : -HW;
        const lz1 = s > 0 ? HW : -HW + 0.12;
        if (!open(s)) {
          box(-HL + 0.12, F, lz0, HL - 0.12, R, lz1, bodyMat, { tint, uv: 2.6 });
          // geschlossene Schiebetür: Blatt vor der Wand
          deco(-1.75, F + 0.1, s > 0 ? HW : -HW - 0.05, 1.75, F + 2.3, s > 0 ? HW + 0.05 : -HW, 'door', tint === 0x7a7f84 ? 0x9a8a6a : 0x6a6a68, { uvFit: true });
        } else {
          box(-HL + 0.12, F, lz0, -1.6, R, lz1, bodyMat, { tint, uv: 2.6 });
          box(1.6, F, lz0, HL - 0.12, R, lz1, bodyMat, { tint, uv: 2.6 });
          box(-1.6, F + 2.25, lz0, 1.6, R, lz1, bodyMat, { tint, uv: 2.6 });
          // offene Tür: Blatt seitlich zurückgeschoben
          const back = rnd() < 0.5 ? 1 : -1;
          deco(back > 0 ? 1.7 : -3.4, F + 0.1, s > 0 ? HW : -HW - 0.05, back > 0 ? 3.4 : -1.7, F + 2.3, s > 0 ? HW + 0.05 : -HW, 'door', 0x6a6a68, { uvFit: true });
        }
      }
      box(-HL, R, -HW, HL, R + 0.14, HW, 'metal', { tint: 0x6a7076, noNav: !o.walkRoof, uv: 3 });
      // offene Wagen bekommen eine Innenleuchte (sonst schwarz)
      if (doors !== 'closed') {
        const [lx, lz] = localPoint(x, z, rot, 0, 0);
        b.light({ kind: 'lamp', pos: [lx, y + R - 0.35, lz], color: 0xffe2b8, intensity: 0.9, range: 7 });
      }
      // Dachaufbau: Lüfter und Handlauf-Strebe (Optik)
      deco(-4.5, R + 0.14, -0.3, -3.5, R + 0.3, 0.3, 'vent', 0x7a8086);
      deco(3.5, R + 0.14, -0.3, 4.5, R + 0.3, 0.3, 'vent', 0x7a8086);
      for (const side of ['front', 'back'] as const) {
        const want = o.ramp === 'both' || o.ramp === side;
        const s = side === 'front' ? 1 : -1;
        if (!want || !open(s)) continue;
        const L = o.rampLen ?? 4.5;
        const [x0, z0, x1, z1] = place(x, z, rot, -1.3, s > 0 ? HW : -HW - L, 1.3, s > 0 ? HW + L : -HW);
        b.ramp(x0, z0, x1, z1, y, y + F, worldDir(rot, 0, -s), 'steel', { top: 'grating', tint: 0x6a7480, tag: 'ramp' });
      }
    } else if (k === 'tankcar') {
      box(-HL, 0.95, -1.15, HL, 1.15, 1.15, 'steel', { tint: 0x2e2e30, noNav: true });
      box(-6.4, 1.15, -1.2, 6.4, 3.3, 1.2, 'steel', { visible: false, occlude: false, tag: 'prop' });
      // Dekor-Farbton multipliziert das gebackene Licht → helle Kesselfarben wählen (dunkle werden schwarz)
      decor('pipeX', 0, 2.15, 0, [12.9, 8.6, 8.6], o.tint ?? 0xc8ccd0);
      decor('pipeY', 0, 3.3, 0, [3.0, 0.55, 3.0], 0x55595e);
      for (const lx of [-3.6, 3.6]) deco(lx - 0.1, 1.15, -1.28, lx + 0.1, 3.0, 1.28, 'steel', 0x3a3a3e);
      deco(-5, 3.43, -0.25, 5, 3.48, 0.25, 'grating', 0x555a60);
      for (const e of [-1, 1]) deco(e * 6.5 - 0.05, 1.15, -1.0, e * 6.5 + 0.05, 3.1, -0.95, 'steel', 0x555a60);
    } else {
      // Flachwagen-Deck: nur mit Sprung erreichbar → kein Navigationsboden (keine unerreichbaren Inseln)
      box(-HL, 0.95, -HW, HL, F, HW, 'steel', { tint: 0x3b3b3e, top: 'wood', noNav: true });
      for (const lx of [-HL + 0.15, HL - 0.15]) for (const s of [-1, 1]) deco(lx - 0.05, F, s * (HW - 0.08) - 0.05, lx + 0.05, F + 1.1, s * (HW - 0.08) + 0.05, 'steel', 0x555a60);
      const n = Math.max(0, Math.min(2, o.n ?? 0));
      const levels = Math.max(1, Math.min(2, o.levels ?? 1));
      const cs = n === 1 ? [0] : [-3.5, 3.5];
      if (n > 0) {
        for (let i = 0; i < cs.length; i++) {
          for (let lv = 0; lv < levels; lv++) {
            const ct = o.tint ?? CONTAINER_TINTS[Math.floor(rnd() * CONTAINER_TINTS.length)]!;
            const lx = cs[i]!;
            box(lx - 3.03, F + lv * 2.59, -1.22, lx + 3.03, F + (lv + 1) * 2.59, 1.22, 'container', { tint: ct });
            deco(lx + 3.03, F + lv * 2.59 + 0.05, -1.15, lx + 3.07, F + (lv + 1) * 2.59 - 0.05, 1.15, 'door', 0x9a9a9a);
          }
        }
      }
    }
    bogies([-4.6, 4.6]);
    buffers(HL);
  }

  function loco(): void {
    const HL = WAGON.locoLength / 2;
    const tint = o.tint ?? 0xd8741c;
    box(-HL, 0.95, -1.45, HL, 1.5, 1.45, 'steel', { tint: 0x2a2a2c, noNav: true });
    box(-HL + 0.2, 1.5, -1.35, 1.5, 3.1, 1.35, 'metal', { tint, noNav: true });
    box(1.5, 1.5, -1.45, 6.5, 4.2, 1.45, 'metal', { tint, noNav: true });
    box(6.5, 1.5, -1.3, HL - 0.2, 2.8, 1.3, 'metal', { tint, noNav: true });
    deco(1.4, 4.2, -1.5, 6.6, 4.35, 1.5, 'metal', 0x4a4e52);
    for (const s of [-1, 1]) {
      deco(2.2, 2.6, s * 1.45 - 0.02, 5.8, 3.9, s * 1.45 + 0.02, 'window', 0xc8d4dc, { uvFit: true });
      deco(-HL + 0.2, 1.5, s * 1.35 - 0.02, -HL + 6, 1.9, s * 1.35 + 0.02, 'hazard');
    }
    deco(6.5, 2.6, -1.1, 6.54, 3.9, 1.1, 'window', 0xc8d4dc, { uvFit: true });
    deco(HL - 0.2, 1.5, -1.3, HL - 0.15, 2.1, 1.3, 'hazard');
    for (const s of [-1, 1]) deco(HL - 0.22, 2.2, s * 0.9 - 0.12, HL - 0.14, 2.45, s * 0.9 + 0.12, 'emissive', 0xfff2c0);
    for (const lx of [-6, -3.5, -1]) decor('fanUnit', lx, 3.1, 0, [0.9, 1, 1.4], 0x7a8086);
    decor('pipeY', -7.5, 3.1, 0.5, [1.2, 0.9, 1.2], 0x2a2a2a);
    bogies([-5.4, 5.4], 1.0);
    buffers(HL, 1.0);
  }
}
