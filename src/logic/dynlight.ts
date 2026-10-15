/**
 * Dynamische Kurzzeit-Lichter (Mündungsfeuer, Explosionen, Blendgranaten, C4) für die vorgebackene,
 * unbeleuchtete Levelgeometrie. Reine Logik: ein kleiner Pool mit Lebensdauer-Kurven und die Auswahl
 * der wichtigsten Lichter nach Entfernung zur Kamera. Das Shader-Gegenstück liegt in
 * `src/level/DynamicLights.ts` (ein Uniform-Array, keine Schatten).
 */

export type Vec3 = { x: number; y: number; z: number };
export type Rgb = readonly [number, number, number];

/** Verlaufsform: `flash` = sofort hell, schnell weg; `blast` = kurzer Anstieg, längeres Ausklingen. */
export type LightShape = 'flash' | 'blast';

export type LightSpec = {
  pos: Vec3;
  color: Rgb;
  /** Reichweite in Metern (Licht fällt quadratisch bis dahin auf 0). */
  radius: number;
  /** Spitzenhelligkeit (Faktor auf die Oberflächenfarbe; ≈ 4–6 für sichtbares Aufhellen dunkler Hallen). */
  intensity: number;
  /** Lebensdauer in Sekunden. */
  duration: number;
  shape?: LightShape;
};

export type DynLight = LightSpec & {
  shape: LightShape;
  /** Alter in Sekunden. */
  age: number;
  /** Mindestens einen Frame lang in voller Helligkeit sichtbar (auch bei sehr niedriger Bildrate). */
  shown: boolean;
};

export type LightPool = { lights: DynLight[]; capacity: number };

/** Anzahl gleichzeitig ans Shader-Array übergebener Lichter je Grafikstufe (niedrig: 2, hoch: 6). */
export const DYN_LIGHT_MAX = { high: 6, low: 2 } as const;
/** Größe des Pools (alle lebenden Lichter; ausgewählt wird nach Wichtigkeit). */
export const POOL_CAPACITY = 16;
/** Weiter als das von der Kamera entfernte Lichter zählen nicht (Nebel, Hörweite des Auges). */
export const VISIBLE_RANGE = 70;

export function createPool(capacity = POOL_CAPACITY): LightPool {
  return { lights: [], capacity };
}

/** Helligkeitsfaktor (0..1) zur aktuellen Lebenszeit. */
export function envelope(l: Pick<DynLight, 'age' | 'duration' | 'shape'>): number {
  const t = l.duration > 0 ? l.age / l.duration : 1;
  if (t >= 1) return 0;
  if (l.shape === 'blast') {
    const rise = 0.08;
    return t < rise ? 0.4 + 0.6 * (t / rise) : Math.pow((1 - t) / (1 - rise), 1.6);
  }
  const k = 1 - Math.max(0, t);
  return k * k;
}

/** Aktuelle Helligkeit (Spitze × Verlauf). */
export function currentIntensity(l: DynLight): number {
  return l.intensity * envelope(l);
}

/**
 * Wichtigkeit eines Lichts für den Betrachter bei `cam`: hell, nah (oder mit großer Reichweite) zählt.
 * Außerhalb der Sichtweite 0. Wird zum Auswählen und zum Verdrängen im vollen Pool benutzt.
 */
export function lightScore(l: DynLight, cam: Vec3): number {
  const e = currentIntensity(l);
  if (e <= 0) return 0;
  const d = Math.hypot(l.pos.x - cam.x, l.pos.y - cam.y, l.pos.z - cam.z);
  if (d > VISIBLE_RANGE) return 0;
  // Betrachter außerhalb der Reichweite sieht das Licht nur noch an der Wand davor: weich abfallend
  const out = Math.max(0, d - l.radius) / Math.max(l.radius, 0.1);
  // Innerhalb der Reichweite gewinnt bei Gleichstand das nähere
  return (e * l.radius) / ((1 + out * out * 4) * (1 + (0.2 * d) / l.radius));
}

