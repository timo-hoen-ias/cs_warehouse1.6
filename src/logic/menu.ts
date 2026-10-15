import type { Team } from './economy';
import { DEFAULT_FRIENDLY_FIRE } from './friendlyFire';
import { MAX_PLAYERS_MAX, MAX_PLAYERS_MIN } from './lobby';
import { normalizeRoomCode, validRoomCode } from './serverList';

/**
 * Hauptmenü (framework-frei): Spiel-Setup-Typ, Bildschirm-Zustandsmaschine mit
 * Zurück-Navigation und das Auswerten der Start-Parameter aus der URL
 * (`?auto=1&fill=4` für Tests, `?room=CODE` für Einladungslinks).
 */

/** Ergebnis von Menü/Lobby → Spielstart. */
export type GameSetup = {
  name: string;
  mapId: string;
  team: Team | 'auto';
  mode: 'offline' | 'host' | 'join';
  room: string;
  /** Gesamtzahl Spieler inkl. Menschen, die der Host mit Bots auffüllt (0 = keine Bots). */
  fillTo: number;
  botSkill: number;
  /** Eigener Relay-Server (ws://…/socket), leer = Needle-Backend. */
  server: string;
  /** Online-Host: Servername im Browser. */
  serverName: string;
  /** Online-Host: maximale Zahl menschlicher Spieler. */
  maxPlayers: number;
  /** Klartext nur lokal (Host: setzt das Passwort, Client: sendet die Prüfsumme). */
  password: string;
  /** Online-Host: im Serverbrowser anzeigen. */
  listed: boolean;
  /** Online-Host: Serverlobby (Aufwärmen bis „Spiel starten“). */
  lobby: boolean;
  /** Friendly Fire (Teamschaden) — nur der Host/Einzelspieler entscheidet; Standard aus wie bei öffentlichen CS-Servern. */
  friendlyFire: boolean;
};

export type MenuScreen = 'main' | 'single' | 'browser' | 'create' | 'settings' | 'help' | 'credits' | 'quit';

export type MenuEntry = { screen: MenuScreen; label: string; sub: string };

/** Einträge des Hauptmenüs (Reihenfolge = Anzeige). */
export const MENU_ENTRIES: MenuEntry[] = [
  { screen: 'single', label: 'Einzelspieler', sub: 'Gegen Bots auf einer Karte deiner Wahl' },
  { screen: 'browser', label: 'Mehrspieler', sub: 'Serverbrowser · Spielen mit Freunden' },
  { screen: 'create', label: 'Server erstellen', sub: 'Eigenes Online-Spiel hosten' },
  { screen: 'settings', label: 'Einstellungen', sub: 'Maus, Ton, Fadenkreuz, HUD' },
  { screen: 'help', label: 'Steuerung & Hilfe', sub: 'Tastenbelegung und Regeln' },
  { screen: 'credits', label: 'Credits', sub: 'Mitwirkende und Lizenzen' },
  { screen: 'quit', label: 'Beenden', sub: 'Spiel verlassen' },
];

export const SCREEN_TITLES: Record<MenuScreen, string> = {
  main: 'Hauptmenü',
  single: 'Einzelspieler',
  browser: 'Serverbrowser',
  create: 'Server erstellen',
  settings: 'Einstellungen',
  help: 'Steuerung & Hilfe',
  credits: 'Credits',
  quit: 'Beenden',
};

/** Navigationsstapel; unten liegt immer 'main'. */
export type MenuState = { stack: MenuScreen[] };

export function initialMenu(start: MenuScreen = 'main'): MenuState {
  return { stack: start === 'main' ? ['main'] : ['main', start] };
}

export function currentScreen(s: MenuState): MenuScreen {
  return s.stack[s.stack.length - 1] ?? 'main';
}

/**
 * Öffnet einen Bildschirm. Vom Hauptmenü aus wird gestapelt; Unterseiten ersetzen
 * sich gegenseitig (Geschwister), ein bereits offener Bildschirm springt zurück.
 */
