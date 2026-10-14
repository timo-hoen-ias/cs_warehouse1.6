import type { HudState } from '../weapons/Shooter';
import type { Team } from '../logic/economy';
import type { MatchState, Pose } from '../logic/match';
import type { GameEvent } from '../logic/net';
import type { SolidBox } from '../logic/level';
import type { Vec3 } from '../logic/hitbox';
import { scoreboard } from '../logic/match';
import { worldToRadar } from '../logic/radar';
import { BUY_CATEGORIES, EQUIPMENT, WEAPONS, weaponsInCategory, type BuyCategory } from '../logic/weapons';
import { AMMO_PRICE } from '../logic/loadout';

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

const FONT = '13px Consolas, "Lucida Console", monospace';
const PANEL = 'rgba(10,13,18,.62)';

/**
 * Komplettes FPS-HUD als DOM-Overlay über dem Canvas: Fadenkreuz, Statuszeilen
 * (HP/Rüstung/Geld, Waffe/Munition, Slots), Rundenleiste, Kill-Feed, Radar,
 * Kaufmenü (B), Scoreboard (Tab), Chat (Y/Enter), Teamwahl (M), Banner, Blend-/
 * Schadens-Overlays. Reine Anzeige + Tastatur-Routing an Callbacks.
 */
export class Hud {
  onBuy?: (item: string) => void;
  onBuyAmmo?: (slot: 1 | 2) => void;
  onChat?: (text: string) => void;
  onTeam?: (team: Team) => void;
  onMenuChange?: (open: boolean) => void;

  scoreboardVisible = false;
  private buyOpen = false;
  private buyCategory: BuyCategory | null = null;
  private chatOpen = false;
  private teamOpen = false;

  private root?: HTMLDivElement;
  private cross?: HTMLDivElement;
  private crossLines: HTMLDivElement[] = [];
  private statusL?: HTMLDivElement;
  private statusR?: HTMLDivElement;
  private slotsEl?: HTMLDivElement;
  private banner?: HTMLDivElement;
  private bannerTimer = 0;
  private roundBar?: HTMLDivElement;
  private feed?: HTMLDivElement;
  private radar?: HTMLCanvasElement;
  private radarLabel?: HTMLDivElement;
  private buy?: HTMLDivElement;
  private score?: HTMLDivElement;
  private chatBox?: HTMLDivElement;
  private chatInput?: HTMLInputElement;
  private teamBox?: HTMLDivElement;
  private spectator?: HTMLDivElement;
  private noticeEl?: HTMLDivElement;
  private noticeTimer = 0;
  private hintEl?: HTMLDivElement;
  private netEl?: HTMLDivElement;
  private flashEl?: HTMLDivElement;
  private scopeEl?: HTMLDivElement;
  private fpsEl?: HTMLDivElement;
  private fpsFrames = 0;
  private fpsTime = 0;
  private crossDot?: HTMLDivElement;
  private crossRing?: HTMLDivElement;
  private crossStyle: 'classic' | 'dot' | 'circle' = 'classic';
  private crossLen = 9;
  private dmgEl?: HTMLDivElement;
  private flashLevel = 0;
  private dmgLevel = 0;
  private lastPlayer: PlayerInfo | null = null;
  private lastShooter: HudState | null = null;
  private feedEntries: { html: string; t: number }[] = [];
  private solids: SolidBox[] = [];
  private readonly el = () => document.querySelector('needle-engine') as HTMLElement | null;

