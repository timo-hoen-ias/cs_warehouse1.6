import { describe, expect, it } from 'vitest';
import { HeadlessMatch, summarize, type RoundStats } from './botSim';
import { buildBotTestMap } from './botTestMap';
import { compileMap } from './mapcompile';
import { loadMapData } from '../maps';

/**
 * Headless-Simulation: echte Bot-gegen-Bot-Runden im Zeitraffer (Regeln wie im Host).
 * Prüft das Gesamtverhalten statistisch — Siege beider Teams, Pflanzen, Entschärfen,
 * kein Festsitzen, verschiedene Wege, plausible Rundenzeiten, keine Wand-/Fall-Fehler.
 */
describe('Headless-Simulation de_lagerstaub (5 gegen 5)', () => {
  const map = compileMap(loadMapData('de_lagerstaub'));
  const stats: RoundStats[] = [];
  for (const seed of [1, 2, 3]) {
    const sim = new HeadlessMatch(map, { perTeam: 5, skill: 0.6, seed });
    sim.runRounds(14);
    stats.push(...sim.stats);
  }
  const s = summarize(stats);
  // Für das Protokoll (Testausgabe)
  console.log('Bot-Simulation de_lagerstaub:', JSON.stringify(s));

  it('genug Runden gespielt, beide Teams gewinnen', () => {
    expect(stats.length).toBeGreaterThanOrEqual(36);
    expect(s.tWins as number).toBeGreaterThanOrEqual(stats.length * 0.2);
    expect(s.ctWins as number).toBeGreaterThanOrEqual(stats.length * 0.2);
  });

  it('T pflanzen in einem vernünftigen Anteil, Bomben werden auch entschärft', () => {
    expect(s.plantRate as number).toBeGreaterThanOrEqual(0.3);
    expect(s.plantRate as number).toBeLessThanOrEqual(0.9);
    expect(s.defused as number).toBeGreaterThanOrEqual(1);
  });

  it('niemand sitzt fest oder steht grundlos herum', () => {
    expect(s.maxStuck as number).toBeLessThanOrEqual(6);
    expect(s.maxIdle as number).toBeLessThanOrEqual(8);
  });

  it('verschiedene Wege und Pläne über die Runden', () => {
    expect(new Set(stats.flatMap((r) => r.entries)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(stats.map((r) => r.tPlan)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(stats.map((r) => r.plantSite).filter(Boolean)).size).toBe(2);
  });

  it('plausible Rundendauer, Granaten und Funk werden genutzt', () => {
    expect(s.avgDuration as number).toBeGreaterThanOrEqual(30);
    expect(s.avgDuration as number).toBeLessThanOrEqual(115);
    expect(s.nadesPerRound as number).toBeGreaterThan(0.5);
    expect(s.radioPerRound as number).toBeGreaterThan(2);
    expect(s.radioPerRound as number).toBeLessThan(30);
  });

  it('kein Bot läuft durch Wände oder fällt aus der Karte', () => {
    expect(s.wallViolations).toBe(0);
    expect(s.fallViolations).toBe(0);
  });
}, 120_000);

describe('Headless-Simulation: Teamkills und Friendly Fire', () => {
  const map = compileMap(loadMapData('de_lagerstaub'));
  const play = (friendlyFire?: boolean) => [1, 2].flatMap((seed) => {
    const sim = new HeadlessMatch(map, { perTeam: 5, skill: 0.6, seed, ...(friendlyFire === undefined ? {} : { friendlyFire }) });
    sim.runRounds(12);
    return sim.stats;
  });

  it('Standard wie im Spiel: Friendly Fire aus', () => {
    expect(new HeadlessMatch(map, { perTeam: 2, skill: 0.6, seed: 1 }).match.friendlyFire).toBe(false);
    expect(new HeadlessMatch(map, { perTeam: 2, skill: 0.6, seed: 1, friendlyFire: true }).match.friendlyFire).toBe(true);
  });

  it('Bots schießen nicht durch Kameraden: auch mit Friendly Fire an sind Teamkills selten (vorher ≈ 16 % aller Tode)', () => {
    const s = summarize(play(true));
    expect(s.deaths as number).toBeGreaterThan(80);
    expect((s.teamKills as number) / (s.deaths as number)).toBeLessThanOrEqual(0.02);
  });

  it('Friendly Fire aus: es gibt keine Teamkills', () => {
    const s = summarize(play());
    expect(s.deaths as number).toBeGreaterThan(80);
    expect(s.teamKills).toBe(0);
  });
}, 120_000);

describe('Headless-Simulation Testkarte (3 gegen 3)', () => {
  it('Runden laufen kartenunabhängig durch (auch ohne Callouts)', () => {
    let plants = 0;
    for (const areas of [true, false]) {
      const sim = new HeadlessMatch(compileMap(buildBotTestMap({ areas })), { perTeam: 3, skill: 0.5, seed: 7 });
      sim.runRounds(10);
      const s = summarize(sim.stats);
      expect(sim.stats.length).toBe(10);
      expect(s.wallViolations).toBe(0);
      expect(s.fallViolations).toBe(0);
      expect(s.maxStuck as number).toBeLessThanOrEqual(6);
      expect(s.tWins as number).toBeGreaterThanOrEqual(1);
      plants += s.plants as number;
    }
    expect(plants).toBeGreaterThanOrEqual(3);
  });
}, 60_000);