export function openScreen(s: MenuState, to: MenuScreen): MenuState {
  if (to === 'main') return initialMenu();
  const idx = s.stack.indexOf(to);
  if (idx >= 0) return { stack: s.stack.slice(0, idx + 1) };
  // Serverbrowser → Server erstellen bleibt „darunter“ erreichbar (Zurück → Browser)
  if (currentScreen(s) === 'browser' && to === 'create') return { stack: [...s.stack, to] };
  return { stack: ['main', to] };
}

/** Zurück (Esc/Rücktaste); im Hauptmenü bleibt alles beim Alten. */
export function goBack(s: MenuState): MenuState {
  if (s.stack.length <= 1) return s;
  return { stack: s.stack.slice(0, -1) };
}

/** Fokus in einer Liste verschieben (mit Umlauf), z. B. Pfeiltasten/Gamepad. */
export function moveFocus(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return (((i + Math.trunc(delta)) % count) + count) % count;
}

/** Teamgröße (1v1 … 8v8) → Gesamtspieler fürs Auffüllen mit Bots. */
export function fillForTeamSize(perTeam: number): number {
  return Math.min(16, Math.max(1, Math.round(Number.isFinite(perTeam) ? perTeam : 3))) * 2;
}

/** Umkehrung: Gesamtspieler → Teamgröße (aufgerundet). */
export function teamSizeForFill(fillTo: number): number {
  return Math.min(8, Math.max(1, Math.ceil((Number.isFinite(fillTo) ? fillTo : 6) / 2)));
}

/** Bot-Schwierigkeitsstufen (Skill 0..1 für botDecide). */
export const BOT_DIFFICULTIES: { id: string; label: string; skill: number }[] = [
  { id: 'easy', label: 'Leicht', skill: 0.3 },
  { id: 'normal', label: 'Normal', skill: 0.6 },
  { id: 'hard', label: 'Schwer', skill: 0.85 },
  { id: 'expert', label: 'Experte', skill: 1 },
];

/** Nächstliegende Schwierigkeitsstufe zu einem Skill-Wert. */
export function difficultyForSkill(skill: number): (typeof BOT_DIFFICULTIES)[number] {
  const s = Number.isFinite(skill) ? skill : 0.6;
  return BOT_DIFFICULTIES.reduce((best, d) => (Math.abs(d.skill - s) < Math.abs(best.skill - s) ? d : best), BOT_DIFFICULTIES[1]!);
}

export function clampMaxPlayers(n: number): number {
  return Math.min(MAX_PLAYERS_MAX, Math.max(MAX_PLAYERS_MIN, Math.round(Number.isFinite(n) ? n : 10)));
}

/** Standard-Setup (Basis für Menü und URL-Start). */
export function defaultSetup(mapId: string): GameSetup {
  return {
    name: 'Spieler', mapId, team: 'auto', mode: 'offline', room: '', fillTo: 6, botSkill: 0.6, server: '',
    serverName: 'Lagerserver', maxPlayers: 10, password: '', listed: true, lobby: true, friendlyFire: DEFAULT_FRIENDLY_FIRE,
  };
}

function teamParam(v: string | null): Team | 'auto' | null {
  return v === 'T' || v === 'CT' || v === 'auto' ? v : null;
}