  mount(solids: SolidBox[] = []): void {
    this.solids = solids;
    const host = this.el() ?? document.body;
    const mk = (style: Partial<CSSStyleDeclaration>, tag: 'div' | 'canvas' | 'input' = 'div'): HTMLElement => {
      const d = document.createElement(tag);
      Object.assign(d.style, { position: 'absolute', zIndex: '10', pointerEvents: 'none', font: FONT, color: '#dfe6ee' }, style);
      return d;
    };

    // Fadenkreuz
    this.cross = mk({ top: '50%', left: '50%', width: '0', height: '0', opacity: '0.9' }) as HTMLDivElement;
    const dot = mk({ left: '-1px', top: '-1px', width: '2px', height: '2px', background: '#9ff09f', borderRadius: '50%' }) as HTMLDivElement;
    this.cross.appendChild(dot);
    this.crossDot = dot;
    this.crossRing = mk({ left: '-9px', top: '-9px', width: '14px', height: '14px', border: '2px solid #9ff09f', borderRadius: '50%', display: 'none' }) as HTMLDivElement;
    this.cross.appendChild(this.crossRing);
    const bar = (w: number, h: number): void => {
      const d = mk({ left: '0', top: '0', width: `${w}px`, height: `${h}px`, background: '#9ff09f', boxShadow: '0 0 2px #000' }) as HTMLDivElement;
      this.cross!.appendChild(d);
      this.crossLines.push(d);
    };
    bar(2, 9); bar(2, 9); bar(9, 2); bar(9, 2);

    this.statusL = mk({ left: '18px', bottom: '18px', background: PANEL, padding: '8px 14px', borderRadius: '6px', fontSize: '15px', minWidth: '180px' }) as HTMLDivElement;
    this.statusR = mk({ right: '18px', bottom: '18px', background: PANEL, padding: '8px 14px', borderRadius: '6px', fontSize: '15px', textAlign: 'right', minWidth: '200px' }) as HTMLDivElement;
    this.slotsEl = mk({ right: '18px', bottom: '76px', textAlign: 'right', fontSize: '11px', opacity: '0.85' }) as HTMLDivElement;
    this.roundBar = mk({ top: '10px', left: '50%', transform: 'translateX(-50%)', background: PANEL, padding: '5px 16px', borderRadius: '6px', textAlign: 'center', whiteSpace: 'nowrap', letterSpacing: '1px' }) as HTMLDivElement;
    this.banner = mk({ top: '32%', left: '50%', transform: 'translate(-50%,-50%)', font: 'bold 28px Consolas, monospace', letterSpacing: '2px', textShadow: '0 2px 8px #000', display: 'none', textAlign: 'center', zIndex: '12' }) as HTMLDivElement;
    this.feed = mk({ top: '14px', right: '18px', textAlign: 'right', fontSize: '12px', lineHeight: '1.6' }) as HTMLDivElement;
    this.radar = mk({ top: '14px', left: '18px', width: '170px', height: '170px', borderRadius: '50%', border: '2px solid rgba(160,180,200,.5)', background: 'rgba(10,13,18,.6)' }, 'canvas') as HTMLCanvasElement;
    this.radar.width = 170;
    this.radar.height = 170;
    this.radarLabel = mk({ top: '190px', left: '18px', width: '170px', textAlign: 'center', fontSize: '11px', opacity: '0.8' }) as HTMLDivElement;
    this.netEl = mk({ top: '208px', left: '18px', width: '170px', textAlign: 'center', fontSize: '10px', opacity: '0.6' }) as HTMLDivElement;
    this.buy = mk({ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(10,13,18,.92)', padding: '16px 22px', borderRadius: '10px', border: '1px solid #2a333d', display: 'none', pointerEvents: 'auto', lineHeight: '1.8', minWidth: '360px', zIndex: '20' }) as HTMLDivElement;
    this.score = mk({ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(10,13,18,.92)', padding: '14px 22px', borderRadius: '10px', border: '1px solid #2a333d', display: 'none', minWidth: '560px', zIndex: '20' }) as HTMLDivElement;
    this.chatBox = mk({ left: '18px', bottom: '96px', fontSize: '12px', lineHeight: '1.5', maxWidth: '420px', textShadow: '0 1px 2px #000' }) as HTMLDivElement;
    this.chatInput = mk({ left: '18px', bottom: '78px', width: '380px', display: 'none', pointerEvents: 'auto', background: 'rgba(10,13,18,.85)', border: '1px solid #3a4652', color: '#fff', padding: '4px 8px', borderRadius: '4px', zIndex: '21' }, 'input') as HTMLInputElement;
    this.chatInput.maxLength = 120;
    this.teamBox = mk({ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(10,13,18,.92)', padding: '16px 22px', borderRadius: '10px', border: '1px solid #2a333d', display: 'none', pointerEvents: 'auto', lineHeight: '2', zIndex: '20', textAlign: 'center' }) as HTMLDivElement;
    this.spectator = mk({ top: '42%', left: '50%', transform: 'translateX(-50%)', background: PANEL, padding: '6px 14px', borderRadius: '6px', display: 'none', color: '#ff9d8a', fontSize: '14px' }) as HTMLDivElement;
    this.noticeEl = mk({ top: '60px', left: '50%', transform: 'translateX(-50%)', fontSize: '13px', color: '#ffd98a', textShadow: '0 1px 3px #000', display: 'none' }) as HTMLDivElement;
    this.hintEl = mk({ top: '58%', left: '50%', transform: 'translateX(-50%)', background: PANEL, padding: '5px 12px', borderRadius: '6px', display: 'none', color: '#9ff09f' }) as HTMLDivElement;
    this.flashEl = mk({ inset: '0', background: '#fff', opacity: '0', zIndex: '15' }) as HTMLDivElement;
    this.dmgEl = mk({ inset: '0', opacity: '0', zIndex: '14', background: 'radial-gradient(ellipse at center, rgba(255,0,0,0) 45%, rgba(200,0,0,.7) 100%)' }) as HTMLDivElement;
    // Zielfernrohr: schwarzer Rand mit rundem Sichtfeld + feines Fadenkreuz
    this.scopeEl = mk({ inset: '0', zIndex: '13', display: 'none', background: 'radial-gradient(circle at center, rgba(0,0,0,0) 0, rgba(0,0,0,0) min(38vh, 38vw), #000 calc(min(38vh, 38vw) + 2px))' }) as HTMLDivElement;
    const sl = (st: Partial<CSSStyleDeclaration>): void => { this.scopeEl!.appendChild(mk({ background: '#000', ...st })); };
    sl({ left: '0', right: '0', top: '50%', height: '1px' });
    sl({ top: '0', bottom: '0', left: '50%', width: '1px' });
    this.fpsEl = mk({ top: '10px', right: '220px', fontSize: '11px', opacity: '0.7', display: 'none' }) as HTMLDivElement;

    this.root = document.createElement('div');
    this.root.append(this.flashEl, this.dmgEl, this.scopeEl!, this.fpsEl!, this.cross, this.statusL, this.statusR, this.slotsEl, this.roundBar, this.banner, this.feed, this.radar, this.radarLabel, this.netEl, this.buy, this.score, this.chatBox, this.chatInput, this.teamBox, this.spectator, this.noticeEl, this.hintEl);
    host.appendChild(this.root);

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const t = this.chatInput!.value;
        this.chatInput!.value = '';
        this.closeChat();
        if (t.trim()) this.onChat?.(t);
      } else if (e.key === 'Escape') {
        this.chatInput!.value = '';
        this.closeChat();
      }
    });
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.root?.remove();
    this.root = undefined;
  }

  /** Irgendein Menü offen (Shooter/Player ignorieren Eingaben). */
  menuOpen(): boolean {
    return this.buyOpen || this.chatOpen || this.teamOpen;
  }

  /** Zielfernrohr-Overlay an/aus (Fadenkreuz aus, wenn gezoomt). */
  setScope(on: boolean): void {
    if (this.scopeEl) this.scopeEl.style.display = on ? 'block' : 'none';
    if (this.cross) this.cross.style.display = on ? 'none' : 'block';
  }

  /** Fadenkreuz aus den Einstellungen (Farbe, Stil, Linienlänge). */
  setCrosshair(color: string, style: 'classic' | 'dot' | 'circle', size: number): void {
    this.crossStyle = style;
    this.crossLen = size;
    for (const l of this.crossLines) {
      l.style.background = color;
      l.style.display = style === 'classic' ? 'block' : 'none';
    }
    const [top, bottom, left, right] = this.crossLines;
    for (const v of [top, bottom]) if (v) v.style.height = `${size}px`;
    for (const h of [left, right]) if (h) h.style.width = `${size}px`;
    if (this.crossDot) {
      this.crossDot.style.background = color;
      const d = style === 'dot' ? 4 : 2;
      Object.assign(this.crossDot.style, { width: `${d}px`, height: `${d}px`, left: `-${d / 2}px`, top: `-${d / 2}px` });
    }
    if (this.crossRing) {
      this.crossRing.style.display = style === 'circle' ? 'block' : 'none';
      this.crossRing.style.borderColor = color;
    }
  }

  showFps(on: boolean): void {
    if (this.fpsEl) this.fpsEl.style.display = on ? 'block' : 'none';
  }

  /** Pro Frame vom Aufrufer (Overlays abklingen). */
  tick(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5 && this.fpsEl) {
      this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - dt * 0.45);
      this.flashEl!.style.opacity = String(Math.min(1, this.flashLevel));
    }
    if (this.dmgLevel > 0) {
      this.dmgLevel = Math.max(0, this.dmgLevel - dt * 2.2);
      this.dmgEl!.style.opacity = String(this.dmgLevel);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner!.style.display = 'none';
    }
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.noticeEl!.style.display = 'none';
    }
    const now = performance.now();
    const before = this.feedEntries.length;
    this.feedEntries = this.feedEntries.filter((f) => now - f.t < 7000);
    if (this.feedEntries.length !== before) this.renderFeed();
  }

