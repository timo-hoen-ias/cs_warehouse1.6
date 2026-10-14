import { makeRig, type Builder, type Rig } from './builder';
import { C, barrel, curvedMag, foreBack, gripAxis, rail, rect, scope, triggerGroup } from './common';

/** Maschinenpistolen, Scharfschützengewehre, Schrotflinten, MG (Koordinaten siehe builder.ts). */

function grip(b: Builder, color: number, w = 0.03, len = 1): void {
  b.ext([[-0.02, 0.036], [0.028, 0.036], [0.022, 0.0], [0.012, -0.05 * len], [0.004, -0.075 * len], [-0.036, -0.078 * len], [-0.04, -0.07 * len], [-0.03, -0.02]], w, color, { m: 'poly', bevel: 0.003 });
}

const fwdGrip = (back = -0.35): { axis: [number, number, number]; back: [number, number, number] } => ({ axis: [0, 0, 1], back: foreBack(back) as [number, number, number] });

// ------------------------------------------------------------------ SMGs

export function mp5(b: Builder): Rig {
  const bore = 0.08;
  grip(b, C.poly);
  // Griffstück/Abzugsgruppe (Polymer) + Gehäuse (gerundet)
  b.ext([[-0.05, 0.036], [0.1, 0.036], [0.1, 0.05], [-0.05, 0.05]], 0.034, C.poly, { m: 'poly', bevel: 0.003 });
  triggerGroup(b, 0.022, 0.085, 0.036, 0.032, C.poly);
  b.ext([[-0.085, 0.05], [0.18, 0.05], [0.18, 0.1], [0.17, 0.108], [-0.07, 0.108], [-0.085, 0.1]], 0.04, C.gun, { bevel: 0.006 });
  for (let i = 0; i < 2; i++) b.box([0.042, 0.004, 0.18], [0, 0.07 + i * 0.022, 0.04], C.black, { d: true });
  b.box([0.002, 0.014, 0.05], [0.0205, 0.09, 0.07], C.black, { d: true });
  // Spannrohr über dem Lauf, schlanker Handschutz, Korn-Ring, Trommel-Diopter
  b.cyl(0.012, 0.012, 0.16, [0, 0.105, 0.25], C.gun, { sides: 10 });
  b.ext([[0.17, 0.042], [0.31, 0.048], [0.32, 0.06], [0.32, 0.1], [0.17, 0.1]], 0.046, C.poly, { m: 'poly', bevel: 0.008 });
  b.box([0.03, 0.03, 0.02], [0, 0.125, 0.32], C.gun);
  b.torus(0.012, 0.0025, [0, 0.142, 0.32], C.gun, { sides: 12 });
  b.cyl(0.011, 0.011, 0.03, [0, 0.13, -0.055], C.gun, { axis: 'x', sides: 10 });
  b.box([0.02, 0.02, 0.03], [0, 0.112, -0.055], C.gun);
  barrel(b, 0.3, 0.37, 0.0095, bore, C.gun);
  for (let i = 0; i < 3; i++) b.box([0.006, 0.006, 0.012], [0, bore, 0.365], C.gun, { d: true, rot: [0, 0, i * 2.1] });
  // Festschaft (A2)
  b.ext([[-0.08, 0.1], [-0.3, 0.085], [-0.34, 0.09], [-0.345, -0.01], [-0.3, -0.01], [-0.12, 0.045], [-0.08, 0.05]], 0.038, C.poly, { m: 'poly', bevel: 0.005 });
  // Spannhebel vorn links (HK-Schlag)
  b.part('charge', [-0.016, 0.105, 0.29], 'steel', () => {
    b.box([0.006, 0.006, 0.02], [-0.016, 0.105, 0.29], C.gun);
    b.seg([-0.018, 0.105, 0.295], [-0.04, 0.11, 0.3], 0.004, 0.006, C.gun, { sides: 6 });
  });
  b.anchor('chargeL', [-0.05, 0.11, 0.3], { axis: [0, 1, 0], back: [-1, 0, -0.3], r: 0.009, part: 'charge' });
  b.part('mag', [0, 0.04, 0.1], 'steel', () => {
    b.ext(curvedMag(0.068, 0.11, 0.05, 0.2, 0.08), 0.022, C.gunLight, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.07, 0.13], { axis: [0, 0.93, -0.36], back: [-1, 0, 0], r: 0.016, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.375]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.072, 0.25], { ...fwdGrip(), r: 0.023 });
  return makeRig('smg', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.06, bolt: 0, boltLift: 0, pump: 0, mag: 0.05, cover: 0, pin: 0 }, magDir: [0, -0.92, -0.38] });
}

