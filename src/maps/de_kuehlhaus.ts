import { MapBuilder, type MapData } from '../logic/mapkit';
import { CellPlan, type CellKind, type FacadeStyle } from '../logic/mapplan';
import { dressYard } from './kuehlhaus/yard';
import { dressGarage } from './kuehlhaus/garage';
import { dressLobby } from './kuehlhaus/lobby';
import { dressRampRoom } from './kuehlhaus/ramproom';
import { dressHalleA } from './kuehlhaus/halleA';
import { dressKeller } from './kuehlhaus/keller';
import { dressCT } from './kuehlhaus/ct';
import { dressRoofs } from './kuehlhaus/roofs';

/**
 * de_kuehlhaus — „Kühlhaus“: der Klassiker de_nuke als Tiefkühl-Logistikzentrum.
 * T-Spawn im Außenbereich (Silos = Ammoniak-/Kältespeicher), Garage, Haupteingang → Lobby →
 * Hütte (Quietschtür) → Halle A mit „Himmel“ (Laufsteg) und „Hölle“; B liegt direkt UNTER A
 * (Keller, Datenraum). Verbindungen: Rampenraum (Lobby → Keller), Lüftung (Treppenschacht
 * A ↔ B), Geheimgang (Außen → B), Kellertreppe aus dem Kontrollraum der CT, Dachweg (Garage →
 * Himmel). Bombenziele: Serverschränke, die die IT „in die Nähe gestellt“ hat.
 *
 * Aufbau: zwei Grundrisse übereinander — Erdgeschoss (`G`, dünne Platte −0.3…0) und Keller
 * (`U`, Boden −5, Decke −0.8). Schächte (Rampen/Treppen) liegen im G-Plan mit tieferem Unterbau
 * (`bottom`) und sind im U-Plan leer (`_`).
 *
 * Höhen: Keller −5, Erdgeschoss 0, Himmel/Dachweg +4.5.
 */
