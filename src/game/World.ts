import * as THREE from 'three';
import type { LevelFile, Vec3 } from '../shared/level';
import type { Team } from '../logic/economy';
import type { Pose } from '../logic/match';
import type { SolidBox } from '../logic/level';
import type { Aabb, PartBox } from '../logic/hitbox';
import { innerBounds } from '../logic/level';
import { layoutRacks, rackBounds } from '../logic/layout';
import { buildWaypoints, type WaypointGraph } from '../logic/waypoints';
import { spawnPoints, yawTowards } from '../logic/spawns';
import { buildLevelView } from '../level/LevelView';
import { groundBlockers } from '../logic/structures';

/**
 * Welt eines Spiels: Level-Geometrie (Sicht + Kollision), Wegpunkte, Zonen,
 * Spawnpunkte je Team. Wird einmal nach der Lobby gebaut und von Driver, Bots
 * und Shooter geteilt.
 */
export class World {
  readonly group: THREE.Group;
  readonly solids: SolidBox[];
  /** Solids als reine AABBs (Kampf-/Granaten-Logik). */
  readonly aabbs: Aabb[];
  /** Solids als PartBoxen (Sichtlinien in der Bot-Logik). */
  readonly parts: PartBox[];
  readonly waypoints: WaypointGraph;
  readonly inner: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly zones: { a: { x: number; z: number }; b: { x: number; z: number }; t: { x: number; z: number }; ct: { x: number; z: number } };
  readonly spawns: Record<Team, Vec3[]>;

  constructor(readonly level: LevelFile) {
    const view = buildLevelView(level);
    this.group = view.group;
    this.solids = view.solids;
    // Geländer sind offene Gitter: blockieren Bewegung, aber keine Schüsse, Sicht oder Granaten
    this.aabbs = this.solids.filter((s) => s.kind !== 'rail').map((s) => ({ minX: s.minX, minY: s.minY, minZ: s.minZ, maxX: s.maxX, maxY: s.maxY, maxZ: s.maxZ }));
    this.parts = this.aabbs.map((box) => ({ part: 'body' as const, box }));
    // Bots laufen am Boden: Requisiten, Stützen, Stufen, Rampe blockieren; hohe Plattformen/Geländer nicht
    this.waypoints = buildWaypoints(level.lager, undefined, groundBlockers(this.solids.filter((s) => s.kind !== 'rack' && s.kind !== 'wall')));
    this.inner = view.inner;
    const z = level.zones;
    this.zones = { a: { x: z.a[0], z: z.a[2] }, b: { x: z.b[0], z: z.b[2] }, t: { x: z.t[0], z: z.t[2] }, ct: { x: z.ct[0], z: z.ct[2] } };
    const bounds = rackBounds(layoutRacks(level.lager.lagerorte));
    const innerB = bounds ? innerBounds(bounds) : this.inner;
    this.spawns = {
      T: level.spawns?.t?.length ? level.spawns.t : spawnPoints(z.t, 10, this.solids, innerB),
      CT: level.spawns?.ct?.length ? level.spawns.ct : spawnPoints(z.ct, 10, this.solids, innerB),
    };
  }

  /** Spawn-Pose für Team/Index (zyklisch), Blick Richtung Hallenmitte. */
  spawnPose(team: Team, index: number): Pose {
    const list = this.spawns[team];
    const p = list[index % Math.max(1, list.length)] ?? [this.zones[team === 'T' ? 't' : 'ct'].x, 0, this.zones[team === 'T' ? 't' : 'ct'].z];
    const towards: Vec3 = [(this.zones.a.x + this.zones.b.x) / 2, 0, (this.zones.a.z + this.zones.b.z) / 2];
    return { x: p[0], y: 0, z: p[2], yaw: yawTowards(p, towards), pitch: 0 };
  }

  /** Kartenname fürs HUD. */
  get mapName(): string {
    return this.level.meta?.name ?? this.level.name;
  }
}
