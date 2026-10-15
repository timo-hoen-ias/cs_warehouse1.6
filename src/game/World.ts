import * as THREE from 'three';
import type { Team } from '../logic/economy';
import type { Pose } from '../logic/match';
import type { SolidBox } from '../logic/level';
import type { MapData, Site, Spawn } from '../logic/mapkit';
import type { AcousticZone, AmbientEmitter, Surface } from '../logic/acoustics';
import { COL, type Collider } from '../logic/collision';
import { compileMap, inBuyZoneBox, siteAt, type CompiledMap, type P3 } from '../logic/mapcompile';
import { areaAt, findPath, forNodesNear, nearestNode, type NavArea, type NavGraph, type NavPath, type PathOpts, type XYZ } from '../logic/nav';
import { renderOverview, type Raster } from '../logic/overview';
import { PLAYER } from '../logic/move';
import { buildLevelView, type LevelBuild } from '../level/LevelView';

/**
 * Welt eines Spiels: kompilierte Karte (Kollision mit Rampen + Raster, Navigation,
 * Spots, Spawns, Kaufzonen, Akustik) und ihre Darstellung. Wird einmal nach der Lobby
 * gebaut und von Driver, Bots, Spieler, Shooter, HUD und Audio geteilt.
 */
export class World {
  readonly data: MapData;
  readonly map: CompiledMap;
  readonly view: LevelBuild;
  readonly group: THREE.Group;
  /** Kollision + Strahlen (Schüsse, Sicht, Granaten). */
  readonly collider: Collider;
  /** 3D-Navigationsgraph (Bots). */
  readonly nav: NavGraph;
  readonly zones: { a: P3; b: P3; t: P3; ct: P3 };
  readonly spawns: Record<Team, Spawn[]>;
  readonly sites: Site[];
  /** Akustik-Vertrag für die Audio-Schicht. */
  readonly acoustics: { zones: AcousticZone[]; emitters: AmbientEmitter[] };
  /** Radarbild (Draufsicht) für das HUD. */
  readonly radar: Raster;

  constructor(data: MapData, quality: 'high' | 'low' = 'high') {
    this.data = data;
    this.map = compileMap(data);
    this.collider = this.map.collider;
    this.nav = this.map.nav;
    this.zones = this.map.zones;
    this.spawns = this.map.spawns;
    this.sites = this.map.sites;
    this.acoustics = this.map.acoustics;
    this.view = buildLevelView(data, quality);
    this.group = this.view.group;
    this.radar = renderOverview(data, { pxPerM: 3, radar: true });
  }

  /** Spawn-Pose für Team/Index (zyklisch), Blick aus der Kartendefinition. */
  spawnPose(team: Team, index: number): Pose {
    const list = this.spawns[team];
    const s = list[index % Math.max(1, list.length)];
    if (!s) {
      const z = this.zones[team === 'T' ? 't' : 'ct'];
      return { x: z.x, y: z.y, z: z.z, yaw: 0, pitch: 0 };
    }
    return { x: s.pos[0], y: s.pos[1], z: s.pos[2], yaw: s.yaw, pitch: 0 };
  }

  /** Bombenspot am Fußpunkt (oder null). */
  siteAt(p: P3): 'a' | 'b' | null {
    return siteAt(this.sites, p);
  }

  inBuyZone(team: Team, p: P3): boolean {
    return inBuyZoneBox(this.map.buyZones, team, p);
  }

  /** Oberfläche unter einem Punkt (Schrittklang); Standard Beton. */
  surfaceAt(x: number, y: number, z: number): Surface {
    return this.collider.surfaceAt(x, y, z) ?? 'concrete';
  }

  /**
   * Bodenhöhe an (x,z): mit yHint die höchste Fläche knapp darunter (Drops, Teleports
   * auf einer Ebene), ohne die unterste begehbare Ebene (Navigationsknoten), sonst Kollision.
   */
  groundAt(x: number, z: number, yHint?: number): number {
    if (yHint !== undefined) return this.collider.groundHeight(x, z, yHint, PLAYER.radius, 0.1);
    let lowest = Infinity;
    forNodesNear(this.nav, x, z, 0.8, (i) => {
      lowest = Math.min(lowest, this.nav.y[i]!);
    });
    return this.collider.groundHeight(x, z, (lowest === Infinity ? 40 : lowest) + 0.3, PLAYER.radius, 0.1);
  }

  /** Weg für Bots (A*, geglättet). */
  findPath(from: XYZ, to: XYZ, opts: PathOpts = {}): NavPath | null {
    return findPath(this.nav, this.collider, from, to, opts);
  }

  /** Callout-Bereich an einer Position. */
  areaAt(p: XYZ): NavArea | null {
    return areaAt(this.nav, p);
  }

  nearestNode(p: XYZ): number {
    return nearestNode(this.nav, p.x, p.y, p.z);
  }

  /**
   * Bewegungs-Blocker in der Nähe, die die Augenhöhe schneiden (als SolidBox) —
   * z. B. für den Wandabstand der Waffe im Viewmodel.
   */
  blockersNear(x: number, eyeY: number, z: number, r = 2.5): SolidBox[] {
    const out: SolidBox[] = [];
    for (const it of this.collider.query(x - r, z - r, x + r, z + r, COL.shot)) {
      if (it.minY > eyeY + 0.3 || it.maxY < eyeY - 0.3) continue;
      out.push({ kind: 'wall', minX: it.minX, maxX: it.maxX, minY: it.minY, maxY: it.maxY, minZ: it.minZ, maxZ: it.maxZ, label: '' });
    }
    return out;
  }

  /** Kartenname fürs HUD. */
  get mapName(): string {
    return this.data.name;
  }
}
