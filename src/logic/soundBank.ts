/**
 * Sound-Katalog (pure Daten): welche Datei unter `assets/audio/` zu welchem
 * Spielereignis gehört, mit Grundlautstärke, Tonhöhen-Streuung, Hörweite und
 * Hall-Anteil. Die Dateien baut `scripts/audio/build_audio.py` (Quellen/Lizenzen:
 * `assets/audio/CREDITS.md`). Die Audio-Schicht (`src/audio/`) liest nur diese Tabelle.
 */
import type { AmbientSound, RoomKind, Surface } from './acoustics';
import { WEAPONS, type WeaponType } from './weapons';

export type AudioBus = 'effects' | 'ambience' | 'ui';

export type SampleDef = {
  /** Pfad relativ zu `assets/audio/` ohne Endung; bei `variants > 1` wird `_1`, `_2`, … angehängt. */
  path: string;
  variants: number;
  bus: AudioBus;
  /** Grundlautstärke (linear). */
  gain: number;
  /** Zufällige Abspielrate [min, max]. */
  pitch: readonly [number, number];
  /** Bis zu diesem Abstand (m) volle Lautstärke. */
  ref: number;
  /** Ab diesem Abstand (m) unhörbar. */
  maxDist: number;
  /** Hall-Anteil (0..1, skaliert mit dem Raum). */
  reverb: number;
  /** Endlosschleife (Ambience). */
  loop?: boolean;
  /** Höchstens so viele gleichzeitige Stimmen dieses Samples (älteste wird ersetzt). */
  maxVoices?: number;
  /** Erst bei Bedarf laden (Ambience); sonst beim Entsperren vorladen. */
  lazy?: boolean;
};

const P_NONE = [1, 1] as const;
const P_GUN = [0.96, 1.04] as const;
const P_SMALL = [0.92, 1.08] as const;
const P_WIDE = [0.85, 1.15] as const;

function fx(path: string, variants: number, gain: number, ref: number, maxDist: number, extra: Partial<SampleDef> = {}): SampleDef {
  return { path, variants, bus: 'effects', gain, pitch: P_SMALL, ref, maxDist, reverb: 0.6, ...extra };
}

function ui(path: string, gain: number, extra: Partial<SampleDef> = {}): SampleDef {
  return { path, variants: 1, bus: 'ui', gain, pitch: P_NONE, ref: 1, maxDist: 1, reverb: 0, ...extra };
}

function amb(path: string, gain: number, extra: Partial<SampleDef> = {}): SampleDef {
  return { path, variants: 1, bus: 'ambience', gain, pitch: P_NONE, ref: 1, maxDist: 1, reverb: 0.2, loop: true, lazy: true, ...extra };
}

/** Lautheit/Hörweite je Waffen-Schuss (CS: Schüsse sind sehr weit hörbar). */
type GunVoice = { gain: number; ref: number; maxDist: number };
const GUN_VOICE: Record<string, GunVoice> = {
  glock: { gain: 0.75, ref: 3, maxDist: 120 },
  usp: { gain: 0.8, ref: 3, maxDist: 120 },
  p228: { gain: 0.8, ref: 3, maxDist: 120 },
  deagle: { gain: 1.0, ref: 4, maxDist: 170 },
  elite: { gain: 0.75, ref: 3, maxDist: 120 },
  fiveseven: { gain: 0.7, ref: 3, maxDist: 115 },
  mp5: { gain: 0.75, ref: 3, maxDist: 130 },
  p90: { gain: 0.7, ref: 3, maxDist: 130 },
  mac10: { gain: 0.75, ref: 3, maxDist: 130 },
  ump45: { gain: 0.8, ref: 3, maxDist: 130 },
  m3: { gain: 1.0, ref: 4, maxDist: 160 },
  xm1014: { gain: 0.95, ref: 4, maxDist: 160 },
  ak47: { gain: 0.95, ref: 4, maxDist: 170 },
  m4a1: { gain: 0.9, ref: 4, maxDist: 160 },
  famas: { gain: 0.85, ref: 4, maxDist: 150 },
  galil: { gain: 0.9, ref: 4, maxDist: 155 },
  sg552: { gain: 0.9, ref: 4, maxDist: 160 },
  aug: { gain: 0.9, ref: 4, maxDist: 160 },
  awp: { gain: 1.0, ref: 6, maxDist: 260 },
  scout: { gain: 0.95, ref: 5, maxDist: 220 },
  g3sg1: { gain: 0.95, ref: 5, maxDist: 220 },
  sg550: { gain: 0.95, ref: 5, maxDist: 210 },
  m249: { gain: 0.95, ref: 4, maxDist: 170 },
};
/** Schalldämpfer: leise, kurze Hörweite (CS: kaum auf Distanz zu orten). */
const SILENCED_VOICE: GunVoice = { gain: 0.55, ref: 2, maxDist: 28 };

