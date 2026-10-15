/**
 * Waffen-Silhouetten als SVG-Pfade (framework-frei, prozedural): eine Seitenansicht
 * je Waffe/Ausrüstung, Mündung nach rechts wie im CS-Kill-Feed. Aufgebaut aus
 * parametrisierten Bauteilen (Schaft, Gehäuse, Griff, Magazin, Lauf, Optik …),
 * damit jede Waffe erkennbar ist, ohne Bilddateien zu bündeln.
 *
 * Koordinaten: Höhe 40, Breite je nach Waffenlänge (Pistolen kurz, AWP lang).
 * Löcher (Abzugsbügel, Skelettschaft) laufen gegen den Uhrzeigersinn (nonzero-Regel).
 */

export type WeaponIcon = { w: number; h: number; d: string };

export const ICON_HEIGHT = 40;

const f = (n: number): string => String(Math.round(n * 10) / 10);

/** Rechteck im Uhrzeigersinn. */
function rect(x: number, y: number, w: number, h: number): string {
  return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
}

/** Loch (gegen den Uhrzeigersinn). */
function hole(x: number, y: number, w: number, h: number): string {
  return `M${f(x)} ${f(y)}V${f(y + h)}H${f(x + w)}V${f(y)}Z`;
}

function poly(pts: [number, number][]): string {
  return 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
}

type Muzzle = 'none' | 'brake' | 'flash' | 'suppressor' | 'post';
type MagKind = 'none' | 'curved' | 'straight' | 'box' | 'drum' | 'tube' | 'top' | 'stick';
type StockKind = 'solid' | 'wood' | 'skeleton' | 'folded' | 'tube' | 'sniper' | 'thumbhole' | 'none' | 'bullpup';

type LongSpec = {
  kind: 'long';
  stock: StockKind;
  stockLen: number;
  recLen: number;
  /** Gehäusehöhe. */
  recH: number;
  /** Griff-Position (relativ zum Gehäusebeginn). */
  gripX: number;
  mag: MagKind;
  magX: number;
  magLen: number;
  magW: number;
  hgLen: number;
  hgH: number;
  barrelLen: number;
  barrelT: number;
  muzzle: Muzzle;
  scope?: { x: number; len: number; big?: boolean };
  handle?: { x: number; len: number };
  pump?: boolean;
  bipod?: boolean;
  foregrip?: boolean;
  /** Bullpup: Magazin hinter dem Griff, Schaft = Gehäuse. */
  bullpup?: boolean;
};

type PistolSpec = { kind: 'pistol'; len: number; slideH: number; gripW: number; gripLen: number; muzzle: Muzzle; big?: boolean; dual?: boolean };

const TOP = 13; // Oberkante Gehäuse

