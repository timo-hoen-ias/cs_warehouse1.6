import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DecorKind } from '../logic/mapkit';

/**
 * Formen der instanzierten Deko (Fässer, Kabeltrommeln, Rohre, Leuchten, Stapler,
 * Serverschränke …): aus Grundkörpern zusammengesetzt, Formschattierung als Vertexfarbe
 * (unbeleuchtetes Material, Licht kommt aus der Instanzfarbe = gebackenes Licht × Farbton).
 * Fußpunkt (0,0,0) = Boden-Mitte, lokale Front = +Z.
 */
type Part = { geo: THREE.BufferGeometry; color: number; glow?: boolean };

const KEY = new THREE.Vector3(0.35, 0.85, 0.4).normalize();

function shade(geo: THREE.BufferGeometry, color: number, glow = false): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.getAttribute('normal');
  const c = new THREE.Color(color).convertSRGBToLinear();
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const d = n.getX(i) * KEY.x + n.getY(i) * KEY.y + n.getZ(i) * KEY.z;
    const k = glow ? 2.2 : 0.55 + 0.5 * Math.max(0, d) + (n.getY(i) < -0.5 ? -0.15 : 0);
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.count * 2), 2));
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, glow = false): Part =>
  ({ geo: new THREE.BoxGeometry(w, h, d).translate(x, y, z), color, glow });

/** Zylinder entlang Achse ('y' stehend, 'x'/'z' liegend). */
const cyl = (r: number, h: number, x: number, y: number, z: number, color: number, axis: 'x' | 'y' | 'z' = 'y', seg = 12, glow = false): Part => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return { geo: g.translate(x, y, z), color, glow };
};

function build(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => shade(p.geo, p.color, p.glow));
  const merged = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

const cacheGeo = new Map<string, THREE.BufferGeometry>();