function gunSamples(): Record<string, SampleDef> {
  const out: Record<string, SampleDef> = {};
  for (const [id, v] of Object.entries(GUN_VOICE)) {
    out[`fire.${id}`] = fx(`weapons/${id}`, 2, v.gain, v.ref, v.maxDist, { pitch: P_GUN, reverb: 0.8, maxVoices: 4 });
  }
  for (const id of ['usp_sil', 'm4a1_sil', 'tmp']) {
    out[`fire.${id}`] = fx(`weapons/${id}`, 2, SILENCED_VOICE.gain, SILENCED_VOICE.ref, SILENCED_VOICE.maxDist, { pitch: P_GUN, reverb: 0.35, maxVoices: 4 });
  }
  // Fernklang-Ebenen je Klasse: hörbar ab mittlerer Distanz bis weit hinaus
  for (const cls of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) {
    const maxDist = cls === 'sniper' ? 280 : cls === 'pistol' || cls === 'smg' ? 150 : 200;
    out[`far.${cls}`] = fx(`weapons/far_${cls}`, 2, 0.9, 10, maxDist, { pitch: P_SMALL, reverb: 0.5, maxVoices: 4 });
  }
  return out;
}

export const SAMPLES: Record<string, SampleDef> = {
  ...gunSamples(),
  // Mechanik
  'dryfire': fx('weapons/dryfire', 1, 0.6, 1, 12, { reverb: 0.2 }),
  'draw.pistol': fx('weapons/draw_pistol', 1, 0.5, 1, 12, { reverb: 0.2 }),
  'draw.rifle': fx('weapons/draw_rifle', 1, 0.5, 1, 12, { reverb: 0.2 }),
  'draw.knife': fx('weapons/draw_knife', 1, 0.45, 1, 12, { reverb: 0.2 }),
  'draw.nade': fx('weapons/draw_nade', 1, 0.45, 1, 12, { reverb: 0.2 }),
  'reload.pistol': fx('weapons/reload_pistol', 1, 0.6, 1.5, 18, { pitch: P_NONE, reverb: 0.3 }),
  'reload.smg': fx('weapons/reload_smg', 1, 0.6, 1.5, 18, { pitch: P_NONE, reverb: 0.3 }),
  'reload.rifle': fx('weapons/reload_rifle', 1, 0.6, 1.5, 18, { pitch: P_NONE, reverb: 0.3 }),
  'reload.sniper': fx('weapons/reload_sniper', 1, 0.6, 1.5, 18, { pitch: P_NONE, reverb: 0.3 }),
  'reload.mg': fx('weapons/reload_mg', 1, 0.6, 1.5, 18, { pitch: P_NONE, reverb: 0.3 }),
  'reload.shell': fx('weapons/reload_shell', 1, 0.7, 1.5, 15, { reverb: 0.3, maxVoices: 2 }),
  'cycle.bolt': fx('weapons/bolt', 1, 0.6, 1.5, 18, { reverb: 0.3 }),
  'cycle.pump': fx('weapons/pump', 1, 0.7, 1.5, 22, { reverb: 0.3 }),
  'pickup': fx('weapons/pickup', 1, 0.55, 1, 10, { reverb: 0.2 }),
  // Messer
  'knife.slash': fx('weapons/knife_slash', 2, 0.55, 1.5, 15, { pitch: P_WIDE, reverb: 0.3 }),
  'knife.stab': fx('weapons/knife_stab', 1, 0.6, 1.5, 15, { pitch: P_SMALL, reverb: 0.3 }),
  'knife.hit': fx('weapons/knife_hit', 2, 0.8, 1.5, 20, { reverb: 0.3 }),
  'knife.wall': fx('weapons/knife_wall', 2, 0.6, 1.5, 20, { reverb: 0.4 }),
  // Granaten
  'nade.pin': fx('weapons/nade_pin', 1, 0.5, 1, 10, { reverb: 0.2 }),
  'nade.throw': fx('weapons/nade_throw', 1, 0.5, 1.5, 14, { reverb: 0.2 }),
  'nade.bounce': fx('weapons/nade_bounce', 3, 0.55, 2, 30, { pitch: P_WIDE, reverb: 0.5, maxVoices: 4 }),
  'he.near': fx('weapons/he_near', 2, 1.0, 6, 120, { reverb: 1, pitch: P_SMALL }),
  'he.far': fx('weapons/he_far', 2, 1.0, 20, 260, { reverb: 0.6 }),
  'flash.bang': fx('weapons/flash_bang', 1, 0.9, 5, 120, { reverb: 0.9 }),
  'smoke.hiss': fx('weapons/smoke_hiss', 1, 0.6, 3, 45, { reverb: 0.5, pitch: P_SMALL }),
  'ear.ring': ui('weapons/ear_ring', 0.6),
  // C4
  'c4.press': fx('weapons/c4_press', 3, 0.35, 1.5, 18, { pitch: P_NONE, reverb: 0.2 }),
  'c4.beep': fx('weapons/c4_beep', 1, 0.5, 4, 70, { pitch: P_NONE, reverb: 0.4, maxVoices: 2 }),
  'c4.planted': fx('weapons/c4_planted', 1, 0.6, 3, 40, { pitch: P_NONE, reverb: 0.3 }),
  'c4.defuse': fx('weapons/c4_defuse', 1, 0.6, 2, 25, { pitch: P_NONE, reverb: 0.3 }),
  'c4.defused': fx('weapons/c4_defused', 1, 0.6, 2, 30, { pitch: P_NONE, reverb: 0.3 }),
  'c4.explode': fx('weapons/c4_explode', 1, 1.0, 12, 400, { pitch: P_NONE, reverb: 1 }),
  'c4.explode.far': fx('weapons/c4_explode_far', 1, 1.0, 30, 500, { pitch: P_NONE, reverb: 0.6 }),
  // Treffer / Querschläger / Vorbeiflug / Hülsen
  'impact.concrete': fx('impacts/imp_concrete', 3, 0.5, 2, 35, { pitch: P_WIDE, reverb: 0.5, maxVoices: 6 }),
  'impact.metal': fx('impacts/imp_metal', 3, 0.45, 2, 40, { pitch: P_WIDE, reverb: 0.5, maxVoices: 6 }),
  'impact.wood': fx('impacts/imp_wood', 2, 0.5, 2, 35, { pitch: P_WIDE, reverb: 0.5, maxVoices: 6 }),
  'impact.flesh': fx('impacts/imp_flesh', 2, 0.6, 2, 30, { pitch: P_SMALL, reverb: 0.3, maxVoices: 4 }),
  'ricochet': fx('impacts/ricochet', 3, 0.45, 3, 45, { pitch: P_WIDE, reverb: 0.5, maxVoices: 3 }),
  'flyby': fx('impacts/flyby', 3, 0.55, 3, 10, { pitch: P_WIDE, reverb: 0.1, maxVoices: 3 }),
  'headshot': ui('impacts/headshot', 0.5),
  'shell': fx('impacts/shell', 6, 0.35, 1, 12, { pitch: P_WIDE, reverb: 0.2, maxVoices: 5 }),
  'shell.shotgun': fx('impacts/shell_shotgun', 2, 0.4, 1, 12, { pitch: P_WIDE, reverb: 0.2, maxVoices: 3 }),
  // Spieler
  'step.concrete': fx('player/step_concrete', 4, 0.55, 2, 30, { pitch: P_SMALL, reverb: 0.35, maxVoices: 8 }),
  'step.metal': fx('player/step_metal', 4, 0.55, 2, 36, { pitch: P_SMALL, reverb: 0.4, maxVoices: 8 }),
  'step.grate': fx('player/step_grate', 4, 0.55, 2, 36, { pitch: P_SMALL, reverb: 0.4, maxVoices: 8 }),
  'step.wood': fx('player/step_wood', 4, 0.6, 2, 28, { pitch: P_SMALL, reverb: 0.35, maxVoices: 8 }),
  'step.gravel': fx('player/step_gravel', 4, 0.5, 2, 28, { pitch: P_SMALL, reverb: 0.25, maxVoices: 8 }),
  'step.tile': fx('player/step_tile', 4, 0.55, 2, 30, { pitch: P_SMALL, reverb: 0.4, maxVoices: 8 }),
  'land': fx('player/land', 1, 0.6, 2, 30, { pitch: P_SMALL, reverb: 0.3 }),
  'pain': fx('player/pain', 6, 0.6, 2, 30, { pitch: P_SMALL, reverb: 0.3, maxVoices: 3 }),
  'death': fx('player/death', 5, 0.7, 2, 40, { pitch: P_SMALL, reverb: 0.4, maxVoices: 3 }),
  // Oberfläche / Rückmeldungen
  'ui.click': ui('ui/click', 0.4),
  'ui.back': ui('ui/back', 0.4),
  'ui.change': ui('ui/change', 0.35),
  'ui.chat': ui('ui/chat', 0.35),
  'ui.buy': ui('ui/buy', 0.55),
  'ui.hitmarker': ui('ui/hitmarker', 0.35),
  'ui.kill': ui('ui/kill', 0.35),
  'ui.radio': ui('ui/radio', 0.45),
  'ui.roundStart': ui('ui/round_start', 0.35),
  'ui.win': ui('ui/round_win', 0.3),
  'ui.lose': ui('ui/round_lose', 0.3),
  // Ambience-Schleifen
  'amb.hallHum': amb('ambience/hallhum', 0.5),
  'amb.ventilation': amb('ambience/ventilation', 0.45),
  'amb.machine': amb('ambience/machine', 0.5),
  'amb.conveyor': amb('ambience/conveyor', 0.45),
  'amb.forklift': amb('ambience/forklift', 0.5),
  'amb.compressor': amb('ambience/compressor', 0.5),
  'amb.buzz': amb('ambience/buzz', 0.35),
  'amb.drip': amb('ambience/drip', 0.5),
  'amb.radio': amb('ambience/radio', 0.35),
  'amb.alarmFar': amb('ambience/alarmfar', 0.3),
  'amb.wind': amb('ambience/wind', 0.5),
  'amb.birds': amb('ambience/birds', 0.4),
  'amb.traffic': amb('ambience/traffic', 0.45),
  'amb.rain': amb('ambience/rain', 0.5),
  'amb.tunnel': amb('ambience/tunnel', 0.5),
  'amb.cold': amb('ambience/cold', 0.45),
  // Lebendige Einzelereignisse (weit entfernt, positioniert)
  'life.reverse': fx('ambience/life_reverse', 1, 0.3, 8, 90, { lazy: true, reverb: 0.8, pitch: P_NONE }),
  'life.clank': fx('ambience/life_clank', 2, 0.35, 6, 80, { lazy: true, reverb: 0.9, pitch: P_WIDE }),
  'life.pallet': fx('ambience/life_pallet', 1, 0.4, 6, 80, { lazy: true, reverb: 0.9, pitch: P_WIDE }),
  'life.chime': fx('ambience/life_chime', 1, 0.25, 10, 200, { lazy: true, reverb: 1, pitch: P_NONE }),
  'life.pigeons': fx('ambience/life_pigeons', 1, 0.35, 4, 50, { lazy: true, reverb: 0.6, pitch: P_SMALL }),
  'life.horn': fx('ambience/life_horn', 1, 0.3, 10, 220, { lazy: true, reverb: 0.5, pitch: P_SMALL }),
  'life.door': fx('ambience/life_door', 1, 0.35, 5, 70, { lazy: true, reverb: 0.8, pitch: P_SMALL }),
};