export function p90(b: Builder): Rig {
  const bore = 0.06;
  const body = C.poly;
  // Ein-Stück-Gehäuse mit Daumenloch-Griff und vorderem Griffloch
  b.ext([
    [-0.3, 0.1], [-0.3, -0.04], [-0.26, -0.07], [-0.08, -0.07], [-0.05, -0.08], [0.0, -0.085], [0.03, -0.08], [0.16, -0.06], [0.2, -0.03], [0.21, 0.03],
    [0.2, 0.09], [0.12, 0.105], [-0.25, 0.105],
  ], 0.055, body, {
    m: 'poly', bevel: 0.008,
    holes: [
      [[-0.07, 0.02], [-0.03, 0.03], [-0.034, -0.055], [-0.06, -0.055]],
      [[0.04, 0.02], [0.12, 0.02], [0.15, -0.035], [0.05, -0.06], [0.03, -0.03]],
    ],
  });
  b.ext([[-0.305, 0.1], [-0.29, 0.1], [-0.29, -0.04], [-0.305, -0.04]], 0.056, C.rubber, { m: 'poly', bevel: 0.002 });
  b.ext([[0.055, 0.02], [0.062, 0.02], [0.058, 0.0], [0.05, -0.004]], 0.006, C.black, { m: 'poly' }); // Abzug
  // Reflexvisier oben
  b.ext([[0.0, 0.135], [0.12, 0.135], [0.11, 0.16], [0.02, 0.16]], 0.03, C.polyGrey, { m: 'poly', holes: [[[0.03, 0.14], [0.1, 0.14], [0.095, 0.155], [0.035, 0.155]]], bevel: 0.002 });
  b.box([0.02, 0.004, 0.06], [0, 0.148, 0.06], C.lens, { m: 'glass' });
  barrel(b, 0.2, 0.25, 0.009, bore, C.gun);
  b.cyl(0.011, 0.011, 0.02, [0, bore, 0.255], C.gun, { sides: 8 });
  b.part('charge', [-0.03, 0.065, 0.16], 'steel', () => {
    b.box([0.008, 0.01, 0.02], [-0.03, 0.065, 0.16], C.gun);
  });
  b.anchor('chargeL', [-0.045, 0.06, 0.165], { axis: [0, 1, 0], back: [-1, 0, 0], r: 0.008, part: 'charge' });
  // Magazin oben (durchscheinend)
  b.part('mag', [0, 0.12, -0.05], 'poly', () => {
    b.ext([[-0.25, 0.105], [0.12, 0.105], [0.125, 0.125], [0.11, 0.135], [-0.24, 0.135]], 0.05, 0x6b5a3a, { bevel: 0.004 });
    b.box([0.051, 0.006, 0.3], [0, 0.125, -0.07], 0x8a7a50, { d: true });
  });
  b.anchor('magHold', [0, 0.14, -0.02], { axis: [0, 0, 1], back: [0, 1, 0], r: 0.016, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.27]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.15), back: [1, 0, 0], r: 0.016, trigger: true });
  b.anchor('gripL', [0, -0.02, 0.16], { axis: gripAxis(0.5), back: [-1, 0, 0.3], r: 0.017 });
  return makeRig('smg', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.05, bolt: 0, boltLift: 0, pump: 0, mag: 0.05, cover: 0, pin: 0 }, magDir: [0, 1, 0.15], magAway: [-0.5, -1, 0] });
}

export function ump45(b: Builder): Rig {
  const bore = 0.075;
  const body = 0x2a2c2f;
  grip(b, body);
  b.ext([[-0.065, 0.034], [0.06, 0.034], [0.07, 0.0], [0.14, 0.0], [0.15, 0.034], [0.3, 0.034], [0.31, 0.05], [0.31, 0.112], [-0.065, 0.112]], 0.05, body, { m: 'poly', bevel: 0.005 });
  triggerGroup(b, 0.02, 0.09, 0.034, 0.034, body, { width: 0.014 });
  rail(b, -0.05, 0.28, 0.118, C.gun);
  rail(b, 0.2, 0.3, 0.07, C.gun, { side: true, x: 0.027, w: 0.02 });
  for (let i = 0; i < 4; i++) b.box([0.052, 0.006, 0.012], [0, 0.05, 0.2 + i * 0.025], C.black, { m: 'poly', d: true });
  // Kimme/Korn auf der Schiene
  b.box([0.016, 0.018, 0.012], [0, 0.13, -0.035], C.gun);
  b.box([0.016, 0.02, 0.01], [0, 0.13, 0.27], C.gun);
  // Seitenklappschaft (Skelett)
  b.ext([[-0.06, 0.1], [-0.3, 0.095], [-0.33, 0.08], [-0.33, -0.02], [-0.29, -0.02], [-0.06, 0.04]], 0.022, body, { m: 'poly', holes: [[[-0.09, 0.08], [-0.3, 0.077], [-0.3, 0.005], [-0.09, 0.05]]], bevel: 0.003 });
  barrel(b, 0.31, 0.36, 0.011, bore, C.gun);
  b.part('charge', [-0.028, 0.095, 0.24], 'steel', () => {
    b.box([0.006, 0.01, 0.018], [-0.028, 0.095, 0.24], C.gun);
    b.box([0.012, 0.012, 0.012], [-0.036, 0.095, 0.245], C.gun);
  });
  b.anchor('chargeL', [-0.05, 0.095, 0.25], { axis: [0, 1, 0], back: [-1, 0, -0.3], r: 0.008, part: 'charge' });
  b.part('mag', [0, 0.02, 0.105], 'poly', () => {
    b.ext(curvedMag(0.07, 0.14, 0.03, 0.18, 0.025), 0.03, C.poly, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.08, 0.12], { axis: [0, 0.98, -0.2], back: [-1, 0, 0], r: 0.019, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.365]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.06, 0.24], { ...fwdGrip(), r: 0.03 });
  return makeRig('smg', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.06, bolt: 0, boltLift: 0, pump: 0, mag: 0.05, cover: 0, pin: 0 }, magDir: [0, -0.98, -0.18] });
}

