import { onStart, type Context } from '@needle-tools/engine';
import * as THREE from 'three';
import type { MapData } from './logic/mapkit';
import { World } from './game/World';
import { FpsPlayer } from './player/FpsPlayer';
import { Shooter } from './weapons/Shooter';
import { ViewModel } from './weapons/ViewModel';
import { Fx } from './weapons/Fx';
import { Grenades } from './weapons/Grenades';
import { MatchDriver } from './game/MatchDriver';
import { Hud } from './ui/Hud';
import { showMainMenu } from './ui/MainMenu';
import { FlightBackdrop } from './ui/MenuFlight';
import { LobbyOverlay } from './ui/LobbyOverlay';
import { LocalTransport, NeedleTransport, type NetTransport } from './multi/Transport';
import { ServerAnnouncer } from './multi/Discovery';
import { Sfx } from './audio/Sfx';
import { AudioListener } from './audio/AudioListener';
import { connectWorldAudio } from './audio/worldHooks';
import { loadMapData, mapById } from './maps';
import { SettingsMenu } from './ui/SettingsMenu';
import { LevelLighting } from './level/Lighting';
import { yawPitchToDir, dirToYawPitch } from './logic/combat';
import { PLAYER } from './logic/move';
import { explosionLight, flashLight, muzzleLight } from './logic/dynlight';
import type { Settings } from './logic/settings';
import { WEAPONS } from './logic/weapons';
import { parseLaunch, roomLink, type GameSetup } from './logic/menu';
import { kickReasonText, passwordDigest, type LobbyConfig } from './logic/lobby';
import { GAME_VERSION, type Heartbeat } from './logic/serverList';


const MSG_KEY = 'csw16.menuMessage';
/** Wiederbeitritt mit der Karte des Servers (Setup über sessionStorage, einmalig). */
const REJOIN_KEY = 'csw16.rejoin';

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
  const rejoin = takeRejoin();
  let setup: GameSetup;
  if (rejoin) setup = rejoin;
  else if (launch.auto) setup = launch.auto;
  else {
    // 3D-Kameraflug durch die Karte hinter dem Menü (Canvas-Key-Art bleibt Rückfall); `?flight=0` aus, `?flight=1` auch bei ?quality=low
    const flightParam = new URL(window.location.href).searchParams.get('flight');
    const wantFlight = flightParam === '1' || (flightParam !== '0' && quality !== 'low');
    let flight: FlightBackdrop | undefined;
    try {
      if (wantFlight) flight = new FlightBackdrop(context, mapById(undefined).id, quality);
    } catch (e) {
      console.warn('[menu] 3D-Hintergrund nicht verfügbar', e);
    }
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__menu3d = () => ({ active: !!flight?.active, sceneChildren: scene.children.length });
    setup = await showMainMenu({ store: safeStorage(), launch, quality, message: takeMenuMessage(), backdrop: flight });
    // Menü-Welt vor dem Spielstart vollständig entfernen (keine doppelten Szene-Objekte)
    flight?.releaseWorld();
  }

  // Karten sind Code-Module: alle Clients bauen aus der Karten-ID dieselbe Karte
  const level = loadMapData(setup.mapId);
  await startGame(context, level, setup);
});

/**
 * Gespeichertes Setup für den Wiederbeitritt mit der richtigen Karte (einmal lesen, dann löschen).
 * Höchstens ein Versuch je Raum, damit gefälschte Karten-Hinweise keine Neulade-Schleife auslösen.
 */