/** Nur ws:// bzw. wss://-Adressen als eigener Server. */
export function validServerUrl(v: string | null | undefined): string {
  if (!v) return '';
  const s = v.trim();
  return /^wss?:\/\/[^\s<>"']{1,200}$/.test(s) ? s : '';
}

export type LaunchInfo = {
  /** Direktstart ohne Menü (?auto=1 für Tests/Automation). */
  auto: GameSetup | null;
  /** Vorbelegung fürs Menü (Einladungslink ?room=…&map=…&server=…). */
  room: string;
  map: string;
  server: string;
  /** Menü direkt auf einem Bildschirm öffnen (?menu=browser). */
  screen: MenuScreen;
};

const SCREENS: readonly MenuScreen[] = ['main', 'single', 'browser', 'create', 'settings', 'help', 'credits'];

/**
 * URL-Parameter auswerten. `?auto=1` startet sofort (offline, oder `join` mit `room`,
 * oder `host=1` als Online-Host mit Serverlobby aus); Werte werden validiert.
 */
export function parseLaunch(search: string, defaultMap: string): LaunchInfo {
  const p = new URLSearchParams(search);
  const rawRoom = p.get('room');
  const room = rawRoom ? normalizeRoomCode(rawRoom) : '';
  const map = (p.get('map') ?? '').replace(/[^a-z0-9_]/g, '').slice(0, 32);
  const server = validServerUrl(p.get('server'));
  const screenParam = p.get('menu') as MenuScreen | null;
  const screen: MenuScreen = screenParam && SCREENS.includes(screenParam) ? screenParam : 'main';
  let auto: GameSetup | null = null;
  if (p.get('auto')) {
    const base = defaultSetup(map || defaultMap);
    const fill = Number(p.get('fill') ?? 4);
    const host = p.get('host') === '1';
    const autoRoom = validRoomCode(room) ? room : '';
    auto = {
      ...base,
      name: (p.get('name') ?? 'Smoke').slice(0, 16),
      team: teamParam(p.get('team')) ?? 'T',
      mode: autoRoom ? (host ? 'host' : 'join') : 'offline',
      room: autoRoom,
      fillTo: Number.isFinite(fill) ? Math.min(32, Math.max(0, Math.round(fill))) : 4,
      botSkill: 0.6,
      server,
      serverName: (p.get('sname') ?? base.serverName).slice(0, 32),
      maxPlayers: clampMaxPlayers(Number(p.get('max') ?? base.maxPlayers)),
      password: (p.get('pw') ?? '').slice(0, 32),
      listed: p.get('listed') !== '0',
      // Automatisierte Starts warten nicht auf „Spiel starten“, außer explizit verlangt
      lobby: p.get('lobby') === '1',
      friendlyFire: p.get('ff') === '1',
    };
  }
  return { auto, room, map, server, screen };
}

/** Teilbarer Einladungslink für einen Raum (Karte inklusive, Test-Parameter entfernt). */
export function roomLink(href: string, room: string, mapId: string, server = ''): string {
  const url = new URL(href);
  url.searchParams.set('room', room);
  url.searchParams.set('map', mapId);
  if (server) url.searchParams.set('server', server);
  else url.searchParams.delete('server');
  for (const k of ['auto', 'host', 'pw', 'menu', 'sname', 'max', 'listed', 'lobby', 'fill', 'name', 'team', 'ff']) url.searchParams.delete(k);
  return url.href;
}

/** Gespeicherte Menü-Vorgaben (localStorage) bereinigen; Passwort wird nie gespeichert. */
export function sanitizeSavedSetup(raw: unknown, defaultMap: string, knownMaps: readonly string[]): GameSetup {
  const d = defaultSetup(defaultMap);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number, def: string): string => (typeof v === 'string' ? v.replace(/[<>&"'`]/g, '').trim().slice(0, max) || def : def);
  const num = (v: unknown, def: number, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const map = typeof r.mapId === 'string' && knownMaps.includes(r.mapId) ? r.mapId : d.mapId;
  return {
    ...d,
    name: str(r.name, 16, d.name),
    mapId: map,
    team: teamParam(typeof r.team === 'string' ? r.team : null) ?? d.team,
    fillTo: Math.round(num(r.fillTo, d.fillTo, 0, 32)),
    botSkill: num(r.botSkill, d.botSkill, 0, 1),
    server: validServerUrl(typeof r.server === 'string' ? r.server : ''),
    serverName: str(r.serverName, 32, d.serverName),
    maxPlayers: clampMaxPlayers(num(r.maxPlayers, d.maxPlayers, 2, 16)),
    listed: typeof r.listed === 'boolean' ? r.listed : d.listed,
    lobby: typeof r.lobby === 'boolean' ? r.lobby : d.lobby,
    friendlyFire: typeof r.friendlyFire === 'boolean' ? r.friendlyFire : d.friendlyFire,
  };
}