export function tmp(b: Builder): Rig {
  const bore = 0.07;
  const body = 0x27292c;
  // Griff (Magazin steckt darin)
  b.ext([[-0.022, 0.036], [0.026, 0.036], [0.02, 0.0], [0.012, -0.06], [0.006, -0.085], [-0.034, -0.088], [-0.038, -0.078], [-0.03, -0.02]], 0.032, body, { m: 'poly', bevel: 0.003 });
  b.ext(rect(-0.08, 0.15, 0.034, 0.108, 0.008), 0.048, body, { m: 'poly', bevel: 0.006 });
  triggerGroup(b, 0.022, 0.085, 0.034, 0.03, body, { width: 0.014 });
  // Vordergriff (senkrecht)
  b.ext([[0.11, 0.036], [0.15, 0.036], [0.148, -0.03], [0.142, -0.07], [0.118, -0.07], [0.112, -0.03]], 0.03, body, { m: 'poly', bevel: 0.004 });
  for (let i = 0; i < 3; i++) b.box([0.032, 0.004, 0.008], [0, -0.01 - i * 0.02, 0.112], C.black, { m: 'poly', d: true });
  // Visier, Lauf, Mündung
  b.box([0.03, 0.02, 0.02], [0, 0.12, -0.06], body, { m: 'poly' });
  b.box([0.01, 0.02, 0.008], [0, 0.12, 0.14], body, { m: 'poly' });
  barrel(b, 0.15, 0.2, 0.009, bore, C.gun);
  b.cyl(0.0115, 0.0115, 0.018, [0, bore, 0.2], C.gun, { sides: 8 });
  b.part('charge', [0, 0.112, -0.082], 'steel', () => {
    b.box([0.03, 0.009, 0.012], [0, 0.112, -0.088], C.gun);
  });
  b.anchor('chargeL', [-0.01, 0.115, -0.095], { axis: [1, 0, 0], back: [0, 0.6, -0.8], r: 0.008, part: 'charge' });
  b.part('mag', [0, -0.02, -0.012], 'poly', () => {
    b.ext([[-0.034, -0.086], [0.006, -0.086], [0.008, -0.12], [-0.036, -0.12]], 0.026, C.poly, { bevel: 0.0015 });
    b.ext([[-0.024, 0.03], [0.012, 0.03], [0.004, -0.086], [-0.03, -0.086]], 0.022, C.steel, { bevel: 0.001 });
  });
  b.anchor('magHold', [0, -0.11, -0.015], { axis: gripAxis(0.3), back: [-1, 0, 0.3], r: 0.015, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.21]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.3), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, -0.025, 0.13], { axis: gripAxis(0.12), back: [-1, 0, 0.2], r: 0.017 });
  return makeRig('smg', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.05, bolt: 0, boltLift: 0, pump: 0, mag: 0.1, cover: 0, pin: 0 }, magDir: [0, -0.96, 0.28], magAway: [-0.1, -1, 0.1] });
}

