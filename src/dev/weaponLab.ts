import * as THREE from 'three';
import { Soldier } from '../entities/Soldier';
import { weaponGeom } from '../logic/weaponGeom';
import { DroppedView } from '../weapons/DroppedView';
import { MODEL_IDS, buildViewWeapon } from '../weapons/models';

/**
 * Waffen-Labor (nur Entwicklung, `weapon-lab.html`): rendert ALLE Waffen in einem Raster, je Zelle
 * eine eigene Kamera. Ansichten per URL:
 *   ?view=soldier  Soldat mit Waffe (az = Blickwinkel, 90 = von rechts, 0 = von vorn; el = Höhe in Grad)
 *   ?view=dropped  liegende Waffe auf dem Boden (az/el wie oben)
 *   ?view=spec     Seitenansicht des Viewmodels (Maßstab einheitlich) mit Metadaten-Markern + Lineal
 *   ?team=T|CT  ?cols=6  ?only=ak47,glock
 * Die Screenshot-Automatik steht in scripts/weapon-lab.mjs, die Kontaktbögen in scripts/weapon-contact.py.
 */
const q = new URL(location.href).searchParams;
const view = q.get('view') ?? 'soldier';
const az = (Number(q.get('az') ?? 90) * Math.PI) / 180;
const el = (Number(q.get('el') ?? 8) * Math.PI) / 180;
const team = q.get('team') === 'CT' ? 'CT' : 'T';
const cols = Number(q.get('cols') ?? 6);
const only = q.get('only')?.split(',');
const ids = (only ?? [...MODEL_IDS]).filter((id) => MODEL_IDS.includes(id));
const CW = Number(q.get('cw') ?? 320);
const CH = Number(q.get('ch') ?? 300);
const rows = Math.ceil(ids.length / cols);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(cols * CW, rows * CH);
renderer.setPixelRatio(1);
renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.style.margin = '0';
document.body.style.background = '#6c747c';
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7d858d);
scene.add(new THREE.HemisphereLight(0xffffff, 0x555a60, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, -4);
scene.add(sun);
const sun2 = new THREE.DirectionalLight(0xbfd0ff, 0.8);
sun2.position.set(-4, 3, 5);
scene.add(sun2);

type Cell = { cam: THREE.Camera; label: string };
const cells: Cell[] = [];
const GAP = 6;

function addFloor(cx: number, cz: number, size = 4): void {
  const g = new THREE.GridHelper(size, size * 5, 0x20262c, 0x4c545c);
  g.position.set(cx, 0.0005, cz);
  scene.add(g);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x8b9298, roughness: 1 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(cx, 0, cz);
  scene.add(plane);
}

function orbitCam(target: THREE.Vector3, dist: number, fov: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fov, CW / CH, Math.max(0.05, dist - 1.6), dist + 1.6); // Nachbarzellen ausblenden
  cam.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z - Math.cos(az) * Math.cos(el) * dist);
  cam.lookAt(target);
  return cam;
}

ids.forEach((id, i) => {
  const x = (i % cols) * GAP;
  const z = Math.floor(i / cols) * GAP;
  if (view === 'soldier') {
    addFloor(x, z, 3);
    const s = new Soldier('lab' + i, id, i % 2 === 0 ? team : team === 'T' ? 'CT' : 'T');
    s.setWeapon(id);
    s.setPose({ x, y: 0, z, yaw: 0, pitch: 0 });
    scene.add(s.root);
    s.root.updateMatrixWorld(true);
    cells.push({ cam: orbitCam(new THREE.Vector3(x, 1.15, z), 3.1, 30), label: id });
  } else if (view === 'dropped') {
    addFloor(x, z, 2);
    const d = new DroppedView();
    d.add(1, id, x, 0, z);
    scene.add(d.root);
    cells.push({ cam: orbitCam(new THREE.Vector3(x, 0.08, z), 1.5, 30), label: id });
  } else {
    specCell(id, x, z);
  }
});

