/**
 * Gesichtete Gegner fürs Radar (pure): Ein Gegner erscheint auf dem Radar, solange ihn ein
 * Teamkamerad (oder man selbst) sieht, und noch kurz danach (`SPOT.hold`) — wie das Teamradar
 * in CS. Die Sichtprüfung (Blickfeld, Wände, Rauch) liefert der Aufrufer; geprüft wird in
 * festem Takt statt jeden Frame (`SPOT.interval`).
 */
export const SPOT = {
  /** Prüftakt (s). */
  interval: 0.15,
  /** So lange bleibt ein Gegner nach der letzten Sichtung sichtbar (s). */
  hold: 1.4,
};

export type SpotViewer = { id: string };
export type SpotTarget = { id: string };

export class SpotTracker {
  private readonly seen = new Map<string, number>();
  private last = Number.NEGATIVE_INFINITY;

  /**
   * Sichtungen aktualisieren (höchstens einmal je `SPOT.interval`). `sees(viewer, target)` entscheidet,
   * ob ein Betrachter das Ziel sieht. Gibt true zurück, wenn tatsächlich geprüft wurde.
   */
  update<V extends SpotViewer, T extends SpotTarget>(now: number, viewers: readonly V[], targets: readonly T[], sees: (v: V, t: T) => boolean): boolean {
    if (now - this.last < SPOT.interval) return false;
    this.last = now;
    for (const t of targets) {
      for (const v of viewers) {
        if (sees(v, t)) {
          this.seen.set(t.id, now);
          break; // ein Betrachter genügt
        }
      }
    }
    // Vergessene Einträge entfernen (Spieler, die gegangen oder gestorben sind)
    for (const [id, t] of this.seen) if (now - t > SPOT.hold * 4) this.seen.delete(id);
    return true;
  }

  /** Ist der Gegner gerade (oder vor Kurzem) gesehen worden? */
  isSpotted(id: string, now: number): boolean {
    const t = this.seen.get(id);
    return t !== undefined && now - t <= SPOT.hold;
  }

  /** Neue Runde: nichts bleibt gesichtet. */
  clear(): void {
    this.seen.clear();
    this.last = Number.NEGATIVE_INFINITY;
  }
}
