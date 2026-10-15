import { MapBuilder, type MapData } from '../logic/mapkit';
import { CellPlan, type CellKind, type FacadeStyle } from '../logic/mapplan';
import { dressA } from './umschlag/a';
import { dressB } from './umschlag/b';
import { dressCT } from './umschlag/ct';
import { dressMid } from './umschlag/mid';
import { dressT } from './umschlag/t';
import { LV, railedStairs } from './umschlag/common';

/**
 * de_umschlag — „Umschlag“: der Klassiker de_mirage als Umschlaghalle (Cross-Docking-Hub).
 *
 * Topologie wie im Vorbild: T-Ladehof im Süden mit vier Ausgängen — Wohnungen (Sozialtrakt, oberer
 * Gang nach B), Mitte (Tor Süd in die Umschlaghalle), T-Rampe (Lkw-Rampe auf die Rampe A) und Palast
 * (Disponenten-Büros im Obergeschoss mit Balkon über Rampe A). Die lange Umschlaghalle ist die Mitte:
 * Obere Mitte im Norden unter dem Fenster (Leitstand, +4.4 m, offene Scheibenwand über der Halle), der
 * Steg (Wartungslaufsteg an der Sortieranlage, +4.4 m) führt als Kurz-Brücke nach B, die Unterführung
 * (Servicegang −3.6 m) vom Schacht in der Halle zur Rampe in die Paketsortierung B. Rampe A (Außen,
 * +2 m) mit Treppe, Feuerkiste, Dreierkiste, Pförtnerhaus, Sandwich unter dem Vordach, Dschungel
 * (Pausenhof mit Pflanzen und Stühlen) und Verbindung zur Halle. B: Lieferwagen, Bank, Markt
 * (Retourenlager mit Fenster und Tür), Küche (Kantine). Bombenziele: Serverschränke, die die IT
 * „vorübergehend“ auf die Rampe A bzw. in die Paketsortierung gestellt hat.
 *
 * Höhen: Unterführung −3.6, Boden 0, Rampe A +2.0, Obergeschoss (Wohnungen, Fenster, Steg) +4.4,
 * Palast/Balkon +5.6. Aufbau: drei Grundrisse übereinander — Erdgeschoss (`G`, dünne Platte),
 * Untergeschoss (`U`) und Obergeschoss (`O`, Räume auf massiven Sockeln). Detailbau in `./umschlag/*`.
 */
