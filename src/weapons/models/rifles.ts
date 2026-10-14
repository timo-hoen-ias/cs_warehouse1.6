import { makeRig, type Builder, type Rig } from './builder';
import { C, barrel, curvedMag, foreBack, gripAxis, rail, rect, scope, triggerGroup } from './common';

/** Sturmgewehre (Koordinaten siehe builder.ts). */

/** Standard-Pistolengriff (Profil um den Ursprung, Neigung über die Punkte). */
function pistolGrip(b: Builder, color: number, m: 'poly' | 'wood' = 'poly', w = 0.03, scale = 1): void {
  b.ext([[-0.02, 0.036], [0.028, 0.036], [0.022, 0.0], [0.012, -0.05 * scale], [0.004, -0.075 * scale], [-0.036, -0.078 * scale], [-0.04, -0.07 * scale], [-0.03, -0.02]], w, color, { m, bevel: 0.003 });
}

export function ak47(b: Builder): Rig {
  const bore = 0.084;
  pistolGrip(b, C.woodRed, 'wood', 0.03);
  // Unterteil (gestanzter Stahl) mit Magazinschacht
  b.ext([[-0.075, 0.034], [0.1, 0.034], [0.1, 0.028], [0.17, 0.028], [0.17, 0.034], [0.265, 0.034], [0.275, 0.05], [0.275, 0.088], [-0.075, 0.088]], 0.042, C.gun, { bevel: 0.002 });
  // Staubschutzdeckel (gerundet) + Rippen
  b.ext([[-0.082, 0.088], [0.19, 0.088], [0.19, 0.1], [0.17, 0.106], [-0.05, 0.106], [-0.078, 0.1]], 0.038, C.gun, { bevel: 0.004 });
  for (let i = 0; i < 3; i++) b.box([0.039, 0.003, 0.004], [0, 0.104, 0.0 + i * 0.05], C.black, { d: true });
  // Sicherungshebel rechts (lang), Auswurffenster
  b.ext([[-0.03, 0.058], [0.12, 0.074], [0.12, 0.08], [-0.03, 0.07]], 0.004, C.steel, { x: 0.023, bevel: 0.0008 });
  b.box([0.002, 0.016, 0.07], [0.021, 0.09, 0.12], C.black, { d: true });
  triggerGroup(b, 0.022, 0.085, 0.034, 0.03, C.gun);
  // Holzschaft hinten (fällt ab), Schaftkappe
  b.ext([[-0.07, 0.088], [-0.09, 0.087], [-0.4, 0.05], [-0.4, -0.06], [-0.32, -0.04], [-0.18, 0.0], [-0.075, 0.038]], 0.04, C.wood, { m: 'wood', bevel: 0.004 });
  b.ext([[-0.408, 0.052], [-0.398, 0.052], [-0.398, -0.062], [-0.408, -0.062]], 0.042, C.gun, { bevel: 0.001 });
  // Handschutz unten/oben (Holz) + Gasrohr
  b.ext([[0.272, 0.05], [0.5, 0.05], [0.506, 0.06], [0.506, 0.096], [0.272, 0.096]], 0.05, C.wood, { m: 'wood', bevel: 0.006 });
  for (let i = 0; i < 3; i++) b.box([0.052, 0.006, 0.012], [0, 0.072, 0.31 + i * 0.05], C.woodDark, { m: 'wood', d: true });
  b.ext([[0.29, 0.096], [0.47, 0.096], [0.476, 0.108], [0.468, 0.122], [0.29, 0.122]], 0.036, C.wood, { m: 'wood', bevel: 0.005 });
  b.cyl(0.0105, 0.0105, 0.06, [0, 0.11, 0.505], C.gun, { sides: 8 });
  b.box([0.02, 0.04, 0.025], [0, 0.098, 0.53], C.gun); // Gasblock
  // Kimme
  b.ext([[0.27, 0.096], [0.3, 0.096], [0.3, 0.112], [0.28, 0.116], [0.27, 0.112]], 0.03, C.gun, { bevel: 0.002 });
  b.box([0.022, 0.004, 0.07], [0, 0.118, 0.32], C.gun, { d: true });
  // Lauf, Kornträger mit Haube, Mündungsbremse, Putzstock
  barrel(b, 0.5, 0.74, 0.011, bore, C.gun);
  b.ext([[0.69, 0.07], [0.72, 0.07], [0.72, 0.1], [0.705, 0.13], [0.695, 0.13], [0.69, 0.1]], 0.02, C.gun, { bevel: 0.002 });
  b.torus(0.009, 0.002, [0, 0.122, 0.705], C.gun, { rot: [0, Math.PI / 2, 0], sides: 10, d: true });
  b.cyl(0.0135, 0.0125, 0.045, [0, bore, 0.76], C.gun, { sides: 10 });
  b.box([0.012, 0.006, 0.02], [0.006, bore + 0.012, 0.772], C.black, { d: true, rot: [0, 0, 0.6] });
  b.cyl(0.003, 0.003, 0.2, [0, 0.061, 0.6], C.steel, { sides: 6, d: true });
  // Spannhebel rechts (läuft beim Schuss mit dem Verschluss)
  b.part('slide', [0.026, 0.08, 0.17], 'steel', () => {
    b.box([0.004, 0.016, 0.12], [0.023, 0.08, 0.13], C.steel);
    b.cyl(0.006, 0.006, 0.022, [0.034, 0.08, 0.19], C.steel, { axis: 'x', sides: 8 });
  });
  b.anchor('chargeL', [0.05, 0.072, 0.19], { axis: [0, 0, -1], back: [0.2, -1, 0], r: 0.008, part: 'slide' });
  // Magazin (gebogen, Stahl mit Rippen)
  b.part('mag', [0, 0.03, 0.135], 'steel', () => {
    b.ext(curvedMag(0.103, 0.167, 0.04, 0.2, 0.07), 0.026, C.gunLight, { bevel: 0.002 });
    for (let i = 0; i < 4; i++) b.box([0.027, 0.004, 0.06], [0, -0.01 - i * 0.04, 0.15 + i * i * 0.004 + i * 0.006], C.gun, { d: true, rot: [-0.2 - i * 0.08, 0, 0] });
  });
  b.anchor('magHold', [0, -0.085, 0.175], { axis: [0, 0.94, -0.33], back: [-1, 0, 0], r: 0.018, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.785]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.074, 0.4], { axis: [0, 0, 1], back: foreBack(-0.35), r: 0.024 });
  return makeRig('rifle', { reload: 'mag', charge: 'slide', cycle: 'slide', travel: { slide: 0.085, charge: 0.085, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -0.95, -0.3], magAway: [-0.15, -1, 0] });
}

