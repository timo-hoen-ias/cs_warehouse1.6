import type { MapBuilder, MaterialId, Vec3 } from './mapkit';
import { mulberry32 } from './rng';

/**
 * Requisiten-Bibliothek fürs Lager (pure): jede Requisite wird zu Brushes (Kollision
 * + Darstellung) und instanzierter Deko. Drehung in Vierteldrehungen (rot 0..3), damit
 * alle Kollisionsquader achsenparallel bleiben. (x, y, z) = Fußpunkt-Mitte.
 */
export type PropKind =
  | 'pallet' | 'palletStack' | 'palletGoods' | 'crate' | 'crateStack' | 'gitterbox' | 'container' | 'container40'
  | 'trailer' | 'truck' | 'forklift' | 'barrel' | 'barrelGroup' | 'drum' | 'rack' | 'shelf' | 'serverRack'
  | 'serverRow' | 'ups' | 'cooler' | 'conveyor' | 'cartons' | 'ibc' | 'desk' | 'bumper' | 'lampPost' | 'fence'
  | 'handTruck' | 'cableTray' | 'locker' | 'generator' | 'rollerDoor' | 'acUnit' | 'electricBox' | 'cones' | 'doorSteel'
  | 'silo' | 'chiller' | 'compressor' | 'stripCurtain' | 'rollCage'
  | 'sacks' | 'van' | 'fountain' | 'hoist' | 'archGate' | 'archive' | 'crane' | 'scaffold' | 'gasLamp' | 'logs';

export type PropOpts = { rot?: 0 | 1 | 2 | 3; tint?: number; h?: number; n?: number; len?: number; seed?: number; levels?: number; /** Tiefkühlware (weiß/blau) statt Karton-Farben. */ cold?: boolean };

const GOODS = [0xc9a26b, 0xb8895a, 0xd8c09a, 0x9fb7c9, 0xc6c6c0, 0xd0a060, 0x8fa86a, 0xc77b5a];
const COLD_GOODS = [0xe8f1f6, 0xcfe1ee, 0xb7d3e6, 0xf2f6f8, 0xa9c8dc, 0xd4e8d0, 0xe6d8d2, 0x9fc0d8];
const CONTAINERS = [0xa8432b, 0x2b5f9e, 0x2f7d4f, 0xb7791f, 0x8a8f96, 0x6b3a7a, 0xc0b8a8];

/** Rechteck (halbe Breiten) nach Vierteldrehung. */
function dims(w: number, d: number, rot: number): [number, number] {
  return rot % 2 === 0 ? [w, d] : [d, w];
}

/** Lokale Box (lx, lz relativ zur Mitte, ungedreht) in Weltkoordinaten. */
function place(x: number, z: number, rot: number, lx0: number, lz0: number, lx1: number, lz1: number): [number, number, number, number] {
  const pts: [number, number][] = [[lx0, lz0], [lx1, lz1]].map(([a, b]) => {
    switch (rot % 4) {
      case 1: return [-b!, a!];
      case 2: return [-a!, -b!];
      case 3: return [b!, -a!];
      default: return [a!, b!];
    }
  });
  return [x + Math.min(pts[0]![0], pts[1]![0]), z + Math.min(pts[0]![1], pts[1]![1]), x + Math.max(pts[0]![0], pts[1]![0]), z + Math.max(pts[0]![1], pts[1]![1])];
}

