import { Behaviour, destroy, registerType, type Context } from '@needle-tools/engine';
import * as THREE from 'three';
import { World } from '../game/World';
import { loadMapData, mapById } from '../maps';
import { FlightPath, flightPose, planFlight, tourStops, type V3 } from '../logic/menuFlight';
import { MenuBackdrop, type MenuBackdropLike } from './MenuBackdrop';

/** Bildrate des Menühintergrunds (die Engine drosselt ihre Schleife darauf). */
const MENU_FPS = 30;
/** Erst bauen, wenn das Menü einen Moment ruhig steht / die Kartenwahl sich nicht mehr ändert (ms). */
const BUILD_DELAY_MS = 900;

/** Kamera pro Frame entlang der Flugbahn bewegen (läuft in der Engine-Schleife, mit 30 fps gedeckelt). */
@registerType
class FlightRig extends Behaviour {
  path!: FlightPath;
  paused = false;
  private t0 = performance.now();
  private offset = 0;

  update(): void {
    const cam = this.context.mainCamera;
    if (!cam || this.paused || document.hidden) {
      this.t0 = performance.now() - this.offset * 1000; // Zeit steht still, solange pausiert
      return;
    }
    this.offset = (performance.now() - this.t0) / 1000;
    const p = flightPose(this.path, this.offset);
    cam.position.set(p.x, p.y, p.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(p.pitch, p.yaw, 0);
  }
}

/**
 * 3D-Menühintergrund: langsamer Kameraflug durch die gewählte Karte hinter dem Menü.
 *
 * Das Canvas-Key-Art (`MenuBackdrop`) erscheint sofort und bleibt als Rückfall; die Welt wird danach
 * gebaut (grafisch „niedrig“, ohne Bots/Match) und mit Überblendung eingeblendet. Fehler beim Bauen
 * lassen das Key-Art stehen. Beim Spielstart muss `releaseWorld()` laufen, bevor das Spiel seine Welt
 * baut, damit keine doppelten Szene-Objekte bleiben.
 */
export class FlightBackdrop implements MenuBackdropLike {
  private readonly art: MenuBackdrop;
  private root: HTMLElement | null = null;
  private world: World | null = null;
  private rigObj: THREE.Object3D | null = null;
  private rig: FlightRig | null = null;
  private mapId: string;
  private token = 0;
  private timer = 0;
  private paused = false;
  private disposed = false;
  private prevFps: Context['targetFrameRate'];

  constructor(private readonly context: Context, mapId: string, quality: 'high' | 'low') {
    this.art = new MenuBackdrop(quality);
    this.mapId = mapById(mapId).id;
  }

  /** Läuft gerade der 3D-Flug? (Smoke/Debug) */
  get active(): boolean {
    return !!this.rig;
  }

  mount(container: HTMLElement): void {
    this.root = container;
    this.art.mount(container);
    this.schedule();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.art.setPaused(paused || !!this.rig);
    if (this.rig) this.rig.paused = paused;
  }

  setMood(seed: number): void {
    this.art.setMood(seed);
  }

  /** Andere Karte gewählt: Welt nach kurzer Ruhe neu bauen. */
  setMap(id: string): void {
    const next = mapById(id).id;
    if (next === this.mapId) return;
    this.mapId = next;
    this.schedule();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.timer);
    this.token++;
    this.releaseWorld();
    this.art.dispose();
  }

  /**
   * Menü-Welt vollständig entfernen (Szene, Geometrien, Materialien, Flug-Komponente, Bildraten-Deckel).
   * Aufruf vor dem Spielstart — idempotent.
   */
  releaseWorld(): void {
    window.clearTimeout(this.timer);
    this.token++; // laufende Ladevorgänge verwerfen
    if (this.rigObj) {
      destroy(this.rigObj, true);
      this.rigObj = null;
      this.rig = null;
    }
    if (this.world) {
      const scene = this.context.scene;
      scene.remove(this.world.group);
      disposeTree(this.world.group);
      this.world = null;
      scene.fog = null;
      this.context.targetFrameRate = this.prevFps;
    }
    this.root?.classList.remove('mm-3d');
  }

  // ---------------------------------------------------------------- Aufbau

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.load(); }, BUILD_DELAY_MS);
  }

  private async load(): Promise<void> {
    if (this.disposed) return;
    const my = ++this.token;
    const stale = (): boolean => my !== this.token || this.disposed;
    try {
      // alte Welt erst entfernen, wenn eine neue gebaut wird (Key-Art blendet dazwischen wieder ein)
      if (this.rig) this.hide3d();
      await nextFrame();
      if (stale()) return;
      const data = loadMapData(this.mapId);
      const world = new World(data, 'low');
      await nextFrame();
      if (stale()) { disposeTree(world.group); return; }

      // Rundreise: Stationen → Wege (A* je Teilstrecke, zwischen den Wegen Luft für die Menü-Oberfläche)
      const stops = tourStops({ nav: world.nav, spawns: data.spawns, sites: data.sites });
      const memo = new Map<string, { nodes: number[] } | null>();
      const keyOf = (a: V3, b: V3): string => `${a.x},${a.y},${a.z}>${b.x},${b.y},${b.z}`;
      for (let i = 0; i < stops.length; i++) {
        const a = stops[i]!;
        const b = stops[(i + 1) % stops.length]!;
        memo.set(keyOf(a, b), world.findPath(a, b));
        await nextFrame();
        if (stale()) { disposeTree(world.group); return; }
      }
      const line = planFlight(world.nav, (a, b) => {
        const k = keyOf(a, b);
        if (!memo.has(k)) memo.set(k, world.findPath(a, b));
        return memo.get(k)!;
      }, stops);
      if (!line) {
        disposeTree(world.group);
        return; // kein brauchbarer Weg → Key-Art bleibt
      }
      this.show3d(world, new FlightPath(line));
    } catch (e) {
      console.warn('[menu] 3D-Hintergrund nicht verfügbar, Key-Art bleibt', e);
      this.releaseWorld();
    }
  }

  private show3d(world: World, path: FlightPath): void {
    const ctx = this.context;
    this.world = world;
    const env = world.data.env;
    ctx.scene.add(world.group);
    ctx.scene.background = new THREE.Color(env.skyHorizon);
    ctx.scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar);
    ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    ctx.renderer.toneMappingExposure = 1.15;
    this.prevFps = ctx.targetFrameRate;
    ctx.targetFrameRate = MENU_FPS;
    const obj = new THREE.Object3D();
    obj.name = 'menu-flight';
    ctx.scene.add(obj);
    const rig = obj.addComponent(FlightRig);
    rig.path = path;
    rig.paused = this.paused;
    this.rigObj = obj;
    this.rig = rig;
    this.root?.classList.add('mm-3d');
    this.art.setPaused(true); // Key-Art blendet aus und rechnet nicht weiter
  }

  private hide3d(): void {
    this.releaseWorld();
    this.art.setPaused(this.paused);
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Geometrien und Materialien eines Baums freigeben (Texturen bleiben im geteilten Cache). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose();
    m.geometry?.dispose?.();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  });
}
