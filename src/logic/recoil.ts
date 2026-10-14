/** Recoil-Parameter einer Waffe (Daten, im JSON justierbar). */
export type RecoilSpec = {
  /** Vertikaler Kamera-Kick je Schuss (rad). */
  up: number;
  /** Laterale Streu-Richtung je Schuss (rad, halber Bereich). */
  side: number;
  /** Zuwachs-Faktor je weiterem Schuss im Dauerfeuer (Ramp). */
  ramp: number;
  /** Max. akkumulierter Recoil-Offset (rad). */
  cap: number;
  /** Sekunden, bis der Offset nach Schusspause auf 0 zurückgeht. */
  recovery: number;
};

/** Recoil-Zustand (pur, tickbar). */
export type RecoilState = {
  /** Aktueller vertikaler Offset (rad, nach oben). */
  pitch: number;
  /** Aktueller lateraler Offset (rad). */
  yaw: number;
  /** Schüsse im aktuellen Schussstrich (für Ramp). */
  shots: number;
  /** Sekunden seit dem letzten Schuss. */
  idle: number;
};

/** Pause ohne Schuss, bis der Ramp zurückgesetzt wird. */
export const RAMP_RESET_IDLE = 0.45;
/** Verzögerung, bevor der Offset nach Schusspause abklingt (Auto-Dauerfeuer bleibt stabil). */
export const RECOVERY_DELAY = 0.12;

export function makeRecoil(): RecoilState {
  return { pitch: 0, yaw: 0, shots: 0, idle: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Ein Schuss: akkumuliert den Kamera-Kick (vertikal + zufällig lateral) auf den
 * Zustand. Der Kick wächst mit jedem Schuss im Dauerfeuer (Ramp) und ist durch
 * cap gedeckelt. Rückgabe = Kick dieses Schusses (für Viewmodel-Feedback).
 */
export function fireRecoil(spec: RecoilSpec, st: RecoilState, rnd: () => number = Math.random): { pitch: number; yaw: number } {
  st.idle = 0;
  st.shots += 1;
  const f = 1 + spec.ramp * (st.shots - 1);
  const kickPitch = spec.up * f;
  const kickYaw = (rnd() * 2 - 1) * spec.side * f;
  st.pitch = Math.min(spec.cap, st.pitch + kickPitch);
  st.yaw = clamp(st.yaw + kickYaw, -spec.cap, spec.cap);
  return { pitch: kickPitch, yaw: kickYaw };
}

/**
 * Ein Frame fortschreiben. Während firing bleibt der Offset bestehen (Dauerfeuer
 * klettert); nach kurzer Pause klingt er exponentiell Richtung 0 ab (Recovery),
 * ein längerer Stopp setzt den Ramp zurück.
 */
export function tickRecoil(spec: RecoilSpec, st: RecoilState, dt: number, firing: boolean): void {
  if (firing) {
    st.idle = 0;
    return;
  }
  st.idle += dt;
  if (st.idle >= RAMP_RESET_IDLE) st.shots = 0;
  if (st.idle < RECOVERY_DELAY) return;
  const t = Math.max(spec.recovery, 0.05);
  const k = Math.exp(-dt / t);
  st.pitch *= k;
  st.yaw *= k;
  if (st.pitch < 0.0005) st.pitch = 0;
  if (Math.abs(st.yaw) < 0.0005) st.yaw = 0;
}

/**
 * CS-artiges Spray-Muster (deterministisch, lernbar): die ersten `climbShots`
 * Kugeln steigen gerade nach oben, danach pendelt das Muster seitlich mit
 * `sway` (rad) Amplitude und `swayPeriod` Schüssen Periode. Die Kamera folgt
 * nur zum Teil (VIEW_PUNCH_SHARE), der Rest muss mit der Maus gegengezogen werden.
 */
export type SprayShape = {
  /** Steigung je Schuss (rad) in der Steigphase. */
  climb: number;
  /** Schüsse bis zum Ende der Steigphase. */
  climbShots: number;
  /** Seitliche Amplitude (rad) nach der Steigphase. */
  sway: number;
  /** Schüsse je voller Pendelbewegung. */
  swayPeriod: number;
  /** Erste Pendelrichtung: +1 rechts, −1 links. */
  swayDir: 1 | -1;
};

/** Anteil des Musters, den die Kamera mitnimmt (Rest = Kugel weicht vom Fadenkreuz ab). */
export const VIEW_PUNCH_SHARE = 0.5;

/** Muster-Versatz (pitch nach oben, yaw seitlich) für den `shot`-ten Schuss (0-basiert). */
export function sprayOffset(shape: SprayShape, shot: number): { pitch: number; yaw: number } {
  const n = Math.max(0, Math.floor(shot));
  const climbN = Math.min(n, shape.climbShots);
  // Nach der Steigphase: nur noch schwaches Nachsteigen (25 %)
  const pitch = shape.climb * climbN + Math.max(0, n - shape.climbShots) * shape.climb * 0.25;
  let yaw = 0;
  if (n > shape.climbShots) {
    const t = (n - shape.climbShots) / Math.max(1, shape.swayPeriod);
    yaw = shape.swayDir * shape.sway * Math.sin(t * Math.PI * 2);
  } else {
    // leichtes Driften in die erste Pendelrichtung während des Steigens
    yaw = shape.swayDir * shape.sway * 0.15 * (climbN / Math.max(1, shape.climbShots));
  }
  return { pitch, yaw };
}

/** Standard-Muster je Waffentyp (Automatikwaffen); null = kein festes Muster. */
export function defaultSpray(type: string, rpm: number): SprayShape | null {
  if (rpm <= 0) return null;
  switch (type) {
    case 'rifle': return { climb: 0.0105, climbShots: 9, sway: 0.03, swayPeriod: 14, swayDir: -1 };
    case 'smg': return { climb: 0.007, climbShots: 8, sway: 0.022, swayPeriod: 12, swayDir: 1 };
    case 'mg': return { climb: 0.008, climbShots: 12, sway: 0.035, swayPeriod: 20, swayDir: 1 };
    case 'pistol': return { climb: 0.009, climbShots: 6, sway: 0.015, swayPeriod: 8, swayDir: 1 };
    default: return null;
  }
}
