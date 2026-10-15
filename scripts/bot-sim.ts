// Headless-Bot-Simulation: spielt Bot-gegen-Bot-Runden im Zeitraffer und druckt Statistik.
// Aufruf: bun scripts/bot-sim.ts [karten-id] [runden] [je-team] [skill] [seed] [--rounds] [--deaths] [--ff]
// --ff = Friendly Fire an (Standard wie im Spiel: aus); --deaths zeigt auch die Teamkill-Anteile.
import { mapById } from '../src/maps';
import { compileMap } from '../src/logic/mapcompile';
import { HeadlessMatch, summarize } from '../src/logic/botSim';
import { nearestNode } from '../src/logic/nav';
import { buildBotTestMap } from '../src/logic/botTestMap';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const id = args[0] ?? 'de_lagerstaub';
const rounds = Number(args[1] ?? 12);
const perTeam = Number(args[2] ?? 5);
const skill = Number(args[3] ?? 0.6);
const seed = Number(args[4] ?? 1);

const t0 = performance.now();
// 'bottest' / 'bottest-noareas' = synthetische Testkarte der Unit-Tests
const map = compileMap(id.startsWith('bottest') ? buildBotTestMap({ areas: id !== 'bottest-noareas' }) : mapById(id).build());
const sim = new HeadlessMatch(map, { perTeam, skill, seed, friendlyFire: flags.has('--ff') });
const t1 = performance.now();
const traceArg = process.argv.find((a) => a.startsWith('--trace='));
const traceRound = traceArg ? Number(traceArg.split('=')[1]) : -1;
if (traceRound > 0) {
  // Runde verfolgen: alle 4 s Zustand je Bot
  let next = 0;
  while (sim.stats.length < rounds && !sim.match.winner) {
    sim.step();
    const m = sim.match;
    if (m.round.round !== traceRound || (m.round.phase !== 'live' && m.round.phase !== 'bomb')) continue;
    if (m.time < next) continue;
    next = m.time + 4;
    console.log(`-- t=${m.time.toFixed(1)} Runde ${m.round.round} ${m.round.phase} Rest ${m.round.timer.toFixed(0)} Bombe ${m.round.bomb.phase} Drops ${JSON.stringify(sim.drops.filter((d) => d.weapon === 'c4').map((d) => [+d.x.toFixed(1), +d.y.toFixed(2), +d.z.toFixed(1)]))} Plan ${JSON.stringify(sim.bots.tPlan())} T-Stufe ${sim.bots.coachT?.stage} CT-Stufe ${sim.bots.coachCT?.stage}`);
    for (const p of Object.values(m.players)) {
      if (!p.alive) continue;
      const st = sim.bots.state(p.id);
      const z = sim.info.zones[sim.info.zoneOf[nearestNode(sim.info.nav, p.pose.x, p.pose.y, p.pose.z, 6)] ?? -1]?.name ?? '?';
      console.log(`   ${p.id.padEnd(6)} ${p.team.padEnd(2)} hp${String(p.hp).padStart(3)} ${p.weapon.padEnd(8)} ${z.padEnd(16)} (${p.pose.x.toFixed(0)},${p.pose.y.toFixed(1)},${p.pose.z.toFixed(0)})  ${st?.role} | ${st?.task} | ${st?.state}`);
    }
  }
}
sim.runRounds(rounds);
const t2 = performance.now();
console.log(`${id}: ${perTeam}v${perTeam}, Skill ${skill}, Seed ${seed}, Friendly Fire ${sim.match.friendlyFire ? 'an' : 'aus'} — Aufbau ${(t1 - t0).toFixed(0)} ms, ${sim.stats.length} Runden in ${((t2 - t1) / 1000).toFixed(1)} s (Spielzeit ${sim.match.time.toFixed(0)} s)`);
if (flags.has('--rounds')) {
  for (const s of sim.stats) {
    console.log(`  R${String(s.round).padStart(2)} ${s.outcome.padEnd(14)} ${s.duration.toFixed(0).padStart(4)} s  Plan ${s.tPlan}/${s.tSite}  ${s.planted ? `Plant ${s.plantSite} @${s.plantAt.toFixed(0)}s` : 'kein Plant'}${s.defused ? ' entschärft' : ''}  Kills ${s.kills}  Eingänge [${s.entries.join(', ')}]  Stuck ${s.maxStuck.toFixed(1)} ${s.maxStuck > 3 ? `(${s.stuckAt}) ` : ''}Idle ${s.maxIdle.toFixed(1)} (${s.idleState})  Wand ${s.wallViolations} Fall ${s.fallViolations} Funk ${s.radio} Gran ${s.nades}`);
  }
}
console.log(summarize(sim.stats));
if (flags.has('--deaths')) {
  for (const team of ['T', 'CT'] as const) {
    const by = new Map<string, number>();
    for (const r of sim.stats) for (const d of r.deaths) if (d.team === team) by.set(d.zone, (by.get(d.zone) ?? 0) + 1);
    console.log(`Tode ${team}:`, [...by].sort((a, b) => b[1] - a[1]).map(([z, n]) => `${z} ${n}`).join(', '));
    const all = sim.stats.flatMap((r) => r.deaths).filter((d) => d.team === team);
    const tk = all.filter((d) => d.teamKill).length;
    console.log(`  davon Teamkills: ${tk} von ${all.length} (${((100 * tk) / Math.max(1, all.length)).toFixed(1)} %)`);
  }
}
if (flags.has('--radio')) console.log(sim.radioLog.slice(0, 60).join('\n'));
