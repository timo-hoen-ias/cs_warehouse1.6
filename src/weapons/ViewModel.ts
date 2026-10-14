import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import { WEAPONS, type WeaponDef } from '../logic/weapons';
import { nearestSolidXz, type SolidBox } from '../logic/level';
import { PLAYER } from '../logic/move';
import {
  ARM_HINT, KICK, VIEW_SCALE, ViewAnimator, advanceViewBob, boltCycleClip, breathe, cycleClip, drawClip, dryFireClip,
  emptyPose, inspectClip, kickImpulse, knifeClip, plantClip, pullPinClip, pumpClip, reloadClip, sprintPose, springStep,
  strafeLean, throwClip, viewBobAmount, walkBob, type AnimFamily, type Pose, type Spring,
} from '../logic/viewAnim';
import { acquireView, type ViewWeapon } from './models';
import { armMaterial, forearmGeometry, handGeometry, type Team } from './models/arms';

/**
 * Sway-Parameter (subtiler CS-Light-Stil). Die Waffe zieht bei Kameradrehung
 * minimal nach und federt zur Ruhelage zurück.
 */
const SWAY_DAMP = 8; // Feder: Rückkehr je Sekunde
const SWAY_TURN_X = 0.06; // seitliche Verschiebung (m) je rad Drehung
const SWAY_TURN_Y = 0.035; // vertikale Verschiebung (m) je rad Pitch
const SWAY_TURN_ROT = 0.3; // Lauf-Neigung (rad) je rad Drehung
const SWAY_MAX = 0.05; // Begrenzung (m) gegen Ausreißer bei schnellen Drehungen

/** Nah-Wand-Push: Waffe weicht Wand/Regal/Ecken aus (radiale Clearance). */
const WALL_NEAR = 0.2; // darunter: maximaler Rückzug
const WALL_FAR = 0.8; // ab hier: kein Rückzug
const WALL_DAMP = 16; // Federstärke (1/s)
const WALL_X_PUSH = 0.8; // Anteil, den x zur Kameramitte wandert
const WALL_Z_PUSH = 0.5; // Anteil, den die Tiefe (z) zur Kamera wandert
const WALL_PROBE_FWD = 0.55; // Abtastpunkt vor der Kamera (m)
const WALL_PROBE_X = 0.18; // Abtastpunkt seitlich der Mündung (m)

/** Patrone in der linken Hand (Hand-Raum) beim Schrot-Nachladen. */
const SHELL_IN_HAND = new THREE.Vector3(-0.005, 0.03, 0.0);

type HandTarget = { pos: THREE.Vector3; quat: THREE.Quaternion };

/**
 * First-Person-Viewmodel: prozedurales Waffenmodell (src/weapons/models) + behandschuhte Arme
 * in Teamfarben, Kind der Hauptkamera. Animationen kommen aus der puren Bibliothek
 * logic/viewAnim.ts (Clips + Mixer + prozedurale Schichten); hier werden sie nur auf die
 * Knoten angewandt: Waffen-Halter (Wurzel-Pose), Teile (Schlitten, Magazin, Kammer, Pumpe …)
 * und Hände (Anker der Waffe, überblendet zu Magazin/Spannhebel/Kammerstängel …).
 */
@registerType
export class ViewModel extends Behaviour {
  /** Level-Solids (Wände/Regale) für den Nah-Wand-Rückzug. */
  solids: SolidBox[] = [];
  /** Wird gerufen, sobald das Modell der aktiven Waffe steht. */
  onReady?: () => void;

  private readonly root = new THREE.Group();
  private readonly holder = new THREE.Group();
  private weapon?: ViewWeapon;
  private def?: WeaponDef;
  private family: AnimFamily = 'knife';
  private team: Team = 'T';

  private readonly handR: THREE.Mesh;
  private readonly handL: THREE.Mesh;
  private readonly foreR: THREE.Mesh;
  private readonly foreL: THREE.Mesh;
  private wristR = new THREE.Vector3();
  private wristL = new THREE.Vector3();
  private shellNode?: THREE.Object3D;
  private readonly fallbackMuzzle = new THREE.Object3D();