export function m4a1(b: Builder): Rig {
  const bore = 0.09;
  b.ext([[-0.02, 0.036], [0.028, 0.036], [0.018, 0.0], [0.004, -0.05], [-0.008, -0.074], [-0.042, -0.074], [-0.044, -0.064], [-0.032, -0.02]], 0.03, C.poly, { m: 'poly', bevel: 0.003 });
  // Unterteil mit Magazinschacht
  b.ext([[-0.072, 0.035], [0.05, 0.035], [0.06, -0.005], [0.145, -0.005], [0.15, 0.03], [0.165, 0.035], [0.17, 0.075], [-0.072, 0.075]], 0.04, C.gun, { bevel: 0.002 });
  triggerGroup(b, 0.022, 0.075, 0.035, 0.03, C.gun);
  // Oberteil + Tragegriff mit Fenster + Diopter
  b.ext(rect(-0.075, 0.205, 0.075, 0.108, 0.004), 0.034, C.gun, { bevel: 0.002 });
  b.ext([[-0.06, 0.108], [0.135, 0.108], [0.125, 0.15], [-0.04, 0.15], [-0.06, 0.13]], 0.022, C.gun, { holes: [[[-0.03, 0.114], [0.105, 0.114], [0.1, 0.136], [-0.025, 0.136]]], bevel: 0.002 });
  b.box([0.022, 0.006, 0.17], [0, 0.152, 0.04], C.gun, { d: true });
  b.cyl(0.008, 0.008, 0.024, [0, 0.147, -0.045], C.gun, { axis: 'x', sides: 10, d: true });
  b.cyl(0.006, 0.006, 0.014, [0.022, 0.092, 0.02], C.gun, { axis: 'x', sides: 8, d: true }); // Schließhilfe
  b.box([0.002, 0.014, 0.06], [0.0175, 0.092, 0.1], C.black, { d: true }); // Hülsenauswurf
  // Puffer-Rohr + Teleskopschaft
  b.cyl(0.015, 0.015, 0.26, [0, 0.083, -0.2], C.gun, { sides: 10 });
  b.ext([[-0.2, 0.115], [-0.33, 0.112], [-0.36, 0.11], [-0.36, 0.03], [-0.33, 0.03], [-0.26, 0.06], [-0.2, 0.065]], 0.036, C.poly, { m: 'poly', bevel: 0.004 });
  // Handschutz (rund, gerippt), Deltaring
  b.cyl(0.024, 0.024, 0.04, [0, bore, 0.218], C.gun, { sides: 12 });
  b.cyl(0.023, 0.021, 0.23, [0, bore, 0.35], C.poly, { m: 'poly', sides: 12 });
  for (let i = 0; i < 6; i++) b.cyl(0.0236, 0.0236, 0.012, [0, bore, 0.255 + i * 0.033], C.poly, { m: 'poly', sides: 12, d: true });
  // Lauf, A-Korn, Mündungsfeuerdämpfer
  barrel(b, 0.46, 0.66, 0.0085, bore, C.gun);
  b.ext([[0.46, 0.08], [0.495, 0.08], [0.488, 0.112], [0.48, 0.142], [0.472, 0.142], [0.468, 0.112]], 0.012, C.gun, { bevel: 0.0015 });
  b.cyl(0.0105, 0.0105, 0.05, [0, bore, 0.675], C.gun, { sides: 8 });
  for (let i = 0; i < 3; i++) b.box([0.022, 0.002, 0.03], [0, bore, 0.68], C.black, { d: true, rot: [0, 0, i * 1.05] });
  // Ladehebel hinten (T-Griff)
  b.part('charge', [0, 0.1, -0.075], 'steel', () => {
    b.box([0.012, 0.008, 0.12], [0, 0.1, -0.02], C.gun);
    b.box([0.034, 0.009, 0.012], [0, 0.1, -0.08], C.gun);
  });
  b.anchor('chargeL', [-0.01, 0.105, -0.09], { axis: [1, 0, 0], back: [0, 0.6, -0.8], r: 0.008, part: 'charge' });
  b.part('mag', [0, 0.02, 0.105], 'steel', () => {
    b.ext(curvedMag(0.07, 0.137, 0.03, 0.19, 0.03), 0.024, C.gunLight, { bevel: 0.002 });
    b.box([0.025, 0.01, 0.07], [0, -0.155, 0.13], C.gun, { rot: [-0.15, 0, 0] });
  });
  b.anchor('magHold', [0, -0.085, 0.13], { axis: [0, 0.98, -0.18], back: [-1, 0, 0], r: 0.018, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.7]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.42), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, bore, 0.33], { axis: [0, 0, 1], back: foreBack(-0.35), r: 0.024 });
  return makeRig('rifle', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.065, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -0.99, -0.12] });
}

