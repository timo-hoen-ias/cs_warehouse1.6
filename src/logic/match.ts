import { ECONOMY, addMoney, lossBonus, newMoney, type Money, type Team } from './economy';
import { armoredDamage } from './damage';
import { carryOver, defaultLoadout, giveWeapon, type Loadout } from './loadout';
import { ROUND, newRoundState, type RoundState } from './round';
import { hitDamage, rangeFalloff, type WeaponDef } from './weapons';

/**
 * Match-Zustand des Hosts (pure): alle Spieler (Menschen + Bots) mit Team, HP,
 * Rüstung, Geld, Inventar und Statistik; Kill-Feed; Team-Verlustserien;
 * Bombenträger. Runden-Phasen laufen in round.ts, Bombe in bombs.ts.
 */
export type PlayerId = string;

export type Pose = { x: number; y: number; z: number; yaw: number; pitch: number };

export type MatchPlayer = {
  id: PlayerId;
  name: string;
  team: Team;
  bot: boolean;
  hp: number;
  alive: boolean;
  money: Money;
  loadout: Loadout;
  /** Aktive Waffe (ID). */
  weapon: string;
  kills: number;
  deaths: number;
  /** Letzte bekannte Pose (Host-Sicht; Clients senden ihre eigene). */
  pose: Pose;
  /** Hat die letzte Runde überlebt (für Inventar-Übertrag). */
  survived: boolean;
  /** Ping-/Verbindungsinfo (nur Anzeige). */
  ping: number;
};

export type KillEvent = {
  killer: PlayerId | null;
  victim: PlayerId;
  weapon: string;
  headshot: boolean;
  /** Spielzeit (s) des Ereignisses. */
  time: number;
};

export type MatchState = {
  players: Record<PlayerId, MatchPlayer>;
  round: RoundState;
  lossStreak: Record<Team, number>;
  feed: KillEvent[];
  /** Match entschieden (16 Runden) → Siegerteam, sonst null. */
  winner: Team | null;
  /** Restzeit der Match-Ende-Anzeige (s). */
  matchEndTimer: number;
  /** Laufende Spielzeit (s). */
  time: number;
};

export const MATCH = {
  /** Sekunden Match-Ende-Anzeige, danach Neustart. */
  matchEndTime: 12,
  /** Max. Kill-Feed-Einträge. */
  feedMax: 6,
  /** Bonus für T bei Niederlage mit gepflanzter Bombe (CS: 800). */
  plantLossBonus: 800,
  /** Teamkill-Strafe. */
  teamKillPenalty: 300,
} as const;

export function newMatch(): MatchState {
  return {
    players: {},
    round: newRoundState(),
    lossStreak: { T: 0, CT: 0 },
    feed: [],
    winner: null,
    matchEndTimer: 0,
    time: 0,
  };
}

export function teamCounts(m: MatchState): Record<Team, number> {
  const c: Record<Team, number> = { T: 0, CT: 0 };
  for (const p of Object.values(m.players)) c[p.team] += 1;
  return c;
}

/** Lebende Spieler je Team (Input für tickRound). */
export function aliveCounts(m: MatchState): Record<Team, number> {
  const c: Record<Team, number> = { T: 0, CT: 0 };
  for (const p of Object.values(m.players)) if (p.alive) c[p.team] += 1;
  return c;
}

/** Team mit weniger Spielern (bei Gleichstand T) — Auto-Balance. */
export function smallerTeam(m: MatchState): Team {
  const c = teamCounts(m);
  return c.CT < c.T ? 'CT' : 'T';
}

/** Spieler aufnehmen (tot bis zur nächsten Runde, außer in Warmup). */
export function addPlayer(m: MatchState, id: PlayerId, name: string, opts: { bot?: boolean; team?: Team | 'auto' } = {}): MatchPlayer {
  const team = !opts.team || opts.team === 'auto' ? smallerTeam(m) : opts.team;
  const p: MatchPlayer = {
    id,
    name,
    team,
    bot: !!opts.bot,
    hp: 100,
    alive: false,
    money: newMoney(),
    loadout: defaultLoadout(team),
    weapon: team === 'T' ? 'glock' : 'usp',
    kills: 0,
    deaths: 0,
    pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    survived: false,
    ping: 0,
  };
  m.players[id] = p;
  return p;
}

