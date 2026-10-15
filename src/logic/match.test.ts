import { describe, expect, it } from 'vitest';
import { ECONOMY } from './economy';
import { buyItem } from './loadout';
import {
  MATCH, addPlayer, aliveCounts, applyExplosion, applyFall, applyHit, balanceBots, beginRound, bombCarrier, finishRound,
  newMatch, removePlayer, restartMatch, rewardAction, scoreboard, smallerTeam, switchTeam, teamCounts,
} from './match';
import { ROUND } from './round';
import { WEAPONS } from './weapons';

const spawn = (team: 'T' | 'CT', i: number) => ({ x: team === 'T' ? i : 50 + i, y: 0, z: 0, yaw: 0, pitch: 0 });

function setup() {
  const m = newMatch();
  addPlayer(m, 'h1', 'Timo', { team: 'T' });
  addPlayer(m, 'b1', 'Bot Anna', { bot: true, team: 'CT' });
  addPlayer(m, 'b2', 'Bot Ben', { bot: true, team: 'T' });
  addPlayer(m, 'b3', 'Bot Cem', { bot: true, team: 'CT' });
  m.round.round = 1;
  beginRound(m, spawn, () => 0);
  return m;
}

describe('addPlayer / Teams', () => {
  it('auto-Team wählt das kleinere Team (Gleichstand → T)', () => {
    const m = newMatch();
    expect(smallerTeam(m)).toBe('T');
    addPlayer(m, 'a', 'A');
    expect(m.players['a']!.team).toBe('T');
    addPlayer(m, 'b', 'B');
    expect(m.players['b']!.team).toBe('CT');
    addPlayer(m, 'c', 'C', { team: 'auto' });
    expect(m.players['c']!.team).toBe('T');
    expect(teamCounts(m)).toEqual({ T: 2, CT: 1 });
    removePlayer(m, 'a');
    expect(teamCounts(m)).toEqual({ T: 1, CT: 1 });
  });

  it('neue Spieler sind tot bis zum Rundenstart und haben Startgeld', () => {
    const m = newMatch();
    const p = addPlayer(m, 'x', 'X', { team: 'CT' });
    expect(p.alive).toBe(false);
    expect(p.money.amount).toBe(ECONOMY.startMoney);
    expect(p.loadout.secondary).toBe('usp');
  });

  it('switchTeam setzt Inventar neu und tötet; balanceBots wechselt nur Bots', () => {
    const m = newMatch();
    addPlayer(m, 'h', 'H', { team: 'T' });
    addPlayer(m, 'b1', 'B1', { bot: true, team: 'T' });
    addPlayer(m, 'b2', 'B2', { bot: true, team: 'T' });
    expect(balanceBots(m)).toBe('b1');
    expect(m.players['b1']!.team).toBe('CT');
    expect(balanceBots(m)).toBeNull();
    switchTeam(m, 'h', 'CT');
    expect(m.players['h']!.loadout.secondary).toBe('usp');
    expect(m.players['h']!.alive).toBe(false);
  });
});

describe('beginRound', () => {
  it('alle leben, Spawns je Team zugeteilt, genau ein T trägt die Bombe', () => {
    const m = setup();
    expect(aliveCounts(m)).toEqual({ T: 2, CT: 2 });
    expect(m.players['h1']!.pose.x).toBe(0);
    expect(m.players['b2']!.pose.x).toBe(1);
    expect(m.players['b1']!.pose.x).toBe(50);
    const carriers = Object.values(m.players).filter((p) => p.loadout.bomb);
    expect(carriers).toHaveLength(1);
    expect(carriers[0]!.team).toBe('T');
    expect(bombCarrier(m)!.id).toBe(carriers[0]!.id);
  });

  it('Überlebende behalten Waffen, Tote nicht; Runde 1 setzt alles zurück', () => {
    const m = setup();
    const h = m.players['h1']!;
    buyItem(h.loadout, h.money, 'ak47', 'T');
    h.money.amount = 5000;
    buyItem(h.loadout, h.money, 'ak47', 'T');
    const b2 = m.players['b2']!;
    buyItem(b2.loadout, { amount: 5000, lossStreak: 0 }, 'galil', 'T');
    // Runde endet: h1 lebt, b2 tot
    b2.alive = false;
    finishRound(m, 'ct_win', false);
    m.round.round = 2;
    beginRound(m, spawn, () => 0.99);
    expect(m.players['h1']!.loadout.primary).toBe('ak47');
    expect(m.players['b2']!.loadout.primary).toBeNull();
    expect(m.players['h1']!.weapon).toBe('ak47');
    expect(aliveCounts(m)).toEqual({ T: 2, CT: 2 });
    // rnd 0.99 → letzter T bekommt die Bombe
    expect(m.players['b2']!.loadout.bomb).toBe(true);
    expect(m.players['h1']!.loadout.bomb).toBe(false);
  });
});

