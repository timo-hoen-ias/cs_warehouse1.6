import { MapBuilder, type MapData } from '../logic/mapkit';
import { CellPlan, type CellKind, type FacadeStyle } from '../logic/mapplan';
import { WAGON } from '../logic/railprops';
import { buildCT } from './gueterbahnhof/ct';
import { buildHallA, HALL_A } from './gueterbahnhof/hallA';
import { buildHallB, HALL_B } from './gueterbahnhof/hallB';
import { buildYards } from './gueterbahnhof/yards';

/**
 * de_gueterbahnhof — „Güterbahnhof“: der Klassiker de_train als Bahn-Logistikzentrum.
 *
 * Topologie wie im Vorbild: T-Hof im Süden mit den Ausgängen Efeu (West), Hauptgang (Mitte) und
 * Ostgang; Gleisfeld A (West, überdacht: Gleise 1–5 mit Wagen, Kranbahn, Himmel über dem Sandwich,
 * Leiterraum als Treppe, Popdog-Grube), die Mitte mit Altzug und Verbindung, die Z-Verbindung nach
 * Gleisfeld B (Ost: Serverinsel zwischen zwei Gleisen, Untere/Obere Halle B) und der CT-Hof im
 * Norden mit dem Stellwerk (Sniper-Nest). Die Bombenziele sind Serverschränke, die die IT „vorüber-
 * gehend“ im offenen IT-Wagen des Bombenzugs (A) bzw. auf der Serverinsel zwischen den Gleisen (B)
 * abgestellt hat.
 *
 * Höhen: Boden 0 m (Schotter), Wagenboden +1.3, Wagendach +3.74, Himmel +5.0, Kranbahn +8.4,
 * Packhallen-Dach +7.0, Stellwerk-Balkon +5.8, Obere Halle B +3.0, Popdog-Grube −1.4.
 * Detailbau je Bereich in `./gueterbahnhof/*` (Halle A, Halle B, Yards, CT).
 */