function takeRejoin(): GameSetup | null {
  try {
    const raw = sessionStorage.getItem(REJOIN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(REJOIN_KEY);
    const s = JSON.parse(raw) as GameSetup;
    if (!s || typeof s !== 'object' || s.mode !== 'join' || typeof s.room !== 'string' || typeof s.mapId !== 'string' || mapById(s.mapId).id !== s.mapId) return null;
    return s;
  } catch {
    return null;
  }
}

/** Server spielt eine andere (registrierte) Karte: Setup mit dieser Karte merken und neu laden. */
function rejoinWithMap(setup: GameSetup, mapId: string): void {
  if (mapById(mapId).id !== mapId || mapId === setup.mapId) return;
  const u = new URL(window.location.href);
  if (u.searchParams.get('rejoined') === setup.room) {
    backToMenu('Der Server spielt eine andere Karte — Beitritt abgebrochen', true);
    return;
  }
  try { sessionStorage.setItem(REJOIN_KEY, JSON.stringify({ ...setup, mapId })); } catch { /* egal */ }
  u.searchParams.set('map', mapId);
  u.searchParams.set('rejoined', setup.room);
  window.location.href = u.href;
}

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
  for (const k of ['auto', 'host', 'pw', 'sname', 'max', 'listed', 'lobby', 'fill', 'name', 'team', 'rejoined']) u.searchParams.delete(k);
  if (!keepInvite) u.searchParams.delete('room');
  if (message) {
    try { sessionStorage.setItem(MSG_KEY, message); } catch { /* egal */ }
  }
  window.location.href = u.href;
}