/** Langwaffe aus Bauteilen. */
function longGun(s: LongSpec): WeaponIcon {
  const parts: string[] = [];
  const rx = s.bullpup ? 2 : s.stockLen;
  const rb = TOP + s.recH;
  // Schaft
  switch (s.bullpup ? 'bullpup' : s.stock) {
    case 'solid':
      parts.push(poly([[2, TOP + 2], [rx, TOP + 1], [rx, rb], [8, TOP + 15], [2, TOP + 16]]));
      break;
    case 'wood':
      parts.push(poly([[2, TOP + 3], [rx, TOP + 1], [rx, rb + 1], [10, TOP + 16], [2, TOP + 17]]));
      break;
    case 'sniper':
      parts.push(poly([[2, TOP + 1], [rx * 0.55, TOP + 2], [rx, TOP + 1], [rx, rb + 1], [rx * 0.6, rb + 2], [rx * 0.42, TOP + 17], [2, TOP + 18]]));
      parts.push(hole(rx * 0.55, TOP + 5, rx * 0.28, 5));
      break;
    case 'thumbhole':
      parts.push(poly([[2, TOP + 2], [rx, TOP], [rx, rb + 2], [rx * 0.5, rb + 4], [8, TOP + 17], [2, TOP + 17]]));
      parts.push(hole(rx * 0.45, TOP + 4, rx * 0.35, 6));
      break;
    case 'skeleton':
      parts.push(poly([[2, TOP + 1], [rx, TOP + 1], [rx, rb], [6, TOP + 15], [2, TOP + 15]]));
      parts.push(hole(5, TOP + 4, rx - 9, 6));
      break;
    case 'tube':
      parts.push(rect(rx * 0.25, TOP + 2, rx * 0.75, 3));
      parts.push(rect(2, TOP + 1, rx * 0.3, 14));
      break;
    case 'folded':
      parts.push(rect(rx - 6, TOP + 1, 6, 4));
      parts.push(rect(rx - 4, rb - 3, 6, 3));
      break;
    case 'bullpup':
    case 'none':
      break;
  }
  // Gehäuse
  parts.push(rect(rx, TOP, s.recLen, s.recH));
  const re = rx + s.recLen;
  // Pistolengriff (schräg nach hinten)
  const gx = rx + s.gripX;
  parts.push(poly([[gx, rb - 1], [gx + 6.5, rb - 1], [gx + 2.5, rb + 10.5], [gx - 4.5, rb + 10.5], [gx - 4.5, rb + 9]]));
  // Abzugsbügel
  parts.push(rect(gx + 6, rb, 8, 5));
  parts.push(hole(gx + 7.2, rb, 5.6, 3.6));
  // Magazin
  const mx = s.bullpup ? rx + s.magX : rx + s.magX;
  switch (s.mag) {
    case 'curved':
      parts.push(`M${f(mx)} ${f(rb)}H${f(mx + s.magW)}Q${f(mx + s.magW + 1)} ${f(rb + s.magLen * 0.55)} ${f(mx + s.magW + s.magLen * 0.45)} ${f(rb + s.magLen)}L${f(mx + s.magLen * 0.4)} ${f(rb + s.magLen + 2.5)}Q${f(mx - 0.5)} ${f(rb + s.magLen * 0.6)} ${f(mx)} ${f(rb)}Z`);
      break;
    case 'straight':
      parts.push(poly([[mx, rb], [mx + s.magW, rb], [mx + s.magW + 1.5, rb + s.magLen], [mx + 1.5, rb + s.magLen]]));
      break;
    case 'box':
      parts.push(rect(mx, rb, s.magW, s.magLen));
      break;
    case 'drum':
      parts.push(poly([[mx, rb], [mx + s.magW, rb], [mx + s.magW + 2, rb + s.magLen * 0.4], [mx + s.magW, rb + s.magLen], [mx, rb + s.magLen], [mx - 2, rb + s.magLen * 0.4]]));
      break;
    case 'stick':
      parts.push(rect(mx, rb, s.magW, s.magLen));
      break;
    case 'top':
      parts.push(rect(rx + 2, TOP - 4, s.recLen + s.hgLen - 6, 4));
      break;
    case 'tube':
    case 'none':
      break;
  }
  // Handschutz
  let x = re;
  if (s.hgLen > 0) {
    const hgTop = TOP + Math.max(0, (s.recH - s.hgH) / 2) - 0.5;
    parts.push(rect(x, hgTop, s.hgLen, s.hgH));
    x += s.hgLen;
  }
  // Lauf
  const by = TOP + 2.5;
  parts.push(rect(re - 2, by, x - re + s.barrelLen + 2, s.barrelT));
  x += s.barrelLen;
  // Pumpe / Röhrenmagazin (Schrot)
  if (s.pump) {
    parts.push(rect(re, by + s.barrelT + 0.8, s.hgLen + s.barrelLen * 0.75, 2.6));
    parts.push(rect(re + s.hgLen * 0.2, by + s.barrelT - 0.5, Math.max(12, s.hgLen * 0.7), 5.5));
  } else if (s.mag === 'tube') {
    parts.push(rect(re, by + s.barrelT + 0.8, s.hgLen + s.barrelLen * 0.6, 2.4));
  }
  // Mündung
  switch (s.muzzle) {
    case 'brake': parts.push(rect(x, by - 0.8, 5, s.barrelT + 1.6)); x += 5; break;
    case 'flash': parts.push(rect(x, by - 0.5, 4, s.barrelT + 1)); x += 4; break;
    case 'suppressor': parts.push(rect(x, by - 1.5, 16, s.barrelT + 3)); x += 16; break;
    case 'post': parts.push(rect(x - 6, by - 4, 2, 4)); break;
    case 'none': break;
  }
  // Optik
  if (s.scope) {
    const sx = rx + s.scope.x;
    const sh = s.scope.big ? 5 : 4;
    parts.push(rect(sx, TOP - sh - 2.5, s.scope.len, sh));
    parts.push(poly([[sx - 4, TOP - sh - 3.5], [sx, TOP - sh - 2.5], [sx, TOP - 2.5], [sx - 4, TOP - 1.5]]));
    parts.push(poly([[sx + s.scope.len, TOP - sh - 2.5], [sx + s.scope.len + 5, TOP - sh - 4], [sx + s.scope.len + 5, TOP - 1], [sx + s.scope.len, TOP - 2.5]]));
    parts.push(rect(sx + 3, TOP - 3, 3, 3));
    parts.push(rect(sx + s.scope.len - 6, TOP - 3, 3, 3));
  }
  // Tragegriff
  if (s.handle) {
    const hx = rx + s.handle.x;
    parts.push(rect(hx, TOP - 6, s.handle.len, 2.5));
    parts.push(rect(hx, TOP - 6, 3, 6));
    parts.push(rect(hx + s.handle.len - 3, TOP - 6, 3, 6));
  }
  if (s.foregrip) parts.push(poly([[re + s.hgLen * 0.45, TOP + s.recH - 1], [re + s.hgLen * 0.45 + 5, TOP + s.recH - 1], [re + s.hgLen * 0.45 + 4, TOP + s.recH + 8], [re + s.hgLen * 0.45 + 0.5, TOP + s.recH + 8]]));
  if (s.bipod) {
    const bx = re + s.hgLen + s.barrelLen * 0.25;
    parts.push(poly([[bx, by + 2], [bx + 2, by + 2], [bx - 4, by + 18], [bx - 6, by + 18]]));
    parts.push(poly([[bx + 1, by + 2], [bx + 3, by + 2], [bx + 7, by + 18], [bx + 5, by + 18]]));
  }
  return { w: Math.ceil(x + 2), h: ICON_HEIGHT, d: parts.join('') };
}

