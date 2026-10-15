import { MapBuilder, type MapData } from '../logic/mapkit';
import { CellPlan, type CellKind, type FacadeStyle } from '../logic/mapplan';
import { dressTerrace, dressLane, dressMitte, dressAlley, dressKurz } from './speicherstadt/tspawn';
import { dressBanana } from './speicherstadt/banana';
import { dressSiteB, dressBaustelle } from './speicherstadt/siteB';
import { dressSiteA, dressPit, dressLongHall, dressBogen, dressLibrary, dressKessel } from './speicherstadt/siteA';
import { dressLoft } from './speicherstadt/loft';
import { dressCT } from './speicherstadt/ct';

/**
 * de_speicherstadt — „Speicherstadt“: der Klassiker de_inferno als Hamburger Hafen-Speicherviertel.
 * T-Spawn auf der Hafenterrasse (Süden), von dort T-Rampe zur Mitte, Banane (lange, gekrümmte
 * Lieferantengasse mit Lieferwagen, Sackbarrikaden und Baumstämmen) nach B, die Wohnungen (Speicher-
 * boden über zwei Lagerhäuser, Speicherbrücke über die Gasse) zum Balkon über A. B = Hof mit altem
 * Brunnen, Verladerampe, Büro, „Dunkel“ und Baustelle (CT-Seite); A = Kranhof mit Torbogen,
 * Bibliothek (Archiv), Grube und Kessel (Kurz). Bombenziele: Serverschränke, die die IT „in die
 * Nähe gestellt“ hat.
 *
 * Aufbau: ein Grundriss (2-m-Raster), Rampen/Treppen/Brücke explizit, Ausstattung je Bereich in
 * `speicherstadt/*.ts`. Höhen: Mitte/Gassen/B/Grube 0, Hochkai (T, CT, A) +1.6, Speicherboden/Balkon +4.4.
 */