export function mac10(b: Builder): Rig {
  const bore = 0.075;
  const body = C.gun;
  b.ext([[-0.02, 0.036], [0.024, 0.036], [0.02, 0.0], [0.014, -0.06], [0.01, -0.09], [-0.03, -0.092], [-0.034, -0.08], [-0.026, -0.02]], 0.034, C.poly, { m: 'poly', bevel: 0.003 });
  // Kastengehäuse (Stahl)
  b.ext(rect(-0.1, 0.17, 0.034, 0.112, 0.004), 0.05, body, { bevel: 0.003 });
  b.ext(rect(-0.06, 0.13, 0.112, 0.118, 0.002), 0.03, body, { bevel: 0.001 });
  triggerGroup(b, 0.022, 0.085, 0.034, 0.03, body, { width: 0.012 });
  b.box([0.002, 0.03, 0.12], [0.026, 0.07, 0.03], C.black, { d: true });
  // Kimme/Korn-Bügel, Gewindelauf, Riemenbügel vorn, Drahtschaft
  b.ext([[-0.095, 0.112], [-0.075, 0.112], [-0.08, 0.13], [-0.095, 0.13]], 0.03, body, { bevel: 0.001 });
  b.ext([[0.15, 0.112], [0.168, 0.112], [0.168, 0.128], [0.155, 0.128]], 0.03, body, { bevel: 0.001 });
  barrel(b, 0.17, 0.235, 0.0105, bore, C.gun);
  for (let i = 0; i < 5; i++) b.cyl(0.0115, 0.0115, 0.003, [0, bore, 0.19 + i * 0.009], C.gun, { sides: 8, d: true });
  b.torus(0.018, 0.0025, [0, 0.03, 0.16], C.steel, { rot: [0, Math.PI / 2, 0], arc: Math.PI, sides: 8, d: true });
  b.seg([0.02, 0.06, -0.1], [0.02, 0.06, -0.24], 0.004, 0.004, C.steel, { sides: 5, d: true });
  b.seg([-0.02, 0.06, -0.1], [-0.02, 0.06, -0.24], 0.004, 0.004, C.steel, { sides: 5, d: true });
  b.box([0.05, 0.03, 0.008], [0, 0.05, -0.245], C.steel, { d: true });
  b.part('charge', [0, 0.12, 0.08], 'steel', () => {
    b.cyl(0.006, 0.006, 0.016, [0, 0.126, 0.08], C.steel, { axis: 'y', sides: 8 });
    b.cyl(0.008, 0.008, 0.008, [0, 0.136, 0.08], C.steel, { axis: 'y', sides: 8 });
  });
  b.anchor('chargeL', [0, 0.15, 0.08], { axis: [0, 0, 1], back: [0, 1, 0], r: 0.008, part: 'charge' });
  b.part('mag', [0, -0.02, -0.01], 'steel', () => {
    b.ext([[-0.03, -0.09], [0.01, -0.09], [0.01, -0.13], [-0.03, -0.13]], 0.026, C.gunLight, { bevel: 0.0015 });
    b.ext([[-0.022, 0.03], [0.016, 0.03], [0.01, -0.09], [-0.026, -0.09]], 0.024, C.steel, { bevel: 0.001 });
  });
  b.anchor('magHold', [0, -0.12, -0.01], { axis: gripAxis(0.15), back: [-1, 0, 0.3], r: 0.015, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.24]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.18), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.07, 0.14], { ...fwdGrip(-0.2), r: 0.032 });
  return makeRig('smg', { reload: 'mag', charge: 'charge', cycle: 'charge', travel: { slide: 0, charge: 0.07, bolt: 0, boltLift: 0, pump: 0, mag: 0.1, cover: 0, pin: 0 }, magDir: [0, -0.99, 0.16], magAway: [-0.1, -1, 0.1] });
}

// ------------------------------------------------------------------ Scharfschützen

type BoltSpec = { stock: number; metal: number; barrelEnd: number; barrelR: number; scopeR: number; scopeObj: number; scopeF: [number, number]; scopeY: number; brake: boolean };

function boltRifle(b: Builder, s: BoltSpec): void {
  const bore = 0.09;
  // Lauf + Mündungsbremse
  b.cyl(s.barrelR * 0.85, s.barrelR, s.barrelEnd - 0.2, [0, bore, (0.2 + s.barrelEnd) / 2], s.metal, { sides: 10 });
  if (s.brake) {
    b.cyl(0.017, 0.017, 0.07, [0, bore, s.barrelEnd + 0.03], s.metal, { sides: 10 });
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) b.box([0.004, 0.022, 0.008], [sx * 0.016, bore, s.barrelEnd + 0.01 + i * 0.018], C.black, { d: true });
  } else {
    b.cyl(s.barrelR * 0.95, s.barrelR * 0.95, 0.02, [0, bore, s.barrelEnd + 0.01], s.metal, { sides: 10 });
  }
  // Gehäuse
  b.ext(rect(-0.09, 0.2, 0.07, 0.11, 0.006), 0.036, s.metal, { bevel: 0.003 });
  b.box([0.002, 0.016, 0.06], [0.0185, 0.1, 0.02], C.black, { d: true });
  scope(b, s.scopeF[0], s.scopeF[1], s.scopeY, s.scopeR, s.scopeObj, s.scopeR * 1.3, C.black, { mounts: [s.scopeF[0] + 0.07, s.scopeF[1] - 0.09], mountY: 0.11 });
  triggerGroup(b, 0.022, 0.085, 0.04, 0.032, s.metal);
  // Kammerstängel rechts (Teil): Drehpunkt auf der Seelenachse
  b.part('bolt', [0, bore, -0.03], 'steel', () => {
    b.cyl(0.0105, 0.0105, 0.14, [0, bore, -0.04], C.steel, { sides: 10 });
    b.seg([0.012, bore, -0.04], [0.048, bore - 0.03, -0.045], 0.0045, 0.004, C.steel, { sides: 6 });
    b.sphere(0.0105, [0.052, bore - 0.034, -0.046], C.black, { sides: 10 });
  });
  b.anchor('boltR', [0.062, bore - 0.046, -0.05], { axis: [0, 0.5, 1], back: [1, -0.3, 0], r: 0.009, part: 'bolt' });
  b.part('mag', [0, 0.05, 0.11], 'steel', () => {
    b.ext(rect(0.08, 0.15, 0.0, 0.07, 0.003), 0.03, C.black, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, 0.0, 0.115], { axis: [0, 0, 1], back: [-0.5, -0.86, 0], r: 0.018, part: 'mag' });
  b.anchor('muzzle', [0, bore, s.barrelEnd + (s.brake ? 0.065 : 0.02)]);
}

