import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { LagerDaten } from '../src/shared/types';
import type { LevelFile } from '../src/shared/level';
import { computeSolids, suggestZones } from '../src/logic/level';
import { generateLagerDaten } from '../src/logic/demo';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../levels');

/**
 * Baue eine Karte (LevelFile) aus einem Lager und schreibe sie als JSON.
 * Wird per `bun run bake` ausgeführt. Ohne erreichbare MSSQL-DB wird das Demo-Lager gebacken.
 */

function toLevel(name: string, lager: LagerDaten): LevelFile {
  const solids = computeSolids(lager);
  if (solids.length === 0) throw new Error(`Level '${name}': keine soliden Objekte (leeres Lager?)`);
  return { format: 1, name, lager, zones: suggestZones(lager) };
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

async function main(): Promise<void> {
  const nameArg = process.argv[2] ?? 'demo';
  const lagerArg = process.argv[3]; // optional: Anzahl Demo-Orte (nur Demo-Modus)

  let lager: LagerDaten | null = null;
  let fromDb = false;

  if (nameArg !== 'demo') {
    // Explizite Karte verlangt DB (per Env konfiguriert)
    try {
      lager = await loadFromDb();
      fromDb = !!lager;
    } catch {
      lager = null;
    }
  }
  if (!lager) {
    const orte = lagerArg ? Number(lagerArg) || 16 : 16;
    lager = generateLagerDaten(orte, 1);
  }

  const name = fromDb ? `de-${nameArg}` : 'de-demo';
  const level = toLevel(name, lager);
  mkdirSync(OUT_DIR, { recursive: true });
  const file = resolve(OUT_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(level, null, 2));
  const count = level.lager.lagerorte.length;
  const cells = level.lager.lagerorte.reduce((s, o) => s + o.plaetze.length, 0);
  console.log(`[bake] ${name} geschrieben → ${file}`);
  console.log(`[bake] ${count} Lagerorte, ${cells} Plätze; Quelle: ${fromDb ? 'MSSQL' : 'Demo-Generator'}`);
  console.log(`[bake] Zonen: T=${fmt(level.zones.t)} CT=${fmt(level.zones.ct)} A=${fmt(level.zones.a)} B=${fmt(level.zones.b)}`);
}

await main();