  private readonly anim = new ViewAnimator();
  private readonly pose: Pose = emptyPose();
  private readonly kickBack: Spring = { x: 0, v: 0 };
  private readonly kickRise: Spring = { x: 0, v: 0 };
  private readonly kickRoll: Spring = { x: 0, v: 0 };

  private loadSeq = 0;
  private time = 0;
  /** Schlitten nach letztem Schuss hinten (rechts / links bei Doppelpistole). */
  private slideLocked = false;
  private slideLocked2 = false;
  /** Doppelpistole: als Nächstes feuert links (1) oder rechts (0); zuletzt gefeuert: fireSide. */
  private dualNext = 0;
  private fireSide = 0;
  private knifeVariant = 0;
  private planting = false;
  private lastFire = -10;
  /** Wurf läuft: Modellwechsel bis hierhin verzögern (eigene Uhr). */
  private swapHoldUntil = 0;
  private swapWaiters: (() => void)[] = [];

  // Bewegung (aus Kamera-Weg + Shooter-Flags)
  private moving = false;
  private sprinting = false;
  private crouching = false;
  private readonly lastCam = new THREE.Vector3();
  private camInit = false;
  private speed = 0;
  private lateral = 0;
  private bobPhase = 0;
  private sprintW = 0;

  // Sway
  private swayX = 0;
  private swayY = 0;
  private swayRot = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private swayInit = false;
  private wallNear = 0;

  private readonly tmpEye = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpS = new THREE.Vector3();
  private readonly tL: HandTarget = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private readonly tR: HandTarget = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private readonly tB: HandTarget = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

  constructor() {
    super();
    const mat = armMaterial();
    const empty = (): THREE.BufferGeometry => new THREE.BufferGeometry();
    this.handR = new THREE.Mesh(empty(), mat);
    this.handL = new THREE.Mesh(empty(), mat);
    this.foreR = new THREE.Mesh(empty(), mat);
    this.foreL = new THREE.Mesh(empty(), mat);
    this.handR.name = 'handR';
    this.handL.name = 'handL';
    this.foreR.name = 'forearmR';
    this.foreL.name = 'forearmL';
    for (const m of [this.handR, this.handL, this.foreR, this.foreL]) {
      m.receiveShadow = true;
      m.frustumCulled = false; // Arme ragen aus dem Bild; Culling bringt nichts, kostet Ränder
    }
    this.holder.scale.setScalar(VIEW_SCALE);
    this.holder.rotation.order = 'YXZ';
    this.holder.add(this.handR, this.handL);
    this.foreR.scale.setScalar(VIEW_SCALE);
    this.foreL.scale.setScalar(VIEW_SCALE);
    this.root.add(this.holder, this.foreR, this.foreL);
    this.fallbackMuzzle.position.set(0.08, -0.08, -0.5);
    this.root.add(this.fallbackMuzzle);
    this.root.name = 'viewmodel';
  }

  start(): void {
    const cam = this.context.mainCamera;
    if (!cam) return;
    cam.add(this.root);
    // Kein eigenes Punktlicht: ein dauerhaftes Licht würde jeden Pixel der Szene verteuern.
    // Metall bekommt Reflexe über eine kleine eigene Umgebungs-Textur (models/materials.ts).
  }

  onDestroy(): void {
    this.root.removeFromParent();
    this.detachWeapon();
  }

  // ---------------------------------------------------------------- öffentliche API