export function buildSpeicherstadt(): MapData {
  const b = new MapBuilder({
    id: 'de_speicherstadt',
    name: 'Speicherstadt',
    description: 'Hafen-Speicherviertel im Abendlicht (de_inferno): Banane mit Lieferwagen nach B, Wohnungen über die Speicherbrücke zum Balkon, Kurz über den Kessel, Lange Halle zur Grube.',
    bounds: { min: [-86, -6, -92], max: [86, 26, 92] },
    env: {
      sunDir: [-0.5, 0.4, 0.76],
      sunColor: 0xffb878,
      sunIntensity: 1.6,
      skyTop: 0x466fa6,
      skyHorizon: 0xf2c394,
      skyIntensity: 0.55,
      ambient: 0.12,
      fogColor: 0xcdae8c,
      fogNear: 55,
      fogFar: 230,
    },
  });

  // ------------------------------------------------------------------ Grundriss (2-m-Raster)
  const P = new CellPlan(-86, -92, 86, 92, 2, '#');
  // Gebäudemassen: hohe Klinker-Speicher (H), mittlere (#), niedrige verputzte Häuser (G)
  P.rect('H', -86, -92, -46, -62)
    .rect('H', -86, -62, -76, 92)
    .rect('H', -54, 8, -12, 60)
    .rect('Y', 28, -36, 58, -6)
    .rect('H', 20, 4, 58, 62)
    .rect('H', 74, -92, 86, 92)
    .rect('G', -36, 8, -10, 58)
    .rect('G', 34, -92, 74, -84)
    .rect('Y', -32, -60, -10, -46);
  // Kanäle (Fleet) und Hafenbecken; Brücken entstehen durch spätere Straßenzellen
  P.rect('C', -86, 84, 86, 92) // Hafenbecken
    .rect('C', -38, -46, 34, -40) // Fleet vor der Oberen Mitte
    .rect('C', -86, -4, -40, 4); // Fleet an der Banane
  // Straßen und Plätze (Erdgeschoss, 0 m)
  // Banane: vier gegeneinander versetzte Abschnitte (je 6 m nach Westen) → keine durchgehende Sichtlinie
  P.rect('.', -58, 58, -46, 82) // Banane-Anfang (T-Ausgang)
    .rect('.', -64, 36, -52, 60) // Banane
    .rect('.', -70, 14, -58, 38) // Lieferwagen
    .rect('.', -76, -30, -64, 16) // Banane-Brücke → B-Eingang
    .rect('W', -78, -4, -76, 4)
    .rect('W', -64, -4, -62, 4)
    .rect('K', -70, 6, -64, 12) // Pförtnerhaus (Schikane)
    .rect('K', -76, -18, -70, -12) // Pumpenhaus (Schikane)
    .rect('.', -10, 8, 4, 48) // Untere Mitte (Lane unter der T-Rampe)
    .rect('.', 4, 22, 18, 46) // Kistenhof
    .rect('.', -18, -20, 10, 8) // Mitte
    .rect('M', -8, -12, 4, -2) // Zollwaage (Gebäude in der Mitte: bricht die Sichtachse T-Rampe → Obere Mitte)
    .rect('.', -6, -58, 6, -20) // Obere Mitte
    .rect('W', -8, -46, -6, -40)
    .rect('W', 6, -46, 8, -40)
    .rect('.', -16, -36, -6, -26) // Ladehof (Nische westlich der Oberen Mitte)
    .rect('.', -36, -36, -16, -28) // Brückengasse (Ladehof → Hof B, zweite Route der T nach B)
    .rect('.', 10, -4, 62, 4) // Zweite Mitte (Gasse)
    .rect('.', 14, -34, 26, -4) // Kurz
    .rect('.', 10, -18, 14, -8) // Kurz-Tor (Durchgang Mitte → Kurz)
    .rect('X', 62, -38, 72, 4); // Lange Halle (überdacht)
  // Hochkai +1.6: T-Terrasse, CT-Hof, Bogen, Passage, Baustelle, Dock, A-Hof
  P.rect('T', -34, 60, 16, 82)
    .rect('V', -34, 82, 16, 84)
    .rect('h', -16, -90, 16, -70) // CT-Hof
    .rect('b', 16, -84, 34, -74) // Bogen
    .rect('w', -34, -84, -16, -74) // CT-Passage
    .rect('h', -46, -84, -34, -54) // Baustelle
    .rect('h', -80, -62, -46, -54) // Dock
    .rect('o', -58, -72, -48, -64) // Büro auf dem Dock
    .rect('q', -54, -64, -50, -62)
    .rect('h', 34, -84, 72, -52) // A-Hof
    .rect('h', 34, -52, 48, -38)
    .rect('l', 18, -70, 32, -54) // Bibliothek
    .rect('q', 22, -74, 26, -70)
    .rect('q', 32, -62, 34, -56)
    .rect('k', 14, -52, 34, -42); // Kessel
  // Hof B, Dunkel, Grube
  P.rect('j', -76, -54, -36, -28)
    .rect('n', -86, -48, -78, -20) // Dunkel (dunkles Lager, zwei Türen: zum Hof und zur Banane)
    .rect('Q', -78, -44, -76, -36)
    .rect('Q', -78, -26, -76, -22)
    .rect('g', 56, -52, 72, -38); // Grube
  // Rampen (Unterbau auf 0 m, Keil kommt explizit)
  P.rect('r', -10, 48, 4, 60) // T-Rampe
    .rect('r', -46, 66, -34, 78) // Banane-Rampe
    .rect('r', -6, -70, 6, -58) // CT-Rampe
    .rect('r', -46, -54, -36, -42) // Baustellen-Rampe
    .rect('r', 14, -42, 26, -34) // Kurz-Rampe
    .rect('r', 48, -52, 56, -42); // Grubenrampe
  // Speicherböden (Wohnungen): Eingang/Treppe, Südhalle, Speicherbrücke, Nordhalle, Balkon
  P.rect('q', 16, 62, 20, 68)
    .rect('e', 20, 56, 30, 70)
    .rect('z', 20, 44, 28, 56)
    .rect('L', 20, 6, 56, 44)
    .rect('p', 20, 24, 56, 26)
    .rect('L', 22, 24, 28, 26)
    .rect('L', 46, 24, 52, 26)
    .rect('B', 36, 4, 44, 6)
    .rect('B', 36, -8, 44, -4)
    .rect('L', 30, -28, 56, -8)
    .rect('p', 30, -30, 56, -28)
    .rect('f', 40, -30, 48, -28)
    .rect('y', 36, -38, 54, -30)
    .rect('s', 38, -46, 46, -38); // Balkontreppe (Hof A)

  const legend: Record<string, CellKind> = {
    '#': { building: { h: 13, mat: 'brick', tint: 0xcdb09c } },
    H: { building: { h: 18, mat: 'brick', tint: 0xb8998a } },
    Y: { building: { h: 15, mat: 'brick', tint: 0xd9c496 } },
    G: { building: { h: 9.5, mat: 'plaster', tint: 0xe8d29c } },
    W: { building: { h: 1.7, mat: 'brick', tint: 0xcaa890 } },
    M: { building: { h: 7.6, mat: 'brick', tint: 0xd9c496 } },
    K: { building: { h: 5.2, mat: 'plaster', tint: 0xe8d29c } },
    V: { building: { h: 3.6, mat: 'brick', tint: 0xcaa890 } },
    p: { building: { h: 10.1, mat: 'plaster', tint: 0xe0d2b4 } },
    C: { building: { h: -1.2, mat: 'brick', tint: 0x7a6a60, top: 'water' } },
    '.': { floor: 0, mat: 'brick', tint: 0xb89c88, top: 'cobble', room: 'outdoor' },
    r: { floor: 0, mat: 'brick', tint: 0xb89c88, top: 'cobble', ramp: true, room: 'outdoor' },
    g: { floor: 0, mat: 'brick', tint: 0xa8907c, top: 'cobble', room: 'outdoor' },
    j: { floor: 0, mat: 'brick', tint: 0xb89c88, top: 'cobble', room: 'outdoor' },
    T: { floor: 1.6, mat: 'brick', tint: 0xb89c88, top: 'cobble', room: 'outdoor' },
    h: { floor: 1.6, mat: 'brick', tint: 0xb89c88, top: 'cobble', room: 'outdoor' },
    w: { floor: 1.6, mat: 'brick', tint: 0xb89c88, top: 'cobble', room: 'outdoor' },
    s: { floor: 1.6, mat: 'brick', tint: 0xb89c88, top: 'cobble', ramp: true, room: 'outdoor' },
    b: { floor: 1.6, mat: 'brick', tint: 0xa8907c, top: 'paving', roof: 5.4, roofTop: 5.9, roofMat: 'wood', room: 'tunnel' },
    l: { floor: 1.6, mat: 'wood', tint: 0xa88a6a, roof: 5.2, roofTop: 5.7, roofMat: 'wood', room: 'room' },
    k: { floor: 1.6, mat: 'concrete', tint: 0x9a948a, top: 'paving', roof: 6.6, roofTop: 7.1, roofMat: 'wood', room: 'hall' },
    o: { floor: 1.6, mat: 'wood', tint: 0xb89a74, roof: 4.4, roofTop: 4.9, roofMat: 'wood', room: 'room' },
    n: { floor: 0, mat: 'concreteDark', tint: 0x8a8278, top: 'wood', roof: 4.2, roofTop: 4.7, roofMat: 'wood', room: 'room' },
    q: { floor: 1.6, mat: 'wood', tint: 0xa88a6a, roof: 4.6, roofTop: 5.1, roofMat: 'wood', room: 'room' },
    Q: { floor: 0, mat: 'wood', tint: 0xa88a6a, roof: 3.4, roofTop: 3.9, roofMat: 'wood', room: 'room' },
    e: { floor: 1.6, mat: 'brick', tint: 0xa8907c, top: 'wood', roof: 7.2, roofTop: 7.7, roofMat: 'wood', room: 'hall' },
    z: { floor: 1.6, mat: 'brick', tint: 0xa8907c, top: 'wood', ramp: true, roof: 7.2, roofTop: 7.7, roofMat: 'wood', room: 'hall' },
    X: { floor: 0, mat: 'brick', tint: 0xa8907c, top: 'paving', roof: 9, roofTop: 9.5, roofMat: 'wood', room: 'hall' },
    L: { floor: 4.4, mat: 'wood', tint: 0xa88a6a, roof: 9.6, roofTop: 10.1, roofMat: 'wood', room: 'hall' },
    B: { floor: 4.4, mat: 'wood', tint: 0xa88a6a, roof: 7.6, roofTop: 8.1, roofMat: 'wood', room: 'room' },
    f: { floor: 4.4, mat: 'wood', tint: 0xa88a6a, roof: 7.6, roofTop: 8.1, roofMat: 'wood', room: 'room' },
    y: { floor: 4.4, mat: 'wood', tint: 0xa88a6a, room: 'outdoor' },
  };
  const brickFacade: FacadeStyle = {
    mat: 'brick', tint: 0xcdb09c, plinth: { h: 1.1, mat: 'concreteDark', tint: 0x8a7e74 },
    cornice: { h: 0.45, mat: 'brick', tint: 0x9a7868 },
    pilasters: { every: 6, w: 0.5, mat: 'brick', tint: 0xb89080 },
    windows: [
      { y: 2.4, h: 2.0, w: 1.3, every: 3, mat: 'window', tint: 0xcdb8a0 },
      { y: 6.4, h: 2.0, w: 1.3, every: 3, mat: 'window', tint: 0xcdb8a0 },
      { y: 10.4, h: 2.0, w: 1.3, every: 3, mat: 'window', tint: 0xcdb8a0 },
    ],
    pipes: 14,
  };
  const facades: Record<string, FacadeStyle> = {
    '@#': brickFacade,
    '@H': { ...brickFacade, tint: 0xb8998a, band: { y: 8.2, h: 0.35, mat: 'concrete', tint: 0xb8a898 } },
    '@Y': { ...brickFacade, tint: 0xd9c496, band: { y: 4.4, h: 0.3, mat: 'brick', tint: 0xb08a70 } },
    X: { mat: 'brick', tint: 0xc0a290, plinth: { h: 1.2, mat: 'concreteDark', tint: 0x7a6e64 }, pilasters: { every: 8, w: 0.5, mat: 'wood', tint: 0x6a4a30 } },
    '@G': { mat: 'plaster', tint: 0xe8d29c, plinth: { h: 1.0, mat: 'brick', tint: 0x9a7868 }, cornice: { h: 0.4, mat: 'plaster', tint: 0xc4ac78 }, windows: { y: 2.6, h: 2.0, w: 1.4, every: 3.6, mat: 'window' }, pipes: 12 },
    '@W': { mat: 'brick', tint: 0xcaa890, cornice: { h: 0.2, mat: 'concrete', tint: 0xb4a898 } },
    '@M': { mat: 'brick', tint: 0xd9c496, plinth: { h: 1.0, mat: 'concreteDark', tint: 0x8a7e74 }, band: { y: 3.6, h: 0.3, mat: 'concrete', tint: 0xb8a898 }, cornice: { h: 0.5, mat: 'brick', tint: 0x9a7868 }, pilasters: { every: 6, w: 0.5, mat: 'brick', tint: 0xc0a080 }, windows: [{ y: 1.8, h: 1.6, w: 1.2, every: 3, mat: 'window', tint: 0xcdb8a0 }, { y: 4.6, h: 1.6, w: 1.2, every: 3, mat: 'window', tint: 0xcdb8a0 }] },
    '@K': { mat: 'plaster', tint: 0xe8d29c, plinth: { h: 1.0, mat: 'brick', tint: 0x9a7868 }, cornice: { h: 0.35, mat: 'plaster', tint: 0xc4ac78 }, windows: { y: 2.2, h: 1.4, w: 1.2, every: 3, mat: 'window' } },
    '@V': { mat: 'brick', tint: 0xcaa890, cornice: { h: 0.2, mat: 'concrete', tint: 0xb4a898 } },
    '@p': { mat: 'plaster', tint: 0xe0d2b4 },
    // Innenräume: weiß gekalkte Wände mit Holzsockel
    L: { mat: 'plaster', tint: 0xe2d4b6, plinth: { h: 1.2, mat: 'wood', tint: 0x8a6a48 }, pilasters: { every: 6, w: 0.4, mat: 'wood', tint: 0x7a5a3a } },
    B: { mat: 'plaster', tint: 0xe2d4b6, plinth: { h: 1.2, mat: 'wood', tint: 0x8a6a48 } },
    f: { mat: 'plaster', tint: 0xe2d4b6, plinth: { h: 1.2, mat: 'wood', tint: 0x8a6a48 } },
    e: { mat: 'brick', tint: 0xd0b09c, plinth: { h: 1.2, mat: 'concreteDark', tint: 0x8a7e74 } },
    z: { mat: 'brick', tint: 0xd0b09c, plinth: { h: 1.2, mat: 'concreteDark', tint: 0x8a7e74 } },
    q: { mat: 'plaster', tint: 0xe2d4b6, plinth: { h: 1.0, mat: 'wood', tint: 0x8a6a48 } },
    Q: { mat: 'plaster', tint: 0xe2d4b6, plinth: { h: 1.0, mat: 'wood', tint: 0x8a6a48 } },
    b: { mat: 'brick', tint: 0xc8a894 },
    k: { mat: 'brick', tint: 0xc8a894, plinth: { h: 1.4, mat: 'concreteDark', tint: 0x7a6e64 }, band: { y: 1.4, h: 0.2, mat: 'hazard' } },
    l: { mat: 'wood', tint: 0xc0a07c, plinth: { h: 0.9, mat: 'wood', tint: 0x7a5a3a } },
    o: { mat: 'wood', tint: 0xc8aa84, plinth: { h: 0.9, mat: 'wood', tint: 0x7a5a3a } },
    n: { mat: 'brick', tint: 0xa8887a },
  };
  P.build(b, legend, { floorBottom: -4, lintelTop: 12, lintelMat: 'brick', lintelTint: 0xd0b09c, facades });

  // ------------------------------------------------------------------ Rampen & Treppen
  const rampOpts = { top: 'cobble' as const, tint: 0xb89c88, tag: 'ramp' };
  b.ramp(-10, 48, 4, 60, 0, 1.6, 'pz', 'brick', rampOpts); // T-Rampe
  b.ramp(-46, 66, -34, 78, 0, 1.6, 'px', 'brick', rampOpts); // Banane-Rampe
  b.ramp(-6, -70, 6, -58, 0, 1.6, 'nz', 'brick', rampOpts); // CT-Rampe
  b.ramp(-46, -54, -36, -42, 0, 1.6, 'nz', 'brick', rampOpts); // Baustellen-Rampe
  b.ramp(14, -42, 26, -34, 0, 1.6, 'nz', 'brick', rampOpts); // Kurz-Rampe
  b.ramp(48, -52, 56, -42, 0, 1.6, 'nx', 'brick', rampOpts); // Grubenrampe
  b.stairs(20, 44, 28, 56, 1.6, 4.4, 'nz', 'wood', { tint: 0xa88a6a }); // Treppe zum Speicherboden
  b.stairs(38, -46, 46, -38, 1.6, 4.4, 'pz', 'wood', { tint: 0xa88a6a }); // Balkontreppe

  // Speicherbrücke über die Gasse (Zweite Mitte)
  b.box([36, 3.9, -4], [44, 4.4, 4], 'wood', { tint: 0xa88a6a, tag: 'floor' });
  b.roof(35.8, -4, 44.2, 4, 7.6, 'roof');
  for (const x of [36, 44]) b.wallZ(-4, 4, x, 4.4, 7.6, 'plaster', [{ from: -2.6, to: -0.8, bottom: 5.6, top: 6.9 }, { from: 0.8, to: 2.6, bottom: 5.6, top: 6.9 }], { thick: 0.4, tint: 0xe2d4b6 });

  // ------------------------------------------------------------------ Callouts
  b.area('T-Spawn', -34, 60, 16, 82);
  b.area('T-Rampe', -10, 48, 4, 60);
  b.area('Untere Mitte', -10, 8, 4, 48);
  b.area('Kistenhof', 4, 22, 18, 46);
  b.area('Mitte', -18, -20, 10, 8);
  b.area('Obere Mitte', -6, -58, 6, -20);
  b.area('Fleet-Brücke', -8, -46, 8, -40);
  b.area('Ladehof', -16, -36, -6, -26);
  b.area('Brückengasse', -36, -36, -16, -28);
  b.area('CT-Rampe', -6, -70, 6, -58);
  b.area('CT-Spawn', -16, -90, 16, -70, 0, 6);
  b.area('Zweite Mitte', 10, -4, 60, 4, -1, 3);
  b.area('Kurz', 14, -34, 26, -4);
  b.area('Kurz-Rampe', 14, -42, 26, -34);
  b.area('Kessel', 14, -52, 34, -42, 0.5, 8);
  b.area('Lange Halle', 62, -38, 72, 4);
  b.area('Grube', 56, -52, 72, -38, -1, 1);
  b.area('Grubenrampe', 48, -52, 56, -42, -1, 3);
  b.area('Spot A', 38, -76, 66, -46, 0.5, 8);
  b.area('A-Hof', 34, -84, 72, -52, 0.5, 8);
  b.area('Bogen', 16, -84, 34, -74, 0.5, 8);
  b.area('Bibliothek', 18, -70, 32, -54, 0.5, 8);
  b.area('Balkontreppe', 38, -46, 46, -38, 0.5, 6);
  b.area('Balkon', 36, -38, 54, -30, 3.5, 9);
  b.area('Speicherbrücke', 36, -8, 44, 6, 3.5, 9);
  b.area('Wohnungen Nord', 30, -28, 56, -8, 3.5, 11);
  b.area('Wohnungen Süd', 20, 6, 56, 44, 3.5, 11);
  b.area('Treppenhaus', 20, 44, 30, 70, 0.5, 9);
  b.area('Banane-Anfang', -58, 58, -46, 82);
  b.area('Banane', -64, 36, -52, 60);
  b.area('Lieferwagen', -70, 14, -58, 38);
  b.area('Banane-Brücke', -76, -14, -64, 16);
  b.area('Spot B', -76, -54, -36, -28, -1, 3);
  b.area('B-Eingang', -76, -30, -64, -14);
  b.area('Dunkel', -86, -48, -76, -20);
  b.area('Baustelle', -46, -84, -34, -54);
  b.area('CT-Passage', -34, -84, -16, -74);
  b.area('Verladerampe', -80, -62, -46, -54);
  b.area('Büro', -58, -72, -48, -64);

  // ------------------------------------------------------------------ Spots, Spawns, Kaufzonen
  b.site('A', 'Serverschrank A', [38, 1.0, -76], [66, 8, -46], [45.5, 1.6, -55]);
  b.site('B', 'Serverschrank B', [-74, -1, -54], [-38, 4, -28], [-65.6, 0, -32.6]);

  // Bot-Hinweise: bewährte Rauchwürfe der T (Sichtblocker vor den Halte-Positionen der CT), Werte per Wurfsimulation geprüft
  b.botHint({ kind: 'smoke', from: [-67.5, 0, -18.5], target: [-66, 0, -38], team: 'T', site: 'B' }); // aus der Banane auf die Serverschränke B
  b.botHint({ kind: 'smoke', from: [-71.5, 0, -22.5], target: [-70, 0, -42], team: 'T', site: 'B' }); // in den Hof, Richtung Dunkel
  b.botHint({ kind: 'smoke', from: [-75.5, 0, -26.5], target: [-62, 0, -44], team: 'T', site: 'B' }); // über den Brunnen
  b.botHint({ kind: 'smoke', from: [23.5, 1.1, -39.5], target: [40, 1.6, -56], team: 'T', site: 'A' }); // von der Kurz-Rampe vor den Kessel-Ausgang
  b.botHint({ kind: 'smoke', from: [31.5, 1.6, -46.5], target: [44, 1.6, -66], team: 'T', site: 'A' }); // aus dem Kessel auf die Container
  b.botHint({ kind: 'smoke', from: [61.5, 0, -50.5], target: [56, 1.6, -70], team: 'T', site: 'A' }); // aus der Grube in den Friedhof
  b.botHint({ kind: 'smoke', from: [57.5, 0, -42.5], target: [52, 1.6, -62], team: 'T', site: 'A' }); // aus der Grube auf die Serverschränke A
  b.spawnGrid('T', -11, 1.6, 63, 8, 2, 3, 0);
  b.spawnGrid('CT', -2, 1.6, -81, 8, 2, 3, Math.PI);
  b.buy('T', -34, 60, 16, 82);
  b.buy('CT', -16, -90, 16, -70);

  dressTerrace(b);
  dressLane(b);
  dressMitte(b);
  dressAlley(b);
  dressKurz(b);
  dressBanana(b);
  dressSiteB(b);
  dressBaustelle(b);
  dressSiteA(b);
  dressPit(b);
  dressLongHall(b);
  dressBogen(b);
  dressLibrary(b);
  dressKessel(b);
  dressLoft(b);
  dressCT(b);

  return b.data;
}
