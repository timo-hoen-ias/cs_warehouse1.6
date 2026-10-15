import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import { PLAYER, asCollider, newBody, speedXZ, stepBody, wishDir, type Body, type MoveWorld } from '../logic/move';
import { landPunch } from '../logic/fall';
import type { MoveSpreadState } from '../logic/fire';
import { advanceBob, bobOffset, bobScale } from '../logic/bob';
import { humanPartBoxes, type PartBox } from '../logic/hitbox';

const SENS = 0.0022;
/** Körperhöhe beim Ducken (Durchgänge ab ~1.3 m). */
const CROUCH_HEIGHT = 1.25;
const PITCH_MAX = Math.PI / 2 - 0.05;

const dbg = globalThis as { __fpsDbg?: Record<string, number> };
function tick(key: string): void {
  if (!import.meta.env?.DEV) return;
  dbg.__fpsDbg ??= {};
  dbg.__fpsDbg[key] = (dbg.__fpsDbg[key] ?? 0) + 1;
}

/**
 * Ego-Player (Host/Client-lokal): PointerLock + Maus-Blick + WASD/Springen mit
 * AABB-Kollision (reine Logik in src/logic/move.ts). Bewegt die Hauptkamera.
 *
 * Bewegung wie CS 1.6: Standard = Laufen mit dem Tempo der gehaltenen Waffe (`runSpeed`,
 * vom Shooter gesetzt), Shift = leise Gehen (52 %), Strg = Ducken (34 %), Leertaste = Sprung
 * (neu drücken für den nächsten), Reibung/Beschleunigung/Luftsteuerung in `stepBody`.
 *
 * Blicksteuerung:
 *  1) PointerLock auf dem `<needle-engine>`-Host-Element (Light DOM) — das
 *     Renderer-Canvas liegt im Shadow DOM, dort kann requestPointerLock scheitern.
 *  2) Fallback "Drag-Look": Ist kein Lock aktiv, dreht gedrückt gehaltene Maustaste
 *     (linke/rechte) die Kamera mit relativer Mausbewegung — funktioniert überall,
 *     auch in Einbettungen ohne PointerLock-Erlaubnis.
 * Fortbewegung läuft unabhängig vom Lock, sobald gespawnt.
 */
@registerType
export class FpsPlayer extends Behaviour {
  /** Kollisionswelt der Karte (Quader + Rampen). */
  collider: MoveWorld = [];
  /** Mausempfindlichkeit (rad/px) aus den Einstellungen. */
  sensitivity = SENS;
  /** Faktor beim Zoomen (FOV-Verhältnis). */
  sensScale = 1;
  invertY = false;
  /** Kopfbewegung beim Laufen an/aus. */
  bobbing = true;
  /** Freeze-Phase: Umschauen erlaubt, keine Bewegung. */
  frozen = false;
  /** Eingaben komplett aus (Lobby/Menü offen). */
  inputEnabled = true;
  private deadFlag = false;

  /** Lauftempo (m/s) mit der gehaltenen Waffe — setzt der Shooter (Waffe, Zielfernrohr). */
  runSpeed: number = PLAYER.runSpeed;
  /** Landung mit Aufprallgeschwindigkeit (m/s) — Treiber meldet Sturzschaden an den Host. */
  onLand?: (speed: number) => void;

  private motion: Body = newBody(0, 0, 0);
  private yaw = 0;
  private pitch = 0;
  /** Aktueller Recoil-Offset (rad), additiv zur Kamera (schwingt zurück). */
  private recoilPitch = 0;
  private recoilYaw = 0;
  /** Duck-Zustand: true, solange Strg gehalten wird (Accessor crouching()). */
  private crouchKey = false;
  /** Aktuelle (geglättete) Sicht-Höhe — senkt sich beim Ducken. */
  private stanceY = PLAYER.eye;
  /** Lauf-Phase des Headbobs (Radiant). */
  private bobPhase = 0;
  private prevX = 0;
  private prevZ = 0;
  private prevFeet = 0;
  /** Weiche Kamera-Korrektur nach Absätzen/Aufspringen (m, negativ = Kamera hinkt unten nach). */
  private stepOffset = 0;
  /** Eintauchen der Kamera nach einer Landung (m) und zugehöriges Nicken (rad). */
  private landDip = 0;
  /** Zuschauer-Pose (fremder Spieler) — überschreibt die Kamera, solange gesetzt. */
  private specPose: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;
  spectate(pose: { x: number; y: number; z: number; yaw: number; pitch: number } | null): void {
    this.specPose = pose;
  }