async function startGame(context: Context, level: MapData, setup: GameSetup): Promise<void> {
  const scene = context.scene;
  const world = new World(level, graphicsQuality);
  const lighting = new LevelLighting(scene, context.renderer, world.data, world.view.probe, graphicsQuality);
  scene.add(world.group);

  const sfx = new Sfx(graphicsQuality);
  const audioWorld = connectWorldAudio(sfx, world);
  const unlock = (): void => sfx.unlock();
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  const hud = new Hud();
  hud.mount();
  hud.setRadarMap(
    { bandOf: (y) => world.radarBandOf(y), raster: (band) => world.radarRaster(band), bands: () => world.radarBandList() },
    world.sites.map((s) => ({ id: s.id, x: s.plant[0], y: s.plant[1], z: s.plant[2] })),
  );
  hud.setRadarLabel(world.mapName);

  const playerRoot = new THREE.Object3D();
  scene.add(playerRoot);
  const player = playerRoot.addComponent(FpsPlayer);
  player.collider = world.collider;
  const shooter = playerRoot.addComponent(Shooter);
  shooter.aabbs = world.collider;
  shooter.player = player;
  shooter.onHud = (s) => hud.update(s);
  let lobbyOpen = (): boolean => false;
  shooter.menuOpen = () => hud.menuOpen() || settingsMenuOpen() || lobbyOpen();
  shooter.blocked = () => player.isDead() || player.frozen;
  shooter.onShotSfx = (w) => sfx.shot(w, 0);
  shooter.onEmptyClick = () => sfx.dryFire();
  shooter.onDraw = (w) => sfx.draw(w);
  shooter.onWallHit = (p) => sfx.wallHit(p);
  shooter.onMeleeWall = (p) => sfx.knifeHit('wall', p);
  // Einstellungen (O): live auf Spieler, Shooter, HUD und Sound anwenden
  // Overlays im selben Stapelkontext wie das HUD (sonst läge das Fadenkreuz darüber)
  const uiHost = (document.querySelector('needle-engine') as HTMLElement | null) ?? document.body;
  const settingsMenu = new SettingsMenu(safeStorage());
  settingsMenu.mount(uiHost);
  let hudMenu = false;
  const syncInput = (): void => { player.inputEnabled = !hudMenu && !settingsMenu.isOpen() && !lobbyOpen(); };
  hud.onMenuChange = (open) => { hudMenu = open; syncInput(); sfx.ui(open ? 'click' : 'back'); };
  settingsMenu.onOpenChange = () => { syncInput(); sfx.ui(settingsMenu.isOpen() ? 'click' : 'back'); };
  settingsMenu.onLeave = () => backToMenu();
  const applySettings = (st: Settings): void => {
    player.sensitivity = st.sensitivity;
    player.invertY = st.invertY;
    player.bobbing = st.bobbing;
    shooter.baseFov = st.fov;
    sfx.setVolumes(st);
    hud.setCrosshair(st.crosshairColor, st.crosshairStyle, st.crosshairSize, st.crosshairGap, st.crosshairThickness, st.crosshairDynamic);
    hud.setScale(st.hudScale);
    hud.setRadarOptions(st.radarRotate, st.radarZoom);
    hud.showFps(st.showFps);
  };
  settingsMenu.onChange = applySettings;
  settingsMenuOpen = () => settingsMenu.isOpen();
  applySettings(settingsMenu.settings);
  shooter.onZoom = (level) => hud.setScope(level > 0);

  const fx = playerRoot.addComponent(Fx);
  const viewModel = playerRoot.addComponent(ViewModel);
  viewModel.solids = [];
  fx.lights = world.view.dyn;
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
    ? {
      name: setup.serverName, maxPlayers: setup.maxPlayers, pw: passwordDigest(setup.room, setup.password), listed: setup.listed, hold: setup.lobby,
      // Karte und Bots wandern mit dem Snapshot (Beitretende laden dieselbe Karte, Host-Migration behält die Bots)
      map: mapId, fillTo: setup.fillTo, botSkill: setup.botSkill,
      // Teamschaden: Entscheidung des Hosts, wandert mit dem Snapshot zu allen (und durch Host-Migration)
      friendlyFire: setup.friendlyFire,
    }
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
    // Beitretende übernehmen die Regel vom Host (Snapshot), nur Einzelspieler/Ersteller legen sie fest
    ...(setup.mode === 'join' ? {} : { friendlyFire: setup.friendlyFire }),
    lobby: lobbyCfg,
    passwordDigest: setup.mode === 'join' && setup.password ? passwordDigest(setup.room, setup.password) : null,
  };
  driver.onKicked = (reason) => backToMenu(kickReasonText(reason), true);
  driver.onWrongMap = (map) => rejoinWithMap(setup, map);
  shooter.loadout = () => driver.local?.loadout;

  // Startposition bis zum ersten Spawn
  const t = world.spawnPose('T', 0);
  player.spawn(t.x, t.z, t.yaw, t.y);
  shooter.setWeapon('knife');

  // HUD-Overlay-Tick + Licht für dynamische Objekte + Wandabstand der Waffe
  const ticker = playerRoot.addComponent(HudTicker);
  ticker.hud = hud;
  ticker.tickWorld = (dt) => {
    const cam = context.mainCamera;
    if (!cam) return;
    lighting.update(cam.position, dt);
    world.view.dyn.update(dt, cam.position);
    viewModel.solids = world.blockersNear(cam.position.x, cam.position.y, cam.position.z);
  };
  playerRoot.addComponent(AudioListener).sfx = sfx;
  grenades.onBounce = (p) => sfx.grenade('bounce', p);

  let announcerOpen = (): boolean => false;
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
        hasPassword: !!cfg?.hasPassword,
        friendlyFire: driver.friendlyFire,
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
        round: m.round.round, score: [m.round.tRounds, m.round.ctRounds], hasPassword: cfg.hasPassword, friendlyFire: cfg.friendlyFire, version: GAME_VERSION,
      };
    };
    // Die Discovery-Verbindung braucht nur der Host (Clients melden nichts); nach einer
    // Host-Migration öffnet der neue Host sie, ein abgelöster Host schließt sie.
    const announcer = new ServerAnnouncer(setup.server, heartbeat);
    const syncAnnouncer = (): void => {
      if (driver.isHost && driver.lobbyConfig?.listed) announcer.start();
      else announcer.stop();
    };
    announcerOpen = () => announcer.active;
    const annTimer = window.setInterval(syncAnnouncer, 1000);
    syncAnnouncer();
    window.addEventListener('pagehide', () => { window.clearInterval(annTimer); announcer.stop(); });
  }

  // Debug-Hooks (Smoke-Tests, DevTools)
  if (import.meta.env?.DEV) {
    const g = globalThis as Record<string, unknown>;
    g.__csw = {
      solids: world.collider.items.length,
      hasCam: !!context.mainCamera,
      sceneChildren: scene.children.length,
      map: world.mapName,
      nav: world.nav.count,
      view: world.view.stats,
    };
    g.__audio = () => ({ ...sfx.stats(), world: audioWorld });
    g.__sfx = sfx;
    // Alle Klang-Pfade einmal auslösen (Smoke-Test): Oberflächen, Explosionen, Blendung, C4, Vorbeiflug
    g.__audioProbe = () => {
      const l = sfx.engine.listener;
      const at = (dx: number, dz: number) => ({ x: l.x + dx, y: l.y, z: l.z + dz });
      for (const s of ['concrete', 'metal', 'grate', 'wood', 'gravel', 'tile'] as const) sfx.footstep(s, at(3, 0), 5);
      sfx.land('metal', null, 0.8);
      sfx.shotAt('ak47', at(0, -60), [at(0.8, 10)], [at(0.8, 10)]);
      sfx.shot('awp', at(-120, 0));
      sfx.shot('m4a1', 0);
      sfx.explosion('he', at(10, 10));
      sfx.explosion('c4', at(80, 0));
      sfx.flashed(0.8);
      sfx.c4('press', null);
      sfx.beep(at(5, 0), 2);
      sfx.reload('m3', 2, 3);
      sfx.ui('click');
      return sfx.stats().played;
    };
    g.__frames = () => {
      const info = context.renderer?.info?.render;
      return info ? { calls: info.calls, triangles: info.triangles } : null;
    };
    g.__state = () => driver.debugState();
    g.__players = () => Object.values(driver.match.players).map((p) => ({ id: p.id, name: p.name, team: p.team, bot: p.bot, hp: p.hp, alive: p.alive }));
    g.__playerPose = (id: string) => { const p = driver.match.players[id]; return p ? { x: +p.pose.x.toFixed(2), z: +p.pose.z.toFixed(2) } : null; };
    g.__pings = () => Object.values(driver.match.players).map((p) => ({ id: p.id, bot: p.bot, ping: p.ping }));
    g.__netId = () => ({ id: net.id, host: net.hostId, peers: [...net.peers], online: net.online });
    g.__bots = () => driver.debugBotPos();
    g.__botPlan = () => driver.debugBotPlan();
    g.__labels = () => driver.debugLabels();
    g.__soldierMuzzle = (id: string) => driver.debugSoldierMuzzle(id);
    g.__pos = () => ({ x: +player.motionX().toFixed(2), y: +player.feetY().toFixed(2), z: +player.motionZ().toFixed(2), yaw: +player.yawNow().toFixed(2), speed: +player.speedXZ().toFixed(2), air: player.airborne(), run: +player.runSpeed.toFixed(2), hp: player.hp, dead: player.isDead(), area: world.areaAt({ x: player.motionX(), y: player.feetY(), z: player.motionZ() })?.name ?? null });
    g.__killTeam = (team: 'T' | 'CT') => { driver.debugKillTeam(team); return driver.debugState(); };
    g.__buy = (item: string) => { driver.requestBuy(item); return driver.local?.loadout; };
    g.__switch = (slot: number) => { shooter.selectSlot(slot); return { weapon: shooter.weaponId }; };
    g.__weapon = (id: string) => { shooter.setWeapon(id); return { weapon: shooter.weaponId }; };
    // Waffen-Labor: beliebiges Modell ins Viewmodel (ohne Inventar), Welt ausblenden (neutraler Hintergrund)
    g.__vmShow = async (id: string, team: 'T' | 'CT' = 'T') => { viewModel.setTeam(team); await viewModel.show(id); viewModel.settle(); return viewModel.hasModel(); };
    g.__vmPreview = (kind: 'reload' | 'reloadEmpty' | 'draw' | 'inspect' | 'cycle', frac: number) => { viewModel.preview(kind, frac); return viewModel.animName(); };
    g.__lab = (on: boolean) => { world.group.visible = !on; (scene.background as THREE.Color).setHex(on ? 0x7d858d : 0x0e1014); return on; };
    g.__vm = () => ({ loaded: viewModel.hasModel(), model: viewModel.modelId(), meshes: viewModel.meshCount(), verts: viewModel.vertexCount() });
    g.__vmAim = () => {
      const c = context.mainCamera as THREE.PerspectiveCamera;
      const w = viewModel.muzzleWorld(new THREE.Vector3());
      const rel = w.clone().sub(c.getWorldPosition(new THREE.Vector3())).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()).invert());
      return { x: +rel.x.toFixed(2), y: +rel.y.toFixed(2), z: +rel.z.toFixed(2) };
    };
    g.__decals = () => fx.decalStats();
    g.__fxWall = () => fx.wallDecals;
    g.__nades = () => grenades.count();
    g.__teleport = (x: number, z: number, yaw = 0, y?: number) => { driver.debugTeleport(x, z, yaw, y); return g.__pos; };
    g.__zones = () => world.zones;
    /** Freie Schussposition ~4 m vor einem Ziel mit Sichtlinie (Karte hat Wände in alle Richtungen). */
    const standoff = (tx: number, ty: number, tz: number, ignore = ''): { x: number; y: number; z: number } | null => {
      // andere Spieler dürfen nicht in der Schusslinie stehen
      const others = Object.values(driver.match.players).filter((p) => p.alive && p.id !== ignore && p.id !== driver.localId);
      const blocked = (x: number, z: number): boolean => others.some((o) => {
        const vx = tx - x, vz = tz - z, l2 = vx * vx + vz * vz;
        const f = Math.max(0, Math.min(1, ((o.pose.x - x) * vx + (o.pose.z - z) * vz) / l2));
        return Math.hypot(x + vx * f - o.pose.x, z + vz * f - o.pose.z) < 1.0;
      });
      for (const dist of [4, 3, 5, 2.5, 6]) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = tx + Math.cos(a) * dist;
          const z = tz + Math.sin(a) * dist;
          const y = world.groundAt(x, z, ty + 0.6);
          if (Math.abs(y - ty) > 0.6) continue;
          if (world.collider.blockedAt(x, z, y, PLAYER.radius, PLAYER.height, PLAYER.step)) continue;
          if (!world.collider.clear({ x, y: y + PLAYER.eye, z }, { x: tx, y: ty + 1.0, z: tz })) continue;
          if (blocked(x, z)) continue;
          return { x, y, z };
        }
      }
      return null;
    };
    /**
     * Erst schießen, wenn die echte Kamera an der Zielpose steht (Position + Blickrichtung, zwei Frames in Folge) und
     * der Schütze bereit ist — feste Wartezeiten reichen bei hoher CPU-Last nicht (ein Frame dauert dann Sekunden,
     * der erste Schuss nimmt die Kamera von VOR dem Teleport). Bots bleiben bis kurz nach dem Schuss angehalten.
     */
    /** Bots angehalten bis zu einem Zeitpunkt (spätere Aufrufe verlängern/überschreiben ihn, kein vorzeitiges Freigeben). */
    let pausedUntil = 0;
    const pauseBotsUntil = (ms: number, override = false): void => {
      const until = performance.now() + ms;
      pausedUntil = override ? until : Math.max(pausedUntil, until);
      driver.botsPaused = true;
      setTimeout(() => { if (performance.now() >= pausedUntil) driver.botsPaused = false; }, pausedUntil - performance.now() + 30);
    };
    const lastShot: { settleMs: number; settled: boolean; fired: boolean } = { settleMs: 0, settled: false, fired: false };
    g.__lastShot = () => ({ ...lastShot });
    const fireWhenSettled = (feet: { x: number; y: number; z: number }, yaw: number, pitch: number, pauseBots: boolean): void => {
      const t0 = performance.now();
      const want = yawPitchToDir(yaw, pitch);
      const pos = new THREE.Vector3();
      const dir = new THREE.Vector3();
      lastShot.fired = false;
      let stable = 0;
      const atPose = (): boolean => {
        const c = context.mainCamera;
        if (!c) return false;
        c.getWorldPosition(pos);
        c.getWorldDirection(dir);
        return Math.hypot(pos.x - feet.x, pos.z - feet.z) < 0.15
          && Math.abs(pos.y - (feet.y + PLAYER.eye)) < 0.4
          && dir.x * want.x + dir.y * want.y + dir.z * want.z > 0.9995;
      };
      const poll = (): void => {
        stable = atPose() ? stable + 1 : 0;
        const timedOut = performance.now() - t0 > 25000;
        if (stable >= 2 || timedOut) {
          lastShot.settleMs = Math.round(performance.now() - t0);
          lastShot.settled = stable >= 2;
          lastShot.fired = true;
          document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
          setTimeout(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })), 60);
          if (pauseBots) pauseBotsUntil(2500, true);
        } else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    };
    g.__aimAtBot = (botsOnly = false) => {
      // Deterministisch auf den nächsten lebenden Gegner zielen (Körpermitte, ~4 m) und mit der Pistole schießen
      const me = driver.local;
      const enemies = Object.values(driver.match.players).filter((p) => p.alive && p.team !== me?.team && (!botsOnly || p.bot));
      if (!enemies.length || !me) return { error: 'kein Gegner' };
      let e = enemies[0]!;
      let at = standoff(e.pose.x, e.pose.y, e.pose.z, e.id);
      for (const cand of enemies) {
        if (at) break;
        e = cand;
        at = standoff(e.pose.x, e.pose.y, e.pose.z, e.id);
      }
      if (!at) return { error: 'kein Standplatz' };
      pauseBotsUntil(30000); // bis nach dem Schuss (fireWhenSettled kürzt auf 2.5 s)
      driver.debugRevive();
      player.spawn(at.x, at.z, 0, at.y);
      const aim = dirToYawPitch((() => {
        const dx = e.pose.x - at!.x, dy = e.pose.y + 1.0 - (at!.y + PLAYER.eye), dz = e.pose.z - at!.z;
        const l = Math.hypot(dx, dy, dz);
        return { x: dx / l, y: dy / l, z: dz / l };
      })());
      player.setLook(aim.yaw, aim.pitch);
      shooter.setWeapon(me.loadout.secondary ?? 'knife');
      fireWhenSettled(at, aim.yaw, aim.pitch, true);
      return { ok: true, target: e.id, hp: e.hp, dist: +Math.hypot(e.pose.x - at.x, e.pose.z - at.z).toFixed(2), weapon: shooter.weaponId };
    };
    /** Bewegungstest: Blick in die freieste Richtung (Anlauf ≥ 12 m); liefert die freie Strecke. */
    g.__openRun = () => {
      const x = player.motionX(), z = player.motionZ(), eye = player.feetY() + PLAYER.eye;
      let best = { yaw: 0, t: 0 };
      for (let k = 0; k < 32; k++) {
        const yaw = (k / 32) * Math.PI * 2;
        const hit = world.collider.raycast({ x, y: eye - 0.7, z }, yawPitchToDir(yaw, 0), 40);
        const t = hit ? hit.t : 40;
        if (t > best.t) best = { yaw, t };
      }
      player.setLook(best.yaw, 0);
      return { yaw: +best.yaw.toFixed(2), free: +best.t.toFixed(1) };
    };
    /** Sturztest: auf freier Fläche (Decke ≥ h + 2 m darüber) aus h Metern Höhe fallen lassen. */
    g.__dropTest = (h: number) => {
      const spots = [...world.spawns.T, ...world.spawns.CT].map((s) => s.pos).concat([[world.zones.a.x, world.zones.a.y, world.zones.a.z], [world.zones.b.x, world.zones.b.y, world.zones.b.z]]);
      for (const [x, y, z] of spots) {
        if (world.collider.ceilingAbove(x!, z!, y!, PLAYER.radius) < y! + h + 2) continue;
        driver.debugRevive();
        player.spawn(x!, z!, 0, y! + h);
        return { x, y: y! + h, z, ground: y };
      }
      return { error: 'kein freier Platz' };
    };
    /** Dynamisches Licht: Status bzw. Explosion/Blitz ~4 m vor der Kamera auslösen (Sichtprüfung/Smoke). */
    g.__dynLights = () => ({ max: world.view.dyn.max, active: world.view.dyn.active, pool: world.view.dyn.poolSize() });
    g.__lightTest = (kind: 'he' | 'flash' | 'muzzle' = 'he', dist = 4, hold = 0) => {
      const c = context.mainCamera!;
      const d = c.getWorldDirection(new THREE.Vector3());
      const p = { x: c.position.x + d.x * dist, y: c.position.y + d.y * dist - 0.3, z: c.position.z + d.z * dist };
      if (hold > 0) {
        // Standbild für Screenshots: Lebensdauer verlängert (bei niedriger Bildrate sonst kaum zu erwischen)
        const spec = kind === 'he' ? explosionLight(p, 1) : kind === 'flash' ? flashLight(p) : muzzleLight(p, 1.1);
        world.view.dyn.add({ ...spec, duration: hold });
      } else if (kind === 'he') world.view.dyn.explosion(p, 1);
      else if (kind === 'flash') world.view.dyn.flash(p);
      else fx.muzzleFlash(p, d, 1.1);
      return p;
    };
    g.__counters = () => driver.debugCounters();
    g.__map = () => ({ id: world.data.id, brushes: world.data.brushes.length, nav: world.nav.count, areas: world.nav.areas.map((a) => a.name), view: world.view.stats });
    g.__area = () => world.areaAt({ x: player.motionX(), y: player.feetY(), z: player.motionZ() })?.name ?? null;
    g.__look = (yaw: number, pitch: number) => { player.setLook(yaw, pitch); return true; };
    g.__cam = () => { const c = context.mainCamera!; return { rx: +c.rotation.x.toFixed(3), ry: +c.rotation.y.toFixed(3), rz: +c.rotation.z.toFixed(3), y: +c.position.y.toFixed(2), order: c.rotation.order }; };
    g.__pauseBots = (ms = 3000) => { pauseBotsUntil(ms); return true; };
    g.__reviveId = (id: string) => driver.debugReviveId(id);
    g.__enemyHp = () => Object.values(driver.match.players).filter((p) => p.team !== driver.local?.team).map((p) => ({ id: p.id, hp: p.hp, alive: p.alive }));
    g.__wallShot = () => {
      // Vom T-Spawn aus Wände in 4–25 m suchen (nächste zuerst); geprüft wird der echte Schuss: Standpunkt 3 m vor der Wand,
      // Bodenhöhe dort, Augenstrahl mit der Schussneigung muss die senkrechte Wand binnen 3.5 m treffen
      const t0 = world.spawnPose('T', 0);
      const pitch = 0.12;
      const cands: { yaw: number; t: number }[] = [];
      for (let k = 0; k < 32; k++) {
        const yaw = (k / 32) * Math.PI * 2;
        const hit = world.collider.raycast({ x: t0.x, y: t0.y + PLAYER.eye, z: t0.z }, yawPitchToDir(yaw, 0), 40);
        if (hit && hit.t > 4 && hit.t < 25 && Math.abs(hit.normal.y) < 0.1) cands.push({ yaw, t: hit.t });
      }
      cands.sort((p, q) => p.t - q.t);
      for (const cand of cands) {
        const d = yawPitchToDir(cand.yaw, 0);
        const px = t0.x + d.x * (cand.t - 3);
        const pz = t0.z + d.z * (cand.t - 3);
        const gy = world.groundAt(px, pz, t0.y + 0.6);
        if (world.collider.blockedAt(px, pz, gy, PLAYER.radius, PLAYER.height, PLAYER.step)) continue;
        const shot = world.collider.raycast({ x: px, y: gy + PLAYER.eye, z: pz }, yawPitchToDir(cand.yaw, pitch), 40);
        if (!shot || shot.t > 3.5 || Math.abs(shot.normal.y) >= 0.1) continue;
        // keine Spieler in der Schusslinie / am Standpunkt
        const blockedBy = Object.values(driver.match.players).some((p) => {
          if (!p.alive || p.id === driver.localId) return false;
          const f = Math.max(0, Math.min(shot.t, (p.pose.x - px) * d.x + (p.pose.z - pz) * d.z));
          return Math.hypot(px + d.x * f - p.pose.x, pz + d.z * f - p.pose.z) < 1.5;
        });
        if (blockedBy) continue;
        pauseBotsUntil(30000);
        driver.debugRevive();
        player.spawn(px, pz, cand.yaw, gy);
        player.setLook(cand.yaw, pitch);
        shooter.setWeapon(driver.local?.loadout.secondary ?? 'glock');
        fireWhenSettled({ x: px, y: gy, z: pz }, cand.yaw, pitch, true);
        return { ok: true, wallDist: +shot.t.toFixed(2), candidates: cands.length };
      }
      return { error: 'keine Wand', candidates: cands.length };
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
      player.spawn(a.x, a.z, 0, a.y);
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
    /** Netztest: Rohdaten wie empfangen verarbeiten (bösartige Nachrichten) bzw. roh senden. */
    g.__netInject = (raw: unknown, from: string | null = null) => { driver.debugInject(raw, from); return true; };
    g.__netSendRaw = (raw: unknown) => { driver.debugSendRaw(raw); return true; };
    g.__announcer = () => announcerOpen();
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
  tickWorld?: (dt: number) => void;
  update(): void {
    const dt = Math.min(this.context.time.deltaTime, 0.1);
    this.hud.tick(dt);
    this.tickWorld?.(dt);
    this.lobby?.();
  }
}
