import type { RecoilSpec } from './recoil';
import { aimRotation } from './viewPlace';
import { VIEW_SCALE } from './viewAnim';
import { weaponGeom } from './weaponGeom';
import rawWeapons from './weapons.json';

export type { RecoilSpec };

/** Waffen-Typen (Gameplay-Gruppen; CS-1.6-Kategorien + Granaten/Bombe). */
export type WeaponType = 'knife' | 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'mg' | 'grenade' | 'bomb';

/** Inventar-Slots wie in CS: 1 Primär, 2 Pistole, 3 Messer, 4 Granaten, 5 C4. */
export type WeaponSlot = 1 | 2 | 3 | 4 | 5;

/** Team-Beschränkung beim Kauf. */
export type WeaponTeam = 'T' | 'CT' | 'both';

/** Granaten-Art. */
export type GrenadeKind = 'he' | 'flash' | 'smoke';

type V3 = { x: number; y: number; z: number };

/** Modell-/Anzeige-Metadaten einer Waffe (prozedurale Modelle: src/weapons/models/). */
export type WeaponVisual = {
  /** Modell-Id im prozeduralen Katalog (Standard: eigene Waffen-Id). */
  model: string;
  /** Kameraraum-Position (m) des Griffpunkts der rechten Hand (unten rechts vor der Kamera). */
  pos: V3;
  /** Grund-Drehung (rad) der Waffe im Kameraraum (rx hebt, ry schwenkt die Mündung nach links);
   *  bei Schusswaffen aus pos und Mündung berechnet, sodass die Laufachse aufs Fadenkreuz zeigt (viewPlace.ts). */
  rot: V3;
};

/** Schadens-/Feuer-Parameter einer Waffe. Werte CS-angelehnt, im JSON justierbar. */
export type WeaponDef = {
  id: string;
  name: string;
  type: WeaponType;
  slot: WeaponSlot;
  /** Kaufpreis in $ (0 = nicht kaufbar: Messer, C4). */
  price: number;
  team: WeaponTeam;
  /** Schaden pro Körpertreffer (bei Granaten: Maximalschaden im Zentrum). */
  damage: number;
  /** Kopfschuss-Multiplikator (CS: ~4). */
  headFactor: number;
  /** Schüsse pro Minute (auto). Bei 0 = semi-automatisch (ein Schuss pro Klick). */
  rpm: number;
  /** Magazingröße. Infinity = unbegrenzt (Messer). */
  magSize: number;
  /** Reserve-Munition (max). */
  reserve: number;
  /** Nachladezeit in Sekunden. */
  reloadTime: number;
  /** Basis-Streuung in Radiant (beim Zielen aus dem Stand). */
  spreadBase: number;
  /** Streuungs-Zuwachs pro abgegebenem Schuss (Radiant). */
  spreadPerShot: number;
  /** Extra-Streuung bei Bewegung (Radiant). */
  moveSpread: number;
  /** Max. effektive Reichweite in Metern (Granaten: Wurfweite-Referenz). */
  range: number;
  /** 'hit' (Hitscan), 'melee' (Nahkampf), 'throw' (Granate), 'plant' (Bombe). */
  mode: 'hit' | 'melee' | 'throw' | 'plant';
  /** Anteil des Schadens, der Kevlar durchdringt (CS: 0.47 Glock … 0.975 AWP). */
  armorPen: number;
  /** Projektile je Schuss (Schrot: 6–9, sonst 1). */
  pellets: number;
  /** Granaten-Art (nur type 'grenade'). */
  grenadeKind?: GrenadeKind;
  /** Mindestabstand (s) zwischen Schüssen bei Semi-Waffen (Repetierer, Pistolen-Abzug, Messer). */
  cycle?: number;
  /** Zoom-Stufen als Ziel-FOV in Grad (Rechtsklick schaltet durch, leer = kein Zielfernrohr). */
  zoom?: number[];
  /** Dynamischer Rückstoß (Kamera + Viewmodel). */
  recoil: RecoilSpec;
  /** Sichtbares Modell + Viewmodel-Offset. */
  visual: WeaponVisual;
};