describe('applyHit', () => {
  it('Körpertreffer ohne Rüstung = voller Schaden; Kill zählt, belohnt und landet im Feed', () => {
    const m = setup();
    const awp = WEAPONS['awp']!;
    const r = applyHit(m, 'b1', 'h1', awp, 'body', 0)!;
    expect(r.killed).toBe(true);
    expect(r.dmg).toBe(115);
    expect(m.players['b1']!.alive).toBe(false);
    expect(m.players['h1']!.kills).toBe(1);
    expect(m.players['b1']!.deaths).toBe(1);
    expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.killReward);
    expect(m.feed).toHaveLength(1);
    expect(m.feed[0]).toMatchObject({ killer: 'h1', victim: 'b1', weapon: 'awp', headshot: false });
    expect(aliveCounts(m)).toEqual({ T: 2, CT: 1 });
  });

  it('Treffer auf Tote werden ignoriert', () => {
    const m = setup();
    applyHit(m, 'b1', 'h1', WEAPONS['awp']!, 'body');
    expect(applyHit(m, 'b1', 'h1', WEAPONS['awp']!, 'body')).toBeNull();
    expect(m.players['b1']!.deaths).toBe(1);
  });

  it('Kevlar reduziert Schaden und nutzt sich ab; Distanz senkt Pistolenschaden', () => {
    const m = setup();
    const v = m.players['b1']!;
    v.loadout.armor = 100;
    const glock = WEAPONS['glock']!;
    const near = applyHit(m, 'b1', 'h1', glock, 'body', 0)!;
    expect(near.dmg).toBeLessThan(glock.damage);
    expect(near.armorLeft).toBeLessThan(100);
    const hp1 = v.hp;
    const far = applyHit(m, 'b1', 'h1', glock, 'body', 60)!;
    expect(far.dmg).toBeLessThan(near.dmg);
    expect(v.hp).toBe(hp1 - far.dmg);
  });

  it('Teamkill (Friendly Fire an): Kill −1 und Geldstrafe', () => {
    const m = setup();
    m.friendlyFire = true;
    applyHit(m, 'b2', 'h1', WEAPONS['awp']!, 'head');
    expect(m.players['h1']!.kills).toBe(-1);
    expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney - MATCH.teamKillPenalty);
  });

  describe('Friendly Fire als Server-Option', () => {
    it('Standard ist aus', () => {
      expect(newMatch().friendlyFire).toBe(false);
    });

    it('aus: Kugel/Messer verletzen Teamkameraden nicht — kein Schaden, keine Rüstung, kein Teamkill, keine Strafe', () => {
      const m = setup();
      m.players['b2']!.loadout.armor = 100;
      for (const w of ['awp', 'ak47', 'knife']) {
        expect(applyHit(m, 'b2', 'h1', WEAPONS[w]!, 'head', 1)).toBeNull();
      }
      const b2 = m.players['b2']!;
      expect(b2.hp).toBe(100);
      expect(b2.alive).toBe(true);
      expect(b2.loadout.armor).toBe(100);
      expect(m.players['h1']!.kills).toBe(0);
      expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney);
      expect(m.feed).toHaveLength(0);
    });

    it('aus: Gegner werden weiter getroffen', () => {
      const m = setup();
      const r = applyHit(m, 'b1', 'h1', WEAPONS['ak47']!, 'body', 5)!;
      expect(r.dmg).toBeGreaterThan(0);
      expect(m.players['b1']!.hp).toBeLessThan(100);
    });

    it('aus: HE verletzt Kameraden nicht, den Werfer selbst aber schon; Bombe/Sturz ohne Angreifer wirken immer', () => {
      const m = setup();
      expect(applyExplosion(m, 'b2', 'h1', 80)).toBeNull();
      expect(m.players['b2']!.hp).toBe(100);
      expect(applyExplosion(m, 'h1', 'h1', 40)!.dmg).toBe(40);
      expect(applyExplosion(m, 'b2', null, 30, 1)!.dmg).toBe(30);
      expect(applyFall(m, 'b2', 10)!.dmg).toBe(10);
      expect(applyExplosion(m, 'b1', 'h1', 50)!.dmg).toBe(50);
    });

    it('an: HE und Kugeln verletzen Kameraden (Teamkill bestraft)', () => {
      const m = setup();
      m.friendlyFire = true;
      expect(applyExplosion(m, 'b2', 'h1', 120)!.killed).toBe(true);
      expect(m.players['h1']!.kills).toBe(-1);
    });
  });

  it('Explosion: Rüstung dämpft, 0 Schaden ignoriert', () => {
    const m = setup();
    expect(applyExplosion(m, 'b1', 'h1', 0)).toBeNull();
    const r = applyExplosion(m, 'b1', 'h1', 60)!;
    expect(r.dmg).toBe(60);
    m.players['b3']!.loadout.armor = 100;
    const r2 = applyExplosion(m, 'b3', 'h1', 60)!;
    expect(r2.dmg).toBeLessThan(60);
    expect(m.feed).toHaveLength(0);
  });

  it('Sturzschaden: Rüstung schützt nicht, kein Angreifer, Tod landet als „fall“ im Kill-Feed', () => {
    const m = setup();
    m.players['b3']!.loadout.armor = 100;
    m.players['b3']!.loadout.helmet = true;
    const r = applyFall(m, 'b3', 30)!;
    expect(r.dmg).toBe(30);
    expect(m.players['b3']!.hp).toBe(70);
    expect(m.players['b3']!.loadout.armor).toBe(100);
    expect(applyFall(m, 'b3', 0)).toBeNull();
    expect(applyFall(m, 'b3', -5)).toBeNull();
    expect(applyFall(m, 'nobody', 20)).toBeNull();
    const kills = m.players['h1']!.kills;
    const k = applyFall(m, 'b3', 500)!;
    expect(k.killed).toBe(true);
    expect(m.players['b3']!.alive).toBe(false);
    expect(m.players['b3']!.deaths).toBe(1);
    expect(m.players['h1']!.kills).toBe(kills);
    expect(m.feed.at(-1)).toMatchObject({ killer: null, victim: 'b3', weapon: 'fall', headshot: false });
    expect(applyFall(m, 'b3', 10)).toBeNull(); // schon tot
  });

  it('Kill-Feed ist auf feedMax begrenzt', () => {
    const m = newMatch();
    for (let i = 0; i < 10; i++) addPlayer(m, 'c' + i, 'C' + i, { team: 'CT' });
    addPlayer(m, 't', 'T', { team: 'T' });
    m.round.round = 1;
    beginRound(m, spawn, () => 0);
    for (let i = 0; i < 10; i++) applyHit(m, 'c' + i, 't', WEAPONS['awp']!, 'head');
    expect(m.feed).toHaveLength(MATCH.feedMax);
    expect(m.feed[0]!.victim).toBe('c4');
  });
});

