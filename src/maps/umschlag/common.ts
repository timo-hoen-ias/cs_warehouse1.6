import type { MapBuilder } from '../../logic/mapkit';

export { F, column, floorLabel, hangSign, hazardEdge, railedStairs, tape } from '../gueterbahnhof/common';

/** Ebenen (m): Unterführung, Rampe A (Außen), Obergeschoss (Wohnungen, Fenster, Steg), Palast/Balkon. */
export const LV = { under: -3.6, apron: 2, up: 4.4, palace: 5.6 } as const;

export type B = MapBuilder;