  // ---------------------------------------------------------------- Anzeige

  update(s: HudState): void {
    this.lastShooter = s;
    if (!this.crossLines.length) return;
    const gap = Math.max(1.5, s.spreadPx ?? 0);
    if (this.crossRing && this.crossStyle === 'circle') {
      const r = Math.max(6, gap + 2);
      Object.assign(this.crossRing.style, { width: `${r * 2}px`, height: `${r * 2}px`, left: `-${r + 2}px`, top: `-${r + 2}px` });
    }
    const [top, bottom, left, right] = this.crossLines;
    top!.style.transform = `translate(-1px, calc(-100% - ${gap}px))`;
    bottom!.style.transform = `translate(-1px, ${gap}px)`;
    left!.style.transform = `translate(calc(-100% - ${gap}px), -1px)`;
    right!.style.transform = `translate(${gap}px, -1px)`;
    this.renderStatus();
  }

  setPlayer(p: PlayerInfo): void {
    this.lastPlayer = p;
    this.renderStatus();
  }

  private renderStatus(): void {
    const s = this.lastShooter;
    const p = this.lastPlayer;
    if (!this.statusL || !this.statusR || !this.slotsEl) return;
    const hp = s?.hp ?? 100;
    const hpColor = hp > 60 ? '#9ff09f' : hp > 30 ? '#ffd98a' : '#ff6a5a';
    this.statusL.innerHTML = `<span style="color:${hpColor}">✚ ${hp}</span>&nbsp;&nbsp;<span style="color:#8fd0ff">⛨ ${p?.armor ?? 0}${p?.helmet ? '+' : ''}</span>&nbsp;&nbsp;<span style="color:#7fe0a0">$ ${p?.money ?? 0}</span>`
      + `<div style="font-size:11px;opacity:.75;margin-top:2px">${p ? (p.team === 'T' ? 'Terrorist' : 'Counter-Terrorist') : ''}${p?.hasBomb ? ' · <span style="color:#ff9d8a">C4</span>' : ''}${p?.hasKit ? ' · Kit' : ''}${p?.canBuy ? ' · <span style="color:#ffd98a">B kaufen</span>' : ''}</div>`;
    if (s) {
      const mag = Number.isFinite(s.mag) ? s.mag : '∞';
      const res = Number.isFinite(s.reserve) ? s.reserve : '∞';
      const reload = s.reloading ? ' <span style="color:#ffd98a">[Nachladen…]</span>' : '';
      this.statusR.innerHTML = `<span style="color:#8fd0ff">${s.weaponName}</span>${reload}<div style="font-size:20px;font-weight:bold">${mag} <span style="font-size:12px;opacity:.7">/ ${res}</span></div>`;
      const names = ['1', '2', '3', '4', '5'];
      this.slotsEl.innerHTML = s.slots.map((id, i) => {
        if (!id && !(i === 3 && p && (p.nades.he + p.nades.flash + p.nades.smoke) > 0)) return `<span style="opacity:.3">${names[i]}</span>`;
        const label = i === 3 && p ? `${p.nades.he ? 'HE ' : ''}${p.nades.flash ? 'Flash×' + p.nades.flash + ' ' : ''}${p.nades.smoke ? 'Smoke' : ''}`.trim() : (WEAPONS[id!]?.name ?? id);
        const active = id === s.weaponId || (i === 3 && WEAPONS[s.weaponId]?.slot === 4);
        return `<span style="${active ? 'color:#9ff09f;font-weight:bold' : 'opacity:.75'}">${names[i]} ${label}</span>`;
      }).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
    }
  }

