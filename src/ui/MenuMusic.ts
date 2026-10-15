import { MENU_TRACKS, MUSIC_FADE, nextTrackIndex, type MusicTrack } from '../logic/music';

type Deck = { audio: HTMLAudioElement; env: number; target: number; seconds: number; track: number };

/**
 * Menümusik: zwei Audio-Elemente für weiche Überblendungen zwischen den Titeln,
 * Einblenden beim Start, Ausblenden beim Spielstart. Browser blockieren Autoplay
 * ohne Nutzergeste → `onBlocked(true)` (Hinweis „Klicken für Ton“), Wiedergabe
 * startet dann beim ersten Klick/Tastendruck. Pausiert, wenn der Tab verborgen ist.
 */
export class MenuMusic {
  onTrack?: (t: MusicTrack) => void;
  onBlocked?: (blocked: boolean) => void;

  private readonly decks: Deck[];
  private active = 0;
  private gain = 0.5;
  private running = false;
  private raf = 0;
  private last = 0;
  private blocked = false;
  private stopping: (() => void) | null = null;

  constructor(private readonly tracks: MusicTrack[] = MENU_TRACKS) {
    const mk = (): Deck => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audio.volume = 0;
      return { audio, env: 0, target: 0, seconds: MUSIC_FADE.in, track: -1 };
    };
    this.decks = [mk(), mk()];
    for (const d of this.decks) d.audio.addEventListener('ended', () => { if (d === this.decks[this.active]) this.next(); });
  }

  /** Startet (oder setzt fort) mit Lautstärke 0..1. */
  start(gain: number): void {
    this.gain = gain;
    if (this.running || !this.tracks.length) return;
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.play(this.decks[this.active]!, nextTrackIndex(-1, this.tracks.length), MUSIC_FADE.in);
    this.loop();
  }

  setGain(gain: number): void {
    this.gain = Math.min(1, Math.max(0, gain));
    if (this.gain > 0 && this.blocked) this.retry();
  }

  get isBlocked(): boolean {
    return this.blocked;
  }

  /** Nach einer Nutzergeste erneut versuchen (Autoplay-Sperre). */
  retry(): void {
    if (!this.running) return;
    const d = this.decks[this.active]!;
    d.audio.play().then(() => this.setBlocked(false)).catch(() => this.setBlocked(true));
  }

  /** Ausblenden und stoppen (Spielstart). */
  fadeOut(seconds: number = MUSIC_FADE.out): Promise<void> {
    if (!this.running) return Promise.resolve();
    for (const d of this.decks) { d.target = 0; d.seconds = seconds; }
    return new Promise((resolve) => {
      this.stopping = resolve;
      // Sicherheitsnetz, falls rAF gedrosselt ist (Hintergrund-Tab)
      setTimeout(() => this.stop(), seconds * 1000 + 400);
    });
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const d of this.decks) {
      d.audio.pause();
      d.env = 0;
      d.audio.volume = 0;
    }
    const s = this.stopping;
    this.stopping = null;
    s?.();
  }

  private play(d: Deck, index: number, fadeIn: number): void {
    const t = this.tracks[index];
    if (!t) return;
    d.track = index;
    d.audio.src = t.file;
    d.audio.currentTime = 0;
    d.env = 0;
    d.target = 1;
    d.seconds = fadeIn;
    this.onTrack?.(t);
    d.audio.play().then(() => this.setBlocked(false)).catch(() => this.setBlocked(true));
  }

  private next(): void {
    const cur = this.decks[this.active]!;
    const other = this.decks[1 - this.active]!;
    cur.target = 0;
    cur.seconds = MUSIC_FADE.cross;
    this.active = 1 - this.active;
    this.play(other, nextTrackIndex(cur.track, this.tracks.length), MUSIC_FADE.cross);
  }

  private setBlocked(b: boolean): void {
    if (b === this.blocked) return;
    this.blocked = b;
    this.onBlocked?.(b);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
    this.last = now;
    const cur = this.decks[this.active]!;
    // Kurz vor Titelende überblenden
    const dur = cur.audio.duration;
    if (Number.isFinite(dur) && dur > MUSIC_FADE.cross * 2 && cur.target > 0 && cur.audio.currentTime > dur - MUSIC_FADE.cross) this.next();
    let silent = true;
    for (const d of this.decks) {
      if (d.env !== d.target) {
        const step = dt / Math.max(0.01, d.seconds);
        d.env = d.target > d.env ? Math.min(d.target, d.env + step) : Math.max(d.target, d.env - step);
      }
      // Gleiche-Leistung-Kurve
      d.audio.volume = Math.min(1, Math.max(0, this.gain * Math.sin((d.env * Math.PI) / 2)));
      if (d.env === 0 && d.target === 0 && !d.audio.paused) d.audio.pause();
      if (d.env > 0 || d.target > 0) silent = false;
    }
    if (silent && this.stopping) this.stop();
  };

  private readonly onVisibility = (): void => {
    for (const d of this.decks) {
      if (document.hidden) d.audio.pause();
      else if (d.target > 0 || d.env > 0) d.audio.play().catch(() => undefined);
    }
  };
}
