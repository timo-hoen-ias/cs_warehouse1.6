import * as THREE from 'three';
import type { Team } from '../logic/economy';
import type { Pose } from '../logic/match';
import { humanPartBoxes, type PartBox } from '../logic/hitbox';
import { WEAPONS } from '../logic/weapons';

const TEAM_COLORS: Record<Team, { body: number; head: number; accent: number }> = {
  T: { body: 0xb0722a, head: 0xd9a066, accent: 0x5a3a14 },
  CT: { body: 0x2f4f8a, head: 0xd9b8a0, accent: 0x1b2a4a },
};
const DEAD_COLOR = 0x3a3f44;

/**
 * Sichtbarer Soldat (Bots + entfernte Spieler): Körper/Kopf/Arme/Beine/Waffe +
 * Namensschild (Sprite). Hitboxen kommen aus humanPartBoxes an der Fußposition.
 * Bewegung: setPose (Host-Bot) oder interpolierte Netz-Posen.
 */
export class Soldier {
  readonly root = new THREE.Group();
  team: Team;
  private readonly matBody: THREE.MeshStandardMaterial;
  private readonly matHead: THREE.MeshStandardMaterial;
  private readonly matAccent: THREE.MeshStandardMaterial;
  private readonly weaponNode = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private weaponId = '';
  private walkPhase = 0;
  private lastX = 0;
  private lastZ = 0;
  private crouch = 0;
  alive = true;

  constructor(readonly id: string, public name: string, team: Team) {
    this.team = team;
    const c = TEAM_COLORS[team];
    this.matBody = new THREE.MeshStandardMaterial({ color: c.body, roughness: 0.8 });
    this.matHead = new THREE.MeshStandardMaterial({ color: c.head, roughness: 0.7 });
    this.matAccent = new THREE.MeshStandardMaterial({ color: c.accent, roughness: 0.9 });

    // Beine (Fuß bei y=0)
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.26), this.matAccent);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.26), this.matAccent);
    this.legL.position.set(-0.14, 0.375, 0);
    this.legR.position.set(0.14, 0.375, 0);
    this.root.add(this.legL, this.legR);

    // Torso + Kopf + Arme (Gruppe für Ducken)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), this.matBody);
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.matHead);
    head.position.y = 1.6;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), this.matAccent);
    helmet.position.y = 1.72;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), this.matBody);
    armL.position.set(-0.4, 1.1, 0.1);
    armL.rotation.x = -0.9;
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), this.matBody);
    armR.position.set(0.4, 1.1, 0.1);
    armR.rotation.x = -0.9;
    this.torso.add(body, head, helmet, armL, armR, this.weaponNode);
    this.weaponNode.position.set(0.25, 1.2, 0.35);
    this.root.add(this.torso);
    for (const m of [body, head, helmet, armL, armR, this.legL, this.legR]) m.castShadow = true;

    // Namensschild
    this.label = makeLabel(name, team);
    this.label.position.y = 2.05;
    this.root.add(this.label);
    this.setWeapon('knife');
  }

  addTo(parent: THREE.Object3D): void {
    parent.add(this.root);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    (this.label.material as THREE.SpriteMaterial).map?.dispose();
  }

  setTeam(team: Team): void {
    if (this.team === team) return;
    this.team = team;
    const c = TEAM_COLORS[team];
    this.matBody.color.setHex(c.body);
    this.matHead.color.setHex(c.head);
    this.matAccent.color.setHex(c.accent);
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
    // Gehanimation
    if (moved > 0.0005) this.walkPhase += moved * 6;
    const swing = Math.sin(this.walkPhase) * Math.min(0.6, moved * 40);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    // Ducken: Torso senken
    const target = crouch ? 1 : 0;
    this.crouch += (target - this.crouch) * 0.25;
    this.torso.position.y = -0.45 * this.crouch;
    this.torso.rotation.x = -p.pitch * 0.4;
  }

  setWeapon(id: string): void {
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.weaponNode.clear();
    const def = WEAPONS[id];
    if (!def || def.type === 'knife') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.25), new THREE.MeshStandardMaterial({ color: 0xcfd6dc, metalness: 0.6, roughness: 0.3 }));
      blade.position.z = 0.1;
      this.weaponNode.add(blade);
      return;
    }
    const len = def.type === 'pistol' ? 0.25 : def.type === 'sniper' ? 1.0 : def.type === 'grenade' || def.type === 'bomb' ? 0.15 : 0.65;
    const color = def.type === 'grenade' ? 0x4a6a3a : def.type === 'bomb' ? 0x8a2a2a : 0x2a2d31;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, len), new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 }));
    gun.position.z = len / 2;
    this.weaponNode.add(gun);
  }

  setAlive(alive: boolean): void {
    if (this.alive === alive) return;
    this.alive = alive;
    if (!alive) {
      this.matBody.color.setHex(DEAD_COLOR);
      this.matHead.color.setHex(DEAD_COLOR);
      this.matAccent.color.setHex(DEAD_COLOR);
      // Umfallen
      this.root.rotation.x = Math.PI / 2;
      this.root.position.y = 0.3;
      this.label.visible = false;
    } else {
      const c = TEAM_COLORS[this.team];
      this.matBody.color.setHex(c.body);
      this.matHead.color.setHex(c.head);
      this.matAccent.color.setHex(c.accent);
      this.root.rotation.x = 0;
      this.label.visible = true;
    }
  }

  /** Kurzer roter Blitz bei Treffer. */
  flashHit(): void {
    this.matBody.emissive.setHex(0x990000);
    setTimeout(() => { this.matBody.emissive.setHex(0x000000); }, 90);
  }

  /** Weltraum-Hitboxen (Fußpunkt = root-Position; geduckt kleiner). */
  partBoxes(): PartBox[] {
    const p = this.root.position;
    return humanPartBoxes({ x: p.x, y: 0, z: p.z }, 1 - 0.25 * this.crouch);
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
