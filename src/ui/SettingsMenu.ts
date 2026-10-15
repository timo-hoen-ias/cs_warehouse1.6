import {
  CROSSHAIR_SIZE_MAX,
  CROSSHAIR_SIZE_MIN,
  DEFAULT_SETTINGS,
  FOV_MAX,
  FOV_MIN,
  formatSensitivity,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  sensitivityToSlider,
  sliderToSensitivity,
  type CrosshairStyle,
  type KeyValueStore,
  type Settings,
} from '../logic/settings';

const FONT = '13px Consolas, "Lucida Console", monospace';

/**
 * Einstellungsmenü (DOM-Overlay): Maus, Sicht, Ton, Fadenkreuz, Anzeige.
 * Änderungen wirken live (`onChange`) und werden sofort gespeichert.
 * Öffnen/Schließen mit O (Esc schließt); Knopf unten links nur ohne Pointer-Lock.
 */
export class SettingsMenu {
  onChange?: (s: Settings) => void;
  onLeave?: () => void;
  onOpenChange?: (open: boolean) => void;

  private current: Settings;
  private root: HTMLDivElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private openBtn: HTMLButtonElement | null = null;
  private opened = false;

  private sens!: HTMLInputElement;
  private sensVal!: HTMLSpanElement;
  private invert!: HTMLInputElement;
  private fov!: HTMLInputElement;
  private fovVal!: HTMLSpanElement;
  private vol!: HTMLInputElement;
  private volVal!: HTMLSpanElement;
  /** Lautstärke-Kanäle: Effekte, Umgebung, Oberfläche. */
  private readonly volCh: Record<'volumeEffects' | 'volumeAmbience' | 'volumeUi', { input: HTMLInputElement; val: HTMLSpanElement } | null> = {
    volumeEffects: null, volumeAmbience: null, volumeUi: null,
  };
  private color!: HTMLInputElement;
  private style!: HTMLSelectElement;
  private size!: HTMLInputElement;
  private sizeVal!: HTMLSpanElement;
  private bob!: HTMLInputElement;
  private fps!: HTMLInputElement;

  constructor(private readonly store: KeyValueStore | null) {
    this.current = loadSettings(store);
  }

  get settings(): Settings {
    return { ...this.current };
  }

  mount(parent: HTMLElement = document.body): void {
    if (this.root) return;
    const root = document.createElement('div');
    this.root = root;

    this.openBtn = document.createElement('button');
    this.openBtn.textContent = '⚙ Einstellungen (O)';
    Object.assign(this.openBtn.style, {
      position: 'fixed', left: '18px', bottom: '70px', zIndex: '39', pointerEvents: 'auto', cursor: 'pointer',
      background: 'rgba(14,18,24,.85)', border: '1px solid #2a333d', color: '#dfe6ee', font: FONT,
      padding: '5px 10px', borderRadius: '6px', display: 'none',
    });
    this.openBtn.addEventListener('click', () => this.open());
    root.appendChild(this.openBtn);

    const overlay = document.createElement('div');
    this.overlay = overlay;
    Object.assign(overlay.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: '40', pointerEvents: 'auto',
      display: 'none', width: '460px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box',
      background: 'rgba(14,18,24,.95)', border: '1px solid #2a333d', borderRadius: '12px', padding: '18px 22px',
      boxShadow: '0 20px 60px #000', font: FONT, color: '#dfe6ee',
    });
    overlay.appendChild(this.title());
    const grid = document.createElement('div');
    Object.assign(grid.style, { display: 'grid', gridTemplateColumns: '170px 1fr', gap: '10px 12px', alignItems: 'center' });
    overlay.appendChild(grid);