export function removePlayer(m: MatchState, id: PlayerId): void {
  delete m.players[id];
}

/** Teamwechsel (wirkt sofort: Spieler stirbt, Inventar neu). */
export function switchTeam(m: MatchState, id: PlayerId, team: Team): void {
  const p = m.players[id];
  if (!p || p.team === team) return;
  p.team = team;
  p.alive = false;
  p.hp = 0;
  p.loadout = defaultLoadout(team);
  p.weapon = p.loadout.secondary!;
}

export type SpawnProvider = (team: Team, index: number) => Pose;

/**
 * Rundenstart: alle Spieler leben, Inventar nach CS-Regel übertragen, Spawns
 * zuweisen, Bombe an einen zufälligen T vergeben. rnd injizierbar (Tests).
 */
export function beginRound(m: MatchState, spawnAt: SpawnProvider, rnd: () => number = Math.random): void {
  const idx: Record<Team, number> = { T: 0, CT: 0 };
  const ts: MatchPlayer[] = [];
  for (const p of Object.values(m.players)) {
    const firstRound = m.round.round <= 1;
    p.loadout = carryOver(p.loadout, p.survived && !firstRound, p.team);
    if (firstRound) p.loadout = defaultLoadout(p.team);
    p.hp = 100;
    p.alive = true;
    p.survived = false;
    p.weapon = p.loadout.primary ?? p.loadout.secondary ?? 'knife';
    p.pose = spawnAt(p.team, idx[p.team]++);
    if (p.team === 'T') ts.push(p);
  }
  if (ts.length) {
    const carrier = ts[Math.min(ts.length - 1, Math.floor(rnd() * ts.length))]!;
    giveWeapon(carrier.loadout, 'c4');
  }
}

/** Bombenträger (lebend), sonst null. */
export function bombCarrier(m: MatchState): MatchPlayer | null {
  for (const p of Object.values(m.players)) if (p.alive && p.loadout.bomb) return p;
  return null;
}

export type HitResult = { dmg: number; killed: boolean; armorLeft: number };

/**
 * Treffer verrechnen: Distanz-Abfall, Rüstung, HP; bei Tod Statistik, Geld
 * (Kill-Belohnung, Teamkill-Strafe) und Kill-Feed. Liefert null, wenn Opfer tot/unbekannt.
 */
export function applyHit(m: MatchState, victimId: PlayerId, attackerId: PlayerId | null, def: WeaponDef, part: 'head' | 'body', dist = 0): HitResult | null {
  const v = m.players[victimId];
  if (!v || !v.alive) return null;
  const raw = hitDamage(def, part) * rangeFalloff(def, dist);
  const a = armoredDamage(raw, def.armorPen, part, { armor: v.loadout.armor, helmet: v.loadout.helmet });
  v.loadout.armor = a.armorLeft;
  return applyRawDamage(m, v, a.dmg, attackerId, def.id, part === 'head');
}

/** Rohschaden (z. B. HE-Granate: Rüstung dämpft mit armorPen 0.57, kein Kopfschuss). */
export function applyExplosion(m: MatchState, victimId: PlayerId, attackerId: PlayerId | null, dmg: number, armorPen = 0.57): HitResult | null {
  const v = m.players[victimId];
  if (!v || !v.alive || dmg <= 0) return null;
  const a = armoredDamage(dmg, armorPen, 'body', { armor: v.loadout.armor, helmet: v.loadout.helmet });
  v.loadout.armor = a.armorLeft;
  return applyRawDamage(m, v, a.dmg, attackerId, 'hegrenade', false);
}

