import { TBL, makeRig, type Builder, type Rig } from './builder';
import { C } from './common';

/** Messer, Granaten, C4 (Koordinaten siehe builder.ts). */

export function knife(b: Builder): Rig {
  // Klinge (Clip-Point) nach vorn, Griff um den Ursprung
  b.ext([[0.055, 0.012], [0.165, 0.014], [0.2, 0.019], [0.24, 0.003], [0.205, -0.008], [0.14, -0.016], [0.08, -0.016], [0.055, -0.013]], 0.0045, C.chrome, { bevel: 0.0014 });
  b.box([0.0049, 0.004, 0.09], [0, 0.004, 0.12], C.steel, { d: true }); // Hohlkehle
  for (let i = 0; i < 6; i++) b.box([0.005, 0.004, 0.003], [0, 0.015, 0.07 + i * 0.008], C.steel, { d: true, rot: [0.6, 0, 0] });
  // Parierstange, Griff mit Rillen, Knauf
  b.ext([[0.045, 0.026], [0.056, 0.026], [0.056, -0.03], [0.045, -0.03]], 0.024, C.black, { bevel: 0.002 });
  b.ext([[-0.065, -0.013], [0.045, -0.016], [0.045, 0.014], [-0.065, 0.014]], 0.024, C.poly, { m: 'poly', bevel: 0.004 });
  for (let i = 0; i < 4; i++) b.box([0.026, 0.004, 0.006], [0, -0.016, -0.04 + i * 0.022], C.rubber, { m: 'poly', d: true });
  b.cyl(0.013, 0.012, 0.016, [0, 0, -0.072], C.steel, { sides: 10 });
  b.anchor('muzzle', TBL);
  // Faust um den Griff, Klinge nach vorn
  b.anchor('gripR', TBL, { axis: [0, 0.1, 1], back: [0.35, 0.94, 0], r: 0.013 });
  // linke Faust locker unten links (Deckung)
  b.anchor('gripL', TBL, { axis: [0.3, 0.8, 0.5], back: [-0.7, 0.3, -0.3], r: 0.011 });
  return makeRig('knife');
}

type NadeSpec = { body: (b: Builder) => void; top: number };

function grenade(b: Builder, s: NadeSpec): Rig {
  s.body(b);
  const t = s.top;
  // Zünder
  b.cyl(0.011, 0.012, 0.016, [0, t + 0.008, 0], C.steel, { axis: 'y', sides: 10 });
  b.cyl(0.006, 0.006, 0.006, [0, t + 0.018, 0], C.steel, { axis: 'y', sides: 8 });
  // Löffel (Teil): oben über den Zünder, dann an der Seite (unter der Handfläche) hinunter
  b.part('spoon', [0.012, t + 0.016, 0], 'steel', () => {
    b.box([0.028, 0.004, 0.012], [0.008, t + 0.02, 0], C.silver);
    b.box([0.004, 0.06, 0.012], [0.026, t - 0.012, 0], C.silver, { rot: [0, 0, 0.12] });
  });
  // Splint + Ring (Teil, zieht nach links)
  b.part('pin', [-0.015, t + 0.012, 0], 'steel', () => {
    b.cyl(0.0015, 0.0015, 0.024, [-0.01, t + 0.012, 0], C.silver, { axis: 'x', sides: 5 });
    b.torus(0.011, 0.0018, [-0.031, t + 0.012, 0], C.silver, { sides: 12, rot: [Math.PI / 2, 0, 0] });
  });
  b.anchor('muzzle', TBL);
  b.anchor('gripR', TBL, { axis: [0, 1, 0.2], back: [1, 0, 0], r: 0.03 });
  b.anchor('gripL', TBL, { axis: [0, 0.3, 1], back: [-0.6, -0.8, 0], r: 0.008, part: 'pin' });
  return makeRig('grenade', { travel: { slide: 0, charge: 0, bolt: 0, boltLift: 0, pump: 0, mag: 0, cover: 0, pin: 0.07 }, pinDir: [-1, -0.2, 0.3] });
}