export function galil(b: Builder): Rig {
  const bore = 0.085;
  pistolGrip(b, C.poly, 'poly');
  b.ext([[-0.085, 0.034], [0.095, 0.034], [0.095, 0.026], [0.17, 0.026], [0.17, 0.034], [0.27, 0.034], [0.28, 0.05], [0.28, 0.1], [-0.085, 0.1]], 0.044, C.gun, { bevel: 0.002 });
  b.ext([[-0.085, 0.1], [0.24, 0.1], [0.24, 0.11], [-0.07, 0.11]], 0.036, C.gun, { bevel: 0.003 });
  triggerGroup(b, 0.022, 0.085, 0.034, 0.03, C.gun);
  // Diopter hinten (Galil-typisch hoch), Tragegriff vorne
  b.ext([[-0.08, 0.11], [-0.05, 0.11], [-0.055, 0.135], [-0.075, 0.135]], 0.026, C.gun, { bevel: 0.002 });
  b.torus(0.022, 0.004, [0, 0.13, 0.17], C.gun, { rot: [0, Math.PI / 2, 0], arc: Math.PI, sides: 8 });
  // Klappschaft (Rohrgestell)
  b.seg([0, 0.085, -0.085], [0, 0.08, -0.4], 0.008, 0.008, C.gun, { sides: 6 });
  b.seg([0, 0.035, -0.085], [0, 0.0, -0.36], 0.008, 0.008, C.gun, { sides: 6 });
  b.ext([[-0.39, 0.09], [-0.405, 0.09], [-0.405, -0.02], [-0.355, -0.01]], 0.04, C.poly, { m: 'poly', bevel: 0.003 });
  // Holz-Handschutz, Zweibein (angeklappt), Gasrohr
  b.ext([[0.28, 0.048], [0.49, 0.052], [0.5, 0.064], [0.5, 0.104], [0.28, 0.104]], 0.052, C.woodDark, { m: 'wood', bevel: 0.006 });
  for (let i = 0; i < 4; i++) b.box([0.054, 0.004, 0.012], [0, 0.088, 0.3 + i * 0.045], C.black, { m: 'wood', d: true });
  b.seg([0.012, 0.045, 0.52], [0.012, 0.045, 0.3], 0.004, 0.004, C.gun, { sides: 5 });
  b.seg([-0.012, 0.045, 0.52], [-0.012, 0.045, 0.3], 0.004, 0.004, C.gun, { sides: 5 });
  b.cyl(0.011, 0.011, 0.05, [0, 0.114, 0.52], C.gun, { sides: 8 });
  barrel(b, 0.5, 0.75, 0.0105, bore, C.gun);
  b.box([0.022, 0.044, 0.024], [0, 0.1, 0.55], C.gun);
  // Korn mit „Ohren"
  b.box([0.026, 0.03, 0.012], [0, 0.125, 0.7], C.gun);
  b.box([0.004, 0.022, 0.012], [-0.011, 0.148, 0.7], C.gun);
  b.box([0.004, 0.022, 0.012], [0.011, 0.148, 0.7], C.gun);
  b.cyl(0.013, 0.013, 0.05, [0, bore, 0.77], C.gun, { sides: 8 });
  b.part('slide', [0.026, 0.09, 0.2], 'steel', () => {
    b.box([0.004, 0.014, 0.11], [0.024, 0.09, 0.17], C.steel);
    b.seg([0.026, 0.09, 0.215], [0.04, 0.115, 0.218], 0.004, 0.0045, C.steel, { sides: 6 });
    b.sphere(0.0065, [0.04, 0.117, 0.218], C.steel, { sides: 8 });
  });
  b.anchor('chargeL', [0.045, 0.11, 0.22], { axis: [0, 0, -1], back: [0.2, -1, 0], r: 0.008, part: 'slide' });
  b.part('mag', [0, 0.03, 0.13], 'steel', () => {
    b.ext(curvedMag(0.1, 0.167, 0.032, 0.21, 0.05), 0.028, C.gun, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.09, 0.165], { axis: [0, 0.96, -0.28], back: [-1, 0, 0], r: 0.018, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.795]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.078, 0.4], { axis: [0, 0, 1], back: foreBack(-0.35), r: 0.025 });
  return makeRig('rifle', { reload: 'mag', charge: 'slide', cycle: 'slide', travel: { slide: 0.08, charge: 0.08, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -0.96, -0.25] });
}