  setRound(info: RoundInfo): void {
    if (!this.roundBar) return;
    const phase = ({ warmup: 'AUFWÄRMEN', freeze: 'KAUFPHASE', live: 'RUNDE', bomb: 'BOMBE GELEGT', roundEnd: 'RUNDENENDE' } as Record<string, string>)[info.phase] ?? info.phase;
    const mm = Math.floor(info.timer / 60);
    const ss = String(info.timer % 60).padStart(2, '0');
    let txt = `<span style="color:#ffb070">T ${info.tRounds}</span> &nbsp;<span style="color:#ffd98a;font-size:16px;font-weight:bold">${mm}:${ss}</span>&nbsp; <span style="color:#8fc0ff">${info.ctRounds} CT</span>`
      + `<div style="font-size:11px;opacity:.75">${phase} · Runde ${info.round} · ${info.mapName} · lebend T ${info.alive.T} / CT ${info.alive.CT}</div>`;
    if (info.bombInfo) txt += `<div style="color:#ff9d8a;font-size:12px">${info.bombInfo}</div>`;
    this.roundBar.innerHTML = txt;
  }

  setNetInfo(text: string): void {
    if (this.netEl) this.netEl.textContent = text;
  }

  showBanner(text: string, color = '#ffd98a', ms = 3200): void {
    if (!this.banner) return;
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.banner.style.display = 'block';
    this.bannerTimer = ms / 1000;
  }

