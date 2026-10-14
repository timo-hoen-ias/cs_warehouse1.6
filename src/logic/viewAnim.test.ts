import { describe, expect, it } from 'vitest';
import {
  ARM_HINT, EASES, KICK, TRACKS, VIEW_SCALE, ViewAnimator, advanceViewBob, boltCycleClip, breathe, countPulses,
  cycleClip, drawClip, dryFireClip, ease, emptyPose, familyOf, inspectClip, kickImpulse, knifeClip, plantClip,
  pullPinClip, pumpClip, reloadClip, sampleClip, sampleTrack, sprintPose, springStep, strafeLean, throwClip,
  validateClip, viewBobAmount, walkBob,
  type AnimFamily, type ChargeKind, type Clip, type ReloadStyle, type Spring, type Track,
} from './viewAnim';

const FAMILIES: AnimFamily[] = ['knife', 'pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'mg', 'grenade', 'bomb'];
const CHARGES: ChargeKind[] = ['slide', 'charge', 'bolt', 'pump', 'none'];
const STYLES: ReloadStyle[] = ['mag', 'pistol', 'shell', 'dual', 'mg'];

/** Alle Bibliotheks-Clips (für die Struktur-Prüfungen). */
function allClips(): Clip[] {
  const out: Clip[] = [];
  for (const f of FAMILIES) {
    for (const c of CHARGES) out.push(drawClip(f, c));
    out.push(inspectClip(f));
  }
  for (const s of STYLES) {
    for (const c of CHARGES) {
      for (const empty of [false, true]) {
        const r = reloadClip(s, { duration: 3, empty, charge: c, shells: 5 });
        if (r) out.push(r);
      }
    }
  }
  out.push(cycleClip('slide', 0.1), cycleClip('slide2', 0.15), cycleClip('charge', 0.08), dryFireClip(), boltCycleClip(1.2), pumpClip(0.8));
  out.push(knifeClip(false, 0), knifeClip(false, 1), knifeClip(true), pullPinClip(), throwClip(), plantClip());
  return out;
}

const ROOT = ['px', 'py', 'pz', 'rx', 'ry', 'rz'] as const;

describe('ease', () => {
  it('alle Kurven: 0 bei t=0, 1 bei t=1, Eingabe wird begrenzt', () => {
    for (const e of EASES) {
      expect(ease(e, 0)).toBeCloseTo(0, 6);
      expect(ease(e, 1)).toBeCloseTo(1, 6);
      expect(ease(e, -3)).toBeCloseTo(0, 6);
      expect(ease(e, 7)).toBeCloseTo(1, 6);
    }
  });

  it('monotone Kurven steigen nie', () => {
    for (const e of ['linear', 'in', 'out', 'inOut', 'inCubic', 'outCubic', 'inOutCubic'] as const) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const v = ease(e, i / 100);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
    }
  });

  it('step springt erst am Ende, outBack schießt über, inBack holt aus', () => {
    expect(ease('step', 0.99)).toBe(0);
    expect(ease('outBack', 0.7)).toBeGreaterThan(1);
    expect(ease('inBack', 0.2)).toBeLessThan(0);
    expect(ease('inOut', 0.5)).toBeCloseTo(0.5, 6);
    expect(ease('in', 0.5)).toBeLessThan(ease('out', 0.5));
  });
});

