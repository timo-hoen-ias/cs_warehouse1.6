import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import type { SolidBox } from '../logic/level';
import { PLAYER, stepPlayer, type PlayerMotion } from '../logic/move';
import { wishSpeed } from '../logic/move';
import { advanceBob, bobOffset, bobScale } from '../logic/bob';
import { humanPartBoxes, type PartBox } from '../logic/hitbox';

const SENS = 0.0022;
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
  /** Solide Level-Boxen, gegen die kollidiert wird. */
  solids: SolidBox[] = [];
  /** Freeze-Phase: Umschauen erlaubt, keine Bewegung. */
  frozen = false;
  /** Eingaben komplett aus (Lobby/Menü offen). */
  inputEnabled = true;
  private deadFlag = false;

  private motion: PlayerMotion = { x: 0, y: PLAYER.eye, z: 0, vy: 0, grounded: true };
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
  /** Recoil-Offset setzen (kommt pro Frame vom Shooter). */
  setRecoil(pitch: number, yaw: number): void {
    this.recoilPitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
    this.recoilYaw = Math.max(-1, Math.min(1, yaw));
  }
  /** Kamera aus Look + Recoil-Offset schreiben. */
  private writeLook(cam: THREE.Object3D): void {
    const p = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + this.recoilPitch));
    cam.rotation.set(p, this.yaw + this.recoilYaw, 0);
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

  /** Setzt Position + Blick einmalig (Spawn). */
  spawn(x: number, z: number, yaw = 0): void {
    this.motion = { x, y: PLAYER.eye, z, vy: 0, grounded: true };
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.crouchKey = false;
    this.stanceY = PLAYER.eye;
    this.bobPhase = 0;
    this.prevX = x;
    this.prevZ = z;
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
    const dt = Math.min(this.context.time.deltaTime, 0.05);

    const crouched = !!this.keys['ControlLeft'] || !!this.keys['ControlRight'];
    this.crouchKey = crouched;

    if (this.spawned && !this.frozen && !this.deadFlag && this.inputEnabled) {
      const wish = wishSpeed(
        {
          w: !!this.keys['KeyW'] || !!this.keys['ArrowUp'],
          s: !!this.keys['KeyS'] || !!this.keys['ArrowDown'],
          a: !!this.keys['KeyA'] || !!this.keys['ArrowLeft'],
          d: !!this.keys['KeyD'] || !!this.keys['ArrowRight'],
          sprint: crouched ? false : !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'],
        },
        this.yaw,
        crouched ? PLAYER.crouchSpeed : PLAYER.walkSpeed,
        PLAYER.sprintSpeed,
      );
      const jump = !crouched && !!this.keys['Space'];
      this.motion = stepPlayer(this.motion, wish.x, wish.z, jump, dt, this.solids);
    } else {
      this.motion = stepPlayer(this.motion, 0, 0, false, dt, this.solids);
    }

    // Sicht-Höhe weich Richtung Duck-/Stand-Ziel interpolieren
    const targetEye = crouched ? PLAYER.crouchEye : PLAYER.eye;
    this.stanceY += (targetEye - this.stanceY) * Math.min(1, 1 - Math.exp(-10 * dt));

    // Headbob: nur am Boden und bei Bewegung; folgt dem Lauf-Tempo.
    let bobX = 0;
    let bobY = 0;
    let bobRoll = 0;
    if (this.motion.grounded) {
      const speed = Math.hypot(this.motion.x - this.prevX, this.motion.z - this.prevZ) / Math.max(dt, 1e-4);
      this.bobPhase = advanceBob(this.bobPhase, speed, dt);
      const scale = bobScale(speed, crouched ? PLAYER.crouchSpeed : PLAYER.walkSpeed, crouched);
      if (scale > 0) {
        const b = bobOffset(this.bobPhase, scale);
        bobX = b.x;
        bobY = b.y;
        bobRoll = b.roll;
      }
    } else {
      this.bobPhase = 0;
    }
    this.prevX = this.motion.x;
    this.prevZ = this.motion.z;

    // Ducken senkt die Kamera (Physik-Boden bleibt bei PLAYER.eye, sichtbar tiefer).
    const eyeDrop = PLAYER.eye - this.stanceY;

    this.writeLook(cam);
    cam.rotation.z += bobRoll;
    cam.position.set(this.motion.x + bobX, this.motion.y + bobY - eyeDrop, this.motion.z);
  }

  /** Aktuelle XZ-Position + Blick (Debug/Netzwerk-Snapshots). */
  motionX(): number { return this.motion.x; }
  motionZ(): number { return this.motion.z; }
  yawNow(): number { return this.yaw; }
  isLocked(): boolean { return this.locked; }

  /** true, wenn eine Bewegungstaste gehalten wird (für Bewegungsspread). */
  moving(): boolean {
    return !!(this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD']
      || this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight']);
  }

  /** true, solange geduckt wird (für die Streuungs-/Sway-Logik im Shooter). */
  crouching(): boolean {
    return this.crouchKey;
  }

  /** Spieler-HP (für HUD; Schaden kommt in M2 durch Gegner). */
  hp = 100;
  takeDamage(dmg: number): void {
    this.hp = Math.max(0, this.hp - dmg);
  }

  /** Weltraum-Hitboxen des Spielers (für Bot-Beschuss / gegnerische Raycasts). */
  partBoxes(): PartBox[] {
    return humanPartBoxes({ x: this.motion.x, y: 0, z: this.motion.z });
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
    this.yaw -= dx * SENS;
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch - dy * SENS));
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
