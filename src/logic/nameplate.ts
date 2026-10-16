import type { Team } from './economy';

/**
 * Namensschild über einer Spielfigur zeigen? Die Schilder werden ohne Tiefentest gezeichnet
 * (durch Wände sichtbar), deshalb nur für lebende Kameraden des eigenen Teams — Gegner
 * dürfen so nie zu orten sein. Ohne eigenes Team (noch nicht beigetreten) gibt es keine.
 */
export function nameplateVisible(viewerTeam: Team | null | undefined, targetTeam: Team, targetAlive: boolean): boolean {
  return targetAlive && !!viewerTeam && viewerTeam === targetTeam;
}