describe('finishRound / Economy / Match-Sieg', () => {
  it('Gewinner +3250, Verlierer Verlustbonus mit Team-Serie', () => {
    const m = setup();
    finishRound(m, 'ct_win', false);
    expect(m.players['b1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.winReward);
    expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.lossBonusStart);
    expect(m.lossStreak).toEqual({ T: 1, CT: 0 });
    finishRound(m, 'ct_win', false);
    expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.lossBonusStart * 2 + ECONOMY.lossBonusStep);
    finishRound(m, 't_win', false);
    expect(m.lossStreak).toEqual({ T: 0, CT: 1 });
  });

  it('T-Niederlage mit gepflanzter Bombe: +800; Explosion: Gewinner +3500', () => {
    const m = setup();
    finishRound(m, 'ct_win_defuse', true);
    expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.lossBonusStart + MATCH.plantLossBonus);
    const m2 = setup();
    finishRound(m2, 't_win_explode', true);
    expect(m2.players['h1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.winReward + 250);
  });

  it('survived wird aus alive übernommen', () => {
    const m = setup();
    m.players['b1']!.alive = false;
    finishRound(m, 't_win', false);
    expect(m.players['b1']!.survived).toBe(false);
    expect(m.players['h1']!.survived).toBe(true);
  });

  it('Match-Sieg bei 16 Runden; restartMatch setzt alles zurück', () => {
    const m = setup();
    m.round.tRounds = ROUND.scoreToWin;
    expect(finishRound(m, 't_win', false)).toBe('T');
    expect(m.matchEndTimer).toBe(MATCH.matchEndTime);
    m.players['h1']!.kills = 7;
    restartMatch(m);
    expect(m.winner).toBeNull();
    expect(m.round.tRounds).toBe(0);
    expect(m.players['h1']!.kills).toBe(0);
    expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney);
    expect(m.players['h1']!.alive).toBe(false);
  });

  it('rewardAction: Plant/Defuse +300', () => {
    const m = setup();
    rewardAction(m, 'h1', 'plant');
    rewardAction(m, 'b1', 'defuse');
    expect(m.players['h1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.plantReward);
    expect(m.players['b1']!.money.amount).toBe(ECONOMY.startMoney + ECONOMY.defuseReward);
  });
});

describe('scoreboard', () => {
  it('sortiert nach Kills, dann Deaths, dann Name', () => {
    const m = setup();
    m.players['b2']!.kills = 3;
    m.players['h1']!.kills = 3;
    m.players['h1']!.deaths = 1;
    const sb = scoreboard(m);
    expect(sb.T.map((p) => p.id)).toEqual(['b2', 'h1']);
    expect(sb.CT).toHaveLength(2);
  });
});

describe('Aufwärmrunde und späte Tode', () => {
  it('Runde 1 setzt Geld und Inventar zurück (Warmup-Käufe verfallen)', () => {
    const m = newMatch();
    const p = addPlayer(m, 'a', 'A', { team: 'T' });
    buyItem(p.loadout, p.money, 'kevlar', 'T');
    expect(p.money.amount).toBe(ECONOMY.startMoney - 650);
    m.round.round = 1;
    beginRound(m, spawn, () => 0);
    expect(p.money.amount).toBe(ECONOMY.startMoney);
    expect(p.loadout.armor).toBe(0);
  });

  it('wer nach Rundenende noch stirbt, verliert seine Waffen', () => {
    const m = setup();
    const h = m.players['h1']!;
    h.money.amount = 5000;
    buyItem(h.loadout, h.money, 'ak47', 'T');
    finishRound(m, 't_win', false);
    expect(h.survived).toBe(true);
    applyHit(m, 'h1', 'b1', WEAPONS['awp']!, 'head'); // stirbt in der Rundenend-Anzeige
    m.round.round = 2;
    beginRound(m, spawn, () => 0);
    expect(h.loadout.primary).toBeNull();
  });
});

describe('Robustheit gegen kaputte Netz-Werte', () => {
  it('NaN/Infinity-Schaden schreibt nie NaN in HP oder Rüstung', () => {
    const m = setup();
    expect(applyExplosion(m, 'b1', 'h1', NaN)).toBeNull();
    expect(applyExplosion(m, 'b1', 'h1', -5)).toBeNull();
    const r = applyHit(m, 'b1', 'h1', WEAPONS['ak47']!, 'body', NaN)!;
    expect(r.dmg).toBe(0);
    expect(r.killed).toBe(false);
    const b1 = m.players['b1']!;
    expect(b1.hp).toBe(100);
    expect(Number.isFinite(b1.loadout.armor)).toBe(true);
    expect(applyFall(m, 'b1', NaN)).toBeNull();
    expect(b1.hp).toBe(100);
    expect(b1.alive).toBe(true);
  });

  it('Spielerliste ohne Prototyp: `__proto__`/`constructor` sind keine Spieler', () => {
    const m = newMatch();
    expect(m.players['__proto__' as string]).toBeUndefined();
    expect(m.players['constructor']).toBeUndefined();
    expect(applyHit(m, 'constructor', null, WEAPONS['ak47']!, 'body')).toBeNull();
    expect(WEAPONS['__proto__' as string]).toBeUndefined();
    expect(WEAPONS['toString']).toBeUndefined();
  });
});
