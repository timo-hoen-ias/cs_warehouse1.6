import { TBL, makeRig, type Builder, type P2, type Rig } from './builder';
import { C, gripAxis, rect, triggerGroup } from './common';

/**
 * Pistolen (Koordinaten siehe builder.ts): Ursprung = Griffmitte der rechten Hand,
 * Seelenachse ~5–7 cm darüber, Lauf nach vorn (f).
 */

type PistolSpec = {
  /** Griff-Neigung (rad), Griff-Profil, Rahmen, Schlitten [f0, f1, y0, y1], Breiten. */
  rake: number;
  grip: P2[];
  gripColor: number;
  frame: P2[];
  frameColor: number;
  slide: [number, number, number, number];
  slideW: number;
  slideColor: number;
  guard: [number, number, number, number];
  muzzleF: number;
  /** Magazin-Bodenplatte (unter dem Griff). */
  magBase: P2[];
  magColor: number;
  hammer?: boolean;
  travel: number;
};

/** Gemeinsamer Pistolen-Aufbau (Griff, Rahmen, Abzug, Schlitten als Teil, Magazin als Teil). */
function pistolBase(b: Builder, s: PistolSpec, extraSlide?: () => void, dx = 0, suffix: '' | '2' = ''): void {
  const [f0, f1, y0, y1] = s.slide;
  const bore = (y0 + y1) / 2 + 0.002;
  const at = (x: number): number => x + dx;
  b.ext(s.grip, 0.029, s.gripColor, { m: 'poly', x: dx, bevel: 0.003 });
  // Griffschalen-Textur (Riffelung) als flache Felder
  b.ext(s.grip.map(([f, y]) => [f * 0.8 - 0.004, y * 0.82 - 0.008] as const), 0.031, C.rubber, { m: 'poly', x: dx, d: true, bevel: 0.001 });
  b.ext(s.frame, 0.025, s.frameColor, { m: 'poly', x: dx, bevel: 0.002 });
  triggerGroup(b, s.guard[0], s.guard[1], s.guard[2], s.guard[3], s.frameColor, { x: dx });
  // Abzug dunkel, Schlittenfang/Sicherung links
  b.box([0.003, 0.006, 0.02], [at(-0.0135), y0 - 0.004, 0.03], C.black, { d: true });
  if (s.hammer) b.ext([[f0 - 0.012, y0 - 0.002], [f0 + 0.004, y0 - 0.002], [f0 + 0.002, y0 + 0.016], [f0 - 0.012, y0 + 0.012]], 0.009, C.black, { x: dx, bevel: 0.0012 });
  // Laufmündung (feststehend, schaut aus dem Schlitten)
  b.cyl(0.0068, 0.0068, 0.01, [at(0), bore, f1 - 0.002], C.gunLight, { sides: 10 });
  b.cyl(0.0042, 0.0042, 0.003, [at(0), bore, f1 + 0.0035], C.black, { sides: 8, d: true });

  const slideName = suffix ? 'slide2' : 'slide';
  b.part(slideName, [at(0), bore, (f0 + f1) / 2], 'steel', () => {
    b.ext(rect(f0, f1, y0, y1, 0.005), s.slideW, s.slideColor, { x: dx, bevel: 0.0022 });
    // Auswurffenster (rechts oben) + Kimme/Korn
    b.box([0.002, 0.009, 0.03], [at(s.slideW / 2), y1 - 0.007, f0 + (f1 - f0) * 0.55], C.black);
    b.box([0.016, 0.007, 0.007], [at(0), y1 + 0.003, f0 + 0.008], C.black);
    b.box([0.004, 0.006, 0.006], [at(0), y1 + 0.003, f1 - 0.008], C.black);
    b.box([0.0025, 0.0025, 0.0025], [at(0), y1 + 0.006, f1 - 0.008], 0xe8e8e8, { d: true });
    // Griffrillen hinten (beidseitig)
    for (let i = 0; i < 6; i++) {
      for (const sx of [-1, 1]) b.box([0.0012, (y1 - y0) * 0.75, 0.0022], [at(sx * (s.slideW / 2)), (y0 + y1) / 2, f0 + 0.008 + i * 0.0045], C.black, { d: true });
    }
    extraSlide?.();
  });

  const magName = suffix ? 'mag2' : 'mag';
  b.part(magName, [at(0), -0.02, -0.012], 'poly', () => {
    b.ext(s.magBase, 0.027, s.magColor, { x: dx, bevel: 0.0015 });
    // Magazinkörper (steckt im Griff, sichtbar beim Wechsel)
    const top = s.grip[0]![1] - 0.006;
    b.ext([[-0.024, top], [0.01, top], [0.0, s.magBase[0]![1]], [-0.032, s.magBase[0]![1]]], 0.02, C.steel, { x: dx, bevel: 0.001 });
    b.box([0.012, 0.004, 0.012], [at(0), top + 0.002, -0.006], C.brass, { d: true });
  });
  b.anchor(suffix ? 'magHold2' : 'magHold', [at(-0.002), s.magBase[0]![1] - 0.005, -0.018], { axis: gripAxis(s.rake), back: [-1, 0, 0.3], r: 0.014, part: magName });
  b.anchor(suffix ? 'muzzle2' : 'muzzle', TBL);
}

