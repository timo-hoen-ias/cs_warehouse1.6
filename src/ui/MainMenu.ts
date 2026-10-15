import './theme.css';
import './menu.css';
import { MAPS, mapById } from '../logic/maps';
import { roomCode, sanitizeName } from '../logic/net';
import { ROUND } from '../logic/round';
import { BOMB } from '../logic/bombs';
import { formatClock, escapeHtml } from '../logic/hudFormat';
import {
  BOT_DIFFICULTIES, MENU_ENTRIES, SCREEN_TITLES, clampMaxPlayers, currentScreen, difficultyForSkill, fillForTeamSize, goBack, initialMenu,
  moveFocus, openScreen, sanitizeSavedSetup, teamSizeForFill, validServerUrl, type GameSetup, type LaunchInfo, type MenuScreen, type MenuState,
} from '../logic/menu';
import {
  GAME_VERSION, filterServers, joinBlockReason, latencyInfo, normalizeRoomCode, playersText, serverStatusText, sortServers, validRoomCode,
  type ServerEntry, type ServerFilter, type ServerList, type ServerSortKey,
} from '../logic/serverList';
import { MAX_PLAYERS_MAX, MAX_PLAYERS_MIN } from '../logic/lobby';
import { musicGain } from '../logic/music';
import { computeUiScale } from '../logic/uiScale';
import type { KeyValueStore, Settings } from '../logic/settings';
import { SettingsMenu } from './SettingsMenu';
import { MenuBackdrop, type MenuBackdropLike } from './MenuBackdrop';
import { MenuMusic } from './MenuMusic';
import { mapPreviewElement, mapSeed, type MapLike } from './mapPreview';
import { ServerBrowserClient } from '../multi/Discovery';
import { uiSound } from './uiSound';
import { ICON } from './icons';
import type { Team } from '../logic/economy';

const STORE_KEY = 'csw16.lobby';

export type MainMenuOptions = {
  store: KeyValueStore | null;
  launch: LaunchInfo;
  quality: 'high' | 'low';
  /** Meldung beim Öffnen (z. B. „Server ist voll“ nach einem Kick). */
  message?: string | null;
  /** Eigener Hintergrund (z. B. späterer 3D-Kameraflug); Standard: Canvas-Key-Art. */
  backdrop?: MenuBackdropLike;
};

/** Logo als SVG: Schablonen-Schrift mit Abnutzung, Warnstreifen, „1.6“-Plakette. */
export function logoSvg(): string {
  return `<svg viewBox="0 0 600 215" role="img" aria-label="CS:Warehouse 1.6">
  <defs>
    <linearGradient id="lg-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d9dde2"/><stop offset=".56" stop-color="#b4bbc4"/><stop offset="1" stop-color="#e9ecef"/></linearGradient>
    <pattern id="lg-haz" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="11" height="22" fill="#ffc21a"/><rect x="11" width="11" height="22" fill="#141414"/></pattern>
    <filter id="lg-wear" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -14 10.6"/><feComposite in="SourceGraphic" operator="in"/></filter>
    <mask id="lg-stencil"><rect width="600" height="215" fill="#fff"/><rect x="0" y="57" width="600" height="6" fill="#000"/><rect x="0" y="34" width="600" height="2" fill="#000" opacity=".6"/></mask>
    <filter id="lg-glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <text x="2" y="22" font-family="var(--font-display)" font-weight="700" font-size="15" letter-spacing="7" fill="#ffc21a" textLength="330" lengthAdjust="spacingAndGlyphs">TERRORISTEN VS. COUNTER-TERRORISTEN</text>
  <g mask="url(#lg-stencil)" filter="url(#lg-wear)">
    <text x="0" y="112" font-family="var(--font-display)" font-weight="900" font-size="104" fill="url(#lg-metal)" stroke="#0b0d10" stroke-width="2" paint-order="stroke" textLength="596" lengthAdjust="spacingAndGlyphs">CS:WAREHOUSE</text>
  </g>
  <rect x="0" y="126" width="424" height="20" fill="url(#lg-haz)"/>
  <rect x="0" y="126" width="424" height="20" fill="none" stroke="#0b0d10" stroke-width="2"/>
  <g filter="url(#lg-glow)"><rect x="436" y="118" width="160" height="62" rx="3" fill="#ffc21a"/></g>
  <text x="452" y="168" font-family="var(--font-display)" font-weight="900" font-size="56" fill="#111" textLength="128" lengthAdjust="spacingAndGlyphs">1.6</text>
  <text x="0" y="176" font-family="var(--font-display)" font-weight="700" font-size="17" letter-spacing="5" fill="#9aa3ae" textLength="420" lengthAdjust="spacingAndGlyphs">BOMBENENTSCHÄRFUNG IM HOCHREGALLAGER</text>
  <text x="0" y="205" font-family="var(--font-mono)" font-size="12" fill="#66707c" letter-spacing="2">HALLE 7 · TOR 3 · LAGERORT A-14-03</text>
</svg>`;
}

function loadSaved(store: KeyValueStore | null): GameSetup {
  let raw: unknown = null;
  try { raw = JSON.parse(store?.getItem(STORE_KEY) ?? 'null'); } catch { raw = null; }
  return sanitizeSavedSetup(raw, MAPS[0]!.id, MAPS.map((m) => m.id));
}

function save(store: KeyValueStore | null, s: GameSetup): void {
  try {
    const { password: _pw, ...rest } = s;
    void _pw;
    store?.setItem(STORE_KEY, JSON.stringify(rest));
  } catch { /* privat/blockiert */ }
}

const TIPS = [
  'Gegenziehen! Automatikwaffen haben feste Spray-Muster — die ersten Schüsse treffen am besten.',
  'Shift-Laufen macht keine Schritte hörbar: Schleiche zu den Bombenspots.',
  'Das Entschärfungs-Kit (200 $) halbiert die Entschärfungszeit auf 5 Sekunden.',
  'Rauchgranaten blockieren die Sicht der Bots — perfekt, um einen Spot zu nehmen.',
  'Verlorene Runden bringen mehr Geld: Sparrunden lohnen sich.',
  'Z, X und C öffnen die Funkbefehle wie in CS 1.6.',
];

