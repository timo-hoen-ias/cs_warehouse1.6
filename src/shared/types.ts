export type Lagerbestand = {
  artikelnummer: string;
  bezeichnung1: string;
  matchcode: string;
  bestand: number;
  verfuegbarkeit: number;
  gewicht: number;
};

export type Lagerplatz = {
  platzId: number;
  dim: { d1: number; d2: number; d3: number };
  ebene: number;
  kurz: string;
  platzbezeichnung: string;
  masse: { hoehe: number; breite: number; laenge: number };
  maxGewicht: number;
  bestaende: Lagerbestand[];
};

export type Lagerort = {
  lagerkennung: string;
  bezeichnung: string;
  lagertechnik: string;
  dims: { d1: number; d2: number; d3: number };
  plaetze: Lagerplatz[];
};

export type LagerDaten = {
  mandant: number;
  lagerorte: Lagerort[];
};

/** Live-Buchung aus der MDE (POST /api/buchung), per WebSocket verteilt. */
export type BuchungEvent = {
  mandant: number;
  artikelnummer: string;
  menge: number;
  bewegung: string | null;
  herkunftPlatzId: number | null;
  zielPlatzId: number | null;
  herkunftCarrierId: number | null;
  zielCarrierId: number | null;
  typ: number | null;
  benutzer: string;
  herkunftLager?: string | null;
  zielLager?: string | null;
  quelle?: string | null;
  ts: number;
};