export function famas(b: Builder): Rig {
  const bore = 0.075;
  const body = 0x2e3135;
  // Griff + großer Abzugsbügel
  b.ext([[-0.018, 0.034], [0.026, 0.034], [0.018, 0.0], [0.008, -0.07], [-0.032, -0.075], [-0.036, -0.066], [-0.028, -0.02]], 0.03, C.poly, { m: 'poly', bevel: 0.003 });
  triggerGroup(b, 0.022, 0.09, 0.034, 0.04, body, { width: 0.014 });
  // Gehäuse (Bullpup): vom Kolben bis vorn
  b.ext([[-0.47, 0.11], [-0.47, -0.035], [-0.43, -0.05], [-0.3, -0.03], [-0.2, 0.03], [0.0, 0.034], [0.3, 0.034], [0.33, 0.05], [0.33, 0.1], [0.2, 0.11], [-0.2, 0.115]], 0.052, body, { m: 'poly', bevel: 0.006 });
  b.ext([[-0.48, 0.115], [-0.465, 0.115], [-0.465, -0.04], [-0.48, -0.04]], 0.054, C.rubber, { m: 'poly', bevel: 0.002 });
  // Tragegriff über fast die ganze Länge (FAMAS-Erkennungszeichen)
  b.ext([[-0.12, 0.11], [-0.09, 0.11], [-0.07, 0.15], [0.24, 0.15], [0.28, 0.11], [0.31, 0.11], [0.3, 0.172], [0.27, 0.178], [-0.08, 0.178], [-0.115, 0.165]], 0.02, body, { m: 'poly', bevel: 0.003 });
  b.box([0.024, 0.016, 0.02], [0, 0.185, 0.27], body, { m: 'poly' }); // Korn-Schutz
  b.box([0.024, 0.014, 0.025], [0, 0.185, -0.07], body, { m: 'poly' }); // Diopter
  // Handschutz-Rippen, Auswurf, Lauf + Mündung (Granat-Ringe)
  for (let i = 0; i < 5; i++) b.box([0.054, 0.005, 0.01], [0, 0.07, 0.12 + i * 0.035], C.black, { m: 'poly', d: true });
  b.box([0.004, 0.02, 0.06], [0.026, 0.08, -0.2], C.black, { d: true });
  barrel(b, 0.33, 0.47, 0.0095, bore, C.gun);
  b.cyl(0.0125, 0.0125, 0.05, [0, bore, 0.47], C.gun, { sides: 10 });
  b.cyl(0.0145, 0.0145, 0.006, [0, bore, 0.45], C.gun, { sides: 10, d: true });
  // Zweibein-Beine angeklappt
  b.seg([0.028, 0.05, 0.3], [0.028, 0.08, 0.05], 0.004, 0.004, C.gun, { sides: 5, d: true });
  b.seg([-0.028, 0.05, 0.3], [-0.028, 0.08, 0.05], 0.004, 0.004, C.gun, { sides: 5, d: true });
  // Spannhebel unter dem Tragegriff
  b.part('charge', [0, 0.13, 0.15], 'steel', () => {
    b.box([0.014, 0.012, 0.04], [0, 0.135, 0.17], C.gun);
    b.box([0.006, 0.012, 0.008], [0, 0.124, 0.19], C.gun);
  });
  b.anchor('chargeL', [-0.01, 0.135, 0.18], { axis: [1, 0, 0], back: [0, 1, 0.3], r: 0.008, part: 'charge' });
  b.part('mag', [0, 0.02, -0.17], 'steel', () => {
    b.ext(curvedMag(-0.2, -0.14, 0.03, 0.17, 0.02), 0.024, C.gunLight, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.08, -0.16], { axis: [0, 1, -0.1], back: [-1, 0, 0], r: 0.017, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.5]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.3), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.065, 0.24], { axis: [0, 0, 1], back: foreBack(-0.35), r: 0.03 });
  return makeRig('rifle', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.06, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -1, -0.05] });
}