export function awp(b: Builder): Rig {
  const stock = C.od;
  boltRifle(b, { stock, metal: C.gun, barrelEnd: 0.88, barrelR: 0.014, scopeR: 0.017, scopeObj: 0.031, scopeF: [-0.07, 0.31], scopeY: 0.165, brake: true });
  // Chassis mit Daumenloch-Schaft (grün)
  b.ext([
    [0.46, 0.07], [0.46, 0.035], [0.44, 0.02], [0.12, 0.02], [0.08, 0.03], [0.03, 0.036], [0.022, 0.0], [0.012, -0.05], [0.004, -0.075], [-0.036, -0.078],
    [-0.08, -0.04], [-0.2, -0.045], [-0.38, -0.085], [-0.47, -0.09], [-0.47, 0.105], [-0.2, 0.105], [-0.12, 0.072], [-0.09, 0.07],
  ], 0.05, stock, { m: 'poly', bevel: 0.006, holes: [[[-0.115, 0.05], [-0.045, 0.045], [-0.04, -0.03], [-0.07, -0.025], [-0.11, 0.0]]] });
  b.ext([[-0.485, 0.1], [-0.468, 0.1], [-0.468, -0.09], [-0.485, -0.09]], 0.052, C.rubber, { m: 'poly', bevel: 0.002 });
  b.ext([[-0.42, 0.105], [-0.22, 0.105], [-0.22, 0.13], [-0.4, 0.13]], 0.034, stock, { m: 'poly', bevel: 0.004 }); // Wangenauflage
  b.seg([0, -0.05, -0.4], [0, -0.1, -0.41], 0.006, 0.006, C.gun, { sides: 6, d: true }); // Monopod
  for (let i = 0; i < 4; i++) b.box([0.052, 0.005, 0.02], [0, 0.04, 0.2 + i * 0.06], C.black, { m: 'poly', d: true });
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.3), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.045, 0.34], { ...fwdGrip(), r: 0.028 });
  return makeRig('sniper', { reload: 'mag', charge: 'bolt', cycle: 'none', boltAction: true, travel: { slide: 0, charge: 0, bolt: 0.095, boltLift: 1.05, pump: 0, mag: 0.05, cover: 0, pin: 0 } });
}

export function scout(b: Builder): Rig {
  const stock = 0x2b2d30;
  boltRifle(b, { stock, metal: C.gun, barrelEnd: 0.72, barrelR: 0.0105, scopeR: 0.014, scopeObj: 0.022, scopeF: [-0.04, 0.24], scopeY: 0.15, brake: false });
  b.ext([
    [0.42, 0.075], [0.42, 0.05], [0.4, 0.04], [0.1, 0.04], [0.03, 0.036], [0.022, 0.0], [0.012, -0.05], [0.004, -0.075], [-0.036, -0.078],
    [-0.04, -0.06], [-0.1, -0.02], [-0.38, -0.06], [-0.42, -0.065], [-0.42, 0.095], [-0.2, 0.095], [-0.1, 0.075],
  ], 0.042, stock, { m: 'poly', bevel: 0.005 });
  b.ext([[-0.435, 0.095], [-0.418, 0.095], [-0.418, -0.068], [-0.435, -0.068]], 0.044, C.rubber, { m: 'poly', bevel: 0.002 });
  // integriertes Zweibein (eingeklappt) unter dem Vorderschaft
  b.box([0.038, 0.012, 0.16], [0, 0.034, 0.3], C.polyGrey, { m: 'poly' });
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.3), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.06, 0.3], { ...fwdGrip(), r: 0.022 });
  return makeRig('sniper', { reload: 'mag', charge: 'bolt', cycle: 'none', boltAction: true, travel: { slide: 0, charge: 0, bolt: 0.085, boltLift: 1.05, pump: 0, mag: 0.05, cover: 0, pin: 0 } });
}

export function g3sg1(b: Builder): Rig {
  const bore = 0.085;
  const metal = C.gun;
  grip(b, C.poly);
  b.ext([[-0.05, 0.036], [0.1, 0.036], [0.1, 0.05], [-0.05, 0.05]], 0.034, C.poly, { m: 'poly', bevel: 0.003 });
  triggerGroup(b, 0.022, 0.085, 0.036, 0.032, C.poly);
  // langes Blechgehäuse mit Sicken, Spannrohr bis vorn
  b.ext([[-0.1, 0.05], [0.3, 0.05], [0.3, 0.11], [0.29, 0.118], [-0.09, 0.118], [-0.1, 0.11]], 0.042, metal, { bevel: 0.006 });
  for (let i = 0; i < 2; i++) b.box([0.044, 0.004, 0.36], [0, 0.07 + i * 0.025, 0.1], C.black, { d: true });
  b.cyl(0.012, 0.012, 0.22, [0, 0.112, 0.4], metal, { sides: 10 });
  b.ext([[0.29, 0.05], [0.5, 0.055], [0.51, 0.065], [0.51, 0.1], [0.29, 0.1]], 0.048, C.poly, { m: 'poly', bevel: 0.006 });
  for (let i = 0; i < 5; i++) b.box([0.05, 0.008, 0.01], [0, 0.072, 0.31 + i * 0.04], C.black, { m: 'poly', d: true });
  barrel(b, 0.5, 0.78, 0.011, bore, metal);
  b.cyl(0.0135, 0.0135, 0.05, [0, bore, 0.8], metal, { sides: 8 });
  // Schaft mit Wangenauflage
  b.ext([[-0.1, 0.11], [-0.42, 0.1], [-0.44, 0.09], [-0.44, -0.04], [-0.38, -0.04], [-0.14, 0.04], [-0.1, 0.05]], 0.04, C.poly, { m: 'poly', bevel: 0.005 });
  b.ext([[-0.36, 0.1], [-0.18, 0.105], [-0.18, 0.125], [-0.34, 0.125]], 0.03, C.poly, { m: 'poly', bevel: 0.004 });
  scope(b, -0.05, 0.24, 0.17, 0.016, 0.026, 0.021, C.black, { mounts: [0.0, 0.17], mountY: 0.118 });
  b.part('charge', [-0.016, 0.112, 0.47], 'steel', () => {
    b.box([0.006, 0.006, 0.02], [-0.016, 0.112, 0.47], metal);
    b.seg([-0.018, 0.112, 0.475], [-0.04, 0.118, 0.48], 0.004, 0.006, metal, { sides: 6 });
  });
  b.anchor('chargeL', [-0.05, 0.118, 0.48], { axis: [0, 1, 0], back: [-1, 0, -0.3], r: 0.009, part: 'charge' });
  b.part('mag', [0, 0.04, 0.12], 'steel', () => {
    b.ext(curvedMag(0.085, 0.14, 0.05, 0.16, 0.015), 0.026, C.gunLight, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.05, 0.125], { axis: [0, 1, -0.1], back: [-1, 0, 0], r: 0.018, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.83]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.075, 0.4], { ...fwdGrip(), r: 0.025 });
  return makeRig('sniper', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.06, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -1, -0.08] });
}