/**
 * Hauptmenü (DOM): animierter Hintergrund, Logo, Navigation (Maus, Tastatur, Gamepad),
 * Einzelspieler-Setup, Serverbrowser mit Erkennung, Server erstellen, Einstellungen,
 * Hilfe, Credits, Beenden; Menümusik mit Stumm-Knopf. Liefert das Spiel-Setup.
 */
export function showMainMenu(opts: MainMenuOptions): Promise<GameSetup> {
  return new Promise((resolve) => new MainMenu(opts, resolve).mount());
}

class MainMenu {
  private root!: HTMLDivElement;
  private state: MenuState;
  private setup: GameSetup;
  private readonly settings: SettingsMenu;
  private settingsMounted = false;
  private readonly music = new MenuMusic();
  private readonly backdrop: MenuBackdropLike;
  private readonly browser = new ServerBrowserClient();
  private servers: ServerList = {};
  private filter: ServerFilter = { notFull: false, notEmpty: false, noPassword: false, search: '' };
  private sort: { key: ServerSortKey; dir: 'asc' | 'desc' } = { key: 'players', dir: 'desc' };
  private selected: string | null = null;
  private navFocus = 0;
  private padRaf = 0;
  private padPrev: boolean[] = [];
  private tipIdx = 0;
  private tipTimer = 0;
  private done = false;
  private pendingJoin: ServerEntry | { room: string; map: string } | null = null;

  constructor(private readonly opts: MainMenuOptions, private readonly resolve: (s: GameSetup) => void) {
    const saved = loadSaved(opts.store);
    const l = opts.launch;
    this.setup = {
      ...saved,
      mapId: l.map && MAPS.some((m) => m.id === l.map) ? l.map : saved.mapId,
      server: l.server || saved.server,
    };
    this.state = initialMenu(l.room ? 'browser' : l.screen);
    this.settings = new SettingsMenu(opts.store);
    this.settings.onChange = (s) => this.applySettings(s);
    this.settings.onClose = () => this.go('main');
    this.backdrop = opts.backdrop ?? new MenuBackdrop(opts.quality);
    this.tipIdx = Math.floor(Math.random() * TIPS.length);
  }

  // ---------------------------------------------------------------- Aufbau

  mount(): void {
    const root = document.createElement('div');
    root.className = 'mm ui-scope';
    root.id = 'mm';
    this.root = root;
    const nav = MENU_ENTRIES.map((e, i) => `<button class="mm-item${e.screen === 'quit' ? ' quit' : ''}" data-go="${e.screen}" style="animation-delay:${0.25 + i * 0.06}s"><span class="l">${escapeHtml(e.label)}</span><span class="s">${escapeHtml(e.sub)}</span></button>`).join('');
    root.innerHTML = `
      <div class="mm-shade"></div><div class="mm-scan"></div><canvas class="mm-grain"></canvas>
      <header class="mm-top">
        <div class="mm-profile">${ICON.user}<label for="mm-name">Spielername</label><input id="mm-name" maxlength="16" spellcheck="false" autocomplete="nickname"></div>
        <button class="mm-icon" id="mm-mute" title="Musik an/aus (M)" aria-label="Musik an/aus"></button>
      </header>
      <aside class="mm-side">
        <div class="mm-logo">${logoSvg()}</div>
        <nav class="mm-nav">${nav}</nav>
        <div class="mm-ver">Version ${GAME_VERSION} · Needle Engine · ${MAPS.length} Karten</div>
      </aside>
      <main class="mm-stage">
        <section class="mm-screen" data-screen="main">${this.homeHtml()}</section>
        <section class="mm-screen" data-screen="single"></section>
        <section class="mm-screen" data-screen="browser"></section>
        <section class="mm-screen" data-screen="create"></section>
        <section class="mm-screen" data-screen="settings"></section>
        <section class="mm-screen" data-screen="help"></section>
        <section class="mm-screen" data-screen="credits"></section>
        <section class="mm-screen" data-screen="quit"></section>
        <div class="mm-dialog" id="mm-dialog"></div>
      </main>
      <footer class="mm-foot">
        <div class="mm-np paused" id="mm-np"><span class="eq"><i></i><i></i><i></i></span><span id="mm-np-t">Musik</span></div>
        <span class="mm-hint" id="mm-sound-hint">Klicken für Ton</span>
        <div class="mm-keyhelp"><span><span class="ui-kbd">↑</span><span class="ui-kbd">↓</span>Auswahl</span><span><span class="ui-kbd">Enter</span>Bestätigen</span><span><span class="ui-kbd">Esc</span>Zurück</span></div>
      </footer>`;
    document.body.appendChild(root);
    this.backdrop.mount(root);
    this.backdrop.setMood?.(mapSeed(this.setup.mapId));
    this.paintGrain();
    const nameInput = this.q<HTMLInputElement>('#mm-name');
    nameInput.value = this.setup.name;
    nameInput.addEventListener('input', () => { this.setup.name = sanitizeName(nameInput.value); });
    nameInput.addEventListener('change', () => { nameInput.value = this.setup.name; this.persist(); });

    // Klänge + Musik
    root.addEventListener('pointerover', this.onHover);
    root.addEventListener('click', this.onClick);
    root.addEventListener('dblclick', this.onDblClick);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('pointerdown', this.unlockAudio, true);
    document.addEventListener('keydown', this.unlockAudio, true);
    window.addEventListener('resize', this.onResize);
    this.music.onTrack = (t) => { this.q('#mm-np-t').innerHTML = `<b>${escapeHtml(t.author)}</b> — ${escapeHtml(t.title)} <span style="opacity:.6">(${escapeHtml(t.license)})</span>`; };
    this.music.onBlocked = (b) => {
      this.q('#mm-sound-hint').classList.toggle('on', b && musicGain(this.settings.settings) > 0);
      this.q('#mm-np').classList.toggle('paused', b);
    };
    this.onResize();
    this.applySettings(this.settings.settings);
    this.music.start(musicGain(this.settings.settings));
    this.render();
    if (this.opts.message) this.showMessage(this.opts.message);
    this.padRaf = requestAnimationFrame(this.pollPad);
    this.tipTimer = window.setInterval(() => this.rotateTip(), 9000);
    // Erstes sinnvolles Element fokussieren
    requestAnimationFrame(() => this.focusDefault());
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T;
  }

