import { onStart, type Context } from '@needle-tools/engine';
import * as THREE from 'three';
import type { LevelFile } from './shared/level';
import { World } from './game/World';
import { FpsPlayer } from './player/FpsPlayer';
import { Shooter } from './weapons/Shooter';
import { ViewModel } from './weapons/ViewModel';
import { Fx } from './weapons/Fx';
import { Grenades } from './weapons/Grenades';
import { MatchDriver } from './game/MatchDriver';
import { Hud } from './ui/Hud';
import { showMainMenu } from './ui/MainMenu';
import { LobbyOverlay } from './ui/LobbyOverlay';
import { LocalTransport, NeedleTransport, type NetTransport } from './multi/Transport';
import { ServerAnnouncer } from './multi/Discovery';
import { Sfx } from './audio/Sfx';
import { mapById } from './logic/maps';
import { SettingsMenu } from './ui/SettingsMenu';
import { setupLighting } from './level/Lighting';
import type { Settings } from './logic/settings';
import { WEAPONS } from './logic/weapons';
import { parseLaunch, roomLink, type GameSetup } from './logic/menu';
import { kickReasonText, passwordDigest, type LobbyConfig } from './logic/lobby';
import { GAME_VERSION, type Heartbeat } from './logic/serverList';

/** Karten lazy laden (Vite bündelt jede als eigenes Chunk). */
const LEVELS = import.meta.glob<{ default: LevelFile }>('../levels/*.json');

async function loadLevel(mapId: string): Promise<LevelFile> {
  const key = `../levels/${mapId}.json`;
  const loader = LEVELS[key] ?? LEVELS[`../levels/${mapById(mapId).id}.json`];
  if (!loader) throw new Error(`Karte fehlt: ${mapId}`);
  return (await loader()).default;
}

const MSG_KEY = 'csw16.menuMessage';

/** Einmalige Meldung fürs Menü (z. B. nach einem Kick), über sessionStorage weitergereicht. */
function takeMenuMessage(): string | null {
  try {
    const m = sessionStorage.getItem(MSG_KEY);
    if (m) sessionStorage.removeItem(MSG_KEY);
    return m;
  } catch {
    return null;
  }
}

/**
 * Spiel-Start: Hauptmenü → Karte laden → Welt + Spieler + Driver. Offline = lokaler
 * Host mit Bots; online = Needle-Raum (Host = Dienstältester im Raum).
 * `?auto=1` überspringt das Menü (Smoke-/Netztests), `?room=CODE` öffnet die Einladung.
 */
onStart(async (context) => {
  const scene = context.scene;
  scene.background = new THREE.Color(0x0e1014);
  // Grafikstufe: ?quality=low (schwache Rechner/Software-Rendering) → keine Schatten, kleinere Auflösung
  const quality = new URL(window.location.href).searchParams.get('quality') === 'low' ? 'low' : 'high';
  graphicsQuality = quality;
  if (quality === 'low') context.renderer.setPixelRatio(0.6);

  const cam = context.mainCamera as THREE.PerspectiveCamera;
  cam.rotation.order = 'YXZ';
  cam.far = 250;
  cam.near = 0.05;

  const launch = parseLaunch(window.location.search, mapById(undefined).id);
  const setup: GameSetup = launch.auto ?? await showMainMenu({ store: safeStorage(), launch, quality, message: takeMenuMessage() });

  const level = await loadLevel(setup.mapId);
  await startGame(context, level, setup);
});

/** localStorage, falls verfügbar (privater Modus/blockiert → null). */
function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let settingsMenuOpen: () => boolean = () => false;
let graphicsQuality: 'high' | 'low' = 'high';

