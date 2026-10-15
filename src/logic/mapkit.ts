import type { AcousticZone, AmbientEmitter, AmbientSound, RoomKind, Surface } from './acoustics';
import type { RampDir } from './collision';
import type { Team } from './economy';

/**
 * Handgebautes Kartenformat (pure Daten + kleine Bau-Helfer, framework-frei).
 * Eine Karte ist ein TypeScript-Modul unter `src/maps/<id>.ts`, das mit dem
 * `MapBuilder` Brushes (Quader/Rampen), Requisiten, Lichter, Callout-Bereiche,
 * Bombenspots, Spawns, Kaufzonen und Akustik beschreibt. Der Compiler
 * (`mapcompile.ts`) macht daraus Kollision, Navigation, Zonen und Radar —
 * deterministisch, ohne Bake-Schritt. Doku: docs/KARTENFORMAT.md.
 *
 * Koordinaten: Meter, x = Osten, y = oben, z = Süden (Blick yaw 0 = Norden = −Z).
 */
export type Vec3 = [number, number, number];

/** Render-Materialien (Canvas-Texturen in src/level/textures.ts). */
export type MaterialId =
  | 'concrete' | 'concreteDark' | 'asphalt' | 'paving' | 'plaster' | 'brick' | 'wallPaint' | 'wallTile'
  | 'corrugated' | 'corrugatedDark' | 'metal' | 'steel' | 'grating' | 'wood' | 'crate' | 'pallet' | 'wrap'
  | 'carton' | 'hazard' | 'tile' | 'roof' | 'container' | 'rubber' | 'cage' | 'server' | 'door' | 'gate'
  | 'epoxy' | 'gravel' | 'foliage' | 'rust' | 'black' | 'white' | 'emissive' | 'sky' | 'window' | 'skylight' | 'vent'
  | 'panel' | 'frost' | 'cobble' | 'water' | 'sack';

/** Standard-Oberfläche (Schrittklang) und Texturmaßstab je Material. */
export const MATERIALS: Record<MaterialId, { surface: Surface; uv: number }> = {
  concrete: { surface: 'concrete', uv: 4 },
  concreteDark: { surface: 'concrete', uv: 4 },
  asphalt: { surface: 'concrete', uv: 6 },
  paving: { surface: 'concrete', uv: 3 },
  plaster: { surface: 'concrete', uv: 4 },
  brick: { surface: 'concrete', uv: 3 },
  wallPaint: { surface: 'concrete', uv: 4 },
  wallTile: { surface: 'tile', uv: 2 },
  corrugated: { surface: 'metal', uv: 4 },
  corrugatedDark: { surface: 'metal', uv: 4 },
  metal: { surface: 'metal', uv: 2 },
  steel: { surface: 'metal', uv: 2 },
  grating: { surface: 'grate', uv: 1 },
  wood: { surface: 'wood', uv: 2 },
  crate: { surface: 'wood', uv: 1.2 },
  pallet: { surface: 'wood', uv: 1.2 },
  wrap: { surface: 'wood', uv: 1.2 },
  carton: { surface: 'wood', uv: 1 },
  hazard: { surface: 'metal', uv: 1 },
  tile: { surface: 'tile', uv: 2 },
  roof: { surface: 'metal', uv: 4 },
  container: { surface: 'metal', uv: 2.6 },
  rubber: { surface: 'concrete', uv: 1 },
  cage: { surface: 'metal', uv: 1 },
  server: { surface: 'metal', uv: 2 },
  door: { surface: 'metal', uv: 2.2 },
  gate: { surface: 'metal', uv: 3 },
  epoxy: { surface: 'tile', uv: 4 },
  gravel: { surface: 'gravel', uv: 5 },
  foliage: { surface: 'concrete', uv: 2 },
  rust: { surface: 'metal', uv: 3 },
  black: { surface: 'metal', uv: 2 },
  white: { surface: 'metal', uv: 2 },
  emissive: { surface: 'metal', uv: 1 },
  sky: { surface: 'concrete', uv: 8 },
  window: { surface: 'metal', uv: 2 },
  skylight: { surface: 'metal', uv: 2 },
  vent: { surface: 'metal', uv: 1 },
  panel: { surface: 'metal', uv: 2.4 },
  frost: { surface: 'tile', uv: 2 },
  cobble: { surface: 'gravel', uv: 2.4 },
  water: { surface: 'concrete', uv: 6 },
  sack: { surface: 'wood', uv: 0.9 },
};

