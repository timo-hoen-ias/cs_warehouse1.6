import { MapBuilder, type MapData } from '../logic/mapkit';
import { CellPlan, type CellKind, type FacadeStyle } from '../logic/mapplan';
import { prop } from '../logic/mapprops';

/**
 * de_lagerstaub — „Lagerstaub“: der Klassiker-Grundriss (T-Hof im Süden, Lang A über
 * Außen Lang und das Hallentor, Kurz A über den Steg aus der Mitte, Mitteltür zum
 * CT-Bereich, Ober-/Untertunnel nach B, B mit Fenster und Tür zum CT-Gang), gebaut als
 * Logistikzentrum. Die Bombenziele sind Serverschränke, die die IT „vorübergehend“
 * auf der Laderampe A bzw. im Serverraum B abgestellt hat.
 *
 * Höhen: T-Hof/Außen Tunnel/Steg/A-Plattform +2 m, CT-Spawn +0.8 m, Mitte/Lang/B 0 m,
 * Grube −1.6 m, Unterer Tunnel −1.2 m, Lang-Empore +3.6 m, B-Empore +4.4 m.
 */
export function buildLagerstaub(): MapData {
  const b = new MapBuilder({
    id: 'de_lagerstaub',
    name: 'Lagerstaub',
    description: 'Logistikzentrum im Abendlicht: Lang A durchs Hallentor, Kurz A über den Steg, Tunnel zum Serverraum B.',
    bounds: { min: [-80, -6, -94], max: [80, 16, 68] },
    env: {
      sunDir: [-0.42, 0.55, 0.72],
      sunColor: 0xffc890,
      sunIntensity: 1.55,
      skyTop: 0x4a74b0,
      skyHorizon: 0xf0cfa0,
      skyIntensity: 0.55,
      ambient: 0.11,
      fogColor: 0xc9b393,
      fogNear: 60,
      fogFar: 240,
    },
  });

  // ------------------------------------------------------------------ Grundriss (2-m-Raster)
  const plan = new CellPlan(-80, -94, 80, 68, 2, '#');
  // Gebäudearten: Hallenmantel (Wellblech) um Lang-Halle und Serverhalle, alter Klinker-Speicher
  // (Spedition, Mitte-West), hohes Verwaltungsgebäude hinter CT, niedrige Hofmauern am Rand
  plan.rect('H', 26, -48, 76, 8).rect('H', -80, -80, -42, -34);
  plan.rect('R', -80, 60, 80, 68).rect('R', -46, -34, -10, 8).rect('R', 40, 8, 80, 60);
  plan.rect('Q', -10, -94, 34, -90).rect('Q', 30, -94, 80, -80);
  plan.rect('W', -80, -94, -10, -88).rect('W', -80, 0, -60, 60);
  plan
    .rect('t', -16, 34, 22, 62) // T-Hof
    .rect('t', 22, 40, 38, 62) // Außen Lang (oben)
    .rect('^', 28, 28, 38, 40) // T-Rampe
    .rect('.', 28, 16, 38, 28) // Außen Lang (unten)
    .rect('G', 28, 6, 38, 16) // Lang-Tor
    .rect('L', 28, -6, 60, 6) // Lang-Ecke
    .rect('g', 60, -6, 74, 6) // Grube
    .rect('P', 54, -6, 60, 0) // Grubenrampe
    .rect('L', 46, -46, 74, -6) // Lang A
    .rect('^', 60, -62, 74, -46) // A-Rampe
    .rect('p', 32, -80, 60, -54) // A-Plattform
    .rect('p', 60, -80, 74, -62)
    .rect('c', -8, -90, 26, -66) // CT-Spawn
    .rect('r', 26, -78, 32, -66) // CT → A
    .rect('^', -6, -66, 8, -60) // CT-Mitte-Rampe
    .rect('.', -28, -60, 12, -42) // CT-Mitte
    .rect('k', 12, -62, 32, -44) // Kurz A
    .rect('s', 12, -44, 18, -4) // Steg
    .rect('m', -10, -40, 12, 24) // Mitte
    .rect('m', -6, -42, 2, -40) // Mitteltür
    .rect('^', 6, -8, 12, -4) // Steg-Treppe
    .rect('^', -8, 24, 4, 34) // Mittelrampe
    .rect('B', -78, -78, -46, -36) // Serverhalle B
    .rect('b', -78, -78, -66, -68) // Hintere Plattform
    .rect('B', -46, -56, -44, -50) // B-Tür
    .rect('X', -46, -70, -44, -66) // B-Fenster
    .rect('.', -44, -58, -28, -46) // B-Gang
    .rect('F', -44, -74, -28, -60) // Fensterraum (IT-Lager)
    .rect('F', -36, -60, -32, -58) // Tür Fensterraum
    .rect('u', -58, -36, -52, -24) // Oberer Tunnel (unten, versetzt → kein durchgehender Blick aus B)
    .rect('u', -58, -24, -46, -20) // Knick
    .rect('V', -52, -20, -46, -6) // Tunnelrampe
    .rect('U', -52, -6, -46, 20) // Oberer Tunnel
    .rect('K', -54, 20, -38, 36) // Tunnelkreuzung
    .rect('S', -38, 22, -30, 30) // Treppe zum Unteren Tunnel
    .rect('l', -30, 8, -22, 30) // Unterer Tunnel
    .rect('l', -22, 8, -18, 14)
    .rect('T', -18, 8, -10, 14) // Treppe hinauf zur Mitte
    .rect('o', -44, 36, -16, 62) // Außen Tunnel
    .rect('#', -22, 36, -16, 46);

  const legend: Record<string, CellKind> = {
    '#': { building: { h: 9, mat: 'plaster', tint: 0xe2d2b0 } },
    R: { building: { h: 10, mat: 'brick' } },
    Q: { building: { h: 14, mat: 'plaster', tint: 0xd0c8bc } },
    W: { building: { h: 4.2, mat: 'concrete', tint: 0xb8b0a0 } },
    H: { building: { h: 12, mat: 'corrugated' } },
    X: { building: { h: 12, mat: 'corrugated' }, window: { sill: 1.1, lintel: 2.5 } },
    t: { floor: 2, mat: 'asphalt', room: 'outdoor' },
    o: { floor: 2, mat: 'paving', room: 'outdoor' },
    '.': { floor: 0, mat: 'asphalt', room: 'outdoor' },
    m: { floor: 0, mat: 'paving', room: 'outdoor' },
    c: { floor: 0.8, mat: 'paving', room: 'outdoor' },
    p: { floor: 2, mat: 'concrete', room: 'outdoor' },
    k: { floor: 2, mat: 'concrete', room: 'outdoor' },
    s: { floor: 2, mat: 'concrete', top: 'grating', room: 'outdoor' },
    '^': { floor: 0, mat: 'asphalt', ramp: true },
    r: { floor: 0.8, mat: 'paving', ramp: true },
    G: { floor: 0, mat: 'concrete', roof: 4.6, roofMat: 'concreteDark', room: 'hall' },
    L: { floor: 0, mat: 'concrete', roof: 10, roofMat: 'roof', room: 'hall' },
    g: { floor: -1.6, mat: 'concreteDark', roof: 10, room: 'hall' },
    P: { floor: -1.6, mat: 'concreteDark', roof: 10, ramp: true },
    B: { floor: 0, mat: 'epoxy', roof: 8, room: 'hall' },
    b: { floor: 1.2, mat: 'epoxy', roof: 8 },
    F: { floor: 0, mat: 'tile', roof: 3.6, roofMat: 'white', room: 'room' },
    u: { floor: 0, mat: 'concreteDark', roof: 4.5, roofMat: 'concrete', room: 'tunnel' },
    V: { floor: 0, mat: 'concreteDark', roof: 5.5, roofMat: 'concrete', ramp: true, room: 'tunnel' },
    U: { floor: 2, mat: 'concreteDark', roof: 5.5, roofMat: 'concrete', room: 'tunnel' },
    K: { floor: 2, mat: 'concrete', roof: 6.5, roofMat: 'corrugatedDark', room: 'hall' },
    S: { floor: -1.2, mat: 'concreteDark', roof: 6.5, roofMat: 'corrugatedDark', ramp: true },
    l: { floor: -1.2, mat: 'concreteDark', roof: 2.4, roofTop: 9, roofMat: 'concreteDark', tunnel: true, room: 'tunnel' },
    T: { floor: -1.2, mat: 'concreteDark', roof: 2.4, roofTop: 9, roofMat: 'concreteDark', tunnel: true, ramp: true },
  };
  const outdoorPlaster: FacadeStyle = {
    mat: 'plaster', tint: 0xe2d2b0, plinth: { h: 0.9, mat: 'concrete', tint: 0x9a958c }, cornice: { h: 0.35, mat: 'concrete', tint: 0xc4baa8 },
    windows: { y: 3.6, h: 1.5, w: 2.2, every: 7 }, pipes: 15,
  };
  const facades: Record<string, FacadeStyle> = {
    '@#': outdoorPlaster,
    '@Q': { ...outdoorPlaster, tint: 0xd0c8bc, windows: { y: 3.4, h: 1.6, w: 2.6, every: 4.5 }, band: { y: 3.0, h: 0.2, mat: 'concrete', tint: 0xa8a090 } },
    '@R': { mat: 'brick', plinth: { h: 0.7, mat: 'concreteDark', tint: 0x8a8580 }, cornice: { h: 0.5, mat: 'brick', tint: 0x9a7a6a }, windows: { y: 3.8, h: 2.0, w: 1.6, every: 5 }, pipes: 12 },
    '@W': { mat: 'concrete', tint: 0xb8b0a0, cornice: { h: 0.25, mat: 'concrete', tint: 0x9a948a } },
    '@H': {
      mat: 'corrugated', tint: 0xb4bcc2, plinth: { h: 1.2, mat: 'concrete', tint: 0x9a968e }, band: { y: 4.2, h: 0.35, mat: 'metal', tint: 0x2f5f9e },
      cornice: { h: 0.4, mat: 'metal', tint: 0x6a7480 }, windows: { y: 6.6, h: 1.1, w: 4.5, every: 7 }, pipes: 18,
    },
    '@X': { mat: 'corrugated', tint: 0xb4bcc2, plinth: { h: 1.1, mat: 'concrete', tint: 0x9a968e } },
    // Innenräume
    L: {
      mat: 'corrugated', tint: 0xd4d8da, plinth: { h: 1.6, mat: 'wallPaint', tint: 0x58706a }, band: { y: 0.0, h: 0.3, mat: 'hazard' },
      pilasters: { every: 8, w: 0.5, mat: 'steel', tint: 0x2f5f9e }, windows: { y: 6.6, h: 1.6, w: 5, every: 8, mat: 'skylight', tint: 0xd8e4ee },
    },
    g: { mat: 'concrete', tint: 0xa8a49c, band: { y: 1.0, h: 0.35, mat: 'hazard' } },
    P: { mat: 'concrete', tint: 0xa8a49c },
    G: { mat: 'concreteDark', tint: 0xb0aca4, band: { y: 1.4, h: 0.3, mat: 'hazard' } },
    B: { mat: 'wallPaint', tint: 0xdfe3e2, plinth: { h: 1.2, mat: 'wallPaint', tint: 0x3f5f7f }, pilasters: { every: 7, w: 0.45, mat: 'steel', tint: 0x8a9298 } },
    b: { mat: 'wallPaint', tint: 0xdfe3e2, plinth: { h: 1.2, mat: 'wallPaint', tint: 0x3f5f7f } },
    F: { mat: 'wallPaint', tint: 0xe4ddd0, plinth: { h: 1.0, mat: 'wallTile', tint: 0xb8c4c8 } },
    u: { mat: 'concrete', tint: 0x9a968e, plinth: { h: 1.0, mat: 'concreteDark' }, band: { y: 1.3, h: 0.12, mat: 'metal', tint: 0xd8b020 } },
    V: { mat: 'concrete', tint: 0x9a968e, plinth: { h: 1.0, mat: 'concreteDark' } },
    U: { mat: 'concrete', tint: 0x9a968e, plinth: { h: 1.0, mat: 'concreteDark' }, band: { y: 1.3, h: 0.12, mat: 'metal', tint: 0xd8b020 } },
    K: { mat: 'corrugatedDark', tint: 0xc0c4c8, plinth: { h: 1.2, mat: 'concrete' }, band: { y: 1.2, h: 0.25, mat: 'hazard' } },
    S: { mat: 'concreteDark', tint: 0xa8a8a0 },
    l: { mat: 'concreteDark', tint: 0xa8aca0, band: { y: 1.0, h: 0.15, mat: 'metal', tint: 0x3a8a5a } },
    T: { mat: 'concreteDark', tint: 0xa8aca0 },
  };
  plan.build(b, legend, { floorBottom: -4, lintelTop: 9, facades });

  // Hallendecken: Stahlträger und Lichtbänder (Lang-Halle, Serverhalle)
  for (let z = -44; z <= -8; z += 6) b.box([46, 9.3, z - 0.15], [74, 9.95, z + 0.15], 'steel', { collide: 'none', tint: 0x4a5a6a, noNav: true, occlude: false });
  for (const x of [52.5, 67.5]) b.box([x - 1.2, 9.96, -45], [x + 1.2, 9.99, -7], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  for (let x = -74; x <= -50; x += 6) b.box([x - 0.15, 7.3, -78], [x + 0.15, 7.95, -36], 'steel', { collide: 'none', tint: 0x6a7480, noNav: true, occlude: false });
  b.box([-64, 7.96, -76], [-60, 7.99, -38], 'skylight', { collide: 'none', tint: 0xdde8f0, noNav: true, occlude: false });
  // Stützen in der Lang-Halle (Deckung)
  for (const z of [-34, -18]) b.box([59.7, 0, z - 0.3], [60.3, 9.3, z + 0.3], 'steel', { tint: 0x2f5f9e, tag: 'pillar' });

  // ------------------------------------------------------------------ Rampen & Treppen
  b.ramp(28, 28, 38, 40, 0, 2, 'pz', 'concrete', { tag: 'ramp' }); // T-Rampe
  b.ramp(-8, 24, 4, 34, 0, 2, 'pz', 'paving', { tag: 'ramp' }); // Mittelrampe
  b.ramp(60, -62, 74, -46, 0, 2, 'nz', 'concrete', { tag: 'ramp' }); // A-Rampe
  b.ramp(26, -78, 32, -66, 0.8, 2, 'px', 'paving', { tag: 'ramp' }); // CT → A
  b.ramp(-6, -66, 8, -60, 0, 0.8, 'nz', 'paving', { tag: 'ramp' }); // CT-Mitte
  b.ramp(54, -6, 60, 0, -1.6, 0, 'nx', 'concreteDark', { tag: 'ramp' }); // Grube
  b.ramp(-52, -20, -46, -6, 0, 2, 'pz', 'concreteDark', { tag: 'ramp' }); // Tunnelrampe
  b.stairs(6, -8, 12, -4, 0, 2, 'px', 'steel', { top: 'grating', tint: 0x6a7480 }); // Steg-Treppe
  b.stairs(-38, 22, -30, 30, -1.2, 2, 'nx', 'concrete'); // hinab in den Unteren Tunnel
  b.stairs(-18, 8, -10, 14, -1.2, 0, 'px', 'concrete'); // hinauf zur Mitte
  b.stairs(-66, -76, -62, -70, 0, 1.2, 'nx', 'steel', { top: 'grating', tint: 0x6a7480 }); // Hintere Plattform

  // Gelb-schwarze Kanten an Rampen und Absätzen
  const edge = (x0: number, z0: number, x1: number, z1: number, y: number): void => {
    b.box([x0, y, z0], [x1, y + 0.03, z1], 'hazard', { collide: 'none', noNav: true, occlude: false, uv: 1 });
  };
  edge(46, -54.4, 60, -54, 2); // Plattform-Kante zur Halle (oben)
  edge(60, -62, 60.4, -54, 2);
  edge(28, 39.6, 38, 40, 2);
  edge(-8, 33.6, 4, 34, 2);
  edge(60, -6, 74, -5.6, 0);
  edge(59.6, 0, 60, 6, 0);
  edge(12, -44, 12.4, -4, 2);
  edge(12, -62, 12.4, -44, 2);
  edge(-66.4, -78, -66, -68, 1.2);
  edge(-78, -68.4, -66, -68, 1.2);

  // ------------------------------------------------------------------ Tore, Türen, Stürze
  // Lang-Tor: Sektionaltor halb offen, ein Flügel geschlossen
  b.box([28, 2.9, 10.85], [38, 4.6, 11.15], 'gate', { tint: 0x9aa4ae, tag: 'door' });
  b.box([28, 0, 10.8], [32.8, 2.9, 11.2], 'gate', { tint: 0x8a96a2, tag: 'door' });
  b.box([32.8, 2.75, 10.7], [38, 2.9, 11.3], 'hazard', { collide: 'none', noNav: true });
  // Mitteltür: Brandschutztor, ein Flügel halb zu
  b.box([-6, 3.2, -42], [2, 9, -40], 'plaster', { tag: 'wall', tint: 0xe2d2b0 });
  b.box([-6.2, 3.0, -42.15], [2.2, 3.25, -39.85], 'concrete', { tag: 'wall', tint: 0xb0aaa0 });
  b.box([-1.6, 0, -41.15], [2, 3.2, -40.85], 'door', { tint: 0xb83a2a, tag: 'door' });
  b.box([-5.9, 0, -40.0], [-5.6, 3.2, -37.4], 'door', { tint: 0xb83a2a, tag: 'door', collide: 'all' });
  // B-Tür: Doppeltür offen, Sturz
  b.box([-46, 3.2, -56], [-44, 8, -50], 'corrugated', { tag: 'wall' });
  b.box([-44, 0, -56], [-43.7, 3.1, -58.6], 'door', { tint: 0x5a7a9a });
  b.box([-44, 0, -50], [-43.7, 3.1, -47.4], 'door', { tint: 0x5a7a9a });
  // Hallenöffnung Lang A → A-Rampe (Sturz) und Kreuzungs-Eingang
  b.box([60, 6, -46.3], [74, 10, -46], 'corrugated', { tag: 'wall' });
  b.box([-44, 3.8, 35.7], [-38, 6.5, 36], 'corrugated', { tag: 'wall' });
  b.box([-36, 2.6, -60], [-32, 3.6, -59.7], 'wallPaint', { tag: 'wall' });

  // ------------------------------------------------------------------ Geländer
  b.rail(12.05, -40, 12.05, -8, 2);
  b.rail(12.05, -60, 12.05, -42, 2);
  b.rail(32, -54.05, 46, -54.05, 2); // Kurz A → Halle (Gebäudekante)

  // ------------------------------------------------------------------ Emporen (Vertikalität)
  // Lang-Empore: Stahlbühne an der Westwand der Lang-Halle, Treppe von Süden
  b.floor(46, -40, 52, -16, 3.6, 'steel', { thick: 0.3, top: 'grating', tag: 'platform' });
  b.stairs(46, -16, 50, -8, 0, 3.6, 'nz', 'steel', { top: 'grating', solid: false, tint: 0x5a6a7a });
  b.rail(52.05, -40, 52.05, -16, 3.6);
  b.rail(50.05, -16, 52, -16, 3.6);
  b.rail(46, -40.05, 52, -40.05, 3.6);
  for (const z of [-39.6, -28, -16.4]) b.box([51.6, 0, z - 0.2], [52, 3.3, z + 0.2], 'steel', { tint: 0x3a5a8a, tag: 'pillar' });
  // B-Empore: Galerie an der Nordwand der Serverhalle, Treppe aus der Halle
  b.floor(-78, -78, -56, -75, 4.4, 'steel', { thick: 0.3, top: 'grating', tag: 'platform' });
  b.floor(-62, -75, -56, -72, 4.4, 'steel', { thick: 0.3, top: 'grating', tag: 'platform' });
  b.stairs(-56, -75, -47, -72, 0, 4.4, 'nx', 'steel', { top: 'grating', solid: false, tint: 0x5a6a7a });
  b.rail(-78, -74.95, -62, -74.95, 4.4);
  b.rail(-62, -71.95, -56, -71.95, 4.4);
  b.rail(-61.95, -75, -61.95, -72, 4.4);
  for (const x of [-77.5, -70, -62.4]) b.box([x - 0.2, 1.2, -75.4], [x + 0.2, 4.1, -75], 'steel', { tint: 0x3a5a8a, tag: 'pillar' });

  // ------------------------------------------------------------------ Vordach über A
  b.box([32, 7.2, -80], [74, 7.5, -71], 'roof', { tag: 'roof', noNav: true });
  for (const x of [34, 44, 54, 64, 73]) b.box([x - 0.2, 2, -71.4], [x + 0.2, 7.2, -71], 'steel', { tint: 0x5a6a78, tag: 'pillar' });

  // ------------------------------------------------------------------ Requisiten
  // T-Hof: Sattelzüge an der Spedition, Paletten, Pförtnerhaus
  prop(b, 'trailer', -4, 2, 59.4, { rot: 0, tint: 0xe6e6e6 });
  prop(b, 'truck', 9.2, 2, 59.4, { rot: 0, tint: 0x2a5aa8 });
  prop(b, 'trailer', 26, 2, 59, { rot: 0, tint: 0xd0d6dc });
  prop(b, 'container', -11, 2, 44, { rot: 1, tint: 0x2f7d4f });
  prop(b, 'palletStack', -12.5, 2, 37, { n: 6 });
  prop(b, 'palletGoods', 18, 2, 37, {});
  prop(b, 'palletGoods', 19.5, 2, 37, {});
  prop(b, 'gitterbox', 16.5, 2, 37, { n: 2 });
  prop(b, 'barrelGroup', 20, 2, 45, {});
  prop(b, 'lampPost', -14.5, 2, 52);
  prop(b, 'lampPost', 20.5, 2, 52);
  b.box([31, 2, 44], [36, 4.8, 48], 'plaster', { tint: 0xd8d0c0, top: 'roof', noNav: true }); // Pförtnerhaus
  b.box([30.6, 4.8, 43.6], [36.4, 5.0, 48.4], 'metal', { tint: 0x8a3a2a, noNav: true });
  prop(b, 'cartons', 34, 2, 52);
  prop(b, 'crate', 24, 2, 42, { h: 1.2 });
  prop(b, 'crate', 24, 3.2, 42, { h: 0.9 });
  // Außen Lang: Container und Paletten an der Ostwand
  prop(b, 'container', 35.8, 0, 22, { rot: 1, tint: 0xa8432b });
  prop(b, 'palletGoods', 29.2, 0, 18, {});
  prop(b, 'barrel', 29, 0, 26.5);
  prop(b, 'barrel', 29.7, 0, 25.8);
  // Lang-Tor: Rammschutz
  for (const x of [28.4, 37.6]) for (const z of [7, 15]) prop(b, 'bumper', x, 0, z, { rot: 1 });
  // Lang-Ecke: „Blau“ (Container) und Paletten
  prop(b, 'container', 44, 0, -2.6, { rot: 0, tint: 0x2b5f9e });
  prop(b, 'palletStack', 30, 0, -4.5, { n: 5 });
  prop(b, 'palletGoods', 50, 0, 4, {});
  prop(b, 'palletGoods', 51.4, 0, 4, {});
  // Grube: Überladebrücke, Puffer, Fass
  b.box([66, -1.6, -6], [74, -1.2, -4.6], 'steel', { tint: 0x707070, collide: 'none', noNav: true });
  for (const x of [62, 66, 70, 73.4]) prop(b, 'bumper', x, -1.6, 5.7);
  prop(b, 'barrel', 72.6, -1.6, 4.6);
  prop(b, 'cableTray', 67, 4, 5.6, { len: 14 });
  prop(b, 'gitterbox', 72.8, -1.6, -2, { rot: 1, n: 2 });
  // Lang A: Hochregale an der Ostwand, Kommissionierwagen, „Auto“ (Stapler)
  for (const z of [-42, -36.6, -31.2, -25.8, -20.4, -15]) prop(b, 'rack', 73.2, 0, z, { rot: 1, len: 5.2, h: 8.5 });
  prop(b, 'forklift', 66, 0, -40, { rot: 1 });
  prop(b, 'palletGoods', 63.5, 0, -42.5, { h: 1.3 });
  prop(b, 'palletGoods', 63.5, 0, -41.3, { h: 1.3 });
  prop(b, 'palletStack', 56, 0, -24, { n: 7 });
  prop(b, 'palletGoods', 57.3, 0, -24, {});
  prop(b, 'crate', 58, 0, -10, { h: 1.2 });
  prop(b, 'crate', 59.3, 0, -10, { h: 1.2 });
  prop(b, 'gitterbox', 54, 0, -33, { n: 2 });
  prop(b, 'handTruck', 61, 0, -30, { rot: 1 });
  prop(b, 'crate', 48, 3.6, -38.5, { h: 1.0 });
  prop(b, 'cartons', 49, 3.6, -24);
  // A-Plattform: Serverschränke der IT („Serverschrank A“) + Zubehör
  prop(b, 'serverRow', 52, 2, -70.6, { rot: 0, n: 5 });
  prop(b, 'ups', 47.6, 2, -70.6);
  prop(b, 'cooler', 56.6, 2, -70.6);
  prop(b, 'serverRow', 46.4, 2, -61.6, { rot: 1, n: 2 }); // „Default“-Deckung
  prop(b, 'palletGoods', 57.8, 2, -66.8, { tint: 0xe8e8e8, h: 1.1 });
  prop(b, 'ibc', 60.5, 2, -72.5);
  hangSign(b, 'SERVERSCHRANK A', 52, 5.8, -69.6, 0xff5a4a, 'IT-UMZUG · BITTE NICHT STAPELN');
  tape(b, 44, -73.4, 60, -73.4, 2);
  prop(b, 'drum', 45, 2, -64, { rot: 1 });
  prop(b, 'palletGoods', 58, 2, -62.5, { tint: 0xd8d8d0, h: 1.0 });
  prop(b, 'palletGoods', 59.4, 2, -62.5, { tint: 0xd8d8d0, h: 1.0 });
  prop(b, 'crate', 40, 2, -58, { h: 1.2 });
  prop(b, 'crate', 40, 2, -59.3, { h: 1.2 });
  prop(b, 'crate', 40, 3.2, -58.6, { h: 0.9 });
  prop(b, 'crate', 69.5, 2, -77.5, { h: 1.4 }); // Gans
  prop(b, 'crate', 71.2, 2, -77.5, { h: 1.4 });
  prop(b, 'crate', 70.3, 3.4, -77.5, { h: 1.0 });
  prop(b, 'palletStack', 66, 2, -66, { n: 6 });
  prop(b, 'gitterbox', 35, 2, -78.6, { n: 2 });
  prop(b, 'cartons', 37, 2, -76);
  // Kurz A / Steg
  prop(b, 'crate', 22, 2, -58, { h: 1.2 });
  prop(b, 'crate', 22, 2, -59.3, { h: 1.2 });
  prop(b, 'palletGoods', 28, 2, -46.2, {});
  prop(b, 'cableTray', 17.6, 4.4, -24, { rot: 1, len: 36 });
  // CT-Spawn: Lieferwagen, Paletten, Pförtner
  prop(b, 'truck', -2, 0.8, -84, { rot: 0, tint: 0xe8e8e8 });
  prop(b, 'palletStack', 22, 0.8, -88.5, { n: 6 });
  prop(b, 'palletGoods', 20.5, 0.8, -88.5, {});
  prop(b, 'gitterbox', 24, 0.8, -70, { n: 2 });
  prop(b, 'barrelGroup', -6, 0.8, -70, {});
  prop(b, 'lampPost', 0, 0.8, -68);
  prop(b, 'lampPost', 18, 0.8, -88.4);
  // CT-Mitte: Container und Paletten
  prop(b, 'container', -20, 0, -56.6, { rot: 0, tint: 0xb7791f });
  prop(b, 'palletGoods', -2, 0, -58.5, {});
  prop(b, 'palletGoods', -0.6, 0, -58.5, {});
  prop(b, 'crate', 9, 0, -45, { h: 1.2 });
  // Mitte: „Xbox“-Kiste an der Steg-Treppe, Paletten an den Wänden
  prop(b, 'crateStack', 2.6, 0, -11.4);
  prop(b, 'palletStack', -8.5, 0, -28, { n: 6 });
  prop(b, 'palletGoods', -8.5, 0, 0, {});
  prop(b, 'palletGoods', -8.5, 0, 1.2, {});
  prop(b, 'gitterbox', 10.6, 0, 16, { rot: 1, n: 2 });
  prop(b, 'barrel', 10.8, 0, 19);
  prop(b, 'lampPost', -9, 0, 18);
  prop(b, 'cartons', 9, 0, -36);
  // Außen Tunnel
  prop(b, 'container', -38, 2, 58.8, { rot: 0, tint: 0x8a8f96 });
  prop(b, 'container', -38, 4.59, 58.8, { rot: 0, tint: 0xa8432b });
  prop(b, 'palletStack', -26, 2, 48, { n: 5 });
  prop(b, 'palletGoods', -24.6, 2, 48, {});
  prop(b, 'barrelGroup', -42, 2, 40, {});
  prop(b, 'lampPost', -18, 2, 56);
  // Tunnelkreuzung + Oberer Tunnel: Förderband, Rohre, Kabelpritschen
  prop(b, 'conveyor', -51.4, 2, 6, { rot: 1, len: 26 });
  prop(b, 'palletGoods', -40, 2, 33, {});
  prop(b, 'gitterbox', -52.8, 2, 33.6, { n: 2 });
  prop(b, 'barrel', -40, 2, 21.5);
  b.decor('pipeZ', [-46.5, 4.6, 7], 0, [1, 1, 52]);
  b.decor('pipeZ', [-46.5, 4.2, 7], 0, [0.6, 0.6, 52], 0x3a6a3a);
  b.decor('pipeZ', [-57.5, 3.6, -30], 0, [0.8, 0.8, 12], 0x8a4a2a);
  b.decor('pipeX', [-52, 3.6, -23.5], 0, [12, 0.8, 0.8], 0x8a4a2a);
  b.decor('pipeX', [-26, 2.1, 9], 0, [8, 0.6, 0.6], 0x3a6a3a);
  b.decor('pipeZ', [-29.5, 2.1, 19], 0, [0.7, 0.7, 22]);
  prop(b, 'cableTray', -57.6, 4.0, -29, { rot: 1, len: 12 });
  prop(b, 'palletGoods', -47, 0, -21.5, { rot: 1 });
  prop(b, 'barrel', -57.3, 0, -25);
  // Serverhalle B: Serverreihen („Serverschrank B“), Kühlung, USV, „B-Auto“ (Stapler)
  prop(b, 'serverRow', -60, 0, -61.2, { rot: 0, n: 6 });
  prop(b, 'serverRow', -60, 0, -48.6, { rot: 2, n: 5 });
  prop(b, 'serverRow', -70, 0, -52, { rot: 1, n: 4 });
  prop(b, 'cooler', -55.2, 0, -61.2);
  prop(b, 'ups', -64.6, 0, -61.2);
  prop(b, 'ups', -64.6, 0, -60.2);
  for (const z of [-46, -42.5]) prop(b, 'cooler', -77.2, 0, z, { rot: 1 });
  prop(b, 'palletGoods', -66, 0, -43, { tint: 0xe8e8e8, h: 1.2 });
  prop(b, 'palletGoods', -64.6, 0, -43, { tint: 0xe8e8e8, h: 0.9 });
  hangSign(b, 'SERVERSCHRANK B', -60, 5.6, -54.8, 0xffb13a, 'RECHENZENTRUM · KÜHLUNG AN');
  tape(b, -66, -57.4, -54, -57.4, 0);
  prop(b, 'drum', -52, 0, -40, { rot: 0 });
  prop(b, 'forklift', -50, 0, -42, { rot: 2 });
  prop(b, 'palletGoods', -74, 1.2, -76.6, {});
  prop(b, 'palletGoods', -72.6, 1.2, -76.6, {});
  prop(b, 'crate', -70, 1.2, -70.4, { h: 1.2 });
  prop(b, 'crate', -76.4, 0, -40, { h: 1.2 });
  prop(b, 'crate', -76.4, 0, -41.3, { h: 1.2 });
  prop(b, 'palletStack', -76.5, 0, -48, { n: 6 });
  prop(b, 'gitterbox', -60, 4.4, -77, { n: 1 });
  for (const x of [-74, -66, -58, -50]) prop(b, 'cableTray', x, 6.2, -57, { rot: 1, len: 40 });
  // Fensterraum (IT-Lager): Regale, Tische, Spinde
  prop(b, 'shelf', -40, 0, -73.4, { len: 3 });
  prop(b, 'shelf', -35, 0, -73.4, { len: 3 });
  prop(b, 'desk', -31, 0, -66, { rot: 1 });
  prop(b, 'locker', -28.6, 0, -71, { rot: 1 });
  prop(b, 'locker', -28.6, 0, -70, { rot: 1 });
  prop(b, 'cartons', -40, 0, -63);
  // B-Gang
  prop(b, 'palletGoods', -30, 0, -47.5, {});
  prop(b, 'barrel', -42.6, 0, -47);

  // ------------------------------------------------------------------ Fassaden-Details (Tore, Türen, Technik)
  const F = 0.12; // Fassadenverkleidung + Sockel
  for (const x of [-12, -4, 9.2, 16.5, 26]) prop(b, 'rollerDoor', x, 2, 62 - F, { rot: 2, len: 3.4, h: 3.8 });
  for (const x of [-8, 3, 12.8, 21.5]) b.wallLamp(x, 6.4, 62 - F - 0.05, 'nz', { intensity: 0.7, range: 10 });
  prop(b, 'rollerDoor', 38 - F, 0, 18.5, { rot: 1, len: 3.4, h: 4 });
  prop(b, 'doorSteel', -10 + F, 0, 0, { rot: 3 });
  prop(b, 'rollerDoor', -10 + F, 0, -24, { rot: 3, len: 4, h: 4.2 });
  prop(b, 'rollerDoor', 12 - F, 0, 6, { rot: 1, len: 4, h: 4.2 });
  prop(b, 'electricBox', 12 - F, 0, 12, { rot: 1 });
  prop(b, 'electricBox', -10 + F, 0, -14, { rot: 3, tint: 0x8a9aa0 });
  prop(b, 'doorSteel', -28 + F, 0, -50, { rot: 3 });
  prop(b, 'electricBox', 12 - F, 0, -52, { rot: 1 });
  prop(b, 'rollerDoor', -44 + F, 2, 52, { rot: 3, len: 3.4, h: 3.6 });
  prop(b, 'doorSteel', -22 - F, 2, 41, { rot: 1 });
  prop(b, 'rollerDoor', 26 - F, 0.8, -84, { rot: 1, len: 3.6, h: 4 });
  prop(b, 'doorSteel', 6, 0.8, -90 + F, { rot: 0 });
  prop(b, 'doorSteel', 9, 0.8, -90 + F, { rot: 0, tint: 0x2f5f9e });
  prop(b, 'cones', 4, 0, -36);
  prop(b, 'cones', 30, 0, 26, { rot: 1 });
  prop(b, 'cones', 62, 2, -60, { rot: 2 });
  // Dachaufbauten (Silhouette)
  for (const [x, y, z] of [[20, 9, 10], [24, 9, -2], [-20, 10, -10], [-30, 10, 2], [-24, 10, -26], [-20, 10, 64.5], [14, 10, 65], [42, 10, 30], [10, 14, -92], [50, 14, -86], [-26, 9, 45], [-34, 9, 64], [3, 9, -72]] as const) prop(b, 'acUnit', x, y, z, { rot: (Math.abs(x) % 2) as 0 | 1 });
  b.sign('LAGERSTAUB LOGISTIK', [8, 9, -90 + F + 0.02], 'pz', 9, 1.6, { color: 0xf0f0f0, bg: 0x2f5f9e, sub: 'VERWALTUNG · IT-ABTEILUNG' });
  b.sign('SPEDITION', [26, 7.6, 62 - F - 0.02], 'nz', 5, 1.1, { color: 0xf0f0f0, bg: 0x8a2a20, sub: 'TOR 1–5' });

  // ------------------------------------------------------------------ Licht
  for (const x of [51, 60, 69]) for (const z of [-40, -31, -22, -13]) b.hallLamp(x, 9.6, z, { intensity: 1.15, range: 15 });
  for (const x of [34, 43, 52, 66]) b.hallLamp(x, 9.6, 0, { intensity: 1.1, range: 14 });
  b.tubeLamp(33, 4.4, 9, true, { intensity: 0.9 });
  b.tubeLamp(33, 4.4, 14, true, { intensity: 0.8 });
  for (const x of [-72, -64, -56, -50]) for (const z of [-72, -63, -54, -45, -39]) b.hallLamp(x, 7.6, z, { color: 0xdfeaff, intensity: 0.9, range: 12 });
  for (const [x, z] of [[-62, -60.2], [-70, -52], [-56, -45.8], [52, -69.4]] as const) b.light({ kind: 'lamp', pos: [x, z === -69.4 ? 3.2 : 1.2, z + 0.9], color: 0x40c8ff, intensity: 0.35, range: 5 });
  for (const z of [-14, -6, 2, 10, 17]) b.tubeLamp(-49, 5.3, z, false, { intensity: 0.75, range: 9 });
  for (const [x, z] of [[-55, -31], [-55, -22.5], [-49, -22.5]] as const) b.tubeLamp(x, 4.3, z, z > -25, { intensity: 0.75, range: 9 });
  for (const [x, z] of [[-50, 24], [-42, 24], [-50, 32], [-42, 32]] as const) b.tubeLamp(x, 6.3, z, true, { intensity: 0.8, range: 10 });
  for (const z of [10, 15, 20, 25, 29]) b.tubeLamp(-26, 2.25, z, false, { color: 0xc8f0d0, intensity: 0.95, range: 8 });
  for (const x of [-21, -15]) b.tubeLamp(x, 2.25, 11, true, { color: 0xc8f0d0, intensity: 0.9, range: 8 });
  for (const [x, z] of [[-40, -70], [-32, -70], [-36, -63]] as const) b.tubeLamp(x, 3.45, z, true, { intensity: 0.7, range: 8 });
  for (const x of [38, 50, 62, 71]) b.hallLamp(x, 7.15, -75, { color: 0xffd8a0, intensity: 0.9, range: 12 });
  b.wallLamp(-6.2, 4.5, -39.6, 'pz', { intensity: 0.8 });
  b.wallLamp(-2, 4.5, -42.4, 'nz', { intensity: 0.8 });
  b.wallLamp(-43.6, 4, -53, 'px', { intensity: 0.8 });
  b.wallLamp(-10, 3.2, 11, 'px', { intensity: 0.7 });
  b.wallLamp(33, 5.6, 16.4, 'pz', { intensity: 0.8 });
  b.wallLamp(-41, 7, 36.4, 'pz', { intensity: 0.8 });
  b.wallLamp(12, 5, -52, 'nx', { intensity: 0.7 });
  // Tageslicht durch große Öffnungen
  b.light({ kind: 'window', pos: [67, 4, -45], color: 0xffd0a0, intensity: 0.8, range: 14 });
  b.light({ kind: 'window', pos: [33, 3, 15], color: 0xffd0a0, intensity: 0.7, range: 10 });
  b.light({ kind: 'window', pos: [-55, 3, -34], color: 0xffe0c0, intensity: 0.5, range: 9 });
  b.light({ kind: 'window', pos: [-45, 2.5, -53], color: 0xffe0c0, intensity: 0.6, range: 10 });

  // ------------------------------------------------------------------ Markierungen & Schilder
  b.decal({ kind: 'letter', pos: [52, 2.02, -65], size: [5, 5], text: 'A', color: 0xff5a4a });
  b.decal({ kind: 'letter', pos: [-62, 0.02, -56], size: [5, 5], text: 'B', color: 0xffb13a });
  for (const x of [50, 56]) b.decal({ kind: 'line', pos: [x, 0.02, -26], size: [0.15, 38], color: 0xe8c020 });
  b.decal({ kind: 'line', pos: [68.5, 0.02, -26], size: [0.15, 38], color: 0xe8c020 });
  b.decal({ kind: 'line', pos: [-1, 0.02, -8], size: [0.15, 60], color: 0xe8e8e8 });
  b.decal({ kind: 'line', pos: [3, 2.02, 48], size: [36, 0.15], color: 0xe8e8e8 });
  for (const x of [-12, -6, 0, 6, 12]) b.decal({ kind: 'line', pos: [x, 2.02, 56], size: [0.15, 9], color: 0xe8e8e8 });
  b.decal({ kind: 'stripes', pos: [-62, 0.02, -46], size: [10, 1.2] });
  b.decal({ kind: 'stripes', pos: [67, 0.02, -45.4], size: [14, 1] });
  b.decal({ kind: 'grid', pos: [-62, 0.02, -56], size: [24, 30] });
  b.decal({ kind: 'arrow', pos: [-1, 0.02, -30], size: [2, 3], rot: 0, color: 0xe8e8e8 });
  b.decal({ kind: 'stain', pos: [8, 0.02, 4], size: [6, 4] });
  b.decal({ kind: 'stain', pos: [60, 0.02, -20], size: [7, 5] });
  b.decal({ kind: 'stain', pos: [-26, -1.18, 20], size: [3, 6] });
  b.decal({ kind: 'stain', pos: [6, 2.02, 44], size: [8, 6] });
  b.sign('LANG A', [33, 6.2, 16.25], 'pz', 4, 1, { color: 0xffd040, sub: 'TOR 3 · VERSAND' });
  b.sign('A', [63, 5, -6.3], 'pz', 1.4, 1.4, { color: 0xff5a4a, sub: '↑' });
  b.sign('SERVERSCHRANK A', [52, 4.6, -79.7], 'pz', 5, 1, { color: 0xff5a4a, sub: 'IT · NICHT BERÜHREN' });
  b.sign('SERVERRAUM B', [-62, 5.5, -77.7], 'pz', 5, 1, { color: 0xffb13a, sub: 'ZUTRITT NUR FÜR IT' });
  b.sign('B', [-43.85, 4.0, -53], 'px', 1.4, 1.4, { color: 0xffb13a });
  b.sign('B ←', [-20, 4.2, -59.85], 'pz', 2.2, 1.0, { color: 0xffb13a, sub: 'SERVERRAUM' });
  b.sign('MITTE', [-9.85, 4, -20], 'px', 3, 0.8, { color: 0xe8e8e8 });
  b.sign('KURZ A', [17.85, 5, -22], 'nx', 3, 0.8, { color: 0xff5a4a, sub: 'STEG' });
  b.sign('CT', [-5.85, 4.4, -63], 'px', 1.4, 1.4, { color: 0x8fc0ff });
  b.sign('TUNNEL', [-41, 5, 36.25], 'pz', 3.5, 0.8, { color: 0xffb13a, sub: '→ B' });
  b.sign('T-HOF', [3, 6.5, 61.75], 'nz', 4, 1, { color: 0xffb070, sub: 'SPEDITION · RAMPE 1–4' });
  b.sign('GRUBE', [73.75, 3, 0], 'nx', 3, 0.8, { color: 0xffd040 });
  b.sign('LAGERSTAUB GMBH', [-30, 7, 61.75], 'nz', 8, 1.2, { color: 0xe8e8e8, bg: 0x2a4a7a });

  // ------------------------------------------------------------------ Callouts
  b.area('T-Spawn', -16, 34, 22, 62);
  b.area('Außen Lang', 22, 16, 38, 62);
  b.area('Lang-Tor', 28, 6, 38, 16);
  b.area('Lang-Ecke', 28, -6, 54, 6);
  b.area('Grube', 54, -6, 74, 6);
  b.area('Lang A', 46, -46, 74, -6, -2, 3);
  b.area('Lang-Empore', 46, -40, 52, -8, 2.2, 9);
  b.area('A-Rampe', 60, -62, 74, -46);
  b.area('A-Plattform', 32, -80, 66, -54);
  b.area('Gans', 66, -80, 74, -62);
  b.area('Kurz A', 12, -62, 32, -44, 1, 9);
  b.area('Steg', 6, -44, 18, -4, 1, 9);
  b.area('CT-Spawn', -8, -90, 32, -66);
  b.area('CT-Mitte', -28, -66, 12, -42, -2, 1.6);
  b.area('Mitteltür', -10, -44, 12, -30, -2, 1.6);
  b.area('Mitte', -10, -30, 12, 10, -2, 1.6);
  b.area('Xbox', -2, -16, 6, -6, -2, 1.6);
  b.area('Obere Mitte', -10, 10, 12, 34);
  b.area('B-Gang', -44, -58, -28, -46);
  b.area('B-Fenster', -44, -74, -28, -58);
  b.area('Spot B', -78, -78, -46, -36, -1, 3);
  b.area('Hintere Plattform', -78, -78, -66, -68, 0.6, 3.5);
  b.area('B-Empore', -78, -78, -47, -72, 3.5, 9);
  b.area('Oberer Tunnel', -58, -36, -46, 20);
  b.area('Tunnelkreuzung', -54, 20, -38, 36);
  b.area('Unterer Tunnel', -38, 8, -10, 30, -3, 1.2);
  b.area('Außen Tunnel', -44, 36, -16, 62);

  // ------------------------------------------------------------------ Spots, Spawns, Kaufzonen
  b.site('A', 'Serverschrank A', [38, 1.2, -80], [66, 7, -56], [52, 2, -66.4]);
  b.site('B', 'Serverschrank B', [-76, -0.8, -72], [-50, 6, -46], [-59, 0, -55]);
  b.spawnGrid('T', 2, 2, 48.5, 8, 2, 3, 0);
  b.spawnGrid('CT', 6, 0.8, -76, 8, 2, 3, Math.PI);
  b.buy('T', -16, 34, 38, 62);
  b.buy('CT', -8, -90, 32, -66);

  // Bot-Hinweise (optional; Bots finden Positionen auch selbst — Hinweise werten nur auf)
  b.botHint({ kind: 'sniper', pos: [58.5, 2, -54.5], team: 'CT', site: 'A' }); // A-Plattform, Blick nach Kurz A
  b.botHint({ kind: 'sniper', pos: [64.5, 2, -79.5], team: 'CT', site: 'A' }); // hinten auf A, Blick die Rampe hinunter
  b.botHint({ kind: 'sniper', pos: [-52.5, 2.89, -74.5], team: 'CT', site: 'B' }); // B-Empore über B-Gang und Tunnel
  b.botHint({ kind: 'hold', pos: [-69.5, 0, -49.5], team: 'CT', site: 'B' }); // Ecke an der Tunnelmündung
  b.botHint({ kind: 'plant', pos: [50.5, 2, -69.5], site: 'A' }); // hinter dem Serverschrank, aus Kurz A verdeckt
  b.botHint({ kind: 'plant', pos: [-62, 0, -58], site: 'B' });
  b.botHint({ kind: 'smoke', from: [22.5, 2, -51.5], target: [42, 2, -66], team: 'T', site: 'A' }); // Kurz A: Kreuz zur CT-Seite
  b.botHint({ kind: 'smoke', from: [-31.5, 0, -52.5], target: [-52, 0, -56], team: 'T', site: 'B' }); // B-Gang: Tür zum Spot zuziehen

  // ------------------------------------------------------------------ Akustik: Ambient-Quellen
  b.ambient('hallHum', [60, 6, -24], 36, 0.6);
  b.ambient('forklift', [66, 1, -40], 10, 0.35);
  b.ambient('conveyor', [-51, 3, 6], 16, 0.7);
  b.ambient('ventilation', [-26, 0.5, 20], 14, 0.6);
  b.ambient('drip', [-26, -1, 26], 8, 0.5);
  b.ambient('compressor', [-57, 1.5, -61], 14, 0.7);
  b.ambient('buzz', [-62, 1.2, -60], 10, 0.5);
  b.ambient('buzz', [52, 3.2, -69], 9, 0.5);
  b.ambient('radio', [-31, 1, -66], 7, 0.5);
  b.ambient('wind', [0, 6, -10], 60, 0.5);
  b.ambient('birds', [3, 8, 50], 40, 0.4);
  b.ambient('traffic', [9, 6, -88], 40, 0.4);
  b.ambient('machine', [64, 1, 0], 16, 0.4);

  return b.data;
}

/** Abgehängtes, beidseitiges Schild mit zwei Aufhängungen. */
function hangSign(b: MapBuilder, text: string, x: number, y: number, z: number, color: number, sub?: string): void {
  b.sign(text, [x, y, z + 0.03], 'pz', 4.2, 1.0, { color, sub });
  b.sign(text, [x, y, z - 0.03], 'nz', 4.2, 1.0, { color, sub });
  for (const dx of [-1.6, 1.6]) b.box([x + dx - 0.02, y + 0.5, z - 0.02], [x + dx + 0.02, y + 2.2, z + 0.02], 'metal', { collide: 'none', tint: 0x404448, noNav: true, occlude: false });
}

/** Absperrband zwischen zwei Pfosten (rot-weiß, nur Optik). */
function tape(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, y: number): void {
  for (const [x, z] of [[x0, z0], [x1, z1]] as const) b.box([x - 0.04, y, z - 0.04], [x + 0.04, y + 1.0, z + 0.04], 'metal', { collide: 'none', tint: 0xd8d8d8, noNav: true, occlude: false });
  b.box([Math.min(x0, x1), y + 0.92, Math.min(z0, z1) - 0.01], [Math.max(x0, x1), y + 0.97, Math.max(z0, z1) + 0.01], 'hazard', { collide: 'none', tint: 0xff4040, noNav: true, occlude: false });
}