export function aug(b: Builder): Rig {
  const bore = 0.07;
  const body = C.od;
  // Griff im großen Ganzhand-Bügel (AUG-typisch)
  b.ext([[-0.018, 0.034], [0.026, 0.034], [0.018, 0.0], [0.008, -0.07], [-0.032, -0.075], [-0.036, -0.066], [-0.028, -0.02]], 0.03, body, { m: 'poly', bevel: 0.003 });
  b.ext([[-0.04, 0.03], [0.17, 0.03], [0.17, 0.0], [0.04, -0.09], [-0.045, -0.09], [-0.045, -0.072], [0.03, -0.072], [0.15, 0.012], [-0.04, 0.012]], 0.016, body, { m: 'poly', bevel: 0.003 });
  b.ext([[0.032, 0.03], [0.04, 0.03], [0.036, 0.008], [0.028, 0.004]], 0.006, C.black, { m: 'poly' }); // Abzug
  // Schaftkörper (rund, grün)
  b.ext([[-0.5, 0.1], [-0.52, 0.06], [-0.5, -0.04], [-0.4, -0.05], [-0.2, -0.02], [-0.1, 0.03], [0.1, 0.035], [0.12, 0.06], [0.12, 0.1], [-0.2, 0.105], [-0.45, 0.11]], 0.06, body, { m: 'poly', bevel: 0.008 });
  b.ext([[-0.525, 0.11], [-0.505, 0.11], [-0.505, -0.045], [-0.525, -0.045]], 0.058, C.rubber, { m: 'poly', bevel: 0.002 });
  // Integriertes Zielfernrohr (1,5×) mit Tragegriff
  b.ext([[-0.06, 0.1], [0.13, 0.1], [0.11, 0.14], [-0.04, 0.14]], 0.024, body, { m: 'poly', holes: [[[-0.03, 0.105], [0.1, 0.105], [0.09, 0.128], [-0.02, 0.128]]], bevel: 0.003 });
  scope(b, -0.06, 0.15, 0.155, 0.017, 0.022, 0.02, body, { turrets: false });
  // Laufgruppe mit Klapp-Vordergriff
  barrel(b, 0.11, 0.48, 0.011, bore, C.gun);
  b.cyl(0.02, 0.02, 0.06, [0, bore, 0.15], C.gun, { sides: 10 });
  b.ext([[0.2, 0.06], [0.24, 0.06], [0.235, -0.05], [0.228, -0.07], [0.205, -0.07], [0.198, -0.05]], 0.03, body, { m: 'poly', bevel: 0.004 });
  b.cyl(0.013, 0.013, 0.05, [0, bore, 0.49], C.gun, { sides: 10 });
  for (let i = 0; i < 4; i++) b.box([0.004, 0.012, 0.02], [0, bore, 0.49], C.black, { d: true, rot: [0, 0, i * 0.8] });
  b.part('charge', [-0.03, 0.08, 0.08], 'steel', () => {
    b.box([0.006, 0.012, 0.03], [-0.032, 0.08, 0.08], C.gun);
    b.cyl(0.005, 0.005, 0.014, [-0.04, 0.08, 0.09], C.gun, { axis: 'x', sides: 6 });
  });
  b.anchor('chargeL', [-0.05, 0.075, 0.095], { axis: [0, 1, 0], back: [-1, 0, 0], r: 0.008, part: 'charge' });
  b.part('mag', [0, 0.0, -0.16], 'poly', () => {
    b.ext(curvedMag(-0.19, -0.13, 0.02, 0.17, 0.03), 0.026, 0x2a2e2a, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.08, -0.15], { axis: [0, 1, -0.15], back: [-1, 0, 0], r: 0.017, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.52]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.3), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, -0.015, 0.218], { axis: gripAxis(0.12), back: [-1, 0, 0.2], r: 0.017 });
  return makeRig('rifle', { reload: 'mag', charge: 'charge', cycle: 'none', travel: { slide: 0, charge: 0.07, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -0.99, -0.15] });
}