/** JSON-Zwischenform: null = unbegrenzt (Messer-Magazin), visual darf partiell sein. */
type RawWeapon = Omit<WeaponDef, 'magSize' | 'reserve' | 'visual' | 'pellets'> & {
  magSize: number | null;
  reserve: number | null;
  pellets?: number;
  visual?: Partial<WeaponVisual>;
};

/**
 * Viewmodel-Haltung je Waffentyp (im JSON pro Waffe überschreibbar: visual.pos / visual.rot).
 * `aim`: Drehung x/y wird aus Position und Mündung berechnet (Laufachse → Fadenkreuz), `rot.z` = Rollwinkel.
 * Ohne `aim` (Messer, Granaten, C4) gilt `rot` wie angegeben.
 */
export const TYPE_VISUAL: Record<WeaponType, Omit<WeaponVisual, 'model'> & { aim: boolean }> = {
  knife: { pos: { x: 0.11, y: -0.115, z: -0.21 }, rot: { x: 0.12, y: 0.3, z: 0.2 }, aim: false },
  pistol: { pos: { x: 0.115, y: -0.115, z: -0.3 }, rot: { x: 0, y: 0, z: 0 }, aim: true },
  smg: { pos: { x: 0.14, y: -0.125, z: -0.27 }, rot: { x: 0, y: 0, z: -0.03 }, aim: true },
  rifle: { pos: { x: 0.14, y: -0.125, z: -0.27 }, rot: { x: 0, y: 0, z: -0.03 }, aim: true },
  sniper: { pos: { x: 0.145, y: -0.13, z: -0.27 }, rot: { x: 0, y: 0, z: -0.03 }, aim: true },
  shotgun: { pos: { x: 0.14, y: -0.125, z: -0.27 }, rot: { x: 0, y: 0, z: -0.03 }, aim: true },
  mg: { pos: { x: 0.15, y: -0.135, z: -0.27 }, rot: { x: 0, y: 0, z: -0.03 }, aim: true },
  grenade: { pos: { x: 0.1, y: -0.115, z: -0.23 }, rot: { x: 0.1, y: 0.2, z: 0.1 }, aim: false },
  bomb: { pos: { x: 0.06, y: -0.12, z: -0.24 }, rot: { x: 0.35, y: 0.15, z: 0 }, aim: false },
};

function normalize(raw: Record<string, RawWeapon>): Record<string, WeaponDef> {
  const out: Record<string, WeaponDef> = {};
  for (const [id, w] of Object.entries(raw)) {
    const base = TYPE_VISUAL[w.type];
    const model = w.visual?.model ?? id;
    const pos = w.visual?.pos ?? base.pos;
    const geom = weaponGeom(model);
    const rot = w.visual?.rot ?? (base.aim && geom ? aimRotation(pos, VIEW_SCALE, geom, base.rot.z) : base.rot);
    out[id] = {
      ...w,
      id,
      magSize: w.magSize ?? Infinity,
      reserve: w.reserve ?? Infinity,
      pellets: w.pellets ?? 1,
      visual: {
        model,
        pos,
        rot,
      },
    };
  }
  return out;
}

/** Waffen-Tabelle aus src/logic/weapons.json (einzige Datenquelle für Balance). */
export const WEAPONS: Record<string, WeaponDef> = normalize(rawWeapons as unknown as Record<string, RawWeapon>);

/** Ausrüstung (kein Waffen-Slot): Kevlar, Helm, Defuse-Kit. */
export const EQUIPMENT = {
  kevlar: { id: 'kevlar', name: 'Kevlar-Weste', price: 650, team: 'both' as WeaponTeam },
  helmet: { id: 'helmet', name: 'Kevlar + Helm', price: 1000, team: 'both' as WeaponTeam },
  defusekit: { id: 'defusekit', name: 'Entschärfungs-Kit', price: 200, team: 'CT' as WeaponTeam },
} as const;
export type EquipmentId = keyof typeof EQUIPMENT;

