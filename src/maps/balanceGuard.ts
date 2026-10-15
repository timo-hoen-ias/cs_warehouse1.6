import { describe, expect, it } from 'vitest';
import { HeadlessMatch, summarize, type RoundStats } from '../logic/botSim';
import { compileMap } from '../logic/mapcompile';
import { loadMapData } from './index';

/**
 * Gemeinsamer Balance-Wächter aller Karten (Bot-Simulation, Spiel-Standard: 5 gegen 5, Skill 0.6,
 * Friendly Fire aus). Jede Karte ruft ihn in ihrer eigenen Testdatei auf (`de_<karte>.test.ts`), damit
 * Vitest die Karten parallel rechnet (eine Datei je Worker).
 *
 * Die Schwellen sind bewusst weit (30–70 % T): die Simulation streut je Seed stark (Economy-Schneeball).
 * Gemessen (48 Seeds je Karte, IMPLEMENTIERUNGSPLAN M6.3): Lagerstaub/Güterbahnhof/Umschlag ≈ 47–58 %, Kühlhaus ≈ 42 %,
 * Speicherstadt ≈ 47–52 % (nach dem Umbau, IMPLEMENTIERUNGSPLAN M4). Der Wächter fängt grobe Verschiebungen durch Karten- oder Bot-Änderungen ab.
 */
export const BALANCE = {
  seeds: [1, 2, 3, 4, 5],
  rounds: 20,
  /** Erlaubter Anteil der T-Siege. */
  tMin: 0.3,
  tMax: 0.7,
  /** Mindestens so viele Plants je Spot (über alle Seeds). */
  plantsPerSite: 10,
  /** Längstes Festsitzen eines Bots (s). */
  maxStuck: 6,
} as const;

/** Spielt die Wächter-Runden einer Karte (alle Seeds hintereinander). */
export function balanceRounds(id: string, seeds: readonly number[] = BALANCE.seeds, rounds: number = BALANCE.rounds): RoundStats[] {
  const map = compileMap(loadMapData(id));
  return seeds.flatMap((seed) => {
    const sim = new HeadlessMatch(map, { perTeam: 5, skill: 0.6, seed });
    sim.runRounds(rounds);
    return sim.stats;
  });
}

/** Registriert den Balance-Test einer Karte. */
export function balanceGuard(id: string): void {
  describe(`${id}: Balance (Bot-Simulation)`, () => {
    it(`T gewinnen ${BALANCE.tMin * 100}–${BALANCE.tMax * 100} % der Runden, es wird auf beiden Spots gepflanzt, niemand sitzt fest`, () => {
      const stats = balanceRounds(id);
      const s = summarize(stats);
      const tShare = (s.tWins as number) / stats.length;
      console.log(`Balance ${id}: T ${(tShare * 100).toFixed(0)} % (${stats.length} Runden), Plants A ${stats.filter((r) => r.plantSite === 'a').length} B ${stats.filter((r) => r.plantSite === 'b').length}, Festsitzen ≤ ${s.maxStuck} s`);
      expect(stats.length).toBeGreaterThanOrEqual(BALANCE.seeds.length * BALANCE.rounds * 0.75);
      expect(tShare).toBeGreaterThanOrEqual(BALANCE.tMin);
      expect(tShare).toBeLessThanOrEqual(BALANCE.tMax);
      for (const site of ['a', 'b']) expect(stats.filter((r) => r.plantSite === site).length, `Plants ${site}`).toBeGreaterThanOrEqual(BALANCE.plantsPerSite);
      expect(s.wallViolations).toBe(0);
      expect(s.fallViolations).toBe(0);
      expect(s.maxStuck as number).toBeLessThanOrEqual(BALANCE.maxStuck);
    }, 240_000);
  });
}
