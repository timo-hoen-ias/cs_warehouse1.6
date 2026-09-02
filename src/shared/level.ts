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

/**
 * Committetes Kartenformat (Bake-Ausgabe, z. B. levels/de-xxxx.json).
 * format 1: LagerDaten werden unverändert gespeichert; Layout/Kollision/Geometrie
 * werden zur Laufzeit über dieselbe pure Logik (layout.ts/transform.ts) abgeleitet —
 * keine duplizierte Mathe in Bake und Client.
 */
export type LevelFile = {
  format: 1;
  name: string;
  lager: LagerDaten;
  zones: LevelZones;
};

/** Rechteck in der XZ-Ebene (Weltmeter). */
export type Bounds2D = { minX: number; maxX: number; minZ: number; maxZ: number };