    const sensRow = this.range(0, 100, 0.1);
    this.sens = sensRow.input; this.sensVal = sensRow.val;
    this.row(grid, 'Mausempfindlichkeit', sensRow.wrap);
    this.invert = this.checkbox();
    this.row(grid, 'Maus Y invertieren', this.invert);
    const fovRow = this.range(FOV_MIN, FOV_MAX, 1);
    this.fov = fovRow.input; this.fovVal = fovRow.val;
    this.row(grid, 'Sichtfeld', fovRow.wrap);
    const volRow = this.range(0, 100, 1);
    this.vol = volRow.input; this.volVal = volRow.val;
    this.row(grid, 'Lautstärke', volRow.wrap);
    for (const [key, label] of [['volumeEffects', '· Effekte'], ['volumeAmbience', '· Umgebung'], ['volumeUi', '· Oberfläche']] as const) {
      const r = this.range(0, 100, 1);
      this.volCh[key] = { input: r.input, val: r.val };
      this.row(grid, label, r.wrap);
    }
    this.color = document.createElement('input');
    this.color.type = 'color';
    Object.assign(this.color.style, { width: '56px', height: '28px', padding: '0', background: 'none', border: '1px solid #3a4652', borderRadius: '5px', cursor: 'pointer' });
    this.row(grid, 'Fadenkreuz-Farbe', this.color);
    this.style = document.createElement('select');
    this.style.setAttribute('style', inputStyle());
    for (const [v, label] of [['classic', 'Klassisch'], ['dot', 'Punkt'], ['circle', 'Kreis']] as const) {
      const o = document.createElement('option');
      o.value = v; o.textContent = label;
      this.style.appendChild(o);
    }
    this.row(grid, 'Fadenkreuz-Stil', this.style);
    const sizeRow = this.range(CROSSHAIR_SIZE_MIN, CROSSHAIR_SIZE_MAX, 1);
    this.size = sizeRow.input; this.sizeVal = sizeRow.val;
    this.row(grid, 'Fadenkreuz-Größe', sizeRow.wrap);
    this.bob = this.checkbox();
    this.row(grid, 'Kopfbewegung', this.bob);
    this.fps = this.checkbox();
    this.row(grid, 'FPS anzeigen', this.fps);

    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' });
    buttons.appendChild(this.button('Zurücksetzen', '#8a5a2a', () => this.reset()));
    buttons.appendChild(this.button('Schließen', '#3a7d44', () => this.close()));
    buttons.appendChild(this.button('Spiel verlassen', '#b33a2f', () => this.onLeave?.()));
    overlay.appendChild(buttons);
    const hint = document.createElement('div');
    hint.textContent = 'O oder Esc schließt das Menü · Änderungen werden automatisch gespeichert';
    Object.assign(hint.style, { marginTop: '12px', fontSize: '11px', opacity: '0.6' });
    overlay.appendChild(hint);

    root.appendChild(overlay);
    parent.appendChild(root);

    // Eingaben im Overlay lösen keine Spieltasten aus; O/Esc werden hier selbst behandelt.
    overlay.addEventListener('keydown', this.onOverlayKey);
    const channels = Object.values(this.volCh).flatMap((c) => (c ? [c.input] : []));
    for (const el of [this.sens, this.invert, this.fov, this.vol, ...channels, this.color, this.size, this.bob, this.fps]) {
      el.addEventListener('input', this.onControl);
    }
    this.style.addEventListener('change', this.onControl);
    document.addEventListener('keydown', this.onDocKey);
    document.addEventListener('pointerlockchange', this.updateButton);

