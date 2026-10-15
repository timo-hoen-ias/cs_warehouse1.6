import { describe, expect, it } from 'vitest';
import { FRIENDLY, mateInLineOfFire, nadeHurtsMates, segmentDistance, yieldStep } from './botFriendly';

const eye = { x: 0, y: 1.6, z: 0 };
/** Ziel 20 m geradeaus (−Z), Brusthöhe. */
const aim = { x: 0, y: 1.1, z: -20 };

describe('segmentDistance', () => {
  it('parallele, windschiefe und entartete Strecken', () => {
    expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }).dist).toBeCloseTo(1);
    // senkrecht über der Mitte
    const r = segmentDistance({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 5, y: 2, z: -1 }, { x: 5, y: 2, z: 1 });
    expect(r.dist).toBeCloseTo(2);
    expect(r.s).toBeCloseTo(0.5);
    // Endpunkt der zweiten Strecke liegt hinter dem Ende der ersten
    expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 3, z: 0 }).dist).toBeCloseTo(3);
    // Punkt statt Strecke
    expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }, { x: 3, y: 4, z: 0 }).dist).toBeCloseTo(5);
    expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 2, y: 3, z: 0 }, { x: 2, y: 3, z: 0 }).dist).toBeCloseTo(3);
    expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0, y: 5, z: 0 }).dist).toBeCloseTo(2);
  });
});

describe('mateInLineOfFire', () => {
  it('Kamerad genau in der Schusslinie → blockiert', () => {
    const b = mateInLineOfFire(eye, aim, [{ x: 0, y: 0, z: -6 }]);
    expect(b).not.toBeNull();
    expect(b!.dist).toBeLessThan(FRIENDLY.lineRadius);
  });

  it('Kamerad seitlich (1.5 m) oder weit daneben → frei', () => {
    expect(mateInLineOfFire(eye, aim, [{ x: 1.5, y: 0, z: -6 }])).toBeNull();
    expect(mateInLineOfFire(eye, aim, [{ x: -3, y: 0, z: -10 }])).toBeNull();
  });

  it('Sicherheitsrand: 0.5 m neben der Linie blockiert, 0.9 m nicht (nah)', () => {
    expect(mateInLineOfFire(eye, aim, [{ x: 0.5, y: 0, z: -4 }])).not.toBeNull();
    expect(mateInLineOfFire(eye, aim, [{ x: 0.9, y: 0, z: -4 }])).toBeNull();
  });

  it('Streuungskegel: weiter hinten ist der Rand größer, aber höchstens lineMax', () => {
    const far = { x: 0, y: 1.1, z: -60 };
    // nah (4 m) ist 0.7 m Abstand frei, weit hinten (50 m) blockiert derselbe Abstand
    expect(mateInLineOfFire(eye, aim, [{ x: 0.7, y: 0, z: -4 }])).toBeNull();
    expect(mateInLineOfFire(eye, far, [{ x: 0.7, y: 0, z: -50 }])).not.toBeNull();
    // größerer Zielfehler weitet den Kegel; über lineMax hinaus nie
    expect(mateInLineOfFire(eye, aim, [{ x: 0.76, y: 0, z: -10 }])).toBeNull();
    expect(mateInLineOfFire(eye, aim, [{ x: 0.76, y: 0, z: -10 }], { spread: 0.05 })).not.toBeNull();
    expect(mateInLineOfFire(eye, far, [{ x: FRIENDLY.lineMax + 0.05, y: 0, z: -50 }], { spread: 0.5 })).toBeNull();
  });

  it('Kamerad hinter dem Ziel oder direkt neben dem Ziel zählt nicht', () => {
    expect(mateInLineOfFire(eye, aim, [{ x: 0, y: 0, z: -24 }])).toBeNull();
    expect(mateInLineOfFire(eye, aim, [{ x: 0, y: 0, z: -19.8 }])).toBeNull();
    expect(mateInLineOfFire(eye, aim, [{ x: 0, y: 0, z: -18 }])).not.toBeNull();
  });

  it('Kamerad hinter dem Schützen zählt nicht', () => {
    expect(mateInLineOfFire(eye, aim, [{ x: 0, y: 0, z: 3 }])).toBeNull();
  });

  it('Höhe: ein Kamerad auf einer anderen Ebene (Etage darunter/darüber) stört nicht', () => {
    expect(mateInLineOfFire(eye, aim, [{ x: 0, y: -4.4, z: -6 }])).toBeNull();
    expect(mateInLineOfFire(eye, aim, [{ x: 0, y: 4.4, z: -6 }])).toBeNull();
  });

  it('Schuss von oben nach unten: Kamerad unter der Schusslinie wird erkannt', () => {
    const high = { x: 0, y: 5, z: 0 };
    const low = { x: 0, y: 0.5, z: -9 };
    expect(mateInLineOfFire(high, low, [{ x: 0, y: 0, z: -9.3 }, { x: 0, y: 0, z: -4 }])).toBeNull();
    // Kamerad unter der Linie in Höhe der Linie
    expect(mateInLineOfFire({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0.5, z: -9 }, [{ x: 0, y: 0, z: -6 }])).not.toBeNull();
  });

  it('mehrere Kameraden: der knappste wird gemeldet; leere Liste und Nulllänge sind harmlos', () => {
    const near = { x: 0.1, y: 0, z: -5 };
    const edge = { x: 0.55, y: 0, z: -9 };
    expect(mateInLineOfFire(eye, aim, [edge, near])!.mate).toBe(near);
    expect(mateInLineOfFire(eye, aim, [])).toBeNull();
    expect(mateInLineOfFire(eye, eye, [near])).toBeNull();
  });

  it('Seitenschritt führt vom Kameraden weg (senkrecht zur Linie)', () => {
    // Schuss nach −Z; Kamerad leicht links (−X): ausweichen nach rechts (+X)
    const left = mateInLineOfFire(eye, aim, [{ x: -0.3, y: 0, z: -6 }])!;
    expect(left.escape.x).toBeGreaterThan(0.99);
    expect(Math.abs(left.escape.z)).toBeLessThan(1e-9);
    const right = mateInLineOfFire(eye, aim, [{ x: 0.3, y: 0, z: -6 }])!;
    expect(right.escape.x).toBeLessThan(-0.99);
    // genau in der Mitte: deterministisch eine Seite, normiert
    const mid = mateInLineOfFire(eye, aim, [{ x: 0, y: 0, z: -6 }])!;
    expect(Math.hypot(mid.escape.x, mid.escape.z)).toBeCloseTo(1);
    // Schuss steil nach oben/unten: trotzdem eine gültige waagrechte Richtung
    const steep = mateInLineOfFire({ x: 0, y: 8, z: 0 }, { x: 0, y: 0, z: 0 }, [{ x: 0, y: 0, z: 0.2 }])!;
    expect(Math.hypot(steep.escape.x, steep.escape.z)).toBeCloseTo(1);
  });

  it('enge Gasse: Kamerad zwei Meter vor dem Schützen in einer Linie → blockiert (der Fall der Teamkills)', () => {
    const lane = { x: 0, y: 1.6, z: 0 };
    const enemy = { x: 0.2, y: 1.1, z: -25 };
    expect(mateInLineOfFire(lane, enemy, [{ x: 0, y: 0, z: -2 }, { x: 0.1, y: 0, z: -4 }])).not.toBeNull();
  });
});

