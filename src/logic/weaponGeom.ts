import type { Knots } from './stretch';

/** Punkt im Modellraum: [x rechts (aus Schützensicht), y oben, f vorwärts], Meter, Ursprung = Griffpunkt der rechten Hand. */
export type P3 = readonly [number, number, number];

/** Haltung des Soldaten: `rifle` = angelegt, `pistol` = beidhändig ausgestreckt, `dual` = je eine Pistole pro Hand. */
export type HoldStyle = 'knife' | 'pistol' | 'dual' | 'rifle' | 'grenade' | 'bomb';

/**
 * Geometrie-Metadaten je Waffenmodell (Modell-Id = `visual.model`), Quelle der Wahrheit für alles,
 * was Mündung, Hände, Auswurf und Sichtlinie braucht: Viewmodel-Anker, Soldaten-Haltung, Mündungsfeuer,
 * Hülsen, liegende Waffen. Koordinaten wie in weapons/models/builder.ts (endgültig, also NACH `fit`).
 */
export type WeaponGeom = {
  /** Haltung des Soldaten (Dritte Person): `pistol` = beidhändig ausgestreckt, `rifle` = an der Schulter angelegt. */
  hold: HoldStyle;
  /** Echte Gesamtlänge (m) entlang der Laufachse (Schaft bis Mündung); bei Granaten/C4 die Ausdehnung in f. */
  length: number;
  /** Längsstauchung des gebauten Modells auf das echte Maß ([gebaut f, endgültig f], siehe stretch.ts). */
  fit?: Knots;
  /** Mündung (Mitte der Laufbohrung am Ende); `muzzle2` = zweite Pistole der Elites. */
  muzzle: P3;
  muzzle2?: P3;
  /** Auswurffenster (Hülsen); `eject2` = zweite Pistole. */
  eject?: P3;
  eject2?: P3;
  /** Auswurfrichtung (Modellraum, wird normiert); Standard: rechts, leicht nach oben und hinten. */
  ejectDir?: P3;
  /** Schusshand: Mitte des Pistolengriffs (Abzugsfinger vorn). */
  gripR: P3;
  /** Stützhand: Vorderschaft / Magazinschacht / Schusshand (Pistolen: Tassengriff, Elites: linke Pistole). */
  gripL: P3;
  /** Kimme und Korn (Oberkante; bei Zielfernrohr-Waffen Okular und Objektiv). */
  sightRear?: P3;
  sightFront?: P3;
  /** Schaftkappe (Mitte der Anlage an der Schulter); Pistolen/Messer/Granaten ohne. */
  butt?: P3;
};