/** Viewmodel-Seitenansicht (orthografisch von rechts, Lauf nach rechts) mit Markern und Lineal. */
function specCell(id: string, x: number, z: number): void {
  const v = buildViewWeapon(id);
  if (!v) return;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(v.root);
  scene.add(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(v.root).translate(new THREE.Vector3(-x, 0, -z)); // lokal zur Zelle
  const colors: Record<string, number> = { muzzle: 0xff3030, muzzle2: 0xff3030, gripR: 0x30ff30, gripL: 0x3080ff, port: 0xffe030, magHold: 0xff30ff, chargeL: 0x30ffff, boltR: 0xff9030, keypad: 0xffffff, sightRear: 0xffffff, sightFront: 0xffffff };
  for (const [name, node] of Object.entries(v.anchors)) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: colors[name] ?? 0xffffff, depthTest: false }));
    m.renderOrder = 10;
    node!.getWorldPosition(m.position);
    m.position.add(new THREE.Vector3(0.05, 0, 0)); // vor die Waffe holen
    g.worldToLocal(m.position);
    g.add(m);
  }
  // Tabellen-Punkte (Kimme/Korn weiß, Schaftkappe orange) + Laufachse (rot) und Sichtlinie (weiß)
  const tg = weaponGeom(id);
  if (tg) {
    const dot = (p: readonly [number, number, number], color: number): void => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      m.renderOrder = 10;
      m.position.set(0.06, p[1], -p[2]);
      g.add(m);
    };
    const line = (a: readonly [number, number, number], b: readonly [number, number, number], color: number): void => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.06, a[1], -a[2]), new THREE.Vector3(0.06, b[1], -b[2])]);
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
      l.renderOrder = 9;
      g.add(l);
    };
    if (tg.sightRear && tg.sightFront) { dot(tg.sightRear, 0xffffff); dot(tg.sightFront, 0xffffff); line(tg.sightRear, tg.sightFront, 0xffffff); }
    if (tg.butt) dot(tg.butt, 0xff9030);
    line([0, tg.muzzle[1], (tg.butt ?? [0, 0, -0.1])[2]], tg.muzzle, 0xff3030);
  }
  // Lineal: 10-cm-Striche entlang z (Ursprung = Griff), unterhalb der Waffe
  const pts: number[] = [];
  const yR = box.min.y - 0.05;
  const z0 = Math.ceil((box.min.z * 10) - 1e-6) / 10;
  for (let zz = z0; zz <= box.max.z + 1e-6; zz += 0.1) {
    const big = Math.abs(Math.round(zz * 10) % 5) === 0;
    pts.push(0.06, yR, zz, 0.06, yR + (big ? 0.025 : 0.012), zz);
  }
  pts.push(0.06, yR, box.min.z, 0.06, yR, box.max.z);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const ruler = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x101418 }));
  g.add(ruler);
  const len = box.max.z - box.min.z;
  const half = Math.max(0.16, (len / 2) * 1.12, ((box.max.y - box.min.y) / 2) * 1.2 * (CW / CH)); // fit
  const cam = new THREE.OrthographicCamera(-half, half, (half * CH) / CW, -(half * CH) / CW, 2.5, 3.5);
  const cz = (box.min.z + box.max.z) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  cam.position.set(x + 3, cy, z + cz);
  cam.lookAt(x, cy, z + cz);
  cells.push({ cam, label: `${id}  L=${len.toFixed(3)} m` });
}

const labels = document.createElement('div');
document.body.appendChild(labels);
cells.forEach((c, i) => {
  const d = document.createElement('div');
  d.textContent = c.label;
  Object.assign(d.style, {
    position: 'absolute', left: `${(i % cols) * CW + 6}px`, top: `${Math.floor(i / cols) * CH + 4}px`,
    font: 'bold 13px monospace', color: '#fff', textShadow: '0 0 3px #000, 0 0 3px #000',
  });
  labels.appendChild(d);
});

function renderAll(): void {
  cells.forEach((c, i) => {
    const cx = (i % cols) * CW;
    const cy = (rows - 1 - Math.floor(i / cols)) * CH;
    renderer.setViewport(cx, cy, CW, CH);
    renderer.setScissor(cx, cy, CW, CH);
    renderer.render(scene, c.cam);
  });
}
renderAll();
requestAnimationFrame(() => {
  renderAll();
  (globalThis as Record<string, unknown>).__labReady = true;
});
