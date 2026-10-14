import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import { WEAPONS, nextZoomLevel, zoomFov, type GrenadeKind, type WeaponDef } from '../logic/weapons';
import { fireSpread, makeGun, startReload, tickGun, tryShoot, type GunState } from '../logic/fire';
import { VIEW_PUNCH_SHARE, defaultSpray, fireRecoil, makeRecoil, sprayOffset, tickRecoil, type RecoilState } from '../logic/recoil';
import { offsetDir, resolveRay, shotDirs } from '../logic/combat';
import { surfaceNormalOnBoxes, type Vec3 } from '../logic/hitbox';
import type { SolidBox } from '../logic/level';
import type { Loadout } from '../logic/loadout';
import { bestWeapon, cycleWeapon, weaponInSlot } from '../logic/loadout';
import type { Aabb } from '../logic/hitbox';

const RELOAD_KEY = 'KeyR';
const LAST_WEAPON_KEY = 'KeyQ';
const USE_KEY = 'KeyE';
const MOUSE_FIRE = 0;
const MOUSE_ALT = 2;

export type HudState = {
  /** Zoom-Stufe (0 = aus). */
  zoom?: number;
  weaponName: string;
  weaponId: string;
  mag: number;
  reserve: number;
  reloading: boolean;
  hp: number;
  /** Aktuelle Streuung als Halb-Gap in px (dynamisches Fadenkreuz). */
  spreadPx: number;
  slots: (string | null)[];
};

/**
 * Lokales Schießen: Inventar (Loadout aus dem Match), Slots 1–5 wie CS, Mausrad/Q,
 * Hitscan-Strahlen (Streuung pur), Nachladen, Granatenwurf, Rückstoß. Treffer
 * entscheidet der Host (onFire) — lokal werden nur Mündungsfeuer/Tracer/Wandtreffer gezeigt.
 */
@registerType
export class Shooter extends Behaviour {
  weaponId = 'knife';
  onHud?: (s: HudState) => void;
  /** Schuss abgegeben: Waffe, Augenpunkt, Strahlen (bereits mit Streuung). */
  onFire?: (weaponId: string, origin: Vec3, dirs: Vec3[]) => void;
  onThrow?: (kind: GrenadeKind, origin: Vec3, dir: Vec3, strength: number) => void;
  onReload?: () => void;
  onShotSfx?: (weaponId: string) => void;
  onEmptyClick?: () => void;

  /** Solide Level-Boxen (Wände/Regale) für die lokale Strahl-Vorschau. */
  solids: SolidBox[] = [];
  aabbs: Aabb[] = [];

  /** Liefert das aktuelle Inventar (Host: Match-Objekt, Client: Spiegel). */
  loadout?: () => Loadout | undefined;
  /** Menü offen → keine Schüsse/Wechsel. */
  menuOpen?: () => boolean;
  /** Darf gerade nicht feuern (Freeze/tot). */
  blocked?: () => boolean;

  player?: import('../player/FpsPlayer').FpsPlayer;
  fx?: import('./Fx').Fx;
  viewModel?: import('./ViewModel').ViewModel;

  /** E gehalten (Bombe legen/entschärfen). */
  eHeld = false;

  /** Normales Sichtfeld (aus den Einstellungen). */
  baseFov = 75;
  /** Zoom-Stufe des Zielfernrohrs (0 = aus). */
  zoomLevel = 0;
  /** Zielfernrohr an/aus (für HUD-Overlay). */
  onZoom?: (level: number) => void;
  /** Nach Repetieren automatisch wieder zoomen (CS-Verhalten bei AWP/Scout). */
  private rezoomLevel = 0;
  private rezoomAt = 0;
  private time = 0;
  private meleeCooldown = 0;

  private fireDown = false;
  private altDown = false;
  private reloadRequested = false;
  private lastWeapon = 'knife';
  private throwArmed: GrenadeKind | null = null;
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly fallbackGuns = new Map<string, GunState>();
  private readonly recoils = new Map<string, RecoilState>();
  private semiLatch = false;

  private recoilState(): RecoilState {
    let s = this.recoils.get(this.weaponId);
    if (!s) {
      s = makeRecoil();
      this.recoils.set(this.weaponId, s);
    }
    return s;
  }

  private def(): WeaponDef {
    return WEAPONS[this.weaponId] ?? WEAPONS['knife']!;
  }

  private gunState(): GunState | undefined {
    const def = this.def();
    if (def.mode !== 'hit') return undefined;
    const lo = this.loadout?.();
    if (lo) {
      if (!lo.guns[this.weaponId]) lo.guns[this.weaponId] = makeGun(def);
      return lo.guns[this.weaponId];
    }
    let g = this.fallbackGuns.get(this.weaponId);
    if (!g) {
      g = makeGun(def);
      this.fallbackGuns.set(this.weaponId, g);
    }
    return g;
  }