/** Alle Dateien (ohne Endung) eines Samples. */
export function sampleFiles(def: SampleDef): string[] {
  if (def.variants <= 1) return [def.path];
  return Array.from({ length: def.variants }, (_, i) => `${def.path}_${i + 1}`);
}

// ----------------------------------------------------------------------------- Waffen

export type ShellKind = 'shell' | 'shell.shotgun';

/** Klänge einer Waffe (Schlüssel in SAMPLES). */
export type WeaponSounds = {
  fire: string;
  /** Fernklang-Ebene (Überblendung mit Abstand), fehlt bei Schalldämpfer/Nahkampf. */
  far: string | null;
  draw: string;
  reload: string | null;
  /** Schrot: Patronen einzeln laden. */
  shellReload: boolean;
  /** Repetieren nach dem Schuss (AWP/Scout: Kammerstängel, M3: Pumpe). */
  cycle: string | null;
  /** Hülse, die nach dem Schuss auf den Boden fällt. */
  shell: ShellKind | null;
  /** Schuss ist schallgedämpft (kürzere Hörweite, kein Fernklang). */
  silenced: boolean;
};

const TYPE_FAR: Partial<Record<WeaponType, string>> = {
  pistol: 'far.pistol', smg: 'far.smg', rifle: 'far.rifle', mg: 'far.rifle', shotgun: 'far.shotgun', sniper: 'far.sniper',
};
const TYPE_RELOAD: Partial<Record<WeaponType, string>> = {
  pistol: 'reload.pistol', smg: 'reload.smg', rifle: 'reload.rifle', sniper: 'reload.sniper', mg: 'reload.mg', shotgun: 'reload.shell',
};

