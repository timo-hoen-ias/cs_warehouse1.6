import { onStart } from '@needle-tools/engine';
import * as THREE from 'three';
import type { LevelFile } from './shared/level';
import levelData from '../levels/de-demo.json';
import { buildLevelView } from './level/LevelView';
import { FpsPlayer } from './player/FpsPlayer';
import { Shooter } from './weapons/Shooter';
import { ViewModel } from './weapons/ViewModel';
import { Fx } from './weapons/Fx';
import { TargetDummy } from './entities/TargetDummy';
import { GameMode } from './game/GameMode';
import { Hud } from './ui/Hud';
import { Bot } from './multi/Bot';
import { BotBrain } from './multi/BotBrain';
import { buildWaypoints } from './logic/waypoints';
import { WEAPONS } from './logic/weapons';

const level = levelData as unknown as LevelFile;

/**
 * Spiel-Start: Level + Licht, Ego-Player + Shooter (M0/M1).
 * M2: GameMode treibt Runde/Bombe/Economy; CT-Ziele stehen zwischen den Zonen.
 */
onStart((context) => {
  const scene = context.scene;

  scene.background = new THREE.Color(0x15181d);
  scene.fog = new THREE.Fog(0x15181d, 60, 180);

  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x40301a, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.4);
  sun.position.set(30, 50, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  // Schatten rendern (Wände/Regale werfen, Waffen-Viewmodel empfängt).
  context.renderer.shadowMap.enabled = true;
  context.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Level als Sicht- + Kollisionsgeometrie
  const { group, solids } = buildLevelView(level);
  scene.add(group);

  // Bombenspots sichtbar markieren (Ring am Boden)
  for (const [key, v] of Object.entries({ A: level.zones.a, B: level.zones.b }) as [string, [number, number, number]][]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.6, 40),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xff5555 : 0xffaa33, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(v[0], 0.02, v[2]);
    scene.add(ring);
    const label = document.createElement('div');
    void label;
  }

  // Kamera
  const cam = context.mainCamera as THREE.PerspectiveCamera;
  cam.rotation.order = 'YXZ';
  cam.far = 250;
  cam.near = 0.05;

  // HUD zuerst (wird von Effekten/Shooter gebraucht)
  const hud = new Hud();
  hud.mount();

  // Player + Shooter an gemeinsames GameObject
  const playerRoot = new THREE.Object3D();
  scene.add(playerRoot);
  const player = playerRoot.addComponent(FpsPlayer);
  player.solids = solids;
  const shooter = playerRoot.addComponent(Shooter);
  shooter.solids = solids;
  shooter.player = player;
  shooter.onHud = (s) => hud.update(s);

  // Effekte + Waffen-Viewmodel (Kamera-Kind)
  const fx = playerRoot.addComponent(Fx);
  const viewModel = playerRoot.addComponent(ViewModel);
  viewModel.solids = solids;
  shooter.fx = fx;
  shooter.viewModel = viewModel;
  fx.onHitmarker = (killed) => hud.hitmarker(killed);
  shooter.setWeapon('glock');

  // GameMode
  const game = playerRoot.addComponent(GameMode);
  game.player = player;
  game.hud = hud;
  game.bombSpots = { a: { x: level.zones.a[0], z: level.zones.a[2] }, b: { x: level.zones.b[0], z: level.zones.b[2] } };
  game.onRoundHud = (h) => hud.setRound(h);

  // T-Zone als Spawn
  const t = level.zones.t;
  game.setSpawn(t[0], t[2], Math.atan2(-(0 - t[0]), -(0 - t[2])));

  // CT-Bots als Spot-Wachen (Ziel = jeweiliger Spot verteidigen)
  const bots: Bot[] = [];
  const botBrain = playerRoot.addComponent(BotBrain);
  botBrain.solids = solids;
  botBrain.player = player;
  botBrain.waypoints = buildWaypoints(level.lager);
  const guardSpots: [number, number][] = [
    [level.zones.a[0] + 3, level.zones.a[2] + 3],
    [level.zones.b[0] - 3, level.zones.b[2] + 3],
    [level.zones.ct[0] * 0.5, level.zones.ct[2] * 0.5],
  ];
  const botGoals: [number, number][] = [
    [level.zones.a[0], level.zones.a[2]],
    [level.zones.b[0], level.zones.b[2]],
    [(level.zones.a[0] + level.zones.b[0]) / 2, (level.zones.a[2] + level.zones.b[2]) / 2],
  ];
  for (let i = 0; i < guardSpots.length; i++) {
    const b = new Bot();
    b.setPosition(guardSpots[i][0], guardSpots[i][1]);
    b.goal = { x: botGoals[i][0], z: botGoals[i][1] };
    b.addTo(scene);
    botBrain.addBot(b);
    bots.push(b);
  }
  game.aliveSource = () => ({ T: player.dead ? 0 : 1, CT: botBrain.aliveCount() });
  game.onNewRound = () => {
    for (let i = 0; i < bots.length; i++) {
      bots[i]!.setPosition(guardSpots[i]![0], guardSpots[i]![1]);
      bots[i]!.goal = { x: botGoals[i]![0], z: botGoals[i]![1] };
    }
  };

  // Zwei Smoke-Puppen nahe dem T-Spawn (deterministischer Schusstest, keine Team-Mitglieder)
  const zielStart = level.zones.ct;
  const dummies: TargetDummy[] = [];
  {
    const dx = zielStart[0] - t[0];
    const dz = zielStart[2] - t[2];
    const len = Math.hypot(dx, dz);
    const spots: [number, number][] = [];
    if (len > 5) {
      for (let i = 1; i <= 2; i++) {
        const f = Math.min(0.6, i * 0.15);
        spots.push([t[0] + dx * f, t[2] + dz * f]);
      }
    }
    if (spots.length < 2) for (let i = 0; i < 2; i++) spots.push([t[0] + 6 + i * 3, t[2] + 8]);
    for (const [x, z] of spots.slice(0, 2)) {
      const d = new TargetDummy();
      d.setPosition(x, z);
      d.addTo(scene);
      dummies.push(d);
    }
  }

  // Debug-Hook für Smoke-Tests/Inspektion (nur in dev aktiv)
  if (import.meta.env?.DEV) {
    const ctx = globalThis as Record<string, unknown>;
    ctx.__csw = {
      solids: solids.length,
      hasCam: !!context.mainCamera,
      rendererEl: !!context.renderer?.domElement,
      canvasConnected: !!context.renderer?.domElement?.isConnected,
      engineChildren: document.querySelector('needle-engine')?.children.length ?? -1,
      sceneChildren: context.scene.children.length,
      dummies: dummies.length,
    };
    ctx.__fx = () => fx.fxCount();
    ctx.__fxWall = () => fx.wallDecals;
    ctx.__decals = () => fx.decalStats();
    ctx.__vm = () => ({ loaded: viewModel.hasModel(), meshes: viewModel.meshCount(), verts: viewModel.vertexCount() });
    ctx.__vmAim = () => {
      // Mündung in KAMERA-Koordinaten: vorne = -z (Blickrichtung), y relativ Auge.
      const cam = context.mainCamera as THREE.PerspectiveCamera;
      const world = viewModel.muzzleWorld(new THREE.Vector3());
      const rel = world.clone().sub(cam.getWorldPosition(new THREE.Vector3())).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()).invert());
      return { x: +rel.x.toFixed(2), y: +rel.y.toFixed(2), z: +rel.z.toFixed(2) };
    };    ctx.__switch = (slot: number) => {
      shooter.selectSlot(slot);
      return { weapon: shooter.weaponId };
    };
    ctx.__frames = () => {
      const info = context.renderer?.info?.render;
      return info ? { calls: info.calls, triangles: info.triangles } : null;
    };
    ctx.__pos = () => (player ? { x: +player.motionX().toFixed(2), z: +player.motionZ().toFixed(2), yaw: +player.yawNow().toFixed(2) } : null);
    ctx.__round = () => ({
      phase: game.round.phase,
      timer: Math.ceil(game.round.timer),
      score: `${game.round.tRounds}:${game.round.ctRounds}`,
      bomb: game.round.bomb.phase,
      fuseLeft: +game.round.bomb.fuseLeft.toFixed(1),
      round: game.round.round,
      money: game.money.amount,
    });
    ctx.__aliveCts = () => botBrain.aliveCount();
    ctx.__killBots = () => {
      // Simuliert Eliminierung aller CT (Runden-Logik-Test; Schussphysik separat getestet)
      for (const b of bots) b.takeHit('body', WEAPONS['awp']!);
      return { ok: true };
    };
    ctx.__wallShot = () => {
      // Deterministisch: an die Ostwand stellen, leicht nach oben zielen, damit
      // keine Bots/Puppen im Strahl liegen → sicherer Wand-Treffer (Decal).
      const wall = solids.find((s) => s.kind === 'wall' && s.label === 'wand-ost');
      if (!wall) return { error: 'wand-ost fehlt' };
      const sx = wall.minX - 3; // 3 m vor der Wandinnenkante
      const sz = (wall.minZ + wall.maxZ) / 2;
      player.hp = 100;
      player.spawn(sx, sz, -Math.PI / 2); // blickt +x (zur Ostwand)
      player.setLook(-Math.PI / 2, 0.35); // leicht nach oben → über Zielen
      shooter.setWeapon('usp');
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 60);
      }, 120);
      return { ok: true };
    };
    ctx.__plantTest = () => {
      // Bomben-Smoke: nur in live pflanzbar. Auf Spot A teleportieren + E halten.
      if (game.round.phase !== 'live') return { error: 'phase: ' + game.round.phase };
      const a = level.zones.a;
      player.hp = 100;
      player.spawn(a[0], a[2], Math.atan2(-(0 - a[0]), -(0 - a[2])));
      const keyDown = () => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
      const keyUp = () => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
      setTimeout(keyDown, 100);
      setTimeout(keyUp, 5000);
      return { ok: true };
    };
    ctx.__dummyHp = () => dummies.map((d) => d.health.hp);
    ctx.__shooterState = () => ({ weapon: shooter.weaponId, mag: shooter.magNow() });
    ctx.__aimShoot = (i: number) => {
      const d = dummies[i];
      if (!d || !d.health.alive) return { error: 'kein Ziel oder bereits tot' };
      // Deterministisch: Spieler an die T-Zone setzen, dann zielen.
      const t0 = level.zones.t;
      player.hp = 100;
      player.spawn(t0[0], t0[2], 0);
      shooter.setWeapon('awp');
      const px = player.motionX();
      const pz = player.motionZ();
      const eyeY = 1.65;
      const boxes = d.partBoxes();
      const body = boxes.find((b) => b.part === 'body')!;
      const tx = (body.box.minX + body.box.maxX) / 2;
      const ty = (body.box.minY + body.box.maxY) / 2;
      const tz = (body.box.minZ + body.box.maxZ) / 2;
      const dx = tx - px;
      const dz = tz - pz;
      const dist = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.asin((ty - eyeY) / dist);
      player.setLook(yaw, pitch);
      const fire = () => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 60);
      };
      setTimeout(fire, 300);
      return { ok: true, dist: +dist.toFixed(2) };
    };
  }

  // Hinweis
  const hint = document.createElement('div');
  Object.assign(hint.style, {
    position: 'fixed',
    top: '44px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#dfe6ee',
    font: '12px Consolas, monospace',
    background: 'rgba(10,13,18,.6)',
    padding: '4px 12px',
    borderRadius: '6px',
    pointerEvents: 'none',
    zIndex: '20',
  });
  hint.textContent = 'Klick = Maus frei · links schießen · R nachladen · ohne Lock: rechte Taste halten zum Umschauen · WASD · Shift · Leertaste';
  document.body.appendChild(hint);
  document.addEventListener('pointerlockchange', () => {
    hint.style.display = document.pointerLockElement ? 'none' : 'block';
  });
});