export function sg550(b: Builder): Rig {
  const bore = 0.084;
  const furn = C.olive;
  grip(b, furn);
  b.ext([[-0.07, 0.034], [0.09, 0.034], [0.09, 0.026], [0.16, 0.026], [0.16, 0.034], [0.25, 0.034], [0.26, 0.05], [0.26, 0.105], [-0.07, 0.105]], 0.044, C.gun, { bevel: 0.003 });
  triggerGroup(b, 0.022, 0.085, 0.034, 0.03, C.gun);
  rail(b, -0.05, 0.22, 0.11, C.gun);
  // Skelettschaft mit Wangenauflage
  b.ext([[-0.07, 0.1], [-0.4, 0.095], [-0.42, 0.08], [-0.42, -0.04], [-0.37, -0.04], [-0.07, 0.035]], 0.026, furn, { m: 'poly', holes: [[[-0.11, 0.075], [-0.38, 0.072], [-0.38, -0.01], [-0.11, 0.05]]], bevel: 0.003 });
  b.ext([[-0.37, 0.095], [-0.17, 0.1], [-0.17, 0.122], [-0.35, 0.12]], 0.03, furn, { m: 'poly', bevel: 0.004 });
  // Handschutz + Zweibein, langer Lauf
  b.ext([[0.26, 0.045], [0.5, 0.05], [0.51, 0.06], [0.51, 0.105], [0.26, 0.105]], 0.05, furn, { m: 'poly', bevel: 0.006 });
  for (let i = 0; i < 5; i++) b.box([0.052, 0.008, 0.012], [0, 0.08, 0.29 + i * 0.04], C.black, { m: 'poly', d: true });
  b.seg([0.014, 0.05, 0.56], [0.016, 0.045, 0.3], 0.0045, 0.0045, C.gun, { sides: 5 });
  b.seg([-0.014, 0.05, 0.56], [-0.016, 0.045, 0.3], 0.0045, 0.0045, C.gun, { sides: 5 });
  b.cyl(0.008, 0.008, 0.1, [0, 0.112, 0.55], C.gun, { sides: 8 });
  barrel(b, 0.5, 0.86, 0.0105, bore, C.gun);
  b.cyl(0.013, 0.013, 0.05, [0, bore, 0.88], C.gun, { sides: 8 });
  scope(b, -0.06, 0.26, 0.165, 0.017, 0.028, 0.022, C.black, { mounts: [0.0, 0.18], mountY: 0.11 });
  b.part('slide', [0.026, 0.09, 0.16], 'steel', () => {
    b.box([0.004, 0.012, 0.08], [0.024, 0.09, 0.14], C.steel);
    b.cyl(0.006, 0.006, 0.02, [0.034, 0.09, 0.175], C.steel, { axis: 'x', sides: 8 });
  });
  b.anchor('chargeL', [0.048, 0.085, 0.175], { axis: [0, 0, -1], back: [0.2, -1, 0], r: 0.008, part: 'slide' });
  b.part('mag', [0, 0.03, 0.125], 'poly', () => {
    b.ext(curvedMag(0.095, 0.157, 0.04, 0.2, 0.06), 0.026, C.amber, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.085, 0.16], { axis: [0, 0.95, -0.3], back: [-1, 0, 0], r: 0.018, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.905]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.075, 0.38], { ...fwdGrip(), r: 0.025 });
  return makeRig('sniper', { reload: 'mag', charge: 'slide', cycle: 'slide', travel: { slide: 0.07, charge: 0.07, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -0.95, -0.3] });
}

// ------------------------------------------------------------------ Schrot