const GRIP_STD: P2[] = [[-0.024, 0.034], [-0.027, 0.012], [-0.031, -0.02], [-0.04, -0.064], [-0.036, -0.074], [0.005, -0.074], [0.011, -0.066], [0.017, -0.03], [0.022, 0.0], [0.026, 0.022]];
const MAG_STD: P2[] = [[-0.039, -0.072], [0.009, -0.072], [0.011, -0.081], [-0.041, -0.081]];

function rigPistol(travel: number): Rig {
  return makeRig('pistol', {
    reload: 'pistol', charge: 'slide', cycle: 'slide', slideLock: true,
    travel: { slide: travel, charge: travel, bolt: 0, boltLift: 0, pump: 0, mag: 0.11, cover: 0, pin: 0 },
    magDir: [0, -0.96, 0.28], magAway: [-0.1, -1, 0.15],
  });
}

function twoHand(b: Builder, rake: number): void {
  b.anchor('gripR', TBL, { axis: gripAxis(rake), back: [1, 0, 0], r: 0.017, trigger: true });
  // Stützhand umfasst die Schusshand (Teetassengriff), Daumen links nach vorn
  b.anchor('gripL', TBL, { axis: gripAxis(rake + 0.1), back: [-1, -0.1, 0.35], r: 0.028 });
}

export function glock(b: Builder): Rig {
  const s: PistolSpec = {
    rake: 0.36,
    grip: GRIP_STD.map(([f, y]) => [f, y] as const),
    gripColor: C.polyGrey,
    frame: [[-0.03, 0.044], [0.13, 0.044], [0.13, 0.027], [0.074, 0.025], [0.028, 0.022], [-0.03, 0.03]],
    frameColor: C.polyGrey,
    slide: [-0.04, 0.147, 0.043, 0.072],
    slideW: 0.0255,
    slideColor: C.gun,
    guard: [0.026, 0.078, 0.024, 0.032],
    muzzleF: 0.15,
    magBase: MAG_STD,
    magColor: C.poly,
    travel: 0.028,
  };
  pistolBase(b, s);
  // Zubehörschiene vorn (Rillen), Glock-typische Fingerrillen
  for (let i = 0; i < 3; i++) b.box([0.026, 0.002, 0.004], [0, 0.03, 0.09 + i * 0.012], C.poly, { d: true });
  for (let i = 0; i < 3; i++) b.box([0.03, 0.006, 0.006], [0, -0.012 - i * 0.017, 0.014 - i * 0.004], C.polyGrey, { m: 'poly', d: true });
  twoHand(b, s.rake);
  return rigPistol(s.travel);
}

export function usp(b: Builder): Rig {
  const s: PistolSpec = {
    rake: 0.3,
    grip: [[-0.025, 0.036], [-0.029, 0.01], [-0.032, -0.025], [-0.039, -0.068], [-0.034, -0.076], [0.006, -0.076], [0.012, -0.068], [0.018, -0.03], [0.022, 0.0], [0.027, 0.022]],
    gripColor: C.poly,
    frame: [[-0.032, 0.046], [0.152, 0.046], [0.152, 0.03], [0.14, 0.026], [0.08, 0.025], [0.03, 0.022], [-0.032, 0.03]],
    frameColor: C.poly,
    slide: [-0.042, 0.168, 0.045, 0.076],
    slideW: 0.0275,
    slideColor: 0x2c2f33,
    guard: [0.028, 0.084, 0.024, 0.034],
    muzzleF: 0.171,
    magBase: MAG_STD,
    magColor: C.poly,
    hammer: true,
    travel: 0.03,
  };
  pistolBase(b, s, () => {
    // USP: abgesetzte Schlittennase
    b.box([0.024, 0.004, 0.03], [0, 0.0745, 0.152], 0x2c2f33);
  });
  // Entspannhebel + Zubehörnut
  b.box([0.004, 0.007, 0.018], [0.015, 0.042, -0.02], C.black, { d: true });
  b.box([0.027, 0.003, 0.05], [0, 0.031, 0.12], C.black, { m: 'poly', d: true });
  twoHand(b, s.rake);
  return rigPistol(s.travel);
}

