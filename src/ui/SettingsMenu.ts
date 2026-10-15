import './theme.css';
import './hud.css';
import './settings.css';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  type KeyValueStore,
  type Settings,
} from '../logic/settings';
import { SETTINGS_SECTIONS, applyControl, controlToSlider, type SettingControl, type SettingsSection } from '../logic/settingsSchema';
import { escapeHtml } from '../logic/hudFormat';
import { computeUiScale } from '../logic/uiScale';

export type SettingsMenuMode = 'game' | 'menu';

/**
 * Einstellungsmenü (DOM), datengetrieben aus `logic/settingsSchema.ts`: Abschnitte
 * als Reiter, Regler/Schalter/Auswahl/Farbe je Eintrag, Fadenkreuz-Vorschau.
 * Änderungen wirken live (`onChange`) und werden sofort gespeichert.
 * Im Spiel: Modal, O öffnet/schließt (Esc schließt), Knopf nur ohne Pointer-Lock.
 * Im Hauptmenü: eingebettet in einen Container (`mountInline`).
 */
export class SettingsMenu {
  onChange?: (s: Settings) => void;
  onLeave?: () => void;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;

  private current: Settings;
  private root: HTMLDivElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private openBtn: HTMLButtonElement | null = null;
  private opened = false;
  private mode: SettingsMenuMode = 'game';
  private tab: string;
  private readonly inputs = new Map<string, { c: SettingControl; el: HTMLElement; val?: HTMLElement }>();
  private preview: HTMLElement | null = null;

  constructor(private readonly store: KeyValueStore | null, private readonly sections: SettingsSection[] = SETTINGS_SECTIONS) {
    this.current = loadSettings(store);
    this.tab = sections[0]?.id ?? '';
  }

  get settings(): Settings {
    return { ...this.current };
  }

