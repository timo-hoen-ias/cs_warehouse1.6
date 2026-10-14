import * as THREE from 'three';
import type { Team } from '../logic/economy';
import type { Pose } from '../logic/match';
import { humanPartBoxes, type PartBox } from '../logic/hitbox';
import { WEAPONS } from '../logic/weapons';
import { worldGeometry } from '../weapons/models';
import { CROUCH_DROP, LEG, fallPose, solveLegAngles, walkPose } from './soldierAnim';
import {
  SHOULDER_X, SHOULDER_Y, TORSO_PIVOT_Y, WEAPON_POS,
  buildArmGeometry, buildShinGeometry, buildThighGeometry, buildTorsoGeometry, buildWeaponGeometry,
  type ArmStance, type WeaponKind,
} from './soldierParts';

/** Tönung der Materialien: lebendig = unverändert (Vertex-Farben), tot = abgedunkelt/entsättigt. */
const ALIVE_TINT = 0xffffff;
const DEAD_TINT = 0x4a5057;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Sichtbarer Soldat (Bots + entfernte Spieler): Low-Poly-Körper (Weste, Stiefel, Rucksack,
 * Team-Ausrüstung), Arme in Zweihandhaltung, Waffe + Namensschild (Sprite).
 * Statische Teile sind je Körperteil zu einem Mesh verschmolzen (7 Meshes + Waffe).
 * Hitboxen kommen aus humanPartBoxes an der Fußposition.
 * Bewegung: setPose (Host-Bot) oder interpolierte Netz-Posen.
 */
export class Soldier {
  readonly root = new THREE.Group();
  team: Team;
  private readonly matTop: THREE.MeshStandardMaterial;
  private readonly matLegs: THREE.MeshStandardMaterial;
  private readonly matGun: THREE.MeshStandardMaterial;
  /** Alles außer dem Namensschild (wird beim Umfallen um den Fußpunkt gedreht). */
  private readonly fallGroup = new THREE.Group();
  private readonly weaponNode = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly torsoMesh: THREE.Mesh;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private readonly thighL: THREE.Mesh;
  private readonly thighR: THREE.Mesh;
  private readonly shinL: THREE.Mesh;
  private readonly shinR: THREE.Mesh;
  private readonly gunMesh: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private stance: ArmStance = 'long';
  private weaponId = '';
  private walkPhase = 0;
  private walkAmp = 0;
  private lastX = 0;
  private lastZ = 0;
  private crouch = 0;
  private deathStart = 0;
  private falling = false;
  private readonly fallDir: 1 | -1;
  private readonly fallRoll: number;
  alive = true;

