import { describe, expect, it } from 'vitest';
import { BOMB, isBombActive, newBomb, tickBomb, type BombState } from './bombs';

describe('planten', () => {
  it('hält E im Spot → pflanzt nach plantTime', () => {
    const b = newBomb();
    // 32 × 0.1s = 3.2s → pflanzt (Float: 33 Ticks reichen sicher)
    for (let i = 0; i < 33; i++) tickBomb(b, 0.1, { plant: true, defuse: false }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('planted');
    expect(b.spot).toBe('a');
    expect(b.fuseLeft).toBeCloseTo(BOMB.fuseTime);
  });

  it('Loslassen bricht Planten ab', () => {
    const b = newBomb();
    tickBomb(b, 0.1, { plant: true, defuse: false }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('planting');
    tickBomb(b, 0.1, { plant: false, defuse: false }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('none');
    expect(b.spot).toBe(null);
  });

  it('pflanzt nur im Spot', () => {
    const b = newBomb();
    tickBomb(b, 5, { plant: true, defuse: false }, { inSpot: null, hasKit: false });
    expect(b.phase).toBe('none');
  });
});

describe('explodieren', () => {
  it('Zündschnur läuft ab → Explosion', () => {
    const b = newBomb();
    for (let i = 0; i < 40; i++) tickBomb(b, 0.1, { plant: true, defuse: false }, { inSpot: 'a', hasKit: false });
    for (let i = 0; i < 500; i++) tickBomb(b, 0.1, { plant: false, defuse: false }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('exploded');
    expect(b.fuseLeft).toBe(0);
  });

  it('ist nach dem Plant aktiv', () => {
    const b = newBomb();
    for (let i = 0; i < 40; i++) tickBomb(b, 0.1, { plant: true, defuse: false }, { inSpot: 'a', hasKit: false });
    expect(isBombActive(b)).toBe(true);
  });
});

describe('defusen', () => {
  function plant(b: BombState): void {
    for (let i = 0; i < 40; i++) tickBomb(b, 0.1, { plant: true, defuse: false }, { inSpot: 'a', hasKit: false });
  }

  it('ohne Kit dauert defuseTime', () => {
    const b = newBomb();
    plant(b);
    for (let i = 0; i < Math.ceil(BOMB.defuseTime / 0.1) + 2; i++) tickBomb(b, 0.1, { plant: false, defuse: true }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('defused');
  });

  it('mit Kit dauert nur defuseKitTime', () => {
    const b = newBomb();
    plant(b);
    for (let i = 0; i < Math.ceil(BOMB.defuseKitTime / 0.1) + 2; i++) tickBomb(b, 0.1, { plant: false, defuse: true }, { inSpot: 'a', hasKit: true });
    expect(b.phase).toBe('defused');
  });

  it('Loslassen unterbricht das Defusen (Bombe explodiert weiter)', () => {
    const b = newBomb();
    plant(b);
    tickBomb(b, 1, { plant: false, defuse: true }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('defusing');
    tickBomb(b, 1, { plant: false, defuse: false }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('planted');
  });

  it('Defuse nur auf dem richtigen Spot', () => {
    const b = newBomb();
    plant(b);
    for (let i = 0; i < 100; i++) tickBomb(b, 0.1, { plant: false, defuse: true }, { inSpot: 'b', hasKit: true });
    expect(b.phase).not.toBe('defused');
  });
});

describe('Zünder während des Entschärfens', () => {
  it('läuft weiter: zu spät begonnenes Entschärfen ohne Kit endet in der Explosion', () => {
    const b = newBomb();
    for (let i = 0; i < 40; i++) tickBomb(b, 0.1, { plant: true, defuse: false }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('planted');
    // bis 3 s vor Ablauf warten
    while (b.fuseLeft > 3) tickBomb(b, 0.1, { plant: false, defuse: false }, { inSpot: null, hasKit: false });
    for (let i = 0; i < 200 && b.phase !== 'exploded' && b.phase !== 'defused'; i++) tickBomb(b, 0.1, { plant: false, defuse: true }, { inSpot: 'a', hasKit: false });
    expect(b.phase).toBe('exploded');
  });

  it('rechtzeitig mit Kit: entschärft, Restzeit wurde dabei verbraucht', () => {
    const b = newBomb();
    for (let i = 0; i < 40; i++) tickBomb(b, 0.1, { plant: true, defuse: false }, { inSpot: 'a', hasKit: true });
    const before = b.fuseLeft;
    for (let i = 0; i < 70 && b.phase !== 'defused'; i++) tickBomb(b, 0.1, { plant: false, defuse: true }, { inSpot: 'a', hasKit: true });
    expect(b.phase).toBe('defused');
    expect(before).toBeGreaterThan(BOMB.defuseKitTime);
  });
});
