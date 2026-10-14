import { Behaviour, registerType } from '@needle-tools/engine';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { WEAPONS, type WeaponDef, type WeaponType } from '../logic/weapons';
import { nearestSolidXz, type SolidBox } from '../logic/level';

const BASE_URL = import.meta.env.BASE_URL ?? '/';

/** Absolute asset-Basis (three-URL-Resolving braucht eine gültige Basis-URL). */
function assetBase(): string {
  const root = BASE_URL.startsWith('http') ? BASE_URL : new URL(BASE_URL, window.location.href).href;
  return new URL('assets/weapons/obj/', root).href;
}

/** Ziel-Länge (m) des sichtbaren Modells je Waffentyp (Auto-Fit). */
const TYPE_LEN: Record<WeaponType, number> = {
  knife: 0.3,
  pistol: 0.32,
  smg: 0.45,
  rifle: 0.55,
  sniper: 0.75,
  shotgun: 0.5,
  mg: 0.6,
  grenade: 0.12,
  bomb: 0.25,
};

/**
 * Sway-Parameter (subtiler CS-Light-Stil). Die Waffe zieht bei Kameradrehung
 * minimal nach und federt zur Ruhelage zurück. Vorzeichen ggf. nach Gefühl drehen.
 */
const SWAY_DAMP = 8; // Feder: Rückkehr je Sekunde
const SWAY_TURN_X = 0.105; // seitliche Verschiebung (m) je rad Drehung  (0.3×)
const SWAY_TURN_Y = 0.06; // vertikale Verschiebung (m) je rad Pitch  (0.3×)
const SWAY_TURN_ROT = 0.33; // Lauf-Neigung (rad) je rad Drehung  (0.3×)

/** Nah-Wand-Push: Waffe weicht Wand/Regal/Ecken aus (radiale Clearance). */
const WALL_NEAR = 0.2; // darunter: maximaler Rückzug
const WALL_FAR = 0.8; // ab hier: kein Rückzug
const WALL_DAMP = 16; // Federstärke (1/s)
const WALL_X_PUSH = 0.8; // Anteil, den x zur Kameramitte wandert
const WALL_Z_PUSH = 0.6; // Anteil, den die Tiefe (z) zur Kamera wandert
const WALL_PROBE_FWD = 0.55; // Abtastpunkt vor der Kamera (m)
const WALL_PROBE_X = 0.18; // Abtastpunkt seitlich der Mündung (m)

/**
 * First-Person-Waffenmodell (Viewmodel): Kind der Hauptkamera, unten rechts.
 * Lädt OBJ+MTL (Lauf entlang +X) und dreht den Lauf in Kamerarichtung (-Z),
 * skaliert automatisch auf TYPE_LEN und setzt die Mündung an die Modell-Spitze.
 * Messer/fehlende Modelle → prozeduraler Platzhalter (ebenfalls +X).
 */
@registerType
export class ViewModel extends Behaviour {
  /** Level-Solids (Wände/Regale) für den Nah-Wand-Rückzug. */
  solids: SolidBox[] = [];

  private root = new THREE.Group();
  private current?: WeaponDef;
  private modelNode?: THREE.Object3D;

  /** Aktueller Nah-Wand-Push 0..1, geglättet. */
  private wallNear = 0;
  private readonly tmpEye = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();

  private muzzleAnchor = new THREE.Object3D();
  private recoil = 0;
  private loadSeq = 0;
  /** Sway-Feder (Optik): Kamera-Drehung erzeugt Impuls, Feder zieht zurück. */
  private swayX = 0;
  private swayY = 0;
  private swayRot = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private swayInit = false;
  private swayTime = 0;

  /** Wird gerufen, sobald das Modell der aktiven Waffe geladen ist. */
  onReady?: () => void;

  start(): void {
    const cam = this.context.mainCamera;
    if (!cam) return;
    cam.add(this.root);
    // Kleines Fülllicht an der Kamera: Waffe hat immer Glanzkanten, auch im Schatten.
    this.gunLight = new THREE.PointLight(0xfff1dc, 0.9, 2.5, 1.5);
    this.gunLight.position.set(-0.2, 0.35, 0.1);
    this.root.add(this.gunLight);
  }

  onDestroy(): void {
    this.root.removeFromParent();
    this.disposeModel();
  }

