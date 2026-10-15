import type { Team } from './economy';

/**
 * Friendly Fire (pure): Server-/Match-Option wie `mp_friendlyfire` in CS 1.6.
 * Aus (Standard der öffentlichen Server): Kugeln, Messer und HE-Granaten verletzen keine
 * Teamkameraden — die Kugel endet trotzdem am Kameraden (keine Durchdringung). Blendgranaten
 * blenden Kameraden weiterhin, Bombenexplosion und Sturz sind keine Teamschäden. An: Schaden
 * wie bisher, Teamkill kostet Kill und Geld (`MATCH.teamKillPenalty`).
 */
export const DEFAULT_FRIENDLY_FIRE = false;

export type DamageParty = { id: string; team: Team };

/**
 * Ist dieser Schaden wegen ausgeschaltetem Friendly Fire wirkungslos?
 * Kein Angreifer (Bombe, Sturz) und Eigenschaden (eigene HE) sind nie blockiert;
 * Schaden zwischen Teams ebenfalls nicht.
 */
export function teamDamageBlocked(friendlyFire: boolean, attacker: DamageParty | null | undefined, victim: DamageParty): boolean {
  if (friendlyFire || !attacker) return false;
  if (attacker.id === victim.id) return false;
  return attacker.team === victim.team;
}

/** Kurzbeschriftung für Menü, Lobby und Serverbrowser. */
export function friendlyFireText(on: boolean): string {
  return on ? 'Friendly Fire an' : 'Friendly Fire aus';
}
