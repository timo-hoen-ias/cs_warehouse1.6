import type { BrushOpts, MapBuilder, MaterialId } from './mapkit';
import { localPoint, place, type PropOpts } from './propgeom';
import { mulberry32 } from './rng';

/**
 * Umschlag-Requisiten (pure): Lieferwagen, Rolltor-Bucht (Dock), Topfpflanze, Stuhlstapel, Tisch, Bank,
 * Arbeitstisch/Küchenzeile, Herd mit Haube, aufgeständerter Sortierförderer, Pförtnerhaus und Leitstand-Pult.
 * Lokale Länge entlang X, Front +Z (Fahrzeuge: Nase bei +X), (x, y, z) = Fußpunkt-Mitte; Drehung in
 * Vierteldrehungen wie alle Requisiten (`propgeom.ts`).
 */
export type HubPropKind = 'van' | 'dockBay' | 'plant' | 'chairStack' | 'table' | 'bench' | 'counter' | 'stove' | 'gantryConveyor' | 'gatehouse' | 'console';

export const HUB_KINDS: readonly HubPropKind[] = ['van', 'dockBay', 'plant', 'chairStack', 'table', 'bench', 'counter', 'stove', 'gantryConveyor', 'gatehouse', 'console'];

export function isHubKind(kind: string): kind is HubPropKind {
  return (HUB_KINDS as readonly string[]).includes(kind);
}

/** Maße (m): Lieferwagen und Förderband (Bandhöhe über Boden). */
export const HUB = { vanLength: 5.6, vanWidth: 2.1, vanHeight: 2.7, gantryBelt: 3.0, gatehouse: [4.0, 3.0] as const } as const;

const VAN_TINTS = [0xf2f0e8, 0xe8c020, 0xd8dde2, 0xc0462c, 0x3a6fb0];
const LEAVES = [0x4f8a3a, 0x3f7a2c, 0x5c9a40, 0x2f6a28, 0x6aa046];
const PARCELS = [0xc9a26b, 0xb8895a, 0xd8c09a, 0xa88a60, 0xc6c6c0];
const CHAIRS = [0x3a6fb0, 0xd8b020, 0xc0462c, 0x4f8a5a, 0xe8e8e0];