describe('sampleTrack', () => {
  const tr: Track = [[0, 0], [0.5, 1, 'linear'], [1, 3, 'linear']];
  it('interpoliert zwischen Keys mit dem Easing des Ziel-Keys', () => {
    expect(sampleTrack(tr, 0.25)).toBeCloseTo(0.5, 6);
    expect(sampleTrack(tr, 0.75)).toBeCloseTo(2, 6);
    expect(sampleTrack([[0, 0], [1, 1]], 0.25)).toBeCloseTo(ease('inOut', 0.25), 6);
  });
  it('hält vor dem ersten und nach dem letzten Key', () => {
    expect(sampleTrack([[0.2, 5], [0.8, 7]], 0)).toBe(5);
    expect(sampleTrack(tr, 2)).toBe(3);
    expect(sampleTrack([], 0.5)).toBe(0);
  });
  it('step hält den alten Wert bis zum Key; gleiche Zeiten springen sofort', () => {
    const st: Track = [[0, 0], [0.5, 9, 'step']];
    expect(sampleTrack(st, 0.49)).toBe(0);
    expect(sampleTrack(st, 0.5)).toBe(9);
    expect(sampleTrack([[0, 1], [0.5, 1], [0.5, 4]], 0.5)).toBe(4);
  });
});

describe('sampleClip', () => {
  const clip: Clip = { name: 'x', duration: 2, tracks: { px: [[0, 0], [1, 1, 'linear']] } };
  it('Zeit in Sekunden wird auf die Dauer normiert, Gewicht skaliert additiv', () => {
    const p = emptyPose();
    sampleClip(clip, 1, p, 0.5);
    expect(p.px).toBeCloseTo(0.25, 6);
    sampleClip(clip, 2, p, 1);
    expect(p.px).toBeCloseTo(1.25, 6);
  });
  it('Schleifen-Clips laufen periodisch', () => {
    const loop: Clip = { ...clip, loop: true };
    expect(sampleClip(loop, 2.5, emptyPose()).px).toBeCloseTo(0.25, 6);
  });
});

describe('Clip-Bibliothek', () => {
  it('alle Clips sind gültig (Zeiten 0..1 aufsteigend, Werte endlich, Spurnamen bekannt)', () => {
    for (const c of allClips()) {
      expect(validateClip(c)).toEqual([]);
      for (const name of Object.keys(c.tracks)) expect(TRACKS as readonly string[]).toContain(name);
    }
  });

  it('nicht haltende Clips enden in der Ruhelage (Wurzel, Hände, Teile)', () => {
    for (const c of allClips()) {
      if (c.hold || c.loop || c.name === 'throw') continue;
      const end = sampleClip(c, c.duration, emptyPose());
      for (const k of TRACKS) {
        if (k === 'slide' || k === 'slide2') continue; // Schlitten darf (beim leeren Zyklus) im Applier geklemmt werden
        expect(Math.abs(end[k]), `${c.name}.${k}`).toBeLessThan(1e-6);
      }
    }
  });

  it('Ziehen startet unten (Waffe kommt ins Bild) für jede Familie', () => {
    for (const f of FAMILIES) {
      const p = sampleClip(drawClip(f), 0, emptyPose());
      expect(p.py).toBeLessThan(-0.1);
      expect(drawClip(f).duration).toBeGreaterThan(0.3);
      expect(drawClip(f).duration).toBeLessThan(1.2);
    }
  });

  it('Ziehen mit Spannhebel/Kammer/Pumpe bewegt das jeweilige Teil', () => {
    const maxOf = (c: Clip, k: keyof typeof c.tracks): number => {
      let m = 0;
      for (let i = 0; i <= 200; i++) m = Math.max(m, sampleClip(c, (c.duration * i) / 200, emptyPose())[k]);
      return m;
    };
    expect(maxOf(drawClip('rifle', 'charge'), 'charge')).toBeGreaterThan(0.9);
    expect(maxOf(drawClip('sniper', 'bolt'), 'boltBack')).toBeGreaterThan(0.9);
    expect(maxOf(drawClip('shotgun', 'pump'), 'pump')).toBeGreaterThan(0.9);
  });

  it('Inspizieren dreht die Waffe deutlich und dauert ~2–3 s', () => {
    for (const f of FAMILIES) {
      const c = inspectClip(f);
      expect(c.duration).toBeGreaterThan(1.5);
      expect(c.duration).toBeLessThan(3.5);
      const mid = sampleClip(c, c.duration * 0.3, emptyPose());
      expect(Math.abs(mid.ry) + Math.abs(mid.rz)).toBeGreaterThan(0.4);
    }
  });
});