  /** Im Spiel: Modal + Öffnen-Knopf, O/Esc. */
  mount(parent: HTMLElement = document.body): void {
    if (this.root) return;
    this.mode = 'game';
    const root = document.createElement('div');
    root.className = 'ui-scope';
    this.root = root;
    const btn = document.createElement('button');
    btn.className = 'ui-btn small set-open';
    btn.textContent = '⚙ Einstellungen (O)';
    btn.addEventListener('click', () => this.open());
    this.openBtn = btn;
    root.appendChild(btn);
    const overlay = document.createElement('div');
    overlay.className = 'set-overlay';
    overlay.appendChild(this.buildPanel());
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.close(); });
    this.overlay = overlay;
    root.appendChild(overlay);
    parent.appendChild(root);
    overlay.addEventListener('keydown', this.onOverlayKey);
    document.addEventListener('keydown', this.onDocKey);
    document.addEventListener('pointerlockchange', this.updateButton);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.applyToControls();
    this.updateButton();
  }

  /** Im Hauptmenü: Panel direkt in einen Container (ohne Modal/Tastenkürzel). */
  mountInline(container: HTMLElement): void {
    if (this.root) return;
    this.mode = 'menu';
    const root = document.createElement('div');
    root.className = 'set-embedded';
    root.style.height = '100%';
    root.appendChild(this.buildPanel());
    this.root = root;
    container.appendChild(root);
    this.opened = true;
    this.applyToControls();
  }

  open(): void {
    if (!this.overlay || this.opened) return;
    this.opened = true;
    this.overlay.classList.add('on');
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignorieren */ }
    this.updateButton();
    this.onOpenChange?.(true);
  }

  close(): void {
    if (this.mode === 'menu') { this.onClose?.(); return; }
    if (!this.overlay || !this.opened) return;
    this.opened = false;
    this.overlay.classList.remove('on');
    const a = document.activeElement;
    if (a instanceof HTMLElement && this.overlay.contains(a)) a.blur();
    this.updateButton();
    this.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  isOpen(): boolean {
    return this.mode === 'game' && this.opened;
  }

  /** Einzelne Werte von außen setzen (z. B. Musik-Stumm-Knopf im Menü). */
  update(partial: Partial<Settings>): void {
    this.commit(sanitizeSettings({ ...this.current, ...partial }));
    this.applyToControls();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onDocKey);
    document.removeEventListener('pointerlockchange', this.updateButton);
    window.removeEventListener('resize', this.onResize);
    this.root?.remove();
    this.root = null;
    this.overlay = null;
    this.openBtn = null;
    this.opened = false;
    this.inputs.clear();
  }

  // ---- Aufbau ----

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'set-panel ui-scope';
    const tabs = this.sections.map((s) => `<button class="set-tab${s.id === this.tab ? ' on' : ''}" data-tab="${s.id}">${escapeHtml(s.title)}</button>`).join('');
    panel.innerHTML = `<header><h2 class="ui-title">Einstellungen</h2><span class="hint">O oder Esc schließt · Änderungen werden automatisch gespeichert</span></header>
      <nav class="set-tabs">${tabs}</nav><div class="set-body ui-scroll"></div>
      <footer><span class="note">Alle Änderungen wirken sofort.</span></footer>`;
    const body = panel.querySelector<HTMLElement>('.set-body')!;
    for (const sec of this.sections) body.appendChild(this.buildSection(sec));
    const footer = panel.querySelector('footer')!;
    footer.appendChild(this.button('Zurücksetzen', '', () => this.reset()));
    if (this.mode === 'game') {
      footer.appendChild(this.button('Spiel verlassen', 'danger', () => this.onLeave?.()));
      footer.appendChild(this.button('Schließen', 'primary', () => this.close()));
    } else footer.appendChild(this.button('Zurück', 'primary', () => this.close()));
    panel.querySelector('.set-tabs')!.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (t) this.showTab(t.dataset.tab!, panel);
    });
    return panel;
  }

  private showTab(id: string, panel: HTMLElement): void {
    this.tab = id;
    for (const b of panel.querySelectorAll<HTMLElement>('.set-tab')) b.classList.toggle('on', b.dataset.tab === id);
    for (const s of panel.querySelectorAll<HTMLElement>('.set-sec')) s.classList.toggle('on', s.dataset.sec === id);
  }

  private buildSection(sec: SettingsSection): HTMLElement {
    const el = document.createElement('section');
    el.className = `set-sec${sec.id === this.tab ? ' on' : ''}`;
    el.dataset.sec = sec.id;
    el.innerHTML = `<h3>${escapeHtml(sec.title)}</h3>`;
    for (const c of sec.controls) el.appendChild(this.buildRow(c));
    if (sec.controls.some((c) => c.key === 'crosshairStyle')) {
      const pv = document.createElement('div');
      pv.className = 'set-preview';
      pv.innerHTML = '<div class="hud-cross" style="left:50%;top:50%"><i class="l-t"></i><i class="l-b"></i><i class="l-l"></i><i class="l-r"></i><i class="dot"></i><i class="ring"></i></div>';
      this.preview = pv.firstElementChild as HTMLElement;
      el.appendChild(pv);
    }
    return el;
  }

  private buildRow(c: SettingControl): HTMLElement {
    const row = document.createElement('div');
    row.className = 'set-row';
    const id = `set-${c.key}`;
    row.innerHTML = `<label for="${id}">${escapeHtml(c.label)}${c.hint ? `<small>${escapeHtml(c.hint)}</small>` : ''}</label>`;
    let control: HTMLElement;
    let val: HTMLElement | undefined;
    switch (c.kind) {
      case 'range': {
        const r = document.createElement('input');
        r.type = 'range';
        r.className = 'ui-range';
        r.min = String(c.min); r.max = String(c.max); r.step = String(c.step);
        r.addEventListener('input', () => { this.onInput(c, r.value); this.paintRange(r); });
        control = r;
        val = document.createElement('span');
        val.className = 'val';
        break;
      }
      case 'toggle': {
        const t = document.createElement('input');
        t.type = 'checkbox';
        t.className = 'ui-toggle';
        t.addEventListener('input', () => this.onInput(c, t.checked));
        control = t;
        break;
      }
      case 'select': {
        const seg = document.createElement('div');
        seg.className = 'ui-seg';
        seg.innerHTML = c.options.map((o) => `<button type="button" data-v="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('');
        seg.addEventListener('click', (e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
          if (b) this.onInput(c, b.dataset.v!);
        });
        control = seg;
        break;
      }
      case 'color': {
        const wrap = document.createElement('div');
        wrap.className = 'set-swatches';
        wrap.innerHTML = c.swatches.map((s) => `<button type="button" class="set-swatch" data-v="${s}" style="background:${s}" title="${s}"></button>`).join('') + '<input type="color" title="Eigene Farbe">';
        wrap.addEventListener('click', (e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
          if (b) this.onInput(c, b.dataset.v!);
        });
        wrap.querySelector('input')!.addEventListener('input', (e) => this.onInput(c, (e.target as HTMLInputElement).value));
        control = wrap;
        break;
      }
    }
    control.id = id;
    row.appendChild(control);
    row.appendChild(val ?? document.createElement('span'));
    this.inputs.set(c.key, { c, el: control, val });
    return row;
  }

  private button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `ui-btn ${cls}`;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  private paintRange(r: HTMLInputElement): void {
    const p = ((Number(r.value) - Number(r.min)) / Math.max(1e-9, Number(r.max) - Number(r.min))) * 100;
    r.style.setProperty('--p', `${p}%`);
  }

  // ---- Werte ----

  private onInput(c: SettingControl, raw: string | boolean): void {
    this.commit(sanitizeSettings(applyControl(this.current, c, raw)));
    this.applyToControls();
  }

  private reset(): void {
    this.commit({ ...DEFAULT_SETTINGS });
    this.applyToControls();
  }

  private commit(next: Settings): void {
    this.current = next;
    saveSettings(this.store, next);
    this.onChange?.({ ...next });
  }

  private applyToControls(): void {
    const s = this.current as Record<string, unknown>;
    for (const { c, el, val } of this.inputs.values()) {
      const v = s[c.key];
      switch (c.kind) {
        case 'range': {
          const r = el as HTMLInputElement;
          r.value = String(controlToSlider(c, v as number));
          this.paintRange(r);
          if (val) val.textContent = c.format(v as number);
          break;
        }
        case 'toggle': (el as HTMLInputElement).checked = v === true; break;
        case 'select': for (const b of el.querySelectorAll<HTMLElement>('[data-v]')) b.classList.toggle('on', b.dataset.v === v); break;
        case 'color':
          for (const b of el.querySelectorAll<HTMLElement>('[data-v]')) b.classList.toggle('on', b.dataset.v === v);
          (el.querySelector('input') as HTMLInputElement).value = String(v);
          break;
      }
    }
    this.paintPreview();
  }

  private paintPreview(): void {
    const p = this.preview;
    if (!p) return;
    const s = this.current;
    const k = 2; // Vorschau vergrößert
    p.className = `hud-cross s-${s.crosshairStyle}`;
    p.style.setProperty('--cc', s.crosshairColor);
    p.style.setProperty('--cl', `${s.crosshairSize * k}px`);
    p.style.setProperty('--ct', `${s.crosshairThickness * k}px`);
    p.style.setProperty('--cg', `${s.crosshairGap * k}px`);
  }

  // ---- Tasten / Knopf ----

  private readonly onResize = (): void => {
    if (this.mode !== 'game' || !this.root) return;
    this.root.style.setProperty('--u', `${computeUiScale(window.innerWidth, window.innerHeight, 1)}px`);
  };

  private readonly onDocKey = (e: KeyboardEvent): void => this.handleKey(e);

  private readonly onOverlayKey = (e: KeyboardEvent): void => {
    this.handleKey(e);
    e.stopPropagation();
  };

  private handleKey(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      if (this.opened) this.close();
      return;
    }
    if (e.code !== 'KeyO' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextEntry(e.target) || isTextEntry(document.activeElement)) return;
    this.toggle();
  }

  private readonly updateButton = (): void => {
    this.openBtn?.classList.toggle('on', !document.pointerLockElement && !this.opened);
  };
}

/** Elemente, in denen Tastatureingaben Text bzw. Typeahead bedeuten (O darf dort nicht umschalten). */
function isTextEntry(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLInputElement) return !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset'].includes(t.type);
  return false;
}