/** Kollision eines Brushes: alles, nur Bewegung (Clip/Geländer), nur Strahlen, oder nichts (Deko). */
export type Collide = 'all' | 'move' | 'shot' | 'none';

export type Brush = {
  min: Vec3;
  max: Vec3;
  /** Rampe: Oberseite steigt in diese Richtung von min[1] auf max[1]. */
  ramp?: RampDir;
  mat: MaterialId;
  /** Material der Oberseite (z. B. Gitterrost). */
  top?: MaterialId;
  /** Farbton (0xRRGGBB), multipliziert die Textur. */
  tint?: number;
  surface?: Surface;
  collide?: Collide;
  /** false = unsichtbar (Clip). Standard: true. */
  visible?: boolean;
  /** Wirft Schatten/verdeckt Licht beim Backen (Standard: sichtbar). */
  occlude?: boolean;
  /** Oberseite ist kein Navigationsboden (Regaldach, Geländer …). */
  noNav?: boolean;
  /** Gruppe: 'roof' (Dach, nicht im Radar), 'tunnel' (Radar-Overlay), 'wall', 'prop' … */
  tag?: string;
  /** Texturmaßstab (m je Kachel), Standard aus MATERIALS. */
  uv?: number;
  /** Textur je Fläche einpassen statt in Weltkoordinaten kacheln (Fenster, Tore, Schilder). */
  uvFit?: boolean;
};

/** Instanzierte Deko-Form (Zylinder, Leuchten, Fahrzeuge …), nur Darstellung. */
export type DecorKind =
  | 'barrel' | 'drum' | 'pipeX' | 'pipeZ' | 'pipeY' | 'wheel' | 'lampHall' | 'lampWall' | 'lampTube' | 'lampPost'
  | 'forklift' | 'serverRack' | 'serverLeds' | 'ibc' | 'fencePost' | 'conveyorRoller' | 'cone' | 'extinguisher'
  | 'cableTrayX' | 'cableTrayZ' | 'fanUnit' | 'rail'
  | 'tank' | 'tankDome' | 'stripCurtain' | 'compressor' | 'condenser'
  | 'sack' | 'van' | 'fountain' | 'lantern' | 'log' | 'archRing';

export type Decor = {
  kind: DecorKind;
  pos: Vec3;
  /** Drehung um Y (Radiant). */
  rot?: number;
  /** Skalierung (x, y, z) der Grundform. */
  scale?: Vec3;
  tint?: number;
};

export type LightKind = 'lamp' | 'spot' | 'tube' | 'window';
export type MapLight = {
  kind: LightKind;
  pos: Vec3;
  color: number;
  intensity: number;
  range: number;
  /** Spot: Richtung (normiert) und halber Öffnungswinkel (rad). */
  dir?: Vec3;
  angle?: number;
};

/** Bodenmarkierungen und Schilder (nur Darstellung). */
export type Decal = {
  kind: 'line' | 'stripes' | 'letter' | 'arrow' | 'stain' | 'grid' | 'text' | 'frost';
  /** Mitte, knapp über dem Boden. */
  pos: Vec3;
  size: [number, number];
  rot?: number;
  color?: number;
  text?: string;
};

export type Facing = 'px' | 'nx' | 'pz' | 'nz';
export type Sign = { text: string; pos: Vec3; facing: Facing; w: number; h: number; color?: number; bg?: number; sub?: string };

export type Area = { name: string; min: Vec3; max: Vec3 };
export type Site = { id: 'A' | 'B'; name: string; min: Vec3; max: Vec3; plant: Vec3 };
export type Spawn = { team: Team; pos: Vec3; yaw: number };
export type BuyZone = { team: Team; min: Vec3; max: Vec3 };

/**
 * Optionale Bot-Hinweise (Bots funktionieren ohne; Hinweise werten nur auf):
 * `hold`/`sniper` = gute Halte-/Scharfschützenposition (optional nur für ein Team/einen Spot),
 * `plant` = bevorzugter Pflanzplatz, `smoke` = bewährter Rauchwurf (von `from` auf `target`,
 * wird vor der Nutzung mit der Granatenphysik geprüft).
 */