describe('Nachladen', () => {
  const sampleAt = (c: Clip, u: number): ReturnType<typeof emptyPose> => sampleClip(c, c.duration * u, emptyPose());

  it('Dauer entspricht exakt der echten Nachladezeit', () => {
    for (const s of STYLES) expect(reloadClip(s, { duration: 2.7, empty: false, charge: 'none', shells: 3 })!.duration).toBe(2.7);
    expect(reloadClip('none', { duration: 1, empty: false, charge: 'none' })).toBeNull();
  });

  it('Magazin verlässt den Schacht, Hand bringt das neue, am Ende sitzt es', () => {
    for (const s of ['mag', 'pistol', 'mg'] as const) {
      const c = reloadClip(s, { duration: 3, empty: false, charge: 'charge' })!;
      let maxMag = 0;
      let handOnMagWhileInserting = true;
      for (let i = 0; i <= 400; i++) {
        const p = sampleAt(c, i / 400);
        maxMag = Math.max(maxMag, p.mag);
        // Während das Magazin wieder einfährt (Wert sinkt von 1 auf 0), hält die linke Hand es
        if (i > 200 && p.mag > 0.05 && p.mag < 1) handOnMagWhileInserting &&= p.lhMag > 0.99;
      }
      expect(maxMag, s).toBeGreaterThan(5);
      expect(handOnMagWhileInserting, s).toBe(true);
      const end = sampleAt(c, 1);
      expect(end.mag).toBe(0);
      expect(end.lhMag).toBe(0);
    }
  });

  it('Hand und Magazin wechseln nur außerhalb des Bildes (Schritt-Keys)', () => {
    const c = reloadClip('mag', { duration: 3, empty: false, charge: 'charge' })!;
    // kurz vor dem Sprung: Hand weit unten ohne Magazin; danach: Hand am weit entfernten Magazin
    const before = sampleAt(c, 0.335);
    const after = sampleAt(c, 0.345);
    expect(before.lhY).toBeLessThan(-0.5);
    expect(before.lhMag).toBe(0);
    expect(after.lhMag).toBe(1);
    expect(after.mag).toBeGreaterThan(5);
  });

  it('leer: Gewehre spannen am Ende, Pistolen lassen den Schlitten vorschnellen', () => {
    const rifle = reloadClip('mag', { duration: 3, empty: true, charge: 'charge' })!;
    expect(rifle.tracks.charge).toBeDefined();
    expect(rifle.tracks.lhCharge).toBeDefined();
    const full = reloadClip('mag', { duration: 3, empty: false, charge: 'charge' })!;
    expect(full.tracks.charge).toBeUndefined();
    const pistol = reloadClip('pistol', { duration: 2, empty: true, charge: 'slide' })!;
    expect(sampleAt(pistol, 0.5).slide).toBe(1);
    expect(sampleAt(pistol, 1).slide).toBe(0);
    const bolt = reloadClip('mag', { duration: 3, empty: true, charge: 'bolt' })!;
    expect(bolt.tracks.boltBack).toBeDefined();
  });

  it('Schrot: genau so viele Einschübe wie Patronen, Pumpe nur wenn leer', () => {
    for (const n of [1, 3, 8]) {
      const c = reloadClip('shell', { duration: 3.4, empty: false, charge: 'pump', shells: n })!;
      expect(countPulses(c.tracks.shell!)).toBe(n);
      expect(c.tracks.pump).toBeUndefined();
    }
    const empty = reloadClip('shell', { duration: 3.4, empty: true, charge: 'pump', shells: 4 })!;
    expect(countPulses(empty.tracks.shell!)).toBe(4);
    expect(empty.tracks.pump).toBeDefined();
  });

  it('Doppelpistole: beide Magazine raus und wieder drin', () => {
    const c = reloadClip('dual', { duration: 4.5, empty: true, charge: 'slide' })!;
    expect(sampleAt(c, 0.4).mag).toBeGreaterThan(5);
    expect(sampleAt(c, 0.4).mag2).toBeGreaterThan(5);
    expect(sampleAt(c, 1).mag).toBe(0);
    expect(sampleAt(c, 1).mag2).toBe(0);
    expect(sampleAt(c, 0.5).py).toBeLessThan(-0.2); // Waffen unten aus dem Bild
  });

  it('MG: Deckel auf während des Wechsels, am Ende zu', () => {
    const c = reloadClip('mg', { duration: 5.7, empty: false, charge: 'charge' })!;
    expect(sampleAt(c, 0.5).cover).toBeCloseTo(1, 6);
    expect(sampleAt(c, 1).cover).toBe(0);
  });
});

