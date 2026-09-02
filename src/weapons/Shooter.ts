import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import { WEAPONS, type WeaponDef } from '../logic/weapons';
import { fireSpread, makeGun, startReload, tickGun, tryShoot, type GunState } from '../logic/fire';
import { fireRecoil, makeRecoil, tickRecoil, type RecoilState } from '../logic/recoil';
import { targets, type DamageTarget } from '../entities/DamageTarget';
import { castParts, surfaceNormalOnBoxes, type BodyPart, type PartBox, type Vec3 } from '../logic/hitbox';
import { hitPoint } from '../logic/fx';
import type { SolidBox } from '../logic/level';

const RELOAD_KEY = 'KeyR';
const MOUSE_FIRE = 0;

export type HudState = {
  weaponName: string;
  mag: number;
  reserve: number;
  reloading: boolean;
  hp: number;
  /** Aktuelle Streuung als Halb-Gap in px (dynamisches Fadenkreuz). */
  spreadPx: number;
};

/**
 * FPS-Schießen: HitScan von der Kameramitte. Strahl wird PURE gerechnet
 * (src/logic/hitbox.ts castParts) gegen Level-Solids + Ziel-Hitboxen.
 * Feuer-/Magazin-/Recoil-Logik: src/logic/fire.ts.
 */
@registerType
export class Shooter extends Behaviour {
  weaponId = 'glock';
  onHud?: (s: HudState) => void;

  /** Solide Level-Boxen (Wände/Regale) für die Strahl-Blockade. */
  solids: SolidBox[] = [];

  /** Referenz auf den FpsPlayer: Bewegung (Spread) + Recoil-Kick + HP. */
  player?: import('../player/FpsPlayer').FpsPlayer;

  /** Effekte (Mündungsfeuer/Tracer/Einschlag). */
  fx?: import('./Fx').Fx;

  /** Sichtbares Viewmodel (Kamera-Kind). */
  viewModel?: import('./ViewModel').ViewModel;

  private fireDown = false;
  private reloadRequested = false;
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly upV = new THREE.Vector3();
  private readonly rightV = new THREE.Vector3();

  /** Slots: Ziffer 1..4 → Waffen-IDs. */
  private readonly slots: string[] = ['knife', 'glock', 'ak47', 'usp'];
  private readonly states = new Map<string, GunState>();
  private readonly recoils = new Map<string, RecoilState>();

  private recoilState(): RecoilState {
    let s = this.recoils.get(this.weaponId);
    if (!s) {
      s = makeRecoil();
      this.recoils.set(this.weaponId, s);
    }
    return s;
  }

  private gunState(): GunState {
    let s = this.states.get(this.weaponId);
    if (!s) {
      s = makeGun(WEAPONS[this.weaponId] ?? WEAPONS['glock']!);
      this.states.set(this.weaponId, s);
    }
    return s;
  }