/** Tabelle aller Modelle (siehe weapons/models/catalog.test.ts: Anker, Längen und Sichtlinien werden gegen die gebauten Modelle geprüft). */
export const WEAPON_GEOM: Record<string, WeaponGeom> = {
  knife: {
    length: 0.32,
    hold: 'knife',
    muzzle: [0, 0.003, 0.24],
    gripR: [0, 0, 0],
    gripL: [-0.26, 0, 0.03],
  },
  glock: {
    length: 0.19,
    hold: 'pistol',
    muzzle: [0, 0.06, 0.15],
    eject: [0.013, 0.065, 0.063],
    gripR: [0, 0, 0],
    gripL: [-0.016, -0.018, 0.004],
    sightRear: [0, 0.079, -0.032],
    sightFront: [0, 0.079, 0.139],
  },
  usp: {
    length: 0.23,
    hold: 'pistol',
    muzzle: [0, 0.063, 0.171],
    eject: [0.014, 0.069, 0.074],
    gripR: [0, 0, 0],
    gripL: [-0.016, -0.018, 0.004],
    sightRear: [0, 0.083, -0.034],
    sightFront: [0, 0.083, 0.16],
  },
  p228: {
    length: 0.2,
    hold: 'pistol',
    muzzle: [0, 0.061, 0.145],
    eject: [0.013, 0.067, 0.06],
    gripR: [0, 0, 0],
    gripL: [-0.016, -0.018, 0.004],
    sightRear: [0, 0.08, -0.032],
    sightFront: [0, 0.081, 0.134],
  },
  deagle: {
    length: 0.27,
    hold: 'pistol',
    fit: [[-0.06, -0.06], [0.1, 0.1], [0.215, 0.227]],
    muzzle: [0, 0.07, 0.221],
    eject: [0.016, 0.084, 0.03],
    gripR: [0, 0, 0],
    gripL: [-0.018, -0.02, 0.004],
    sightRear: [0, 0.101, -0.04],
    sightFront: [0, 0.11, 0.208],
  },
  fiveseven: {
    length: 0.2,
    hold: 'pistol',
    muzzle: [0, 0.061, 0.161],
    eject: [0.013, 0.066, 0.068],
    gripR: [0, 0, 0],
    gripL: [-0.016, -0.018, 0.004],
    sightRear: [0, 0.079, -0.034],
    sightFront: [0, 0.08, 0.15],
  },
  elite: {
    length: 0.22,
    hold: 'dual',
    muzzle: [0, 0.06, 0.168],
    muzzle2: [-0.24, 0.06, 0.168],
    eject: [0.013, 0.065, 0.062],
    eject2: [-0.227, 0.065, 0.062],
    gripR: [0, 0, 0],
    gripL: [-0.24, 0, 0],
    sightRear: [0, 0.079, -0.032],
    sightFront: [0, 0.079, 0.152],
  },
  m3: {
    length: 1,
    hold: 'rifle',
    fit: [[-0.415, -0.38], [-0.09, -0.09], [0.2, 0.2], [0.685, 0.62]],
    muzzle: [0, 0.088, 0.62],
    eject: [0.021, 0.09, 0.06],
    gripR: [0, 0, 0],
    gripL: [0, 0.062, 0.339],
    sightRear: [0, 0.144, 0],
    sightFront: [0, 0.11, 0.603],
    butt: [0, 0.01, -0.378],
  },
  xm1014: {
    length: 1,
    hold: 'rifle',
    fit: [[-0.375, -0.36], [-0.09, -0.09], [0.2, 0.2], [0.685, 0.64]],
    muzzle: [0, 0.088, 0.64],
    eject: [0.021, 0.09, 0.06],
    gripR: [0, 0, 0],
    gripL: [0, 0.06, 0.309],
    sightRear: [0, 0.157, -0.02],
    sightFront: [0, 0.11, 0.622],
    butt: [0, 0.065, -0.355],
  },
  mac10: {
    length: 0.55,
    hold: 'pistol',
    fit: [[-0.25, -0.31], [-0.1, -0.1], [0, 0], [0.24, 0.24]],
    muzzle: [0, 0.075, 0.24],
    eject: [0.026, 0.085, 0.03],
    gripR: [0, 0, 0],
    gripL: [0, 0.07, 0.14],
    sightRear: [0, 0.13, -0.085],
    sightFront: [0, 0.128, 0.159],
  },
  tmp: {
    length: 0.3,
    hold: 'pistol',
    muzzle: [0, 0.07, 0.21],
    eject: [0.024, 0.085, 0.07],
    gripR: [0, 0, 0],
    gripL: [0, -0.025, 0.13],
    sightRear: [0, 0.13, -0.06],
    sightFront: [0, 0.13, 0.14],
  },
  mp5: {
    length: 0.68,
    hold: 'rifle',
    fit: [[-0.35, -0.32], [-0.085, -0.085], [0.18, 0.18], [0.38, 0.36]],
    muzzle: [0, 0.08, 0.356],
    eject: [0.022, 0.09, 0.07],
    gripR: [0, 0, 0],
    gripL: [0, 0.072, 0.243],
    sightRear: [0, 0.14, -0.055],
    sightFront: [0, 0.156, 0.306],
    butt: [0, 0.04, -0.316],
  },
  ump45: {
    length: 0.69,
    hold: 'rifle',
    muzzle: [0, 0.075, 0.365],
    eject: [0.026, 0.09, 0.1],
    gripR: [0, 0, 0],
    gripL: [0, 0.06, 0.24],
    sightRear: [0, 0.139, -0.035],
    sightFront: [0, 0.14, 0.27],
    butt: [0, 0.03, -0.33],
  },
  p90: {
    length: 0.5,
    hold: 'rifle',
    muzzle: [0, 0.06, 0.256],
    eject: [0, -0.095, -0.1],
    ejectDir: [0.1, -1, -0.15],
    gripR: [0, 0, 0],
    gripL: [0, -0.03, 0.17],
    sightRear: [0, 0.167, -0.015],
    sightFront: [0, 0.167, 0.1],
    butt: [0, 0.01, -0.256],
  },
  galil: {
    length: 0.98,
    hold: 'rifle',
    fit: [[-0.41, -0.39], [-0.085, -0.085], [0.17, 0.17], [0.8, 0.59]],
    muzzle: [0, 0.085, 0.587],
    eject: [0.023, 0.07, 0.1],
    gripR: [0, 0, 0],
    gripL: [0, 0.078, 0.323],
    sightRear: [0, 0.135, -0.065],
    sightFront: [0, 0.159, 0.523],
    butt: [0, 0.035, -0.385],
  },
  famas: {
    length: 0.76,
    hold: 'rifle',
    fit: [[-0.485, -0.32], [-0.2, -0.2], [0.33, 0.33], [0.5, 0.44]],
    muzzle: [0, 0.075, 0.44],
    eject: [0.028, 0.08, -0.2],
    gripR: [0, 0, 0],
    gripL: [0, 0.065, 0.24],
    sightRear: [0, 0.192, -0.07],
    sightFront: [0, 0.193, 0.27],
    butt: [0, 0.038, -0.318],
  },
  ak47: {
    length: 0.88,
    hold: 'rifle',
    fit: [[-0.41, -0.41], [-0.08, -0.08], [0.17, 0.17], [0.79, 0.47]],
    muzzle: [0, 0.084, 0.468],
    eject: [0.023, 0.09, 0.12],
    gripR: [0, 0, 0],
    gripL: [0, 0.074, 0.281],
    sightRear: [0, 0.122, 0.238],
    sightFront: [0, 0.132, 0.426],
    butt: [0, -0.005, -0.408],
  },
  m4a1: {
    length: 0.84,
    hold: 'rifle',
    fit: [[-0.37, -0.32], [-0.08, -0.08], [0.17, 0.17], [0.71, 0.535]],
    muzzle: [0, 0.09, 0.528],
    eject: [0.019, 0.092, 0.1],
    gripR: [0, 0, 0],
    gripL: [0, 0.09, 0.278],
    sightRear: [0, 0.155, -0.045],
    sightFront: [0, 0.142, 0.38],
    butt: [0, 0.07, -0.312],
  },
  sg552: {
    length: 1,
    hold: 'rifle',
    fit: [[-0.345, -0.45], [-0.07, -0.07], [0.17, 0.17], [0.56, 0.56]],
    muzzle: [0, 0.082, 0.555],
    eject: [0.023, 0.075, 0.09],
    gripR: [0, 0, 0],
    gripL: [0, 0.073, 0.31],
    sightRear: [0, 0.169, -0.02],
    sightFront: [0, 0.172, 0.17],
    butt: [0, 0.023, -0.443],
  },
  aug: {
    length: 0.81,
    hold: 'rifle',
    fit: [[-0.53, -0.37], [-0.2, -0.2], [0.12, 0.12], [0.52, 0.435]],
    muzzle: [0, 0.07, 0.435],
    eject: [0.031, 0.05, -0.08],
    gripR: [0, 0, 0],
    gripL: [0, -0.015, 0.197],
    sightRear: [0, 0.175, -0.06],
    sightFront: [0, 0.177, 0.144],
    butt: [0, 0.032, -0.367],
  },
  scout: {
    length: 1,
    hold: 'rifle',
    fit: [[-0.44, -0.4], [-0.09, -0.09], [0.2, 0.2], [0.745, 0.6]],
    muzzle: [0, 0.09, 0.596],
    eject: [0.02, 0.1, 0.02],
    gripR: [0, 0, 0],
    gripL: [0, 0.06, 0.273],
    sightRear: [0, 0.168, -0.04],
    sightFront: [0, 0.172, 0.229],
    butt: [0, 0.013, -0.396],
  },
  awp: {
    length: 1.18,
    hold: 'rifle',
    fit: [[-0.49, -0.45], [-0.1, -0.1], [0.25, 0.25], [0.95, 0.73]],
    muzzle: [0, 0.09, 0.727],
    eject: [0.02, 0.1, 0.02],
    gripR: [0, 0, 0],
    gripL: [0, 0.045, 0.312],
    sightRear: [0, 0.187, -0.07],
    sightFront: [0, 0.196, 0.291],
    butt: [0, 0.005, -0.446],
  },
  g3sg1: {
    length: 1.02,
    hold: 'rifle',
    fit: [[-0.445, -0.4], [-0.09, -0.09], [0.2, 0.2], [0.835, 0.62]],
    muzzle: [0, 0.085, 0.617],
    eject: [0.022, 0.09, 0.1],
    gripR: [0, 0, 0],
    gripL: [0, 0.075, 0.332],
    sightRear: [0, 0.191, -0.05],
    sightFront: [0, 0.196, 0.226],
    butt: [0, 0.025, -0.396],
  },
  sg550: {
    length: 1,
    hold: 'rifle',
    fit: [[-0.425, -0.38], [-0.09, -0.09], [0.2, 0.2], [0.91, 0.62]],
    muzzle: [0, 0.084, 0.617],
    eject: [0.023, 0.085, 0.1],
    gripR: [0, 0, 0],
    gripL: [0, 0.075, 0.306],
    sightRear: [0, 0.187, -0.06],
    sightFront: [0, 0.193, 0.235],
    butt: [0, 0.02, -0.376],
  },
  m249: {
    length: 1.04,
    hold: 'rifle',
    fit: [[-0.445, -0.38], [-0.1, -0.1], [0.25, 0.25], [0.855, 0.66]],
    muzzle: [0, 0.095, 0.657],
    eject: [0.032, 0.075, 0.08],
    gripR: [0, 0, 0],
    gripL: [0, 0.04, 0.277],
    sightRear: [0, 0.158, -0.03],
    sightFront: [0, 0.135, 0.616],
    butt: [0, 0.015, -0.376],
  },
  hegrenade: {
    length: 0.07,
    hold: 'grenade',
    muzzle: [0, 0.056, 0.02],
    gripR: [0, 0, 0],
    gripL: [-0.04, 0.044, 0],
  },
  flashbang: {
    length: 0.046,
    hold: 'grenade',
    muzzle: [0, 0.064, 0.02],
    gripR: [0, 0, 0],
    gripL: [-0.04, 0.052, 0],
  },
  smokegrenade: {
    length: 0.06,
    hold: 'grenade',
    muzzle: [0, 0.066, 0.02],
    gripR: [0, 0, 0],
    gripL: [-0.04, 0.054, 0],
  },
  c4: {
    length: 0.2,
    hold: 'bomb',
    muzzle: [-0.065, 0, 0.15],
    gripR: [0, -0.008, 0.02],
    gripL: [-0.13, -0.008, 0.02],
  },
};

/** Geometrie-Daten eines Modells (undefiniert = unbekannt). */
export function weaponGeom(model: string): WeaponGeom | undefined {
  return WEAPON_GEOM[model];
}