export function prop(b: MapBuilder, kind: PropKind, x: number, y: number, z: number, o: PropOpts = {}): void {
  const rot = o.rot ?? 0;
  const rnd = mulberry32(o.seed ?? Math.floor(Math.abs(x * 73.1 + z * 37.7 + y * 11.3)) + 1);
  const box = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: MaterialId, extra: Parameters<MapBuilder['box']>[3] = {}) => {
    const [a, c, bb, d] = place(x, z, rot, lx0, lz0, lx1, lz1);
    // Oberseiten über Sprunghöhe sind kein Navigationsboden (Lkw-Dach, Container ohne Treppe …)
    return b.box([a, y + ly0, c], [bb, y + ly1, d], mat, { tag: 'prop', noNav: ly1 >= 1.9 ? true : undefined, ...extra });
  };
  const yawRot = (rot * Math.PI) / 2;
  const goods = o.cold ? COLD_GOODS : GOODS;
  switch (kind) {
    case 'pallet':
      box(-0.6, 0, -0.4, 0.6, 0.15, 0.4, 'pallet');
      break;
    case 'palletStack': {
      const n = o.n ?? 4 + Math.floor(rnd() * 5);
      box(-0.6, 0, -0.4, 0.6, 0.15 * n, 0.4, 'pallet', { uv: 1.2 });
      break;
    }
    case 'palletGoods': {
      const h = o.h ?? 0.9 + rnd() * 0.8;
      box(-0.6, 0, -0.4, 0.6, 0.15, 0.4, 'pallet');
      box(-0.58, 0.15, -0.38, 0.58, 0.15 + h, 0.38, 'wrap', { tint: o.tint ?? goods[Math.floor(rnd() * goods.length)] });
      break;
    }
    case 'crate': {
      const s = o.h ?? 1.2;
      box(-s / 2, 0, -s / 2, s / 2, s, s / 2, 'crate', { uv: s });
      break;
    }
    case 'crateStack': {
      // „Xbox“-artiger Stapel: große Kiste auf Paletten, kleine obendrauf
      box(-0.9, 0, -0.9, 0.9, 0.15, 0.9, 'pallet');
      box(-0.85, 0.15, -0.85, 0.85, 1.25, 0.85, 'crate', { uv: 1.1 });
      box(-0.5, 1.25, -0.6, 0.45, 1.95, 0.35, 'crate', { uv: 0.7, tint: 0xd8c8a8 });
      break;
    }
    case 'gitterbox': {
      const n = o.n ?? 1;
      box(-0.62, 0, -0.42, 0.62, 0.97 * n, 0.42, 'cage', { uv: 0.97 });
      break;
    }
    case 'container':
    case 'container40': {
      const len = kind === 'container' ? 6.06 : 12.19;
      const tint = o.tint ?? CONTAINERS[Math.floor(rnd() * CONTAINERS.length)];
      box(-len / 2, 0, -1.22, len / 2, 2.59, 1.22, 'container', { tint });
      // Türende (dunkler Rahmen) als dünne Platte
      box(len / 2, 0.05, -1.15, len / 2 + 0.04, 2.5, 1.15, 'door', { collide: 'none', tint: 0x9a9a9a, noNav: true });
      break;
    }
    case 'trailer': {
      // Sattelauflieger 13.6 m: Koffer auf Fahrgestell, Räder als Deko
      box(-6.8, 1.15, -1.3, 6.8, 4.0, 1.3, 'corrugated', { tint: o.tint ?? 0xe8e8e8, uv: 2.6 });
      box(-6.6, 0, -0.9, -3.0, 1.15, 0.9, 'black', { tint: 0x333333 });
      box(3.0, 0.3, -0.6, 6.6, 1.15, 0.6, 'black', { tint: 0x333333, collide: 'all' });
      box(-3.0, 0.75, -0.9, 3.0, 1.15, 0.9, 'black', { tint: 0x2a2a2a, collide: 'none' });
      for (const lx of [-5.6, -4.3]) for (const s of [-1, 1]) {
        const [cx, , , ] = place(x, z, rot, lx, s * 1.05, lx, s * 1.05);
        const [, cz] = place(x, z, rot, lx, s * 1.05, lx, s * 1.05);
        b.decor('wheel', [cx, y + 0.5, cz], yawRot);
      }
      break;
    }
    case 'truck': {
      // Zugmaschine (Fahrerhaus vorne bei +x)
      box(0.6, 0.5, -1.25, 3.0, 3.4, 1.25, 'metal', { tint: o.tint ?? 0xc23a2a });
      box(-3.2, 0.6, -0.9, 0.6, 1.3, 0.9, 'black', { tint: 0x2c2c2c });
      for (const lx of [2.2, -1.6, -2.7]) for (const s of [-1, 1]) {
        const [cx, cz] = place(x, z, rot, lx, s * 1.05, lx, s * 1.05);
        b.decor('wheel', [cx, y + 0.5, cz], yawRot);
      }
      break;
    }
    case 'forklift': {
      // Kollision: Körper; Darstellung: Deko-Modell
      box(-0.6, 0, -1.1, 0.6, 2.1, 0.9, 'metal', { visible: false, occlude: true });
      b.decor('forklift', [x, y, z], yawRot, undefined, o.tint ?? 0xe0a020);
      break;
    }
    case 'barrel':
      box(-0.3, 0, -0.3, 0.3, 0.9, 0.3, 'metal', { visible: false, occlude: true });
      b.decor('barrel', [x, y, z], rnd() * 6, undefined, o.tint ?? [0x2a5fa8, 0xb03a2a, 0x3a7a3a, 0x8a8a8a][Math.floor(rnd() * 4)]);
      break;
    case 'barrelGroup': {
      const pts: [number, number][] = [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]];
      box(-0.66, 0, -0.66, 0.66, 0.15, 0.66, 'pallet');
      box(-0.64, 0.15, -0.64, 0.64, 1.05, 0.64, 'metal', { visible: false, occlude: true });
      const tint = o.tint ?? [0x2a5fa8, 0xb03a2a, 0x3a7a3a][Math.floor(rnd() * 3)];
      for (const [lx, lz] of pts) b.decor('barrel', [x + lx, y + 0.15, z + lz], rnd() * 6, undefined, tint);
      break;
    }
    case 'drum':
      // Kabeltrommel (liegend)
      box(-0.45, 0, -0.85, 0.45, 1.6, 0.85, 'wood', { visible: false, occlude: true });
      b.decor('drum', [x, y + 0.8, z], yawRot);
      break;
    case 'rack': {
      // Hochregal-Feld(er): Länge len (entlang lokal X), Tiefe 1.1, Höhe h, Ebenen mit Ware
      const len = o.len ?? 2.7;
      const h = o.h ?? 8;
      const levels = o.levels ?? Math.max(2, Math.round(h / 1.9));
      box(-len / 2, 0, -0.55, len / 2, h, 0.55, 'steel', { visible: false, occlude: false, noNav: true });
      const bays = Math.max(1, Math.round(len / 2.7));
      const bw = len / bays;
      for (let i = 0; i <= bays; i++) {
        const lx = -len / 2 + i * bw;
        box(lx - 0.05, 0, -0.55, lx + 0.05, h, -0.45, 'steel', { collide: 'none', tint: 0x2f5fb3, noNav: true });
        box(lx - 0.05, 0, 0.45, lx + 0.05, h, 0.55, 'steel', { collide: 'none', tint: 0x2f5fb3, noNav: true });
      }
      for (let lv = 0; lv < levels; lv++) {
        const ly = lv === 0 ? 0 : (lv * h) / levels;
        if (lv > 0) {
          box(-len / 2, ly - 0.12, -0.55, len / 2, ly, -0.5, 'steel', { collide: 'none', tint: 0xe8601c, noNav: true });
          box(-len / 2, ly - 0.12, 0.5, len / 2, ly, 0.55, 'steel', { collide: 'none', tint: 0xe8601c, noNav: true });
        }
        for (let i = 0; i < bays; i++) {
          for (let k = 0; k < 2; k++) {
            if (rnd() < 0.18) continue;
            const gx = -len / 2 + i * bw + (k + 0.5) * (bw / 2);
            const gh = 0.5 + rnd() * Math.min(1.1, h / levels - 0.4);
            box(gx - bw / 4 + 0.08, ly, -0.5, gx + bw / 4 - 0.08, ly + 0.14, 0.5, 'pallet', { collide: 'none', noNav: true });
            box(gx - bw / 4 + 0.1, ly + 0.14, -0.46, gx + bw / 4 - 0.1, ly + 0.14 + gh, 0.46, rnd() < 0.5 || o.cold ? 'wrap' : 'carton', { collide: 'none', noNav: true, tint: goods[Math.floor(rnd() * goods.length)] });
          }
        }
      }
      break;
    }
    case 'shelf': {
      const len = o.len ?? 2;
      box(-len / 2, 0, -0.3, len / 2, 2.2, 0.3, 'steel', { visible: false, occlude: false, noNav: true });
      for (const lx of [-len / 2, len / 2]) box(lx - 0.03, 0, -0.3, lx + 0.03, 2.2, 0.3, 'steel', { collide: 'none', tint: 0x707880, noNav: true });
      for (let lv = 0; lv < 4; lv++) {
        const ly = 0.1 + lv * 0.55;
        box(-len / 2, ly, -0.3, len / 2, ly + 0.03, 0.3, 'steel', { collide: 'none', tint: 0x8a9096, noNav: true });
        for (let k = 0; k < 3; k++) {
          if (rnd() < 0.25) continue;
          const gx = -len / 2 + (k + 0.5) * (len / 3);
          box(gx - len / 7, ly + 0.03, -0.25, gx + len / 7, ly + 0.03 + 0.2 + rnd() * 0.25, 0.25, o.cold ? 'wrap' : 'carton', { collide: 'none', noNav: true, tint: goods[Math.floor(rnd() * goods.length)] });
        }
      }
      break;
    }
    case 'serverRack': {
      // 42-HE-Schrank, Front zeigt nach lokal +Z
      box(-0.3, 0, -0.5, 0.3, 2.0, 0.5, 'server', { visible: false, occlude: true });
      b.decor('serverRack', [x, y, z], yawRot);
      break;
    }
    case 'serverRow': {
      // Reihe aus n Serverschränken (lokal entlang X), Front +Z, auf Paletten „geparkt“
      const n = o.n ?? 4;
      const w = 0.62;
      box((-n * w) / 2, 0, -0.55, (n * w) / 2, 2.0, 0.55, 'server', { visible: false, occlude: true });
      for (let i = 0; i < n; i++) {
        const [cx, cz] = place(x, z, rot, (-n * w) / 2 + w * (i + 0.5), 0, (-n * w) / 2 + w * (i + 0.5), 0);
        b.decor('serverRack', [cx, y, cz], yawRot);
      }
      // Kabelkanal oben drauf
      box((-n * w) / 2, 2.0, -0.12, (n * w) / 2, 2.12, 0.12, 'metal', { collide: 'none', tint: 0xc8c8c8, noNav: true });
      break;
    }
    case 'ups':
      box(-0.4, 0, -0.4, 0.4, 1.2, 0.4, 'white', { tint: 0xdcdcd8 });
      box(-0.25, 0.85, 0.4, 0.25, 1.05, 0.42, 'emissive', { collide: 'none', tint: 0x40ff80, noNav: true });
      break;
    case 'cooler':
      box(-0.5, 0, -0.4, 0.5, 2.0, 0.4, 'white', { tint: 0xe8ecef });
      b.decor('fanUnit', [x, y + 2.0, z], yawRot);
      break;
    case 'conveyor': {
      const len = o.len ?? 6;
      box(-len / 2, 0, -0.5, len / 2, 0.85, 0.5, 'steel', { tint: 0x5a6a7a, visible: false, occlude: true });
      box(-len / 2, 0.75, -0.55, len / 2, 0.9, -0.45, 'steel', { collide: 'none', tint: 0xd8b020, noNav: true });
      box(-len / 2, 0.75, 0.45, len / 2, 0.9, 0.55, 'steel', { collide: 'none', tint: 0xd8b020, noNav: true });
      box(-len / 2, 0.82, -0.45, len / 2, 0.84, 0.45, 'black', { collide: 'none', tint: 0x2a2a2a, noNav: true });
      for (let lx = -len / 2 + 0.6; lx < len / 2; lx += 1.5) {
        box(lx - 0.04, 0, -0.5, lx + 0.04, 0.75, -0.42, 'steel', { collide: 'none', tint: 0x707880, noNav: true });
        box(lx - 0.04, 0, 0.42, lx + 0.04, 0.75, 0.5, 'steel', { collide: 'none', tint: 0x707880, noNav: true });
      }
      break;
    }
    case 'cartons': {
      // lose Kartonstapel
      const n = o.n ?? 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const s = 0.4 + rnd() * 0.3;
        const lx = (rnd() - 0.5) * 1.2;
        const lz = (rnd() - 0.5) * 1.2;
        const ly = i % 3 === 2 ? 0.4 : 0;
        box(lx - s / 2, ly, lz - s / 2, lx + s / 2, ly + s * 0.8, lz + s / 2, o.cold ? 'wrap' : 'carton', { tint: goods[Math.floor(rnd() * goods.length)], collide: 'none', noNav: true });
      }
      break;
    }
    case 'ibc':
      box(-0.6, 0, -0.5, 0.6, 1.16, 0.5, 'cage', { visible: false, occlude: true });
      b.decor('ibc', [x, y, z], yawRot);
      break;
    case 'desk':
      box(-0.8, 0.72, -0.4, 0.8, 0.76, 0.4, 'wood', { tint: 0xb8a58a });
      box(-0.78, 0, -0.38, -0.7, 0.72, 0.38, 'metal', { tint: 0x707070, collide: 'none' });
      box(0.7, 0, -0.38, 0.78, 0.72, 0.38, 'metal', { tint: 0x707070, collide: 'none' });
      box(-0.25, 0.76, -0.25, 0.25, 1.1, -0.2, 'black', { collide: 'none', noNav: true });
      box(-0.8, 0, -0.4, 0.8, 0.76, 0.4, 'wood', { visible: false, occlude: false });
      break;
    case 'bumper':
      box(-0.25, 0, -0.15, 0.25, 0.5, 0.15, 'rubber', { tint: 0x222222 });
      break;
    case 'lampPost':
      box(-0.12, 0, -0.12, 0.12, 7.5, 0.12, 'steel', { tint: 0x5a6068, noNav: true });
      b.decor('lampPost', [x, y + 7.5, z], yawRot);
      b.light({ kind: 'lamp', pos: [x, y + 7.2, z], color: 0xffc98a, intensity: 1.0, range: 18 });
      break;
    case 'fence': {
      // Bauzaun / Gitterzaun (blockiert Bewegung, Schüsse gehen durch), Länge len entlang lokal X
      const len = o.len ?? 4;
      const h = o.h ?? 2.2;
      box(-len / 2, 0, -0.04, len / 2, h, 0.04, 'cage', { collide: 'move', occlude: false, uv: 1, noNav: true, tag: 'fence' });
      for (let lx = -len / 2; lx <= len / 2 + 1e-6; lx += 2.5) {
        const [cx, cz] = place(x, z, rot, lx, 0, lx, 0);
        b.decor('fencePost', [cx, y, cz], yawRot, [1, h, 1]);
      }
      break;
    }
    case 'handTruck':
      box(-0.28, 0, -0.6, 0.28, 0.12, 0.6, 'metal', { tint: 0xc82020, collide: 'none' });
      box(-0.05, 0.1, 0.55, 0.05, 1.2, 0.62, 'metal', { tint: 0x222222, collide: 'none', noNav: true });
      break;
    case 'cableTray': {
      const len = o.len ?? 6;
      b.decor(rot % 2 === 0 ? 'cableTrayX' : 'cableTrayZ', [x, y, z], 0, [len, 1, 1]);
      break;
    }
    case 'locker':
      box(-0.45, 0, -0.25, 0.45, 1.9, 0.25, 'metal', { tint: 0x8a9aa8 });
      break;
    case 'rollerDoor': {
      // Rolltor in einer Fassade: Rückseite an der Wand (lokal z = 0), Front +Z; w = len, h = h
      const w = o.len ?? 3.6;
      const h = o.h ?? 4;
      box(-w / 2, 0, 0, w / 2, h, 0.1, 'gate', { collide: 'none', tint: o.tint ?? 0xb8c0c8, uvFit: true, noNav: true, occlude: false });
      box(-w / 2 - 0.18, 0, 0, -w / 2, h + 0.3, 0.2, 'hazard', { collide: 'none', noNav: true, occlude: false });
      box(w / 2, 0, 0, w / 2 + 0.18, h + 0.3, 0.2, 'hazard', { collide: 'none', noNav: true, occlude: false });
      box(-w / 2 - 0.2, h, 0, w / 2 + 0.2, h + 0.55, 0.32, 'metal', { collide: 'none', tint: 0x6a7480, noNav: true, occlude: false });
      break;
    }
    case 'doorSteel': {
      const w = o.len ?? 1.2;
      box(-w / 2, 0, 0, w / 2, 2.2, 0.08, 'door', { collide: 'none', tint: o.tint ?? 0x7a8a9a, uvFit: true, noNav: true, occlude: false });
      box(-w / 2 - 0.08, 0, 0, w / 2 + 0.08, 2.3, 0.04, 'metal', { collide: 'none', tint: 0x4a4e52, noNav: true, occlude: false });
      break;
    }
    case 'acUnit':
      box(-0.9, 0, -0.6, 0.9, 1.1, 0.6, 'vent', { collide: 'none', tint: 0xc0c6ca, noNav: true });
      b.decor('fanUnit', [x, y + 1.1, z], yawRot);
      break;
    case 'electricBox':
      box(-0.45, 0, 0, 0.45, 1.3, 0.32, 'metal', { collide: 'none', tint: o.tint ?? 0xa8b0a0, noNav: true, occlude: false });
      box(-0.3, 0.9, 0.32, -0.05, 1.05, 0.34, 'hazard', { collide: 'none', noNav: true, occlude: false });
      break;
    case 'cones':
      for (const [lx, lz] of [[0, 0], [0.7, 0.3], [-0.5, 0.6]] as const) {
        const [cx, cz] = place(x, z, rot, lx, lz, lx, lz);
        b.decor('cone', [cx, y, cz]);
      }
      break;
    case 'generator':
      box(-1.4, 0, -0.7, 1.4, 1.7, 0.7, 'metal', { tint: 0x3a6a3a });
      box(-1.2, 1.7, -0.2, -0.9, 2.4, 0.1, 'black', { collide: 'none', noNav: true });
      break;
    case 'silo': {
      // stehender Großtank: len = Durchmesser, h = Höhe. Kollision als gestufter Achteck-Kern
      // (drei Quader), Darstellung als Zylinder mit Kuppel; Steigleiter an der Front (+Z).
      const d = o.len ?? 6;
      const r = d / 2;
      const h = o.h ?? 14;
      const a = r * 0.92;
      const c = r * 0.38;
      const k = r * 0.66;
      for (const [hx, hz] of [[a, c], [c, a], [k, k]] as const) box(-hx, 0, -hz, hx, h, hz, 'metal', { visible: false, occlude: true });
      b.decor('tank', [x, y, z], 0, [r, h, r], o.tint ?? 0xe6edf2);
      b.decor('tankDome', [x, y + h, z], 0, [r, r * 0.32, r], o.tint ?? 0xe6edf2);
      // Steigleiter: zwei Holme und Sprossen, nur Optik
      for (const lx of [-0.22, 0.22]) box(lx - 0.02, 0, r - 0.02, lx + 0.02, h * 0.92, r + 0.06, 'metal', { collide: 'none', tint: 0x6a727a, noNav: true, occlude: false });
      for (let ly = 0.4; ly < h * 0.92; ly += 0.42) box(-0.22, ly, r - 0.02, 0.22, ly + 0.03, r + 0.04, 'metal', { collide: 'none', tint: 0x6a727a, noNav: true, occlude: false });
      b.decor('pipeY', [x + 0.0, y, z - r - 0.12], 0, [0.5, h * 0.8, 0.5], 0xb8c2cb);
      break;
    }
    case 'chiller':
      // luftgekühlter Verflüssiger auf Füßen (Kältetechnik): Deckung mit offenem Durchgang darunter
      box(-1.6, 0.55, -0.75, 1.6, 1.75, 0.75, 'white', { visible: false, occlude: true });
      for (const lx of [-1.4, 1.4]) box(lx - 0.1, 0, -0.65, lx + 0.1, 0.55, 0.65, 'steel', { visible: false, occlude: true });
      b.decor('condenser', [x, y, z], yawRot, undefined, o.tint ?? 0xffffff);
      break;
    case 'compressor':
      box(-1.3, 0, -0.7, 1.3, 1.55, 0.7, 'metal', { visible: false, occlude: true });
      b.decor('compressor', [x, y, z], yawRot);
      break;
    case 'stripCurtain': {
      // Streifenvorhang vor einem Kühlraumdurchgang: nur Optik (Breite len, Höhe h), keine Kollision
      const w = o.len ?? 2.4;
      b.decor('stripCurtain', [x, y, z], yawRot, [w, o.h ?? 2.4, 1], o.tint ?? 0xffffff);
      break;
    }
    case 'rollCage': {
      // Rollcontainer mit Ware: Gitter blockiert Bewegung, Ware auch Schüsse
      box(-0.4, 0, -0.35, 0.4, 0.14, 0.35, 'steel', { tint: 0x5a6a7a, collide: 'none', noNav: true });
      box(-0.4, 0.14, -0.35, 0.4, 1.7, 0.35, 'cage', { collide: 'move', tint: 0x9aa8b4, uv: 0.8, noNav: true, occlude: false });
      box(-0.36, 0.2, -0.31, 0.36, 0.2 + (o.h ?? 1.0), 0.31, o.cold ? 'wrap' : 'carton', { tint: goods[Math.floor(rnd() * goods.length)] });
      break;
    }
    case 'sacks': {
      // Sackstapel (Kaffee/Gewürze, Sandsack-Ersatz der Banane): len = Breite (lokal X), n = Lagen. Je Lage zwei Säcke
      // tief, jede höhere Lage um einen Sack kürzer (Pyramide). Kollision: ein Quader je Lage; Darstellung: Sack-Instanzen.
      const len = o.len ?? 3.6;
      const rows = o.n ?? 4;
      for (let r = 0; r < rows; r++) {
        const rl = len - r * SACK_L;
        if (rl < SACK_L - 1e-6) break;
        box(-rl / 2, r * SACK_H, -SACK_W, rl / 2, (r + 1) * SACK_H, SACK_W, 'sack', { visible: false, occlude: true });
        const cols = Math.max(1, Math.round(rl / SACK_L));
        for (let c = 0; c < cols; c++) for (const s of [-1, 1]) {
          const [cx, cz] = place(x, z, rot, (c - (cols - 1) / 2) * SACK_L, s * SACK_W * 0.5, (c - (cols - 1) / 2) * SACK_L, s * SACK_W * 0.5);
          b.decor('sack', [cx, y + r * SACK_H, cz], yawRot + (rnd() - 0.5) * 0.12, undefined, o.tint ?? SACK_TINTS[Math.floor(rnd() * SACK_TINTS.length)]);
        }
      }
      break;
    }
    case 'van': {
      // Lieferwagen (Front +Z, 4.6 × 1.9 m): Kofferaufbau und Fahrerhaus als Kollision, Darstellung als Deko-Modell
      box(-0.95, 0.38, -2.25, 0.95, 2.3, 0.75, 'metal', { visible: false, occlude: true });
      box(-0.95, 0.38, 0.75, 0.95, 1.55, 2.3, 'metal', { visible: false, occlude: true });
      b.decor('van', [x, y, z], yawRot, undefined, o.tint ?? 0xd9d4c4);
      break;
    }
    case 'fountain': {
      // Brunnen: len = Beckendurchmesser; Kollision: gestufter Achteck-Kern (Beckenrand 0.75 m) + Sockel der Säule
      const r = (o.len ?? 4.4) / 2;
      const a = r * 0.92;
      const c = r * 0.38;
      const k = r * 0.66;
      for (const [hx, hz] of [[a, c], [c, a], [k, k]] as const) box(-hx, 0, -hz, hx, 0.75, hz, 'concrete', { visible: false, occlude: true, noNav: true });
      box(-0.45, 0.75, -0.45, 0.45, 2.3, 0.45, 'concrete', { visible: false, occlude: true });
      b.decor('fountain', [x, y, z], 0, [r, o.h ?? 1, r], o.tint ?? 0xb8b0a0);
      break;
    }
    case 'hoist': {
      // Seilwinden-Erker (Speicherluke): Rückseite an der Wand (lokal z = 0), Front +Z. len = Luke breit, h = Luke hoch,
      // n > 0: Last (Kiste) am Seil. Nur Optik (liegt über Kopfhöhe oder in der Fassade).
      const w = o.len ?? 1.6;
      const h = o.h ?? 2.4;
      const fx = { collide: 'none' as const, noNav: true, occlude: false };
      box(-w / 2, 0, 0, w / 2, h, 0.06, 'black', { ...fx, tint: 0x2a1c12 });
      for (const s of [-1, 1]) box(s > 0 ? w / 2 : -w / 2 - 0.62, 0, 0.06, s > 0 ? w / 2 + 0.62 : -w / 2, h, 0.13, 'wood', { ...fx, tint: o.tint ?? 0x3c5a48 });
      box(-w / 2 - 0.1, h, 0, w / 2 + 0.1, h + 0.2, 0.22, 'wood', { ...fx, tint: 0x4a3422 });
      box(-w / 2 - 0.1, -0.12, 0, w / 2 + 0.1, 0.04, 0.34, 'concrete', { ...fx, tint: 0xa89c8c });
      // Balken mit Seilrolle, Stütze, Schutzdach
      box(-0.09, h + 0.62, 0, 0.09, h + 0.8, 1.6, 'wood', { ...fx, tint: 0x3a2a1c });
      box(-0.07, h + 0.2, 0.0, 0.07, h + 0.62, 0.12, 'wood', { ...fx, tint: 0x3a2a1c });
      box(-0.07, h + 0.2, 0.7, 0.07, h + 0.62, 0.78, 'wood', { ...fx, tint: 0x3a2a1c });
      box(-w / 2 - 0.25, h + 0.82, 0, w / 2 + 0.25, h + 0.9, 1.0, 'roof', { ...fx, tint: 0x6a4a3a });
      box(-0.02, h + 0.8 - 2.6, 1.5, 0.02, h + 0.62, 1.54, 'black', { ...fx, tint: 0x7a6a48 });
      box(-0.07, h + 0.8 - 2.74, 1.45, 0.07, h + 0.8 - 2.6, 1.59, 'steel', { ...fx, tint: 0x4a4a4a });
      if ((o.n ?? 0) > 0) box(-0.3, h + 0.8 - 3.34, 1.24, 0.3, h + 0.8 - 2.74, 1.84, 'crate', { ...fx, uv: 0.6 });
      break;
    }
    case 'archGate': {
      // Torbogen: len = lichte Weite (Rundbogen), h = Scheitelhöhe, n = Pfeilerbreite. Durchgang entlang lokal Z, Dicke 0.9 m.
      // Pfeiler/Aufsatz sind massiv, die Zwickel (Schüsse blockiert, Bewegung frei) füllen die Lücke zum Rundbogen.
      const w = o.len ?? 5;
      const h = o.h ?? 4.4;
      const pier = o.n ?? 1.2;
      const t = 0.45;
      const a = w / 2;
      const spring = h - a;
      const tint = o.tint ?? 0xc9a08c;
      box(-a - pier, 0, -t, -a, h + 1, t, 'brick', { tint });
      box(a, 0, -t, a + pier, h + 1, t, 'brick', { tint });
      box(-a, h, -t, a, h + 1, t, 'brick', { tint });
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const x0 = (a * i) / steps;
        const x1 = (a * (i + 1)) / steps;
        const top = spring + Math.sqrt(Math.max(0, a * a - x0 * x0));
        if (top > h - 1e-6) continue; // Scheitelscheibe: kein Zwickel
        for (const s of [-1, 1]) box(Math.min(s * x0, s * x1), top, -t, Math.max(s * x0, s * x1), h, t, 'brick', { tint, collide: 'shot', noNav: true });
      }
      box(-a - pier - 0.12, h + 1, -t - 0.12, a + pier + 0.12, h + 1.22, t + 0.12, 'concrete', { tint: 0xc8b8a0, collide: 'none', noNav: true });
      b.decor('archRing', [x, y + spring, z], yawRot, [a, a, t * 2 + 0.14], 0xe4d6b8);
      break;
    }
    case 'archive': {
      // Aktenregal (Archiv/Bibliothek): len entlang lokal X, Tiefe 0.56, Höhe 2.3; Aktenordner als farbige Blöcke
      const len = o.len ?? 2.4;
      box(-len / 2, 0, -0.28, len / 2, 2.3, 0.28, 'wood', { visible: false, occlude: false, noNav: true });
      for (const lx of [-len / 2, len / 2]) box(lx - 0.04, 0, -0.28, lx + 0.04, 2.3, 0.28, 'wood', { collide: 'none', tint: 0x5a3e26, noNav: true });
      for (let lv = 0; lv < 5; lv++) {
        const ly = 0.12 + lv * 0.5;
        box(-len / 2, ly, -0.28, len / 2, ly + 0.04, 0.28, 'wood', { collide: 'none', tint: 0x6a4a30, noNav: true });
        const groups = Math.max(2, Math.round(len / 0.5));
        for (let g = 0; g < groups; g++) {
          if (rnd() < 0.12) continue;
          const gx0 = -len / 2 + 0.06 + (g * (len - 0.12)) / groups;
          const gx1 = -len / 2 + 0.06 + ((g + 1) * (len - 0.12)) / groups - 0.03;
          box(gx0, ly + 0.04, -0.24, gx1, ly + 0.04 + 0.28 + rnd() * 0.12, 0.24, 'carton', { collide: 'none', noNav: true, tint: ARCHIVE_TINTS[Math.floor(rnd() * ARCHIVE_TINTS.length)] });
        }
      }
      break;
    }
    case 'crane': {
      // Hafenkran (Ausleger entlang lokal +X): Sockel + Gittermast (Kollision: 0.8 m Pfeiler), Ausleger, Gegengewicht, Haken
      const h = o.h ?? 11;
      const jib = o.len ?? 9;
      const rust = o.tint ?? 0x9a5a3a;
      box(-1.1, 0, -1.1, 1.1, 0.5, 1.1, 'concrete', { tint: 0x8a8278 });
      box(-0.4, 0.5, -0.4, 0.4, h, 0.4, 'steel', { visible: false, occlude: true, noNav: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 0.36 - 0.04, 0.5, sz * 0.36 - 0.04, sx * 0.36 + 0.04, h, sz * 0.36 + 0.04, 'steel', { collide: 'none', tint: rust, noNav: true });
      for (let ly = 1.2; ly < h; ly += 1.2) box(-0.4, ly, -0.4, 0.4, ly + 0.06, 0.4, 'steel', { collide: 'none', tint: rust, noNav: true, occlude: false });
      box(-2.4, h, -0.22, jib, h + 0.5, 0.22, 'steel', { collide: 'none', tint: rust, noNav: true });
      box(-3.0, h - 0.2, -0.6, -1.4, h + 0.5, 0.6, 'concrete', { collide: 'none', tint: 0x6a6a68, noNav: true });
      box(-0.12, h + 0.5, -0.12, 0.12, h + 1.9, 0.12, 'steel', { collide: 'none', tint: rust, noNav: true });
      box(0.5, h - 1.8, 0.2, 1.7, h - 0.2, 0.9, 'metal', { collide: 'none', tint: 0x5a6a60, noNav: true });
      box(jib - 1.22, h - 7, -0.015, jib - 1.18, h, 0.015, 'black', { collide: 'none', tint: 0x4a4a4a, noNav: true, occlude: false });
      box(jib - 1.35, h - 7.5, -0.14, jib - 1.05, h - 7, 0.14, 'steel', { collide: 'none', tint: 0x3a3a3a, noNav: true, occlude: false });
      break;
    }
    case 'scaffold': {
      // Baugerüst (nur Optik): len entlang lokal X, Tiefe 1.1, Höhe h, Bohlenlagen alle 2 m
      const len = o.len ?? 4;
      const h = o.h ?? 6;
      const bays = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) {
        const lx = -len / 2 + (len * i) / bays;
        box(lx - 0.035, 0, s * 0.55 - 0.035, lx + 0.035, h, s * 0.55 + 0.035, 'steel', { collide: 'none', tint: 0x9aa0a4, noNav: true, occlude: false });
      }
      for (let ly = 2; ly <= h; ly += 2) {
        for (const s of [-1, 1]) box(-len / 2, ly + 0.9, s * 0.55 - 0.02, len / 2, ly + 0.94, s * 0.55 + 0.02, 'steel', { collide: 'none', tint: 0x9aa0a4, noNav: true, occlude: false });
        box(-len / 2, ly, -0.55, len / 2, ly + 0.05, 0.55, 'wood', { collide: 'none', tint: 0xb09060, noNav: true, occlude: false });
      }
      break;
    }
    case 'gasLamp': {
      // Gaslaterne (4.2 m): Laternenmast als schlanke Säule (Kollision), warmes Licht
      box(-0.1, 0, -0.1, 0.1, 4.2, 0.1, 'metal', { visible: false, occlude: true, noNav: true, tag: 'pillar' });
      b.decor('lantern', [x, y, z], yawRot);
      b.light({ kind: 'lamp', pos: [x, y + 3.85, z], color: 0xffb868, intensity: 1.05, range: 15 });
      break;
    }
    case 'logs': {
      // Baumstammstapel (liegend entlang lokal X, Länge len): n Stämme in der untersten Lage, jede Lage einer weniger
      const len = o.len ?? 3.2;
      const n = o.n ?? 3;
      for (let r = 0; r < n; r++) {
        const cnt = n - r;
        for (let i = 0; i < cnt; i++) {
          const [cx, cz] = place(x, z, rot, 0, (i - (cnt - 1) / 2) * LOG_D, 0, (i - (cnt - 1) / 2) * LOG_D);
          b.decor('log', [cx, y + LOG_R + r * 0.47, cz], yawRot, [len, 1, 1], LOG_TINTS[Math.floor(rnd() * LOG_TINTS.length)]);
        }
      }
      box(-len / 2, 0, -(n * LOG_D) / 2, len / 2, LOG_R * 2 + (n - 1) * 0.47, (n * LOG_D) / 2, 'wood', { visible: false, occlude: true, noNav: true });
      break;
    }
  }
}