describe('Repetieren, Pumpe, Zyklus', () => {
  it('Kammer: Hand hin, Stängel hoch, zurück, vor, runter; Dauer folgt cycle', () => {
    const c = boltCycleClip(1.25);
    expect(c.duration).toBe(1.25);
    let maxBack = 0;
    let liftedWhenBack = true;
    for (let i = 0; i <= 200; i++) {
      const p = sampleClip(c, (c.duration * i) / 200, emptyPose());
      maxBack = Math.max(maxBack, p.boltBack);
      if (p.boltBack > 0.01) liftedWhenBack &&= p.bolt > 0.99 && p.rhBolt > 0.99;
    }
    expect(maxBack).toBeCloseTo(1, 2);
    expect(liftedWhenBack).toBe(true);
  });

  it('Pumpe fährt voll zurück und wieder vor', () => {
    const c = pumpClip(0.8);
    expect(sampleClip(c, 0.8 * 0.42, emptyPose()).pump).toBeCloseTo(1, 6);
    expect(sampleClip(c, 0.8, emptyPose()).pump).toBe(0);
  });

  it('Schlitten-Zyklus ist kürzer als der Schussabstand (auch bei hoher Kadenz begrenzt)', () => {
    expect(cycleClip('slide', 60 / 857).duration).toBeLessThanOrEqual(60 / 857);
    expect(cycleClip('slide', 1).duration).toBeLessThanOrEqual(0.11);
    expect(cycleClip('slide', 0.01).duration).toBeGreaterThanOrEqual(0.045);
  });
});

describe('Messer, Granate, C4', () => {
  it('Hieb-Varianten schwingen in entgegengesetzte Richtungen; Stich stößt nach vorn', () => {
    const a = knifeClip(false, 0);
    const b = knifeClip(false, 1);
    const pa = sampleClip(a, a.duration * 0.42, emptyPose());
    const pb = sampleClip(b, b.duration * 0.42, emptyPose());
    expect(Math.sign(pa.px)).toBe(-Math.sign(pb.px));
    const stab = knifeClip(true);
    expect(sampleClip(stab, stab.duration * 0.4, emptyPose()).pz).toBeLessThan(-0.1);
    expect(stab.duration).toBeGreaterThan(a.duration);
  });

  it('Splint ziehen hält die Ausholhaltung; Wurf blendet die Granate aus', () => {
    const pin = pullPinClip();
    expect(pin.hold).toBe(true);
    const held = sampleClip(pin, pin.duration * 5, emptyPose());
    expect(held.pin).toBe(1);
    expect(held.pz).toBeGreaterThan(0.03);
    const th = throwClip();
    expect(sampleClip(th, 0, emptyPose()).pz).toBeCloseTo(held.pz, 6); // nahtloser Übergang
    expect(sampleClip(th, th.duration * 0.3, emptyPose()).itemHide).toBe(0);
    expect(sampleClip(th, th.duration * 0.6, emptyPose()).itemHide).toBe(1);
  });

  it('C4 tippen ist eine Schleife mit mehreren Tastendrücken', () => {
    const c = plantClip();
    expect(c.loop).toBe(true);
    const down: Track = c.tracks.rhY!.map(([t, v, e]) => [t, v < 0 ? 1 : 0, e] as const);
    expect(countPulses(down)).toBeGreaterThanOrEqual(4);
    expect(sampleClip(c, 0.3, emptyPose()).rhKey).toBe(1);
  });
});