export function p228(b: Builder): Rig {
  const s: PistolSpec = {
    rake: 0.28,
    grip: [[-0.024, 0.034], [-0.028, 0.012], [-0.03, -0.022], [-0.036, -0.064], [-0.033, -0.071], [0.006, -0.071], [0.011, -0.064], [0.016, -0.03], [0.02, 0.0], [0.025, 0.022]],
    gripColor: C.poly,
    frame: [[-0.03, 0.044], [0.124, 0.044], [0.124, 0.03], [0.09, 0.028], [0.03, 0.022], [-0.03, 0.03]],
    frameColor: C.gun,
    slide: [-0.04, 0.142, 0.043, 0.074],
    slideW: 0.0262,
    slideColor: C.silver,
    guard: [0.026, 0.074, 0.024, 0.03],
    muzzleF: 0.145,
    magBase: [[-0.036, -0.069], [0.008, -0.069], [0.01, -0.077], [-0.038, -0.077]],
    magColor: C.black,
    hammer: true,
    travel: 0.028,
  };
  pistolBase(b, s, () => {
    // abgerundete Schlittenfront (SIG)
    b.box([0.024, 0.012, 0.008], [0, 0.066, 0.143], C.silver, { rot: [0.5, 0, 0] });
  });
  // Entspannhebel links, Griffschalen-Schrauben
  b.box([0.004, 0.006, 0.02], [-0.0145, 0.03, 0.012], C.black, { d: true });
  b.cyl(0.003, 0.003, 0.032, [0, -0.02, -0.01], C.silver, { axis: 'x', sides: 6, d: true });
  twoHand(b, s.rake);
  return rigPistol(s.travel);
}

export function deagle(b: Builder): Rig {
  const rake = 0.3;
  // Großer Griff, kantiger Rahmen
  b.ext([[-0.028, 0.04], [-0.032, 0.012], [-0.036, -0.03], [-0.046, -0.075], [-0.04, -0.086], [0.008, -0.086], [0.014, -0.076], [0.021, -0.032], [0.026, 0.0], [0.031, 0.026]], 0.033, C.poly, { m: 'poly', bevel: 0.003 });
  b.ext([[-0.03, 0.048], [0.19, 0.048], [0.19, 0.032], [0.1, 0.03], [0.034, 0.026], [-0.03, 0.034]], 0.028, C.steel, { bevel: 0.002 });
  triggerGroup(b, 0.031, 0.095, 0.028, 0.036, C.steel);
  b.ext([[-0.048, 0.044], [-0.032, 0.044], [-0.034, 0.064], [-0.05, 0.06]], 0.011, C.gun, { bevel: 0.0015 }); // Hahn
  // Feststehender Lauf mit Dreiecksprofil + Rippe
  const bore = 0.07;
  b.ext([[0.085, 0.05], [0.205, 0.05], [0.207, 0.064], [0.205, 0.092], [0.085, 0.092]], 0.03, C.steel, { bevel: 0.0025 });
  b.ext([[0.085, 0.092], [0.205, 0.092], [0.205, 0.099], [0.085, 0.099]], 0.012, C.steel, { bevel: 0.001 });
  b.cyl(0.0072, 0.0072, 0.004, [0, bore, 0.206], C.black, { sides: 10 });
  b.box([0.004, 0.012, 0.008], [0, 0.104, 0.198], C.black); // Korn
  for (let i = 0; i < 4; i++) b.box([0.031, 0.003, 0.006], [0, 0.06, 0.1 + i * 0.026], C.gun, { d: true });
  b.part('slide', [0, bore, 0.02], 'steel', () => {
    b.ext([[-0.05, 0.047], [0.086, 0.047], [0.086, 0.093], [-0.04, 0.093], [-0.05, 0.085]], 0.032, C.steel, { bevel: 0.0025 });
    b.box([0.018, 0.009, 0.008], [0, 0.097, -0.04], C.black); // Kimme
    b.box([0.002, 0.012, 0.04], [0.016, 0.084, 0.03], C.black); // Auswurf
    for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) b.box([0.0012, 0.032, 0.003], [sx * 0.016, 0.07, -0.044 + i * 0.0055], C.gun, { d: true });
    b.box([0.006, 0.006, 0.016], [-0.017, 0.062, -0.025], C.black, { d: true }); // Sicherung
  });
  b.part('mag', [0, -0.02, -0.015], 'poly', () => {
    b.ext([[-0.047, -0.084], [0.011, -0.084], [0.013, -0.094], [-0.049, -0.094]], 0.031, C.black, { bevel: 0.0015 });
    b.ext([[-0.03, 0.03], [0.014, 0.03], [0.004, -0.084], [-0.04, -0.084]], 0.024, C.steel, { bevel: 0.001 });
    b.box([0.014, 0.006, 0.016], [0, 0.034, -0.008], C.brass, { d: true });
  });
  b.anchor('magHold', [0, -0.098, -0.02], { axis: gripAxis(rake), back: [-1, 0, 0.3], r: 0.015, part: 'mag' });
  b.anchor('muzzle', TBL);
  b.anchor('gripR', TBL, { axis: gripAxis(rake), back: [1, 0, 0], r: 0.019, trigger: true });
  b.anchor('gripL', TBL, { axis: gripAxis(rake + 0.1), back: [-1, -0.1, 0.35], r: 0.031 });
  return rigPistol(0.034);
}