/** Geometrie einer Deko-Art (weiß = wird vom Farbton eingefärbt). */
export function decorGeometry(kind: DecorKind, low = false): THREE.BufferGeometry {
  const key = kind + (low ? '-low' : '');
  const hit = cacheGeo.get(key);
  if (hit) return hit;
  const s = low ? 8 : 14;
  let g: THREE.BufferGeometry;
  switch (kind) {
    case 'barrel':
      g = build([cyl(0.29, 0.88, 0, 0.44, 0, 0xffffff, 'y', s), cyl(0.3, 0.04, 0, 0.3, 0, 0xb0b0b0, 'y', s), cyl(0.3, 0.04, 0, 0.6, 0, 0xb0b0b0, 'y', s), cyl(0.06, 0.02, 0.12, 0.885, 0.1, 0x404040, 'y', 6)]);
      break;
    case 'drum':
      // liegende Kabeltrommel, Achse lokal X
      g = build([cyl(0.8, 0.08, -0.38, 0, 0, 0xb08a58, 'x', s + 4), cyl(0.8, 0.08, 0.38, 0, 0, 0xb08a58, 'x', s + 4), cyl(0.55, 0.68, 0, 0, 0, 0x202020, 'x', s), cyl(0.12, 0.9, 0, 0, 0, 0x8a8a8a, 'x', 8)]);
      break;
    case 'pipeX':
      g = build([cyl(0.15, 1, 0, 0, 0, 0x9aa0a6, 'x', low ? 6 : 10)]);
      break;
    case 'pipeZ':
      g = build([cyl(0.15, 1, 0, 0, 0, 0x9aa0a6, 'z', low ? 6 : 10)]);
      break;
    case 'pipeY':
      g = build([cyl(0.15, 1, 0, 0.5, 0, 0x9aa0a6, 'y', low ? 6 : 10)]);
      break;
    case 'wheel':
      g = build([cyl(0.5, 0.36, 0, 0, 0, 0x1c1c1c, 'z', s), cyl(0.28, 0.38, 0, 0, 0, 0x8a8a8a, 'z', 8)]);
      break;
    case 'lampHall':
      g = build([cyl(0.04, 1.4, 0, 0.7, 0, 0x404448, 'y', 6), { geo: new THREE.CylinderGeometry(0.18, 0.45, 0.4, s).translate(0, 0, 0), color: 0x55606a }, cyl(0.42, 0.03, 0, -0.21, 0, 0xfff4dc, 'y', s, true)]);
      break;
    case 'lampWall':
      g = build([box(0.5, 0.25, 0.3, 0, 0, 0.15, 0x3a3f44), box(0.42, 0.16, 0.02, 0, -0.02, 0.31, 0xfff0d0, true)]);
      break;
    case 'lampTube':
      g = build([box(1.3, 0.08, 0.2, 0, 0.04, 0, 0xc8cccf), box(1.2, 0.05, 0.12, 0, -0.01, 0, 0xf2f8ff, true)]);
      break;
    case 'lampPost':
      g = build([box(0.12, 0.12, 1.4, 0, -0.1, 0.6, 0x5a6068), box(0.5, 0.18, 0.7, 0, -0.2, 1.2, 0x3a3f44), box(0.42, 0.04, 0.6, 0, -0.31, 1.2, 0xffe2b0, true)]);
      break;
    case 'forklift':
      g = build([
        box(1.1, 0.7, 1.7, 0, 0.55, -0.1, 0xffffff), // Fahrgestell (Farbton)
        box(1.1, 0.6, 0.45, 0, 0.9, -0.85, 0x2a2a2a), // Gegengewicht
        box(0.06, 1.3, 0.06, -0.5, 1.55, 0.45, 0x2a2a2a), box(0.06, 1.3, 0.06, 0.5, 1.55, 0.45, 0x2a2a2a),
        box(0.06, 1.3, 0.06, -0.5, 1.55, -0.6, 0x2a2a2a), box(0.06, 1.3, 0.06, 0.5, 1.55, -0.6, 0x2a2a2a),
        box(1.1, 0.06, 1.15, 0, 2.2, -0.08, 0x2a2a2a), // Fahrerschutzdach
        box(0.5, 0.5, 0.5, 0, 1.15, -0.2, 0x222222), // Sitz
        box(0.1, 2.3, 0.12, -0.35, 1.2, 0.85, 0x3a3a3a), box(0.1, 2.3, 0.12, 0.35, 1.2, 0.85, 0x3a3a3a), // Mast
        box(0.8, 0.5, 0.06, 0, 0.45, 0.95, 0x3a3a3a), // Gabelträger
        box(0.12, 0.05, 1.1, -0.28, 0.1, 1.5, 0x5a5a5a), box(0.12, 0.05, 1.1, 0.28, 0.1, 1.5, 0x5a5a5a), // Gabeln
        cyl(0.27, 0.22, -0.5, 0.27, 0.45, 0x1a1a1a, 'x', 10), cyl(0.27, 0.22, 0.5, 0.27, 0.45, 0x1a1a1a, 'x', 10),
        cyl(0.22, 0.2, -0.5, 0.22, -0.75, 0x1a1a1a, 'x', 10), cyl(0.22, 0.2, 0.5, 0.22, -0.75, 0x1a1a1a, 'x', 10),
        box(0.15, 0.1, 0.1, 0, 2.28, -0.5, 0xff8a00, true), // Rundumleuchte
      ]);
      break;
    case 'serverRack':
      g = build([box(0.6, 2.0, 1.0, 0, 1.0, 0, 0x34383e), box(0.56, 0.06, 0.96, 0, 2.03, 0, 0x50555c), box(0.62, 0.08, 1.02, 0, 0.04, 0, 0x16171a), box(0.05, 1.9, 0.02, 0.26, 1.0, 0.51, 0x8a9096), box(0.05, 1.9, 0.02, -0.26, 1.0, -0.51, 0x8a9096)]);
      break;
    case 'serverLeds':
      g = new THREE.PlaneGeometry(0.56, 1.9).translate(0, 1.0, 0.505);
      break;
    case 'ibc':
      g = build([box(1.0, 0.95, 0.85, 0, 0.62, 0, 0xe6e6e0), box(1.2, 0.14, 1.0, 0, 0.07, 0, 0x6a6e72), box(1.18, 0.04, 0.04, 0, 1.12, 0.48, 0xb0b8c0), box(1.18, 0.04, 0.04, 0, 1.12, -0.48, 0xb0b8c0), cyl(0.15, 0.08, 0, 1.12, 0, 0x3a3a3a, 'y', 8)]);
      break;
    case 'fencePost':
      g = build([cyl(0.04, 1, 0, 0.5, 0, 0x8a9096, 'y', 6)]);
      break;
    case 'conveyorRoller':
      g = build([cyl(0.04, 1, 0, 0, 0, 0xa0a6aa, 'x', 6)]);
      break;
    case 'cone':
      g = build([{ geo: new THREE.ConeGeometry(0.16, 0.6, 10).translate(0, 0.3, 0), color: 0xff5a10 }, box(0.36, 0.03, 0.36, 0, 0.015, 0, 0x202020)]);
      break;
    case 'extinguisher':
      g = build([cyl(0.08, 0.5, 0, 0.25, 0, 0xc01a1a, 'y', 8), cyl(0.02, 0.1, 0, 0.55, 0, 0x202020, 'y', 6)]);
      break;
    case 'cableTrayX':
      g = build([box(1, 0.02, 0.4, 0, 0, 0, 0x9aa0a6), box(1, 0.08, 0.02, 0, 0.05, 0.2, 0x9aa0a6), box(1, 0.08, 0.02, 0, 0.05, -0.2, 0x9aa0a6), box(1, 0.06, 0.32, 0, 0.04, 0, 0x2a2a2a)]);
      break;
    case 'cableTrayZ':
      g = build([box(0.4, 0.02, 1, 0, 0, 0, 0x9aa0a6), box(0.02, 0.08, 1, 0.2, 0.05, 0, 0x9aa0a6), box(0.02, 0.08, 1, -0.2, 0.05, 0, 0x9aa0a6), box(0.32, 0.06, 1, 0, 0.04, 0, 0x2a2a2a)]);
      break;
    case 'fanUnit':
      g = build([box(0.9, 0.3, 0.7, 0, 0.15, 0, 0xc8ccd0), cyl(0.28, 0.04, 0, 0.31, 0, 0x2a2a2a, 'y', 12)]);
      break;
    default:
      g = build([box(0.5, 0.5, 0.5, 0, 0.25, 0, 0xff00ff)]);
  }
  cacheGeo.set(key, g);
  return g;
}

/** Leuchtende Deko (Instanzfarbe nicht vom gebackenen Licht abdunkeln). */
export function decorGlows(kind: DecorKind): boolean {
  return kind === 'lampHall' || kind === 'lampWall' || kind === 'lampTube' || kind === 'lampPost' || kind === 'serverLeds';
}