/** Standard-Schalldämpfer (CS-Gewohnheit: USP meist gedämpft, TMP immer). */
export const DEFAULT_SILENCED: Readonly<Record<string, boolean>> = { usp: true, tmp: true, m4a1: false };

/**
 * Klang-Satz einer Waffe. `silenced` überschreibt den Standard (USP/M4A1 mit/ohne
 * Schalldämpfer); TMP ist immer gedämpft. Unbekannte Waffen → null.
 */
export function weaponSounds(id: string, silenced?: boolean): WeaponSounds | null {
  const def = WEAPONS[id];
  if (!def) return null;
  const type = def.type;
  if (def.mode === 'melee') {
    return { fire: id === 'knife_stab' ? 'knife.stab' : 'knife.slash', far: null, draw: 'draw.knife', reload: null, shellReload: false, cycle: null, shell: null, silenced: false };
  }
  if (def.mode === 'throw') return { fire: 'nade.throw', far: null, draw: 'draw.nade', reload: null, shellReload: false, cycle: null, shell: null, silenced: false };
  if (def.mode === 'plant') return { fire: 'c4.press', far: null, draw: 'draw.pistol', reload: null, shellReload: false, cycle: null, shell: null, silenced: false };
  const canSilence = id === 'usp' || id === 'm4a1';
  const sil = id === 'tmp' || (canSilence && (silenced ?? DEFAULT_SILENCED[id] ?? false));
  const fire = sil ? (id === 'tmp' ? 'fire.tmp' : `fire.${id}_sil`) : SAMPLES[`fire.${id}`] ? `fire.${id}` : fallbackFire(type);
  const boltAction = type === 'sniper' && def.rpm === 0;
  const pump = type === 'shotgun' && def.rpm > 0 && def.rpm < 120;
  return {
    fire,
    far: sil ? null : TYPE_FAR[type] ?? null,
    draw: type === 'pistol' ? 'draw.pistol' : 'draw.rifle',
    reload: TYPE_RELOAD[type] ?? 'reload.rifle',
    shellReload: type === 'shotgun',
    cycle: boltAction ? 'cycle.bolt' : pump ? 'cycle.pump' : null,
    shell: type === 'shotgun' ? 'shell.shotgun' : 'shell',
    silenced: sil,
  };
}

