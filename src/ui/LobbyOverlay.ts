import './theme.css';
import './hud.css';
import './lobby.css';
import type { Team } from '../logic/economy';
import { friendlyFireText } from '../logic/friendlyFire';
import { escapeHtml, intText } from '../logic/hudFormat';
import { computeUiScale } from '../logic/uiScale';
import { ICON } from './icons';
import { uiSound } from './uiSound';

export type LobbyPlayer = { id: string; name: string; team: Team; bot: boolean };

export type LobbyView = {
  /** Serverlobby aktiv (gehaltenes Aufwärmen). */
  active: boolean;
  isHost: boolean;
  hostId: string;
  localId: string;
  players: LobbyPlayer[];
  chat: readonly { who: string; text: string; team: Team | null }[];
  maxPlayers: number;
  serverName: string;
  hasPassword: boolean;
  /** Teamschaden an (Host-Regel). */
  friendlyFire: boolean;
};

/**
 * Serverlobby im Spiel: Während der Host das Aufwärmen hält, zeigt sie Spieler je Team
 * (Teamwechsel), Chat, Raumcode + Einladungslink und für den Host „Spiel starten“.
 * Mit „Aufwärmen“ ausblendbar (frei herumlaufen); Esc (Maus frei) holt sie zurück,
 * im Spiel bleibt ein kleiner Hinweis sichtbar.
 */
export class LobbyOverlay {
  onStart?: () => void;
  onTeam?: (team: Team) => void;
  onChat?: (text: string) => void;
  onLeave?: () => void;
  onOpenChange?: (open: boolean) => void;

  private root!: HTMLDivElement;
  private mini!: HTMLDivElement;
  private dismissed = false;
  private shown = false;
  private last = '';
  private view: LobbyView | null = null;

  constructor(private readonly room: string, private readonly link: string) {}

  mount(parent: HTMLElement = document.body): void {
    const root = document.createElement('div');
    root.className = 'lob ui-scope';
    root.id = 'lobby';
    root.innerHTML = `<div class="lob-panel"><div class="ui-hazard"></div>
      <div class="lob-head"><div class="ttl"><small>Serverlobby</small><b data-k="name"></b></div>
        <div class="lob-code"><span class="lob-copied" data-k="copied">Link kopiert!</span><span class="ui-label">Raumcode</span><span class="c">${escapeHtml(this.room)}</span><button class="ui-btn small" data-act="copy">${ICON.copy.replace('<svg', '<svg style="width:14px;height:14px;fill:currentColor"')} Einladungslink</button></div></div>
      <div class="lob-team t"><h4>${ICON.teamT}Terroristen<span class="n" data-k="tn"></span></h4><div class="lob-list" data-k="tl"></div><button class="ui-btn" data-act="team-T">Zu den Terroristen</button></div>
      <div class="lob-team ct"><h4>${ICON.teamCT}Counter-Terroristen<span class="n" data-k="ctn"></span></h4><div class="lob-list" data-k="ctl"></div><button class="ui-btn" data-act="team-CT">Zu den Counter-Terroristen</button></div>
      <div class="lob-chat"><h4>Chat</h4><div class="lob-log ui-scroll" data-k="log"></div><input class="ui-input" data-k="input" maxlength="120" placeholder="Nachricht … (Enter)"></div>
      <div class="lob-foot"><span class="note" data-k="note"></span><span class="grow"></span>
        <button class="ui-btn" data-act="leave">Verlassen</button><button class="ui-btn" data-act="warmup">Aufwärmen (herumlaufen)</button>
        <span data-k="startWrap"></span></div></div>`;
    const mini = document.createElement('div');
    mini.className = 'lob-mini ui-scope';
    root.addEventListener('click', this.onClick);
    root.addEventListener('pointerover', (e) => { if ((e.target as HTMLElement).closest('button')) uiSound.play('hover'); });
    const input = this.k<HTMLInputElement>('input', root);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && input.value.trim()) {
        this.onChat?.(input.value.trim().slice(0, 120));
        input.value = '';
      }
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    parent.appendChild(root);
    parent.appendChild(mini);
    this.root = root;
    this.mini = mini;
    document.addEventListener('pointerlockchange', this.onLock);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  private k<T extends HTMLElement = HTMLElement>(key: string, scope: HTMLElement = this.root): T {
    return scope.querySelector(`[data-k="${key}"]`) as T;
  }

  private readonly onResize = (): void => {
    const u = `${computeUiScale(window.innerWidth, window.innerHeight, 1)}px`;
    this.root?.style.setProperty('--u', u);
    this.mini?.style.setProperty('--u', u);
  };