/** Kaufmenü-Kategorien (CS-Reihenfolge: Taste 1–8). */
export type BuyCategory = 'pistol' | 'shotgun' | 'smg' | 'rifle' | 'mg' | 'equipment';
export const BUY_CATEGORIES: { key: number; id: BuyCategory; name: string }[] = [
  { key: 1, id: 'pistol', name: 'Pistolen' },
  { key: 2, id: 'shotgun', name: 'Schrotflinten' },
  { key: 3, id: 'smg', name: 'Maschinenpistolen' },
  { key: 4, id: 'rifle', name: 'Gewehre' },
  { key: 5, id: 'mg', name: 'Maschinengewehre' },
  { key: 6, id: 'equipment', name: 'Ausrüstung' },
];

/** Darf das Team die Waffe kaufen? */
export function teamCanUse(def: { team: WeaponTeam }, team: 'T' | 'CT'): boolean {
  return def.team === 'both' || def.team === team;
}

/** Kaufbare Waffen einer Kategorie (Sniper zählen zu den Gewehren) für ein Team, nach Preis. */
export function weaponsInCategory(cat: BuyCategory, team: 'T' | 'CT'): WeaponDef[] {
  const types: WeaponType[] = cat === 'rifle' ? ['rifle', 'sniper'] : cat === 'equipment' ? ['grenade'] : [cat];
  return Object.values(WEAPONS)
    .filter((w) => types.includes(w.type) && w.price > 0 && teamCanUse(w, team))
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

/** Schaden an Kopf/Körper (ohne Rüstung). */
export function hitDamage(def: WeaponDef, part: 'head' | 'body'): number {
  return Math.round(def.damage * (part === 'head' ? def.headFactor : 1));
}

/** Sekunden zwischen zwei Schüssen (auto); bei semi 0 → manuell pro Klick. */
export function shotInterval(def: WeaponDef): number {
  if (def.rpm <= 0) return def.cycle ?? 0;
  return 60 / def.rpm;
}

/** Aktuelle Streuung (Radiant) aus Basis + Schüssen + Bewegung. */
export function currentSpread(def: WeaponDef, shotsFired: number, moving: boolean): number {
  const base = def.spreadBase + shotsFired * def.spreadPerShot;
  return base + (moving ? def.moveSpread : 0);
}

/** Nachlade-Dauer: bei leerem Magazin ggf. leicht länger (CS-Feeling). */
export function reloadDuration(def: WeaponDef, magEmpty: boolean): number {
  return def.reloadTime + (magEmpty ? 0.35 : 0);
}

/** Maximale Kugeln, die nachgeladen werden (Magazin bis voll). */
export function reloadAmount(def: WeaponDef, magNow: number, reserveNow: number): number {
  const need = def.magSize - magNow;
  return Math.min(need, reserveNow);
}

/** Nächste Zoom-Stufe (0 = ungezoomt, 1..n = zoom[i-1]); wechselt zyklisch. */
export function nextZoomLevel(def: WeaponDef, level: number): number {
  const n = def.zoom?.length ?? 0;
  if (n === 0) return 0;
  return (Math.max(0, level) + 1) % (n + 1);
}

/** Ziel-FOV für eine Zoom-Stufe (base = normales FOV). */
export function zoomFov(def: WeaponDef, level: number, base: number): number {
  if (!def.zoom || level <= 0) return base;
  return def.zoom[Math.min(level, def.zoom.length) - 1] ?? base;
}

/** Schussdistanz-Abfall (CS: Schaden sinkt mit der Entfernung; Sniper kaum). */
export function rangeFalloff(def: WeaponDef, dist: number): number {
  if (def.type === 'sniper' || def.mode !== 'hit') return 1;
  const d = Math.max(0, dist);
  // ~0.96 je 10 m (Pistolen/SMG), Gewehre ~0.98 je 10 m, Schrot fällt stark ab
  const per10 = def.type === 'shotgun' ? 0.7 : def.type === 'rifle' || def.type === 'mg' ? 0.98 : 0.96;
  return Math.pow(per10, d / 10);
}