function pistolAt(s: PistolSpec, ox: number, oy: number): string[] {
  const parts: string[] = [];
  const top = 12 + oy;
  const sh = s.slideH;
  // Schlitten/Lauf
  parts.push(rect(ox + 2, top, s.len, sh));
  // Rahmen unter dem Schlitten (vorne)
  parts.push(rect(ox + 8, top + sh, s.len - 12, 2.5));
  // Griff (schräg)
  const g0 = ox + 2;
  parts.push(poly([[g0, top + sh - 0.5], [g0 + s.gripW, top + sh - 0.5], [g0 + s.gripW - 3, top + sh + s.gripLen], [g0 - 4, top + sh + s.gripLen], [g0 - 3, top + sh + 3]]));
  // Abzugsbügel
  parts.push(rect(g0 + s.gripW - 1, top + sh + 2, 8, 5));
  parts.push(hole(g0 + s.gripW, top + sh + 2, 6, 3.8));
  // Kimme/Korn
  parts.push(rect(ox + 3, top - 1.5, 2, 1.5));
  parts.push(rect(ox + s.len - 1, top - 1.5, 1.5, 1.5));
  if (s.big) parts.push(rect(ox + s.len * 0.45, top - 1, s.len * 0.4, 1));
  if (s.muzzle === 'suppressor') parts.push(rect(ox + 2 + s.len, top + 1, 13, sh - 1));
  return parts;
}

function pistol(s: PistolSpec): WeaponIcon {
  if (s.dual) {
    const parts = [...pistolAt(s, 14, -4), ...pistolAt(s, 4, 6)];
    return { w: Math.ceil(s.len + 22), h: ICON_HEIGHT, d: parts.join('') };
  }
  const parts = pistolAt(s, 6, 0);
  return { w: Math.ceil(s.len + 10 + (s.muzzle === 'suppressor' ? 13 : 0)), h: ICON_HEIGHT, d: parts.join('') };
}

function knife(): WeaponIcon {
  // Griff links, Klinge rechts (Tanto-artig)
  const d = [
    poly([[4, 19], [24, 18], [26, 22], [24, 26], [6, 26], [3, 23]]),
    rect(26, 15, 3, 14),
    poly([[29, 18], [62, 18], [70, 21], [64, 24], [29, 24]]),
    hole(8, 21, 3, 2),
    hole(14, 21, 3, 2),
  ].join('');
  return { w: 72, h: ICON_HEIGHT, d };
}