export function fiveseven(b: Builder): Rig {
  const s: PistolSpec = {
    rake: 0.34,
    grip: [[-0.024, 0.034], [-0.027, 0.01], [-0.031, -0.03], [-0.042, -0.08], [-0.037, -0.088], [0.004, -0.088], [0.01, -0.08], [0.017, -0.035], [0.021, 0.0], [0.025, 0.022]],
    gripColor: 0x55594f,
    frame: [[-0.03, 0.044], [0.15, 0.044], [0.154, 0.03], [0.07, 0.026], [0.028, 0.022], [-0.03, 0.03]],
    frameColor: 0x55594f,
    slide: [-0.042, 0.158, 0.044, 0.073],
    slideW: 0.026,
    slideColor: C.black,
    guard: [0.026, 0.088, 0.024, 0.03],
    muzzleF: 0.161,
    magBase: [[-0.041, -0.086], [0.008, -0.086], [0.01, -0.094], [-0.043, -0.094]],
    magColor: C.black,
    travel: 0.028,
  };
  pistolBase(b, s, () => {
    // abgeschrägte Front oben
    b.box([0.0245, 0.012, 0.024], [0, 0.071, 0.146], C.black, { rot: [-0.32, 0, 0] });
  });
  // eckiger Bügel-Haken vorn
  b.box([0.01, 0.012, 0.008], [0, 0.0, 0.089], 0x55594f, { m: 'poly' });
  twoHand(b, s.rake);
  return rigPistol(s.travel);
}

/** Doppel-Beretta: rechte Pistole am Ursprung, linke versetzt (Hände je eine). */
export function elite(b: Builder): Rig {
  const LEFT_X = -0.24;
  const spec = (): PistolSpec => ({
    rake: 0.3,
    grip: [[-0.025, 0.035], [-0.028, 0.012], [-0.031, -0.025], [-0.038, -0.068], [-0.034, -0.076], [0.006, -0.076], [0.012, -0.068], [0.018, -0.03], [0.022, 0.0], [0.026, 0.022]],
    gripColor: C.poly,
    frame: [[-0.03, 0.044], [0.13, 0.044], [0.13, 0.03], [0.08, 0.028], [0.03, 0.022], [-0.03, 0.03]],
    frameColor: C.silver,
    slide: [-0.04, 0.16, 0.044, 0.072],
    slideW: 0.025,
    slideColor: C.chrome,
    guard: [0.026, 0.082, 0.024, 0.032],
    muzzleF: 0.168,
    magBase: MAG_STD,
    magColor: C.black,
    hammer: true,
    travel: 0.03,
  });
  // offener Schlitten (Beretta): Lauf oben sichtbar
  const openTop = (dx: number) => (): void => {
    b.box([0.0262, 0.01, 0.07], [dx, 0.07, 0.08], C.black);
  };
  pistolBase(b, spec(), openTop(0));
  b.cyl(0.0065, 0.0065, 0.08, [0, 0.062, 0.09], C.gun, { sides: 8 });
  pistolBase(b, spec(), openTop(LEFT_X), LEFT_X, '2');
  b.cyl(0.0065, 0.0065, 0.08, [LEFT_X, 0.062, 0.09], C.gun, { sides: 8 });
  b.anchor('gripR', TBL, { axis: gripAxis(0.3), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', TBL, { axis: gripAxis(0.3), back: [-1, 0, 0], r: 0.017, trigger: true });
  return makeRig('pistol', {
    reload: 'dual', charge: 'slide', cycle: 'slide', slideLock: true, dual: true,
    travel: { slide: 0.03, charge: 0.03, bolt: 0, boltLift: 0, pump: 0, mag: 0.11, cover: 0, pin: 0 },
    magDir: [0, -0.96, 0.28], magAway: [0, -1, 0.15],
  });
}