function fallbackFire(type: WeaponType): string {
  switch (type) {
    case 'pistol': return 'fire.glock';
    case 'smg': return 'fire.mp5';
    case 'shotgun': return 'fire.m3';
    case 'sniper': return 'fire.scout';
    case 'mg': return 'fire.m249';
    default: return 'fire.m4a1';
  }
}

// ----------------------------------------------------------------------------- Oberflächen & Ambience

export const STEP_SAMPLE: Readonly<Record<Surface, string>> = {
  concrete: 'step.concrete', metal: 'step.metal', grate: 'step.grate', wood: 'step.wood', gravel: 'step.gravel', tile: 'step.tile',
};

/** Einschlags-Material je Oberfläche (Schüsse auf Wände/Regale). */
export type ImpactMaterial = 'concrete' | 'metal' | 'wood' | 'flesh';
export const SURFACE_IMPACT: Readonly<Record<Surface, ImpactMaterial>> = {
  concrete: 'concrete', metal: 'metal', grate: 'metal', wood: 'wood', gravel: 'concrete', tile: 'concrete',
};

export const AMBIENT_SAMPLE: Readonly<Record<AmbientSound, string>> = {
  hallHum: 'amb.hallHum', ventilation: 'amb.ventilation', machine: 'amb.machine', conveyor: 'amb.conveyor', forklift: 'amb.forklift',
  compressor: 'amb.compressor', buzz: 'amb.buzz', drip: 'amb.drip', radio: 'amb.radio', alarmFar: 'amb.alarmFar', wind: 'amb.wind',
  birds: 'amb.birds', traffic: 'amb.traffic', rain: 'amb.rain',
};