  /** Wechselt das sichtbare Waffenmodell (Ziehen-Animation startet). */
  async show(weaponId: string): Promise<void> {
    const def = WEAPONS[weaponId];
    if (!def) return;
    const seq = ++this.loadSeq;
    if (this.swapHoldUntil > this.time) {
      // Granate verlässt noch die Hand → erst nach dem Loslassen wechseln (Animationsuhr,
      // nicht Echtzeit; Sicherheits-Timeout, falls update() pausiert)
      await new Promise<void>((r) => {
        this.swapWaiters.push(r);
        setTimeout(r, 3000);
      });
      if (seq !== this.loadSeq) return;
    }
    const w = acquireView(def.visual.model, this.weapon ? [this.weapon.id] : []);
    if (!w) return;
    this.detachWeapon();
    this.weapon = w;
    this.def = def;
    this.family = w.rig.family;
    this.holder.add(w.root);
    this.slideLocked = false;
    this.slideLocked2 = false;
    this.dualNext = 0;
    this.fireSide = 0;
    this.planting = false;
    this.swapHoldUntil = 0;
    this.wallNear = 0;
    this.setupHands();
    if (w.parts.shell) {
      // Patrone sitzt in der linken Hand (nur beim Nachladen sichtbar)
      this.shellNode = w.parts.shell;
      this.shellNode.removeFromParent();
      this.shellNode.position.copy(SHELL_IN_HAND);
      this.shellNode.rotation.set(Math.PI / 2, 0, 0);
      this.shellNode.visible = false;
      this.handL.add(this.shellNode);
    }
    this.anim.clear();
    this.anim.play(drawClip(this.family, w.rig.charge), 0);
    this.applyPose(0);
    this.onReady?.();
  }

  /** Laufende Animation verwerfen und Ruhepose setzen (Labor/Sichtprüfung). */
  settle(): void {
    this.anim.clear();
    this.applyPose(0);
  }

  /** Teamfarben der Arme (T: Wüsten-Tarn, CT: Navy). */
  setTeam(team: Team): void {
    if (team !== 'T' && team !== 'CT') return;
    if (team === this.team) return;
    this.team = team;
    this.setupHands();
  }

  /** Rückstoß-Impuls (Schuss, Wurf, Messer): Feder für Rückweg, Mündungshub, Rolle. */
  kick(amount: number): void {
    const imp = kickImpulse(amount, Math.random());
    this.kickBack.v += imp.back;
    this.kickRise.v += imp.rise;
    this.kickRoll.v += imp.roll;
    this.lastFire = this.time;
    if (this.anim.isPlaying('inspect')) this.anim.stop(0.08);
  }

  /** Schuss-Animation der Teile: Schlitten/Verschluss, Repetieren, Pumpen, Schlittenfang. */
  fireAnim(emptyAfter: boolean): void {
    const w = this.weapon;
    const def = this.def;
    if (!w || !def) return;
    const rig = w.rig;
    const interval = def.rpm > 0 ? 60 / def.rpm : (def.cycle ?? 0.15);
    if (this.anim.isPlaying('inspect') || this.anim.isPlaying('draw')) this.anim.stop(0.06);
    if (rig.dual) {
      this.fireSide = this.dualNext;
      this.dualNext = 1 - this.dualNext;
      this.anim.overlay(cycleClip(this.fireSide === 1 ? 'slide2' : 'slide', interval));
      if (emptyAfter) {
        this.slideLocked = true;
        this.slideLocked2 = true;
      }
      return;
    }
    if (rig.cycle === 'slide') this.anim.overlay(cycleClip('slide', interval));
    else if (rig.cycle === 'charge') this.anim.overlay(cycleClip('charge', interval));
    if (emptyAfter && rig.slideLock) this.slideLocked = true;
    if (!emptyAfter && rig.boltAction) this.anim.play(boltCycleClip((def.cycle ?? 1.2) * 0.85), 0.05);
    if (!emptyAfter && rig.pumpAction) this.anim.play(pumpClip(interval * 0.8), 0.05);
  }

  /** Trockenschuss (Magazin leer). */
  dryFire(): void {
    this.anim.overlay(dryFireClip());
  }

  /** Messer-Animation: Hieb (abwechselnd) oder schwerer Stich. */
  slash(heavy: boolean): void {
    this.anim.play(knifeClip(heavy, this.knifeVariant++), 0.04);
  }

  /** Nachladen, synchron zur echten Dauer; empty = Magazin war leer, shells = Schrotpatronen. */
  reloadAnim(duration: number, opts: { empty?: boolean; shells?: number } = {}): void {
    const w = this.weapon;
    if (!w || duration <= 0) return;
    const empty = opts.empty ?? this.slideLocked;
    const clip = reloadClip(w.rig.reload, { duration, empty, charge: w.rig.charge, shells: opts.shells ?? 1 });
    if (!clip) return;
    this.slideLocked = false;
    this.slideLocked2 = false;
    this.anim.play(clip, 0.1);
  }