function grenade(kind: 'he' | 'flash' | 'smoke'): WeaponIcon {
  const parts: string[] = [];
  if (kind === 'he') {
    // Eiergranate mit Bügel
    parts.push('M9 14H17V17Q24 19 24 27Q24 35 13 35Q2 35 2 27Q2 19 9 17Z');
    parts.push(poly([[17, 13], [25, 15], [26, 26], [24, 26], [23, 17], [17, 16]]));
    parts.push('M6 13A3 3 0 1 0 6.01 13Z');
  } else {
    // Zylinder (Blend-/Rauchgranate)
    const h = kind === 'smoke' ? 20 : 18;
    parts.push(rect(5, 34 - h, 14, h));
    parts.push(rect(7, 32 - h, 10, 2.5));
    parts.push(poly([[17, 31 - h], [23, 33 - h], [24, 34 - h + h * 0.6], [22, 34 - h + h * 0.6], [21, 35 - h], [17, 34 - h]]));
    if (kind === 'smoke') parts.push(hole(7, 34 - h + 4, 10, 2), hole(7, 34 - h + 9, 10, 2));
    else parts.push(hole(7, 34 - h + 6, 10, 2.5));
  }
  return { w: 28, h: ICON_HEIGHT, d: parts.join('') };
}

function c4(): WeaponIcon {
  const d = [
    rect(2, 16, 44, 18),
    hole(5, 19, 16, 12),
    rect(8, 21, 4, 2), rect(14, 21, 4, 2), rect(8, 26, 4, 2), rect(14, 26, 4, 2),
    rect(24, 12, 3, 4), rect(30, 10, 3, 6),
    'M27 10Q36 2 44 12L42 13Q36 6 29 11Z',
  ].join('');
  return { w: 48, h: ICON_HEIGHT, d };
}

function kevlar(helmet: boolean): WeaponIcon {
  const parts = [
    'M8 8L14 6Q19 11 24 6L30 8L32 34Q19 37 6 34Z',
    hole(13, 14, 12, 2), hole(13, 19, 12, 2), hole(13, 24, 12, 2),
  ];
  if (helmet) parts.push('M38 22Q38 8 50 8Q62 8 62 22L64 24H36Z', rect(36, 25, 28, 2));
  return { w: helmet ? 66 : 36, h: ICON_HEIGHT, d: parts.join('') };
}

function defuseKit(): WeaponIcon {
  const d = [
    rect(4, 14, 30, 20),
    hole(7, 17, 24, 6),
    rect(14, 9, 10, 3), rect(12, 10, 2, 5), rect(24, 10, 2, 5),
    poly([[34, 28], [44, 18], [46, 20], [36, 30]]),
    poly([[36, 18], [46, 28], [44, 30], [34, 20]]),
  ].join('');
  return { w: 48, h: ICON_HEIGHT, d };
}

function ammo(): WeaponIcon {
  const one = (x: number): string => `M${x} 34V18Q${x} 10 ${x + 3} 8Q${x + 6} 10 ${x + 6} 18V34Z`;
  return { w: 30, h: ICON_HEIGHT, d: [one(2), one(11), one(20)].join('') };
}

const L = (o: Partial<LongSpec>): LongSpec => ({
  kind: 'long', stock: 'solid', stockLen: 24, recLen: 38, recH: 8, gripX: 12, mag: 'curved', magX: 26, magLen: 13, magW: 6,
  hgLen: 20, hgH: 7, barrelLen: 20, barrelT: 2.6, muzzle: 'brake', ...o,
});

const P = (o: Partial<PistolSpec>): PistolSpec => ({ kind: 'pistol', len: 30, slideH: 6, gripW: 7, gripLen: 13, muzzle: 'none', ...o });

