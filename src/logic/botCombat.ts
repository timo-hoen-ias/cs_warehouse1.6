import type { GunState } from './fire';
import type { Loadout } from './loadout';
import type { XYZ } from './nav';
import { WEAPONS, type WeaponDef } from './weapons';

/**
 * Kampf-Mikro der Bots (pure), angelehnt an CS 1.6:
 * - **Gegenlenken**: vor dem ersten Schuss anhalten (Bewegung macht ungenau), erst nach
 *   kurzer Stillstandszeit (skillabhängig) schießen,
 * - **Feuerkontrolle nach Distanz**: weit = Einzelschüsse, mittel = 3er-Bursts,
 *   nah = Sprühen; Scharfschützen stehen still, Schrot nur nah,
 * - **Zielpunkt**: Kopf mit skillabhängiger Wahrscheinlichkeit, sonst Brust (geduckt tiefer),
 * - **Waffenwahl**: leeres Magazin im Gefecht → Pistole, sonst Primärwaffe,
 * - **Nachladen**: leer sofort, halbleer nur in Sicherheit.
 */
export const COMBAT = {
  /** Ab hier Einzelschüsse (m). */
  tapRange: 26,
  /** Ab hier 3er-Bursts, darunter Sprühen (m). */
  burstRange: 12,
  /** Nahkampf: in Bewegung weiterschießen (m). */
  closeRange: 5,
  /** Ab diesem Anteil Restmunition wird in Sicherheit nachgeladen. */
  reloadBelow: 0.45,
} as const;

export type FirePattern = {
  /** Schüsse je Feuerstoß. */
  burst: number;
  /** Pause nach dem Feuerstoß (s). */
  pause: number;
  /** Vor dem Schuss anhalten (Gegenlenken). */
  stop: boolean;
  /** Geduckt schießen (lange Distanz). */
  crouch: boolean;
};

/** Feuer-Rhythmus je Waffe und Distanz. */
export function firePattern(def: WeaponDef, dist: number, skill: number): FirePattern {
  if (def.mode === 'melee') return { burst: 1, pause: def.cycle ?? 0.45, stop: false, crouch: false };
  if (def.type === 'sniper') return { burst: 1, pause: def.rpm > 0 ? 0.35 : (def.cycle ?? 1.2), stop: true, crouch: false };
  if (def.type === 'shotgun') return { burst: 1, pause: def.rpm > 0 ? Math.max(0.25, 60 / def.rpm) : 0.8, stop: dist > COMBAT.closeRange, crouch: false };
  const careful = 1.25 - 0.5 * Math.min(1, Math.max(0, skill));
  if (def.rpm <= 0) {
    // Halbautomatische Pistolen: Takt nach Distanz
    return { burst: 1, pause: (def.cycle ?? 0.15) + Math.min(0.3, dist * 0.009) * careful, stop: dist > COMBAT.closeRange, crouch: false };
  }
  const pistol = def.type === 'pistol';
  if (dist > (pistol ? 15 : COMBAT.tapRange)) return { burst: 1, pause: 0.3 * careful, stop: true, crouch: dist > 32 && !pistol };
  if (dist > COMBAT.burstRange) return { burst: pistol ? 2 : 3, pause: 0.32 * careful, stop: true, crouch: false };
  return { burst: pistol ? 4 : 8, pause: 0.22 * careful, stop: dist > COMBAT.closeRange, crouch: false };
}

/** Stillstand vor dem ersten genauen Schuss (s): gute Bots gegenlenken schneller. */
export function counterStrafeTime(skill: number): number {
  return 0.17 - 0.11 * Math.min(1, Math.max(0, skill));
}

/** Wahrscheinlichkeit, auf den Kopf zu zielen. */
export function headChance(skill: number): number {
  return 0.12 + 0.6 * Math.min(1, Math.max(0, skill));
}

/** Zielpunkt am Gegner: Kopf- oder Brustmitte (geduckt tiefer). */
export function aimPoint(feet: XYZ, crouch: boolean, head: boolean): XYZ {
  const y = crouch ? (head ? 1.12 : 0.78) : head ? 1.53 : 1.1;
  return { x: feet.x, y: feet.y + y, z: feet.z };
}

/** Bevorzugte Höchstdistanz einer Waffe (darüber lohnt kein Duell, Bot nähert sich). */
export function effectiveRange(def: WeaponDef): number {
  switch (def.type) {
    case 'knife': return def.range;
    case 'shotgun': return 14;
    case 'pistol': return 35;
    case 'smg': return 40;
    case 'sniper': return 120;
    default: return 75;
  }
}

export type CombatState = {
  /** Restschüsse im aktuellen Feuerstoß. */
  shotsLeft: number;
  /** Restpause bis zum nächsten Feuerstoß (s). */
  pause: number;
  /** Seitwärts-Richtung beim Strafen (−1/1) und Zeit bis zum Wechsel. */
  strafe: -1 | 1;
  strafeT: number;
  /** Kopf anvisieren (je Gefecht ausgewürfelt). */
  head: boolean;
  /** Aktuelles Ziel. */
  target: string | null;
};

export function newCombat(): CombatState {
  return { shotsLeft: 0, pause: 0, strafe: 1, strafeT: 0, head: false, target: null };
}

