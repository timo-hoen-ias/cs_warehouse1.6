/**
 * Menümusik (framework-frei): Titelliste mit Lizenzangaben, Wiedergabe-Reihenfolge,
 * effektive Lautstärke aus den Einstellungen und Überblend-Kurven. Die Dateien
 * liegen unter assets/audio/music/ (Lizenz/Quelle: assets/audio/music/CREDITS.md).
 */

export type MusicTrack = {
  id: string;
  /** Pfad relativ zur Seite (Needle kopiert assets/ → dist/assets/). */
  file: string;
  title: string;
  author: string;
  license: string;
  source: string;
};

const RE_SOURCE = 'https://github.com/redeclipse/sounds/tree/master/music';

export const MENU_TRACKS: MusicTrack[] = [
  { id: 'jojo_03', file: 'assets/audio/music/jojo_track_03.ogg', title: 'Track 03', author: 'Derek „JoJo“ Stegall', license: 'CC BY-SA', source: RE_SOURCE },
  { id: 'jojo_08', file: 'assets/audio/music/jojo_track_08.ogg', title: 'Track 08', author: 'Derek „JoJo“ Stegall', license: 'CC BY-SA', source: RE_SOURCE },
  { id: 'jojo_02', file: 'assets/audio/music/jojo_track_02.ogg', title: 'Track 02', author: 'Derek „JoJo“ Stegall', license: 'CC BY-SA', source: RE_SOURCE },
];

export const MUSIC_FADE = {
  /** Einblenden beim Start (s). */
  in: 3,
  /** Ausblenden beim Spielstart (s). */
  out: 1.6,
  /** Überblenden zum nächsten Titel vor dessen Ende (s). */
  cross: 4,
} as const;

/** Nächster Titel: zufällig, aber nie derselbe zweimal hintereinander (bei ≥ 2 Titeln). */
export function nextTrackIndex(current: number, count: number, rnd: () => number = Math.random): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (current < 0 || current >= count) return Math.min(count - 1, Math.floor(rnd() * count));
  const step = 1 + Math.min(count - 2, Math.floor(rnd() * (count - 1)));
  return (current + step) % count;
}

/** Effektive Musiklautstärke 0..1 (Gesamt × Musik, stumm = 0). */
export function musicGain(s: { volume: number; musicVolume: number; musicMuted: boolean }): number {
  if (s.musicMuted) return 0;
  const v = (Number.isFinite(s.volume) ? s.volume : 0) * (Number.isFinite(s.musicVolume) ? s.musicVolume : 0);
  return Math.min(1, Math.max(0, v));
}

/**
 * Blendkurve (gleiche Leistung): Faktor 0..1 nach `t` von `duration` Sekunden.
 * `dir` 'in' steigt, 'out' fällt. Dauer ≤ 0 → sofort Endwert.
 */
export function fadeFactor(t: number, duration: number, dir: 'in' | 'out'): number {
  const x = duration <= 0 ? 1 : Math.min(1, Math.max(0, t / duration));
  const v = Math.sin((x * Math.PI) / 2);
  return dir === 'in' ? v : Math.cos((x * Math.PI) / 2);
}
