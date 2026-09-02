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