/** Bauplan je Waffe (IDs aus weapons.json). */
const SPECS: Record<string, LongSpec | PistolSpec> = {
  glock: P({ len: 28 }),
  usp: P({ len: 30, muzzle: 'suppressor' }),
  p228: P({ len: 29, slideH: 6.5 }),
  deagle: P({ len: 36, slideH: 7.5, gripW: 8, gripLen: 14, big: true }),
  fiveseven: P({ len: 31, slideH: 5.5 }),
  elite: P({ len: 29, dual: true }),
  m3: L({ stock: 'wood', stockLen: 26, recLen: 28, mag: 'tube', hgLen: 26, hgH: 6, barrelLen: 26, muzzle: 'post', pump: true }),
  xm1014: L({ stock: 'tube', stockLen: 24, recLen: 28, mag: 'tube', hgLen: 22, hgH: 6, barrelLen: 24, muzzle: 'post' }),
  mac10: L({ stock: 'folded', stockLen: 8, recLen: 26, recH: 10, gripX: 9, mag: 'stick', magX: 9, magLen: 14, magW: 5, hgLen: 0, barrelLen: 6, muzzle: 'none' }),
  tmp: L({ stock: 'none', stockLen: 4, recLen: 30, recH: 8, gripX: 6, mag: 'stick', magX: 6, magLen: 15, magW: 5, hgLen: 8, hgH: 6, barrelLen: 4, muzzle: 'suppressor', foregrip: true }),
  mp5: L({ stock: 'tube', stockLen: 20, recLen: 32, recH: 8, gripX: 10, mag: 'curved', magX: 21, magLen: 12, magW: 5, hgLen: 16, hgH: 7, barrelLen: 4, muzzle: 'flash' }),
  ump45: L({ stock: 'skeleton', stockLen: 20, recLen: 34, recH: 9, gripX: 10, mag: 'straight', magX: 22, magLen: 13, magW: 6, hgLen: 14, hgH: 8, barrelLen: 5, muzzle: 'flash' }),
  p90: L({ bullpup: true, stock: 'bullpup', stockLen: 2, recLen: 54, recH: 12, gripX: 26, mag: 'top', magX: 0, magLen: 0, magW: 0, hgLen: 0, barrelLen: 6, muzzle: 'flash' }),
  galil: L({ stock: 'skeleton', stockLen: 24, recLen: 38, mag: 'curved', magX: 24, hgLen: 18, barrelLen: 20, muzzle: 'flash' }),
  famas: L({ bullpup: true, stock: 'bullpup', stockLen: 2, recLen: 58, recH: 9, gripX: 30, mag: 'straight', magX: 14, magLen: 11, magW: 6, hgLen: 10, hgH: 7, barrelLen: 16, muzzle: 'flash', handle: { x: 8, len: 46 } }),
  ak47: L({ stock: 'wood', stockLen: 26, recLen: 38, mag: 'curved', magX: 25, magLen: 14, magW: 6, hgLen: 18, hgH: 7, barrelLen: 22, muzzle: 'brake' }),
  m4a1: L({ stock: 'tube', stockLen: 24, recLen: 36, mag: 'straight', magX: 24, magLen: 12, magW: 6, hgLen: 20, hgH: 7, barrelLen: 6, muzzle: 'suppressor', handle: { x: 6, len: 22 } }),
  sg552: L({ stock: 'folded', stockLen: 14, recLen: 38, mag: 'curved', magX: 24, magLen: 12, hgLen: 18, barrelLen: 10, muzzle: 'flash', scope: { x: 8, len: 22 } }),
  aug: L({ bullpup: true, stock: 'bullpup', stockLen: 2, recLen: 58, recH: 10, gripX: 32, mag: 'straight', magX: 14, magLen: 12, magW: 6, hgLen: 6, hgH: 7, barrelLen: 18, muzzle: 'flash', scope: { x: 20, len: 24 }, foregrip: true }),
  scout: L({ stock: 'sniper', stockLen: 30, recLen: 34, recH: 7, gripX: 6, mag: 'box', magX: 18, magLen: 5, magW: 8, hgLen: 26, hgH: 6, barrelLen: 26, barrelT: 2.2, muzzle: 'none', scope: { x: 6, len: 26 } }),
  awp: L({ stock: 'thumbhole', stockLen: 32, recLen: 36, recH: 9, gripX: 8, mag: 'box', magX: 20, magLen: 7, magW: 9, hgLen: 30, hgH: 8, barrelLen: 34, barrelT: 3, muzzle: 'brake', scope: { x: 6, len: 30, big: true } }),
  g3sg1: L({ stock: 'sniper', stockLen: 30, recLen: 40, recH: 9, gripX: 10, mag: 'straight', magX: 24, magLen: 11, magW: 7, hgLen: 24, hgH: 7, barrelLen: 24, muzzle: 'flash', scope: { x: 10, len: 26, big: true } }),
  sg550: L({ stock: 'skeleton', stockLen: 30, recLen: 38, recH: 9, gripX: 10, mag: 'curved', magX: 24, magLen: 12, magW: 6, hgLen: 22, hgH: 7, barrelLen: 26, muzzle: 'flash', scope: { x: 8, len: 26 }, bipod: false }),
  m249: L({ stock: 'solid', stockLen: 24, recLen: 44, recH: 11, gripX: 12, mag: 'drum', magX: 22, magLen: 12, magW: 14, hgLen: 20, hgH: 8, barrelLen: 26, barrelT: 3, muzzle: 'flash', handle: { x: 30, len: 14 }, bipod: true }),
};

