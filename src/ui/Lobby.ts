import { MAPS, mapById } from '../maps';
import { roomCode, sanitizeName } from '../logic/net';
import type { Team } from '../logic/economy';

export type LobbyResult = {
  name: string;
  mapId: string;
  team: Team | 'auto';
  mode: 'offline' | 'host' | 'join';
  room: string;
  fillTo: number;
  botSkill: number;
  /** Eigener Relay-Server (ws://…/socket), leer = Needle-Backend. */
  server: string;
};

const STORE_KEY = 'csw16.lobby';

/**
 * Startmenü (DOM): Name, Karte, Team, Spielmodus (offline gegen Bots, online
 * Raum erstellen/beitreten per Code), Bot-Anzahl/-Stärke. URL-Parameter
 * `?room=CODE&map=de_x` füllt das Beitreten vor (teilbarer Link).
 */
export function showLobby(): Promise<LobbyResult> {
  return new Promise((resolve) => {
    const url = new URL(window.location.href);
    const saved = load();
    const urlRoom = url.searchParams.get('room')?.toUpperCase() ?? '';
    const urlMap = url.searchParams.get('map') ?? '';
    const urlServer = url.searchParams.get('server') ?? saved.server ?? '';

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '100', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(30,36,46,.96), rgba(8,10,14,.98))', font: '14px Consolas, "Lucida Console", monospace', color: '#dfe6ee',
    });
    const panel = document.createElement('div');
    Object.assign(panel.style, { width: '560px', maxWidth: '94vw', background: 'rgba(14,18,24,.95)', border: '1px solid #2a333d', borderRadius: '12px', padding: '22px 26px', boxShadow: '0 20px 60px #000' });
    const mapOptions = MAPS.map((m) => `<option value="${m.id}" ${m.id === (urlMap || saved.mapId) ? 'selected' : ''}>${m.name}</option>`).join('');
    panel.innerHTML = `
      <div style="font-size:26px;font-weight:bold;letter-spacing:3px;color:#ffd98a">CS WAREHOUSE 1.6</div>
      <div style="opacity:.7;margin-bottom:16px">Bomben-Modus im Lager · Terroristen gegen Counter-Terroristen</div>
      <div style="display:grid;grid-template-columns:140px 1fr;gap:10px 12px;align-items:center">
        <label>Name</label><input id="lb-name" maxlength="16" value="${esc(saved.name)}" style="${inp()}">
        <label>Karte</label><select id="lb-map" style="${inp()}">${mapOptions}</select>
        <div></div><div id="lb-mapdesc" style="font-size:11px;opacity:.7;margin-top:-6px"></div>
        <label>Team</label><select id="lb-team" style="${inp()}">
          <option value="auto" ${saved.team === 'auto' ? 'selected' : ''}>Automatisch</option>
          <option value="T" ${saved.team === 'T' ? 'selected' : ''}>Terroristen</option>
          <option value="CT" ${saved.team === 'CT' ? 'selected' : ''}>Counter-Terroristen</option>
        </select>
        <label>Spieler gesamt</label><select id="lb-fill" style="${inp()}">${[2, 4, 6, 8, 10].map((n) => `<option value="${n}" ${n === saved.fillTo ? 'selected' : ''}>${n} (Rest Bots)</option>`).join('')}</select>
        <label>Bot-Stärke</label><select id="lb-skill" style="${inp()}">
          <option value="0.3" ${saved.botSkill === 0.3 ? 'selected' : ''}>Leicht</option>
          <option value="0.6" ${saved.botSkill === 0.6 ? 'selected' : ''}>Normal</option>
          <option value="0.9" ${saved.botSkill === 0.9 ? 'selected' : ''}>Schwer</option>
        </select>
        <label>Raumcode</label><div><input id="lb-room" maxlength="12" placeholder="z. B. K7Q2M" value="${esc(urlRoom)}" style="${inp()};width:160px;text-transform:uppercase"> <span style="opacity:.6;font-size:11px">zum Beitreten</span></div>
        <label>Server (optional)</label><input id="lb-server" placeholder="leer = Needle-Backend · LAN: ws://host:9100/socket" value="${esc(urlServer)}" style="${inp()}">
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button id="lb-offline" style="${btn('#3a7d44')}">▶ Offline gegen Bots</button>
        <button id="lb-host" style="${btn('#2f5fb3')}">⌂ Online-Spiel erstellen</button>
        <button id="lb-join" style="${btn('#8a5a2a')}">↪ Beitreten</button>
      </div>
      <div style="margin-top:14px;font-size:11px;opacity:.65;line-height:1.6">
        WASD laufen · Shift sprinten · Strg ducken · Leertaste springen · Maus links schießen · R nachladen · 1–5 Waffen · Mausrad/Q wechseln<br>
        B kaufen · E Bombe legen/entschärfen · Tab Scoreboard · Y Chat · M Team · Granaten: links voll werfen, rechts kurz
      </div>`;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const q = <T extends HTMLElement>(id: string): T => panel.querySelector('#' + id) as T;
    const desc = q<HTMLDivElement>('lb-mapdesc');
    const mapSel = q<HTMLSelectElement>('lb-map');
    const upd = (): void => { desc.textContent = mapById(mapSel.value).description; };
    mapSel.addEventListener('change', upd);
    upd();

    const finish = (mode: LobbyResult['mode']): void => {
      const name = sanitizeName(q<HTMLInputElement>('lb-name').value);
      const mapId = mapSel.value;
      const team = q<HTMLSelectElement>('lb-team').value as Team | 'auto';
      const fillTo = Number(q<HTMLSelectElement>('lb-fill').value);
      const botSkill = Number(q<HTMLSelectElement>('lb-skill').value);
      const server = q<HTMLInputElement>('lb-server').value.trim();
      let room = q<HTMLInputElement>('lb-room').value.trim().toUpperCase();
      if (mode === 'host') room = roomCode();
      if (mode === 'join' && !room) {
        q<HTMLInputElement>('lb-room').focus();
        q<HTMLInputElement>('lb-room').style.borderColor = '#ff6a5a';
        return;
      }
      save({ name, mapId, team, fillTo, botSkill, server });
      overlay.remove();
      resolve({ name, mapId, team, mode, room, fillTo, botSkill, server });
    };
    q('lb-offline').addEventListener('click', () => finish('offline'));
    q('lb-host').addEventListener('click', () => finish('host'));
    q('lb-join').addEventListener('click', () => finish('join'));
    if (urlRoom) q<HTMLButtonElement>('lb-join').focus();
    else q<HTMLInputElement>('lb-name').focus();
  });
}

/** Teilbarer Link für einen Raum (Karte inklusive). */
export function roomLink(room: string, mapId: string, server = ''): string {
  const url = new URL(window.location.href);
  url.searchParams.set('room', room);
  url.searchParams.set('map', mapId);
  if (server) url.searchParams.set('server', server);
  else url.searchParams.delete('server');
  url.searchParams.delete('auto');
  return url.href;
}

type Saved = { name: string; mapId: string; team: Team | 'auto'; fillTo: number; botSkill: number; server: string };

function load(): Saved {
  const def: Saved = { name: 'Spieler', mapId: MAPS[0]!.id, team: 'auto', fillTo: 6, botSkill: 0.6, server: '' };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return def;
    return { ...def, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    return def;
  }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch { /* privat/blockiert */ }
}

function inp(): string {
  return 'background:#0e1217;border:1px solid #3a4652;color:#fff;padding:6px 8px;border-radius:5px;font:inherit;width:100%;box-sizing:border-box';
}

function btn(bg: string): string {
  return `background:${bg};border:none;color:#fff;padding:10px 16px;border-radius:6px;font:inherit;font-weight:bold;cursor:pointer;flex:1;min-width:150px`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}