  notice(text: string): void {
    if (!this.noticeEl) return;
    this.noticeEl.textContent = text;
    this.noticeEl.style.display = 'block';
    this.noticeTimer = 3;
  }

  setHint(text: string | null): void {
    if (!this.hintEl) return;
    this.hintEl.style.display = text ? 'block' : 'none';
    if (text) this.hintEl.textContent = text;
  }

  setSpectator(text: string | null): void {
    if (!this.spectator) return;
    this.spectator.style.display = text ? 'block' : 'none';
    if (text) this.spectator.textContent = text;
  }

  hitmarker(killed = false): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      color: killed ? '#ff5040' : '#fff', font: `${killed ? 24 : 16}px Consolas, monospace`,
      fontWeight: 'bold', zIndex: '30', pointerEvents: 'none', textShadow: '0 0 6px #000',
    });
    el.textContent = killed ? '✕' : '+';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 160);
  }

  /** Roter Rand + Richtungspfeil (Winkel relativ zur Blickrichtung). */
  damageFrom(angle: number): void {
    this.dmgLevel = 1;
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '50%', left: '50%', width: '0', height: '0', zIndex: '16', pointerEvents: 'none',
      transform: `translate(-50%,-50%) rotate(${-angle}rad)`,
    });
    const arrow = document.createElement('div');
    Object.assign(arrow.style, {
      position: 'absolute', left: '-14px', top: '-130px', width: '0', height: '0',
      borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderBottom: '22px solid rgba(255,60,40,.85)',
    });
    el.appendChild(arrow);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  flash(strength: number): void {
    this.flashLevel = Math.max(this.flashLevel, strength * 2.2);
    this.flashEl!.style.opacity = '1';
  }

  pushKill(e: Extract<GameEvent, { k: 'kill' }>, m: MatchState): void {
    const name = (id: string | null): string => esc(id ? (m.players[id]?.name ?? id) : 'Welt');
    const color = (id: string | null): string => (id && m.players[id]?.team === 'T' ? '#ffb070' : '#8fc0ff');
    const w = WEAPONS[e.weapon]?.name ?? e.weapon;
    const html = `<span style="color:${color(e.killer)}">${name(e.killer)}</span> <span style="opacity:.7">[${w}${e.hs ? ' ☠' : ''}]</span> <span style="color:${color(e.victim)}">${name(e.victim)}</span>`;
    this.feedEntries.push({ html, t: performance.now() });
    if (this.feedEntries.length > 6) this.feedEntries.shift();
    this.renderFeed();
  }

  private renderFeed(): void {
    if (this.feed) this.feed.innerHTML = this.feedEntries.map((f) => `<div style="background:${PANEL};padding:1px 8px;border-radius:4px;margin-bottom:2px;display:inline-block">${f.html}</div>`).join('<br>');
  }

  setChat(lines: { who: string; text: string; team: Team | null }[]): void {
    if (!this.chatBox) return;
    this.chatBox.innerHTML = lines.slice(-6).map((l) => `<div><span style="color:${l.team === 'T' ? '#ffb070' : l.team === 'CT' ? '#8fc0ff' : '#ccc'}">${esc(l.who)}:</span> ${esc(l.text)}</div>`).join('');
  }

  setRadar(self: Pose, others: RadarDot[], team: Team, bombPos: Vec3 | null): void {
    const c = this.radar?.getContext('2d');
    if (!c || !this.radar) return;
    const size = this.radar.width;
    const view = { size, range: 45 };
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    c.clip();
    // Solids (Regale/Wände/Props) als gedrehte Rechtecke
    c.fillStyle = 'rgba(140,160,180,.55)';
    for (const s of this.solids) {
      const corners = [[s.minX, s.minZ], [s.maxX, s.minZ], [s.maxX, s.maxZ], [s.minX, s.maxZ]].map(([x, z]) => worldToRadar(self.x, self.z, self.yaw, x!, z!, view));
      if (!corners.some((p) => p.inside)) continue;
      c.beginPath();
      c.moveTo(corners[0]!.x, corners[0]!.y);
      for (const p of corners.slice(1)) c.lineTo(p.x, p.y);
      c.closePath();
      c.fill();
    }
    if (bombPos) {
      const b = worldToRadar(self.x, self.z, self.yaw, bombPos.x, bombPos.z, view);
      c.fillStyle = '#ff5040';
      c.font = 'bold 12px Consolas';
      c.fillText('C4', b.x - 8, b.y + 4);
    }
    for (const o of others) {
      if (!o.alive) continue;
      const mate = o.team === team;
      if (!mate) continue; // Gegner nur im Sichtfeld? CS-Radar zeigt nur Teamkameraden
      const p = worldToRadar(self.x, self.z, self.yaw, o.x, o.z, view);
      c.fillStyle = o.team === 'T' ? '#ffb070' : '#8fc0ff';
      c.beginPath();
      c.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    // Eigene Position (Pfeil nach oben)
    c.fillStyle = '#9ff09f';
    c.beginPath();
    c.moveTo(size / 2, size / 2 - 7);
    c.lineTo(size / 2 - 5, size / 2 + 5);
    c.lineTo(size / 2 + 5, size / 2 + 5);
    c.closePath();
    c.fill();
    c.restore();
  }

  setRadarLabel(text: string): void {
    if (this.radarLabel) this.radarLabel.textContent = text;
  }

  setScoreboard(m: MatchState, localId: string): void {
    if (!this.score) return;
    const sb = scoreboard(m);
    const rows = (team: Team): string => sb[team].map((p) => `<tr style="${p.id === localId ? 'color:#9ff09f' : ''}${p.alive ? '' : ';opacity:.5'}"><td>${esc(p.name)}${p.bot ? ' <span style="opacity:.5">(Bot)</span>' : ''}${p.loadout.bomb ? ' <span style="color:#ff9d8a">C4</span>' : ''}</td><td style="text-align:right">${p.kills}</td><td style="text-align:right">${p.deaths}</td><td style="text-align:right">$${p.money.amount}</td><td style="text-align:right">${p.ping}</td></tr>`).join('');
    const table = (team: Team, title: string, color: string): string => `<div style="color:${color};font-weight:bold;margin-top:8px">${title} — ${team === 'T' ? m.round.tRounds : m.round.ctRounds} Runden</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="opacity:.6"><th style="text-align:left">Name</th><th style="text-align:right">K</th><th style="text-align:right">D</th><th style="text-align:right">Geld</th><th style="text-align:right">Ping</th></tr>${rows(team)}</table>`;
    this.score.innerHTML = `<div style="text-align:center;font-weight:bold;letter-spacing:2px">SCOREBOARD · Runde ${m.round.round}</div>${table('CT', 'Counter-Terroristen', '#8fc0ff')}${table('T', 'Terroristen', '#ffb070')}`;
  }

  // ---------------------------------------------------------------- Menüs

  private openBuy(): void {
    if (!this.lastPlayer?.canBuy || !this.lastPlayer.alive) {
      this.notice('Kaufen nur in der Kaufphase');
      return;
    }
    this.buyOpen = true;
    this.buyCategory = null;
    this.renderBuy();
    this.buy!.style.display = 'block';
    this.onMenuChange?.(true);
  }

  private closeBuy(): void {
    this.buyOpen = false;
    this.buy!.style.display = 'none';
    this.onMenuChange?.(false);
  }

  private renderBuy(): void {
    const p = this.lastPlayer;
    if (!this.buy || !p) return;
    const line = (key: string, label: string, price: number | null, cb: () => void, dim = false): string => {
      const id = `buy-${key}-${label.replace(/\W/g, '')}`;
      setTimeout(() => this.buy?.querySelector<HTMLElement>('#' + CSS.escape(id))?.addEventListener('click', cb), 0);
      return `<div id="${id}" style="cursor:pointer;${dim ? 'opacity:.45' : ''}"><span style="color:#ffd98a;display:inline-block;width:22px">${key}</span> ${label}${price !== null ? ` <span style="float:right;color:${price <= p.money ? '#7fe0a0' : '#ff6a5a'}">$${price}</span>` : ''}</div>`;
    };
    let html = `<div style="color:#8fd0ff;font-weight:bold;letter-spacing:2px;margin-bottom:6px">KAUFMENÜ &nbsp;<span style="color:#7fe0a0">$${p.money}</span> <span style="float:right;opacity:.6;font-size:11px">B/Esc schließen</span></div>`;
    if (!this.buyCategory) {
      for (const cat of BUY_CATEGORIES.filter((c) => c.id !== 'equipment')) html += line(String(cat.key), cat.name, null, () => { this.buyCategory = cat.id; this.renderBuy(); });
      html += line('6', 'Munition Primärwaffe', AMMO_PRICE.primary, () => this.onBuyAmmo?.(1));
      html += line('7', 'Munition Pistole', AMMO_PRICE.secondary, () => this.onBuyAmmo?.(2));
      html += line('8', 'Ausrüstung (Weste, Helm, Granaten, Kit)', null, () => { this.buyCategory = 'equipment'; this.renderBuy(); });
    } else if (this.buyCategory === 'equipment') {
      const items: { id: string; name: string; price: number; team: 'T' | 'CT' | 'both' }[] = [
        EQUIPMENT.kevlar, EQUIPMENT.helmet,
        ...['flashbang', 'hegrenade', 'smokegrenade'].map((id) => ({ id, name: WEAPONS[id]!.name, price: WEAPONS[id]!.price, team: WEAPONS[id]!.team })),
        EQUIPMENT.defusekit,
      ];
      html += `<div style="opacity:.6;font-size:11px">0 zurück</div>`;
      items.forEach((it, i) => {
        const dim = it.team !== 'both' && it.team !== p.team;
        html += line(String(i + 1), it.name, it.price, () => { if (!dim) this.onBuy?.(it.id); }, dim);
      });
    } else {
      const list = weaponsInCategory(this.buyCategory, p.team);
      html += `<div style="opacity:.6;font-size:11px">0 zurück</div>`;
      list.forEach((w, i) => { html += line(String(i + 1), w.name, w.price, () => this.onBuy?.(w.id)); });
      if (!list.length) html += '<div style="opacity:.6">Nichts verfügbar</div>';
    }
    this.buy.innerHTML = html;
  }

  private buyKey(code: string): boolean {
    const p = this.lastPlayer;
    if (!p) return false;
    const n = /^Digit(\d)$/.exec(code)?.[1];
    if (code === 'Escape' || code === 'KeyB') { this.closeBuy(); return true; }
    if (!n) return true;
    const k = Number(n);
    if (!this.buyCategory) {
      const cat = BUY_CATEGORIES.find((c) => c.key === k && c.id !== 'equipment');
      if (cat) { this.buyCategory = cat.id; this.renderBuy(); }
      else if (k === 6) this.onBuyAmmo?.(1);
      else if (k === 7) this.onBuyAmmo?.(2);
      else if (k === 8) { this.buyCategory = 'equipment'; this.renderBuy(); }
      return true;
    }
    if (k === 0) { this.buyCategory = null; this.renderBuy(); return true; }
    if (this.buyCategory === 'equipment') {
      const ids = ['kevlar', 'helmet', 'flashbang', 'hegrenade', 'smokegrenade', 'defusekit'];
      const id = ids[k - 1];
      if (id) this.onBuy?.(id);
      return true;
    }
    const list = weaponsInCategory(this.buyCategory, p.team);
    const w = list[k - 1];
    if (w) this.onBuy?.(w.id);
    return true;
  }

  private openChat(): void {
    this.chatOpen = true;
    this.chatInput!.style.display = 'block';
    this.chatInput!.focus();
    this.onMenuChange?.(true);
  }

  private closeChat(): void {
    this.chatOpen = false;
    this.chatInput!.style.display = 'none';
    this.chatInput!.blur();
    this.onMenuChange?.(false);
  }

  private openTeam(): void {
    this.teamOpen = true;
    this.teamBox!.innerHTML = `<div style="font-weight:bold;letter-spacing:2px;margin-bottom:6px">TEAM WÄHLEN</div>
      <div id="team-t" style="cursor:pointer;color:#ffb070">1 &nbsp;Terroristen</div>
      <div id="team-ct" style="cursor:pointer;color:#8fc0ff">2 &nbsp;Counter-Terroristen</div>
      <div style="opacity:.6;font-size:11px">Esc schließen</div>`;
    this.teamBox!.style.display = 'block';
    this.teamBox!.querySelector('#team-t')?.addEventListener('click', () => { this.onTeam?.('T'); this.closeTeam(); });
    this.teamBox!.querySelector('#team-ct')?.addEventListener('click', () => { this.onTeam?.('CT'); this.closeTeam(); });
    this.onMenuChange?.(true);
  }

  private closeTeam(): void {
    this.teamOpen = false;
    this.teamBox!.style.display = 'none';
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
    else if (e.code === 'KeyY' || e.code === 'Enter') { this.openChat(); e.preventDefault(); }
    else if (e.code === 'KeyM') this.openTeam();
    else if (e.code === 'Tab') {
      this.scoreboardVisible = true;
      this.score!.style.display = 'block';
      e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') {
      this.scoreboardVisible = false;
      if (this.score) this.score.style.display = 'none';
    }
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}