  start(): void {
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onKeyDown);
  }

  onDestroy(): void {
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
  }

  /** Waffe wechseln (Zustand je Waffe bleibt erhalten). */
  setWeapon(id: string): void {
    if (!WEAPONS[id]) return;
    // Waffenwechsel bricht laufendes Nachladen ab (Munition verfällt)
    const prev = this.states.get(this.weaponId);
    if (prev && prev.reloadLeft > 0) {
      this.states.set(this.weaponId, { ...prev, reloadLeft: 0 });
    }
    this.weaponId = id;
    this.reloadRequested = false;
    this.viewModel?.show(id).catch(() => undefined);
  }

  /** Wechselt auf Slot (1-basiert). */
  selectSlot(n: number): void {
    const id = this.slots[n - 1];
    if (id) this.setWeapon(id);
  }

  /** Magazinstand der aktiven Waffe (Debug/HUD). */
  magNow(): number {
    return this.gunState().mag;
  }

  /** Reserve der aktiven Waffe (Debug/HUD). */
  reserveNow(): number {
    return this.gunState().reserve;
  }

  update(): void {
    const def = WEAPONS[this.weaponId] ?? WEAPONS['glock']!;
    const state = this.gunState();
    const dt = Math.min(this.context.time.deltaTime, 0.05);
    tickGun(state, def, dt);

    if (this.reloadRequested) {
      startReload(state, def);
      this.reloadRequested = false;
    }

    if (this.fireDown && def.rpm > 0) this.fire(def);

    // Recoil: während des Dauerfeuers bleibt der Offset stehen, sonst klingt er ab.
    const rec = this.recoilState();
    tickRecoil(def.recoil, rec, dt, this.fireDown && def.rpm > 0);
    this.player?.setRecoil(rec.pitch, rec.yaw);

    this.onHud?.({
      weaponName: def.name,
      mag: state.mag,
      reserve: state.reserve,
      reloading: state.reloadLeft > 0,
      hp: this.player?.hp ?? 100,
      spreadPx: this.spreadPx(def, state),
    });
  }

  /** Streuung (rad) in Bildschirm-Gap (px) umrechnen — für dynamisches Fadenkreuz. */
  private spreadPx(def: WeaponDef, state: GunState): number {
    const spread = fireSpread(def, state, !!this.player?.moving(), !!this.player?.crouching());
    if (spread <= 0) return 0;
    const cam = this.context.mainCamera as THREE.PerspectiveCamera | undefined;
    const dom = this.context.renderer.domElement;
    const height = Math.max(1, dom?.clientHeight ?? dom?.height ?? 600);
    const fov = (cam?.fov ?? 75) * (Math.PI / 180);
    return Math.tan(spread) * ((height / 2) / Math.tan(fov / 2));
  }

  private fire(def: WeaponDef): void {
    const cam = this.context.mainCamera as THREE.PerspectiveCamera | undefined;
    if (!cam) return;
    const state = this.gunState();
    const res = tryShoot(state, def);
    if (!res.ok) return;

    cam.getWorldDirection(this.dir);
    const spread = fireSpread(def, state, !!this.player?.moving(), !!this.player?.crouching());
    if (spread > 0) {
      cam.getWorldPosition(this.origin);
      this.upV.set(0, 1, 0).applyQuaternion(cam.quaternion);
      this.rightV.crossVectors(this.dir, this.upV).normalize();
      const u = (Math.random() - 0.5) * 2;
      const v = (Math.random() - 0.5) * 2;
      const r = Math.sqrt(Math.random()) * spread;
      this.dir.addScaledVector(this.rightV, u * r).addScaledVector(this.upV, v * r).normalize();
    }

    // Purer Strahl-Test
    const rayO = this.rayOrigin(cam);
    const rayD = toVec(this.dir);
    const wallHit = castParts(rayO, rayD, this.solids.map(toPart));
    const hit = this.raycastTargets(def, rayO, rayD);

    // Rückstoß bei JEDEM Schuss (unabhängig von Treffer/Wand) — Modell zuckt zurück.
    const rec = this.recoilState();
    const kick = fireRecoil(def.recoil, rec, Math.random);
    this.viewModel?.kick(Math.min(0.12, kick.pitch * 6 + 0.006));

    // Mündungsweltpunkt (für Mündungsfeuer/Tracer)
    const muzzle = this.muzzlePoint(cam, rayD);
    const muzzleHit = hit && (wallHit === null || hit.dist < wallHit.dist);

    // Effekte immer (Schuss = Mündungsfeuer + Tracer)
    this.fx?.muzzleFlash(muzzle, rayD, def.type === 'sniper' ? 1.4 : 1);
    const end = muzzleHit
      ? hitPoint(rayO, rayD, hit.dist)
      : wallHit
        ? hitPoint(rayO, rayD, wallHit.dist)
        : hitPoint(rayO, rayD, def.range);
    this.fx?.tracer(muzzle, end);

    if (muzzleHit) {
      const killed = hit.target.takeHit(hit.part, def);
      hit.target.flashHit?.();
      const tpoint = hitPoint(rayO, rayD, hit.dist);
      const tnormal = surfaceNormalOnBoxes(hit.target.partBoxes?.().map((pp) => pp.box) ?? [], tpoint) ?? { x: 0, y: 0, z: 1 };
      this.fx?.impact({ kind: "target", part: hit.part, point: tpoint, killed, normal: tnormal }, rayD);
    } else if (wallHit) {
      const wpoint = hitPoint(rayO, rayD, wallHit.dist);
      const wnormal = surfaceNormalOnBoxes(this.solids.map((s) => ({ minX: s.minX, minY: s.minY, minZ: s.minZ, maxX: s.maxX, maxY: s.maxY, maxZ: s.maxZ })), wpoint) ?? { x: 0, y: 0, z: 1 };
      this.fx?.impact({ kind: "wall", point: wpoint, normal: wnormal }, rayD);
    }

    if (res.emptyAfter) this.reloadRequested = true;
  }

  /** Mündungspunkt: Viewmodel-Mündung, sonst Kameraposition leicht versetzt nach vorn. */
  private muzzlePoint(cam: THREE.PerspectiveCamera, dir: Vec3): Vec3 {
    const p = cam.getWorldPosition(new THREE.Vector3());
    if (this.viewModel?.hasModel()) {
      const v = this.viewModel.muzzleWorld(new THREE.Vector3());
      return { x: v.x, y: v.y, z: v.z };
    }
    // Fallback: 0.5 m vor der Kamera in Blickrichtung
    return { x: p.x + dir.x * 0.5, y: p.y + dir.y * 0.5, z: p.z + dir.z * 0.5 };
  }

  private rayOrigin(cam: THREE.PerspectiveCamera): Vec3 {
    const p = cam.getWorldPosition(this.origin);
    return { x: p.x, y: p.y, z: p.z };
  }

  private raycastTargets(def: WeaponDef, origin: Vec3, dir: Vec3): { target: DamageTarget; part: BodyPart; dist: number } | null {
    if (def.mode === 'melee') {
      // Messer: kurze Reichweite, trifft das nächste Ziel im Umkreis
      let best: { target: DamageTarget; part: BodyPart; dist: number } | null = null;
      for (const t of targets) {
        const boxes = t.partBoxes?.();
        if (!boxes) continue;
        const hit = castParts(origin, dir, boxes);
        if (hit && hit.dist <= def.range && (!best || hit.dist < best.dist)) best = { target: t, part: hit.part, dist: hit.dist };
      }
      return best;
    }
    let best: { target: DamageTarget; part: BodyPart; dist: number } | null = null;
    for (const t of targets) {
      const boxes = t.partBoxes?.();
      if (!boxes) continue;
      const hit = castParts(origin, dir, boxes);
      if (!hit) continue;
      if (hit.dist > def.range) continue;
      if (!best || hit.dist < best.dist) best = { target: t, part: hit.part, dist: hit.dist };
    }
    return best;
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== MOUSE_FIRE) return;
    this.fireDown = true;
    const def = WEAPONS[this.weaponId] ?? WEAPONS['glock']!;
    if (def.rpm === 0) this.fire(def); // semi feuert pro Klick
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === MOUSE_FIRE) this.fireDown = false;
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === RELOAD_KEY) {
      this.reloadRequested = true;
      return;
    }
    const m = /^Digit([1-4])$/.exec(e.code);
    if (m) this.selectSlot(Number(m[1]));
  };
}

function toVec(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}
function toPart(b: SolidBox): PartBox {
  return {
    part: 'body',
    box: { minX: b.minX, minY: b.minY, minZ: b.minZ, maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ },
  };
}
