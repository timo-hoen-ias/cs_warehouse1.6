import * as THREE from 'three';
import { DamageTarget, registerTarget, unregisterTarget } from '../entities/DamageTarget';
import { humanPartBoxes, type PartBox } from '../logic/hitbox';
import { PLAYER, stepPlayer, type PlayerMotion } from '../logic/move';
import type { WaypointGraph } from '../logic/waypoints';
import { bfsPath, nearestWaypoint } from '../logic/waypoints';
import { decideBotMove } from '../logic/botDecide';
import type { SolidBox } from '../logic/level';
import type { FpsPlayer } from '../player/FpsPlayer';

const SPEED = 3.4;
const BOT_HP = 100;
const SHOOT_RANGE = 40;
const SHOOT_COOLDOWN = 1.1;
const BOT_DMG = 8;
const COLORS = { body: 0xc9b24a, head: 0x8a7a2a, dead: 0x3a3f44 };

/**
 * CT-Bot-Entity (plain, kein Needle-Lifecycle): sichtbare Einheit + DamageTarget,
 * Bewegung per Wegpunkt-Graph, Beschuss des Spielers bei Sichtlinie.
 * Die per-Frame-Steuerung übernimmt BotBrain (Needle-Behaviour).
 */
export class Bot extends DamageTarget {
  readonly root = new THREE.Group();
  solids: SolidBox[] = [];
  player?: FpsPlayer;
  waypoints: WaypointGraph = { points: [], bounds: null };

  /** Zielpunkt, den der Bot ansteuert. */
  goal = { x: 0, z: 0 };

  private motion: PlayerMotion = { x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
  private path: number[] = [];
  private pathAt = 0;
  private shootTimer = 0;
  private readonly matBody: THREE.MeshStandardMaterial;
  private readonly matHead: THREE.MeshStandardMaterial;

  constructor() {
    super(BOT_HP);
    this.matBody = new THREE.MeshStandardMaterial({ color: COLORS.body, roughness: 0.8 });
    this.matHead = new THREE.MeshStandardMaterial({ color: COLORS.head, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.34), this.matBody);
    body.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.32), this.matHead);
    head.position.y = 1.45;
    this.root.add(body, head);
    registerTarget(this);
  }

  addTo(parent: THREE.Object3D): void {
    parent.add(this.root);
  }

  setPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
    this.motion = { x, y: PLAYER.eye, z, vy: 0, grounded: true };
    this.path = [];
    this.pathAt = 0;
  }

  dispose(): void {
    unregisterTarget(this);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    });
    this.root.removeFromParent();
  }

  override partBoxes(): PartBox[] {
    this.root.updateWorldMatrix(true, false);
    const wp = this.root.getWorldPosition(new THREE.Vector3());
    return humanPartBoxes({ x: wp.x, y: wp.y, z: wp.z });
  }

  /** Pro-Frame-Logik (vom BotBrain gerufen). */
  think(dt: number): void {
    if (!this.health.alive) return;
    const playerPos = this.player && !this.player.dead ? { x: this.player.motionX(), z: this.player.motionZ() } : null;
    const decision = decideBotMove({
      from: { x: this.root.position.x, z: this.root.position.z },
      player: playerPos,
      goal: this.goal,
      maxRange: SHOOT_RANGE,
      solids: this.solids.map(solidToPart),
    });

    if (decision.canSee) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = SHOOT_COOLDOWN;
        if (playerPos) this.player!.takeDamage(BOT_DMG);
      }
    }
    this.walkTowards(decision.target, dt);
  }

  private walkTowards(target: { x: number; z: number }, dt: number): void {
    const here = nearestWaypoint(this.waypoints, this.root.position.x, this.root.position.z);
    const there = nearestWaypoint(this.waypoints, target.x, target.z);
    if (this.path.length === 0 || this.pathAt >= this.path.length) {
      this.path = bfsPath(this.waypoints, here, there);
      this.pathAt = 0;
    }

    const next = this.path[this.pathAt];
    const wp = next !== undefined ? this.waypoints.points[next] : null;
    let dirX = 0;
    let dirZ = 0;
    if (wp) {
      dirX = wp.pos[0] - this.root.position.x;
      dirZ = wp.pos[2] - this.root.position.z;
      const l = Math.hypot(dirX, dirZ);
      if (l < 0.4) {
        this.pathAt += 1;
        return;
      }
      dirX /= l;
      dirZ /= l;
    } else {
      const dx = target.x - this.root.position.x;
      const dz = target.z - this.root.position.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.5) return;
      dirX = dx / l;
      dirZ = dz / l;
    }

    this.motion = stepPlayer(this.motion, dirX * SPEED, dirZ * SPEED, false, dt, this.solids);
    this.root.position.set(this.motion.x, 0, this.motion.z);

    const lookDx = target.x - this.root.position.x;
    const lookDz = target.z - this.root.position.z;
    if (Math.hypot(lookDx, lookDz) > 0.1) this.root.rotation.y = Math.atan2(lookDx, lookDz);
  }

  override takeHit(part: 'head' | 'body', def: import('../logic/weapons').WeaponDef): boolean {
    const killed = super.takeHit(part, def);
    if (killed) {
      this.matBody.color.setHex(COLORS.dead);
      this.matHead.color.setHex(COLORS.dead);
      this.path = [];
    }
    return killed;
  }

  /** Kurzer roter Blitz am Körper. */
  override flashHit(): void {
    this.matBody.emissive.setHex(0x990000);
    setTimeout(() => { this.matBody.emissive.setHex(0x000000); }, 90);
  }
}

function solidToPart(s: SolidBox): PartBox {
  return { part: 'body', box: { minX: s.minX, minY: s.minY, minZ: s.minZ, maxX: s.maxX, maxY: s.maxY, maxZ: s.maxZ } };
}

export { PLAYER };