export function hubProp(b: MapBuilder, kind: HubPropKind, x: number, y: number, z: number, o: PropOpts = {}): void {
  const rot = o.rot ?? 0;
  const rnd = mulberry32(o.seed ?? Math.floor(Math.abs(x * 71.3 + z * 39.1 + y * 13.7)) + 3);
  const yaw = (rot * Math.PI) / 2;
  const box = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: MaterialId, extra: BrushOpts = {}) => {
    const [a, c, bb, d] = place(x, z, rot, lx0, lz0, lx1, lz1);
    return b.box([a, y + ly0, c], [bb, y + ly1, d], mat, { tag: 'prop', noNav: ly1 >= 1.9 ? true : undefined, ...extra });
  };
  /** Reine Optik: keine Kollision, kein Schatten, kein Navigationsboden. */
  const deco = (lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: MaterialId, tint?: number, extra: BrushOpts = {}) =>
    box(lx0, ly0, lz0, lx1, ly1, lz1, mat, { collide: 'none', noNav: true, occlude: false, tint, ...extra });
  const wheel = (lx: number, lz: number): void => {
    const [wx, wz] = localPoint(x, z, rot, lx, lz);
    b.decor('wheel', [wx, y + 0.34, wz], yaw + Math.PI / 2, [0.62, 0.62, 0.62]);
  };

  switch (kind) {
    case 'van': {
      // Lieferwagen (Kastenwagen): Laderaum hinten (−X), Fahrerhaus vorn (+X), Hecktüren mit Streifen
      const L = HUB.vanLength / 2;
      const W = HUB.vanWidth / 2;
      const tint = o.tint ?? VAN_TINTS[Math.floor(rnd() * VAN_TINTS.length)]!;
      box(-L, 0.38, -W, L * 0.35, HUB.vanHeight, W, 'metal', { tint });
      box(L * 0.35, 0.38, -W, L, 1.5, W, 'metal', { tint });
      box(L * 0.35, 1.5, -W + 0.05, L - 0.4, HUB.vanHeight - 0.3, W - 0.05, 'metal', { tint, collide: 'none', noNav: true });
      // Scheiben (Front und Seiten), Hecktüren, Streifen, Stoßfänger
      deco(L - 0.42, 1.55, -W + 0.12, L - 0.38, 2.35, W - 0.12, 'window', 0xaec4d4, { uvFit: true });
      for (const s of [-1, 1]) deco(L * 0.35 + 0.1, 1.55, s * W - 0.02, L - 0.7, 2.3, s * W + 0.02, 'window', 0xaec4d4, { uvFit: true });
      deco(-L - 0.04, 0.5, -W + 0.08, -L, HUB.vanHeight - 0.15, W - 0.08, 'door', 0xb8bcc0, { uvFit: true });
      deco(-L - 0.05, 0.38, -W, -L + 0.05, 0.62, W, 'black', 0x2a2a2a);
      for (const s of [-1, 1]) deco(-L, 1.1, s * W - 0.03, L * 0.35, 1.4, s * W + 0.03, 'emissive', 0xe08a1c);
      deco(L, 0.38, -W, L + 0.12, 0.62, W, 'black', 0x2a2a2a);
      deco(L, 0.8, -W + 0.2, L + 0.04, 1.0, -W + 0.5, 'emissive', 0xfff2c0);
      deco(L, 0.8, W - 0.5, L + 0.04, 1.0, W - 0.2, 'emissive', 0xfff2c0);
      for (const lx of [-L * 0.6, L * 0.62]) for (const s of [-1, 1]) wheel(lx, s * (W - 0.05));
      deco(-L * 0.9, 0.3, -W + 0.1, L * 0.9, 0.42, W - 0.1, 'black', 0x2a2a2a);
      break;
    }
    case 'dockBay': {
      // Rolltor-Bucht an einer Fassade: Rückseite bei lokal z = 0, Front +Z; Tor halb geöffnet (Dunkelheit dahinter),
      // Puffer, Warnleuchte, Bucht-Nummer (n) und Hochleiter-Platte. len = Breite, h = Höhe.
      const w = o.len ?? 3.4;
      const h = o.h ?? 3.8;
      deco(-w / 2, 0, 0, w / 2, h, 0.06, 'black', 0x101214);
      const open = 0.35 + rnd() * 0.3;
      deco(-w / 2, h * open, 0.06, w / 2, h, 0.14, 'gate', 0xc6ccd2, { uvFit: true });
      deco(-w / 2 - 0.22, 0, 0, -w / 2, h + 0.3, 0.24, 'hazard', undefined, { uv: 1 });
      deco(w / 2, 0, 0, w / 2 + 0.22, h + 0.3, 0.24, 'hazard', undefined, { uv: 1 });
      deco(-w / 2 - 0.22, h, 0, w / 2 + 0.22, h + 0.5, 0.32, 'metal', 0x6a7480);
      for (const s of [-1, 1]) deco(s * (w / 2 - 0.35) - 0.15, 0.9, 0.06, s * (w / 2 - 0.35) + 0.15, 1.5, 0.4, 'rubber', 0x222222);
      deco(-w / 2, 0, 0.06, w / 2, 0.14, 1.1, 'steel', 0x5a6a7a);
      deco(-0.15, h + 0.55, 0.0, 0.15, h + 0.85, 0.2, 'emissive', 0xff8a20);
      if (o.n !== undefined) {
        const face = (['pz', 'nx', 'nz', 'px'] as const)[((rot % 4) + 4) % 4]!;
        const [sx, sz] = localPoint(x, z, rot, 0, 0.34);
        b.sign(String(o.n), [sx, y + h + 0.3, sz], face, 0.9, 0.5, { color: 0xffd040, bg: 0x20262c });
      }
      break;
    }
    case 'plant': {
      // Topfpflanze (Dschungel): Topf kollidiert, Blattwerk nur Optik; h = Gesamthöhe
      const h = o.h ?? 1.3;
      box(-0.28, 0, -0.28, 0.28, 0.5, 0.28, 'plaster', { tint: 0xb4693f });
      deco(-0.3, 0.46, -0.3, 0.3, 0.52, 0.3, 'rubber', 0x3a2c22);
      const n = 5 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const w = 0.35 + rnd() * 0.3;
        const cx = (rnd() - 0.5) * 0.55;
        const cz = (rnd() - 0.5) * 0.55;
        const y0 = 0.5 + rnd() * h * 0.25;
        const hh = h * (0.35 + rnd() * 0.45);
        deco(cx - w / 2, y0, cz - w / 2, cx + w / 2, Math.min(h, y0 + hh), cz + w / 2, 'foliage', LEAVES[Math.floor(rnd() * LEAVES.length)]!);
      }
      break;
    }
    case 'chairStack': {
      // Stuhlstapel (Pausenraum): Sitzflächen übereinander, Lehne und Beine als Optik; n = Anzahl
      const n = o.n ?? 6;
      const tint = o.tint ?? CHAIRS[Math.floor(rnd() * CHAIRS.length)]!;
      box(-0.25, 0, -0.25, 0.25, Math.min(1.6, 0.44 + n * 0.1), 0.25, 'rubber', { tint, visible: false, occlude: true });
      for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const) deco(lx - 0.02, 0, lz - 0.02, lx + 0.02, 0.45, lz + 0.02, 'steel', 0x6a7078);
      for (let i = 0; i < n; i++) {
        deco(-0.24, 0.44 + i * 0.1, -0.24, 0.24, 0.48 + i * 0.1, 0.24, 'rubber', tint);
        deco(-0.24, 0.48 + i * 0.1, -0.26, 0.24, 0.62 + i * 0.1, -0.22, 'rubber', tint);
      }
      break;
    }
    case 'table': {
      // Kantinentisch mit zwei Bänken; len = Länge (Standard 2.0)
      const L = (o.len ?? 2) / 2;
      box(-L, 0.72, -0.4, L, 0.76, 0.4, 'wood', { tint: 0xc8b090 });
      for (const lx of [-L + 0.1, L - 0.1]) for (const s of [-1, 1]) deco(lx - 0.03, 0, s * 0.32 - 0.03, lx + 0.03, 0.72, s * 0.32 + 0.03, 'steel', 0x6a7078);
      for (const s of [-1, 1]) {
        deco(-L + 0.1, 0.42, s * 0.62 - 0.14, L - 0.1, 0.46, s * 0.62 + 0.14, 'wood', 0x9a7a54);
        for (const lx of [-L + 0.2, L - 0.2]) deco(lx - 0.03, 0, s * 0.62 - 0.03, lx + 0.03, 0.42, s * 0.62 + 0.03, 'steel', 0x6a7078);
      }
      box(-L, 0.72, -0.4, L, 0.76, 0.4, 'wood', { visible: false, occlude: false });
      break;
    }
    case 'bench': {
      // Bank / Packtisch-Sitzbank: Sitzhöhe 0.5 (begehbar), len = Länge
      const L = (o.len ?? 2.4) / 2;
      box(-L, 0.38, -0.25, L, 0.5, 0.25, 'wood', { tint: 0xa88458 });
      for (const lx of [-L + 0.15, L - 0.15]) box(lx - 0.06, 0, -0.22, lx + 0.06, 0.38, 0.22, 'steel', { tint: 0x4a5058 });
      deco(-L, 0.5, -0.26, L, 0.95, -0.2, 'wood', 0x8f6e48);
      break;
    }
    case 'counter': {
      // Edelstahl-Arbeitstisch / Küchenzeile: Korpus + Platte + Abstellfach; len = Länge
      const L = (o.len ?? 2.4) / 2;
      box(-L, 0, -0.35, L, 0.9, 0.35, 'steel', { tint: o.tint ?? 0xc8d0d6 });
      deco(-L - 0.02, 0.9, -0.38, L + 0.02, 0.94, 0.38, 'metal', 0xe6ecf0);
      deco(-L + 0.1, 0.12, 0.35, L - 0.1, 0.16, 0.39, 'steel', 0x8a949c);
      for (let lx = -L + 0.6; lx < L - 0.2; lx += 0.8) deco(lx - 0.01, 0.2, 0.35, lx + 0.01, 0.85, 0.37, 'black', 0x3a3e42);
      break;
    }
    case 'stove': {
      // Großküchenherd (Front +Z) mit Abzugshaube und Töpfen
      box(-0.9, 0, -0.45, 0.9, 0.9, 0.45, 'steel', { tint: 0x9aa4ac });
      deco(-0.92, 0.9, -0.47, 0.92, 0.94, 0.47, 'black', 0x2a2c30);
      for (const lx of [-0.5, 0.0, 0.5]) deco(lx - 0.18, 0.94, -0.18, lx + 0.18, 1.2, 0.18, 'metal', 0x8a949c);
      for (const lx of [-0.55, 0.0, 0.55]) deco(lx - 0.12, 0.36, 0.45, lx + 0.12, 0.62, 0.49, 'black', 0x2a2c30);
      deco(-1.0, 2.0, -0.55, 1.0, 2.5, 0.35, 'steel', 0xb0bac2);
      deco(-0.25, 2.5, -0.3, 0.25, 3.2, 0.1, 'steel', 0xb0bac2);
      break;
    }
    case 'gantryConveyor': {
      // Aufgeständerter Sortierförderer: Band auf Bandhöhe, darunter frei begehbar (Stützen alle 4 m), Pakete obendrauf
      const L = (o.len ?? 12) / 2;
      const h = o.h ?? HUB.gantryBelt;
      box(-L, h - 0.35, -0.5, L, h, 0.5, 'steel', { tint: 0x5a6a7a });
      deco(-L, h, -0.55, L, h + 0.1, -0.45, 'steel', 0xd8b020);
      deco(-L, h, 0.45, L, h + 0.1, 0.55, 'steel', 0xd8b020);
      deco(-L, h - 0.02, -0.45, L, h + 0.02, 0.45, 'black', 0x2a2a2a);
      const n = Math.max(2, Math.round((L * 2) / 4) + 1);
      for (let i = 0; i < n; i++) {
        const lx = -L + 0.3 + ((2 * L - 0.6) * i) / (n - 1);
        box(lx - 0.1, 0, -0.45, lx + 0.1, h - 0.35, -0.3, 'steel', { tint: 0x707880 });
        box(lx - 0.1, 0, 0.3, lx + 0.1, h - 0.35, 0.45, 'steel', { tint: 0x707880 });
        deco(lx - 0.1, h - 0.7, -0.45, lx + 0.1, h - 0.6, 0.45, 'steel', 0x707880);
      }
      for (let lx = -L + 0.8; lx < L - 0.5; lx += 1.1 + rnd() * 1.4) {
        const s = 0.3 + rnd() * 0.25;
        deco(lx - s / 2, h + 0.02, -s / 2 + (rnd() - 0.5) * 0.3, lx + s / 2, h + 0.02 + s * 0.8, s / 2, 'carton', PARCELS[Math.floor(rnd() * PARCELS.length)]!);
      }
      break;
    }
    case 'gatehouse': {
      // Pförtnerhaus (Ticket-Häuschen): geschlossener Kasten mit Schiebefenster nach +Z, Vordach, Schranke
      const [gw, gd] = HUB.gatehouse;
      box(-gw / 2, 0, -gd / 2, gw / 2, 0.3, gd / 2, 'concrete', { tint: 0x8d8a84 });
      box(-gw / 2 + 0.1, 0.3, -gd / 2 + 0.1, gw / 2 - 0.1, 2.7, gd / 2 - 0.1, 'plaster', { tint: o.tint ?? 0xe8dcc0 });
      deco(-gw / 2 - 0.3, 2.7, -gd / 2 - 0.3, gw / 2 + 0.3, 2.9, gd / 2 + 0.5, 'roof', 0x6a7480, { collide: 'all', noNav: true, occlude: true });
      deco(-1.1, 1.2, gd / 2 - 0.1, 1.1, 2.3, gd / 2 - 0.06, 'window', 0xaec4d4, { uvFit: true });
      deco(-1.2, 1.1, gd / 2 - 0.12, 1.2, 1.2, gd / 2 + 0.2, 'wood', 0x7a5a3a);
      deco(-gw / 2 + 0.15, 0.3, gd / 2 - 0.1, -gw / 2 + 0.95, 2.1, gd / 2 - 0.05, 'door', 0x3a6fb0, { uvFit: true });
      deco(gw / 2 - 0.9, 1.4, gd / 2 - 0.1, gw / 2 - 0.3, 1.9, gd / 2 - 0.07, 'emissive', 0xffe8a0);
      deco(-gw / 2, 0.3, -gd / 2 - 0.02, gw / 2, 0.6, -gd / 2 + 0.1, 'hazard', undefined, { uv: 1 });
      break;
    }
    case 'console': {
      // Leitstand-Pult: Tisch mit Monitorreihe (leuchtende Flächen) und Stuhl; len = Länge, Front +Z
      const L = (o.len ?? 3) / 2;
      box(-L, 0.72, -0.45, L, 0.78, 0.45, 'metal', { tint: 0x5a6068 });
      box(-L, 0, -0.4, L, 0.72, 0.4, 'steel', { tint: 0x3a4046, visible: false, occlude: true });
      deco(-L, 0, -0.4, L, 0.72, 0.4, 'steel', 0x3a4046);
      const n = Math.max(1, Math.round(L * 2 / 0.8));
      for (let i = 0; i < n; i++) {
        const cx = -L + ((i + 0.5) * 2 * L) / n;
        deco(cx - 0.34, 0.9, -0.3, cx + 0.34, 1.35, -0.24, 'black', 0x1a1c20);
        deco(cx - 0.3, 0.94, -0.24, cx + 0.3, 1.31, -0.235, 'emissive', i % 2 ? 0x6fc0ff : 0x7fe0a0);
        deco(cx - 0.04, 0.78, -0.3, cx + 0.04, 0.9, -0.26, 'black', 0x1a1c20);
      }
      deco(-0.25, 0.42, 0.8, 0.25, 0.48, 1.3, 'rubber', 0x2a2c30);
      deco(-0.25, 0.48, 1.26, 0.25, 0.95, 1.32, 'rubber', 0x2a2c30);
      deco(-0.04, 0, 1.0, 0.04, 0.42, 1.1, 'steel', 0x3a3e42);
      break;
    }
  }
}

/** Grundfläche (Breite × Tiefe) der Hub-Requisiten nach Drehung — für Kartenwerkzeuge und Tests. */
export function hubFootprint(kind: HubPropKind, rot = 0, o: PropOpts = {}): [number, number] {
  const base: Record<HubPropKind, [number, number]> = {
    van: [HUB.vanLength, HUB.vanWidth], dockBay: [o.len ?? 3.4, 0.3], plant: [0.6, 0.6], chairStack: [0.5, 0.5], table: [o.len ?? 2, 1.4],
    bench: [o.len ?? 2.4, 0.5], counter: [o.len ?? 2.4, 0.7], stove: [1.8, 0.9], gantryConveyor: [o.len ?? 12, 1.1], gatehouse: [HUB.gatehouse[0], HUB.gatehouse[1]], console: [o.len ?? 3, 0.9],
  };
  const [w, d] = base[kind];
  return rot % 2 === 0 ? [w, d] : [d, w];
}