/**
 * Neues Licht aufnehmen. Ist der Pool voll, verdrängt es das unwichtigste (Wichtigkeit für `cam`;
 * ohne Kamera das älteste), sofern das neue wichtiger ist. Liefert das gespeicherte Licht oder `null`.
 */
export function addLight(pool: LightPool, spec: LightSpec, cam?: Vec3): DynLight | null {
  if (!(spec.duration > 0) || !(spec.radius > 0) || !(spec.intensity > 0)) return null;
  const light: DynLight = { ...spec, pos: { ...spec.pos }, shape: spec.shape ?? 'flash', age: 0, shown: false };
  if (pool.lights.length < pool.capacity) {
    pool.lights.push(light);
    return light;
  }
  let worst = 0;
  let worstScore = Infinity;
  for (let i = 0; i < pool.lights.length; i++) {
    const l = pool.lights[i]!;
    const s = cam ? lightScore(l, cam) : -l.age;
    if (s < worstScore) {
      worstScore = s;
      worst = i;
    }
  }
  const mine = cam ? lightScore(light, cam) : Infinity;
  if (mine < worstScore) return null;
  pool.lights[worst] = light;
  return light;
}

/** Zeit fortschreiben; abgelaufene Lichter entfernen. Neue Lichter altern im ersten Schritt nicht (immer ≥ 1 Frame sichtbar). */
export function tickPool(pool: LightPool, dt: number): void {
  for (const l of pool.lights) {
    if (!l.shown) {
      l.shown = true;
      continue;
    }
    l.age += Math.max(0, dt);
  }
  pool.lights = pool.lights.filter((l) => l.age < l.duration);
}

export type ActiveLight = { x: number; y: number; z: number; r: number; g: number; b: number; radius: number };

/** Die `max` wichtigsten Lichter für den Betrachter, Farbe bereits mit der aktuellen Helligkeit multipliziert. */
export function selectLights(pool: LightPool, cam: Vec3, max: number): ActiveLight[] {
  if (max <= 0) return [];
  return pool.lights
    .map((l) => ({ l, s: lightScore(l, cam) }))
    .filter((e) => e.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(({ l }) => {
      const k = currentIntensity(l);
      return { x: l.pos.x, y: l.pos.y, z: l.pos.z, r: l.color[0] * k, g: l.color[1] * k, b: l.color[2] * k, radius: l.radius };
    });
}

// ----------------------------------------------------------------------------- Vorlagen (Datenmodul)

/** Mündungsfeuer: kurz, warm, klein; Scharfschützen/Schrot größer. `size` = Skalierung des Effekts (1 ≈ Gewehr). */
export function muzzleLight(pos: Vec3, size = 1): LightSpec {
  const s = Math.max(0.3, Math.min(2.5, size));
  return { pos, color: [1, 0.72, 0.38], radius: 4.2 * s, intensity: 4.5 * Math.min(1.4, 0.6 + 0.4 * s), duration: 0.07, shape: 'flash' };
}

/** HE-/C4-Explosion: orange, großer Radius, längeres Ausklingen. `scale` 1 = HE, 3 = C4. */
export function explosionLight(pos: Vec3, scale = 1): LightSpec {
  const s = Math.max(0.5, Math.min(4, scale));
  return { pos: { x: pos.x, y: pos.y + 0.5, z: pos.z }, color: [1, 0.55, 0.2], radius: Math.min(36, 12 * Math.sqrt(s)), intensity: 4.5 + 1.2 * s, duration: 0.5 + 0.2 * (s - 1), shape: 'blast' };
}

/** Blendgranate: weißer, sehr heller Blitz. */
export function flashLight(pos: Vec3): LightSpec {
  return { pos, color: [1, 1, 1], radius: 16, intensity: 6, duration: 0.35, shape: 'blast' };
}