  /** Wechselt das sichtbare Waffenmodell. */
  async show(weaponId: string): Promise<void> {
    const def = WEAPONS[weaponId];
    if (!def) return;
    const seq = ++this.loadSeq;
    this.current = def;
    this.disposeModel();

    const loaded = def.visual.model ? await this.loadModel(def) : this.buildPlaceholder(def);
    if (seq !== this.loadSeq) {
      // inzwischen gewechselt → verwerfen
      loaded?.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      return;
    }
    if (!loaded) return;

    // Waffe soll (Umgebungs-/Licht-)Schatten empfangen — auch prozedurale Modelle.
    // Die Quaternius-MTLs sind fast schwarz (Kd ≈ 0.02): auf lesbare Standard-Materialien
    // mit Metall-Glanz heben, damit Kanten/Lauf im Hallenlicht Kontur bekommen.
    loaded.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const upgraded = mats.map((mat) => {
        const src = mat as THREE.MeshPhongMaterial;
        const c = src.color ? src.color.clone() : new THREE.Color(0x333333);
        const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        if (lum < 0.08) c.setRGB(0.07 + c.r * 2, 0.075 + c.g * 2, 0.085 + c.b * 2);
        const isWood = c.r > c.b * 1.3 && lum > 0.08;
        return new THREE.MeshStandardMaterial({ color: c, metalness: isWood ? 0.1 : 0.6, roughness: isWood ? 0.7 : 0.42 });
      });
      m.material = upgraded.length === 1 ? upgraded[0]! : upgraded;
    });

    // Lokale Bounding-Box im Modellraum MESSEN, bevor wir rotieren/skalieren.
    const box = new THREE.Box3();
    loaded.updateMatrixWorld(true);
    loaded.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) box.expandByObject(m);
    });
    const size = box.getSize(new THREE.Vector3());
    const len = Math.max(size.x, size.y, size.z) || 1;
    const s = (TYPE_LEN[def.type] ?? 0.5) / len;
    this.wallNear = 0;

    // holder: Kameraraum-Offset (unten rechts) + Recoil.
    const holder = new THREE.Group();
    holder.position.set(def.visual.pos.x, def.visual.pos.y, def.visual.pos.z);

    // inner: skaliert das Modell und richtet den Lauf (+X) auf -Z (Kamerarichtung).
    const inner = new THREE.Group();
    inner.scale.setScalar(s);
    inner.rotation.y = Math.PI / 2; // +X → -Z
    inner.add(loaded);

    // Mündung im Modellraum an der Laufspitze (+X); skaliert+rotiert mit inner.
    this.muzzleAnchor.position.set(box.max.x, (box.min.y + box.max.y) / 2, 0);
    inner.add(this.muzzleAnchor);

    holder.add(inner);
    this.root.add(holder);
    this.modelNode = holder;
    this.drawT = 0;
    this.reloadLeft = 0;
    this.onReady?.();
  }

  /** Ein Recoil-Impuls (z. B. nach Schuss): Rückstoß + zufällige Lauf-Rolle. */
  kick(amount: number): void {
    this.recoil = Math.min(0.16, this.recoil + amount);
    this.kickRoll = (Math.random() - 0.5) * amount * 4;
  }

  /** Nachlade-Animation: Waffe kippt nach unten und kommt am Ende zurück. */
  reloadAnim(duration: number): void {
    this.reloadLeft = duration;
    this.reloadTotal = duration;
  }

  private kickRoll = 0;
  private reloadLeft = 0;
  private reloadTotal = 0;
  /** Zieh-Animation beim Wechsel (0..1, 1 = fertig gezogen). */
  private drawT = 1;
  private gunLight?: THREE.PointLight;

  /** true, sobald ein Modell geladen/im Holder hängt. */
  hasModel(): boolean {
    return !!this.modelNode;
  }

  /** Anzahl Mesh-Knoten im aktiven Modell (Debug: 0 = Platzhalter). */
  meshCount(): number {
    let n = 0;
    this.modelNode?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) n++;
    });
    return n;
  }

  /** Gesamt-Vertex-Zahl des aktiven Modells (Debug: unterscheidet OBJ vs. Box). */
  vertexCount(): number {
    let n = 0;
    this.modelNode?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) n += m.geometry.getAttribute('position')?.count ?? 0;
    });
    return n;
  }

  /** Weltposition der Mündung (für Mündungsfeuer/Tracer). */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.muzzleAnchor.getWorldPosition(out);
    return out;
  }

  update(): void {
    const dt = Math.min(this.context.time.deltaTime, 0.05);
    // Recoil federnd zurück (fester Abklang je Sekunde)
    if (this.recoil > 0.0005) {
      const decay = Math.exp(-12 * dt);
      this.recoil *= decay;
      this.kickRoll *= decay;
      if (this.recoil < 0.0005) {
        this.recoil = 0;
        this.kickRoll = 0;
      }
    }
    if (this.drawT < 1) this.drawT = Math.min(1, this.drawT + dt / 0.22);
    if (this.reloadLeft > 0) this.reloadLeft = Math.max(0, this.reloadLeft - dt);

    // Sway: Drehgeschwindigkeit der Kamera lässt die Waffe subtil nachziehen.
    this.swayTime += dt;
    const cam = this.context.mainCamera;
    if (cam) {
      const y = cam.rotation.y;
      const p = cam.rotation.x;
      if (this.swayInit) {
        // Yaw über ±π kurzschlussfrei messen.
        const dy = Math.atan2(Math.sin(y - this.lastYaw), Math.cos(y - this.lastYaw));
        const dp = p - this.lastPitch;
        const damp = Math.exp(-SWAY_DAMP * dt);
        this.swayX = this.swayX * damp - dy * SWAY_TURN_X;
        this.swayY = this.swayY * damp - dp * SWAY_TURN_Y;
        this.swayRot = this.swayRot * damp - dy * SWAY_TURN_ROT;
      } else {
        this.swayInit = true;
      }
      this.lastYaw = y;
      this.lastPitch = p;
    }

    if (this.modelNode) {
      // Kameraraum-Offset (unten rechts) + Recoil + Sway: Waffe stößt zurück,
      // hebt die Mündung (positive rotation.x → Spitze auf -Z kippt nach oben)
      // und schwingt bei Drehungen minimal nach.
      const v = this.current!.visual;
      const breathe = Math.sin(this.swayTime * 1.7) * 0.003; // dezente Atembewegung

      // Nah-Wand-Push: Je näher Wand/Regal am Auge oder Mündungsbereich liegt,
      // desto mehr zieht sich die Waffe zur Kameramitte und nach hinten —
      // deckt Front, seitliches Entlanglaufen und Ecken ab (kein Clipping).
      let push = 0;
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
      const eased = this.wallNear + (push - this.wallNear) * Math.min(1, 1 - Math.exp(-WALL_DAMP * dt));
      this.wallNear = eased;

      // Ziehen: Waffe kommt von unten rechts hoch (ease-out); Nachladen: kippt nach unten (Sinusbogen)
      const draw = 1 - Math.pow(1 - this.drawT, 3);
      const reload = this.reloadTotal > 0 ? Math.sin(Math.PI * Math.min(1, 1 - this.reloadLeft / this.reloadTotal)) * (this.reloadLeft > 0 ? 1 : 0) : 0;
      const x = v.pos.x * (1 - WALL_X_PUSH * eased) + this.swayX + (1 - draw) * 0.12;
      const y = v.pos.y + this.recoil * 0.9 + this.swayY + breathe - (1 - draw) * 0.28 - reload * 0.08;
      const z = v.pos.z * (1 - WALL_Z_PUSH * eased) + this.recoil * 0.9;
      this.modelNode.position.set(x, y, z);
      this.modelNode.rotation.set(this.recoil * 7 - (1 - draw) * 0.7 - reload * 0.55, this.swayRot + (1 - draw) * 0.3, this.recoil * 0.8 + this.kickRoll + reload * 0.25);
    }
  }

  private async loadModel(def: WeaponDef): Promise<THREE.Object3D | null> {
    const base = assetBase();
    const modelUrl = base + def.visual.model + '.obj';
    try {
      // OBJ mit absoluter URL laden — der OBJLoader löst mtllib-Verweise selbst
      // per new URL(mtlfile, url) auf (daher muss url absolut sein).
      const objLoader = new OBJLoader();
      objLoader.setResourcePath(base);
      const obj = await objLoader.loadAsync(modelUrl);
      return obj;
    } catch (err) {
      const e = err as Error;
      console.warn(`[viewmodel] ${def.id}: Modell konnte nicht geladen werden → Platzhalter`, e?.message);
      (globalThis as Record<string, unknown>).__vmError = { msg: e?.message, stack: e?.stack };
      return this.buildPlaceholder(def);
    }
  }

  /**
   * Prozeduraler Ersatz (Messer + Fallback). Lauf entlang +X (nachholder-Rotation
   * zeigt er nach vorn), Größe ~1 Einheit (fitToType skaliert auf TYPE_LEN).
   */
  private buildPlaceholder(def: WeaponDef): THREE.Object3D {
    const g = new THREE.Group();
    if (def.type === 'knife') {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x2a231c, roughness: 0.7 }));
      grip.position.x = 0.32;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.6), new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.9, roughness: 0.25 }));
      blade.position.x = 0.85;
      blade.rotation.z = 0;
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a3228 }));
      pommel.position.x = 0.12;
      g.add(grip, blade, pommel);
      return g;
    }
    // Schusswaffe: Gehäuse + Lauf (Lauf in +X)
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.6, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.06), dark);
    body.position.x = 0.25;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 0.85;
    const grip2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), dark);
    grip2.position.set(0.18, -0.1, 0);
    g.add(body, barrel, grip2);
    return g;
  }

  private disposeModel(): void {
    if (this.modelNode) {
      this.modelNode.removeFromParent();
      this.modelNode.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      this.modelNode = undefined;
    }
    // Mündungsanker vom alten Modell lösen
    this.muzzleAnchor.removeFromParent();
  }
}