export function buildGueterbahnhof(): MapData {
  const b = new MapBuilder({
    id: 'de_gueterbahnhof',
    name: 'Güterbahnhof',
    description: 'Bahn-Logistikzentrum nach dem Vorbild de_train: Gleisfeld A unter der Kranbahn, Efeu, Z-Verbindung, Serverinsel B zwischen den Gleisen.',
    bounds: { min: [-92, -6, -92], max: [92, 20, 80] },
    env: {
      sunDir: [-0.5, 0.6, 0.62],
      sunColor: 0xffd9a8,
      sunIntensity: 1.5,
      skyTop: 0x5a7fae,
      skyHorizon: 0xe6d6b8,
      skyIntensity: 0.55,
      ambient: 0.17,
      fogColor: 0xbdb7a8,
      fogNear: 70,
      fogFar: 260,
    },
  });

  // ------------------------------------------------------------------ Grundriss (2-m-Raster)
  const plan = new CellPlan(-92, -92, 92, 80, 2, '#');
  // Gebäudemassen: Werkstatt (zwischen Gleisfeld A und T-Hof), Güterschuppen (Ost), Hallenmäntel
  plan.rect('W', -68, -6, -12, 52).rect('W', -80, 40, -34, 52).rect('S', 56, 12, 90, 76);
  plan.rect('H', -70, -64, -12, -4).rect('J', 52, -58, 90, -8);
  plan
    // Süden: T-Hof, Efeu-Zugang (Gleisvorfeld West), Efeu
    .rect('t', -34, 40, 56, 76)
    .rect('e', -80, 52, -34, 72)
    .rect('E', -80, -18, -70, 52)
    // Gleisfeld A mit Popdog-Grube, Efeu-Tür, Ost-Toren, Sandwich-Tor
    .rect('A', -68, -62, -14, -6)
    .rect('P', -60, -14, -46, -6)
    .rect('a', -70, -16, -68, -6)
    .rect('a', -14, -48, -12, -32)
    .rect('a', -14, -24, -12, -10)
    .rect('a', -26, -66, -16, -62)
    // Mitte: Hauptgang/Mittelgang/Ostgang-Zone und Verbindung, Ostgang, Ladestraße
    .rect('h', -12, 12, 34, 40)
    .rect('m', -12, -48, 34, 12)
    .rect('y', 34, -8, 56, 40)
    .rect('y', 56, -8, 90, 12)
    // Z-Verbindung (Z-förmig) mit Westtür von Gleisfeld B
    .rect('z', 34, -26, 46, -20)
    .rect('z', 40, -40, 46, -26)
    .rect('z', 46, -40, 52, -34)
    .rect('a', 52, -40, 54, -34)
    // Gleisfeld B mit Süd-Tor und Oberer Empore
    .rect('B', 54, -56, 90, -10)
    .rect('a', 64, -10, 82, -8)
    .rect('g', 78, -58, 90, -34)
    // CT-Bereich: CT-Hof, Leiterraum (Treppe zum Himmel), Mitte-Nord, Untere/Obere Halle B
    .rect('c', -30, -88, 50, -66)
    .rect('l', -12, -66, -2, -56)
    .rect('A', -14, -62, -12, -56)
    .rect('n', 0, -66, 12, -48)
    .rect('k', 26, -66, 32, -48) // Stellwerk-Gasse (Treppe)
    .rect('U', 50, -88, 68, -58)
    .rect('a', 56, -58, 66, -56)
    .rect('R', 68, -88, 80, -76)
    .rect('O', 80, -88, 90, -58)
    .rect('O', 68, -76, 80, -58)
    // Packhalle (Dachterrasse +7 m) – zuletzt, damit sie die Mitte überlagert
    .rect('q', 24, -4, 34, 30);

  const legend: Record<string, CellKind> = {
    '#': { building: { h: 11, mat: 'brick', tint: 0xa87a66 } },
    W: { building: { h: 9, mat: 'plaster', tint: 0xcfc4a8 } },
    S: { building: { h: 8, mat: 'corrugated', tint: 0x9aa4ac } },
    H: { building: { h: 14.8, mat: 'corrugated', tint: 0xa8b0b6 } },
    J: { building: { h: 12.8, mat: 'corrugated', tint: 0xa8b0b6 } },
    t: { floor: 0, mat: 'gravel', room: 'outdoor' },
    e: { floor: 0, mat: 'gravel', room: 'outdoor' },
    E: { floor: 0, mat: 'gravel', room: 'outdoor' },
    h: { floor: 0, mat: 'gravel', room: 'outdoor' },
    m: { floor: 0, mat: 'gravel', room: 'outdoor' },
    y: { floor: 0, mat: 'gravel', room: 'outdoor' },
    z: { floor: 0, mat: 'gravel', room: 'outdoor' },
    c: { floor: 0, mat: 'paving', room: 'outdoor' },
    k: { floor: 0, mat: 'concrete', room: 'outdoor' },
    q: { floor: 7, mat: 'brick', top: 'roof', tint: 0xb08672, room: 'outdoor' },
    // Hallen A und B: das Dach (mit Oberlicht-Spalten) baut die Karte selbst
    A: { floor: 0, mat: 'concreteDark', room: 'hall' },
    P: { floor: -1.4, mat: 'concreteDark', room: 'hall' },
    B: { floor: 0, mat: 'epoxy', room: 'hall' },
    g: { floor: 3, mat: 'concrete', room: 'hall' },
    a: { floor: 0, mat: 'concrete', roof: 6, roofTop: 14, roofMat: 'concreteDark', room: 'hall' },
    l: { floor: 0, mat: 'concrete', roof: 9.5, roofTop: 10, roofMat: 'concreteDark', room: 'room' },
    n: { floor: 0, mat: 'concrete', room: 'outdoor' },
    U: { floor: 0, mat: 'concrete', roof: 8.5, roofTop: 9, roofMat: 'roof', room: 'hall' },
    R: { floor: 0, mat: 'concrete', roof: 9.5, roofTop: 10, roofMat: 'roof', room: 'hall' },
    O: { floor: 3, mat: 'concrete', roof: 9.5, roofTop: 10, roofMat: 'roof', room: 'hall' },
  };
  const hallWall: FacadeStyle = {
    mat: 'corrugated', tint: 0xcdd2d6, plinth: { h: 1.8, mat: 'concrete', tint: 0x8d8a84 }, band: { y: 0, h: 0.25, mat: 'hazard' },
    pilasters: { every: 9, w: 0.6, mat: 'steel', tint: 0x2f5f9e }, windows: { y: 9, h: 2.6, w: 5, every: 9, mat: 'skylight', tint: 0xd8e4ee },
  };
  const outdoorBrick: FacadeStyle = {
    mat: 'brick', tint: 0xa87a66, plinth: { h: 0.9, mat: 'concreteDark', tint: 0x8a8580 }, cornice: { h: 0.5, mat: 'brick', tint: 0x9a7a6a },
    windows: { y: 4, h: 2.2, w: 1.6, every: 5.5 }, pipes: 14,
  };
  const outdoorHall: FacadeStyle = {
    mat: 'corrugated', tint: 0xb4bcc2, plinth: { h: 1.4, mat: 'concrete', tint: 0x9a968e }, band: { y: 4.2, h: 0.35, mat: 'metal', tint: 0x2f5f9e },
    cornice: { h: 0.4, mat: 'metal', tint: 0x6a7480 }, pipes: 18,
  };
  const facades: Record<string, FacadeStyle> = {
    A: hallWall,
    P: { mat: 'concrete', tint: 0x8d8a84, band: { y: 0.8, h: 0.3, mat: 'hazard' } },
    a: { mat: 'concreteDark', tint: 0xb0aca4, band: { y: 1.4, h: 0.3, mat: 'hazard' } },
    B: { ...hallWall, tint: 0xd6dadc, pilasters: { every: 9, w: 0.6, mat: 'steel', tint: 0xb8601c }, windows: { y: 7.5, h: 2.4, w: 5, every: 9, mat: 'skylight', tint: 0xd8e4ee } },
    g: { mat: 'corrugated', tint: 0xd6dadc, plinth: { h: 1.2, mat: 'concrete', tint: 0x8d8a84 } },
    U: { mat: 'corrugated', tint: 0xc4cacf, plinth: { h: 1.6, mat: 'concrete', tint: 0x8d8a84 }, band: { y: 0, h: 0.25, mat: 'hazard' } },
    O: { mat: 'corrugated', tint: 0xc4cacf, plinth: { h: 1.2, mat: 'concrete', tint: 0x8d8a84 } },
    l: { mat: 'plaster', tint: 0xd8cdb4, plinth: { h: 1.2, mat: 'wallTile', tint: 0x7a8a8a } },
    R: { mat: 'corrugated', tint: 0xc4cacf, plinth: { h: 1.2, mat: 'concrete', tint: 0x8d8a84 } },
    '@#': outdoorBrick,
    '@W': { ...outdoorBrick, mat: 'plaster', tint: 0xcfc4a8, windows: { y: 4, h: 2.2, w: 2.2, every: 7 } },
    '@S': { ...outdoorHall, band: { y: 4.2, h: 0.35, mat: 'metal', tint: 0xb8601c } },
    '@H': outdoorHall,
    '@J': outdoorHall,
  };
  plan.build(b, legend, { floorBottom: -4, lintelTop: 9, facades });

  // ------------------------------------------------------------------ Bereiche (Hallen, Yards, CT)
  buildHallA(b);
  buildHallB(b);
  buildYards(b);
  buildCT(b);
  b.ramp(68, -88, 80, -76, 0, 3, 'px', 'concrete', { tag: 'ramp' }); // Rampe in die Obere Halle B

  // ------------------------------------------------------------------ Callouts
  b.area('T-Spawn', -34, 40, 56, 76);
  b.area('Efeu-Zugang', -80, 52, -34, 72);
  b.area('Efeu', -80, -18, -70, 52);
  b.area('Hauptgang', -12, 12, 8, 40);
  b.area('Altzug', 8, 12, 16, 40);
  b.area('Mittelgang', 16, 12, 24, 40);
  b.area('Ostgang', 34, -8, 56, 40, -2, 3);
  b.area('Laderampe', 48.5, 12, 56, 40, 0.8, 4);
  b.area('Ladestraße', 56, -8, 90, 12);
  b.area('Mitte', -12, -48, 34, 12, -2, 3);
  b.area('Packhallen-Dach', 24, -4, 34, 30, 6, 12);
  b.area('Z-Verbindung', 34, -40, 54, -20);
  b.area('Gleisfeld A', -68, -62, -14, -6, -2, 12);
  b.area('Sandwich', -68, -62, -14, -55, -2, 4.6);
  b.area('Himmel', -68, -62, -12, -55, 4.6, 8);
  b.area('Kranbahn', -68, -62, -14, -8, 7.5, 13);
  b.area('Bombenzug', HALL_A.itX - 7.5, -37.8, HALL_A.itX + 7.5, -34.2, 1, 4);
  b.area('Popdog', -60, -14, -46, -6, -3, 1);
  b.area('Ost-Tor', -14, -48, -12, -10, -2, 8);
  b.area('Leiterraum', -12, -66, -2, -56, -1, 12);
  b.area('CT-Spawn', -30, -88, 50, -66);
  b.area('Mitte-Nord', 0, -66, 12, -48);
  b.area('Stellwerk-Treppe', 26, -66, 32, -48, -1, 7);
  b.area('Sniper-Nest', 14, -48, 32, -44, 4, 9);
  b.area('Untere Halle B', 50, -88, 68, -58);
  b.area('Obere Halle B', 68, -88, 90, -58, 0, 12);
  b.area('Gleisfeld B', 54, -56, 90, -10, -2, 12);
  b.area('Serverinsel', 68.5, -46, 77.5, -20, -1, 4);
  b.area('Obere Empore B', 78, -56, 90, -34, 2, 12);

  // ------------------------------------------------------------------ Spots, Spawns, Kaufzonen
  b.site('A', 'Serverschrank A', [HALL_A.itX - 10, 0, -42.5], [HALL_A.itX + 10, 5.5, -29.5], [HALL_A.itX, WAGON.floor, -36]);
  b.site('B', 'Serverschrank B', [62, 0, -48], [84, 6, -18], [73, HALL_B.island, -33]);
  b.spawnGrid('T', -4, 0, 68, 8, 2, 3, 0);
  b.spawnGrid('CT', 20, 0, -74, 8, 2, 3, Math.PI);
  b.buy('T', -34, 40, 56, 76);
  b.buy('CT', -30, -88, 50, -66);

  // ------------------------------------------------------------------ Akustik
  b.ambient('hallHum', [-40, 8, -34], 40, 0.6);
  b.ambient('hallHum', [72, 7, -33], 32, 0.55);
  b.ambient('machine', [-19, 2, -36], 14, 0.45);
  b.ambient('forklift', [-52, 1, -23], 12, 0.4);
  b.ambient('buzz', [HALL_A.itX, 2.5, -36], 9, 0.55);
  b.ambient('buzz', [73, 1.5, -33], 10, 0.55);
  b.ambient('compressor', [87, 1, -28], 14, 0.6);
  b.ambient('ventilation', [60, 3, -50], 12, 0.5);
  b.ambient('conveyor', [52, 1, -72], 12, 0.6);
  b.ambient('drip', [-53, -1, -10], 8, 0.5);
  b.ambient('radio', [-26, 6, -58], 8, 0.5);
  b.ambient('wind', [-75, 4, 20], 40, 0.5);
  b.ambient('birds', [-75, 5, 30], 36, 0.5);
  b.ambient('wind', [10, 6, 0], 70, 0.5);
  b.ambient('traffic', [10, 6, 74], 50, 0.4);
  b.ambient('alarmFar', [80, 10, 60], 70, 0.3);
  b.ambient('forklift', [20, 1, -44], 12, 0.35);

  return b.data;
}