export type BotHint =
  | { kind: 'hold' | 'sniper'; pos: Vec3; team?: Team; site?: 'A' | 'B' }
  | { kind: 'plant'; pos: Vec3; site: 'A' | 'B' }
  | { kind: 'smoke'; from: Vec3; target: Vec3; team: Team; site?: 'A' | 'B' };

export type MapEnv = {
  /** Richtung ZUR Sonne (normiert). */
  sunDir: Vec3;
  sunColor: number;
  sunIntensity: number;
  skyTop: number;
  skyHorizon: number;
  skyIntensity: number;
  /** Grundhelligkeit in Innenräumen (indirektes Licht). */
  ambient: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
};

export type MapData = {
  id: string;
  name: string;
  description: string;
  bounds: { min: Vec3; max: Vec3 };
  brushes: Brush[];
  decor: Decor[];
  decals: Decal[];
  signs: Sign[];
  lights: MapLight[];
  areas: Area[];
  sites: Site[];
  spawns: Spawn[];
  buyZones: BuyZone[];
  acoustics: { zones: AcousticZone[]; emitters: AmbientEmitter[] };
  env: MapEnv;
  /** Optionale Bot-Hinweise (Halte-/Pflanzplätze, Rauchwürfe). */
  botHints?: BotHint[];
};

/** Öffnung in einer Wand: Bereich entlang der Wand (from..to) und Höhe (bottom..top, absolut). */
export type Opening = { from: number; to: number; bottom: number; top: number };

export type BrushOpts = Partial<Omit<Brush, 'min' | 'max' | 'mat'>>;

/** Bau-Helfer für Kartenmodule. Alle Methoden hängen an `data` an und liefern das Erzeugte. */
export class MapBuilder {
  readonly data: MapData;

  constructor(meta: { id: string; name: string; description: string; bounds: { min: Vec3; max: Vec3 }; env: MapEnv }) {
    this.data = {
      ...meta, brushes: [], decor: [], decals: [], signs: [], lights: [], areas: [], sites: [], spawns: [], buyZones: [],
      acoustics: { zones: [], emitters: [] },
    };
  }

  /** Quader von min bis max. */
  box(min: Vec3, max: Vec3, mat: MaterialId, opts: BrushOpts = {}): Brush {
    const b: Brush = { min: [Math.min(min[0], max[0]), Math.min(min[1], max[1]), Math.min(min[2], max[2])], max: [Math.max(min[0], max[0]), Math.max(min[1], max[1]), Math.max(min[2], max[2])], mat, ...opts };
    this.data.brushes.push(b);
    return b;
  }

  /** Boden-/Deckenplatte mit Oberkante y. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, mat: MaterialId, opts: BrushOpts & { thick?: number } = {}): Brush {
    const { thick = 0.4, ...rest } = opts;
    return this.box([x0, y - thick, z0], [x1, y, z1], mat, rest);
  }

  /** Dach/Decke mit Unterkante y (nicht im Radar, nicht begehbar). */
  roof(x0: number, z0: number, x1: number, z1: number, y: number, mat: MaterialId = 'roof', opts: BrushOpts & { thick?: number } = {}): Brush {
    const { thick = 0.4, ...rest } = opts;
    return this.box([x0, y, z0], [x1, y + thick, z1], mat, { tag: 'roof', noNav: true, ...rest });
  }

  /** Massiver Block (z. B. Gebäudemasse außerhalb des Spielbereichs, Mauer). */
  block(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: MaterialId, opts: BrushOpts = {}): Brush {
    return this.box([x0, y0, z0], [x1, y1, z1], mat, opts);
  }

  /**
   * Wand entlang X (von x0 bis x1, Mitte bei z, Dicke thick) mit Öffnungen (Türen,
   * Tore, Fenster). Wird in Quader zerlegt: Pfeiler, Stürze, Brüstungen.
   */
  wallX(x0: number, x1: number, z: number, y0: number, y1: number, mat: MaterialId, openings: Opening[] = [], opts: BrushOpts & { thick?: number } = {}): Brush[] {
    const { thick = 0.4, ...rest } = opts;
    return this.splitWall(x0, x1, y0, y1, openings, (a, b, ya, yb) => this.box([a, ya, z - thick / 2], [b, yb, z + thick / 2], mat, { tag: 'wall', ...rest }));
  }