describe('yieldStep (nicht vor zielenden Kameraden stehen)', () => {
  const line = { from: eye, to: aim };

  it('wer in der Linie eines zielenden Kameraden steht, bekommt einen Seitenschritt', () => {
    const step = yieldStep({ x: 0.1, y: 0, z: -3 }, [line]);
    expect(step).not.toBeNull();
    expect(Math.abs(step!.x)).toBeGreaterThan(0.9);
    // zur eigenen Seite hin: wer rechts der Linie steht, geht nach rechts (und der Schütze nach links)
    expect(step!.x).toBeGreaterThan(0);
    expect(yieldStep({ x: -0.1, y: 0, z: -3 }, [line])!.x).toBeLessThan(0);
    expect(mateInLineOfFire(eye, aim, [{ x: 0.1, y: 0, z: -3 }])!.escape.x).toBeLessThan(0);
  });

  it('seitlich (1.2 m), hinter dem Schützen und hinter dem Ziel steht man frei', () => {
    expect(yieldStep({ x: 1.2, y: 0, z: -3 }, [line])).toBeNull();
    expect(yieldStep({ x: 0, y: 0, z: 2 }, [line])).toBeNull();
    expect(yieldStep({ x: 0, y: 0, z: -22 }, [line])).toBeNull();
    expect(yieldStep({ x: 0, y: 0, z: -3 }, [])).toBeNull();
  });

  it('mehrere Linien: die knappste entscheidet', () => {
    const other = { from: { x: 5, y: 1.6, z: 0 }, to: { x: 5, y: 1.1, z: -20 } };
    expect(yieldStep({ x: 5.2, y: 0, z: -3 }, [line, other])).not.toBeNull();
  });
});

describe('nadeHurtsMates', () => {
  const land = { x: 0, y: 0, z: -15 };
  const mate = (dx: number, dz: number) => ({ x: land.x + dx, y: 0, z: land.z + dz });

  it('HE: Kamerad im Splitterradius mit Sichtlinie → ja, außerhalb oder hinter Wand → nein', () => {
    expect(nadeHurtsMates('he', land, [mate(3, 0)])).toBe(true);
    expect(nadeHurtsMates('he', land, [mate(FRIENDLY.heRadius + 1, 0)])).toBe(false);
    expect(nadeHurtsMates('he', land, [mate(3, 0)], () => false)).toBe(false);
    expect(nadeHurtsMates('he', land, [mate(3, 0)], () => true)).toBe(true);
  });

  it('Blendgranate: nur in Blendnähe mit Sichtlinie', () => {
    expect(nadeHurtsMates('flash', land, [mate(6, 0)])).toBe(true);
    expect(nadeHurtsMates('flash', land, [mate(FRIENDLY.flashRadius + 1, 0)])).toBe(false);
    expect(nadeHurtsMates('flash', land, [mate(6, 0)], () => false)).toBe(false);
  });

  it('Rauch ist harmlos; keine Kameraden → nein', () => {
    expect(nadeHurtsMates('smoke', land, [mate(0, 0)])).toBe(false);
    expect(nadeHurtsMates('he', land, [])).toBe(false);
  });

  it('prüft alle Kameraden, nicht nur den ersten', () => {
    expect(nadeHurtsMates('he', land, [mate(30, 0), mate(2, 2)])).toBe(true);
  });
});