function applyRawDamage(m: MatchState, v: MatchPlayer, dmg: number, attackerId: PlayerId | null, weapon: string, headshot: boolean): HitResult {
  v.hp = Math.max(0, v.hp - dmg);
  const killed = v.hp <= 0;
  if (killed) {
    v.alive = false;
    v.deaths += 1;
    const a = attackerId ? m.players[attackerId] : undefined;
    if (a && a.id !== v.id) {
      if (a.team === v.team) {
        a.kills -= 1;
        addMoney(a.money, -MATCH.teamKillPenalty);
      } else {
        a.kills += 1;
        addMoney(a.money, ECONOMY.killReward);
      }
    }
    m.feed.push({ killer: attackerId, victim: v.id, weapon, headshot, time: m.time });
    if (m.feed.length > MATCH.feedMax) m.feed.splice(0, m.feed.length - MATCH.feedMax);
  }
  return { dmg, killed, armorLeft: v.loadout.armor };
}

/** Belohnung fürs Pflanzen/Entschärfen. */
export function rewardAction(m: MatchState, id: PlayerId, action: 'plant' | 'defuse'): void {
  const p = m.players[id];
  if (!p) return;
  addMoney(p.money, action === 'plant' ? ECONOMY.plantReward : ECONOMY.defuseReward);
}

export type RoundOutcome = 'ct_win' | 't_win' | 't_win_explode' | 'ct_win_defuse';

/**
 * Rundenende verrechnen: Gewinner +3250 (Bombe: +3500), Verlierer Team-Verlustbonus
 * (+800 für T mit gepflanzter Bombe), Überlebende markieren, Match-Sieg prüfen.
 */
export function finishRound(m: MatchState, outcome: RoundOutcome, bombPlanted: boolean): Team | null {
  const winner: Team = outcome === 't_win' || outcome === 't_win_explode' ? 'T' : 'CT';
  const loser: Team = winner === 'T' ? 'CT' : 'T';
  const winReward = outcome === 't_win_explode' ? ECONOMY.winReward + 250 : ECONOMY.winReward;
  const bonus = lossBonus(m.lossStreak[loser]) + (loser === 'T' && bombPlanted ? MATCH.plantLossBonus : 0);
  for (const p of Object.values(m.players)) {
    addMoney(p.money, p.team === winner ? winReward : bonus);
    p.survived = p.alive;
  }
  m.lossStreak[winner] = 0;
  m.lossStreak[loser] += 1;
  if (m.round.tRounds >= ROUND.scoreToWin) m.winner = 'T';
  else if (m.round.ctRounds >= ROUND.scoreToWin) m.winner = 'CT';
  if (m.winner) m.matchEndTimer = MATCH.matchEndTime;
  return m.winner;
}

/** Neues Match mit denselben Spielern (Geld/Statistik zurück). */
export function restartMatch(m: MatchState): void {
  m.round = newRoundState();
  m.lossStreak = { T: 0, CT: 0 };
  m.feed = [];
  m.winner = null;
  m.matchEndTimer = 0;
  for (const p of Object.values(m.players)) {
    p.money = newMoney();
    p.kills = 0;
    p.deaths = 0;
    p.alive = false;
    p.hp = 100;
    p.survived = false;
    p.loadout = defaultLoadout(p.team);
    p.weapon = p.loadout.secondary!;
  }
}

/** Scoreboard-Zeilen (nach Kills sortiert) je Team. */
export function scoreboard(m: MatchState): Record<Team, MatchPlayer[]> {
  const out: Record<Team, MatchPlayer[]> = { T: [], CT: [] };
  for (const p of Object.values(m.players)) out[p.team].push(p);
  for (const t of ['T', 'CT'] as Team[]) out[t].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
  return out;
}

/** Team-Balance: wechselt einen Bot (nie Menschen), wenn Teams um >1 abweichen. */
export function balanceBots(m: MatchState): PlayerId | null {
  const c = teamCounts(m);
  if (Math.abs(c.T - c.CT) <= 1) return null;
  const from: Team = c.T > c.CT ? 'T' : 'CT';
  const to: Team = from === 'T' ? 'CT' : 'T';
  const bot = Object.values(m.players).find((p) => p.bot && p.team === from);
  if (!bot) return null;
  switchTeam(m, bot.id, to);
  return bot.id;
}
