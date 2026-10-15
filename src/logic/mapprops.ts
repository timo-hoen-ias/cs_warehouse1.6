import type { MapBuilder, MaterialId, Vec3 } from './mapkit';
import { dims, place, type PropOpts } from './propgeom';
import { isRailKind, railProp, type RailPropKind } from './railprops';
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
  | RailPropKind;

const GOODS = [0xc9a26b, 0xb8895a, 0xd8c09a, 0x9fb7c9, 0xc6c6c0, 0xd0a060, 0x8fa86a, 0xc77b5a];
const CONTAINERS = [0xa8432b, 0x2b5f9e, 0x2f7d4f, 0xb7791f, 0x8a8f96, 0x6b3a7a, 0xc0b8a8];

export function prop(b: MapBuilder, kind: PropKind, x: number, y: number, z: number, o: PropOpts = {}): void {
  if (isRailKind(kind)) {
    railProp(b, kind, x, y, z, o);
    return;
  }
  const rot = o.rot ?? 0;
  const rnd = mulberry32(o.seed ?? Math.floor(Math.abs(x * 73.1 + z * 37.7 + y * 11.3)) + 1);
  const box = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: MaterialId, extra: Parameters<MapBuilder['box']>[3] = {}) => {
    const [a, c, bb, d] = place(x, z, rot, lx0, lz0, lx1, lz1);
    // Oberseiten über Sprunghöhe sind kein Navigationsboden (Lkw-Dach, Container ohne Treppe …)
    return b.box([a, y + ly0, c], [bb, y + ly1, d], mat, { tag: 'prop', noNav: ly1 >= 1.9 ? true : undefined, ...extra });
  };
  const yawRot = (rot * Math.PI) / 2;
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
      box(-0.58, 0.15, -0.38, 0.58, 0.15 + h, 0.38, 'wrap', { tint: o.tint ?? GOODS[Math.floor(rnd() * GOODS.length)] });
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
            box(gx - bw / 4 + 0.1, ly + 0.14, -0.46, gx + bw / 4 - 0.1, ly + 0.14 + gh, 0.46, rnd() < 0.5 ? 'wrap' : 'carton', { collide: 'none', noNav: true, tint: GOODS[Math.floor(rnd() * GOODS.length)] });
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
          box(gx - len / 7, ly + 0.03, -0.25, gx + len / 7, ly + 0.03 + 0.2 + rnd() * 0.25, 0.25, 'carton', { collide: 'none', noNav: true, tint: GOODS[Math.floor(rnd() * GOODS.length)] });
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
        box(lx - s / 2, ly, lz - s / 2, lx + s / 2, ly + s * 0.8, lz + s / 2, 'carton', { tint: GOODS[Math.floor(rnd() * GOODS.length)], collide: 'none', noNav: true });
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
  }
}

/** Hilfsmaß: Grundfläche (Breite x Tiefe) einer Requisite nach Drehung. */
export function propFootprint(kind: PropKind, rot = 0): [number, number] {
  const base: Partial<Record<PropKind, [number, number]>> = {
    pallet: [1.2, 0.8], palletGoods: [1.2, 0.8], crate: [1.2, 1.2], crateStack: [1.8, 1.8], container: [6.1, 2.44], container40: [12.2, 2.44],
    trailer: [13.6, 2.6], forklift: [1.2, 2.0], barrel: [0.6, 0.6], gitterbox: [1.24, 0.84], serverRack: [0.6, 1.0],
    boxcar: [14, 3], tankcar: [14, 3], flatcar: [14, 3], loco: [18, 3], bufferStop: [0.9, 2.6], signal: [0.6, 0.6],
  };
  const [w, d] = base[kind] ?? [1, 1];
  return dims(w, d, rot);
}

export type { Vec3, PropOpts };