/** Grundteppich je Raumcharakter (nicht positioniert, überblendet beim Raumwechsel). */
export const ROOM_BED: Readonly<Record<RoomKind, readonly { key: string; gain: number }[]>> = {
  outdoor: [{ key: 'amb.wind', gain: 0.5 }, { key: 'amb.traffic', gain: 0.45 }, { key: 'amb.birds', gain: 0.35 }],
  hall: [{ key: 'amb.hallHum', gain: 0.45 }, { key: 'amb.ventilation', gain: 0.25 }],
  room: [{ key: 'amb.hallHum', gain: 0.2 }, { key: 'amb.ventilation', gain: 0.15 }],
  tunnel: [{ key: 'amb.tunnel', gain: 0.45 }, { key: 'amb.drip', gain: 0.2 }],
  cold: [{ key: 'amb.cold', gain: 0.5 }, { key: 'amb.ventilation', gain: 0.2 }],
};

/** Zufällige „Leben“-Ereignisse je Raum (Gewichtung, Abstand zum Hörer in m). */
export type LifeEvent = { key: string; rooms: readonly RoomKind[]; weight: number; minDist: number; maxDist: number };
export const LIFE_EVENTS: readonly LifeEvent[] = [
  { key: 'life.reverse', rooms: ['hall', 'outdoor', 'cold'], weight: 3, minDist: 25, maxDist: 70 },
  { key: 'life.clank', rooms: ['hall', 'room', 'tunnel', 'cold'], weight: 4, minDist: 15, maxDist: 60 },
  { key: 'life.pallet', rooms: ['hall', 'outdoor'], weight: 2, minDist: 20, maxDist: 60 },
  { key: 'life.chime', rooms: ['hall', 'room', 'cold'], weight: 1, minDist: 30, maxDist: 80 },
  { key: 'life.pigeons', rooms: ['hall', 'outdoor'], weight: 2, minDist: 10, maxDist: 35 },
  { key: 'life.horn', rooms: ['outdoor'], weight: 2, minDist: 60, maxDist: 150 },
  { key: 'life.door', rooms: ['hall', 'room', 'tunnel'], weight: 2, minDist: 15, maxDist: 50 },
];

/** Wählt gewichtet ein Ereignis, das im Raum vorkommt (null, wenn keins passt). */
export function pickLifeEvent(room: RoomKind, rnd: () => number): LifeEvent | null {
  const pool = LIFE_EVENTS.filter((e) => e.rooms.includes(room));
  const total = pool.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;
  let r = rnd() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) return e;
  }
  return pool[pool.length - 1]!;
}

/** Pause bis zum nächsten Leben-Ereignis (s): draußen/Halle belebter, Kühlraum ruhig. */
export function nextLifeDelay(room: RoomKind, rnd: () => number): number {
  const base: Record<RoomKind, [number, number]> = { outdoor: [7, 18], hall: [6, 16], room: [14, 30], tunnel: [12, 26], cold: [14, 30] };
  const [a, b] = base[room];
  return a + (b - a) * rnd();
}