  private readonly onLock = (): void => {
    // Maus wieder frei (Esc) → Lobby erneut anbieten
    if (!document.pointerLockElement) this.dismissed = false;
    this.apply();
  };

  /** Pro Frame mit dem aktuellen Zustand; DOM nur bei Änderung. */
  update(v: LobbyView): void {
    this.view = v;
    const sig = JSON.stringify([v.active, v.isHost, v.players, v.chat.length, v.chat.at(-1)?.text, v.maxPlayers, v.serverName]);
    if (sig !== this.last) {
      this.last = sig;
      this.render(v);
    }
    this.apply();
  }

  isOpen(): boolean {
    return this.shown;
  }

  private apply(): void {
    const v = this.view;
    const show = !!v?.active && !this.dismissed && !document.pointerLockElement;
    if (show !== this.shown) {
      this.shown = show;
      this.root.classList.toggle('on', show);
      this.onOpenChange?.(show);
      if (show) try { document.exitPointerLock(); } catch { /* egal */ }
    }
    const mini = !!v?.active && !show;
    this.mini.classList.toggle('on', mini);
  }

  private render(v: LobbyView): void {
    this.k('name').textContent = v.serverName;
    const humans = v.players.filter((p) => !p.bot).length;
    const list = (team: Team): string => {
      const ps = v.players.filter((p) => p.team === team).sort((a, b) => Number(a.bot) - Number(b.bot) || a.name.localeCompare(b.name));
      if (!ps.length) return '<div class="lob-empty">Noch niemand</div>';
      return ps.map((p) => `<div class="lob-p${p.id === v.localId ? ' me' : ''}${p.bot ? ' bot' : ''}">${p.id === v.hostId ? ICON.crown : ''}<span>${escapeHtml(p.name)}</span>${p.bot ? '<span class="tag">Bot</span>' : p.id === v.hostId ? '<span class="tag host">Host</span>' : ''}</div>`).join('');
    };
    this.k('tl').innerHTML = list('T');
    this.k('ctl').innerHTML = list('CT');
    this.k('tn').textContent = String(v.players.filter((p) => p.team === 'T').length);
    this.k('ctn').textContent = String(v.players.filter((p) => p.team === 'CT').length);
    this.k('log').innerHTML = v.chat.length
      ? v.chat.map((l) => `<div><span class="who ${l.team === 'T' ? 't' : l.team === 'CT' ? 'ct' : ''}">${escapeHtml(l.who)}:</span> ${escapeHtml(l.text)}</div>`).join('')
      : '<div style="color:var(--c-mute)">Noch keine Nachrichten. Sag Hallo!</div>';
    const log = this.k('log');
    log.scrollTop = log.scrollHeight;
    this.k('note').textContent = `${humans}/${v.maxPlayers} Spieler${v.hasPassword ? ' · passwortgeschützt' : ''} · ${friendlyFireText(v.friendlyFire)} · freie Plätze füllen Bots auf`;
    this.k('startWrap').innerHTML = v.isHost
      ? '<button class="ui-btn primary big" data-act="start" id="lobby-start">▶ Spiel starten</button>'
      : '<span class="lob-wait"><i></i>Warte auf den Host …</span>';
    this.mini.innerHTML = `<b>Serverlobby</b><span>${humans}/${intText(v.maxPlayers)} Spieler · Aufwärmen</span><span style="color:var(--c-dim)">Esc = Lobby${v.isHost ? ' · Spiel starten' : ''}</span>`;
  }

  private readonly onClick = (e: MouseEvent): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    uiSound.unlock();
    uiSound.play('click');
    switch (b.dataset.act) {
      case 'start': this.onStart?.(); break;
      case 'team-T': this.onTeam?.('T'); break;
      case 'team-CT': this.onTeam?.('CT'); break;
      case 'leave': this.onLeave?.(); break;
      case 'warmup': this.dismissed = true; this.apply(); break;
      case 'copy': void this.copyLink(); break;
    }
  };

  private async copyLink(): Promise<void> {
    let ok = false;
    try {
      await navigator.clipboard.writeText(this.link);
      ok = true;
    } catch {
      // Fallback ohne Clipboard-API (http, ältere Browser)
      const ta = document.createElement('textarea');
      ta.value = this.link;
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    const c = this.k('copied');
    c.textContent = ok ? 'Link kopiert!' : this.link;
    c.classList.add('on');
    setTimeout(() => c.classList.remove('on'), ok ? 2000 : 8000);
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onLock);
    window.removeEventListener('resize', this.onResize);
    this.root?.remove();
    this.mini?.remove();
  }
}