export type CombatCtx = {
  def: WeaponDef;
  dist: number;
  skill: number;
  /** Reaktionszeit abgelaufen und Waffe bereit. */
  ready: boolean;
  /** Seit wie vielen Sekunden steht der Bot still. */
  stillFor: number;
  dt: number;
  rnd: () => number;
};

export type CombatOut = { fire: boolean; move: 'stop' | 'strafe' | 'push'; crouch: boolean };

/** Neues Ziel: Kopf/Brust auswürfeln, Feuerstoß vorbereiten. */
export function engage(st: CombatState, target: string, ctx: Pick<CombatCtx, 'def' | 'dist' | 'skill' | 'rnd'>): void {
  if (st.target === target) return;
  st.target = target;
  st.head = ctx.rnd() < headChance(ctx.skill);
  st.shotsLeft = firePattern(ctx.def, ctx.dist, ctx.skill).burst;
  st.pause = 0;
}

/**
 * Ein Kampf-Tick: Feuer erst nach Reaktion, beim Fernkampf erst nach dem Anhalten;
 * zwischen den Feuerstößen strafen gute Bots seitlich (und halten zum Schuss wieder an).
 */
export function combatTick(st: CombatState, ctx: CombatCtx): CombatOut {
  const pat = firePattern(ctx.def, ctx.dist, ctx.skill);
  st.strafeT -= ctx.dt;
  if (st.strafeT <= 0) {
    st.strafe = st.strafe === 1 ? -1 : 1;
    st.strafeT = 0.35 + ctx.rnd() * 0.45;
  }
  const strafer = ctx.skill > 0.45 && ctx.dist < 35 && ctx.def.type !== 'sniper';
  if (st.pause > 0) {
    st.pause = Math.max(0, st.pause - ctx.dt);
    return { fire: false, move: strafer ? 'strafe' : pat.stop ? 'stop' : 'strafe', crouch: pat.crouch };
  }
  if (!ctx.ready) return { fire: false, move: pat.stop ? 'stop' : 'strafe', crouch: pat.crouch };
  if (ctx.def.mode === 'melee') return { fire: ctx.dist <= ctx.def.range, move: 'push', crouch: false };
  if (pat.stop && ctx.stillFor < counterStrafeTime(ctx.skill)) return { fire: false, move: 'stop', crouch: pat.crouch };
  return { fire: true, move: pat.stop ? 'stop' : 'strafe', crouch: pat.crouch };
}

/** Nach einem abgegebenen Schuss: Feuerstoß zählen, ggf. Pause beginnen. */
export function onShot(st: CombatState, ctx: Pick<CombatCtx, 'def' | 'dist' | 'skill' | 'rnd'>): void {
  st.shotsLeft -= 1;
  if (st.shotsLeft <= 0) {
    const pat = firePattern(ctx.def, ctx.dist, ctx.skill);
    st.pause = pat.pause * (0.8 + ctx.rnd() * 0.4);
    st.shotsLeft = pat.burst;
  }
}

const hasAmmo = (lo: Loadout, id: string | null): boolean => {
  if (!id) return false;
  const g = lo.guns[id];
  return !!g && g.mag + g.reserve > 0;
};

/**
 * Waffenwahl: Primärwaffe mit Munition; im Gefecht mit leerem Magazin (Nachladen
 * dauert zu lange) die Pistole; Schrotflinte auf Distanz → Pistole; sonst Messer.
 */
export function chooseWeapon(lo: Loadout, enemyDist: number | null): string {
  const prim = lo.primary;
  const sec = lo.secondary;
  const pg = prim ? lo.guns[prim] : undefined;
  const sg = sec ? lo.guns[sec] : undefined;
  const fighting = enemyDist !== null;
  if (prim && hasAmmo(lo, prim)) {
    const def = WEAPONS[prim]!;
    const emptyInFight = fighting && pg!.mag === 0 && enemyDist! < 25;
    const shotgunFar = def.type === 'shotgun' && fighting && enemyDist! > 22;
    if ((emptyInFight || shotgunFar) && sg && sg.mag > 0) return sec!;
    return prim;
  }
  if (sec && hasAmmo(lo, sec)) return sec;
  return 'knife';
}

/** Nachladen: leer immer (wenn Reserve), halbleer nur in Sicherheit. */
export function needsReload(gun: GunState | undefined, def: WeaponDef, safe: boolean): boolean {
  if (!gun || gun.reloadLeft > 0 || gun.reserve <= 0 || gun.mag >= def.magSize) return false;
  return gun.mag === 0 || (safe && gun.mag < def.magSize * COMBAT.reloadBelow);
}

/** Rückzug: wenig HP im Gefecht oder beim Nachladen mit Gegner in der Nähe. */
export function shouldRetreat(hp: number, visibleEnemies: number, reloading: boolean, enemyDist: number | null): boolean {
  if (visibleEnemies === 0 && enemyDist === null) return false;
  if (hp < 30 && visibleEnemies >= 1) return true;
  if (visibleEnemies >= 2 && hp < 55) return true;
  return reloading && enemyDist !== null && enemyDist < 18;
}