  private screenEl(s: MenuScreen): HTMLElement {
    return this.q(`[data-screen="${s}"]`);
  }

  private readonly onResize = (): void => {
    document.documentElement.style.setProperty('--u', `${computeUiScale(window.innerWidth, window.innerHeight, 1)}px`);
  };

  private paintGrain(): void {
    const c = this.q<HTMLCanvasElement>('.mm-grain');
    c.width = 160;
    c.height = 160;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    c.style.width = '200%';
    c.style.height = '200%';
    c.style.imageRendering = 'pixelated';
  }

  private applySettings(s: Settings): void {
    this.music.setGain(musicGain(s));
    uiSound.setVolume(s.volume);
    const mute = this.q('#mm-mute');
    const silent = musicGain(s) === 0;
    mute.innerHTML = silent ? ICON.speakerOff : ICON.speakerOn;
    mute.classList.toggle('muted', silent);
    if (silent) this.q('#mm-sound-hint').classList.remove('on');
  }

  private readonly unlockAudio = (): void => {
    uiSound.unlock();
    if (this.music.isBlocked) this.music.retry();
  };

  // ---------------------------------------------------------------- Navigation

  private go(to: MenuScreen): void {
    const before = currentScreen(this.state);
    this.state = openScreen(this.state, to);
    if (currentScreen(this.state) !== before) uiSound.play(to === 'main' ? 'back' : 'click');
    this.render();
  }

  private back(): void {
    const before = currentScreen(this.state);
    this.state = goBack(this.state);
    if (currentScreen(this.state) !== before) uiSound.play('back');
    this.render();
    this.focusDefault();
  }

  private render(): void {
    const cur = currentScreen(this.state);
    this.root.classList.toggle('sub', cur !== 'main');
    for (const s of this.root.querySelectorAll<HTMLElement>('.mm-screen')) s.classList.toggle('on', s.dataset.screen === cur);
    for (const b of this.root.querySelectorAll<HTMLElement>('.mm-item')) b.classList.toggle('on', b.dataset.go === cur);
    if (cur === 'single') this.renderSingle();
    if (cur === 'create') this.renderCreate();
    if (cur === 'browser') { this.renderBrowser(); this.browser.start(this.setup.server); }
    else this.browser.stop();
    if (cur === 'settings') this.renderSettings();
    if (cur === 'help') this.screenEl('help').innerHTML = this.card('help', this.helpHtml());
    if (cur === 'credits') this.screenEl('credits').innerHTML = this.card('credits', this.creditsHtml());
    if (cur === 'quit') this.quit();
    if (cur === 'main') {
      this.screenEl('main').innerHTML = this.homeHtml();
      this.fillPreviews(this.screenEl('main'));
    }
  }

  private focusDefault(): void {
    const cur = currentScreen(this.state);
    if (cur === 'main') {
      const items = this.navItems();
      items[this.navFocus]?.focus({ preventScroll: true });
      return;
    }
    const el = this.screenEl(cur).querySelector<HTMLElement>('[data-autofocus]') ?? this.screenEl(cur).querySelector<HTMLElement>('button, input');
    el?.focus({ preventScroll: true });
  }