const cache = new Map<string, WeaponIcon>();

/** Silhouette für eine Waffen- oder Ausrüstungs-ID (unbekannt → generisches Gewehr). */
export function weaponIcon(id: string): WeaponIcon {
  const hit = cache.get(id);
  if (hit) return hit;
  // Unbekannte IDs (z. B. aus Netz-Ereignissen) teilen sich einen Eintrag → der Speicher wächst nicht mit
  if (!KNOWN.has(id)) return id === GENERIC ? buildIcon(id) : weaponIcon(GENERIC);
  return buildIcon(id);
}

/** Schlüssel des generischen Gewehrs im Speicher (kein gültiger Waffenname). */
const GENERIC = '?';
const EXTRA_IDS = ['knife', 'knife_stab', 'hegrenade', 'flashbang', 'smokegrenade', 'c4', 'kevlar', 'helmet', 'defusekit', 'ammo1', 'ammo2', 'ammo'];
const KNOWN = new Set<string>([...Object.keys(SPECS), ...EXTRA_IDS]);

/** Speichergröße (Test: bleibt bei beliebig vielen unbekannten IDs klein). */
export function iconCacheSize(): number {
  return cache.size;
}

function buildIcon(id: string): WeaponIcon {
  let icon: WeaponIcon;
  const spec = Object.hasOwn(SPECS, id) ? SPECS[id] : undefined;
  if (spec) icon = spec.kind === 'pistol' ? pistol(spec) : longGun(spec);
  else {
    switch (id) {
      case 'knife': case 'knife_stab': icon = knife(); break;
      case 'hegrenade': icon = grenade('he'); break;
      case 'flashbang': icon = grenade('flash'); break;
      case 'smokegrenade': icon = grenade('smoke'); break;
      case 'c4': icon = c4(); break;
      case 'kevlar': icon = kevlar(false); break;
      case 'helmet': icon = kevlar(true); break;
      case 'defusekit': icon = defuseKit(); break;
      case 'ammo1': case 'ammo2': case 'ammo': icon = ammo(); break;
      default: icon = longGun(L({})); break;
    }
  }
  cache.set(id, icon);
  return icon;
}

/** Alle IDs mit eigenem Bauplan (für Tests/Katalog). */
export function iconIds(): string[] {
  return [...Object.keys(SPECS), 'knife', 'hegrenade', 'flashbang', 'smokegrenade', 'c4', 'kevlar', 'helmet', 'defusekit', 'ammo'];
}

/** Komplettes SVG-Markup (Füllfarbe per currentColor). `height` in px/CSS-Einheit des Aufrufers. */
export function weaponIconSvg(id: string, cls = 'wicon'): string {
  const i = weaponIcon(id);
  return `<svg class="${cls}" viewBox="0 0 ${i.w} ${i.h}" style="aspect-ratio:${i.w}/${i.h}" aria-hidden="true"><path fill="currentColor" fill-rule="nonzero" d="${i.d}"/></svg>`;
}

/** Kopfschuss-Symbol (Kopf mit Treffer), gleiche Höhe wie die Waffen. */
export function headshotIconSvg(cls = 'wicon hs'): string {
  const d = 'M14 6Q24 6 24 17Q24 23 20 25V30H8V25Q4 23 4 17Q4 6 14 6Z' + hole(8.5, 14, 4, 4) + hole(15.5, 14, 4, 4) + 'M26 4L34 12L32 14L24 6Z';
  return `<svg class="${cls}" viewBox="0 0 36 40" style="aspect-ratio:36/40" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}