/** Patrone (Teil `shell`), wird vom ViewModel an die linke Hand gehängt. */
function shell(b: Builder): void {
  b.part('shell', [0, 0, 0], 'poly', () => {
    b.cyl(0.0098, 0.0098, 0.05, [0, 0, 0.008], C.red, { sides: 8 });
    b.cyl(0.0102, 0.0102, 0.016, [0, 0, -0.025], C.brass, { sides: 8 });
  });
}

function shotgunBase(b: Builder, receiverF: number): number {
  const bore = 0.088;
  b.ext([[-0.06, 0.04], [receiverF, 0.04], [receiverF, 0.11], [receiverF - 0.01, 0.116], [-0.05, 0.116], [-0.06, 0.108]], 0.04, C.gun, { bevel: 0.006 });
  b.box([0.002, 0.02, 0.06], [0.0205, 0.09, 0.06], C.black, { d: true });
  b.box([0.024, 0.004, 0.08], [0, 0.04, 0.09], C.black); // Ladeöffnung unten
  triggerGroup(b, 0.012, 0.075, 0.04, 0.032, C.gun);
  barrel(b, receiverF, 0.68, 0.0115, bore, C.gun, 0, 12);
  barrel(b, receiverF, 0.62, 0.0125, 0.055, C.gun, 0, 10); // Röhrenmagazin
  b.box([0.014, 0.02, 0.012], [0, 0.066, 0.6], C.gun); // Laufschelle
  b.box([0.004, 0.012, 0.008], [0, 0.104, 0.665], C.gun); // Korn
  return bore;
}

export function m3(b: Builder): Rig {
  const bore = shotgunBase(b, 0.17);
  grip(b, C.poly, 0.032);
  // Ghost-Ring hinten, Schaft
  b.box([0.026, 0.02, 0.016], [0, 0.124, 0.0], C.gun);
  b.torus(0.007, 0.002, [0, 0.135, 0.0], C.gun, { sides: 10, d: true });
  b.ext([[-0.06, 0.108], [-0.38, 0.085], [-0.4, 0.08], [-0.4, -0.06], [-0.34, -0.055], [-0.1, 0.03], [-0.06, 0.04]], 0.042, C.poly, { m: 'poly', bevel: 0.005 });
  b.ext([[-0.413, 0.083], [-0.398, 0.083], [-0.398, -0.062], [-0.413, -0.062]], 0.044, C.rubber, { m: 'poly', bevel: 0.002 });
  // Pumpe (Teil, gerillt), linke Hand hängt daran
  b.part('pump', [0, 0.065, 0.36], 'poly', () => {
    b.ext([[0.25, 0.034], [0.47, 0.034], [0.475, 0.044], [0.475, 0.088], [0.25, 0.088], [0.245, 0.078], [0.245, 0.044]], 0.054, C.poly, { bevel: 0.007 });
    for (let i = 0; i < 7; i++) b.box([0.056, 0.004, 0.006], [0, 0.05, 0.27 + i * 0.03], C.black, { d: true });
  });
  b.anchor('gripL', [0, 0.062, 0.36], { ...fwdGrip(), r: 0.027, part: 'pump' });
  b.anchor('port', [0, 0.036, 0.09], { axis: [0, 0, 1], back: [0.3, -1, 0], r: 0.011 });
  shell(b);
  b.anchor('muzzle', [0, bore, 0.685]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.018, trigger: true });
  return makeRig('shotgun', { reload: 'shell', charge: 'pump', cycle: 'none', pumpAction: true, travel: { slide: 0, charge: 0, bolt: 0, boltLift: 0, pump: 0.085, mag: 0, cover: 0, pin: 0 } });
}

export function xm1014(b: Builder): Rig {
  const bore = shotgunBase(b, 0.17);
  grip(b, C.poly, 0.032);
  rail(b, -0.05, 0.15, 0.122, C.gun);
  b.box([0.024, 0.022, 0.016], [0, 0.135, -0.02], C.gun);
  b.torus(0.007, 0.002, [0, 0.148, -0.02], C.gun, { sides: 10, d: true });
  // Teleskopschaft (Puffer-Rohr + Kolben)
  b.cyl(0.016, 0.016, 0.24, [0, 0.085, -0.18], C.gun, { sides: 10 });
  b.ext([[-0.2, 0.115], [-0.34, 0.112], [-0.37, 0.11], [-0.37, 0.02], [-0.34, 0.02], [-0.26, 0.055], [-0.2, 0.06]], 0.038, C.poly, { m: 'poly', bevel: 0.004 });
  // fester Vorderschaft
  b.ext([[0.2, 0.034], [0.42, 0.034], [0.425, 0.044], [0.425, 0.085], [0.2, 0.085]], 0.052, C.poly, { m: 'poly', bevel: 0.007 });
  for (let i = 0; i < 4; i++) b.box([0.054, 0.004, 0.01], [0, 0.07, 0.24 + i * 0.045], C.black, { m: 'poly', d: true });
  b.part('charge', [0.026, 0.075, 0.08], 'steel', () => {
    b.box([0.004, 0.012, 0.03], [0.022, 0.075, 0.08], C.steel);
    b.cyl(0.006, 0.006, 0.02, [0.03, 0.075, 0.09], C.steel, { axis: 'x', sides: 8 });
  });
  b.anchor('chargeL', [0.045, 0.07, 0.095], { axis: [0, 0, -1], back: [0.2, -1, 0], r: 0.008, part: 'charge' });
  b.anchor('gripL', [0, 0.06, 0.32], { ...fwdGrip(), r: 0.027 });
  b.anchor('port', [0, 0.036, 0.09], { axis: [0, 0, 1], back: [0.3, -1, 0], r: 0.011 });
  shell(b);
  b.anchor('muzzle', [0, bore, 0.685]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.018, trigger: true });
  return makeRig('shotgun', { reload: 'shell', charge: 'charge', cycle: 'charge', travel: { slide: 0, charge: 0.06, bolt: 0, boltLift: 0, pump: 0, mag: 0, cover: 0, pin: 0 } });
}