  /** Granate: Splint ziehen und ausholen (bis zum Wurf gehalten). */
  pullPin(): void {
    if (this.family === 'grenade' && !this.anim.isPlaying('pin')) this.anim.play(pullPinClip(), 0.06);
  }

  /** Granate: Wurf; der folgende Modellwechsel wartet, bis sie die Hand verlassen hat. */
  throwAnim(): void {
    if (this.family !== 'grenade') return;
    const clip = throwClip();
    this.anim.play(clip, 0.03);
    this.swapHoldUntil = this.time + clip.duration * 0.6;
  }

  /** C4 legen (E gehalten): Tipp-Schleife an/aus. */
  setPlanting(on: boolean): void {
    if (this.family !== 'bomb') on = false;
    if (on === this.planting) return;
    this.planting = on;
    if (on) this.anim.play(plantClip(), 0.18);
    else if (this.anim.isPlaying('plant')) this.anim.stop(0.2);
  }

  /** Inspizieren (Taste F) — nur aus der Ruhe heraus. */
  inspect(): void {
    if (!this.weapon) return;
    const cur = this.anim.current();
    if (cur && cur !== 'draw') return;
    this.anim.play(inspectClip(this.family), 0.15);
  }

  /** Bewegungszustand vom Shooter (Sprint senkt die Waffe, Ducken dämpft den Bob). */
  setMotion(moving: boolean, sprinting: boolean, crouching: boolean): void {
    this.moving = moving;
    this.sprinting = sprinting;
    this.crouching = crouching;
  }

  /** Sichtbarkeit (aus beim Zoomen durchs Zielfernrohr). */
  setVisible(on: boolean): void {
    this.root.visible = on;
  }

  isVisible(): boolean {
    return this.root.visible;
  }

  /** true, sobald ein Modell im Halter hängt. */
  hasModel(): boolean {
    return !!this.weapon;
  }

  /** Modell-Id der gezeigten Waffe (Debug/Labor). */
  modelId(): string {
    return this.weapon?.id ?? '';
  }

  /** Name der laufenden Animation (Debug/Tests), null = Ruhe. */
  animName(): string | null {
    return this.anim.current();
  }