describe('ViewAnimator', () => {
  const a: Clip = { name: 'a', duration: 1, tracks: { px: [[0, 1], [1, 1]] } };
  const b: Clip = { name: 'b', duration: 1, tracks: { px: [[0, 3], [1, 3]] } };

  it('blendet beim Wechsel über (Gewichte summieren sich zu 1)', () => {
    const m = new ViewAnimator();
    m.play(a, 0);
    m.tick(0.1);
    expect(m.sample(emptyPose()).px).toBeCloseTo(1, 6);
    m.play(b, 0.2);
    m.tick(0.1);
    const mid = m.sample(emptyPose()).px;
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(3);
    expect(mid).toBeCloseTo(1 * 0.5 + 3 * 0.5, 6);
    m.tick(0.2);
    expect(m.sample(emptyPose()).px).toBeCloseTo(3, 6);
    expect(m.current()).toBe('b');
  });

  it('nicht haltende Clips enden von selbst; haltende bleiben stehen', () => {
    const m = new ViewAnimator();
    m.play(a, 0);
    m.tick(1.01);
    expect(m.current()).toBeNull();
    m.play({ ...a, name: 'h', hold: true }, 0);
    m.tick(5);
    expect(m.current()).toBe('h');
    expect(m.sample(emptyPose()).px).toBeCloseTo(1, 6);
    expect(m.progress()).toBe(1);
  });

  it('Schleifen laufen weiter, stop() blendet aus', () => {
    const m = new ViewAnimator();
    m.play({ ...a, loop: true }, 0);
    m.tick(3.5);
    expect(m.current()).toBe('a');
    expect(m.progress()).toBeCloseTo(0.5, 6);
    m.stop(0.2);
    expect(m.current()).toBeNull();
    m.tick(0.1);
    expect(m.sample(emptyPose()).px).toBeCloseTo(0.5, 6);
    m.tick(0.2);
    expect(m.sample(emptyPose()).px).toBe(0);
  });

  it('Overlays addieren sich zur Aktion und verschwinden nach Ablauf', () => {
    const m = new ViewAnimator();
    m.play(a, 0);
    m.overlay({ name: 'o', duration: 0.5, tracks: { px: [[0, 2], [1, 2]], slide: [[0, 1], [1, 1]] } });
    m.tick(0.1);
    const p = m.sample(emptyPose());
    expect(p.px).toBeCloseTo(3, 6);
    expect(p.slide).toBe(1);
    m.tick(0.5);
    expect(m.sample(emptyPose()).slide).toBe(0);
    expect(m.isPlaying('a')).toBe(true);
    m.clear();
    expect(m.sample(emptyPose()).px).toBe(0);
  });
});