const SACK_L = 0.9;
const SACK_W = 0.5;
const SACK_H = 0.28;
const SACK_TINTS = [0xc9ad7c, 0xbf9f6c, 0xd2b88a, 0xb8996a, 0xcdb890];
const ARCHIVE_TINTS = [0x8a3a30, 0x3a5a7a, 0x6a6a40, 0x7a5a3a, 0xc0a878, 0x4a6a50, 0x9a8a6a];
const LOG_R = 0.27;
const LOG_D = 0.54;
const LOG_TINTS = [0x6b4a30, 0x7a5a3a, 0x5e4630, 0x80603e];

/** Hilfsmaß: Grundfläche (Breite x Tiefe) einer Requisite nach Drehung. */
export function propFootprint(kind: PropKind, rot = 0): [number, number] {
  const base: Partial<Record<PropKind, [number, number]>> = {
    pallet: [1.2, 0.8], palletGoods: [1.2, 0.8], crate: [1.2, 1.2], crateStack: [1.8, 1.8], container: [6.1, 2.44], container40: [12.2, 2.44],
    trailer: [13.6, 2.6], forklift: [1.2, 2.0], barrel: [0.6, 0.6], gitterbox: [1.24, 0.84], serverRack: [0.6, 1.0], van: [1.9, 4.6],
  };
  const [w, d] = base[kind] ?? [1, 1];
  return dims(w, d, rot);
}

export type { Vec3 };