  start(): void {
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onBlur);
  }

  onDestroy(): void {
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Waffe wechseln (nur wenn im Inventar oder Messer). */
  setWeapon(id: string): void {
    if (!WEAPONS[id]) return;
    const lo = this.loadout?.();
    if (lo && !this.carries(lo, id)) return;
    if (id === this.weaponId) return;
    const prev = this.gunState();
    if (prev && prev.reloadLeft > 0) prev.reloadLeft = 0; // Wechsel bricht Nachladen ab
    this.lastWeapon = this.weaponId;
    this.weaponId = id;
    this.reloadRequested = false;
    this.throwArmed = null;
    this.fireDown = false;
    this.setZoom(0);
    this.rezoomLevel = 0;
    this.viewModel?.show(id).catch(() => undefined);
  }

  private carries(lo: Loadout, id: string): boolean {
    return id === 'knife' || lo.primary === id || lo.secondary === id || (id === 'c4' && lo.bomb)
      || (id === 'hegrenade' && lo.grenades.he > 0) || (id === 'flashbang' && lo.grenades.flash > 0) || (id === 'smokegrenade' && lo.grenades.smoke > 0);
  }

  /** Zoom-Stufe setzen (Kamera-FOV, Empfindlichkeit, Viewmodel, HUD-Overlay). */
  setZoom(level: number): void {
    if (level === this.zoomLevel) return;
    this.zoomLevel = level;
    this.viewModel?.setVisible(level === 0);
    this.onZoom?.(level);
  }

  /** Wechselt auf Slot (1 Primär, 2 Pistole, 3 Messer, 4 Granate, 5 C4). */
  selectSlot(n: number): void {
    const lo = this.loadout?.();
    if (!lo) {
      if (n === 3) this.setWeapon('knife');
      return;
    }
    if (n === 4) {
      // Mehrfaches Drücken schaltet durch die Granaten
      const order = ['hegrenade', 'flashbang', 'smokegrenade'].filter((g) => this.carries(lo, g));
      if (!order.length) return;
      const i = order.indexOf(this.weaponId);
      this.setWeapon(order[(i + 1) % order.length]!);
      return;
    }
    const id = weaponInSlot(lo, n as 1 | 2 | 3 | 4 | 5);
    if (id) this.setWeapon(id);
  }

  /** Nach Spawn/Rundenstart: beste Waffe ziehen; falls aktuelle fehlt, wechseln. */
  onSpawn(): void {
    const lo = this.loadout?.();
    if (!lo) return;
    this.weaponId = '';
    this.setWeapon(bestWeapon(lo));
  }

  magNow(): number {
    return this.gunState()?.mag ?? Infinity;
  }

  reserveNow(): number {
    return this.gunState()?.reserve ?? Infinity;
  }

  update(): void {
    const lo = this.loadout?.();
    // Waffe weg (Tod/Kauf ersetzt) → sinnvolle Waffe wählen
    if (lo && !this.carries(lo, this.weaponId)) {
      this.weaponId = '';
      this.setWeapon(bestWeapon(lo));
    }
    const def = this.def();
    const state = this.gunState();
    const dt = Math.min(this.context.time.deltaTime, 0.05);
    this.time += dt;
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    if (state) tickGun(state, def, dt);
    // Nachladen beendet den Zoom; nach dem Repetieren wieder heranzoomen
    if (state && state.reloadLeft > 0 && this.zoomLevel > 0) this.setZoom(0);
    if (this.rezoomLevel > 0 && this.time >= this.rezoomAt) {
      if (state && state.reloadLeft === 0 && state.mag > 0 && !(this.blocked?.() ?? false)) this.setZoom(this.rezoomLevel);
      this.rezoomLevel = 0;
    }
    // Kamera-FOV weich zur Zoom-Stufe; Mausempfindlichkeit skaliert mit (gleiches Gefühl pro Bildschirmweg)
    const cam = this.context.mainCamera as THREE.PerspectiveCamera | undefined;
    if (cam?.isPerspectiveCamera) {
      const target = zoomFov(def, this.zoomLevel, this.baseFov);
      if (Math.abs(cam.fov - target) > 0.05) {
        // bildratenunabhängig (echte Frame-Zeit, nicht gedeckelt)
        cam.fov += (target - cam.fov) * (1 - Math.exp(-18 * this.context.time.deltaTime));
        cam.updateProjectionMatrix();
      }
      if (this.player) this.player.sensScale = cam.fov / this.baseFov;
    }

    if (this.reloadRequested && state) {
      if (startReload(state, def)) {
        this.onReload?.();
        this.viewModel?.reloadAnim(state.reloadLeft);
      }
      this.reloadRequested = false;
    }

    const blocked = this.blocked?.() ?? false;
    const menu = this.menuOpen?.() ?? false;
    if (this.fireDown && def.rpm > 0 && def.mode === 'hit' && !blocked && !menu) this.fire(def);

    const rec = this.recoilState();
    tickRecoil(def.recoil, rec, dt, this.fireDown && def.rpm > 0);
    this.player?.setRecoil(rec.pitch, rec.yaw);

    this.onHud?.({
      weaponName: def.name,
      weaponId: def.id,
      mag: state?.mag ?? Infinity,
      reserve: state?.reserve ?? Infinity,
      reloading: (state?.reloadLeft ?? 0) > 0,
      hp: this.player?.hp ?? 100,
      spreadPx: state ? this.spreadPx(def, state) : 0,
      zoom: this.zoomLevel,
      slots: lo ? [lo.primary, lo.secondary, 'knife', weaponInSlot(lo, 4), lo.bomb ? 'c4' : null] : [null, null, 'knife', null, null],
    });
  }

  private spreadPx(def: WeaponDef, state: GunState): number {
    const spread = fireSpread(def, state, !!this.player?.moving(), !!this.player?.crouching(), this.zoomLevel > 0);
    if (spread <= 0) return 0;
    const cam = this.context.mainCamera as THREE.PerspectiveCamera | undefined;
    const dom = this.context.renderer.domElement;
    const height = Math.max(1, dom?.clientHeight ?? dom?.height ?? 600);
    const fov = (cam?.fov ?? 75) * (Math.PI / 180);
    return Math.tan(spread) * ((height / 2) / Math.tan(fov / 2));
  }

  private camRay(): { origin: Vec3; dir: Vec3 } | null {
    const cam = this.context.mainCamera as THREE.PerspectiveCamera | undefined;
    if (!cam) return null;
    cam.getWorldDirection(this.dir);
    cam.getWorldPosition(this.origin);
    return { origin: { x: this.origin.x, y: this.origin.y, z: this.origin.z }, dir: { x: this.dir.x, y: this.dir.y, z: this.dir.z } };
  }

  private fire(def: WeaponDef, alt = false): void {
    const ray = this.camRay();
    if (!ray) return;
    // Messer: Hieb (links) oder schwerer Stich (rechts) mit eigener Ausholzeit
    if (def.mode === 'melee') {
      if (this.meleeCooldown > 0) return;
      const used = alt ? (WEAPONS['knife_stab'] ?? def) : def;
      this.meleeCooldown = used.cycle ?? 0.45;
      this.viewModel?.kick(alt ? 0.1 : 0.05);
      this.viewModel?.slash(alt);
      this.onShotSfx?.(used.id);
      this.onFire?.(used.id, ray.origin, [ray.dir]);
      return;
    }
    const state = this.gunState();
    if (state) {
      const res = tryShoot(state, def);
      if (!res.ok) {
        if (res.reason === 'empty' && !this.semiLatch) {
          this.onEmptyClick?.();
          this.reloadRequested = true;
          this.semiLatch = true;
        }
        return;
      }
      if (res.emptyAfter) this.reloadRequested = true;
    }
    const scoped = this.zoomLevel > 0;
    const spread = state ? fireSpread(def, state, !!this.player?.moving(), !!this.player?.crouching(), scoped) : 0;

    // Rückstoß: Automatikwaffen folgen einem festen CS-Spray-Muster (Kugeln weichen um den
    // nicht von der Kamera mitgenommenen Anteil ab → mit der Maus gegenziehen), Rest zufällig.
    const rec = this.recoilState();
    const shape = defaultSpray(def.type, def.rpm);
    let aim = ray.dir;
    let kickPitch: number;
    if (shape) {
      const off = sprayOffset(shape, rec.shots);
      rec.shots += 1;
      rec.idle = 0;
      rec.pitch = off.pitch * VIEW_PUNCH_SHARE;
      rec.yaw = -off.yaw * VIEW_PUNCH_SHARE;
      aim = offsetDir(ray.dir, off.pitch * (1 - VIEW_PUNCH_SHARE), off.yaw * (1 - VIEW_PUNCH_SHARE));
      kickPitch = shape.climb;
    } else {
      kickPitch = fireRecoil(def.recoil, rec, Math.random).pitch;
    }
    const dirs = shotDirs(def, aim, spread);
    const punch = def.type === 'sniper' ? 0.16 : def.type === 'shotgun' ? 0.14 : Math.min(0.12, kickPitch * 9 + 0.018);
    this.viewModel?.kick(punch);
    this.player?.shake(punch * (scoped ? 0.15 : 0.35));

    // Repetierer: nach dem Schuss raus aus dem Zielfernrohr, nach dem Repetieren wieder rein
    if (scoped && def.type === 'sniper' && def.rpm === 0) {
      this.rezoomLevel = this.zoomLevel;
      this.rezoomAt = this.time + (def.cycle ?? 1.2) * 0.9;
      this.setZoom(0);
    }

    // Lokale Effekte: Mündung, Tracer bis Wand/Reichweite, Wand-Decal (Ziel-Treffer kommen vom Host)
    const muzzle = this.muzzlePoint(ray.dir);
    this.fx?.muzzleFlash(muzzle, ray.dir, def.type === 'sniper' ? 1.6 : def.type === 'shotgun' ? 1.4 : 1.1);
    this.fx?.shell(muzzle, ray.dir);
    for (const d of dirs) {
      const hit = resolveRay(ray.origin, d, def.range, this.aabbs, []);
      this.fx?.tracer(scoped ? ray.origin : muzzle, hit.point);
      if (hit.kind === 'wall') {
        const n = surfaceNormalOnBoxes(this.aabbs, hit.point) ?? { x: 0, y: 1, z: 0 };
        this.fx?.impact({ kind: 'wall', point: hit.point, normal: n }, d);
      }
    }
    this.onShotSfx?.(def.id);
    this.onFire?.(def.id, ray.origin, dirs);
  }

  private muzzlePoint(dir: Vec3): Vec3 {
    if (this.viewModel?.hasModel()) {
      const v = this.viewModel.muzzleWorld(new THREE.Vector3());
      return { x: v.x, y: v.y, z: v.z };
    }
    return { x: this.origin.x + dir.x * 0.5, y: this.origin.y + dir.y * 0.5, z: this.origin.z + dir.z * 0.5 };
  }

  private throwNow(strength: number): void {
    const def = this.def();
    if (def.mode !== 'throw' || !def.grenadeKind) return;
    const ray = this.camRay();
    if (!ray) return;
    const kind = def.grenadeKind;
    this.onThrow?.(kind, ray.origin, ray.dir, strength);
    this.viewModel?.kick(0.08);
    // Danach beste Waffe (Host nimmt die Granate aus dem Inventar; Spiegel folgt)
    const lo = this.loadout?.();
    if (lo) {
      lo.grenades[kind] = Math.max(0, lo.grenades[kind] - 1);
      this.weaponId = '';
      this.setWeapon(this.carries(lo, def.id) ? def.id : bestWeapon(lo));
    }
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (this.menuOpen?.() || this.blocked?.()) return;
    const def = this.def();
    if (e.button === MOUSE_FIRE) {
      this.fireDown = true;
      this.semiLatch = false;
      if (def.mode === 'throw') this.throwArmed = def.grenadeKind ?? null;
      else if (def.mode === 'melee') this.fire(def, false);
      // Erster Schuss sofort beim Klick (auch Automatik) — kein Frame Eingabeverzögerung
      else if (def.mode === 'hit') this.fire(def);
    } else if (e.button === MOUSE_ALT && def.mode === 'throw') {
      this.altDown = true;
      this.throwArmed = def.grenadeKind ?? null;
    } else if (e.button === MOUSE_ALT && (this.player?.isLocked() ?? true)) {
      // Rechte Maustaste (nur mit gefangener Maus, sonst ist sie Umschauen): Zoom bzw. Messerstich
      if (def.mode === 'melee') this.fire(def, true);
      else if (def.zoom?.length) {
        this.rezoomLevel = 0;
        this.setZoom(nextZoomLevel(def, this.zoomLevel));
      }
    }
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === MOUSE_FIRE) {
      this.fireDown = false;
      this.semiLatch = false;
      if (this.throwArmed && !this.altDown) {
        this.throwArmed = null;
        this.throwNow(1);
      }
    } else if (e.button === MOUSE_ALT) {
      if (this.altDown && this.throwArmed) {
        this.throwArmed = null;
        this.throwNow(0.5);
      }
      this.altDown = false;
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === USE_KEY) this.eHeld = true;
    if (this.menuOpen?.()) return;
    if (e.code === RELOAD_KEY) {
      this.reloadRequested = true;
      return;
    }
    if (e.code === LAST_WEAPON_KEY) {
      this.setWeapon(this.lastWeapon);
      return;
    }
    const m = /^Digit([1-5])$/.exec(e.code);
    if (m) this.selectSlot(Number(m[1]));
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === USE_KEY) this.eHeld = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.menuOpen?.()) return;
    const lo = this.loadout?.();
    if (!lo) return;
    this.setWeapon(cycleWeapon(lo, this.weaponId, e.deltaY > 0 ? 1 : -1));
  };

  private readonly onBlur = (): void => {
    this.fireDown = false;
    this.altDown = false;
    this.eHeld = false;
    this.throwArmed = null;
  };
}