// ------------------------------------------------------------------ MG

export function m249(b: Builder): Rig {
  const bore = 0.095;
  grip(b, C.poly);
  b.ext(rect(-0.11, 0.24, 0.03, 0.12, 0.006), 0.062, C.gun, { bevel: 0.004 });
  triggerGroup(b, 0.022, 0.085, 0.03, 0.03, C.gun);
  // Schaft (massiv), Handschutz unten, Hitzeschild, Gasrohr, Lauf, Zweibein, Tragegriff
  b.ext([[-0.11, 0.11], [-0.42, 0.09], [-0.44, 0.08], [-0.44, -0.05], [-0.38, -0.05], [-0.15, 0.03], [-0.11, 0.035]], 0.044, C.poly, { m: 'poly', bevel: 0.005 });
  b.ext([[0.2, 0.012], [0.35, 0.018], [0.36, 0.03], [0.36, 0.06], [0.2, 0.06]], 0.058, C.poly, { m: 'poly', bevel: 0.006 });
  b.ext([[0.24, 0.1], [0.46, 0.1], [0.46, 0.128], [0.24, 0.128]], 0.04, C.gun, { bevel: 0.003 });
  for (let i = 0; i < 5; i++) b.box([0.042, 0.006, 0.012], [0, 0.124, 0.27 + i * 0.04], C.black, { d: true });
  b.cyl(0.011, 0.011, 0.38, [0, 0.05, 0.45], C.gun, { sides: 8 });
  barrel(b, 0.24, 0.8, 0.0125, bore, C.gun, 0, 12);
  b.cyl(0.015, 0.014, 0.06, [0, bore, 0.82], C.gun, { sides: 10 });
  b.seg([0.016, 0.04, 0.62], [0.018, 0.035, 0.32], 0.005, 0.005, C.gun, { sides: 5 });
  b.seg([-0.016, 0.04, 0.62], [-0.018, 0.035, 0.32], 0.005, 0.005, C.gun, { sides: 5 });
  b.box([0.03, 0.03, 0.03], [0, 0.04, 0.63], C.gun);
  b.ext([[0.36, 0.13], [0.38, 0.13], [0.39, 0.165], [0.45, 0.165], [0.46, 0.13], [0.48, 0.13], [0.46, 0.175], [0.38, 0.175]], 0.016, C.poly, { m: 'poly', bevel: 0.002 });
  b.box([0.006, 0.02, 0.008], [0, 0.125, 0.79], C.gun); // Korn
  b.box([0.002, 0.03, 0.08], [0.0315, 0.075, 0.08], C.black, { d: true });
  // Deckel (Teil, Scharnier hinten) mit Kimme
  b.part('cover', [0, 0.125, -0.05], 'steel', () => {
    b.ext([[-0.05, 0.12], [0.2, 0.12], [0.2, 0.135], [0.18, 0.142], [-0.04, 0.142], [-0.05, 0.135]], 0.058, C.gunLight, { bevel: 0.003 });
    b.box([0.02, 0.016, 0.012], [0, 0.15, -0.03], C.gun);
  });
  b.anchor('chargeL', [-0.01, 0.15, 0.17], { axis: [0, 0, 1], back: [-0.3, 1, 0], r: 0.012, part: 'cover' });
  // Munitionskasten links unten + Gurtglieder
  b.part('mag', [-0.01, 0.0, 0.12], 'poly', () => {
    b.ext([[0.05, 0.03], [0.19, 0.03], [0.19, -0.11], [0.05, -0.11]], 0.07, C.od, { x: -0.012, bevel: 0.006 });
    b.box([0.074, 0.008, 0.144], [-0.012, -0.0, 0.12], 0x3f4a2e);
    for (let i = 0; i < 3; i++) b.box([0.016, 0.006, 0.012], [-0.03 + i * 0.016, 0.04 + i * 0.008, 0.12], C.brass, { d: true });
  });
  b.anchor('magHold', [-0.06, -0.04, 0.12], { axis: [0, 0, 1], back: [-1, -0.3, 0], r: 0.03, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.85]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.018, trigger: true });
  b.anchor('gripL', [0, 0.04, 0.29], { ...fwdGrip(), r: 0.028 });
  return makeRig('mg', { reload: 'mg', charge: 'none', cycle: 'none', travel: { slide: 0, charge: 0, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 1.0, pin: 0 }, magDir: [-0.2, -1, 0] });
}