export function hegrenade(b: Builder): Rig {
  return grenade(b, {
    top: 0.036,
    body: (bb) => {
      bb.lathe([[0.004, -0.04], [0.02, -0.038], [0.03, -0.026], [0.034, -0.005], [0.032, 0.015], [0.024, 0.03], [0.012, 0.037]], [0, 0, 0], 0x4b5a30, { m: 'poly', axis: 'y', sides: 12 });
      bb.cyl(0.0345, 0.0345, 0.004, [0, -0.004, 0], 0x3a4524, { m: 'poly', axis: 'y', sides: 12, d: true });
      bb.box([0.002, 0.012, 0.03], [0.034, 0.0, 0.0], 0xd8c050, { m: 'poly', d: true });
    },
  });
}

export function flashbang(b: Builder): Rig {
  return grenade(b, {
    top: 0.044,
    body: (bb) => {
      bb.cyl(0.022, 0.022, 0.09, [0, 0.0, 0], 0xd2d4d2, { m: 'poly', axis: 'y', sides: 12 });
      bb.cyl(0.0232, 0.0232, 0.012, [0, 0.038, 0], C.black, { m: 'poly', axis: 'y', sides: 12 });
      bb.cyl(0.0232, 0.0232, 0.01, [0, -0.04, 0], C.black, { m: 'poly', axis: 'y', sides: 12 });
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + r * 0.5;
          bb.box([0.007, 0.007, 0.003], [Math.sin(a) * 0.022, -0.012 + r * 0.03, Math.cos(a) * 0.022], 0x303234, { m: 'poly', d: true, rot: [0, a, 0] });
        }
      }
    },
  });
}

export function smokegrenade(b: Builder): Rig {
  return grenade(b, {
    top: 0.046,
    body: (bb) => {
      bb.cyl(0.03, 0.03, 0.095, [0, -0.002, 0], 0x6c7072, { m: 'poly', axis: 'y', sides: 12 });
      bb.cyl(0.0305, 0.0305, 0.016, [0, 0.0, 0], 0x5e8a44, { m: 'poly', axis: 'y', sides: 12 });
      bb.cyl(0.026, 0.03, 0.008, [0, 0.042, 0], 0xa4a8aa, { m: 'poly', axis: 'y', sides: 12 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        bb.cyl(0.004, 0.004, 0.003, [Math.sin(a) * 0.016, 0.047, Math.cos(a) * 0.016], C.black, { m: 'poly', axis: 'y', sides: 6, d: true });
      }
    },
  });
}

export function c4(b: Builder): Rig {
  const cx = -0.065;
  const cy = 0.0;
  // Sprengstoff-Stangen mit Klebeband
  for (let i = 0; i < 3; i++) b.box([0.036, 0.055, 0.2], [cx - 0.037 + i * 0.037, cy, 0.04], 0xa38c5e, { m: 'poly', ao: 0.35 });
  for (const f of [-0.02, 0.1]) b.box([0.116, 0.058, 0.026], [cx, cy, f], 0x2f3236, { m: 'poly' });
  // Zeitzünder: Gehäuse, Display, Tastenfeld, Kabel
  b.box([0.08, 0.02, 0.11], [cx, cy + 0.036, 0.04], C.poly, { m: 'poly' });
  b.box([0.056, 0.004, 0.026], [cx, cy + 0.047, 0.075], 0x5fa040, { m: 'glass' });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.box([0.012, 0.004, 0.01], [cx - 0.016 + c * 0.016, cy + 0.047, 0.045 - r * 0.014], 0x8a8f96, { m: 'poly', d: true });
  b.box([0.008, 0.005, 0.008], [cx + 0.03, cy + 0.048, 0.0], C.red, { m: 'glass', d: true });
  const wire = (x: number, color: number, f0: number, f1: number): void => {
    b.seg([cx + x, cy + 0.04, f0], [cx + x * 1.3, cy + 0.03, f1], 0.0025, 0.0025, color, { m: 'poly', sides: 5 });
  };
  wire(-0.03, C.red, -0.01, -0.055);
  wire(0.0, 0x2a5ad0, -0.012, -0.06);
  wire(0.03, 0xe0c020, -0.01, -0.055);
  b.anchor('keypad', [cx, cy + 0.06, 0.035], { axis: [0, 0, 1], back: [0, 1, 0], r: 0.01 });
  b.anchor('muzzle', TBL);
  // Hände halten den Block seitlich unten
  b.anchor('gripR', TBL, { axis: [0, 0, 1], back: [1, -0.4, 0], r: 0.026 });
  b.anchor('gripL', TBL, { axis: [0, 0, 1], back: [-1, -0.4, 0], r: 0.026 });
  return makeRig('bomb');
}