  constructor(readonly id: string, public name: string, team: Team) {
    this.team = team;
    const h = hashId(id);
    this.fallDir = h & 1 ? 1 : -1;
    this.fallRoll = (((h >>> 1) % 7) - 3) * 0.05;
    this.matTop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
    this.matLegs = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
    this.matGun = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });

    // Beine: Oberschenkel am Hüftgelenk, Unterschenkel am Knie (Fuß bei y=0)
    const empty = (): THREE.BufferGeometry => new THREE.BufferGeometry();
    this.thighL = new THREE.Mesh(empty(), this.matLegs);
    this.thighR = new THREE.Mesh(empty(), this.matLegs);
    this.shinL = new THREE.Mesh(empty(), this.matLegs);
    this.shinR = new THREE.Mesh(empty(), this.matLegs);
    this.thighL.position.set(-0.1, LEG.hipY, 0);
    this.thighR.position.set(0.1, LEG.hipY, 0);
    this.shinL.position.y = -LEG.thigh;
    this.shinR.position.y = -LEG.thigh;
    this.thighL.add(this.shinL);
    this.thighR.add(this.shinR);

    // Oberkörper (Drehpunkt = Hüfte), Arme an den Schultern, Waffenknoten an der rechten Hand
    this.torsoMesh = new THREE.Mesh(empty(), this.matTop);
    this.armL = new THREE.Mesh(empty(), this.matTop);
    this.armR = new THREE.Mesh(empty(), this.matTop);
    this.armL.position.set(-SHOULDER_X, SHOULDER_Y - TORSO_PIVOT_Y, 0);
    this.armR.position.set(SHOULDER_X, SHOULDER_Y - TORSO_PIVOT_Y, 0);
    this.weaponNode.position.set(WEAPON_POS.x, WEAPON_POS.y - TORSO_PIVOT_Y, WEAPON_POS.z);
    this.gunMesh = new THREE.Mesh(empty(), this.matGun);
    this.weaponNode.add(this.gunMesh);
    this.torso.add(this.torsoMesh, this.armL, this.armR, this.weaponNode);
    this.torso.position.y = TORSO_PIVOT_Y;

    this.fallGroup.add(this.thighL, this.thighR, this.torso);
    this.root.add(this.fallGroup);
    for (const m of [this.torsoMesh, this.armL, this.armR, this.thighL, this.thighR, this.shinL, this.shinR]) m.castShadow = true;
    this.buildBody();

    // Umfallen: einmal pro Frame vor dem Matrix-Update (setPose läuft nur für Lebende)
    const baseUpdate = this.root.updateMatrixWorld.bind(this.root);
    this.root.updateMatrixWorld = (force?: boolean): void => {
      this.tickFall();
      baseUpdate(force);
    };

    // Namensschild
    this.label = makeLabel(name, team);
    this.label.position.y = 2.05;
    this.root.add(this.label);
    this.setWeapon('knife');
    this.applyPose(0, 0, 0, 0);
  }

  addTo(parent: THREE.Object3D): void {
    parent.add(this.root);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    this.matTop.dispose();
    this.matLegs.dispose();
    this.matGun.dispose();
    const lm = this.label.material as THREE.SpriteMaterial;
    lm.map?.dispose();
    lm.dispose();
  }

  /** Teamabhängige Geometrie (Helm/Sturmhaube, Farben) neu aufbauen und alte freigeben. */
  private buildBody(): void {
    const t = this.team;
    this.swapGeometry(this.torsoMesh, buildTorsoGeometry(t));
    this.swapGeometry(this.armR, buildArmGeometry(t, 'R', this.stance));
    this.swapGeometry(this.armL, buildArmGeometry(t, 'L', this.stance));
    this.swapGeometry(this.thighL, buildThighGeometry(t, 'L'));
    this.swapGeometry(this.thighR, buildThighGeometry(t, 'R'));
    this.swapGeometry(this.shinL, buildShinGeometry(t, 'L'));
    this.swapGeometry(this.shinR, buildShinGeometry(t, 'R'));
  }

  private swapGeometry(mesh: THREE.Mesh, geo: THREE.BufferGeometry): void {
    const old = mesh.geometry;
    mesh.geometry = geo;
    old.dispose();
  }

  private applyTint(): void {
    const c = this.alive ? ALIVE_TINT : DEAD_TINT;
    this.matTop.color.setHex(c);
    this.matLegs.color.setHex(c);
  }

  setTeam(team: Team): void {
    if (this.team === team) return;
    this.team = team;
    this.buildBody();
    this.setName(this.name);
  }

  setName(name: string): void {
    this.name = name;
    const old = this.label.material as THREE.SpriteMaterial;
    old.map?.dispose();
    const fresh = makeLabel(name, this.team);
    old.map = (fresh.material as THREE.SpriteMaterial).map;
    old.needsUpdate = true;
    (fresh.material as THREE.Material).dispose();
  }

  /** Pose setzen (Fußpunkt, Yaw = Blick). */
  setPose(p: Pose, crouch = false): void {
    const dx = p.x - this.lastX;
    const dz = p.z - this.lastZ;
    const moved = Math.hypot(dx, dz);
    this.lastX = p.x;
    this.lastZ = p.z;
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = p.yaw + Math.PI; // Modell blickt +Z, Kamera-Yaw 0 = -Z
    // Gehanimation (Amplitude weich nachgeführt, damit Anhalten nicht ruckt)
    if (moved > 0.0005) this.walkPhase += moved * 6;
    const targetAmp = Math.min(0.6, moved * 40);
    this.walkAmp += (targetAmp - this.walkAmp) * 0.4;
    // Ducken: Hüfte senken, Beine anwinkeln
    this.crouch += ((crouch ? 1 : 0) - this.crouch) * 0.25;
    this.applyPose(this.walkPhase, this.walkAmp, this.crouch, p.pitch);
  }

  private applyPose(phase: number, amp: number, crouch: number, pitch: number): void {
    const drop = CROUCH_DROP * crouch;
    const legs = solveLegAngles(drop);
    const w = walkPose(phase, amp);
    const hipY = LEG.hipY - drop;
    this.thighL.position.y = hipY;
    this.thighR.position.y = hipY;
    this.thighL.rotation.x = legs.thigh + w.swing;
    this.thighR.rotation.x = legs.thigh - w.swing;
    this.shinL.rotation.x = legs.shin + w.kneeL;
    this.shinR.rotation.x = legs.shin + w.kneeR;
    // Oberkörper: wippt, verdreht leicht, neigt sich beim Ducken/Blick nach oben
    this.torso.position.y = hipY + w.bob;
    this.torso.rotation.y = w.twist;
    this.torso.rotation.x = Math.max(-0.5, Math.min(0.5, -pitch * 0.35)) + 0.12 * crouch;
    this.armL.rotation.x = w.armSway;
    this.armR.rotation.x = -w.armSway;
  }

  setWeapon(id: string): void {
    if (id === this.weaponId) return;
    this.weaponId = id;
    const def = WEAPONS[id];
    const type: WeaponKind = def ? def.type : 'unknown';
    // Welt-LOD der prozeduralen Waffenmodelle (Lauf nach −Z, Ursprung = Griff) → um 180° drehen,
    // weil der Soldat nach +Z hält. Geklont, da swapGeometry die alte Geometrie entsorgt.
    const world = worldGeometry(def?.visual.model ?? id);
    this.swapGeometry(this.gunMesh, world ? world.clone() : buildWeaponGeometry(type));
    this.gunMesh.rotation.y = world ? Math.PI : 0;
    // Kurze Waffen: linke Hand umfasst den Griff, lange: Vorderschaft
    const stance: ArmStance = type === 'pistol' || type === 'knife' || type === 'grenade' || type === 'bomb' || type === 'unknown' ? 'short' : 'long';
    if (stance !== this.stance) {
      this.stance = stance;
      this.swapGeometry(this.armL, buildArmGeometry(this.team, 'L', stance));
    }
  }

  setAlive(alive: boolean): void {
    if (this.alive === alive) return;
    this.alive = alive;
    this.applyTint();
    if (!alive) {
      this.deathStart = performance.now();
      this.falling = true;
      this.label.visible = false;
    } else {
      this.falling = false;
      this.fallGroup.rotation.set(0, 0, 0);
      this.fallGroup.position.set(0, 0, 0);
      this.label.visible = true;
    }
  }

  /** Fall-Animation (~0.4 s) um den Fußpunkt; läuft über root.updateMatrixWorld. */
  private tickFall(): void {
    if (!this.falling) return;
    const f = fallPose((performance.now() - this.deathStart) / 1000, this.fallDir, this.fallRoll);
    this.fallGroup.rotation.set(f.rotX, 0, f.rotZ);
    this.fallGroup.position.set(0, f.lift, f.slide);
    if (f.t >= 1) this.falling = false;
  }

  /** Kurzer roter Blitz bei Treffer. */
  flashHit(): void {
    this.matTop.emissive.setHex(0x990000);
    setTimeout(() => { this.matTop.emissive.setHex(0x000000); }, 90);
  }

  /** Weltraum-Hitboxen (Fußpunkt = root-Position; geduckt kleiner). */
  partBoxes(): PartBox[] {
    const p = this.root.position;
    return humanPartBoxes({ x: p.x, y: p.y, z: p.z }, 1 - 0.25 * this.crouch);
  }
}

function makeLabel(name: string, team: Team): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.font = 'bold 30px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = team === 'T' ? '#ffb070' : '#8fc0ff';
  ctx.fillText(name.slice(0, 16), 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.2, 0.3, 1);
  sprite.renderOrder = 5;
  return sprite;
}
