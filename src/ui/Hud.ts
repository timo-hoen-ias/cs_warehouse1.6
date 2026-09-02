import type { HudState } from '../weapons/Shooter';

/**
 * FPS-HUD als HTML-Overlay (Over the Canvas): Fadenkreuz + Statuszeile.
 * Werte kommen aus dem Shooter-Zustand (onHud).
 */
export class Hud {
  private root?: HTMLDivElement;
  private cross?: HTMLDivElement;
  private crossLines: HTMLDivElement[] = [];
  private info?: HTMLDivElement;
  private banner?: HTMLDivElement;
  private roundInfo?: HTMLDivElement;
  private buy?: HTMLDivElement;
  private readonly el = () => document.querySelector('needle-engine') as HTMLElement | null;

  mount(): void {
    const host = this.el() ?? document.body;

    // Fadenkreuz: fixer Mittelpunkt + 4 Linien, deren Abstand die Streuung anzeigt.
    this.cross = document.createElement('div');
    Object.assign(this.cross.style, {
      position: 'absolute', top: '50%', left: '50%', width: '0', height: '0',
      zIndex: '10', pointerEvents: 'none', opacity: '0.85',
    });
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'absolute', left: '-1px', top: '-1px', width: '2px', height: '2px',
      background: '#fff', borderRadius: '50%',
    });
    this.cross.appendChild(dot);
    const bar = (w: number, h: number): HTMLDivElement => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h}px`,
        background: '#fff',
      });
      this.cross!.appendChild(d);
      this.crossLines.push(d);
      return d;
    };
    const L = 9; // Linienlänge
    bar(2, L); // oben
    bar(2, L); // unten
    bar(L, 2); // links
    bar(L, 2); // rechts

    this.info = document.createElement('div');
    Object.assign(this.info.style, {
      position: 'absolute', bottom: '18px', left: '50%', transform: 'translateX(-50%)',
      color: '#dfe6ee', font: '13px Consolas, monospace', letterSpacing: '1px',
      background: 'rgba(10,13,18,.6)', padding: '6px 16px', borderRadius: '6px',
      zIndex: '10', pointerEvents: 'none', textAlign: 'center', minWidth: '280px',
    });
    this.banner = document.createElement('div');
    Object.assign(this.banner.style, {
      position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
      color: '#ffd98a', font: 'bold 28px Consolas, monospace', letterSpacing: '2px',
      textShadow: '0 2px 8px rgba(0,0,0,.8)', zIndex: '10', pointerEvents: 'none',
      display: 'none', textAlign: 'center',
    });
    this.buy = document.createElement('div');
    Object.assign(this.buy.style, {
      position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
      color: '#dfe6ee', font: '13px Consolas, monospace', background: 'rgba(10,13,18,.85)',
      padding: '14px 18px', borderRadius: '8px', border: '1px solid #2a333d',
      zIndex: '11', display: 'none', pointerEvents: 'none', lineHeight: '1.9',
    });
    this.roundInfo = document.createElement('div');
    Object.assign(this.roundInfo.style, {
      position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
      color: '#dfe6ee', font: '13px Consolas, monospace', letterSpacing: '1px',
      background: 'rgba(10,13,18,.55)', padding: '4px 14px', borderRadius: '6px',
      zIndex: '10', pointerEvents: 'none', textAlign: 'center', whiteSpace: 'nowrap',
    });
    this.root = document.createElement('div');
    this.root.append(this.cross, this.info, this.banner, this.roundInfo, this.buy);
    host.appendChild(this.root);
  }

  /** Zeigt ein großes Banner kurz an (z. B. Rundenende). */
  showBanner(text: string): void {
    if (!this.banner) return;
    this.banner.textContent = text;
    this.banner.style.display = 'block';
    setTimeout(() => { if (this.banner) this.banner.style.display = 'none'; }, 3200);
  }

  /** Einfaches Buy-Overlay (M2): nur Status; echte Käufe im GameMode. */
  showBuy(visible: boolean, ctx: { t: number }): void {
    if (!this.buy) return;
    this.buy.style.display = visible ? 'block' : 'none';
    if (visible) {
      this.buy.innerHTML = `<div style="color:#8fd0ff;margin-bottom:6px">KAUFMENÜ (B)</div>
        <div>Geld: <span style="color:#7fe0a0">$${ctx.t}</span></div>
        <div style="opacity:.6;font-size:11px;margin-top:6px">Kauf-System folgt mit Economy-UI</div>`;
    }
  }

  /** Obere Statuszeile: Runde/Phase/Timer/Score/Bombe (vom GameMode gefüttert). */
  setRound(info: { phase: string; timer: number; score: string; bombInfo: string }): void {
    if (!this.roundInfo) return;
    const phase = ({ warmup: 'WARMUP', freeze: 'KAUFEN', live: 'KAMPF', bomb: 'BOMBE', roundEnd: 'RUNDE ENDE' } as Record<string, string>)[info.phase] ?? info.phase;
    let txt = `<span style="color:#8fd0ff">${phase}</span> · <span style="color:#ffd98a">${info.timer}s</span> · ${info.score}`;
    if (info.bombInfo) txt += `<span style="color:#ff9d8a"> · ${info.bombInfo}</span>`;
    this.roundInfo.innerHTML = txt;
  }

  /** Kurzzeitiges Hitmarker-X bei Treffer (rot + größer bei Kill). */
  hitmarker(killed = false): void {
    if (!this.banner) return;
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      color: killed ? '#ff5040' : '#fff', font: `${killed ? 22 : 16}px Consolas, monospace`,
      fontWeight: 'bold', zIndex: '30', pointerEvents: 'none', textShadow: '0 0 6px #000',
    });
    el.textContent = killed ? '✕' : '+';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 160);
  }

  update(s: HudState): void {
    if (!this.crossLines.length) return;
    // Fadenkreuz: Linien weichen mit der Streuung (Gap in px) vom Zentrum ab.
    const gap = Math.max(1.5, s.spreadPx ?? 0);
    const [top, bottom, left, right] = this.crossLines;
    top.style.transform = `translate(-1px, calc(-100% - ${gap}px))`;
    bottom.style.transform = `translate(-1px, ${gap}px)`;
    left.style.transform = `translate(calc(-100% - ${gap}px), -1px)`;
    right.style.transform = `translate(${gap}px, -1px)`;

    if (!this.info) return;
    const mag = Number.isFinite(s.mag) ? s.mag : '∞';
    const res = Number.isFinite(s.reserve) ? s.reserve : '∞';
    const reload = s.reloading ? '   [Nachladen…]' : '';
    this.info.innerHTML = `<span style="color:#8fd0ff">${s.weaponName}</span>   ${mag} / ${res}   HP <span style="color:#ff9d8a">${s.hp}</span>${reload}
      <div style="font-size:11px;opacity:.6;margin-top:3px">1 Messer · 2 Pistole · 3 Primär · 4 Pistole 2 · R Nachladen</div>`;
  }

  showStartHint(on: boolean): void {
    // Hinweis bleibt eigenständig in main.ts; hier nichts zu tun (kompat).
    void on;
  }

  dispose(): void {
    this.root?.remove();
    this.root = undefined;
  }
}
