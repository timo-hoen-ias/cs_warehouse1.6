import './theme.css';
import './hud.css';
import type { HudState } from '../weapons/Shooter';
import type { Team } from '../logic/economy';
import type { MatchState, Pose } from '../logic/match';
import type { GameEvent } from '../logic/net';
import type { Raster } from '../logic/overview';
import type { Vec3 } from '../logic/hitbox';
import { scoreboard } from '../logic/match';
import { worldToRadar } from '../logic/radar';
import { WEAPONS, type BuyCategory } from '../logic/weapons';
import { radioMenuFor, radioPick, type RadioMenu } from '../logic/radio';
import {
  TEAM_NAME, ammoLow, buyCategoryItems, buyStateText, buyTopLevel, deathInfo, escapeHtml, formatClock, formatMoney, formatMoneyDelta,
  hpLevel, killFeedEntry, phaseLabel, pingText, roundOutcome, weaponStatBars, type BuyContext, type BuyItemView,
} from '../logic/hudFormat';
import { canvasPixels, computeUiScale, hudSideInset } from '../logic/uiScale';
import { headshotIconSvg, weaponIconSvg } from '../logic/weaponIcons';
import { ICON } from './icons';

export type RoundInfo = {
  phase: string;
  timer: number;
  tRounds: number;
  ctRounds: number;
  round: number;
  bombInfo: string;
  mapName: string;
  alive: { T: number; CT: number };
  winner: Team | null;
  /** Fortschritt (0..1), wenn der lokale Spieler gerade legt/entschärft. */
  bombProgress?: { kind: 'plant' | 'defuse'; value: number } | null;
  /** Serverlobby aktiv (Aufwärmen wird gehalten). */
  lobby?: boolean;
};

export type PlayerInfo = {
  team: Team;
  money: number;
  armor: number;
  helmet: boolean;
  hasBomb: boolean;
  hasKit: boolean;
  nades: { he: number; flash: number; smoke: number };
  alive: boolean;
  canBuy: boolean;
};

type RadarDot = { x: number; z: number; yaw: number; team: Team; alive: boolean; id: string };
type CrosshairStyle = 'classic' | 'dot' | 'circle';
type Zones = { a: { x: number; z: number }; b: { x: number; z: number }; t: { x: number; z: number }; ct: { x: number; z: number } };

const RADAR_CSS = 230;
const FEED_MS = 7000;
const CHAT_FADE_MS = 12000;

/**
 * Komplettes FPS-HUD als DOM-Overlay über dem Canvas (CSS: hud.css): Fadenkreuz,
 * Leben/Rüstung/Geld (unten links), Waffe/Munition/Inventar (unten rechts),
 * Spielstand mit Spieler-Avataren und Zeit (oben Mitte), Radar (oben links),
 * Kill-Feed mit Waffensymbolen (oben rechts), Kaufmenü (B), Scoreboard (Tab),
 * Chat (Y/U), Funk (Z/X/C), Teamwahl (M), Banner, Todesinfo, Zuschauerleiste,
 * Blend-/Schadens-Overlays. Reine Anzeige + Tastatur-Routing an Callbacks;
 * DOM-Änderungen nur bei geänderten Werten.
 */
export class Hud {
  onBuy?: (item: string) => void;
  onBuyAmmo?: (slot: 1 | 2) => void;
  onChat?: (text: string, teamOnly: boolean) => void;
  /** Funkspruch (Team) gewählt. */
  onRadio?: (text: string) => void;
  onTeam?: (team: Team) => void;
  onMenuChange?: (open: boolean) => void;

  scoreboardVisible = false;
  private buyOpen = false;
  private buyCategory: BuyCategory | null = null;
  private buyMsg = '';
  private chatOpen = false;
  private chatTeam = false;
  private radio: RadioMenu | null = null;
  private teamOpen = false;

  private root?: HTMLDivElement;
  private readonly el: Record<string, HTMLElement> = {};
  private readonly textCache = new Map<HTMLElement, string>();
  private radar?: HTMLCanvasElement;
  private radarPx = 0;
  private chatInput?: HTMLInputElement;
  private crossStyle: CrosshairStyle = 'classic';
  private crossCfg = { color: '#9ff09f', size: 9, gap: 3, thickness: 2, dynamic: true };
  private lastGap = -1;
  private userScale = 1;
  private uiScale = 1;
  private flashLevel = 0;
  private dmgLevel = 0;
  private bannerTimer = 0;
  private noticeTimer = 0;
  private deathTimer = 0;
  private invIdle = 0;
  private lastWeaponId = '';
  private lastMoney: number | null = null;
  private lastPlayer: PlayerInfo | null = null;
  private lastShooter: HudState | null = null;
  private lastRound: RoundInfo | null = null;
  private match: MatchState | null = null;
  private localId = '';
  private feed: { node: HTMLElement; t: number }[] = [];
  private chatLines: { node: HTMLElement; t: number }[] = [];
  private chatSig = '';
  private chatSeen = new Map<string, number>();
  /** Vorgerenderte Karten-Draufsicht fürs Radar (logic/overview). */
  private radarMap: { canvas: HTMLCanvasElement; minX: number; minZ: number; w: number; h: number } | null = null;
  private zones: Zones | null = null;
  private fpsFrames = 0;
  private fpsTime = 0;
  private scoreTimer = 0;
  private hostId = '';
  private readonly host = (): HTMLElement => (document.querySelector('needle-engine') as HTMLElement | null) ?? document.body;

  /** Radarbild der Karte setzen (Draufsicht aus logic/overview). */
  setRadarMap(r: Raster): void {
    const canvas = document.createElement('canvas');
    canvas.width = r.w;
    canvas.height = r.h;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
    this.radarMap = { canvas, minX: r.minX, minZ: r.minZ, w: r.w / r.pxPerM, h: r.h / r.pxPerM };
  }

