import { describe, expect, it } from 'vitest';
import { DEFUSE_RADIUS, bombInput } from './hostRules';
import { addPlayer, newMatch } from './match';
import { giveWeapon } from './loadout';

function setup() {
  const m = newMatch();
  const t = addPlayer(m, 't1', 'T', { team: 'T', bot: true });
  const ct = addPlayer(m, 'c1', 'CT', { team: 'CT' });
  t.alive = true;
  ct.alive = true;
  giveWeapon(t.loadout, 'c4');
  m.round.phase = 'live';
  return { m, t, ct };
}

const siteA = (p: { x: number; z: number }) => (Math.hypot(p.x, p.z) < 5 ? ('a' as const) : null);
const center = () => ({ x: 0, y: 0, z: 0 });

describe('Host-Regeln: Pflanzen und Entschärfen', () => {
  it('Bot pflanzt nur mit C4 in der Hand im Spot; Mensch zieht sie automatisch', () => {
    const { m, t } = setup();
    t.pose = { x: 1, y: 0, z: 1, yaw: 0, pitch: 0 };
    const held = (id: string) => id === 't1';
    expect(bombInput(m, { siteAt: siteA, eHeld: held, bombPos: null, spotCenter: center }).plant).toBe(false);
    t.weapon = 'c4';
    expect(bombInput(m, { siteAt: siteA, eHeld: held, bombPos: null, spotCenter: center })).toMatchObject({ plant: true, inSpot: 'a', planter: 't1' });
    t.pose.x = 20;
    expect(bombInput(m, { siteAt: siteA, eHeld: held, bombPos: null, spotCenter: center }).plant).toBe(false);
    t.pose.x = 1;
    t.bot = false;
    t.weapon = 'ak47';
    expect(bombInput(m, { siteAt: siteA, eHeld: held, bombPos: null, spotCenter: center }).plant).toBe(true);
    expect(bombInput(m, { siteAt: siteA, eHeld: () => false, bombPos: null, spotCenter: center }).plant).toBe(false);
  });

  it('CT entschärft nahe der Bombe (Radius, Höhe), Kit wird gemeldet', () => {
    const { m, ct } = setup();
    m.round.phase = 'bomb';
    m.round.bomb.spot = 'a';
    const bomb = { x: 2, y: 0.15, z: 2 };
    const held = (id: string) => id === 'c1';
    ct.pose = { x: 2 + DEFUSE_RADIUS - 0.2, y: 0, z: 2, yaw: 0, pitch: 0 };
    ct.loadout.defuseKit = true;
    expect(bombInput(m, { siteAt: siteA, eHeld: held, bombPos: bomb, spotCenter: center })).toMatchObject({ defuse: true, inSpot: 'a', hasKit: true, defuser: 'c1' });
    ct.pose.x = 2 + DEFUSE_RADIUS + 0.3;
    expect(bombInput(m, { siteAt: siteA, eHeld: held, bombPos: bomb, spotCenter: center }).defuse).toBe(false);
    ct.pose = { x: 2, y: 3, z: 2, yaw: 0, pitch: 0 }; // Ebene darüber
    expect(bombInput(m, { siteAt: siteA, eHeld: held, bombPos: bomb, spotCenter: center }).defuse).toBe(false);
  });
});