/** Zurück ins Hauptmenü (Seite ohne Spiel-Parameter neu laden), optional mit Meldung/Einladung. */
function backToMenu(message?: string, keepInvite = false): void {
  const u = new URL(window.location.href);
  for (const k of ['auto', 'host', 'pw', 'sname', 'max', 'listed', 'lobby', 'fill', 'name', 'team']) u.searchParams.delete(k);
  if (!keepInvite) u.searchParams.delete('room');
  if (message) {
    try { sessionStorage.setItem(MSG_KEY, message); } catch { /* egal */ }
  }
  window.location.href = u.href;
}

async function startGame(context: Context, level: LevelFile, setup: GameSetup): Promise<void> {
  const scene = context.scene;
  const world = new World(level, graphicsQuality);
  setupLighting(scene, context.renderer, world, graphicsQuality);
  scene.add(world.group);

  const sfx = new Sfx();
  const unlock = (): void => sfx.unlock();
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  const hud = new Hud();
  hud.mount(world.solids);
  hud.setRadarLabel(world.mapName);
  hud.setZones(world.zones);

  const playerRoot = new THREE.Object3D();
  scene.add(playerRoot);
  const player = playerRoot.addComponent(FpsPlayer);
  player.solids = world.solids;
  const shooter = playerRoot.addComponent(Shooter);
  shooter.solids = world.solids;
  shooter.aabbs = world.aabbs;
  shooter.player = player;
  shooter.onHud = (s) => hud.update(s);
  let lobbyOpen = (): boolean => false;
  shooter.menuOpen = () => hud.menuOpen() || settingsMenuOpen() || lobbyOpen();
  shooter.blocked = () => player.isDead() || player.frozen;
  shooter.onShotSfx = (w) => sfx.shot(w, 0);
  shooter.onEmptyClick = () => sfx.play('empty');
  shooter.onReload = () => sfx.play('reload');
  // Einstellungen (O): live auf Spieler, Shooter, HUD und Sound anwenden
  // Overlays im selben Stapelkontext wie das HUD (sonst läge das Fadenkreuz darüber)
  const uiHost = (document.querySelector('needle-engine') as HTMLElement | null) ?? document.body;
  const settingsMenu = new SettingsMenu(safeStorage());
  settingsMenu.mount(uiHost);
  let hudMenu = false;
  const syncInput = (): void => { player.inputEnabled = !hudMenu && !settingsMenu.isOpen() && !lobbyOpen(); };
  hud.onMenuChange = (open) => { hudMenu = open; syncInput(); };
  settingsMenu.onOpenChange = () => syncInput();
  settingsMenu.onLeave = () => backToMenu();
  const applySettings = (st: Settings): void => {
    player.sensitivity = st.sensitivity;
    player.invertY = st.invertY;
    player.bobbing = st.bobbing;
    shooter.baseFov = st.fov;
    sfx.setVolume(st.volume);
    hud.setCrosshair(st.crosshairColor, st.crosshairStyle, st.crosshairSize, st.crosshairGap, st.crosshairThickness, st.crosshairDynamic);
    hud.setScale(st.hudScale);
    hud.showFps(st.showFps);
  };
  settingsMenu.onChange = applySettings;
  settingsMenuOpen = () => settingsMenu.isOpen();
  applySettings(settingsMenu.settings);
  shooter.onZoom = (level) => hud.setScope(level > 0);

  const fx = playerRoot.addComponent(Fx);
  const viewModel = playerRoot.addComponent(ViewModel);
  viewModel.solids = world.solids;
  shooter.fx = fx;
  shooter.viewModel = viewModel;
  const grenades = playerRoot.addComponent(Grenades);
  grenades.fx = fx;

  let net: NetTransport;
  if (setup.mode === 'offline') net = new LocalTransport();
  else net = new NeedleTransport(context, `csw16-${setup.room}`, setup.server || undefined);

  // Server-Konfiguration (nur der Ersteller; Beitretende übernehmen sie per Snapshot)
  const mapId = mapById(setup.mapId).id;
  const lobbyCfg: LobbyConfig | null = setup.mode === 'host'
    ? { name: setup.serverName, maxPlayers: setup.maxPlayers, pw: passwordDigest(setup.room, setup.password), listed: setup.listed, hold: setup.lobby }
    : null;

  const driver = playerRoot.addComponent(MatchDriver);
  driver.world = world;
  driver.net = net;
  driver.player = player;
  driver.shooter = shooter;
  driver.hud = hud;
  driver.grenades = grenades;
  driver.sfx = sfx;
  driver.options = {
    localName: setup.name, team: setup.team, fillTo: setup.fillTo, botSkill: setup.botSkill,
    lobby: lobbyCfg,
    passwordDigest: setup.mode === 'join' && setup.password ? passwordDigest(setup.room, setup.password) : null,
  };
  driver.onKicked = (reason) => backToMenu(kickReasonText(reason), true);
  shooter.loadout = () => driver.local?.loadout;

  // Startposition bis zum ersten Spawn
  const t = world.spawnPose('T', 0);
  player.spawn(t.x, t.z, t.yaw);
  shooter.setWeapon('knife');

  // HUD-Overlay-Tick
  const ticker = playerRoot.addComponent(HudTicker);
  ticker.hud = hud;

  if (setup.mode !== 'offline') {
    const link = roomLink(window.location.href, setup.room, mapId, setup.server);
    hud.notice(`Raumcode ${setup.room} — Einladungslink in der Lobby/Adressleiste`);
    if (!new URL(window.location.href).searchParams.get('auto')) history.replaceState(null, '', link);
    hud.setNetInfo(`Verbinde mit Raum ${setup.room}…`);

    // Serverlobby (gehaltenes Aufwärmen bis „Spiel starten“)
    const lobby = new LobbyOverlay(setup.room, link);
    lobby.mount(uiHost);
    lobby.onStart = () => driver.startMatch();
    lobby.onTeam = (team) => driver.requestTeam(team);
    lobby.onChat = (text) => driver.sendChat(text, false);
    lobby.onLeave = () => backToMenu();
    lobby.onOpenChange = () => syncInput();
    lobbyOpen = () => lobby.isOpen();
    ticker.lobby = () => {
      const cfg = driver.lobbyConfig;
      lobby.update({
        active: driver.lobbyHeld,
        isHost: driver.isHost,
        hostId: net.hostId,
        localId: net.id,
        players: Object.values(driver.match.players).map((p) => ({ id: p.id, name: p.name, team: p.team, bot: p.bot })),
        chat: driver.chatHistory,
        maxPlayers: cfg?.maxPlayers ?? setup.maxPlayers,
        serverName: cfg?.name ?? `Raum ${setup.room}`,
        hasPassword: !!cfg?.pw,
      });
    };

    // Serverbrowser: Host meldet sich im Discovery-Raum (eigene WebSocket-Verbindung)
    const heartbeat = (): Heartbeat | null => {
      const cfg = driver.lobbyConfig;
      if (!driver.isHost || !cfg?.listed || !net.id) return null;
      const m = driver.match;
      const all = Object.values(m.players);
      return {
        room: setup.room, name: cfg.name, map: mapId,
        players: all.filter((p) => !p.bot).length, maxPlayers: cfg.maxPlayers, bots: all.filter((p) => p.bot).length,
        phase: driver.lobbyHeld ? 'lobby' : m.winner ? 'ended' : m.round.phase,
        round: m.round.round, score: [m.round.tRounds, m.round.ctRounds], hasPassword: !!cfg.pw, version: GAME_VERSION,
      };
    };
    const announcer = new ServerAnnouncer(setup.server, heartbeat);
    announcer.start();
    window.addEventListener('pagehide', () => announcer.stop());
  }

  // Debug-Hooks (Smoke-Tests, DevTools)
  if (import.meta.env?.DEV) {
    const g = globalThis as Record<string, unknown>;
    g.__csw = {
      solids: world.solids.length,
      hasCam: !!context.mainCamera,
      sceneChildren: scene.children.length,
      map: world.mapName,
    };
    g.__frames = () => {
      const info = context.renderer?.info?.render;
      return info ? { calls: info.calls, triangles: info.triangles } : null;
    };
    g.__state = () => driver.debugState();
    g.__players = () => Object.values(driver.match.players).map((p) => ({ id: p.id, name: p.name, team: p.team, bot: p.bot, hp: p.hp, alive: p.alive }));
    g.__playerPose = (id: string) => { const p = driver.match.players[id]; return p ? { x: +p.pose.x.toFixed(2), z: +p.pose.z.toFixed(2) } : null; };
    g.__netId = () => ({ id: net.id, host: net.hostId, peers: [...net.peers], online: net.online });
    g.__bots = () => driver.debugBotPos();
    g.__pos = () => ({ x: +player.motionX().toFixed(2), z: +player.motionZ().toFixed(2), yaw: +player.yawNow().toFixed(2), hp: player.hp, dead: player.isDead() });
    g.__killTeam = (team: 'T' | 'CT') => { driver.debugKillTeam(team); return driver.debugState(); };
    g.__buy = (item: string) => { driver.requestBuy(item); return driver.local?.loadout; };
    g.__switch = (slot: number) => { shooter.selectSlot(slot); return { weapon: shooter.weaponId }; };
    g.__weapon = (id: string) => { shooter.setWeapon(id); return { weapon: shooter.weaponId }; };
    g.__vm = () => ({ loaded: viewModel.hasModel(), meshes: viewModel.meshCount(), verts: viewModel.vertexCount() });
    g.__vmAim = () => {
      const c = context.mainCamera as THREE.PerspectiveCamera;
      const w = viewModel.muzzleWorld(new THREE.Vector3());
      const rel = w.clone().sub(c.getWorldPosition(new THREE.Vector3())).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()).invert());
      return { x: +rel.x.toFixed(2), y: +rel.y.toFixed(2), z: +rel.z.toFixed(2) };
    };
    g.__decals = () => fx.decalStats();
    g.__fxWall = () => fx.wallDecals;
    g.__nades = () => grenades.count();
    g.__teleport = (x: number, z: number, yaw = 0) => { driver.debugTeleport(x, z, yaw); return g.__pos; };
    g.__zones = () => world.zones;
    g.__aimAtBot = (botsOnly = false) => {
      // Deterministisch auf den nächsten lebenden Gegner zielen (Körpermitte, 4 m) und mit der Pistole schießen
      const me = driver.local;
      const enemies = Object.values(driver.match.players).filter((p) => p.alive && p.team !== me?.team && (!botsOnly || p.bot));
      if (!enemies.length || !me) return { error: 'kein Gegner' };
      const e = enemies[0]!;
      driver.botsPaused = true;
      setTimeout(() => { driver.botsPaused = false; }, 2500);
      const px = e.pose.x - 4;
      const pz = e.pose.z;
      driver.debugRevive();
      player.spawn(px, pz, 0);
      const dx = e.pose.x - px;
      const dz = e.pose.z - pz;
      const dist = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.asin((1.0 - 1.65) / dist);
      player.setLook(yaw, pitch);
      shooter.setWeapon(me.loadout.secondary ?? 'knife');
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 60);
      }, 700);
      return { ok: true, target: e.id, hp: e.hp, dist: +dist.toFixed(2), weapon: shooter.weaponId };
    };
    g.__counters = () => driver.debugCounters();
    g.__platforms = () => world.solids.filter((s) => s.kind === 'platform' || s.kind === 'dock').map((s) => ({ kind: s.kind, minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, maxY: s.maxY }));
    g.__look = (yaw: number, pitch: number) => { player.setLook(yaw, pitch); return true; };
    g.__cam = () => { const c = context.mainCamera!; return { rx: +c.rotation.x.toFixed(3), ry: +c.rotation.y.toFixed(3), rz: +c.rotation.z.toFixed(3), y: +c.position.y.toFixed(2), order: c.rotation.order }; };
    g.__pauseBots = (ms = 3000) => { driver.botsPaused = true; setTimeout(() => { driver.botsPaused = false; }, ms); return true; };
    g.__reviveId = (id: string) => driver.debugReviveId(id);
    g.__enemyHp = () => Object.values(driver.match.players).filter((p) => p.team !== driver.local?.team).map((p) => ({ id: p.id, hp: p.hp, alive: p.alive }));
    g.__wallShot = () => {
      const wall = world.solids.find((s) => s.kind === 'wall' && s.label === 'wand-ost');
      if (!wall) return { error: 'wand-ost fehlt' };
      driver.debugRevive();
      player.spawn(wall.minX - 3, (wall.minZ + wall.maxZ) / 2, -Math.PI / 2);
      player.setLook(-Math.PI / 2, 0.35);
      shooter.setWeapon(driver.local?.loadout.secondary ?? 'glock');
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 60);
      }, 700); // mindestens ein Frame, damit die Kamera am neuen Ort steht
      return { ok: true };
    };
    g.__throwNade = (kind: 'he' | 'flash' | 'smoke') => {
      const me = driver.local;
      if (!me) return { error: 'kein Spieler' };
      me.loadout.grenades[kind] = 1;
      driver.debugRevive();
      const id = ({ he: 'hegrenade', flash: 'flashbang', smoke: 'smokegrenade' } as const)[kind];
      shooter.setWeapon(id);
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 80);
      }, 150);
      return { ok: true, weapon: shooter.weaponId };
    };
    g.__plantTest = () => {
      const me = driver.local;
      if (!me || driver.match.round.phase !== 'live') return { error: 'phase: ' + driver.match.round.phase };
      me.loadout.bomb = true;
      for (const p of Object.values(driver.match.players)) if (p.id !== me.id) p.loadout.bomb = false;
      const a = world.zones.a;
      driver.debugRevive();
      player.spawn(a.x, a.z, 0);
      shooter.setWeapon('c4');
      setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true })), 100);
      setTimeout(() => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true })), 5000);
      return { ok: true };
    };
    g.__weapons = () => Object.keys(WEAPONS);
    g.__zoom = (weapon = 'awp') => {
      const me = driver.local;
      if (me) { me.loadout.primary = weapon; me.loadout.guns[weapon] = { mag: 10, reserve: 30, cooldown: 0, reloadLeft: 0, heat: 0 }; }
      shooter.setWeapon(weapon);
      shooter.setZoom(1);
      const cam = context.mainCamera as THREE.PerspectiveCamera;
      return new Promise((r) => {
        const t0 = performance.now();
        const poll = (): void => {
          if (cam.fov < 45 || performance.now() - t0 > 4000) r({ zoom: shooter.zoomLevel, fov: +cam.fov.toFixed(1), vm: viewModel.isVisible(), weapon: shooter.weaponId });
          else setTimeout(poll, 100);
        };
        poll();
      });
    };
    g.__unzoom = () => { shooter.setZoom(0); return true; };
    g.__lobbyStart = () => driver.startMatch();
    g.__driver = driver;
    g.__lobby = () => ({ held: driver.lobbyHeld, cfg: driver.lobbyConfig, host: driver.isHost });
  }
}

import { Behaviour, registerType } from '@needle-tools/engine';

/** Kleiner Helfer: HUD-Overlays pro Frame abklingen lassen. */
@registerType
class HudTicker extends Behaviour {
  hud!: Hud;
  /** Serverlobby-Anzeige nachführen (nur online). */
  lobby: (() => void) | null = null;
  update(): void {
    this.hud.tick(Math.min(this.context.time.deltaTime, 0.1));
    this.lobby?.();
  }
}