  /** Wand entlang Z (von z0 bis z1, Mitte bei x). */
  wallZ(z0: number, z1: number, x: number, y0: number, y1: number, mat: MaterialId, openings: Opening[] = [], opts: BrushOpts & { thick?: number } = {}): Brush[] {
    const { thick = 0.4, ...rest } = opts;
    return this.splitWall(z0, z1, y0, y1, openings, (a, b, ya, yb) => this.box([x - thick / 2, ya, a], [x + thick / 2, yb, b], mat, { tag: 'wall', ...rest }));
  }

  private splitWall(a0: number, a1: number, y0: number, y1: number, openings: Opening[], make: (a: number, b: number, ya: number, yb: number) => Brush): Brush[] {
    const out: Brush[] = [];
    const ops = openings.map((o) => ({ ...o, from: Math.max(a0, Math.min(o.from, o.to)), to: Math.min(a1, Math.max(o.from, o.to)) })).filter((o) => o.to > o.from).sort((p, q) => p.from - q.from);
    let cur = a0;
    for (const o of ops) {
      if (o.from > cur + 1e-6) out.push(make(cur, o.from, y0, y1));
      if (o.bottom > y0 + 1e-6) out.push(make(o.from, o.to, y0, Math.min(o.bottom, y1)));
      if (o.top < y1 - 1e-6) out.push(make(o.from, o.to, Math.max(o.top, y0), y1));
      cur = Math.max(cur, o.to);
    }
    if (a1 > cur + 1e-6) out.push(make(cur, a1, y0, y1));
    return out;
  }

  /** Rampe (Keil) über dem Rechteck, steigt in Richtung dir von yLow auf yHigh. */
  ramp(x0: number, z0: number, x1: number, z1: number, yLow: number, yHigh: number, dir: RampDir, mat: MaterialId, opts: BrushOpts = {}): Brush {
    return this.box([x0, yLow, z0], [x1, yHigh, z1], mat, { ramp: dir, ...opts });
  }

  /**
   * Treppe: sichtbare Stufen (blockieren Schüsse) + unsichtbare Clip-Rampe für die
   * Bewegung (gleichmäßiges Hochlaufen wie in CS). Stufenhöhe ≈ 0.2 m.
   */
  stairs(x0: number, z0: number, x1: number, z1: number, yLow: number, yHigh: number, dir: RampDir, mat: MaterialId = 'concrete', opts: BrushOpts & { solid?: boolean } = {}): Brush[] {
    const { solid = true, ...rest } = opts;
    const n = Math.max(2, Math.round((yHigh - yLow) / 0.2));
    const out: Brush[] = [];
    const along = dir === 'px' || dir === 'nx' ? [x0, x1] : [z0, z1];
    const len = along[1]! - along[0]!;
    for (let i = 0; i < n; i++) {
      const top = yLow + ((i + 1) * (yHigh - yLow)) / n;
      // Stufe i belegt den Abschnitt i/n..(i+1)/n vom tiefen Ende aus (keine Überlappung)
      const f0 = i / n;
      const f1 = (i + 1) / n;
      const lo = dir === 'px' || dir === 'pz' ? along[0]! + len * f0 : along[1]! - len * f1;
      const hi = dir === 'px' || dir === 'pz' ? along[0]! + len * f1 : along[1]! - len * f0;
      const bottom = solid ? yLow : top - 0.25;
      const min: Vec3 = dir === 'px' || dir === 'nx' ? [lo, bottom, z0] : [x0, bottom, lo];
      const max: Vec3 = dir === 'px' || dir === 'nx' ? [hi, top, z1] : [x1, top, hi];
      out.push(this.box(min, max, mat, { collide: 'shot', noNav: true, tag: 'stairs', ...rest }));
    }
    // Clip-Rampe über die Stufenkanten (vorderste Kante bis zum letzten Auftritt) + oberster Auftritt flach
    const fTop = (n - 1) / n;
    const rise = (yHigh - yLow) / n;
    const cut = dir === 'px' || dir === 'pz' ? along[0]! + len * fTop : along[1]! - len * fTop;
    const rampMin: Vec3 = dir === 'px' ? [x0, yLow + rise, z0] : dir === 'nx' ? [cut, yLow + rise, z0] : dir === 'pz' ? [x0, yLow + rise, z0] : [x0, yLow + rise, cut];
    const rampMax: Vec3 = dir === 'px' ? [cut, yHigh, z1] : dir === 'nx' ? [x1, yHigh, z1] : dir === 'pz' ? [x1, yHigh, cut] : [x1, yHigh, z1];
    out.push(this.box(rampMin, rampMax, mat, { ramp: dir, collide: 'move', visible: false, occlude: false, tag: 'clip' }));
    const landMin: Vec3 = dir === 'px' ? [cut, yLow, z0] : dir === 'nx' ? [x0, yLow, z0] : dir === 'pz' ? [x0, yLow, cut] : [x0, yLow, z0];
    const landMax: Vec3 = dir === 'px' ? [x1, yHigh, z1] : dir === 'nx' ? [cut, yHigh, z1] : dir === 'pz' ? [x1, yHigh, z1] : [x1, yHigh, cut];
    out.push(this.box(landMin, landMax, mat, { collide: 'move', visible: false, occlude: false, tag: 'clip' }));
    // Unter der Rampe (bis zur ersten Kante) ebenfalls massiv für die Bewegung
    out.push(this.box(dir === 'px' || dir === 'pz' ? [x0, yLow, z0] : rampMin.map((v, i) => (i === 1 ? yLow : v)) as Vec3, [rampMax[0], yLow + rise, rampMax[2]], mat, { collide: 'move', visible: false, occlude: false, noNav: true, tag: 'clip' }));
    return out;
  }

