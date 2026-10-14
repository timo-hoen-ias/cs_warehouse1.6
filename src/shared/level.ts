import type { LagerDaten } from './types';

/** Position in Weltmetern (Fußpunkt, y=0 = Boden). */
export type Vec3 = [number, number, number];

/**
 * Gameplay-Zonen einer Karte (de_-Modus). Werte in Weltmetern.
 * Werden beim Bake automatisch platziert und später per Map-Editor nachjustiert.
 */
export type LevelZones = {
  /** Terroristen-Spawn (Startposition). */
  t: Vec3;
  /** Counter-Terroristen-Spawn (Startposition). */
  ct: Vec3;
  /** Bomben-Spot A. */
  a: Vec3;
  /** Bomben-Spot B. */
  b: Vec3;
};

/** Lager-Requisite als Deckung (Palettenstapel, Gitterbox, Kiste, Container). */
export type PropKind = 'pallet' | 'cage' | 'crate' | 'container';

export type Prop = {
  kind: PropKind;
  /** Fußpunkt (Mitte), Weltmeter. */
  pos: Vec3;
  /** Außenmaße (Breite x, Höhe y, Tiefe z) in Metern. */
  size: Vec3;
  /** Drehung um Y in Vierteldrehungen (0..3) — Boxen bleiben achsenparallel. */
  rot: 0 | 1 | 2 | 3;
};

/** Karten-Metadaten (Anzeige in Lobby/Scoreboard). */
export type LevelMeta = {
  id: string;
  name: string;
  description: string;
};

/**
 * Committetes Kartenformat (Bake-Ausgabe, z. B. levels/de_xxx.json).
 * format 1: LagerDaten werden unverändert gespeichert; Layout/Kollision/Geometrie
 * werden zur Laufzeit über dieselbe pure Logik (layout.ts/transform.ts) abgeleitet —
 * keine duplizierte Mathe in Bake und Client.
 * format 2: zusätzlich Requisiten (Deckung), Spawnpunkte je Team und Metadaten.
 */
export type LevelFile = {
  format: 1 | 2;
  name: string;
  lager: LagerDaten;
  zones: LevelZones;
  /** format ≥ 2 */
  meta?: LevelMeta;
  props?: Prop[];
  spawns?: { t: Vec3[]; ct: Vec3[] };
};

/** Rechteck in der XZ-Ebene (Weltmeter). */
export type Bounds2D = { minX: number; maxX: number; minZ: number; maxZ: number };