describe('Prozedurale Schichten', () => {
  it('Atmen ist klein und beschränkt', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const b = breathe(t);
      expect(Math.abs(b.py)).toBeLessThanOrEqual(0.0022 + 1e-9);
      expect(Math.abs(b.rx)).toBeLessThan(0.01);
    }
    expect(Math.abs(breathe(3, 0).py)).toBe(0);
  });

  it('Lauf-Bob ist periodisch (2π) und ohne Bewegung null', () => {
    const p = walkBob(1.3, 1);
    const q = walkBob(1.3 + Math.PI * 2, 1);
    expect(q.px).toBeCloseTo(p.px, 9);
    expect(q.py).toBeCloseTo(p.py, 9);
    const z = walkBob(2, 0);
    expect(z.px + z.py + z.rz).toBe(0);
    // Tiefpunkt jedes Schritts: py ≤ 0
    for (let ph = 0; ph < 7; ph += 0.1) expect(walkBob(ph, 1).py).toBeLessThanOrEqual(1e-12);
  });

  it('Bob-Phase/-Stärke folgen dem Tempo', () => {
    expect(advanceViewBob(1, 0.1, 0.1)).toBe(1);
    expect(advanceViewBob(1, 4, 0.1)).toBeGreaterThan(advanceViewBob(1, 2, 0.1));
    expect(viewBobAmount(0.2, 4.2, false)).toBe(0);
    expect(viewBobAmount(4.2, 4.2, false)).toBeCloseTo(1, 6);
    expect(viewBobAmount(6.2, 4.2, false)).toBeGreaterThan(1);
    expect(viewBobAmount(20, 4.2, false)).toBe(1.6);
    expect(viewBobAmount(4.2, 4.2, true)).toBeLessThan(0.5);
  });

  it('Strafen kantet die Waffe gegen die Laufrichtung (rechts → rz > 0) und ist begrenzt', () => {
    expect(strafeLean(5).rz).toBeGreaterThan(0);
    expect(strafeLean(-5).rz).toBeLessThan(0);
    expect(strafeLean(100).rz).toBeCloseTo(strafeLean(5).rz, 9); // begrenzt
    expect(strafeLean(0).rz).toBe(0);
  });

  it('Sprint-Haltung: Gewicht 0 = neutral, 1 = gesenkt (Mündung nach unten)', () => {
    for (const f of FAMILIES) {
      const z = sprintPose(0, f);
      expect(Math.abs(z.px) + Math.abs(z.py) + Math.abs(z.rx)).toBe(0);
      const s = sprintPose(1, f);
      expect(s.rx).toBeLessThan(-0.2);
      expect(s.py).toBeLessThan(0);
      expect(sprintPose(2, f).rx).toBeCloseTo(s.rx, 9); // begrenzt
    }
  });

  it('Feder: konvergiert zum Ziel, schwingt bei Impuls über, stabil bei großem dt', () => {
    const s: Spring = { x: 0, v: 5 };
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      springStep(s, 0, KICK.freq, KICK.zeta, 1 / 60);
      peak = Math.max(peak, s.x);
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(Math.abs(s.x)).toBeLessThan(1e-4);
    const big: Spring = { x: 1, v: 0 };
    for (let i = 0; i < 20; i++) springStep(big, 0, KICK.freq, KICK.zeta, 0.5);
    expect(Number.isFinite(big.x)).toBe(true);
    expect(Math.abs(big.x)).toBeLessThan(1e-3);
  });

  it('Rückstoß-Impuls wächst mit der Stärke, Rolle zufällig symmetrisch', () => {
    const lo = kickImpulse(0.02, 0.5);
    const hi = kickImpulse(0.16, 0.5);
    expect(hi.back).toBeGreaterThan(lo.back);
    expect(hi.rise).toBeGreaterThan(lo.rise);
    expect(lo.roll).toBe(0);
    expect(kickImpulse(0.1, 0).roll).toBeCloseTo(-kickImpulse(0.1, 1).roll, 9);
    expect(kickImpulse(-1).back).toBe(0);
  });
});

describe('Daten', () => {
  it('Skalierung und Ellbogen-Hinweise sind plausibel (Ellbogen unterhalb, rechts rechts / links links)', () => {
    expect(VIEW_SCALE).toBeGreaterThan(0.3);
    expect(VIEW_SCALE).toBeLessThan(1);
    for (const f of FAMILIES) {
      const h = ARM_HINT[f];
      expect(h.right[1]).toBeLessThan(0);
      expect(h.left[1]).toBeLessThan(0);
      expect(h.right[0]).toBeGreaterThan(h.left[0]);
    }
  });

  it('familyOf bildet Waffentypen ab, Unbekanntes → rifle', () => {
    expect(familyOf('pistol')).toBe('pistol');
    expect(familyOf('bomb')).toBe('bomb');
    expect(familyOf('xyz')).toBe('rifle');
  });
});