  mount(): void {
    const root = document.createElement('div');
    root.className = 'hud ui-scope';
    root.innerHTML = `
      <div class="hud-flash" data-k="flash"></div>
      <div class="hud-dmg" data-k="dmg"></div>
      <div class="hud-lowhp" data-k="lowhp"></div>
      <div class="hud-scope" data-k="scope"></div>
      <div class="hud-cross s-classic" data-k="cross"><i class="l-t"></i><i class="l-b"></i><i class="l-l"></i><i class="l-r"></i><i class="dot"></i><i class="ring"></i></div>
      <div class="hud-hit" data-k="hit"><i></i><i></i><i></i><i></i></div>
      <div class="hud-dir" data-k="dir0"></div><div class="hud-dir" data-k="dir1"></div><div class="hud-dir" data-k="dir2"></div>
      <div class="hud-radar" data-k="radarWrap">
        <div class="hud-radar-box"><canvas data-k="radar"></canvas></div>
        <div class="hud-radar-label"><span data-k="radarLabel"></span></div><div class="hud-radar-net" data-k="net"></div>
      </div>
      <div class="hud-top">
        <div class="hud-score">
          <div class="hud-team t"><span class="pts" data-k="tPts">0</span><div class="hud-avatars" data-k="tAv"></div></div>
          <div class="hud-clock" data-k="clock"><span class="c4">${ICON.bomb.replace('<svg', '<svg style="height:1em;fill:currentColor"')}</span><span class="time" data-k="time">0:00</span><span class="phase" data-k="phase"></span></div>
          <div class="hud-team ct"><span class="pts" data-k="ctPts">0</span><div class="hud-avatars" data-k="ctAv"></div></div>
        </div>
        <div class="hud-roundline" data-k="roundline"></div>
        <div class="hud-bombinfo" data-k="bombinfo"></div>
      </div>
      <div class="hud-feed" data-k="feed"></div>
      <div class="hud-fps" data-k="fps"></div>
      <div class="hud-chat" data-k="chat"></div>
      <div class="hud-chatin" data-k="chatin"><span data-k="chatLabel">Alle</span><input maxlength="120" autocomplete="off" spellcheck="false"></div>
      <div class="hud-bl">
        <div class="hud-icons" data-k="icons"></div>
        <div class="hud-money" data-k="moneyBox"><span data-k="money">$ 0</span><span class="delta" data-k="moneyDelta"></span></div>
        <div class="hud-vitals hud-glass">
          <div class="hud-vital hp" data-k="hpBox">${ICON.health}<span class="v hud-num" data-k="hp">100</span><div class="bar"><b data-k="hpBar"></b></div></div>
          <div class="hud-vital ar" data-k="arBox">${ICON.armor}<span class="v hud-num" data-k="ar">0</span><span class="helm" data-k="helm"></span><div class="bar"><b data-k="arBar"></b></div></div>
        </div>
      </div>
      <div class="hud-br">
        <div class="hud-inv" data-k="inv"></div>
        <div class="hud-ammo hud-glass">
          <div class="wpn"><span data-k="wIcon"></span><span class="name" data-k="wName"></span></div>
          <span class="mag" data-k="mag">–</span><span class="res" data-k="res"></span>
        </div>
      </div>
      <div class="hud-notice" data-k="notice"></div>
      <div class="hud-lock on" data-k="lock"><b>Klicken zum Spielen</b><span><span class="ui-kbd">Esc</span> Maus frei · <span class="ui-kbd">B</span> Kaufen · <span class="ui-kbd">Tab</span> Punkte · <span class="ui-kbd">O</span> Einstellungen</span></div>
      <div class="hud-hint hud-glass" data-k="hint"></div>
      <div class="hud-progress" data-k="prog"><span class="lbl" data-k="progLbl"></span><div class="track"><b data-k="progBar"></b></div></div>
      <div class="hud-banner" data-k="banner"><div class="band"><div class="ttl" data-k="bTitle"></div><div class="sub" data-k="bSub"></div></div></div>
      <div class="hud-death hud-glass" data-k="death"></div>
      <div class="hud-spec hud-glass" data-k="spec"><span class="tag">Zuschauer</span><span class="txt" data-k="specTxt"></span></div>
      <div class="hud-radio hud-glass" data-k="radio"></div>
      <div class="hud-modal" data-k="buyModal"><div class="hud-buy" data-k="buy"></div></div>
      <div class="hud-modal board" data-k="boardModal"><div class="hud-board" data-k="board"></div></div>
      <div class="hud-modal" data-k="teamModal"><div class="hud-teamsel" data-k="team"></div></div>`;
    for (const n of root.querySelectorAll<HTMLElement>('[data-k]')) this.el[n.dataset.k!] = n;
    this.root = root;
    this.radar = this.el.radar as HTMLCanvasElement;
    this.chatInput = this.el.chatin!.querySelector('input')!;
    this.host().appendChild(root);

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onLock);
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const t = this.chatInput!.value;
        this.chatInput!.value = '';
        this.closeChat();
        if (t.trim()) this.onChat?.(t, this.chatTeam);
      } else if (e.key === 'Escape') {
        this.chatInput!.value = '';
        this.closeChat();
      }
    });
    this.el.buy!.addEventListener('click', this.onBuyClick);
    this.el.team!.addEventListener('click', this.onTeamClick);
    this.el.buyModal!.addEventListener('mousedown', (e) => { if (e.target === this.el.buyModal) this.closeBuy(); });
    this.onResize();
    this.applyCrosshair();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onLock);
    this.root?.remove();
    this.root = undefined;
  }

  /** Irgendein Menü offen (Shooter/Player ignorieren Eingaben). */
  menuOpen(): boolean {
    return this.buyOpen || this.chatOpen || this.teamOpen;
  }

  // ---------------------------------------------------------------- Skalierung

  /** HUD-Größe aus den Einstellungen (Faktor relativ zur Bildschirmanpassung). */
  setScale(userScale: number): void {
    this.userScale = userScale;
    this.onResize();
  }

  private readonly onResize = (): void => {
    if (!this.root) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.uiScale = computeUiScale(w, h, this.userScale);
    this.root.style.setProperty('--u', `${this.uiScale}px`);
    this.root.style.setProperty('--side', `${hudSideInset(w, h)}px`);
    // Radar gestochen scharf: Canvas-Pixel = CSS-Größe × DPR
    const px = canvasPixels(RADAR_CSS * this.uiScale, window.devicePixelRatio || 1);
    if (this.radar && px !== this.radarPx) {
      this.radarPx = px;
      this.radar.width = px;
      this.radar.height = px;
    }
    this.lastGap = -1;
    this.applyCrosshair();
  };

  private readonly onLock = (): void => {
    this.cls(this.el.lock, 'on', !document.pointerLockElement);
  };

  // ---------------------------------------------------------------- Helfer

  /** Text nur setzen, wenn er sich geändert hat. */
  private txt(el: HTMLElement | undefined, v: string): void {
    if (!el || this.textCache.get(el) === v) return;
    this.textCache.set(el, v);
    el.textContent = v;
  }

  /** innerHTML nur setzen, wenn es sich geändert hat. */
  private html(el: HTMLElement | undefined, v: string): void {
    if (!el || this.textCache.get(el) === v) return;
    this.textCache.set(el, v);
    el.innerHTML = v;
  }

  private cls(el: HTMLElement | undefined, name: string, on: boolean): void {
    if (el && el.classList.contains(name) !== on) el.classList.toggle(name, on);
  }

  // ---------------------------------------------------------------- Fadenkreuz / Zielfernrohr

  /** Zielfernrohr-Overlay an/aus (Fadenkreuz aus, wenn gezoomt). */
  setScope(on: boolean): void {
    this.cls(this.el.scope, 'on', on);
    this.cls(this.el.cross, 'off', on);
  }

  /** Fadenkreuz aus den Einstellungen (Farbe, Stil, Linienlänge, Abstand, Stärke, dynamisch). */
  setCrosshair(color: string, style: CrosshairStyle, size: number, gap = this.crossCfg.gap, thickness = this.crossCfg.thickness, dynamic = this.crossCfg.dynamic): void {
    this.crossStyle = style;
    this.crossCfg = { color, size, gap, thickness, dynamic };
    this.lastGap = -1;
    this.applyCrosshair();
  }

  private applyCrosshair(spread = 0): void {
    const c = this.el.cross;
    if (!c) return;
    const k = Math.max(1, this.uiScale);
    const gap = Math.round((this.crossCfg.gap + (this.crossCfg.dynamic ? spread : 0)) * k * 2) / 2;
    if (gap === this.lastGap) return;
    this.lastGap = gap;
    c.className = `hud-cross s-${this.crossStyle}${this.el.scope?.classList.contains('on') ? ' off' : ''}`;
    c.style.setProperty('--cc', this.crossCfg.color);
    c.style.setProperty('--cl', `${Math.round(this.crossCfg.size * k)}px`);
    c.style.setProperty('--ct', `${Math.max(1, Math.round(this.crossCfg.thickness * k))}px`);
    c.style.setProperty('--cg', `${gap}px`);
  }

  showFps(on: boolean): void {
    this.cls(this.el.fps, 'on', on);
  }

  // ---------------------------------------------------------------- Frame

  private lastTick = 0;

  /** Pro Frame vom Aufrufer (Overlays abklingen). Zeitbasis: echte Zeit (Engine-dt ist gedeckelt). */
  tick(engineDt: number): void {
    const nowMs = performance.now();
    const dt = this.lastTick ? Math.min(0.5, (nowMs - this.lastTick) / 1000) : engineDt;
    this.lastTick = nowMs;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.txt(this.el.fps, `${Math.round(this.fpsFrames / this.fpsTime)} FPS`);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - dt * 0.45);
      this.el.flash!.style.opacity = String(Math.min(1, this.flashLevel));
    }
    if (this.dmgLevel > 0) {
      this.dmgLevel = Math.max(0, this.dmgLevel - dt * 2.2);
      this.el.dmg!.style.opacity = String(this.dmgLevel);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.cls(this.el.banner, 'on', false);
    }
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.cls(this.el.notice, 'on', false);
    }
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.cls(this.el.death, 'on', false);
    }
    this.invIdle += dt;
    this.cls(this.el.inv, 'idle', this.invIdle > 3);
    const now = performance.now();
    while (this.feed.length && now - this.feed[0]!.t > FEED_MS) this.feed.shift()!.node.remove();
    for (const l of this.chatLines) this.cls(l.node, 'old', now - l.t > CHAT_FADE_MS);
    if (this.scoreboardVisible && this.match) {
      this.scoreTimer -= dt;
      if (this.scoreTimer <= 0) {
        this.scoreTimer = 0.25;
        this.renderBoard();
      }
    }
  }

  // ---------------------------------------------------------------- Anzeige

  update(s: HudState): void {
    const prev = this.lastShooter;
    this.lastShooter = s;
    this.applyCrosshair(s.spreadPx ?? 0);
    if (!prev || prev.weaponId !== s.weaponId || prev.mag !== s.mag || prev.reserve !== s.reserve || prev.reloading !== s.reloading || prev.hp !== s.hp || prev.slots.join() !== s.slots.join()) {
      if (s.weaponId !== this.lastWeaponId) {
        this.lastWeaponId = s.weaponId;
        this.invIdle = 0;
      }
      this.renderStatus();
    }
  }

  setPlayer(p: PlayerInfo): void {
    const prev = this.lastPlayer;
    this.lastPlayer = p;
    if (this.lastMoney !== null && this.lastMoney !== p.money) {
      const d = formatMoneyDelta(this.lastMoney, p.money);
      const el = this.el.moneyDelta!;
      if (d) {
        el.textContent = d;
        el.className = `delta ${d.startsWith('+') ? 'plus' : 'minus'}`;
        void el.offsetWidth; // Animation neu starten (nur bei Geldänderung)
        el.classList.add('show');
      }
    }
    this.lastMoney = p.money;
    if (p.alive && prev && !prev.alive) this.cls(this.el.death, 'on', false);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(p)) {
      this.renderStatus();
      if (this.buyOpen) {
        if (!p.canBuy || !p.alive) this.closeBuy();
        else this.renderBuy();
      }
    }
  }

  private renderStatus(): void {
    const s = this.lastShooter;
    const p = this.lastPlayer;
    const hp = Math.max(0, Math.round(s?.hp ?? 100));
    this.txt(this.el.hp, String(hp));
    const lvl = hpLevel(hp);
    const hpBox = this.el.hpBox!;
    this.cls(hpBox, 'warn', lvl === 'warn');
    this.cls(hpBox, 'crit', lvl === 'crit');
    this.cls(this.el.lowhp, 'on', hp > 0 && hp <= 20);
    this.el.hpBar!.style.transform = `scaleX(${hp / 100})`;
    const ar = p?.armor ?? 0;
    this.txt(this.el.ar, String(Math.round(ar)));
    this.txt(this.el.helm, p?.helmet ? 'Helm' : '');
    this.el.arBar!.style.transform = `scaleX(${ar / 100})`;
    this.txt(this.el.money, formatMoney(p?.money ?? 0));
    // Status-Chips: Kaufzone, C4, Kit
    const chips: string[] = [];
    if (p?.canBuy && p.alive) chips.push(`<span class="hud-chip buy">${ICON.cart.replace('<svg', '<svg class="wicon"')}<span>Kaufzone · B</span></span>`);
    if (p?.hasBomb) chips.push(`<span class="hud-chip c4${this.lastRound?.phase === 'live' ? ' hot' : ''}">${weaponIconSvg('c4')}<span>C4</span></span>`);
    if (p?.hasKit) chips.push(`<span class="hud-chip kit">${weaponIconSvg('defusekit')}<span>Kit</span></span>`);
    this.html(this.el.icons, chips.join(''));
    if (!s) return;
    // Munition + Waffe
    const def = WEAPONS[s.weaponId];
    const finite = Number.isFinite(s.mag);
    this.txt(this.el.mag, finite ? String(s.mag) : '—');
    this.txt(this.el.res, finite && Number.isFinite(s.reserve) ? `/ ${s.reserve}` : '');
    this.cls(this.el.mag, 'low', finite && def ? ammoLow(s.mag, def.magSize) : false);
    this.html(this.el.wIcon, weaponIconSvg(s.weaponId === 'knife_stab' ? 'knife' : s.weaponId));
    this.html(this.el.wName, s.reloading ? '<span class="reload">Nachladen…</span>' : escapeHtml(s.weaponName));
    // Inventar (Slots 1–5)
    const rows: string[] = [];
    s.slots.forEach((id, i) => {
      const n = p?.nades;
      const nadeCount = n ? n.he + n.flash + n.smoke : 0;
      if (i === 3) {
        if (!nadeCount) return;
        const active = WEAPONS[s.weaponId]?.slot === 4;
        const icons = (['hegrenade', 'flashbang', 'smokegrenade'] as const).flatMap((g, gi) => Array.from({ length: [n!.he, n!.flash, n!.smoke][gi]! }, () => weaponIconSvg(g)));
        rows.push(`<div class="hud-slot${active ? ' on' : ''}">${icons.join('')}<span class="k">4</span></div>`);
        return;
      }
      if (!id) return;
      const active = id === s.weaponId || (id === 'knife' && s.weaponId === 'knife_stab');
      rows.push(`<div class="hud-slot${active ? ' on' : ''}">${weaponIconSvg(id)}<span class="n">${escapeHtml(WEAPONS[id]?.name ?? id)}</span><span class="k">${i + 1}</span></div>`);
    });
    this.html(this.el.inv, rows.join(''));
  }

  setRound(info: RoundInfo): void {
    if (this.lastRound?.lobby && !info.lobby) this.showBanner('Das Match beginnt', 'var(--c-accent)', 3000, 'Kaufphase in Kürze — viel Glück!');
    this.lastRound = info;
    this.txt(this.el.tPts, String(info.tRounds));
    this.txt(this.el.ctPts, String(info.ctRounds));
    const bombLive = info.phase === 'bomb';
    this.txt(this.el.time, formatClock(info.timer));
    this.cls(this.el.time, 'low', !bombLive && info.phase === 'live' && info.timer <= 10);
    const clock = this.el.clock!;
    for (const ph of ['warmup', 'freeze', 'bomb']) this.cls(clock, ph, info.phase === ph);
    this.txt(this.el.phase, info.lobby ? 'Lobby' : phaseLabel(info.phase));
    const line = info.lobby
      ? `<span class="warm">Warte auf Spielstart durch den Host</span>`
      : info.phase === 'warmup'
        ? `<span class="warm">Aufwärmen</span><span>${escapeHtml(info.mapName)}</span>`
        : `<span>Runde ${info.round}</span><span>${escapeHtml(info.mapName)}</span>`;
    this.html(this.el.roundline, line);
    this.txt(this.el.bombinfo, info.bombInfo && info.bombInfo !== 'Bombe entschärft' && info.bombInfo !== 'Bombe explodiert' ? info.bombInfo : '');
    // Fortschritt Legen/Entschärfen
    const bp = info.bombProgress;
    this.cls(this.el.prog, 'on', !!bp);
    if (bp) {
      this.cls(this.el.prog, 'defuse', bp.kind === 'defuse');
      this.txt(this.el.progLbl, bp.kind === 'plant' ? 'Bombe wird gelegt' : 'Bombe wird entschärft');
      this.el.progBar!.style.transform = `scaleX(${Math.max(0, Math.min(1, bp.value))})`;
    }
  }

  /** Match-Zustand fürs HUD (Avatare, Todesinfo, Scoreboard). Pro Frame aufrufbar; DOM nur bei Änderung. */
  setMatch(m: MatchState, localId: string, hostId = ''): void {
    this.match = m;
    this.localId = localId;
    this.hostId = hostId;
    const sb = scoreboard(m);
    const av = (team: Team): string => sb[team].map((p) => `<i class="hud-av${p.alive ? '' : ' dead'}${p.id === localId ? ' me' : ''}"></i>`).join('');
    this.html(this.el.tAv, av('T'));
    this.html(this.el.ctAv, av('CT'));
  }

  setNetInfo(text: string): void {
    this.txt(this.el.net, text);
  }

  showBanner(text: string, color = '#ffd98a', ms = 3200, sub = ''): void {
    const b = this.el.banner!;
    this.txt(this.el.bTitle, text);
    this.txt(this.el.bSub, sub);
    b.style.setProperty('--bc', color);
    b.classList.remove('on');
    void b.offsetWidth; // Einblend-Animation neu starten (seltenes Ereignis)
    b.classList.add('on');
    this.bannerTimer = ms / 1000;
  }

  /** Rundenende wie in CS 1.6: „Terroristen gewinnen“ + Grund, mit Team-Emblem. */
  showRoundEnd(outcome: string, reason: string): void {
    const v = roundOutcome(outcome, reason);
    const color = v.winner === 'T' ? 'var(--c-t)' : v.winner === 'CT' ? 'var(--c-ct)' : '#fff';
    this.showBanner(v.title, color, 4200, v.subtitle);
    if (v.winner) this.html(this.el.bTitle, `${v.winner === 'T' ? ICON.teamT : ICON.teamCT}<span>${escapeHtml(v.title)}</span>`);
  }

  notice(text: string): void {
    this.txt(this.el.notice, text);
    this.cls(this.el.notice, 'on', true);
    this.noticeTimer = 3;
  }

  setHint(text: string | null): void {
    this.cls(this.el.hint, 'on', !!text);
    if (text) {
      // „E halten: …“ → Taste hervorheben
      const m = /^(\w) halten: (.*)$/.exec(text);
      this.html(this.el.hint, m ? `<span class="ui-kbd">${escapeHtml(m[1]!)}</span><span>halten: ${escapeHtml(m[2]!)}</span>` : escapeHtml(text));
    }
  }

  setSpectator(text: string | null): void {
    this.cls(this.el.spec, 'on', !!text);
    if (text) this.txt(this.el.specTxt, text.replace(/^Zuschauer: /, ''));
  }

  hitmarker(killed = false): void {
    const el = this.el.hit;
    if (!el) return;
    this.cls(el, 'kill', killed);
    el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 1, transform: 'scale(1.15)' }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1)' }], { duration: killed ? 380 : 220, easing: 'ease-out' });
  }

  private dirIdx = 0;

  /** Roter Rand + Richtungsbogen (Winkel relativ zur Blickrichtung). */
  damageFrom(angle: number): void {
    this.dmgLevel = Math.max(this.dmgLevel, 0.8);
    const el = this.el[`dir${this.dirIdx++ % 3}`];
    if (!el) return;
    // angle: Richtung zum Angreifer relativ zum Blick (π = vorne, wie im Driver berechnet)
    el.style.transform = `rotate(${Math.PI - angle}rad)`;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out' });
  }

  flash(strength: number): void {
    this.flashLevel = Math.max(this.flashLevel, strength * 2.2);
    this.el.flash!.style.opacity = '1';
  }

  pushKill(e: Extract<GameEvent, { k: 'kill' }>, m: MatchState): void {
    const v = killFeedEntry(e, m.players, this.localId || null);
    const team = (t: Team): string => (t === 'T' ? 't' : 'ct');
    const node = document.createElement('div');
    node.className = `hud-kill${v.self ? ' self' : ''}`;
    node.innerHTML = (v.killer ? `<span class="${team(v.killer.team)}">${escapeHtml(v.killer.name)}</span>` : '')
      + weaponIconSvg(v.weapon)
      + (v.headshot ? headshotIconSvg() : '')
      + `<span class="${team(v.victim.team)}">${escapeHtml(v.victim.name)}</span>`;
    this.el.feed!.appendChild(node);
    this.feed.push({ node, t: performance.now() });
    while (this.feed.length > 6) this.feed.shift()!.node.remove();
    // Todesinfo für den lokalen Spieler
    if (this.localId) {
      const d = deathInfo(e, m.players, this.localId);
      if (d) {
        const hp = d.killerHp !== null ? `<div class="hp">${d.killerHp}<small>HP übrig</small></div>` : '';
        this.html(this.el.death, `${weaponIconSvg(d.weapon)}<div><div class="who ${d.killerTeam === 'T' ? 'ui-team-t' : d.killerTeam === 'CT' ? 'ui-team-ct' : ''}">${escapeHtml(d.title)}</div><div class="det">${escapeHtml(d.detail)}</div></div>${hp}`);
        this.cls(this.el.death, 'on', true);
        this.deathTimer = 6;
      }
    }
  }

  setChat(lines: { who: string; text: string; team: Team | null }[]): void {
    const box = this.el.chat;
    if (!box) return;
    const recent = lines.slice(-7);
    const sig = recent.map((l) => `${l.who}|${l.text}`).join('\n');
    if (sig === this.chatSig) return;
    this.chatSig = sig;
    // Zeitpunkt des ersten Auftauchens je Zeile merken (für das Ausblenden alter Zeilen)
    const now = performance.now();
    const seen = new Map<string, number>();
    for (const l of recent) {
      const key = `${l.who}|${l.text}`;
      seen.set(key, this.chatSeen.get(key) ?? now);
    }
    this.chatSeen = seen;
    box.innerHTML = '';
    this.chatLines = recent.map((l) => {
      const node = document.createElement('div');
      node.className = 'line';
      const cls = l.team === 'T' ? 't' : l.team === 'CT' ? 'ct' : 'n';
      const radio = l.text.startsWith('[Funk]');
      node.innerHTML = `<span class="who ${cls}">${escapeHtml(l.who)}:</span> <span class="${radio ? 'radio' : ''}">${escapeHtml(l.text)}</span>`;
      box.appendChild(node);
      return { node, t: seen.get(`${l.who}|${l.text}`) ?? now };
    });
  }

  /** Bombenspots/Spawns fürs Radar (A/B-Markierungen). */
  setZones(z: Zones): void {
    this.zones = z;
  }

  setRadar(self: Pose, others: RadarDot[], team: Team, bombPos: Vec3 | null): void {
    const cv = this.radar;
    const c = cv?.getContext('2d');
    if (!c || !cv) return;
    const size = cv.width;
    const view = { size, range: 42 };
    const px = size / 230; // Pixel je Design-Pixel im Radar
    c.clearRect(0, 0, size, size);
    // Raster
    c.strokeStyle = 'rgba(160,190,220,.06)';
    c.lineWidth = 1;
    for (let g = 1; g < 6; g++) {
      const p = (g * size) / 6;
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, size); c.moveTo(0, p); c.lineTo(size, p); c.stroke();
    }
    // Karten-Draufsicht: um den Spieler gedreht (Blickrichtung oben)
    if (this.radarMap) {
      const k = size / 2 / view.range;
      c.save();
      c.translate(size / 2, size / 2);
      c.scale(k, k);
      c.rotate(self.yaw);
      c.translate(-self.x, -self.z);
      c.globalAlpha = 0.9;
      c.imageSmoothingEnabled = true;
      c.drawImage(this.radarMap.canvas, this.radarMap.minX, this.radarMap.minZ, this.radarMap.w, this.radarMap.h);
      c.restore();
    }
    // Bombenspots
    if (this.zones) {
      c.font = `800 ${Math.round(18 * px)}px ${getComputedStyleFont()}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const k of ['a', 'b'] as const) {
        const z = worldToRadar(self.x, self.z, self.yaw, this.zones[k].x, this.zones[k].z, view);
        if (this.radarMap && z.inside) continue; // Radarbild zeigt den Spot schon; sonst Randmarkierung
        const x = Math.max(12 * px, Math.min(size - 12 * px, z.x));
        const y = Math.max(12 * px, Math.min(size - 12 * px, z.y));
        c.fillStyle = 'rgba(255,90,74,.18)';
        c.beginPath(); c.arc(x, y, 13 * px, 0, Math.PI * 2); c.fill();
        c.fillStyle = z.inside ? '#ff8a6a' : 'rgba(255,138,106,.6)';
        c.fillText(k.toUpperCase(), x, y + 1);
      }
    }
    if (bombPos) {
      const b = worldToRadar(self.x, self.z, self.yaw, bombPos.x, bombPos.z, view);
      const blink = Math.floor(performance.now() / 400) % 2 === 0;
      c.fillStyle = blink ? '#ff3b2b' : '#ffb3a8';
      c.fillRect(b.x - 7 * px, b.y - 5 * px, 14 * px, 10 * px);
      c.fillStyle = '#200';
      c.fillRect(b.x - 4 * px, b.y - 2 * px, 8 * px, 4 * px);
    }
    for (const o of others) {
      if (!o.alive) continue;
      if (o.team !== team) continue; // CS-Radar zeigt nur Teamkameraden
      const p = worldToRadar(self.x, self.z, self.yaw, o.x, o.z, view);
      const x = Math.max(5 * px, Math.min(size - 5 * px, p.x));
      const y = Math.max(5 * px, Math.min(size - 5 * px, p.y));
      c.fillStyle = o.team === 'T' ? '#f0a53a' : '#6fa8ff';
      c.strokeStyle = 'rgba(0,0,0,.7)';
      c.lineWidth = 1.5 * px;
      c.beginPath();
      c.arc(x, y, 4.5 * px, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      // Blickrichtung relativ zum eigenen Blick
      const rel = o.yaw - self.yaw;
      c.strokeStyle = c.fillStyle;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - Math.sin(rel) * 9 * px, y - Math.cos(rel) * 9 * px);
      c.stroke();
    }
    // Sichtkegel + eigene Position (Pfeil nach oben)
    const cx = size / 2;
    const grad = c.createRadialGradient(cx, cx, 0, cx, cx, size * 0.45);
    grad.addColorStop(0, 'rgba(255,255,255,.14)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(cx, cx);
    c.arc(cx, cx, size * 0.45, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    c.closePath();
    c.fill();
    c.fillStyle = '#fff';
    c.strokeStyle = 'rgba(0,0,0,.8)';
    c.lineWidth = 1.5 * px;
    c.beginPath();
    c.moveTo(cx, cx - 8 * px);
    c.lineTo(cx - 6 * px, cx + 6 * px);
    c.lineTo(cx, cx + 3 * px);
    c.lineTo(cx + 6 * px, cx + 6 * px);
    c.closePath();
    c.fill();
    c.stroke();
  }

  setRadarLabel(text: string): void {
    this.txt(this.el.radarLabel, text);
  }

  setScoreboard(m: MatchState, localId: string): void {
    this.match = m;
    this.localId = localId;
    if (this.scoreboardVisible) this.renderBoard();
  }

  private renderBoard(): void {
    const m = this.match;
    if (!m) return;
    const sb = scoreboard(m);
    const myTeam = m.players[this.localId]?.team ?? null;
    const rows = (team: Team): string => sb[team].map((p) => {
      const tags = (p.bot ? '<span class="tag bot">BOT</span>' : '')
        + (p.id === this.hostId && !p.bot ? '<span class="tag host">Host</span>' : '')
        + (p.loadout.bomb && team === myTeam ? '<span class="tag c4">C4</span>' : '')
        + (p.loadout.defuseKit ? '<span class="tag kit">Kit</span>' : '');
      const money = team === myTeam ? `<td class="money">${formatMoney(p.money.amount)}</td>` : '<td class="hidden">—</td>';
      return `<tr class="row${p.id === this.localId ? ' me' : ''}${p.alive ? '' : ' dead'}"><td><span class="nm">${escapeHtml(p.name)}</span>${tags}</td>${money}<td>${p.kills}</td><td>${p.deaths}</td><td>${pingText(p.bot, p.ping)}</td></tr>`;
    }).join('');
    const block = (team: Team): string => {
      const alive = sb[team].filter((p) => p.alive).length;
      return `<div class="hud-bteam ${team === 'T' ? 't' : 'ct'}"><div class="th"><b>${TEAM_NAME[team]}</b><span>${team === 'T' ? m.round.tRounds : m.round.ctRounds} Runden · ${alive}/${sb[team].length} am Leben</span></div>
        <table><thead><tr><th>Name</th><th>Geld</th><th>Kills</th><th>Tode</th><th>Ping</th></tr></thead><tbody>${rows(team) || '<tr><td colspan="5" style="color:var(--c-mute)">Niemand</td></tr>'}</tbody></table></div>`;
    };
    const mapName = this.lastRound?.mapName ?? '';
    const first: Team = myTeam === 'T' ? 'T' : 'CT';
    const second: Team = first === 'T' ? 'CT' : 'T';
    this.html(this.el.board, `<header><span class="map">${escapeHtml(mapName)}</span><span class="meta">Runde ${m.round.round} · ${escapeHtml(phaseLabel(m.round.phase))}</span>
      <div class="vs"><span class="t">${m.round.tRounds}</span><i>:</i><span class="ct">${m.round.ctRounds}</span></div></header>
      <div class="teams ui-scroll">${block(first)}${block(second)}</div>
      <footer><span>Erster mit 16 Rundensiegen gewinnt</span><span>Geld nur für das eigene Team sichtbar</span></footer>`);
  }

  // ---------------------------------------------------------------- Menüs

  private buyContext(): BuyContext | null {
    const p = this.lastPlayer;
    if (!p) return null;
    const slots = this.lastShooter?.slots ?? [];
    return { team: p.team, money: p.money, primary: slots[0] ?? null, secondary: slots[1] ?? null, armor: p.armor, helmet: p.helmet, kit: p.hasKit, nades: p.nades };
  }

  private openBuy(): void {
    if (!this.lastPlayer?.canBuy || !this.lastPlayer.alive) {
      this.notice('Kaufen nur in der Kaufzone während der Kaufzeit');
      return;
    }
    this.buyOpen = true;
    this.buyCategory = null;
    this.buyMsg = '';
    this.renderBuy();
    this.cls(this.el.buyModal, 'on', true);
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* egal */ }
    this.onMenuChange?.(true);
  }

  private closeBuy(): void {
    if (!this.buyOpen) return;
    this.buyOpen = false;
    this.cls(this.el.buyModal, 'on', false);
    this.onMenuChange?.(false);
  }

  private renderBuy(): void {
    const ctx = this.buyContext();
    if (!ctx) return;
    const top = buyTopLevel();
    const nav = top.map((e) => {
      const on = this.buyCategory === e.id;
      const price = e.price !== null ? `<span class="p${e.price > ctx.money ? ' no' : ''}">$${e.price}</span>` : '';
      return `<div class="hud-cat${on ? ' on' : ''}" data-act="${e.kind === 'ammo' ? e.id : 'cat'}" data-id="${e.id}"><span class="k">${e.key}</span><span class="n">${escapeHtml(e.name)}</span>${price}</div>`;
    }).join('');
    let body: string;
    if (!this.buyCategory) {
      const rep: Record<string, string> = { pistol: 'deagle', shotgun: 'm3', smg: 'mp5', rifle: ctx.team === 'T' ? 'ak47' : 'm4a1', mg: 'm249', ammo1: 'ammo', ammo2: 'ammo', equipment: 'kevlar' };
      body = `<h4>Kategorie wählen</h4><div class="hud-tiles">${top.map((e) => `<div class="hud-tile" data-act="${e.kind === 'ammo' ? e.id : 'cat'}" data-id="${e.id}">${weaponIconSvg(rep[e.id] ?? 'ak47')}<span class="n">${escapeHtml(e.name)}</span><span class="k">[${e.key}]</span></div>`).join('')}</div>`;
    } else {
      const items = buyCategoryItems(this.buyCategory, ctx);
      const title = top.find((e) => e.id === this.buyCategory)?.name ?? '';
      body = `<h4>${escapeHtml(title)} · <span style="color:var(--c-mute)">0 = zurück</span></h4><div class="hud-cards">${items.map((it) => this.buyCard(it)).join('')}</div>`;
    }
    const phase = this.lastRound?.phase;
    const time = phase === 'freeze' ? 'Kaufphase' : phase === 'warmup' ? 'Aufwärmen' : 'Kaufzeit läuft';
    this.html(this.el.buy, `<header><h3>Kaufmenü</h3><span class="team ${ctx.team === 'T' ? 't' : 'ct'}">${TEAM_NAME[ctx.team]}</span><span class="time">${escapeHtml(time)}</span><span class="cash">${formatMoney(ctx.money)}</span></header>
      <nav>${nav}</nav><section class="ui-scroll">${body}</section>
      <footer><span><span class="ui-kbd">1</span>–<span class="ui-kbd">8</span> wählen</span><span><span class="ui-kbd">0</span> zurück</span><span><span class="ui-kbd">B</span>/<span class="ui-kbd">Esc</span> schließen</span><span class="msg">${escapeHtml(this.buyMsg)}</span></footer>`);
  }

  private buyCard(it: BuyItemView): string {
    const def = WEAPONS[it.id];
    const st = def && def.type !== 'grenade' ? weaponStatBars(def) : null;
    const stats = st ? `<div class="stats"><span>Schaden</span><i><b style="width:${Math.round(st.damage * 100)}%"></b></i><span>Kadenz</span><i><b style="width:${Math.round(st.rate * 100)}%"></b></i><span>Präzision</span><i><b style="width:${Math.round(st.accuracy * 100)}%"></b></i><span>Magazin</span><span style="color:#cfd6de">${st.mag}</span></div>` : '';
    const badge = buyStateText(it.state, it.team);
    return `<div class="hud-card ${it.state}" data-act="buy" data-id="${it.id}" data-state="${it.state}"><div class="top"><span class="k">${it.key ?? '–'}</span><span class="price">$${it.price}</span></div>
      <div class="art">${weaponIconSvg(it.id)}</div><div class="name">${escapeHtml(it.name)}</div>${stats}${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ''}</div>`;
  }

  private readonly onBuyClick = (e: MouseEvent): void => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const id = t.dataset.id ?? '';
    if (act === 'cat') { this.buyCategory = id as BuyCategory; this.renderBuy(); }
    else if (act === 'ammo1') this.buyAmmo(1);
    else if (act === 'ammo2') this.buyAmmo(2);
    else if (act === 'buy') this.buyItem(id, t);
  };

  private buyItem(id: string, card?: HTMLElement | null): void {
    const ctx = this.buyContext();
    if (!ctx) return;
    const items = this.buyCategory ? buyCategoryItems(this.buyCategory, ctx) : [];
    const it = items.find((i) => i.id === id);
    if (it && it.state !== 'ok') {
      this.buyMsg = `${it.name}: ${buyStateText(it.state, it.team)}`;
      this.renderBuy();
      return;
    }
    this.buyMsg = '';
    this.onBuy?.(id);
    const el = card ?? this.el.buy?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    el?.classList.add('flash');
  }

  private buyAmmo(slot: 1 | 2): void {
    this.onBuyAmmo?.(slot);
  }

  private buyKey(code: string): boolean {
    const ctx = this.buyContext();
    if (!ctx) return false;
    const n = /^(?:Digit|Numpad)(\d)$/.exec(code)?.[1];
    if (code === 'Escape' || code === 'KeyB') { this.closeBuy(); return true; }
    if (!n) return true;
    const k = Number(n);
    if (!this.buyCategory) {
      const e = buyTopLevel().find((x) => x.key === k);
      if (!e) return true;
      if (e.kind === 'category') { this.buyCategory = e.id as BuyCategory; this.renderBuy(); }
      else this.buyAmmo(e.id === 'ammo1' ? 1 : 2);
      return true;
    }
    if (k === 0) { this.buyCategory = null; this.renderBuy(); return true; }
    const it = buyCategoryItems(this.buyCategory, ctx).find((i) => i.key === k);
    if (it) this.buyItem(it.id);
    return true;
  }

  private openRadio(menu: RadioMenu): void {
    this.radio = menu;
    this.html(this.el.radio, `<h4>${escapeHtml(menu.title)}</h4>` + menu.items.map((t, i) => `<div><b>${i + 1}</b>${escapeHtml(t)}</div>`).join('') + '<small>0 / Esc schließen</small>');
    this.cls(this.el.radio, 'on', true);
  }

  private closeRadio(): void {
    this.radio = null;
    this.cls(this.el.radio, 'on', false);
  }

  private openChat(team = false): void {
    this.chatTeam = team;
    this.txt(this.el.chatLabel, team ? 'Team' : 'Alle');
    this.chatInput!.placeholder = team ? 'Nachricht an dein Team …' : 'Nachricht an alle …';
    this.chatOpen = true;
    this.cls(this.el.chatin, 'on', true);
    this.cls(this.el.chat, 'open', true);
    this.chatInput!.focus();
    this.onMenuChange?.(true);
  }

  private closeChat(): void {
    this.chatOpen = false;
    this.cls(this.el.chatin, 'on', false);
    this.cls(this.el.chat, 'open', false);
    this.chatInput!.blur();
    this.onMenuChange?.(false);
  }

  private openTeam(): void {
    this.teamOpen = true;
    const m = this.match;
    const count = (t: Team): number => (m ? Object.values(m.players).filter((p) => p.team === t).length : 0);
    this.html(this.el.team, `<h3>Team wählen</h3><div class="row">
      <div class="hud-tcard t" data-team="T"><span class="ui-kbd k">1</span>${ICON.teamT}<span class="n">Terroristen</span><span class="c">${count('T')} Spieler</span></div>
      <div class="hud-tcard ct" data-team="CT"><span class="ui-kbd k">2</span>${ICON.teamCT}<span class="n">Counter-Terroristen</span><span class="c">${count('CT')} Spieler</span></div>
      </div><small>Esc / M schließen</small>`);
    this.cls(this.el.teamModal, 'on', true);
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* egal */ }
    this.onMenuChange?.(true);
  }

  private readonly onTeamClick = (e: MouseEvent): void => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-team]');
    if (t) { this.onTeam?.(t.dataset.team as Team); this.closeTeam(); }
  };

  private closeTeam(): void {
    this.teamOpen = false;
    this.cls(this.el.teamModal, 'on', false);
    this.onMenuChange?.(false);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.chatOpen) return;
    if (this.buyOpen) {
      if (this.buyKey(e.code)) e.preventDefault();
      return;
    }
    if (this.teamOpen) {
      if (e.code === 'Digit1') this.onTeam?.('T');
      if (e.code === 'Digit2') this.onTeam?.('CT');
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Escape' || e.code === 'KeyM') this.closeTeam();
      return;
    }
    if (e.code === 'KeyB') this.openBuy();
    else if (this.radio) {
      const d = /^Digit(\d)$/.exec(e.code)?.[1];
      if (d !== undefined) {
        const text = radioPick(this.radio, Number(d));
        if (text) this.onRadio?.(text);
        this.closeRadio();
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (e.code === 'Escape' || radioMenuFor(e.code)) this.closeRadio();
    }
    else if (radioMenuFor(e.code)) this.openRadio(radioMenuFor(e.code)!);
    else if (e.code === 'KeyY' || e.code === 'Enter') { this.openChat(false); e.preventDefault(); }
    else if (e.code === 'KeyU') { this.openChat(true); e.preventDefault(); }
    else if (e.code === 'KeyM') this.openTeam();
    else if (e.code === 'Tab') {
      if (!this.scoreboardVisible) {
        this.scoreboardVisible = true;
        this.scoreTimer = 0;
        this.renderBoard();
        this.cls(this.el.boardModal, 'on', true);
      }
      e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') {
      this.scoreboardVisible = false;
      this.cls(this.el.boardModal, 'on', false);
    }
  };
}

let fontCache = '';
/** Display-Schrift fürs Radar-Canvas (aus den CSS-Variablen, einmal gelesen). */
function getComputedStyleFont(): string {
  if (!fontCache) {
    try {
      fontCache = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';
    } catch {
      fontCache = 'sans-serif';
    }
  }
  return fontCache;
}
