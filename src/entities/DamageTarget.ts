import { makeHealth, applyDamage, type Health } from '../logic/damage';
import type { WeaponDef } from '../logic/weapons';
import type { PartBox } from '../logic/hitbox';

/**
 * Schadens-Ziel im Render-Teil: kapselt Health + Callback für Treffer/Respawn.
 * Wird von TargetDummy/Bots implementiert; die Hitbox-Berechnung liegt in logic/hitbox.
 */
export class DamageTarget {
  health: Health;
  onHit?: (part: 'head' | 'body', dmg: number) => void;
  onDeath?: () => void;
  constructor(maxHp: number) {
    this.health = makeHealth(maxHp);
  }

  /** Weltraum-Partboxen für den puren Raycast (Kopf/Körper). */
  partBoxes?(): PartBox[];

  /** Kurzer visueller Treffer-Blitz (Implementierung optional). */
  flashHit?(): void;

  /** Wendet Schaden an; returns true bei Tod. */
  takeHit(part: 'head' | 'body', def: WeaponDef): boolean {
    if (!this.health.alive) return false;
    const dmg = Math.round(def.damage * (part === 'head' ? def.headFactor : 1));
    this.onHit?.(part, dmg);
    const killed = applyDamage(this.health, dmg);
    if (killed) this.onDeath?.();
    return killed;
  }
}

/** Globales Register aller schießbaren Ziele (Puppen, später Bots). */
export const targets = new Set<DamageTarget>();

export function registerTarget(t: DamageTarget): void {
  targets.add(t);
}
export function unregisterTarget(t: DamageTarget): void {
  targets.delete(t);
}
