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
    case 'tank': {
      // stehender Behälter (Silo/Ammoniak-Speicher): Radius 1, Höhe 1, Schweißnähte und Sockelring proportional zur Höhe
      const seg = low ? 12 : 24;
      const parts: Part[] = [cyl(1, 1, 0, 0.5, 0, 0xffffff, 'y', seg), cyl(1.03, 0.02, 0, 0.012, 0, 0x6a727a, 'y', seg)];
      for (const f of [0.2, 0.4, 0.6, 0.8]) parts.push(cyl(1.012, 0.012, 0, f, 0, 0xb8c2cb, 'y', seg));
      g = build(parts);
      break;
    }
    case 'tankDome': {
      const seg = low ? 12 : 24;
      g = build([{ geo: new THREE.SphereGeometry(1, seg, Math.max(4, seg / 3), 0, Math.PI * 2, 0, Math.PI / 2), color: 0xffffff }, cyl(0.07, 0.12, 0.3, 1.02, 0.2, 0x404448, 'y', 8)]);
      break;
    }
    case 'stripCurtain': {
      // Kühlraum-Streifenvorhang: Breite 1, Höhe 1, neun Lamellen leicht versetzt, Laufschiene oben
      const parts: Part[] = [box(1.04, 0.06, 0.07, 0, 0.99, 0, 0x6a727a)];
      for (let i = 0; i < 9; i++) parts.push(box(0.105, 0.96, 0.014, -0.45 + i * 0.1125, 0.48, i % 2 ? 0.012 : -0.012, i % 3 === 0 ? 0xc4dcea : 0xd8e8f0));
      g = build(parts);
      break;
    }
    case 'compressor':
      // Schraubenverdichter-Aggregat auf Grundrahmen: Motor, Verdichter, Ölabscheider, Rohre
      g = build([
        box(2.6, 0.22, 1.4, 0, 0.11, 0, 0x3a3f44),
        cyl(0.42, 1.2, -0.7, 0.85, 0, 0x2f6fb5, 'x', low ? 8 : 14),
        box(0.9, 0.85, 0.85, 0.5, 0.65, 0, 0x8a9298),
        cyl(0.36, 1.55, 0.95, 1.0, 0.5, 0xd8dde2, 'y', low ? 8 : 12),
        cyl(0.09, 1.2, 0.5, 1.4, -0.2, 0x9aa0a6, 'y', 8),
        cyl(0.09, 1.4, 0.2, 1.4, -0.2, 0x9aa0a6, 'x', 8),
        box(0.3, 0.2, 0.05, -0.7, 1.35, 0.44, 0xffd040, true),
      ]);
      break;
    case 'condenser': {
      // luftgekühlter Verflüssiger: Gehäuse auf Füßen, drei Ventilatoren oben
      const parts: Part[] = [box(3.2, 1.1, 1.5, 0, 1.15, 0, 0xdde4e9), box(3.3, 0.06, 1.6, 0, 1.72, 0, 0x8a9298)];
      for (const x of [-1.05, 1.05]) for (const z of [-0.55, 0.55]) parts.push(box(0.12, 0.6, 0.12, x, 0.3, z, 0x4a5258));
      for (const x of [-1.05, 0, 1.05]) parts.push(cyl(0.46, 0.05, x, 1.78, 0, 0x1e2124, 'y', low ? 8 : 14), cyl(0.12, 0.08, x, 1.8, 0, 0x8a9298, 'y', 6));
      g = build(parts);
      break;
    }
    case 'sack': {
      // Jutesack (liegend, 0.9 × 0.3 × 0.5): abgeflachtes Ellipsoid mit gebundener Ecke
      const seg = low ? 8 : 12;
      const sph = new THREE.SphereGeometry(1, seg, Math.max(6, seg / 2));
      // Kugel → Superellipsoid (Exponent 4): kissenförmig statt spitz
      const pos = sph.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = Math.pow(x ** 4 + y ** 4 + z ** 4, 0.25) || 1;
        pos.setXYZ(i, x / k, y / k, z / k);
      }
      sph.computeVertexNormals();
      const body = sph.scale(0.46, 0.15, 0.26).translate(0, 0.15, 0);
      g = build([{ geo: body, color: 0xffffff }, cyl(0.05, 0.1, 0.45, 0.17, 0.02, 0xd8c8a0, 'x', 6)]);
      break;
    }
    case 'van': {
      // Lieferwagen, Front +Z (4.6 × 1.9 × 2.3): Farbton = Karosserie, Fenster/Räder/Stoßfänger fest
      const parts: Part[] = [
        box(1.9, 0.9, 4.6, 0, 0.85, 0, 0xffffff), // Unterbau
        box(1.9, 1.35, 3.05, 0, 1.58, -0.78, 0xffffff), // Kofferaufbau
        box(1.84, 0.85, 1.2, 0, 1.72, 1.35, 0xffffff), // Fahrerhaus
        box(1.92, 0.22, 2.7, 0, 1.2, -0.8, 0xb04030), // Zierstreifen
        box(1.6, 0.5, 0.04, 0, 1.78, 1.96, 0x1c2830), // Windschutzscheibe
        box(0.04, 0.46, 0.9, 0.93, 1.78, 1.36, 0x1c2830), box(0.04, 0.46, 0.9, -0.93, 1.78, 1.36, 0x1c2830),
        box(1.98, 0.18, 0.2, 0, 0.55, 2.2, 0x2c2c2c), box(1.98, 0.18, 0.2, 0, 0.55, -2.2, 0x2c2c2c),
        box(0.3, 0.14, 0.05, 0.66, 0.98, 2.28, 0xfff0c0, true), box(0.3, 0.14, 0.05, -0.66, 0.98, 2.28, 0xfff0c0, true),
        box(0.03, 1.3, 0.03, 0, 1.58, -2.28, 0x606060),
      ];
      for (const wx of [-0.88, 0.88]) for (const wz of [1.45, -1.4]) parts.push(cyl(0.36, 0.26, wx, 0.36, wz, 0x1a1a1a, 'x', low ? 8 : 12), cyl(0.18, 0.28, wx, 0.36, wz, 0x8a8a8a, 'x', 8));
      g = build(parts);
      break;
    }
    case 'fountain': {
      // Brunnen: Becken (Radius 1, Rand 0.75), Wasserfläche, Säule mit Schale und Kugel; Einheitsradius, Höhe ≈ 2.2
      const seg = low ? 14 : 28;
      const lathe = (pts: [number, number][], color: number): Part => ({ geo: new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), color });
      g = build([
        lathe([[0, 0], [1.0, 0], [1.0, 0.75], [0.88, 0.75], [0.88, 0.45], [0, 0.45]], 0xffffff),
        { geo: new THREE.CircleGeometry(0.88, seg).rotateX(-Math.PI / 2).translate(0, 0.66, 0), color: 0x3f7378 },
        lathe([[0, 0.45], [0.26, 0.45], [0.2, 0.9], [0.13, 1.25], [0.16, 1.4], [0, 1.4]], 0xe8e2d4),
        lathe([[0.04, 1.4], [0.5, 1.62], [0.58, 1.84], [0.48, 1.8], [0.04, 1.62]], 0xe8e2d4),
        { geo: new THREE.SphereGeometry(0.1, 8, 6).translate(0, 1.7, 0), color: 0xd0c8b4 },
        { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6).translate(0, 1.9, 0), color: 0xaed6dc },
      ]);
      break;
    }
    case 'lantern': {
      // Gaslaterne (4.2 m): gusseiserner Mast, Leiterbalken, Laternenkörper mit leuchtender Scheibe
      g = build([
        cyl(0.16, 0.7, 0, 0.35, 0, 0x2f3d36, 'y', 8), cyl(0.07, 3.2, 0, 2.3, 0, 0x2f3d36, 'y', 8), cyl(0.11, 0.1, 0, 0.75, 0, 0x2f3d36, 'y', 8),
        box(0.8, 0.04, 0.04, 0, 3.3, 0, 0x2f3d36),
        box(0.36, 0.5, 0.36, 0, 3.7, 0, 0xffe0a0, true), box(0.44, 0.06, 0.44, 0, 3.98, 0, 0x2f3d36), box(0.3, 0.12, 0.3, 0, 4.07, 0, 0x2f3d36), box(0.42, 0.05, 0.42, 0, 3.44, 0, 0x2f3d36),
      ]);
      break;
    }
    case 'log': {
      // Baumstamm entlang X (Länge 1, Radius 0.27): Rinde (Farbton) und helle Schnittflächen
      g = build([cyl(0.27, 1, 0, 0, 0, 0xffffff, 'x', low ? 8 : 12), cyl(0.255, 0.02, 0.505, 0, 0, 0xd9b07a, 'x', low ? 8 : 12), cyl(0.255, 0.02, -0.505, 0, 0, 0xd9b07a, 'x', low ? 8 : 12)]);
      break;
    }
    case 'archRing': {
      // Rundbogen-Laibung (Halbring, Radius 1, Dicke 0.14) mit Schlussstein; Ebene XY, Tiefe in Z (Einheit 1)
      const seg = low ? 12 : 24;
      const sh = new THREE.Shape();
      sh.moveTo(1, 0);
      sh.absarc(0, 0, 1, 0, Math.PI, false);
      sh.lineTo(-0.86, 0);
      sh.absarc(0, 0, 0.86, Math.PI, 0, true);
      sh.closePath();
      g = build([{ geo: new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: seg }).translate(0, 0, -0.5), color: 0xffffff }, box(0.2, 0.28, 1.02, 0, 0.93, 0, 0xf2ead8)]);
      break;
    }
    default:
      g = build([box(0.5, 0.5, 0.5, 0, 0.25, 0, 0xff00ff)]);
  }
  cacheGeo.set(key, g);
  return g;
}

/** Leuchtende Deko (Instanzfarbe nicht vom gebackenen Licht abdunkeln). */
export function decorGlows(kind: DecorKind): boolean {
  return kind === 'lampHall' || kind === 'lampWall' || kind === 'lampTube' || kind === 'lampPost' || kind === 'serverLeds' || kind === 'lantern';
}