export function buildKuehlhaus(): MapData {
  const b = new MapBuilder({
    id: 'de_kuehlhaus',
    name: 'Kühlhaus',
    description: 'Tiefkühl-Logistikzentrum im Winterlicht: Silos, Haupteingang und Hütte nach Halle A, B direkt darunter im Keller, Rampenraum und Lüftung dazwischen.',
    bounds: { min: [-90, -10, -92], max: [90, 26, 92] },
    env: {
      sunDir: [-0.5, 0.42, 0.62],
      sunColor: 0xdfeaff,
      sunIntensity: 1.35,
      skyTop: 0x5f86b4,
      skyHorizon: 0xcfdde9,
      skyIntensity: 0.6,
      ambient: 0.13,
      fogColor: 0xc8d6e2,
      fogNear: 55,
      fogFar: 210,
    },
  });

  // ------------------------------------------------------------------ Erdgeschoss-Grundriss (2-m-Raster)
  const G = new CellPlan(-90, -92, 90, 92, 2, '#');
  G.rect('O', -90, -92, -30, 30) // niedrige Außenmauer im Westen (Sicht vom Dachweg)
    .rect('Y', -80, 30, 84, 88) // Außenbereich
    .rect('T', 22, 60, 58, 86) // T-Spawn (Laderampen)
    .rect('E', 4, 26, 16, 30) // Haupteingang
    .rect('L', -16, 4, 24, 26) // Lobby
    .rect('u', 2, -10, 14, 2) // Hütte
    .rect('d', 6, 2, 10, 4) // Quietschtür (Lobby → Hütte)
    .rect('d', 6, -14, 10, -10) // Hüttentür (→ Halle A)
    .rect('A', -12, -58, 44, -14) // Halle A
    .rect('v', 38, -28, 42, -18) // Lüftungsschacht (Treppe hinab)
    // Rampenraum: Landung oben, Schacht mit Rampe, Mund zum Keller
    .rect('d', -18, 10, -16, 14)
    .rect('R', -28, 8, -18, 16)
    .rect('r', -28, -6, -18, 8)
    .rect('Q', -26, -8, -20, -6)
    // niedrige Brüstungen um Dachweg und Westdach (sonst stünde man in 16-m-Schluchten)
    .rect('W', -32, -50, -14, -6)
    .rect('W', -30, -6, -28, 36)
    .rect('W', -22, 16, -20, 36)
    // Garage, Garagenflur und Dachweg
    .rect('W', -58, 34, -22, 62)
    .rect('g', -56, 36, -24, 60)
    .rect('g', -24, 44, -20, 54) // Garagentor (Ost)
    .rect('f', -28, 16, -22, 36)
    .rect('h', -50, 58, -40, 62) // Aufgang zum Garagendach
    .rect('D', -28, -46, -14, -26) // Westdach (Plateau über dem Keller-Gang)
    .rect('D', -28, -26, -18, -6)
    .rect('X', -14, -34, -12, -28) // Öffnung zum Himmel
    .rect('w', -16, -20, -12, 4) // Westgang (Lobby → Hölle)
    // CT-Bereich: Halle, Kontrollraum mit Kellertreppe, Türen nach A
    .rect('C', -12, -86, 34, -62)
    .rect('k', -12, -86, 2, -62)
    .rect('K', 2, -86, 4, -62)
    .rect('d', 2, -72, 4, -66)
    .rect('S', -8, -76, 0, -64)
    .rect('d', -10, -62, -6, -58)
    .rect('d', 8, -62, 14, -58)
    .rect('d', 28, -62, 32, -58)
    // Geheimgang: Rampe im Hof, Mund zum Keller
    .rect('Z', 48, 30, 58, 48)
    .rect('Q', 50, 28, 56, 30);

  const legend: Record<string, CellKind> = {
    '#': { building: { h: 16, mat: 'panel', tint: 0xdde6ec } },
    W: { building: { h: 5.6, mat: 'concrete', tint: 0xb8c0c6 } },
    O: { building: { h: 7.4, mat: 'panel', tint: 0xdde6ec } },
    K: { building: { h: 4.9, mat: 'panel', tint: 0xdde6ec } },
    Q: { building: { h: 16, mat: 'concreteDark' }, bare: true },
    X: { floor: 4.5, mat: 'steel', roof: 7, roofTop: 7.4, roofMat: 'panel', room: 'room' },
    Y: { floor: 0, mat: 'asphalt', tint: 0xc4ccd4, room: 'outdoor' },
    T: { floor: 0, mat: 'concrete', tint: 0xc4ccd4, room: 'outdoor' },
    Z: { floor: -5, bottom: -8, mat: 'concreteDark', tint: 0xb8c0c8, room: 'outdoor' },
    h: { floor: 4.5, mat: 'concrete', tint: 0xc4ccd4, room: 'outdoor' },
    D: { floor: 4.5, mat: 'concrete', tint: 0xc4ccd4, room: 'outdoor' },
    w: { floor: 0, mat: 'epoxy', tint: 0xa8bcc8, roof: 3.8, roofMat: 'panel', room: 'room' },
    E: { floor: 0, mat: 'epoxy', tint: 0xa8bcc8, roof: 6.2, roofTop: 7, roofMat: 'panel', room: 'hall' },
    L: { floor: 0, mat: 'epoxy', tint: 0xa8bcc8, roof: 8, roofMat: 'panel', room: 'hall' },
    u: { floor: 0, mat: 'tile', tint: 0xb8c8d0, roof: 3.8, roofMat: 'panel', room: 'room' },
    d: { floor: 0, mat: 'epoxy', tint: 0xa8bcc8, roof: 3.4, roofMat: 'panel', room: 'room' },
    A: { floor: 0, mat: 'epoxy', tint: 0x9fb4c2, roof: 15, roofMat: 'panel', room: 'cold' },
    v: { floor: -5, bottom: -8, mat: 'concreteDark', tint: 0xa8b4bc, roof: 15, roofMat: 'panel', room: 'cold' },
    R: { floor: 0, mat: 'concrete', tint: 0xa8b4bc, roof: 4.1, roofTop: 4.5, roofMat: 'concrete', roofWalk: true, room: 'tunnel' },
    r: { floor: -5, bottom: -8, mat: 'concreteDark', tint: 0xa8b4bc, roof: 4.1, roofTop: 4.5, roofMat: 'concrete', roofWalk: true, room: 'tunnel' },
    g: { floor: 0, mat: 'concrete', tint: 0xb4bcc4, roof: 4.1, roofTop: 4.5, roofMat: 'concrete', roofWalk: true, room: 'hall' },
    f: { floor: 0, mat: 'concrete', tint: 0xb4bcc4, roof: 4.1, roofTop: 4.5, roofMat: 'concrete', roofWalk: true, room: 'tunnel' },
    C: { floor: 0, mat: 'tile', tint: 0xb4c4cc, roof: 7.6, roofMat: 'panel', room: 'hall' },
    k: { floor: 0, mat: 'tile', tint: 0xb4c4cc, roof: 4.4, roofTop: 4.9, roofMat: 'panel', room: 'room' },
    S: { floor: -5, bottom: -8, mat: 'concreteDark', tint: 0xa8b4bc, roof: 4.4, roofTop: 4.9, roofMat: 'panel', room: 'room' },
  };
  const outdoorPanel: FacadeStyle = {
    mat: 'panel', tint: 0xe2eaf0, plinth: { h: 1.0, mat: 'concrete', tint: 0x9aa4ac },
    band: { y: 5.6, h: 0.5, mat: 'panel', tint: 0x2f78c0 }, cornice: { h: 0.4, mat: 'metal', tint: 0x7a8690 }, pipes: 14,
  };
  const facades: Record<string, FacadeStyle> = {
    '@#': outdoorPanel,
    '@W': { mat: 'concrete', tint: 0xb8c0c6, cornice: { h: 0.25, mat: 'concrete', tint: 0x9aa4aa } },
    '@K': { mat: 'panel', tint: 0xdde6ec },
    A: { mat: 'panel', tint: 0xdde8f0, plinth: { h: 1.4, mat: 'frost', tint: 0xcfe0ec }, band: { y: 1.4, h: 0.3, mat: 'hazard' }, pilasters: { every: 8, w: 0.5, mat: 'steel', tint: 0x2f78c0 } },
    v: { mat: 'concreteDark', tint: 0xaab4bc, band: { y: 1.0, h: 0.2, mat: 'hazard' } },
    L: { mat: 'panel', tint: 0xdde8f0, plinth: { h: 1.2, mat: 'wallPaint', tint: 0x2f78c0 }, pilasters: { every: 8, w: 0.45, mat: 'steel', tint: 0x8a9298 } },
    E: { mat: 'panel', tint: 0xdde8f0, plinth: { h: 1.2, mat: 'concrete', tint: 0x8a9298 }, band: { y: 1.2, h: 0.3, mat: 'hazard' } },
    u: { mat: 'wallPaint', tint: 0xe4ecef, plinth: { h: 1.0, mat: 'wallTile', tint: 0xb8c8d0 } },
    d: { mat: 'wallPaint', tint: 0xe4ecef, plinth: { h: 1.0, mat: 'wallTile', tint: 0xb8c8d0 } },
    w: { mat: 'wallPaint', tint: 0xdfe8ec, plinth: { h: 1.0, mat: 'wallTile', tint: 0xb8c8d0 }, band: { y: 1.0, h: 0.2, mat: 'hazard' } },
    R: { mat: 'concrete', tint: 0xa8b2ba, band: { y: 1.2, h: 0.25, mat: 'hazard' } },
    r: { mat: 'concrete', tint: 0xa8b2ba, band: { y: 1.2, h: 0.25, mat: 'hazard' }, plinth: { h: 5.0, mat: 'concreteDark', tint: 0x7a848c } },
    g: { mat: 'concrete', tint: 0xb4bcc4, band: { y: 1.0, h: 0.25, mat: 'hazard' } },
    f: { mat: 'concrete', tint: 0xb0b8c0, band: { y: 1.0, h: 0.2, mat: 'metal', tint: 0xd8b020 } },
    C: { mat: 'panel', tint: 0xdce6ee, plinth: { h: 1.2, mat: 'wallPaint', tint: 0x3a6fa0 }, pilasters: { every: 7, w: 0.4, mat: 'steel', tint: 0x8a9298 } },
    k: { mat: 'wallPaint', tint: 0xe4ecef, plinth: { h: 1.0, mat: 'wallTile', tint: 0xb8c8d0 } },
    S: { mat: 'concreteDark', tint: 0xa8b2ba, band: { y: 1.0, h: 0.2, mat: 'hazard' } },
    Z: { mat: 'concrete', tint: 0xa0aab2, band: { y: 1.2, h: 0.25, mat: 'hazard' } },
    X: { mat: 'panel', tint: 0xdde6ec, band: { y: 0.6, h: 0.2, mat: 'hazard' } },
  };
  G.build(b, legend, { floorBottom: -0.3, lintelTop: 16, facades });

  // ------------------------------------------------------------------ Keller-Grundriss (Boden −5, Decke −0.8)
  const U = new CellPlan(-90, -92, 90, 92, 2, '#');
  U.rect('B', -12, -58, 44, -14) // Keller B
    .rect('#', 36, -28, 44, -14)
    .rect('_', 38, -28, 42, -18) // Lüftungsschacht (G-Plan)
    .rect('_', -8, -76, 0, -64) // Kellertreppe (G-Plan)
    .rect('c', -6, -64, -2, -58) // Gang Kellertreppe → B
    .rect('_', -28, -6, -18, 8) // Rampenraum (G-Plan)
    .rect('c', -26, -20, -20, -6) // Gang unten Rampe
    .rect('c', -20, -20, -12, -14)
    .rect('_', 48, 30, 58, 48) // Geheimgang-Rampe (G-Plan)
    .rect('c', 50, 6, 56, 30) // Geheimgang
    .rect('c', 44, 0, 56, 6)
    .rect('c', 46, -38, 52, 0)
    .rect('c', 44, -38, 46, -32);
  const ulegend: Record<string, CellKind> = {
    '#': { building: { h: -0.3, mat: 'concrete', tint: 0xa8b2ba } },
    _: {},
    B: { floor: -5, mat: 'epoxy', tint: 0x8fa0ac, roof: -0.8, roofMat: 'concrete', room: 'cold' },
    c: { floor: -5, mat: 'concreteDark', tint: 0xa0aab2, roof: -0.8, roofMat: 'concrete', room: 'tunnel', tunnel: true },
  };
  const ufacades: Record<string, FacadeStyle> = {
    B: { mat: 'wallPaint', tint: 0xd8e4ea, plinth: { h: 1.1, mat: 'wallPaint', tint: 0x2f5f8f }, band: { y: 1.1, h: 0.2, mat: 'hazard' }, pilasters: { every: 8, w: 0.45, mat: 'steel', tint: 0x8a9298 } },
    c: { mat: 'concrete', tint: 0x9aa4ac, plinth: { h: 1.0, mat: 'concreteDark' }, band: { y: 1.3, h: 0.12, mat: 'metal', tint: 0xd8b020 } },
  };
  U.build(b, ulegend, { floorBottom: -8, lintelTop: -0.3, facades: ufacades });

  // ------------------------------------------------------------------ Rampen & Treppen
  b.ramp(-28, -1, -18, 8, -5, 0, 'pz', 'concrete', { tag: 'ramp' }); // Rampenraum → Keller
  b.ramp(48, 39, 58, 48, -5, 0, 'pz', 'concrete', { tag: 'ramp' }); // Geheimgang
  b.ramp(-50, 62, -40, 71, 0, 4.5, 'nz', 'concrete', { tag: 'ramp' }); // Aufgang Garagendach
  b.stairs(38, -28, 42, -18, -5, 0, 'pz', 'steel', { top: 'grating', tint: 0x6a7480 }); // Lüftung
  b.stairs(-8, -76, 0, -66, -5, 0, 'nz', 'steel', { top: 'grating', tint: 0x6a7480 }); // Kellertreppe
  b.stairs(-12, -56, -6, -48, 0, 4.5, 'pz', 'steel', { top: 'grating', solid: false, tint: 0x5a6a7a }); // Himmelstreppe
  b.floor(-12, -48, -6, -16, 4.5, 'steel', { thick: 0.3, top: 'grating', tag: 'platform' }); // Himmel
  b.floor(-6, -20, 10, -16, 4.5, 'steel', { thick: 0.3, top: 'grating', tag: 'platform' });

  // ------------------------------------------------------------------ Callouts
  b.area('T-Spawn', 22, 60, 58, 86);
  b.area('Außenbereich', -80, 30, 84, 88);
  b.area('Silos', -8, 40, 28, 70);
  b.area('Garage', -56, 36, -24, 60, -1, 4);
  b.area('Garagentor', -24, 44, -20, 54, -1, 4);
  b.area('Garagenflur', -28, 16, -22, 36, -1, 4);
  b.area('Garagendach', -56, 36, -24, 62, 4, 9);
  b.area('Haupteingang', 4, 24, 16, 30);
  b.area('Lobby', -16, 4, 24, 26);
  b.area('Mitte', -2, 10, 14, 20);
  b.area('Westgang', -16, -20, -12, 4, -1, 4);
  b.area('Hütte', 2, -10, 14, 2);
  b.area('Quietschtür', 6, 2, 10, 4);
  b.area('Halle A', -12, -58, 44, -14, -1, 4);
  b.area('Himmel', -12, -48, -6, -16, 3.5, 9);
  b.area('Hölle', -12, -48, 2, -14, -1, 3.5);
  b.area('Spot A', 14, -56, 42, -30, -1, 6);
  b.area('Lüftung', 38, -28, 42, -18, -6, 1);
  b.area('Rampenraum', -28, 8, -18, 16, -1, 4);
  b.area('Rampe', -28, -6, -18, 8, -6, 4);
  b.area('Rampe unten', -26, -20, -12, -6, -6, -3);
  b.area('Kontrollraum', -12, -86, 4, -62, -1, 4);
  b.area('Kellertreppe', -8, -76, 0, -64, -6, 1);
  b.area('CT-Spawn', 4, -86, 34, -62);
  b.area('Mini', 26, -62, 34, -50, -1, 4);
  b.area('Westdach', -28, -46, -14, -6, 4, 9);
  b.area('Spot B', -12, -58, 44, -14, -6, -1);
  b.area('Datenraum', 14, -56, 42, -30, -6, -1);
  b.area('Geheimgang', 44, -40, 58, 30, -6, -1);
  b.area('Geheimgang-Rampe', 48, 30, 58, 48, -6, 1);

  // ------------------------------------------------------------------ Spots, Spawns, Kaufzonen
  b.site('A', 'Serverschrank A', [14, -0.4, -56], [42, 7, -30], [30, 0, -44]);
  b.site('B', 'Serverschrank B', [14, -5.4, -56], [42, -1.2, -30], [30, -5, -44]);
  b.spawnGrid('T', 40, 0, 73, 8, 2, 3, 0);
  b.spawnGrid('CT', 16, 0, -80.5, 8, 2, 3, Math.PI);
  b.buy('T', 22, 60, 58, 86);
  b.buy('CT', 4, -86, 34, -62);

  dressYard(b);
  dressGarage(b);
  dressLobby(b);
  dressRampRoom(b);
  dressHalleA(b);
  dressKeller(b);
  dressCT(b);
  dressRoofs(b);

  return b.data;
}