export function buildUmschlag(): MapData {
  const b = new MapBuilder({
    id: 'de_umschlag',
    name: 'Umschlag',
    description: 'Cross-Docking-Hub nach dem Vorbild de_mirage: Palast und T-Rampe nach A, Fenster über der langen Mitte, Steg und Unterführung nach B.',
    bounds: { min: [-92, -8, -92], max: [92, 24, 92] },
    env: {
      sunDir: [-0.35, 0.78, 0.52],
      sunColor: 0xffd9a0,
      sunIntensity: 1.6,
      skyTop: 0x4f86c6,
      skyHorizon: 0xf2dcb4,
      skyIntensity: 0.6,
      ambient: 0.18,
      fogColor: 0xd6c6a4,
      fogNear: 70,
      fogFar: 260,
    },
  });

  // ------------------------------------------------------------------ Erdgeschoss (2-m-Raster)
  const G = new CellPlan(-92, -92, 92, 92, 2, '#');
  G
    // Sockel der Obergeschosse (massiv, Dach = Gehfläche der Obergeschoss-Räume)
    .rect('a', -86, -16, -58, 26) // Sozialtrakt (Wohnungen)
    .rect('R', -26, -34, -16, 14) // niedriger Anbau zwischen Halle und Sortierung (Kurz-Brücke)
    .rect('d', 68, -8, 90, 34) // Disposition (Palast)
    // T-Ladehof, Wohnungs-Aufgang, Vorplatz Süd
    .rect('Y', -86, 48, 90, 88)
    .rect('Y', -86, 38, -58, 48)
    .rect('q', -86, 26, -58, 38)
    .rect('S', -70, 26, -64, 38) // Wohnungs-Treppe (steigt nach Norden)
    .rect('Y', -24, 30, 14, 48) // Vorplatz Süd (T-Mitte)
    // T-Rampe (Lkw-Rampe) mit Seitenmauern, Palast-Aufgang
    .rect('S', 34, 30, 46, 48)
    .rect('q', 68, 34, 90, 48)
    .rect('T', 76, 34, 84, 48) // Palast-Treppe (steigt nach Norden)
    // Umschlaghalle (Mitte)
    .rect('H', -14, -34, 14, 26)
    .rect('g', -8, 26, 8, 30) // Tor Süd
    .rect('v', -14, 16, -4, 22) // Schacht Unterführung (Treppe hinab)
    .rect('K', 0, -34, 14, -20) // Sockel Leitstand
    .rect('D', -16, -26, -14, -20) // Steg-Tür (Westwand, +4.4)
    // Rampe A (Außen), Vordach (Sandwich), Treppen, Verbindung, Dschungel, Pförtner-Gasse, CT-Gasse
    .rect('P', 16, 2, 68, 30)
    .rect('V', 16, 4, 28, 30)
    .rect('S', 46, -6, 54, 2) // Treppe (CT-Seite)
    .rect('S', 24, -6, 34, 2) // Dschungel-Treppe
    .rect('L', 38, -14, 66, -6)
    .rect('J', 20, -24, 38, -6)
    .rect('c', 14, -16, 20, -8) // Verbindung
    .rect('N', 44, -46, 54, -14)
    // CT-Halle, Gänge, Leitstand-Zugang
    .rect('C', -10, -74, 40, -38)
    .rect('n', -12, -38, -2, -34) // Tore Obere Mitte
    .rect('K', 4, -38, 12, -34) // Sockel Leitstand-Gang
    .rect('e', 40, -46, 44, -40) // CT-Tür (Ost)
    // B-Halle (Paketsortierung), Unterführungs-Rampe, Markt, Küche
    .rect('B', -72, -60, -28, -16)
    .rect('r', -52, -16, -46, -2) // Unterführungs-Rampe
    .rect('D', -28, -26, -26, -20) // Steg-Tür B (Ostwand, +4.4)
    .rect('M', -64, -82, -44, -62) // Markt
    .rect('o', -58, -62, -52, -60) // Markttür
    .rect('X', -48, -62, -44, -60) // Marktfenster
    .rect('E', -42, -78, -24, -62) // Küche
    .rect('o', -34, -62, -30, -60) // Küchentür (B)
    .rect('o', -44, -74, -42, -70) // Markt ↔ Küche
    .rect('e', -24, -72, -10, -66); // Küchengang → CT

  const out = { room: 'outdoor' as const };
  const legend: Record<string, CellKind> = {
    '#': { building: { h: 12, mat: 'corrugated', tint: 0xb4bcc2 } },
    a: { building: { h: 4, mat: 'concrete', tint: 0xb8b2a4 } },
    R: { building: { h: 4, mat: 'concrete', tint: 0xb8b2a4 } },
    d: { building: { h: 5.2, mat: 'concrete', tint: 0xb8b2a4 } },
    K: { building: { h: 4, mat: 'concrete', tint: 0xb8b2a4 } },
    q: { building: { h: 7, mat: 'plaster', tint: 0xe6dcc4 } },
    D: { building: { h: 12, mat: 'corrugated', tint: 0xb4bcc2 }, window: { sill: LV.up, lintel: LV.up + 3.2 } },
    X: { building: { h: 12, mat: 'corrugated', tint: 0xb4bcc2 }, window: { sill: 1.0, lintel: 2.6 } },
    Y: { floor: 0, mat: 'concrete', tint: 0xcdcdc6, ...out },
    S: { floor: 0, mat: 'concrete', tint: 0xe0d8c8, ramp: true, ...out },
    T: { floor: 0, mat: 'concrete', tint: 0xe0d8c8, ramp: true, ...out },
    P: { floor: LV.apron, mat: 'concrete', tint: 0xdcd2bf, ...out },
    V: { floor: LV.apron, mat: 'concrete', tint: 0xb8b0a0, roof: 7.2, roofTop: 7.6, roofMat: 'corrugatedDark', room: 'hall' },
    L: { floor: 0, mat: 'paving', tint: 0xd8d0c0, ...out },
    N: { floor: 0, mat: 'paving', tint: 0xd8d0c0, ...out },
    J: { floor: 0, mat: 'paving', tint: 0xb0b8a8, ...out },
    c: { floor: 0, mat: 'concrete', tint: 0xb4aea0, roof: 4.8, roofTop: 12, roofMat: 'concrete', room: 'room' },
    H: { floor: 0, mat: 'epoxy', tint: 0xb4b8b4, roof: 11, roofTop: 11.5, roofMat: 'roof', room: 'hall' },
    g: { floor: 0, mat: 'concrete', tint: 0xb4aea0, roof: 6, roofTop: 12, roofMat: 'concrete', room: 'hall' },
    n: { floor: 0, mat: 'concrete', tint: 0xb4aea0, roof: 6, roofTop: 12, roofMat: 'concrete', room: 'hall' },
    e: { floor: 0, mat: 'concrete', tint: 0xb4aea0, roof: 4.4, roofTop: 12, roofMat: 'concrete', room: 'room' },
    v: { floor: LV.under, bottom: -8, mat: 'concreteDark', tint: 0xa8a8a0, roof: 11, roofTop: 11.5, roofMat: 'roof', room: 'tunnel' },
    r: { floor: LV.under, bottom: -8, mat: 'concreteDark', tint: 0xa8a8a0, roof: 3.6, roofTop: 12, roofMat: 'concrete', room: 'tunnel' },
    C: { floor: 0, mat: 'epoxy', tint: 0xb8bcb8, roof: 8.6, roofTop: 9.1, roofMat: 'roof', room: 'hall' },
    B: { floor: 0, mat: 'epoxy', tint: 0xb4b8b4, roof: 8.2, roofTop: 8.7, roofMat: 'roof', room: 'hall' },
    M: { floor: 0, mat: 'wood', tint: 0xb8a890, roof: 4.6, roofTop: 12, roofMat: 'concrete', room: 'room' },
    E: { floor: 0, mat: 'tile', tint: 0xd0d4d0, roof: 4.2, roofTop: 12, roofMat: 'concrete', room: 'room' },
    o: { floor: 0, mat: 'concrete', tint: 0xb4aea0, roof: 3.6, roofTop: 12, roofMat: 'concrete', room: 'room' },
  };
  const hallWall = (tint: number, pil = 0x3a6fa8, win = { y: 7.6, h: 2.0 }): FacadeStyle => ({
    mat: 'corrugated', tint, plinth: { h: 1.6, mat: 'concrete', tint: 0x8d8a84 }, band: { y: 1.6, h: 0.3, mat: 'hazard' },
    pilasters: { every: 8, w: 0.5, mat: 'steel', tint: pil }, windows: { y: win.y, h: win.h, w: 4, every: 8, mat: 'skylight', tint: 0xd8e4ee },
  });
  const outdoorHall: FacadeStyle = {
    mat: 'corrugated', tint: 0xc6ccd0, plinth: { h: 1.4, mat: 'concrete', tint: 0x9a968e }, band: { y: 6.4, h: 0.4, mat: 'metal', tint: 0xe08a1c },
    cornice: { h: 0.4, mat: 'metal', tint: 0x6a7480 }, pipes: 18,
  };
  const facadesG: Record<string, FacadeStyle> = {
    '@#': outdoorHall,
    '@a': { mat: 'concrete', tint: 0xb8b2a4, plinth: { h: 1.0, mat: 'concreteDark', tint: 0x8a8580 } },
    '@R': { mat: 'concrete', tint: 0xb8b2a4 },
    '@d': { mat: 'concrete', tint: 0xb8b2a4, plinth: { h: 1.0, mat: 'concreteDark', tint: 0x8a8580 } },
    '@K': { mat: 'concrete', tint: 0xb8b2a4 },
    '@q': { mat: 'plaster', tint: 0xe6dcc4, band: { y: 1.0, h: 0.25, mat: 'hazard' } },
    H: hallWall(0xd2d6d6),
    C: hallWall(0xd6d8d4, 0xe08a1c, { y: 5.8, h: 1.8 }),
    B: hallWall(0xd2d4d0, 0x2f7d6f, { y: 5.4, h: 1.6 }),
    g: { mat: 'concreteDark', tint: 0xb0aca4, band: { y: 1.0, h: 0.3, mat: 'hazard' } },
    n: { mat: 'concreteDark', tint: 0xb0aca4, band: { y: 1.0, h: 0.3, mat: 'hazard' } },
    c: { mat: 'plaster', tint: 0xd8cdb4, plinth: { h: 1.1, mat: 'wallTile', tint: 0x7a8a8a } },
    e: { mat: 'plaster', tint: 0xd8cdb4, plinth: { h: 1.1, mat: 'wallTile', tint: 0x7a8a8a } },
    o: { mat: 'plaster', tint: 0xd8cdb4, plinth: { h: 1.1, mat: 'wallTile', tint: 0x7a8a8a } },
    M: { mat: 'plaster', tint: 0xdcd0b8, plinth: { h: 1.2, mat: 'wallPaint', tint: 0x6a7f7a }, band: { y: 1.2, h: 0.2, mat: 'metal', tint: 0xd8b020 } },
    E: { mat: 'wallTile', tint: 0xe8ece8, plinth: { h: 1.2, mat: 'wallTile', tint: 0x3f7f78 } },
    v: { mat: 'concrete', tint: 0xa8a49c, band: { y: 1.0, h: 0.3, mat: 'hazard' } },
    r: { mat: 'concrete', tint: 0xa8a49c, band: { y: 1.0, h: 0.3, mat: 'hazard' } },
    V: { mat: 'corrugated', tint: 0xc0c6ca, plinth: { h: 1.2, mat: 'concrete', tint: 0x8d8a84 }, band: { y: 1.2, h: 0.3, mat: 'hazard' } },
    J: { mat: 'plaster', tint: 0xdcd2b4, plinth: { h: 1.0, mat: 'wallTile', tint: 0x6f9a74 } },
    L: { mat: 'brick', tint: 0xb48a74, plinth: { h: 0.8, mat: 'concreteDark', tint: 0x8a8580 } },
    N: { mat: 'brick', tint: 0xb48a74, plinth: { h: 0.8, mat: 'concreteDark', tint: 0x8a8580 } },
    P: { mat: 'brick', tint: 0xb48a74, plinth: { h: 0.9, mat: 'concreteDark', tint: 0x8a8580 } },
    S: { mat: 'plaster', tint: 0xe6dcc4, band: { y: 1.0, h: 0.25, mat: 'hazard' } },
    T: { mat: 'plaster', tint: 0xe6dcc4, band: { y: 1.0, h: 0.25, mat: 'hazard' } },
  };
  G.build(b, legend, { floorBottom: -0.3, lintelTop: 11.5, facades: facadesG });

  // ------------------------------------------------------------------ Untergeschoss (Unterführung, Boden −3.6)
  const U = new CellPlan(-92, -92, 92, 92, 2, '#');
  U
    .rect('u', -52, -2, -46, 22)
    .rect('u', -52, 16, -14, 22)
    .rect('_', -14, 16, -4, 22) // Schacht (G-Plan)
    .rect('_', -52, -16, -46, -2); // Rampe (G-Plan)
  const ulegend: Record<string, CellKind> = {
    '#': { building: { h: -0.3, mat: 'concrete', tint: 0xa8a49c } },
    _: {},
    u: { floor: LV.under, mat: 'concreteDark', tint: 0x9c9a92, roof: -0.6, roofTop: -0.3, roofMat: 'concrete', room: 'tunnel', tunnel: true },
  };
  U.build(b, ulegend, {
    floorBottom: -8, lintelTop: -0.3,
    facades: { u: { mat: 'concrete', tint: 0x9a968e, plinth: { h: 1.0, mat: 'concreteDark' }, band: { y: 1.3, h: 0.14, mat: 'metal', tint: 0xd8b020 } } },
  });

  // ------------------------------------------------------------------ Obergeschoss (+4.4) und Palast (+5.6)
  const O = new CellPlan(-92, -92, 92, 92, 2, '.');
  O
    // Wohnungen (Sozialtrakt): Gang, Umkleiden, Pausenraum
    .rect('W', -86, -16, -58, 26)
    .rect('k', -70, -16, -64, 26)
    .rect('o', -84, -10, -72, 4).rect('k', -72, -6, -70, 0)
    .rect('o', -84, 8, -72, 24).rect('k', -72, 14, -70, 20)
    // Steg: Plattform in der Halle, Tür, Brücke, Plattform in B
    .rect('x', -14, -26, -10, 2)
    .rect('x', -16, -26, -14, -20)
    .rect('b', -26, -26, -16, -20)
    .rect('x', -28, -26, -26, -20)
    .rect('x', -38, -26, -28, -20)
    // Leitstand (Fenster)
    .rect('W', 0, -36, 14, -20)
    .rect('W', 4, -38, 12, -34)
    .rect('w', 2, -34, 12, -20)
    .rect('w', 6, -38, 10, -34)
    // Palast (Disposition) und Balkon
    .rect('W', 68, -8, 90, 34)
    .rect('p', 76, 22, 84, 34)
    .rect('P', 70, 6, 84, 22)
    .rect('Q', 68, 6, 70, 22)
    .rect('p', 68, 12, 70, 16)
    .rect('y', 60, 8, 68, 24);
  const olegend: Record<string, CellKind> = {
    '.': {},
    W: { building: { h: 8.2, mat: 'plaster', tint: 0xd8cdb4 }, bottom: LV.up - 0.4 },
    k: { floor: LV.up, bottom: LV.up - 0.4, mat: 'tile', tint: 0xcfc8b8, roof: 7.8, roofTop: 8.2, roofMat: 'concrete', room: 'room' },
    o: { floor: LV.up, bottom: LV.up - 0.4, mat: 'wood', tint: 0xc4b49c, roof: 7.8, roofTop: 8.2, roofMat: 'concrete', room: 'room' },
    w: { floor: LV.up, bottom: LV.up - 0.4, mat: 'tile', tint: 0xb8c0c4, roof: 8.0, roofTop: 8.4, roofMat: 'concrete', room: 'room' },
    x: { floor: LV.up, bottom: LV.up - 0.4, mat: 'steel', top: 'grating', tint: 0x5a6a7a },
    b: { floor: LV.up, bottom: LV.up - 0.4, mat: 'steel', top: 'grating', tint: 0x5a6a7a },
    y: { floor: LV.palace, bottom: LV.palace - 0.4, mat: 'concrete', tint: 0xc4bcae },
    p: { floor: LV.palace, bottom: LV.palace - 0.4, mat: 'wood', tint: 0xdccdb4, roof: 9.0, roofTop: 9.4, roofMat: 'plaster', room: 'room' },
    P: { floor: LV.palace, bottom: LV.palace - 0.4, mat: 'wood', tint: 0xdccdb4, roof: 9.0, roofTop: 9.4, roofMat: 'plaster', room: 'room' },
    Q: { building: { h: 9.4, mat: 'plaster', tint: 0xd8cdb4 }, bottom: LV.palace - 0.4, window: { sill: LV.palace + 1.0, lintel: LV.palace + 2.8 } },
  };
  const ofacades: Record<string, FacadeStyle> = {
    k: { mat: 'plaster', tint: 0xdcd2bc, plinth: { h: 1.1, mat: 'wallTile', tint: 0x3f7f78 } },
    o: { mat: 'plaster', tint: 0xdcd2bc, plinth: { h: 1.1, mat: 'wallTile', tint: 0x7a8a8a } },
    w: { mat: 'wallPaint', tint: 0xdfe3e2, plinth: { h: 1.0, mat: 'wallPaint', tint: 0x3f5f7f } },
    p: { mat: 'plaster', tint: 0xe0d6c0, plinth: { h: 1.0, mat: 'wood', tint: 0x8a6a4a } },
    P: { mat: 'plaster', tint: 0xe0d6c0, plinth: { h: 1.0, mat: 'wood', tint: 0x8a6a4a } },
  };
  O.build(b, olegend, { floorBottom: LV.up - 0.4, lintelTop: 0, facades: ofacades });

  // ------------------------------------------------------------------ Rampen & Treppen
  b.stairs(-70, 26, -64, 38, 0, LV.up, 'nz', 'steel', { top: 'grating', tint: 0x6a7480 }); // Wohnungs-Treppe
  railedStairs(b, -70, -28, -64, -16, 0, LV.up, 'pz', {}); // Wohnungen → B
  railedStairs(b, -14, 2, -10, 14, 0, LV.up, 'nz', {}); // Steg-Treppe
  railedStairs(b, -38, -38, -30, -26, 0, LV.up, 'pz', {}); // Kurz → B
  b.stairs(-14, 16, -4, 22, LV.under, 0, 'px', 'concrete', { tint: 0xa8a49c }); // Unterführung
  b.ramp(-52, -16, -46, -2, LV.under, 0, 'nz', 'concreteDark', { tag: 'ramp' }); // Unterführungs-Rampe
  b.ramp(34, 30, 46, 48, 0, LV.apron, 'nz', 'asphalt', { tag: 'ramp', tint: 0xc9c2b4 }); // T-Rampe (Lkw-Rampe)
  b.stairs(46, -6, 54, 2, 0, LV.apron, 'pz', 'concrete', { tint: 0xc0b8a8 }); // Treppe
  b.stairs(24, -6, 34, 2, 0, LV.apron, 'pz', 'concrete', { tint: 0xc0b8a8 }); // Dschungel-Treppe
  b.stairs(76, 34, 84, 48, 0, LV.palace, 'nz', 'steel', { top: 'grating', tint: 0x6a7480 }); // Palast-Treppe
  railedStairs(b, 52, 16, 60, 24, LV.apron, LV.palace, 'px', {}); // Balkon-Treppe
  railedStairs(b, 6, -50, 10, -38, 0, LV.up, 'pz', {}); // Leitstand-Treppe

  // ------------------------------------------------------------------ Callouts
  b.area('T-Spawn', -56, 56, -6, 82);
  b.area('Ladehof', -86, 48, 90, 88);
  b.area('Wohnungs-Aufgang', -86, 26, -58, 48, -1, 6);
  b.area('Vorplatz Süd', -24, 30, 14, 48);
  b.area('T-Rampe', 34, 30, 46, 48, -1, 3);
  b.area('Palast-Aufgang', 68, 34, 90, 48, -1, 7);
  b.area('Tor Süd', -8, 26, 8, 30);
  b.area('Untere Mitte', -14, 8, 14, 26);
  b.area('Mitte', -14, -14, 14, 8, -1, 3.5);
  b.area('Obere Mitte', -14, -34, 14, -14, -1, 3.5);
  b.area('Steg', -14, -26, -10, 14, 3.5, 9);
  b.area('Kurz', -28, -26, -14, -20, 3.5, 9);
  b.area('Fenster', 2, -34, 12, -20, 3.5, 9);
  b.area('Leitstand-Treppe', 6, -50, 10, -34, -1, 9);
  b.area('Unterführungs-Abgang', -14, 16, -4, 22, -6, 1);
  b.area('Unterführung', -52, -2, -14, 22, -6, -1);
  b.area('Unterführungs-Rampe', -52, -16, -46, -2, -6, 1);
  b.area('Wohnungen', -86, -16, -58, 26, 3.5, 10);
  b.area('Wohnungen-Treppe', -70, -28, -64, -16, -1, 6);
  b.area('B-Halle', -72, -60, -28, -16, -1, 4);
  b.area('Spot B', -60, -52, -36, -34, -1, 4);
  b.area('Markt', -64, -82, -44, -62);
  b.area('Küche', -42, -78, -24, -62);
  b.area('CT-Gang', -24, -72, -10, -66);
  b.area('CT-Spawn', -10, -74, 40, -38);
  b.area('CT-Gasse', 44, -46, 54, -14);
  b.area('Pförtner-Gasse', 38, -14, 66, -6);
  b.area('Dschungel', 20, -24, 38, -6);
  b.area('Verbindung', 14, -16, 20, -8);
  b.area('Treppe', 46, -6, 54, 2, -1, 3);
  b.area('Rampe A', 16, 2, 68, 30, 1, 4);
  b.area('Spot A', 36, 4, 56, 20, 1, 4);
  b.area('Sandwich', 16, 4, 30, 17, 1, 8);
  b.area('Feuerkiste', 47, 2.5, 54, 8.5, 1, 4);
  b.area('Dreierkiste', 38, 7, 44, 13, 1, 5);
  b.area('Pförtnerhaus', 56, 3, 63, 10, 1, 5);
  b.area('Lieferwagen', -70, -51, -62, -41, -1, 4);
  b.area('Bank', -40, -45, -32, -38, -1, 4);
  b.area('Balkon', 58, 8, 68, 24, 3.5, 10);
  b.area('Palast', 68, 4, 90, 34, 5, 11);

  // ------------------------------------------------------------------ Spots, Spawns, Kaufzonen
  b.site('A', 'Serverschrank A', [36, 1.6, 4], [56, 7, 20], [46, LV.apron, 10]);
  b.site('B', 'Serverschrank B', [-60, -0.4, -52], [-36, 6, -34], [-48, 0, -42]);
  b.spawnGrid('T', -34, 0, 66, 8, 2, 3, 0);
  b.spawnGrid('CT', 22, 0, -54, 8, 2, 3, Math.PI);
  b.buy('T', -56, 56, -6, 82);
  b.buy('CT', -8, -72, 40, -40);

  // Bot-Hinweise (optional): Scharfschütze am Fenster, Halte-Positionen und Pflanzplätze hinter den Serverreihen
  b.botHint({ kind: 'sniper', pos: [5, LV.up, -24.5], team: 'CT' }); // Fenster: Blick über Obere Mitte und Mitte
  b.botHint({ kind: 'hold', pos: [36, LV.apron, 12], team: 'CT', site: 'A' }); // westlich der Dreierkiste, Blick zur T-Rampe
  b.botHint({ kind: 'hold', pos: [-56.5, 0, -40], team: 'CT', site: 'B' }); // vor dem Lieferwagen, Blick zur Treppe der Wohnungen
  b.botHint({ kind: 'plant', pos: [52.5, LV.apron, 12], site: 'A' }); // östlich der Gitterboxen
  b.botHint({ kind: 'plant', pos: [-44, 0, -51.5], site: 'B' }); // hinter den Serverschränken, aus Kurz verdeckt

  dressT(b);
  dressMid(b);
  dressA(b);
  dressB(b);
  dressCT(b);

  return b.data;
}