export function sg552(b: Builder): Rig {
  const bore = 0.082;
  pistolGrip(b, C.poly);
  b.ext([[-0.07, 0.034], [0.09, 0.034], [0.09, 0.026], [0.16, 0.026], [0.16, 0.034], [0.22, 0.034], [0.23, 0.05], [0.23, 0.1], [-0.07, 0.1]], 0.044, C.gun, { bevel: 0.003 });
  triggerGroup(b, 0.022, 0.085, 0.034, 0.03, C.gun);
  rail(b, -0.05, 0.2, 0.106, C.gun);
  // Skelett-Klappschaft
  b.ext([[-0.07, 0.095], [-0.32, 0.09], [-0.34, 0.075], [-0.34, -0.03], [-0.3, -0.03], [-0.07, 0.035]], 0.024, C.poly, { m: 'poly', holes: [[[-0.1, 0.075], [-0.31, 0.072], [-0.31, -0.0], [-0.1, 0.05]]], bevel: 0.003 });
  // Handschutz (kurz, belüftet) + Gasrohr über dem Lauf
  b.ext([[0.23, 0.045], [0.38, 0.05], [0.385, 0.06], [0.385, 0.1], [0.23, 0.1]], 0.05, C.poly, { m: 'poly', bevel: 0.006 });
  for (let i = 0; i < 4; i++) b.box([0.052, 0.008, 0.012], [0, 0.08, 0.255 + i * 0.03], C.black, { m: 'poly', d: true });
  b.cyl(0.008, 0.008, 0.08, [0, 0.108, 0.42], C.gun, { sides: 8 });
  barrel(b, 0.38, 0.52, 0.0095, bore, C.gun);
  b.cyl(0.0125, 0.0125, 0.045, [0, bore, 0.53], C.gun, { sides: 8 });
  // Zielfernrohr (kompakt, hoch montiert)
  scope(b, -0.02, 0.17, 0.15, 0.016, 0.022, 0.019, C.black, { mounts: [0.02, 0.13], mountY: 0.108 });
  b.part('slide', [0.026, 0.09, 0.15], 'steel', () => {
    b.box([0.004, 0.012, 0.08], [0.024, 0.09, 0.13], C.steel);
    b.cyl(0.006, 0.006, 0.02, [0.034, 0.09, 0.165], C.steel, { axis: 'x', sides: 8 });
  });
  b.anchor('chargeL', [0.048, 0.085, 0.165], { axis: [0, 0, -1], back: [0.2, -1, 0], r: 0.008, part: 'slide' });
  b.part('mag', [0, 0.03, 0.125], 'poly', () => {
    b.ext(curvedMag(0.095, 0.157, 0.04, 0.2, 0.06), 0.026, C.amber, { bevel: 0.002 });
  });
  b.anchor('magHold', [0, -0.085, 0.16], { axis: [0, 0.95, -0.3], back: [-1, 0, 0], r: 0.018, part: 'mag' });
  b.anchor('muzzle', [0, bore, 0.555]);
  b.anchor('gripR', [0, 0, 0], { axis: gripAxis(0.32), back: [1, 0, 0], r: 0.017, trigger: true });
  b.anchor('gripL', [0, 0.073, 0.31], { axis: [0, 0, 1], back: foreBack(-0.35), r: 0.025 });
  return makeRig('rifle', { reload: 'mag', charge: 'slide', cycle: 'slide', travel: { slide: 0.07, charge: 0.07, bolt: 0, boltLift: 0, pump: 0, mag: 0.06, cover: 0, pin: 0 }, magDir: [0, -0.95, -0.3] });
}