  /** Geländer (blockiert Bewegung, nicht Schüsse): Pfosten + Handlauf als Deko, Clip als Kollision. */
  rail(x0: number, z0: number, x1: number, z1: number, y: number, h = 1.05, tint = 0xd8b020): void {
    const t = 0.06;
    const minX = Math.min(x0, x1) - (x0 === x1 ? t : 0);
    const maxX = Math.max(x0, x1) + (x0 === x1 ? t : 0);
    const minZ = Math.min(z0, z1) - (z0 === z1 ? t : 0);
    const maxZ = Math.max(z0, z1) + (z0 === z1 ? t : 0);
    this.box([minX, y, minZ], [maxX, y + h, maxZ], 'metal', { collide: 'move', visible: false, occlude: false, noNav: true, tag: 'rail' });
    // Handlauf + Knieleiste
    this.box([minX, y + h - 0.05, minZ], [maxX, y + h, maxZ], 'metal', { collide: 'none', tint, noNav: true, occlude: false, tag: 'rail' });
    this.box([minX, y + h * 0.5 - 0.03, minZ], [maxX, y + h * 0.5 + 0.03, maxZ], 'metal', { collide: 'none', tint, noNav: true, occlude: false, tag: 'rail' });
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      this.box([x - 0.03, y, z - 0.03], [x + 0.03, y + h, z + 0.03], 'metal', { collide: 'none', tint, noNav: true, occlude: false, tag: 'rail' });
    }
  }

  /**
   * Laufsteg (Stahlrost) über dem Rechteck mit Oberkante y; Geländer an den Längsseiten
   * (`rails`: beide, keine oder nur die Seite mit kleinerem/größerem Querwert `a`/`b`).
   */
  walkway(x0: number, z0: number, x1: number, z1: number, y: number, opts: { rails?: 'both' | 'none' | 'a' | 'b'; thick?: number; tint?: number; railTint?: number } = {}): Brush {
    const { rails = 'both', thick = 0.25, tint = 0x5a6a7a, railTint } = opts;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    const floor = this.floor(minX, minZ, maxX, maxZ, y, 'steel', { thick, top: 'grating', tint, tag: 'platform' });
    const e = 0.05;
    if (maxX - minX >= maxZ - minZ) {
      if (rails === 'both' || rails === 'a') this.rail(minX, minZ + e, maxX, minZ + e, y, 1.05, railTint);
      if (rails === 'both' || rails === 'b') this.rail(minX, maxZ - e, maxX, maxZ - e, y, 1.05, railTint);
    } else {
      if (rails === 'both' || rails === 'a') this.rail(minX + e, minZ, minX + e, maxZ, y, 1.05, railTint);
      if (rails === 'both' || rails === 'b') this.rail(maxX - e, minZ, maxX - e, maxZ, y, 1.05, railTint);
    }
    return floor;
  }

  decor(kind: DecorKind, pos: Vec3, rot = 0, scale?: Vec3, tint?: number): Decor {
    const d: Decor = { kind, pos, rot, scale, tint };
    this.data.decor.push(d);
    return d;
  }

  light(l: MapLight): MapLight {
    this.data.lights.push(l);
    return l;
  }

  /** Hallenleuchte (Deko + Licht) unter der Decke. */
  hallLamp(x: number, y: number, z: number, opts: { color?: number; intensity?: number; range?: number } = {}): void {
    this.decor('lampHall', [x, y, z]);
    this.light({ kind: 'lamp', pos: [x, y - 0.3, z], color: opts.color ?? 0xffe2b0, intensity: opts.intensity ?? 1.2, range: opts.range ?? 16 });
  }

  /** Wandleuchte (Deko + Licht), facing = Richtung, in die sie strahlt. */
  wallLamp(x: number, y: number, z: number, facing: Facing, opts: { color?: number; intensity?: number; range?: number } = {}): void {
    const rot = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[facing];
    this.decor('lampWall', [x, y, z], rot);
    const off = { pz: [0, 0, 0.4], nz: [0, 0, -0.4], px: [0.4, 0, 0], nx: [-0.4, 0, 0] }[facing];
    this.light({ kind: 'lamp', pos: [x + off[0]!, y - 0.2, z + off[2]!], color: opts.color ?? 0xffd59a, intensity: opts.intensity ?? 0.9, range: opts.range ?? 11 });
  }

  /** Leuchtstoffröhre (Tunnel/Büro). */
  tubeLamp(x: number, y: number, z: number, alongX: boolean, opts: { color?: number; intensity?: number; range?: number } = {}): void {
    this.decor('lampTube', [x, y, z], alongX ? 0 : Math.PI / 2);
    this.light({ kind: 'tube', pos: [x, y - 0.15, z], color: opts.color ?? 0xd8ecff, intensity: opts.intensity ?? 0.8, range: opts.range ?? 9 });
  }

  decal(d: Decal): void {
    this.data.decals.push(d);
  }

  sign(text: string, pos: Vec3, facing: Facing, w = 3, h = 0.8, opts: { color?: number; bg?: number; sub?: string } = {}): void {
    this.data.signs.push({ text, pos, facing, w, h, ...opts });
  }

  area(name: string, x0: number, z0: number, x1: number, z1: number, y0 = -20, y1 = 40): void {
    this.data.areas.push({ name, min: [Math.min(x0, x1), y0, Math.min(z0, z1)], max: [Math.max(x0, x1), y1, Math.max(z0, z1)] });
  }

  site(id: 'A' | 'B', name: string, min: Vec3, max: Vec3, plant: Vec3): void {
    this.data.sites.push({ id, name, min, max, plant });
  }

  spawn(team: Team, x: number, y: number, z: number, yaw: number): void {
    this.data.spawns.push({ team, pos: [x, y, z], yaw });
  }

  /** Spawn-Raster: cols × rows Punkte mit Abstand gap um (cx, cz). */
  spawnGrid(team: Team, cx: number, y: number, cz: number, cols: number, rows: number, gap: number, yaw: number): void {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) this.spawn(team, cx + (c - (cols - 1) / 2) * gap, y, cz + (r - (rows - 1) / 2) * gap, yaw);
    }
  }

  buy(team: Team, x0: number, z0: number, x1: number, z1: number, y0 = -20, y1 = 40): void {
    this.data.buyZones.push({ team, min: [Math.min(x0, x1), y0, Math.min(z0, z1)], max: [Math.max(x0, x1), y1, Math.max(z0, z1)] });
  }

  room(kind: RoomKind, min: Vec3, max: Vec3): void {
    this.data.acoustics.zones.push({ kind, min, max });
  }

  ambient(sound: AmbientSound, pos: Vec3, radius: number, volume?: number): void {
    this.data.acoustics.emitters.push({ sound, pos, radius, volume });
  }

  /** Bot-Hinweis (optional, siehe BotHint). */
  botHint(h: BotHint): void {
    (this.data.botHints ??= []).push(h);
  }
}
