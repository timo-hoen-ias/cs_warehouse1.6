import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LagerDaten } from '../src/shared/types';
import type { LevelFile, LevelMeta } from '../src/shared/level';
import { computeSolids, innerBounds, suggestZones } from '../src/logic/level';
import { layoutRacks, rackBounds } from '../src/logic/layout';
import { generateLagerDaten } from '../src/logic/demo';
import { generateProps, solidsWithProps } from '../src/logic/props';
import { spawnPoints } from '../src/logic/spawns';
import { MAPS, mapById, type MapDef } from '../src/logic/maps';
import { generateStructures } from '../src/logic/structures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../levels');

/** Spawnpunkte je Team (CS: 10 je Seite reichen für 5v5 + Bots). */
const SPAWNS_PER_TEAM = 10;

/**
 * Baut Karten (LevelFile, format 2) aus einem Lager und schreibt sie als JSON.
 *   bun run bake            → alle Karten der Registry (Demo-Generator)
 *   bun run bake de_rampe   → eine Karte der Registry
 *   bun run bake <kennung>  → echte DB (Env MSSQL_*) als de_<kennung>; ohne DB → Demo
 */
export function toLevel(meta: LevelMeta, lager: LagerDaten, propCount: number, seed: number): LevelFile {
  const base = computeSolids(lager);
  if (base.length === 0) throw new Error(`Level '${meta.id}': keine soliden Objekte (leeres Lager?)`);
  const zones = suggestZones(lager);
  const structures = generateStructures(lager, zones, 2, seed + 50);
  const props = generateProps(lager, zones, propCount, seed + 100, structures);
  const solids = solidsWithProps(lager, props, structures);
  const inner = innerBounds(rackBounds(layoutRacks(lager.lagerorte))!);
  const spawns = {
    t: spawnPoints(zones.t, SPAWNS_PER_TEAM, solids, inner),
    ct: spawnPoints(zones.ct, SPAWNS_PER_TEAM, solids, inner),
  };
  return { format: 2, name: meta.name, meta, lager, zones, props, spawns, structures };
}

async function loadFromDb(): Promise<LagerDaten | null> {
  const { MSSQL_SERVER, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD } = process.env;
  if (!MSSQL_SERVER || !MSSQL_DATABASE) return null;
  const sql = (await import('mssql')).default;
  const { LAGER_SQL, PLAETZE_SQL, attachBestaende, groupLagerorte } = await import('../src/logic/query');
  let pool;
  try {
    pool = await new sql.ConnectionPool({
      server: MSSQL_SERVER,
      database: MSSQL_DATABASE,
      user: MSSQL_USER ?? 'sa',
      password: MSSQL_PASSWORD ?? '',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 10_000,
      requestTimeout: 30_000,
      pool: { max: 2, min: 0 },
    }).connect();
  } catch (err) {
    console.warn('[bake] MSSQL nicht erreichbar, verwende Demo-Lager.', String(err));
    return null;
  }
  try {
    const [plaetze, bestaende] = await Promise.all([
      pool.request().query(PLAETZE_SQL),
      pool.request().query(LAGER_SQL),
    ]);
    const daten = groupLagerorte(plaetze.recordset, undefined);
    attachBestaende(daten, bestaende.recordset, undefined);
    return daten;
  } finally {
    await pool.close().catch(() => undefined);
  }
}

function fmt(v: [number, number, number]): string {
  return `(${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])})`;
}

function write(level: LevelFile): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = resolve(OUT_DIR, `${level.meta!.id}.json`);
  writeFileSync(file, JSON.stringify(level, null, 2));
  const count = level.lager.lagerorte.length;
  const cells = level.lager.lagerorte.reduce((s, o) => s + o.plaetze.length, 0);
  console.log(`[bake] ${level.meta!.id} → ${file}`);
  const ebenen = level.structures!.filter((s) => s.kind === 'platform').length;
  const rampe = level.structures!.some((s) => s.kind === 'dock');
  console.log(`[bake]   ${count} Lagerorte, ${cells} Plätze, ${level.props!.length} Requisiten, ${ebenen} Zwischenebenen${rampe ? ', Laderampe' : ''}, Spawns T/CT ${level.spawns!.t.length}/${level.spawns!.ct.length}`);
  console.log(`[bake]   Zonen: T=${fmt(level.zones.t)} CT=${fmt(level.zones.ct)} A=${fmt(level.zones.a)} B=${fmt(level.zones.b)}`);
}

function bakeDemo(def: MapDef): void {
  const lager = generateLagerDaten(def.orte, def.seed, def.layout);
  write(toLevel({ id: def.id, name: def.name, description: def.description }, lager, def.props, def.seed));
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg || arg === 'all') {
    for (const def of MAPS) bakeDemo(def);
    return;
  }
  const known = MAPS.find((m) => m.id === arg);
  if (known) {
    bakeDemo(known);
    return;
  }
  // Echte DB-Karte
  let lager: LagerDaten | null = null;
  try {
    lager = await loadFromDb();
  } catch {
    lager = null;
  }
  if (!lager) {
    console.warn(`[bake] Keine DB für '${arg}' — backe Demo-Karte ${mapById(arg).id}`);
    bakeDemo(mapById(arg));
    return;
  }
  const id = `de_${arg.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  write(toLevel({ id, name: `Lager ${arg}`, description: 'Aus der Lager-Datenbank gebacken.' }, lager, 20, 1));
}

await main();