  /** Kamera-Shake (Schuss/Explosion): kurzer zufälliger Winkel-Impuls, klingt ab. */
  private shakeAmp = 0;
  private shakeX = 0;
  private shakeY = 0;
  shake(amount: number): void {
    this.shakeAmp = Math.min(0.03, this.shakeAmp + amount);
  }
  /** Todes-Kamera: Roll + Absinken (0..1). */
  private deathT = 0;

  /** Recoil-Offset setzen (kommt pro Frame vom Shooter). */
  setRecoil(pitch: number, yaw: number): void {
    this.recoilPitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
    this.recoilYaw = Math.max(-1, Math.min(1, yaw));
  }
  /** Kamera aus Look + Recoil-Offset schreiben. */
  private writeLook(cam: THREE.Object3D): void {
    const p = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + this.recoilPitch + this.shakeY - this.landDip * 0.3));
    cam.rotation.set(p, this.yaw + this.recoilYaw + this.shakeX, this.deathT * 0.9);
  }
  private keys: Record<string, boolean> = {};
  private locked = false;
  private spawned = false;
  private dragging = false;

  /** Element, das den PointerLock trägt: das sichtbare needle-engine-Host-Element. */
  private get lockTarget(): HTMLElement | null {
    return (this.context.domElement as HTMLElement) ?? (this.context.renderer.domElement as unknown as HTMLElement);
  }

  start(): void {
    const target = this.lockTarget;
    if (target) target.addEventListener('click', this.onClick);

    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearInput);
    tick('start');

    const cam = this.context.mainCamera;
    if (cam) {
      cam.rotation.order = 'YXZ';
      this.writeLook(cam);
      cam.position.set(this.motion.x, this.motion.y, this.motion.z);
    }
  }

  onDestroy(): void {
    const target = this.lockTarget;
    if (target) target.removeEventListener('click', this.onClick);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearInput);
  }

  /** Setzt Position (Fußhöhe y) + Blick einmalig (Spawn). */
  spawn(x: number, z: number, yaw = 0, y = 0): void {
    this.motion = newBody(x, y, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.crouchKey = false;
    this.stanceY = PLAYER.eye;
    this.bobPhase = 0;
    this.prevX = x;
    this.prevZ = z;
    this.prevFeet = y;
    this.stepOffset = 0;
    this.landDip = 0;
    this.spawned = true;
    const cam = this.context.mainCamera;
    if (cam) {
      this.writeLook(cam);
      cam.position.set(this.motion.x, this.motion.y, this.motion.z);
    }
  }

  /** Direkter Blick (yaw/pitch) setzen — für Debug/Smoke und spätere Netz-Interpolation. */
  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    const cam = this.context.mainCamera;
    if (cam) this.writeLook(cam);
  }

  /** Aktuelle Blickwinkel (Debug/Netzwerk). */
  pitchNow(): number { return this.pitch; }

  update(): void {
    const cam = this.context.mainCamera;
    if (!cam) return;
    tick('update');
    // bis 0.1 s je Frame (stepPlayer unterteilt intern) → echtes Lauftempo auch bei niedriger Bildrate
    const dt = Math.min(this.context.time.deltaTime, 0.1);

    // Ducken; unter niedriger Decke bleibt man geduckt, bis wieder Platz ist
    const wantCrouch = !!this.keys['ControlLeft'] || !!this.keys['ControlRight'];
    const crouched = wantCrouch || (this.crouchKey && asCollider(this.collider).blockedAt(this.motion.x, this.motion.z, this.motion.y - PLAYER.eye, PLAYER.radius, PLAYER.height, PLAYER.step));
    this.crouchKey = crouched;
    const height = crouched ? CROUCH_HEIGHT : PLAYER.height;

    // Eingabe → Bewegungsschritt (GoldSrc-Modell: Reibung, Beschleunigung, Luftsteuerung)
    const active = this.spawned && !this.frozen && !this.deadFlag && this.inputEnabled;
    const dir = active
      ? wishDir({
        w: !!this.keys['KeyW'] || !!this.keys['ArrowUp'],
        s: !!this.keys['KeyS'] || !!this.keys['ArrowDown'],
        a: !!this.keys['KeyA'] || !!this.keys['ArrowLeft'],
        d: !!this.keys['KeyD'] || !!this.keys['ArrowRight'],
      }, this.yaw)
      : { x: 0, z: 0 };
    const res = stepBody(this.motion, {
      wishX: dir.x,
      wishZ: dir.z,
      run: this.runSpeed,
      walk: this.isWalking(),
      crouch: crouched,
      jump: active && !!this.keys['Space'],
    }, dt, this.collider, { height });
    this.motion = res.body;
    if (res.landSpeed > 0) {
      this.landDip = Math.min(0.16, this.landDip + 0.1 * landPunch(res.landSpeed));
      this.onLand?.(res.landSpeed);
    }

    // Sicht-Höhe weich Richtung Duck-/Stand-Ziel interpolieren
    const targetEye = crouched ? PLAYER.crouchEye : PLAYER.eye;
    this.stanceY += (targetEye - this.stanceY) * Math.min(1, 1 - Math.exp(-10 * dt));

    // Absätze/Aufspringen (> 12 cm in einem Frame): Kamera gleitet nach, statt zu springen
    const feet = this.motion.y - PLAYER.eye;
    const rise = feet - this.prevFeet;
    if (rise > 0.12 && this.motion.grounded) this.stepOffset = Math.max(-0.6, this.stepOffset - rise);
    this.prevFeet = feet;
    this.stepOffset *= Math.exp(-12 * dt);
    this.landDip *= Math.exp(-9 * dt);

    // Headbob (dezent, nur Auf/Ab + minimal seitlich, kein Roll): am Boden und bei Bewegung
    let bobX = 0;
    let bobY = 0;
    const speed = speedXZ(this.motion);
    if (this.motion.grounded) {
      this.bobPhase = advanceBob(this.bobPhase, speed, dt);
      const scale = bobScale(speed, PLAYER.runSpeed * 0.75, crouched);
      if (scale > 0 && this.bobbing) {
        const b = bobOffset(this.bobPhase, scale);
        bobX = b.x;
        bobY = b.y;
      }
    } else {
      this.bobPhase = 0;
    }
    this.prevX = this.motion.x;
    this.prevZ = this.motion.z;

    // Shake: zufälliger Impuls, exponentiell abklingend
    if (this.shakeAmp > 0.0002) {
      this.shakeX = (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeY = (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeAmp *= Math.exp(-18 * dt);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeAmp = 0;
    }
    // Todes-Kamera: kippt und sinkt (Zuschauer am Boden)
    this.deathT += ((this.deadFlag ? 1 : 0) - this.deathT) * Math.min(1, dt * 5);

    // Ducken senkt die Kamera (Physik-Boden bleibt bei PLAYER.eye, sichtbar tiefer).
    const eyeDrop = PLAYER.eye - this.stanceY + this.deathT * 1.15 + this.landDip;

    if (this.specPose) {
      const sp = this.specPose;
      cam.rotation.set(sp.pitch, sp.yaw, 0);
      cam.position.set(sp.x, sp.y + PLAYER.eye, sp.z);
      return;
    }
    this.writeLook(cam);
    cam.position.set(this.motion.x + bobX, this.motion.y + bobY + this.stepOffset - eyeDrop, this.motion.z);
  }

  /** Aktuelle XZ-Position + Blick (Debug/Netzwerk-Snapshots). */
  motionX(): number { return this.motion.x; }
  motionZ(): number { return this.motion.z; }
  /** Fußhöhe (0 = Hallenboden; auf Plattformen höher). */
  feetY(): number { return this.motion.y - PLAYER.eye; }
  yawNow(): number { return this.yaw; }
  isLocked(): boolean { return this.locked; }

  /** true, solange der Spieler sich merklich bewegt (tatsächliches Tempo, nicht die Tasten). */
  moving(): boolean {
    return speedXZ(this.motion) > 0.4;
  }

  /** Horizontaltempo (m/s) — Grundlage für Streuung, Schrittgeräusche und Bob. */
  speedXZ(): number {
    return speedXZ(this.motion);
  }

  /** In der Luft (Sprung/Fall). */
  airborne(): boolean {
    return !this.motion.grounded;
  }

  /** Bewegung für die Treffer-Streuung (`fireSpread`). */
  spreadState(): MoveSpreadState {
    return { speed: speedXZ(this.motion), air: !this.motion.grounded };
  }

  /** Shift gehalten und nicht geduckt: leise gehen (52 %). */
  private isWalking(): boolean {
    return !this.crouchKey && !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
  }

  /** true, solange geduckt wird (für die Streuungs-/Sway-Logik im Shooter). */
  crouching(): boolean {
    return this.crouchKey;
  }

  /** true beim leisen Gehen (Shift + Bewegung, nicht geduckt) — Schritte sind lautlos. */
  walking(): boolean {
    return this.isWalking() && this.moving();
  }

  /** CS kennt kein Sprinten: Standard ist Laufen. (Die gesenkte Sprint-Haltung des Viewmodels entfällt.) */
  sprinting(): boolean {
    return false;
  }

  /** Spieler-HP (für HUD; Schaden kommt in M2 durch Gegner). */
  hp = 100;
  takeDamage(dmg: number): void {
    this.hp = Math.max(0, this.hp - dmg);
  }

  /** Weltraum-Hitboxen des Spielers (für Bot-Beschuss / gegnerische Raycasts). */
  partBoxes(): PartBox[] {
    return humanPartBoxes({ x: this.motion.x, y: this.feetY(), z: this.motion.z });
  }

  /** true wenn tot (vom Match gesetzt; Zuschauer-Modus). */
  get dead(): boolean {
    return this.deadFlag;
  }
  isDead(): boolean {
    return this.deadFlag;
  }
  setDead(dead: boolean): void {
    this.deadFlag = dead;
    if (dead) this.keys = {};
  }

  private readonly onClick = (): void => {
    const target = this.lockTarget;
    tick('click');
    if (!target) return;
    if (document.pointerLockElement === target) return;
    const p = target.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p?.catch) p.catch(() => tick('lock-rejected'));
  };

  private readonly onLockChange = (): void => {
    const target = this.lockTarget;
    this.locked = !!target && document.pointerLockElement === target;
    if (!this.locked) this.dragging = false;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (this.locked) return;
    // Drag-Look nur mit rechter Taste (links = Feuern über Shooter)
    if (e.button === 2) {
      this.dragging = true;
      e.preventDefault();
    }
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) this.dragging = false;
  };

  private readonly onContextMenu = (e: Event): void => {
    if (this.dragging) e.preventDefault();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (this.locked) {
      this.lookBy(e.movementX, e.movementY);
    } else if (this.dragging) {
      this.lookBy(e.movementX || (e.clientX - this.lastX), e.movementY || (e.clientY - this.lastY));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  };

  private lastX = 0;
  private lastY = 0;

  private lookBy(dx: number, dy: number): void {
    if (!dx && !dy || !this.inputEnabled) return;
    const k = this.sensitivity * this.sensScale;
    this.yaw -= dx * k;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch - (this.invertY ? -dy : dy) * k));
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.inputEnabled) return;
    this.keys[e.code] = true;
    // Klick-/Fokus-Komfort: Escape verlässt den Drag-Look
    if (e.code === 'Escape') this.dragging = false;
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };
  private readonly clearInput = (): void => {
    this.keys = {};
    this.dragging = false;
    this.crouchKey = false;
  };
}

export { PLAYER };