  /** Anzahl Mesh-Knoten (Waffe + Arme) = Draw-Calls des Viewmodels. */
  meshCount(): number {
    let n = 0;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) n++;
    });
    return n;
  }

  /** Gesamt-Vertex-Zahl von Waffe + Armen. */
  vertexCount(): number {
    let n = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) n += m.geometry.getAttribute('position')?.count ?? 0;
    });
    return n;
  }

  /** Weltposition der Mündung (bei Doppelpistole: die zuletzt feuernde). */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const a = this.weapon?.anchors;
    const node = (this.fireSide === 1 ? a?.muzzle2 : undefined) ?? a?.muzzle ?? this.fallbackMuzzle;
    node.getWorldPosition(out);
    return out;
  }

  // ---------------------------------------------------------------- Frame

  update(): void {
    const dt = Math.min(this.context.time.deltaTime, 0.05);
    this.time += dt;
    if (this.swapWaiters.length && this.time >= this.swapHoldUntil) {
      const list = this.swapWaiters;
      this.swapWaiters = [];
      for (const r of list) r();
    }
    this.trackMotion(dt);
    if (!this.weapon) return;
    this.anim.tick(dt);
    this.anim.sample(this.pose);
    springStep(this.kickBack, 0, KICK.freq, KICK.zeta, dt);
    springStep(this.kickRise, 0, KICK.freq, KICK.zeta, dt);
    springStep(this.kickRoll, 0, KICK.freq * 0.8, KICK.zeta, dt);
    this.applyPose(dt);
  }

  /** Kamera-Weg → Tempo/Seitwärts, Kamera-Drehung → Sway. */
  private trackMotion(dt: number): void {
    const cam = this.context.mainCamera;
    if (!cam || dt <= 0) return;
    cam.getWorldPosition(this.tmpEye);
    if (this.camInit) {
      this.tmpV.subVectors(this.tmpEye, this.lastCam);
      this.tmpV.y = 0;
      const sp = this.tmpV.length() / dt;
      if (sp < 15) {
        this.tmpRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
        const lat = this.tmpV.dot(this.tmpRight) / dt;
        const k = 1 - Math.exp(-10 * dt);
        this.speed += (sp - this.speed) * k;
        this.lateral += (lat - this.lateral) * k;
      }
    }
    this.camInit = true;
    this.lastCam.copy(this.tmpEye);
    if (!this.moving) this.speed *= Math.exp(-6 * dt);
    this.bobPhase = advanceViewBob(this.bobPhase, this.speed, dt);

    const y = cam.rotation.y;
    const p = cam.rotation.x;
    if (this.swayInit) {
      const dy = Math.atan2(Math.sin(y - this.lastYaw), Math.cos(y - this.lastYaw));
      const dp = p - this.lastPitch;
      const damp = Math.exp(-SWAY_DAMP * dt);
      this.swayX = clamp(this.swayX * damp - dy * SWAY_TURN_X, SWAY_MAX);
      this.swayY = clamp(this.swayY * damp - dp * SWAY_TURN_Y, SWAY_MAX);
      this.swayRot = clamp(this.swayRot * damp - dy * SWAY_TURN_ROT, 0.25);
    } else {
      this.swayInit = true;
    }
    this.lastYaw = y;
    this.lastPitch = p;
  }

  /** Halter-Pose + Teile + Hände/Unterarme aus Clip-Pose und prozeduralen Schichten. */
  private applyPose(dt: number): void {
    const w = this.weapon;
    const def = this.def;
    if (!w || !def) return;
    const p = this.pose;
    const busy = this.anim.current();

    // Sprint: Waffe senken (nicht kurz nach einem Schuss oder während Aktionen)
    const sprintTarget = this.sprinting && this.speed > PLAYER.walkSpeed * 0.9 && this.time - this.lastFire > 0.4 && (!busy || busy === 'draw') ? 1 : 0;
    this.sprintW += (sprintTarget - this.sprintW) * (1 - Math.exp(-7 * dt));

    const bobAmt = viewBobAmount(this.speed, PLAYER.walkSpeed, this.crouching) * (1 + this.sprintW * 0.5);
    const bob = walkBob(this.bobPhase, bobAmt);
    const br = breathe(this.time, this.speed > 0.5 ? 0.3 : 1);
    const lean = strafeLean(this.lateral);
    const sp = sprintPose(this.sprintW, this.family);
    const back = Math.min(KICK.maxBack, this.kickBack.x);
    const rise = Math.min(KICK.maxRise, this.kickRise.x);

    // Nah-Wand-Push
    let push = 0;
    const cam = this.context.mainCamera;
    if (this.solids.length > 0 && cam) {
      cam.getWorldPosition(this.tmpEye);
      let d = nearestSolidXz(this.tmpEye.x, this.tmpEye.z, this.solids);
      cam.getWorldDirection(this.tmpDir);
      this.tmpRight.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const mx = this.tmpEye.x + this.tmpDir.x * WALL_PROBE_FWD + this.tmpRight.x * WALL_PROBE_X;
      const mz = this.tmpEye.z + this.tmpDir.z * WALL_PROBE_FWD + this.tmpRight.z * WALL_PROBE_X;
      d = Math.min(d, nearestSolidXz(mx, mz, this.solids));
      if (d < WALL_FAR) push = Math.min(1, Math.max(0, (WALL_FAR - d) / (WALL_FAR - WALL_NEAR)));
    }
    this.wallNear += (push - this.wallNear) * Math.min(1, 1 - Math.exp(-WALL_DAMP * dt));
    const wn = this.wallNear;

    const v = def.visual;
    const x = v.pos.x * (1 - WALL_X_PUSH * wn) + p.px + br.px + bob.px + lean.px + sp.px + this.swayX;
    const y = v.pos.y + p.py + br.py + bob.py + sp.py + this.swayY - wn * 0.02;
    const z = v.pos.z * (1 - WALL_Z_PUSH * wn) + p.pz + sp.pz + back;
    this.holder.position.set(x, y, z);
    this.holder.rotation.set(
      v.rot.x + p.rx + br.rx + bob.rx + sp.rx + rise - wn * 0.15,
      v.rot.y + p.ry + br.ry + bob.ry + sp.ry + this.swayRot + wn * 0.35,
      v.rot.z + p.rz + br.rz + bob.rz + lean.rz + sp.rz + this.kickRoll.x,
    );

    this.applyParts();
    this.applyHands();
  }

  /** Teile aus den Spuren bewegen (relativ zur Ruhelage). */
  private applyParts(): void {
    const w = this.weapon!;
    const { parts, rig } = w;
    const p = this.pose;
    const t = rig.travel;
    const restOf = (o: THREE.Object3D): THREE.Vector3 => this.tmpV.fromArray(o.userData.rest as number[]);
    if (parts.slide) {
      const s = clamp01(p.slide + (this.slideLocked ? 1 : 0) + (rig.charge === 'slide' ? p.charge : 0));
      parts.slide.position.copy(restOf(parts.slide)).z += t.slide * s;
    }
    if (parts.slide2) {
      const s = clamp01(p.slide2 + (this.slideLocked2 ? 1 : 0));
      parts.slide2.position.copy(restOf(parts.slide2)).z += t.slide * s;
    }
    if (parts.charge) parts.charge.position.copy(restOf(parts.charge)).z += t.charge * clamp01(p.charge);
    if (parts.bolt) {
      parts.bolt.position.copy(restOf(parts.bolt)).z += t.bolt * clamp01(p.boltBack);
      parts.bolt.rotation.z = t.boltLift * clamp01(p.bolt);
    }
    if (parts.pump) parts.pump.position.copy(restOf(parts.pump)).z += t.pump * clamp01(p.pump);
    const magMove = (node: THREE.Object3D, u: number): void => {
      const pos = restOf(node);
      const d = Math.max(0, u);
      const a = Math.min(1, d);
      const b = Math.max(0, d - 1);
      const md = rig.magDir;
      const ma = rig.magAway;
      const ln = Math.hypot(md[0], md[1], md[2]) || 1;
      const la = Math.hypot(ma[0], ma[1], ma[2]) || 1;
      pos.x += (md[0] / ln * a + ma[0] / la * b) * t.mag;
      pos.y += (md[1] / ln * a + ma[1] / la * b) * t.mag;
      pos.z += (md[2] / ln * a + ma[2] / la * b) * t.mag;
      node.position.copy(pos);
      node.rotation.x = p.magRot;
      node.visible = p.magHide < 0.5;
    };
    if (parts.mag) magMove(parts.mag, p.mag);
    if (parts.mag2) magMove(parts.mag2, p.mag2);
    if (parts.cover) parts.cover.rotation.x = t.cover * clamp01(p.cover);
    if (parts.pin) {
      const pd = rig.pinDir;
      const ln = Math.hypot(pd[0], pd[1], pd[2]) || 1;
      const k = t.pin * Math.max(0, p.pin);
      parts.pin.position.copy(restOf(parts.pin)).add(this.tmpV.set(pd[0] / ln * k, pd[1] / ln * k, pd[2] / ln * k));
    }
    if (parts.spoon) {
      const s = clamp01(p.spoon);
      parts.spoon.position.copy(restOf(parts.spoon));
      parts.spoon.position.x += s * 0.09;
      parts.spoon.position.y += s * 0.06;
      parts.spoon.rotation.z = -s * 2.6;
      parts.spoon.visible = s < 0.95;
    }
    if (this.shellNode) this.shellNode.visible = p.shell > 0.5;
    // Granate nach dem Wurf aus der Hand (Hände bleiben)
    w.root.visible = p.itemHide < 0.5;
  }

  /** Hände auf die Anker setzen (mit Überblendungen) und Unterarme zum Ellbogen ausrichten. */
  private applyHands(): void {
    const w = this.weapon!;
    const a = w.anchors;
    const p = this.pose;
    const L = this.tL;
    const R = this.tR;

    if (a.gripL) {
      this.anchorTarget(a.gripL, L);
      if (p.lhMag > 0 && a.magHold) this.blendTo(L, a.magHold, p.lhMag);
      if (p.lhCharge > 0 && a.chargeL) this.blendTo(L, a.chargeL, p.lhCharge);
      if (p.lhPort > 0 && a.port) this.blendTo(L, a.port, p.lhPort);
      L.pos.x += p.lhX;
      L.pos.y += p.lhY;
      L.pos.z -= p.lhZ;
      this.handL.position.copy(L.pos);
      this.handL.quaternion.copy(L.quat);
    }
    if (a.gripR) {
      this.anchorTarget(a.gripR, R);
      if (p.rhBolt > 0 && a.boltR) this.blendTo(R, a.boltR, p.rhBolt);
      if (p.rhKey > 0 && a.keypad) this.blendTo(R, a.keypad, p.rhKey);
      R.pos.x += p.rhX;
      R.pos.y += p.rhY;
      R.pos.z -= p.rhZ;
      this.handR.position.copy(R.pos);
      this.handR.quaternion.copy(R.quat);
    }
    // Unterarme: Handgelenk (Halter-Raum → Wurzel-Raum) → Ellbogen-Hinweis
    this.holder.updateMatrix();
    const hint = ARM_HINT[this.family];
    this.placeForearm(this.foreR, this.handR, this.wristR, hint.right);
    this.placeForearm(this.foreL, this.handL, this.wristL, hint.left);
  }

  private placeForearm(fore: THREE.Mesh, hand: THREE.Mesh, wrist: THREE.Vector3, hint: readonly [number, number, number]): void {
    if (!hand.visible) {
      fore.visible = false;
      return;
    }
    fore.visible = true;
    hand.updateMatrix();
    const wp = this.tmpV.copy(wrist).applyMatrix4(hand.matrix).applyMatrix4(this.holder.matrix);
    const elbow = this.tmpS.set(this.holder.position.x + hint[0], this.holder.position.y + hint[1], this.holder.position.z + hint[2]);
    fore.position.copy(wp);
    // +Z des Unterarms zeigt zum Ellbogen
    this.tmpM.lookAt(elbow, wp, this.tmpDir.set(0, 1, 0));
    fore.quaternion.setFromRotationMatrix(this.tmpM);
  }

  /** Transform eines Ankers relativ zum Halter (Kette lokaler Matrizen). */
  private anchorTarget(node: THREE.Object3D, out: HandTarget): void {
    const m = this.tmpM.identity();
    let o: THREE.Object3D | null = node;
    while (o && o !== this.holder) {
      o.updateMatrix();
      m.premultiply(o.matrix);
      o = o.parent;
    }
    m.decompose(out.pos, out.quat, this.tmpS);
  }

  private blendTo(t: HandTarget, node: THREE.Object3D, k: number): void {
    const b = this.tB;
    this.anchorTarget(node, b);
    const kk = clamp01(k);
    t.pos.lerp(b.pos, kk);
    t.quat.slerp(b.quat, kk);
  }

  /** Hand-/Unterarm-Geometrien passend zu Team und Griffradien der aktuellen Waffe. */
  private setupHands(): void {
    const a = this.weapon?.anchors;
    const gr = a?.gripR;
    const gl = a?.gripL;
    this.handR.visible = !!gr;
    this.handL.visible = !!gl;
    if (gr) {
      const h = handGeometry(this.team, 'R', gr.userData.r as number, !!gr.userData.trigger);
      this.handR.geometry = h.geo;
      this.wristR.copy(h.wrist);
    }
    if (gl) {
      const h = handGeometry(this.team, 'L', gl.userData.r as number, !!gl.userData.trigger);
      this.handL.geometry = h.geo;
      this.wristL.copy(h.wrist);
    }
    this.foreR.geometry = forearmGeometry(this.team, 'R');
    this.foreL.geometry = forearmGeometry(this.team, 'L');
  }

  /** Aktuellen Waffen-Klon lösen (Geometrien gehören dem Modell-Cache, nicht entsorgen). */
  private detachWeapon(): void {
    if (this.shellNode) {
      this.shellNode.removeFromParent();
      this.shellNode = undefined;
    }
    if (this.weapon) {
      this.weapon.root.removeFromParent();
      this.weapon = undefined;
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, m: number): number {
  return v < -m ? -m : v > m ? m : v;
}