  private navItems(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>('.mm-item')];
  }

  private card(screen: MenuScreen, body: string, footer = '', right = ''): string {
    return `<div class="mm-card"><div class="ui-hazard"></div><div class="mm-card-h"><button class="mm-back" data-act="back" title="Zurück (Esc)">${ICON.back}</button><h2 class="ui-title">${escapeHtml(SCREEN_TITLES[screen])}</h2><div class="right">${right}</div></div>
      <div class="mm-card-b ui-scroll">${body}</div>${footer ? `<div class="mm-card-f">${footer}</div>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- Startseite

  private homeHtml(): string {
    const m = mapById(this.setup.mapId);
    return `<div class="mm-home"><div class="mm-feature"><div class="pv" data-preview="${escapeHtml(m.id)}" data-w="624" data-h="264"><span class="tag">Karte</span></div>
      <div class="txt"><h3>${escapeHtml(m.name)}</h3><p>${escapeHtml(m.description)}</p>
      <div class="row"><button class="ui-btn primary" data-act="quick">▶ Schnellstart</button><button class="ui-btn" data-go="browser">Serverbrowser</button></div></div></div>
      <div class="mm-tips"><b>Tipp</b><span id="mm-tip">${escapeHtml(TIPS[this.tipIdx % TIPS.length]!)}</span></div></div>`;
  }

  private rotateTip(): void {
    this.tipIdx++;
    const el = this.root.querySelector('#mm-tip');
    if (el) el.textContent = TIPS[this.tipIdx % TIPS.length]!;
  }

  /** Vorschaubilder nachträglich einsetzen (Canvas/Bild). */
  private fillPreviews(scope: HTMLElement): void {
    for (const pv of scope.querySelectorAll<HTMLElement>('[data-preview]')) {
      if (pv.querySelector('canvas, img')) continue;
      const m = mapById(pv.dataset.preview) as MapLike;
      pv.prepend(mapPreviewElement(m, Number(pv.dataset.w ?? 384), Number(pv.dataset.h ?? 216)));
    }
  }

  // ---------------------------------------------------------------- Einzelspieler

  private mapCards(): string {
    return `<div class="mm-maps">${MAPS.map((m) => `<button class="mm-map${m.id === this.setup.mapId ? ' on' : ''}" data-map="${escapeHtml(m.id)}"><div class="pv" data-preview="${escapeHtml(m.id)}"></div>
      <div class="info"><div class="n">${escapeHtml(m.name)}</div><div class="id">${escapeHtml(m.id)}</div><div class="d">${escapeHtml(m.description)}</div></div></button>`).join('')}</div>`;
  }

  private teamSeg(): string {
    const t = this.setup.team;
    return `<div class="ui-seg" data-seg="team"><button data-v="auto" class="${t === 'auto' ? 'on' : ''}">Automatisch</button><button data-v="T" class="t ${t === 'T' ? 'on' : ''}">Terroristen</button><button data-v="CT" class="ct ${t === 'CT' ? 'on' : ''}">Counter-T.</button></div>`;
  }

  private diffSeg(): string {
    const d = difficultyForSkill(this.setup.botSkill);
    return `<div class="ui-seg" data-seg="skill">${BOT_DIFFICULTIES.map((x) => `<button data-v="${x.skill}" class="${x.id === d.id ? 'on' : ''}">${escapeHtml(x.label)}</button>`).join('')}</div>`;
  }

  private renderSingle(): void {
    const size = teamSizeForFill(this.setup.fillTo);
    const body = `<div class="mm-setup"><div>${this.mapCards()}</div><div class="mm-form">
      <div class="mm-field"><span class="ui-label">Team</span>${this.teamSeg()}</div>
      <div class="mm-field"><span class="ui-label">Teamgröße</span><div class="row"><input type="range" class="ui-range" min="1" max="8" step="1" value="${size}" data-range="teamsize"><span class="val" id="mm-teamsize">${size} gegen ${size}</span></div><small>Freie Plätze füllen Bots auf — in beiden Teams.</small></div>
      <div class="mm-field"><span class="ui-label">Bot-Schwierigkeit</span>${this.diffSeg()}</div>
      <div class="mm-facts"><div class="mm-fact"><b>${formatClock(ROUND.roundTime)}</b><span>Rundenzeit</span></div><div class="mm-fact"><b>${BOMB.fuseTime} s</b><span>Bombenzünder</span></div><div class="mm-fact"><b>${ROUND.scoreToWin}</b><span>Siege zum Match</span></div></div>
    </div></div>`;
    const footer = `<span class="note">Offline gegen Bots · Karte: <b id="mm-mapname">${escapeHtml(mapById(this.setup.mapId).name)}</b></span><span class="grow"></span><button class="ui-btn primary big" data-act="start-single" data-autofocus>▶ Spiel starten</button>`;
    const el = this.screenEl('single');
    el.innerHTML = this.card('single', body, footer);
    this.paintRanges(el);
    this.fillPreviews(el);
  }

  // ---------------------------------------------------------------- Server erstellen

  private renderCreate(): void {
    const s = this.setup;
    const body = `<div class="mm-setup"><div>${this.mapCards()}</div><div class="mm-form">
      <div class="mm-field"><label class="ui-label" for="mm-sname">Servername</label><input id="mm-sname" class="ui-input" maxlength="32" value="${escapeHtml(s.serverName)}" data-autofocus></div>
      <div class="mm-field"><span class="ui-label">Max. Spieler (Menschen)</span><div class="row"><input type="range" class="ui-range" min="${MAX_PLAYERS_MIN}" max="${MAX_PLAYERS_MAX}" step="1" value="${s.maxPlayers}" data-range="max"><span class="val" id="mm-max">${s.maxPlayers}</span></div></div>
      <div class="mm-field"><span class="ui-label">Mit Bots auffüllen bis</span><div class="row"><input type="range" class="ui-range" min="0" max="16" step="1" value="${s.fillTo}" data-range="fill"><span class="val" id="mm-fill">${s.fillTo ? `${s.fillTo} Spieler` : 'keine Bots'}</span></div></div>
      <div class="mm-field"><span class="ui-label">Bot-Schwierigkeit</span>${this.diffSeg()}</div>
      <div class="mm-field"><span class="ui-label">Dein Team</span>${this.teamSeg()}</div>
      <div class="mm-field"><label class="ui-label" for="mm-pw">Passwort (optional)</label><input id="mm-pw" class="ui-input" type="password" maxlength="32" placeholder="leer = offen" value="${escapeHtml(s.password)}" autocomplete="new-password"></div>
      <label class="mm-check"><span>Im Serverbrowser anzeigen</span><input type="checkbox" class="ui-toggle" data-chk="listed" ${s.listed ? 'checked' : ''}></label>
      <label class="mm-check"><span>Serverlobby: Start erst durch dich (Aufwärmen bis dahin)</span><input type="checkbox" class="ui-toggle" data-chk="lobby" ${s.lobby ? 'checked' : ''}></label>
      ${this.serverField()}
    </div></div>`;
    const footer = `<span class="note">Du bist Host — das Spiel läuft in deinem Browser. Teile den Einladungslink aus der Lobby.</span><span class="grow"></span><button class="ui-btn primary big" data-act="start-host">Server erstellen</button>`;
    const el = this.screenEl('create');
    el.innerHTML = this.card('create', body, footer);
    this.paintRanges(el);
    this.fillPreviews(el);
  }

  private serverField(): string {
    return `<details class="mm-adv"${this.setup.server ? ' open' : ''}><summary>Erweitert: eigener Server (LAN/Relay)</summary>
      <input class="ui-input" data-input="server" placeholder="leer = Needle-Netzwerk · LAN: ws://host:9100/socket" value="${escapeHtml(this.setup.server)}"></details>`;
  }

  // ---------------------------------------------------------------- Serverbrowser

  private renderBrowser(): void {
    const l = this.opts.launch;
    const invite = l.room ? `<div class="mm-invite"><span>${ICON.user.replace('<svg', '<svg style="width:22px;height:22px;fill:var(--c-accent)"')}</span><div><b>Einladung: Raum ${escapeHtml(l.room)}</b><div style="font-size:13px;color:var(--c-dim)">Karte ${escapeHtml(mapById(l.map || this.setup.mapId).name)}</div></div><span class="grow" style="flex:1"></span><button class="ui-btn primary" data-act="join-invite" data-autofocus>Beitreten</button></div>` : '';
    const body = `<div class="mm-browser">${invite}
      <div class="mm-toolbar">
        <input class="ui-input" data-input="search" placeholder="Suchen: Name, Karte, Code" value="${escapeHtml(this.filter.search ?? '')}">
        <label class="mm-chk"><input type="checkbox" data-filter="notFull" ${this.filter.notFull ? 'checked' : ''}>Nicht voll</label>
        <label class="mm-chk"><input type="checkbox" data-filter="notEmpty" ${this.filter.notEmpty ? 'checked' : ''}>Nicht leer</label>
        <label class="mm-chk"><input type="checkbox" data-filter="noPassword" ${this.filter.noPassword ? 'checked' : ''}>Ohne Passwort</label>
        <button class="ui-btn small" data-act="refresh">${ICON.refresh.replace('<svg', '<svg style="width:14px;height:14px;fill:currentColor"')} Aktualisieren</button>
        <span class="mm-status"><span class="mm-dot" id="mm-dot"></span><span id="mm-stat">Verbinde …</span></span>
      </div>
      <div class="mm-table-wrap ui-scroll" id="mm-table"></div>
      ${this.serverField()}
    </div>`;
    const footer = `<div class="mm-join"><span class="ui-label">Per Code</span><input class="ui-input" id="mm-code" maxlength="12" placeholder="K7Q2M" value="${escapeHtml(l.room)}"><button class="ui-btn" data-act="join-code">Beitreten</button></div>
      <span class="grow"></span><button class="ui-btn" data-go="create">Server erstellen</button><button class="ui-btn primary" data-act="join-sel" id="mm-join-sel" disabled>Beitreten</button>`;
    const el = this.screenEl('browser');
    el.innerHTML = this.card('browser', body, footer, `<span class="sub">Eigene Erkennung über ${escapeHtml(this.setup.server ? 'deinen Server' : 'das Needle-Netzwerk')}</span>`);
    this.browser.onChange = (list) => { this.servers = list; this.renderTable(); };
    this.browser.onStatus = (st) => this.setBrowserStatus(st);
    this.renderTable();
  }

  private netState: 'connecting' | 'open' | 'closed' = 'connecting';

  private setBrowserStatus(state: 'connecting' | 'open' | 'closed' = this.netState): void {
    this.netState = state;
    const dot = this.root.querySelector('#mm-dot');
    if (!dot) return;
    dot.classList.toggle('ok', state === 'open');
    const n = Object.keys(this.servers).length;
    this.root.querySelector('#mm-stat')!.textContent = state === 'open' ? `Verbunden · ${n} Server gefunden` : state === 'connecting' ? 'Verbinde mit dem Netzwerk …' : 'Keine Verbindung zum Netzwerk — erneuter Versuch läuft';
  }

  private visibleServers(): ServerEntry[] {
    return sortServers(filterServers(Object.values(this.servers), this.filter), this.sort.key, this.sort.dir);
  }

  private renderTable(): void {
    const wrap = this.root.querySelector<HTMLElement>('#mm-table');
    if (!wrap) return;
    const list = this.visibleServers();
    if (this.selected && !this.servers[this.selected]) this.selected = null;
    const th = (key: ServerSortKey, label: string): string => `<th data-sort="${key}" class="${this.sort.key === key ? `sorted ${this.sort.dir}` : ''}">${label}</th>`;
    if (!list.length) {
      const total = Object.keys(this.servers).length;
      wrap.innerHTML = `<div class="mm-empty"><div class="radar"></div><b>${total ? 'Kein Server passt zum Filter' : 'Suche nach Servern …'}</b>${total ? 'Filter anpassen oder Suche leeren.' : 'Noch kein offenes Spiel gefunden. Erstelle selbst einen Server oder tritt per Code bei.'}</div>`;
    } else {
      wrap.innerHTML = `<table class="mm-table"><thead><tr><th style="width:28px"></th>${th('name', 'Name')}${th('map', 'Karte')}${th('players', 'Spieler')}${th('latency', 'Latenz')}${th('status', 'Status')}</tr></thead><tbody>${list.map((e) => {
        const lat = latencyInfo(e.latency);
        const bad = joinBlockReason(e);
        return `<tr data-room="${escapeHtml(e.room)}" class="${e.room === this.selected ? 'sel' : ''}${bad ? ' bad' : ''}" title="${escapeHtml(bad ?? 'Doppelklick zum Beitreten')}"><td class="lock">${e.hasPassword ? ICON.lock : ''}</td><td><span class="nm">${escapeHtml(e.name)}</span><span class="code">${escapeHtml(e.room)}</span></td><td class="map">${escapeHtml(e.map)}</td><td>${escapeHtml(playersText(e))}</td><td class="lat ${lat.level}">${escapeHtml(lat.text)}</td><td>${escapeHtml(serverStatusText(e))}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    const btn = this.root.querySelector<HTMLButtonElement>('#mm-join-sel');
    const sel = this.selected ? this.servers[this.selected] : null;
    if (btn) btn.disabled = !sel || !!joinBlockReason(sel);
    this.setBrowserStatus();
  }

  // ---------------------------------------------------------------- Einstellungen / Hilfe / Credits

  private renderSettings(): void {
    const el = this.screenEl('settings');
    if (!this.settingsMounted) {
      el.innerHTML = this.card('settings', '<div id="mm-settings" style="height:100%"></div>');
      this.settings.mountInline(el.querySelector('#mm-settings')!);
      el.querySelector<HTMLElement>('.mm-card-b')!.style.padding = '0';
      this.settingsMounted = true;
    }
  }

  private helpHtml(): string {
    const k = (...keys: string[]): string => keys.map((x) => `<span class="ui-kbd">${escapeHtml(x)}</span>`).join('');
    const rows: [string, string][] = [
      [k('W', 'A', 'S', 'D'), 'Bewegen'], [k('Shift'), 'Leise gehen / Sprinten'], [k('Strg'), 'Ducken'], [k('Leertaste'), 'Springen'],
      [k('Maus links'), 'Schießen / Granate weit werfen'], [k('Maus rechts'), 'Zielfernrohr · Messerstich · kurz werfen'], [k('R'), 'Nachladen'], [k('F'), 'Waffe inspizieren'],
      [k('1', '2', '3', '4', '5'), 'Waffenslots'], [k('Q'), 'Letzte Waffe · Mausrad wechselt'], [k('G'), 'Waffe/C4 fallen lassen'], [k('E'), 'Bombe legen / entschärfen (halten)'],
      [k('B'), 'Kaufmenü (1–8 wie CS 1.6)'], [k('Tab'), 'Punktetafel'], [k('Y', 'U'), 'Chat an alle / Team'], [k('Z', 'X', 'C'), 'Funkbefehle'], [k('M'), 'Team wählen'], [k('O'), 'Einstellungen'], [k('Esc'), 'Maus freigeben'],
    ];
    return `<div class="mm-help"><div><h4>Steuerung</h4><table class="mm-keys-t">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${escapeHtml(b)}</td></tr>`).join('')}</table></div>
      <div><h4>Ziel</h4><p>Terroristen legen die C4 an Bombenspot <b>A</b> oder <b>B</b> und verteidigen sie ${BOMB.fuseTime} Sekunden lang. Counter-Terroristen verhindern das oder entschärfen die Bombe (${BOMB.defuseTime} s, mit Kit ${BOMB.defuseKitTime} s). Eliminierung beendet die Runde ebenfalls; läuft die Zeit (${formatClock(ROUND.roundTime)}) ab, gewinnen die CT.</p>
      <h4>Wirtschaft</h4><ul><li>Startgeld 800 $, Rundensieg 3250 $, Niederlage 1400–3400 $ (steigend)</li><li>300 $ pro Kill, Bonus fürs Legen/Entschärfen</li><li>Kaufen nur im Spawn während der Kaufzeit</li></ul>
      <h4 style="margin-top:14px">Mehrspieler</h4><p>„Server erstellen“ startet ein Spiel in deinem Browser (du bist Host). Freunde finden es im Serverbrowser oder per Einladungslink/Code. Verlässt der Host das Spiel, übernimmt automatisch der dienstälteste Spieler.</p></div></div>`;
  }

  private creditsHtml(): string {
    return `<div class="mm-credits">
      <div class="blk"><h4>Spiel</h4><p>cs_warehouse1.6 — ein Counter-Strike-1.6-inspirierter Bomben-Modus in Lagerhallen, erzeugt aus echten Lagerdaten.</p><p>Gebaut mit Needle Engine, three.js, Vite und TypeScript.</p></div>
      <div class="blk"><h4>Musik</h4><p>Menümusik: <b>Derek „JoJo“ Stegall</b> — Tracks aus dem Red-Eclipse-Soundpaket, lizenziert unter <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA</a>.</p><p>Quelle: <a href="https://github.com/redeclipse/sounds" target="_blank" rel="noopener">github.com/redeclipse/sounds</a> · Bearbeitung: Lautheit normalisiert, neu kodiert (OGG Vorbis).</p></div>
      <div class="blk"><h4>Grafik & Ton</h4><p>Waffen, Figuren, Lagerhalle und Effekte sind prozedural erzeugt; Soundeffekte und Menüklänge werden zur Laufzeit synthetisiert.</p></div>
      <div class="blk"><h4>Hinweis</h4><p>Fan-Projekt ohne Verbindung zu Valve. „Counter-Strike“ ist eine Marke der Valve Corporation.</p></div></div>`;
  }

  // ---------------------------------------------------------------- Beenden

  private quit(): void {
    this.music.fadeOut(1.2).catch(() => undefined);
    const q = document.createElement('div');
    q.className = 'mm-quit ui-scope';
    q.innerHTML = '<div><h1>Danke fürs Spielen!</h1><p>Du kannst diesen Tab jetzt schließen.</p><p style="margin-top:22px"><button class="ui-btn" id="mm-unquit">Zurück zum Menü</button></p></div>';
    document.body.appendChild(q);
    this.backdrop.setPaused(true);
    q.querySelector('#mm-unquit')!.addEventListener('click', () => {
      q.remove();
      this.backdrop.setPaused(false);
      this.music.start(musicGain(this.settings.settings));
      this.state = initialMenu();
      this.render();
    });
    setTimeout(() => { try { window.close(); } catch { /* Browser erlaubt es nur für Skript-Fenster */ } }, 900);
  }

  // ---------------------------------------------------------------- Ereignisse

  private readonly onHover = (e: PointerEvent): void => {
    const t = (e.target as HTMLElement).closest('button, .mm-map, tr[data-room], .mm-item');
    if (t && !t.contains(e.relatedTarget as Node | null)) uiSound.play('hover');
  };

  private readonly onClick = (e: MouseEvent): void => {
    const el = e.target as HTMLElement;
    const go = el.closest<HTMLElement>('[data-go]');
    if (go) { this.go(go.dataset.go as MenuScreen); return; }
    const act = el.closest<HTMLElement>('[data-act]');
    if (act) { this.action(act.dataset.act!); return; }
    const map = el.closest<HTMLElement>('[data-map]');
    if (map) { this.selectMap(map.dataset.map!); return; }
    const seg = el.closest<HTMLElement>('[data-seg] [data-v]');
    if (seg) { this.segment(seg.parentElement!.dataset.seg!, seg.dataset.v!, seg.parentElement!); return; }
    const sort = el.closest<HTMLElement>('th[data-sort]');
    if (sort) {
      const key = sort.dataset.sort as ServerSortKey;
      this.sort = this.sort.key === key ? { key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'players' ? 'desc' : 'asc' };
      this.renderTable();
      return;
    }
    const row = el.closest<HTMLElement>('tr[data-room]');
    if (row) { this.selected = row.dataset.room!; this.renderTable(); uiSound.play('click'); return; }
    const mute = el.closest('#mm-mute');
    if (mute) { this.toggleMute(); return; }
    if (el.closest('#mm-sound-hint')) this.unlockAudio();
  };

  private readonly onDblClick = (e: MouseEvent): void => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('tr[data-room]');
    if (row) { this.selected = row.dataset.room!; this.joinSelected(); }
  };

  private toggleMute(): void {
    const s = this.settings.settings;
    const silent = musicGain(s) === 0;
    // Stumm aufheben: falls die Musiklautstärke 0 war, auf Standard zurück
    this.settings.update(silent ? { musicMuted: false, musicVolume: s.musicVolume > 0 ? s.musicVolume : 0.5 } : { musicMuted: true });
    uiSound.play('click');
    this.unlockAudio();
  }

  private selectMap(id: string): void {
    this.setup.mapId = mapById(id).id;
    for (const b of this.root.querySelectorAll<HTMLElement>('.mm-map')) b.classList.toggle('on', b.dataset.map === this.setup.mapId);
    const n = this.root.querySelector('#mm-mapname');
    if (n) n.textContent = mapById(id).name;
    this.backdrop.setMood?.(mapSeed(this.setup.mapId));
    uiSound.play('click');
  }

  private segment(kind: string, v: string, seg: HTMLElement): void {
    if (kind === 'team') this.setup.team = v as Team | 'auto';
    if (kind === 'skill') this.setup.botSkill = Number(v);
    for (const b of seg.querySelectorAll<HTMLElement>('[data-v]')) b.classList.toggle('on', b.dataset.v === v);
    uiSound.play('click');
  }

  private paintRanges(scope: HTMLElement): void {
    for (const r of scope.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      const paint = (): void => r.style.setProperty('--p', `${((Number(r.value) - Number(r.min)) / Math.max(1, Number(r.max) - Number(r.min))) * 100}%`);
      paint();
      r.addEventListener('input', () => { paint(); this.onRange(r); });
    }
    for (const c of scope.querySelectorAll<HTMLInputElement>('[data-chk]')) c.addEventListener('change', () => { (this.setup as Record<string, unknown>)[c.dataset.chk!] = c.checked; });
    const sname = scope.querySelector<HTMLInputElement>('#mm-sname');
    sname?.addEventListener('input', () => { this.setup.serverName = sname.value.slice(0, 32); });
    const pw = scope.querySelector<HTMLInputElement>('#mm-pw');
    pw?.addEventListener('input', () => { this.setup.password = pw.value.slice(0, 32); });
    this.bindInputs(scope);
  }

  private bindInputs(scope: HTMLElement): void {
    for (const i of scope.querySelectorAll<HTMLInputElement>('[data-input]')) {
      i.addEventListener('input', () => {
        if (i.dataset.input === 'search') { this.filter = { ...this.filter, search: i.value }; this.renderTable(); }
      });
      i.addEventListener('change', () => {
        if (i.dataset.input !== 'server') return;
        const v = validServerUrl(i.value);
        i.classList.toggle('invalid', !!i.value.trim() && !v);
        if (i.value.trim() && !v) return;
        this.setup.server = v;
        if (currentScreen(this.state) === 'browser') { this.servers = {}; this.browser.start(v); this.renderTable(); }
      });
    }
    for (const c of scope.querySelectorAll<HTMLInputElement>('[data-filter]')) {
      c.addEventListener('change', () => { this.filter = { ...this.filter, [c.dataset.filter!]: c.checked }; this.renderTable(); });
    }
  }

  private onRange(r: HTMLInputElement): void {
    const v = Number(r.value);
    if (r.dataset.range === 'teamsize') {
      this.setup.fillTo = fillForTeamSize(v);
      this.q('#mm-teamsize').textContent = `${v} gegen ${v}`;
    } else if (r.dataset.range === 'max') {
      this.setup.maxPlayers = clampMaxPlayers(v);
      this.q('#mm-max').textContent = String(this.setup.maxPlayers);
    } else if (r.dataset.range === 'fill') {
      this.setup.fillTo = v;
      this.q('#mm-fill').textContent = v ? `${v} Spieler` : 'keine Bots';
    }
  }

  private action(a: string): void {
    switch (a) {
      case 'back': this.back(); break;
      case 'quick': this.finish({ ...this.setup, mode: 'offline', room: '' }); break;
      case 'start-single': this.finish({ ...this.setup, mode: 'offline', room: '' }); break;
      case 'start-host': {
        const name = this.setup.serverName.trim() || `${this.setup.name}s Server`;
        this.finish({ ...this.setup, serverName: name, mode: 'host', room: roomCode() });
        break;
      }
      case 'refresh': this.browser.refresh(); uiSound.play('click'); break;
      case 'join-sel': this.joinSelected(); break;
      case 'join-code': this.joinCode(); break;
      case 'join-invite': {
        const room = this.opts.launch.room;
        const known = this.servers[room];
        this.joinRoom(room, known?.map ?? (this.opts.launch.map || null), known?.hasPassword ?? /Passwort/.test(this.opts.message ?? ''));
        break;
      }
      case 'pw-ok': this.confirmPassword(); break;
      case 'pw-cancel': this.closeDialog(); break;
    }
  }

  private joinSelected(): void {
    const e = this.selected ? this.servers[this.selected] : null;
    if (!e) return;
    const block = joinBlockReason(e);
    if (block) { this.showMessage(block); uiSound.play('error'); return; }
    this.joinRoom(e.room, e.map, e.hasPassword);
  }

  private joinCode(): void {
    const input = this.q<HTMLInputElement>('#mm-code');
    const code = normalizeRoomCode(input.value);
    if (!validRoomCode(code)) { input.classList.add('invalid'); input.focus(); uiSound.play('error'); return; }
    input.classList.remove('invalid');
    const known = this.servers[code];
    this.joinRoom(code, known?.map ?? (this.opts.launch.room === code ? this.opts.launch.map : null), known?.hasPassword ?? false);
  }

  /** Beitreten: Karte vom Server (Browser/Einladung), sonst die gewählte. Passwort ggf. abfragen. */
  private joinRoom(room: string, map: string | null, needsPassword: boolean): void {
    const mapId = map && MAPS.some((m) => m.id === map) ? map : this.setup.mapId;
    if (needsPassword) {
      this.pendingJoin = { room, map: mapId };
      this.openPasswordDialog(room);
      return;
    }
    this.finish({ ...this.setup, mode: 'join', room, mapId, password: '' });
  }

  private openPasswordDialog(room: string): void {
    const d = this.q('#mm-dialog');
    d.innerHTML = `<div class="box"><h3>${ICON.lock.replace('<svg', '<svg style="width:18px;height:18px;fill:var(--c-accent);vertical-align:-2px"')} Passwort für ${escapeHtml(room)}</h3><input class="ui-input" type="password" id="mm-joinpw" maxlength="32" autocomplete="off"><div class="row"><button class="ui-btn" data-act="pw-cancel">Abbrechen</button><button class="ui-btn primary" data-act="pw-ok">Beitreten</button></div></div>`;
    d.classList.add('on');
    const i = d.querySelector<HTMLInputElement>('#mm-joinpw')!;
    i.focus();
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.confirmPassword(); });
  }

  private confirmPassword(): void {
    const pj = this.pendingJoin;
    const pw = this.root.querySelector<HTMLInputElement>('#mm-joinpw')?.value ?? '';
    if (!pj) return;
    this.closeDialog();
    this.finish({ ...this.setup, mode: 'join', room: pj.room, mapId: 'map' in pj ? pj.map : this.setup.mapId, password: pw });
  }

  private closeDialog(): void {
    this.pendingJoin = null;
    this.q('#mm-dialog').classList.remove('on');
  }

  private showMessage(text: string): void {
    const stage = this.q('.mm-stage');
    let m = stage.querySelector<HTMLElement>('.mm-msg');
    if (!m) {
      m = document.createElement('div');
      m.className = 'mm-msg';
      m.style.cssText = 'position:absolute;top:0;right:calc(56 * var(--u));z-index:5';
      stage.appendChild(m);
    }
    m.textContent = text;
    m.classList.add('on');
    setTimeout(() => m!.classList.remove('on'), 6000);
  }

  private persist(): void {
    save(this.opts.store, this.setup);
  }

  private finish(s: GameSetup): void {
    if (this.done) return;
    this.done = true;
    const setup: GameSetup = { ...s, name: sanitizeName(this.q<HTMLInputElement>('#mm-name').value) };
    this.setup = setup;
    this.persist();
    uiSound.play('start');
    this.music.fadeOut().catch(() => undefined);
    this.root.classList.add('leaving');
    this.teardown();
    setTimeout(() => {
      this.backdrop.dispose();
      this.root.remove();
      this.settings.dispose();
    }, 700);
    this.resolve(setup);
  }

  private teardown(): void {
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.unlockAudio, true);
    document.removeEventListener('keydown', this.unlockAudio, true);
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.padRaf);
    clearInterval(this.tipTimer);
    this.browser.stop();
  }

  // ---------------------------------------------------------------- Tastatur / Gamepad

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.done) return;
    const target = e.target as HTMLElement;
    const typing = target instanceof HTMLInputElement && !['checkbox', 'range'].includes(target.type);
    if (e.key === 'Escape') {
      if (this.q('#mm-dialog').classList.contains('on')) { this.closeDialog(); return; }
      if (typing) { target.blur(); return; }
      this.back();
      e.preventDefault();
      return;
    }
    if (typing) {
      if (e.key === 'Enter' && target.id === 'mm-code') this.joinCode();
      return;
    }
    const cur = currentScreen(this.state);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const d = e.key === 'ArrowDown' ? 1 : -1;
      if (cur === 'main' || target.classList.contains('mm-item')) {
        const items = this.navItems();
        const i = items.indexOf(target);
        this.navFocus = moveFocus(i >= 0 ? i : this.navFocus - (d > 0 ? 1 : -1), d, items.length);
        items[this.navFocus]?.focus();
        uiSound.play('hover');
        e.preventDefault();
      } else if (cur === 'browser') {
        const list = this.visibleServers();
        if (!list.length) return;
        const i = list.findIndex((x) => x.room === this.selected);
        this.selected = list[moveFocus(i < 0 ? (d > 0 ? -1 : 0) : i, d, list.length)]!.room;
        this.renderTable();
        e.preventDefault();
      } else this.moveFocusGeneric(d);
    } else if (e.key === 'Enter' && cur === 'browser' && this.selected && !(target instanceof HTMLButtonElement)) {
      this.joinSelected();
    } else if (e.key === 'F5' && cur === 'browser') {
      this.browser.refresh();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) this.toggleMute();
  };

  /** Fokus durch alle bedienbaren Elemente der aktuellen Seite (Gamepad/Pfeiltasten). */
  private moveFocusGeneric(d: number): void {
    const cur = currentScreen(this.state);
    const scope = cur === 'main' ? this.q('.mm-nav') : this.screenEl(cur);
    const els = [...scope.querySelectorAll<HTMLElement>('button:not([disabled]), input, .mm-map, [tabindex]')].filter((x) => x.offsetParent !== null);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[moveFocus(i < 0 ? (d > 0 ? -1 : 0) : i, d, els.length)]!.focus();
    uiSound.play('hover');
  }

  private readonly pollPad = (): void => {
    this.padRaf = requestAnimationFrame(this.pollPad);
    const pads = navigator.getGamepads?.() ?? [];
    const p = [...pads].find((x) => x && x.connected);
    if (!p) return;
    const pressed = (i: number): boolean => !!p.buttons[i]?.pressed;
    const now = [pressed(12) || (p.axes[1] ?? 0) < -0.6, pressed(13) || (p.axes[1] ?? 0) > 0.6, pressed(0), pressed(1)];
    const edge = (i: number): boolean => now[i]! && !this.padPrev[i];
    if (edge(0)) this.moveFocusGeneric(-1);
    if (edge(1)) this.moveFocusGeneric(1);
    if (edge(2)) { uiSound.unlock(); (document.activeElement as HTMLElement | null)?.click(); }
    if (edge(3)) this.back();
    this.padPrev = now;
  };
}

