import * as THREE from 'three';

/**
 * Materialklassen der prozeduralen Waffen- und Arm-Modelle. Farbe kommt aus den
 * Vertex-Farben, die Klasse bestimmt Glanz/Metall und die (Canvas-)Textur:
 *  - steel: brünierter/parkerisierter Stahl, Chrom, Messing (metallisch, Gebrauchsspuren)
 *  - poly:  Polymer, Lack, Gummi (matt, feine Körnung)
 *  - wood:  Holzschaft (Maserung längs der Waffe)
 *  - glass: Zielfernrohr-Linsen (glänzend, leicht leuchtend)
 *  - cloth: Ärmel, Handschuhe, Haut (stumpf, Gewebestruktur)
 * Alle Materialien werden einmal erzeugt und geteilt (nie pro Modell entsorgt).
 */
export type MatKind = 'steel' | 'poly' | 'wood' | 'glass' | 'cloth';

export const MAT_KINDS: readonly MatKind[] = ['steel', 'poly', 'wood', 'glass', 'cloth'];

/** UV-Dichte (Kacheln pro Meter) der Box-Projektion je Klasse. */
export const UV_DENSITY: Record<MatKind, number> = { steel: 5, poly: 7, wood: 4.5, glass: 1, cloth: 9 };

const PARAMS: Record<MatKind, { metalness: number; roughness: number; env: number; emissive?: number }> = {
  steel: { metalness: 0.55, roughness: 0.4, env: 1.0 },
  poly: { metalness: 0.08, roughness: 0.6, env: 0.55 },
  wood: { metalness: 0.0, roughness: 0.5, env: 0.5 },
  glass: { metalness: 0.4, roughness: 0.06, env: 1.4, emissive: 0.25 },
  cloth: { metalness: 0.0, roughness: 0.88, env: 0.35 },
};

const hasDom = (): boolean => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** Deterministischer Zufall (Texturen sehen auf allen Clients gleich aus). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Grauwert-Textur (nahe Weiß → Vertex-Farbe dominiert) aus einer Pixel-Funktion. */
function grayTexture(size: number, seed: number, px: (x: number, y: number, r: () => number) => number, post?: (ctx: CanvasRenderingContext2D, r: () => number) => void): THREE.Texture {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const r = rng(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(255, Math.round(px(x, y, r))));
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  post?.(ctx, r);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const textures = new Map<MatKind, THREE.Texture | null>();

function makeTexture(kind: MatKind): THREE.Texture | null {
  if (!hasDom()) return null;
  switch (kind) {
    case 'steel':
      // Gebürstet (horizontale Riefen) + Flecken + helle Kratzer
      return grayTexture(256, 11, (x, y, r) => {
        const streak = Math.sin(y * 1.7 + Math.sin(x * 0.05) * 2) * 4;
        const blot = Math.sin(x * 0.045 + 1.3) * Math.sin(y * 0.06) * 7;
        return 228 + streak + blot + (r() - 0.5) * 16;
      }, (ctx, r) => {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
          const x = r() * 256;
          const y = r() * 256;
          const a = (r() - 0.5) * 0.6;
          const l = 6 + r() * 26;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          ctx.stroke();
        }
      });
    case 'poly':
      return grayTexture(128, 23, (_x, _y, r) => 236 + (r() - 0.5) * 22);
    case 'wood':
      // Maserung längs u (= Waffenlänge): wellige Jahresringe + Poren
      return grayTexture(256, 37, (x, y, r) => {
        const warp = Math.sin(x * 0.021 + Math.sin(y * 0.05) * 1.5) * 9 + Math.sin(x * 0.007) * 14;
        const ring = Math.sin((y + warp) * 0.42);
        const fine = Math.sin((y + warp * 0.6) * 2.3) * 0.5;
        return 196 + ring * 34 + fine * 10 + (r() - 0.5) * 20;
      });
    case 'cloth':
      return grayTexture(64, 51, (x, y, r) => {
        const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 8 : -8;
        return 228 + weave + (r() - 0.5) * 20;
      });
    default:
      return null;
  }
}

function texture(kind: MatKind): THREE.Texture | null {
  if (!textures.has(kind)) textures.set(kind, makeTexture(kind));
  return textures.get(kind) ?? null;
}

let envTex: THREE.Texture | null | undefined;

/**
 * Kleine Umgebungs-Textur (Equirect) für Reflexe auf Metall: helle Hallendecke mit
 * Lampenreihen, graue Wände, dunkler Boden. Unabhängig von der Szenen-Beleuchtung.
 */
function envMap(): THREE.Texture | null {
  if (envTex !== undefined) return envTex;
  if (!hasDom()) return (envTex = null);
  const [c, ctx] = canvas(256, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#f4f6fa');
  g.addColorStop(0.35, '#9aa4b0');
  g.addColorStop(0.5, '#6d7178');
  g.addColorStop(0.62, '#4a4640');
  g.addColorStop(1, '#1c1a18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  // Lampenreihen / Oberlichter
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) ctx.fillRect(i * 32 + 6, 10 + (i % 2) * 6, 18, 5);
  ctx.fillStyle = 'rgba(255,240,215,0.7)';
  ctx.fillRect(0, 40, 256, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  envTex = tex;
  return tex;
}

const viewMats = new Map<MatKind, THREE.MeshStandardMaterial>();

/** Geteiltes Viewmodel-Material einer Klasse (Vertex-Farben × Textur). */
export function viewMaterial(kind: MatKind): THREE.MeshStandardMaterial {
  let m = viewMats.get(kind);
  if (m) return m;
  const p = PARAMS[kind];
  m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: p.metalness,
    roughness: p.roughness,
    map: texture(kind),
    envMap: envMap(),
    envMapIntensity: p.env,
  });
  if (p.emissive) {
    m.emissive = new THREE.Color(0x2a5a70);
    m.emissiveIntensity = p.emissive;
  }
  m.name = 'vm-' + kind;
  viewMats.set(kind, m);
  return m;
}

let worldMat: THREE.MeshStandardMaterial | undefined;

/** Geteiltes Material der Welt-Modelle (liegende Waffen): nur Vertex-Farben. */
export function worldMaterial(): THREE.MeshStandardMaterial {
  worldMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.55, envMap: envMap(), envMapIntensity: 0.6 });
  return worldMat;
}