    this.applyToControls();
    this.updateButton();
  }

  open(): void {
    if (!this.overlay || this.opened) return;
    this.opened = true;
    this.overlay.style.display = 'block';
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignorieren */ }
    this.updateButton();
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.overlay || !this.opened) return;
    this.opened = false;
    this.overlay.style.display = 'none';
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
    return this.opened;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onDocKey);
    document.removeEventListener('pointerlockchange', this.updateButton);
    this.root?.remove();
    this.root = null;
    this.overlay = null;
    this.openBtn = null;
    this.opened = false;
  }

  // ---- intern ----

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
    if (!this.openBtn) return;
    this.openBtn.style.display = !document.pointerLockElement && !this.opened ? 'block' : 'none';
  };

  private readonly onControl = (): void => {
    const next = sanitizeSettings({
      sensitivity: sliderToSensitivity(Number(this.sens.value)),
      invertY: this.invert.checked,
      fov: Number(this.fov.value),
      volume: Number(this.vol.value) / 100,
      volumeEffects: Number(this.volCh.volumeEffects?.input.value ?? 100) / 100,
      volumeAmbience: Number(this.volCh.volumeAmbience?.input.value ?? 100) / 100,
      volumeUi: Number(this.volCh.volumeUi?.input.value ?? 100) / 100,
      crosshairColor: this.color.value,
      crosshairStyle: this.style.value as CrosshairStyle,
      crosshairSize: Number(this.size.value),
      showFps: this.fps.checked,
      bobbing: this.bob.checked,
    });
    this.commit(next);
  };

  private reset(): void {
    this.commit({ ...DEFAULT_SETTINGS });
    this.applyToControls();
  }

  private commit(next: Settings): void {
    this.current = next;
    this.updateLabels();
    saveSettings(this.store, next);
    this.onChange?.({ ...next });
  }

  private applyToControls(): void {
    const s = this.current;
    this.sens.value = String(sensitivityToSlider(s.sensitivity));
    this.invert.checked = s.invertY;
    this.fov.value = String(s.fov);
    this.vol.value = String(Math.round(s.volume * 100));
    for (const [key, ch] of Object.entries(this.volCh) as [keyof typeof this.volCh, { input: HTMLInputElement } | null][]) {
      if (ch) ch.input.value = String(Math.round(s[key] * 100));
    }
    this.color.value = s.crosshairColor;
    this.style.value = s.crosshairStyle;
    this.size.value = String(s.crosshairSize);
    this.bob.checked = s.bobbing;
    this.fps.checked = s.showFps;
    this.updateLabels();
  }

  private updateLabels(): void {
    const s = this.current;
    this.sensVal.textContent = formatSensitivity(s.sensitivity);
    this.fovVal.textContent = `${Math.round(s.fov)}°`;
    this.volVal.textContent = `${Math.round(s.volume * 100)} %`;
    for (const [key, ch] of Object.entries(this.volCh) as [keyof typeof this.volCh, { val: HTMLSpanElement } | null][]) {
      if (ch) ch.val.textContent = `${Math.round(s[key] * 100)} %`;
    }
    this.sizeVal.textContent = `${Math.round(s.crosshairSize)} px`;
  }

  private title(): HTMLDivElement {
    const t = document.createElement('div');
    t.textContent = 'EINSTELLUNGEN';
    Object.assign(t.style, { fontSize: '20px', fontWeight: 'bold', letterSpacing: '3px', color: '#ffd98a', marginBottom: '14px' });
    return t;
  }

  private row(grid: HTMLElement, label: string, control: HTMLElement): void {
    const l = document.createElement('label');
    l.textContent = label;
    grid.appendChild(l);
    grid.appendChild(control);
  }

  private range(min: number, max: number, step: number): { wrap: HTMLDivElement; input: HTMLInputElement; val: HTMLSpanElement } {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '10px' });
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    Object.assign(input.style, { flex: '1', minWidth: '0', accentColor: '#ffd98a', cursor: 'pointer' });
    const val = document.createElement('span');
    Object.assign(val.style, { minWidth: '56px', textAlign: 'right', color: '#ffd98a' });
    wrap.appendChild(input);
    wrap.appendChild(val);
    return { wrap, input, val };
  }

  private checkbox(): HTMLInputElement {
    const c = document.createElement('input');
    c.type = 'checkbox';
    Object.assign(c.style, { width: '18px', height: '18px', accentColor: '#ffd98a', cursor: 'pointer', justifySelf: 'start' });
    return c;
  }

  private button(text: string, bg: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.setAttribute('style', btn(bg));
    b.addEventListener('click', onClick);
    return b;
  }
}

/** Elemente, in denen Tastatureingaben Text bzw. Typeahead bedeuten (O darf dort nicht umschalten). */
function isTextEntry(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLInputElement) return !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset'].includes(t.type);
  return false;
}

function inputStyle(): string {
  return 'background:#0e1217;border:1px solid #3a4652;color:#fff;padding:6px 8px;border-radius:5px;font:inherit;width:100%;box-sizing:border-box';
}

function btn(bg: string): string {
  return `background:${bg};border:none;color:#fff;padding:10px 14px;border-radius:6px;font:inherit;font-weight:bold;cursor:pointer;flex:1;min-width:120px`;
}
