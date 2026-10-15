// Karten-Übersicht: schreibt eine Draufsicht (PNG, nur Node-Bordmittel) und druckt
// Kennzahlen (Brushes, Navigationsknoten, Laufzeiten Spawn → Spots/Mitte).
// Aufruf: bun scripts/map-overview.ts [karten-id|all] [ausgabe.png] [px-pro-meter] [--nav] [--ascii]
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { MAPS, mapById } from '../src/maps';
import { compileMap } from '../src/logic/mapcompile';
import { renderOverview } from '../src/logic/overview';
import { routeLength } from '../src/logic/nav';
import { PLAYER } from '../src/logic/move';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const which = args[0] ?? 'all';
const ppm = Number(args[2] ?? 5);

/** CRC-32 (PNG-Chunks). */
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimaler PNG-Encoder (RGBA, 8 bit, Filter 0). */
export function encodePng(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

const ids = which === 'all' ? MAPS.map((m) => m.id) : [mapById(which).id];
for (const id of ids) {
  const t0 = performance.now();
  const data = mapById(id).build();
  const map = compileMap(data);
  const t1 = performance.now();
  const out = args[1] && ids.length === 1 ? args[1] : `${id}-overview.png`;
  const r = renderOverview(data, { pxPerM: ppm, labels: true, nav: flags.has('--nav') ? map.nav : undefined });
  writeFileSync(out, encodePng(r.w, r.h, r.data));
  const g = map.nav;
  const z = map.zones;
  const area = (n: string) => g.areas.find((a) => a.name === n)?.center;
  const mid = area('Xbox') ?? area('Mitte');
  const row = (label: string, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number } | undefined): string => {
    if (!to) return `${label}: —`;
    const len = routeLength(g, from, to);
    return `${label.padEnd(10)} ${len.toFixed(0).padStart(4)} m  · Laufen ${(len / PLAYER.runSpeed).toFixed(1).padStart(5)} s · Schleichen ${(len / PLAYER.walkSpeed).toFixed(1).padStart(5)} s`;
  };
  console.log(`\n${id} (${data.name}) → ${out}`);
  console.log(`  Brushes ${data.brushes.length}, Deko ${data.decor.length}, Lichter ${data.lights.length}, Bereiche ${data.areas.length}`);
  console.log(`  Nav: ${g.count} Knoten, ${g.edgeTo.length} Kanten; Kompilieren ${(t1 - t0).toFixed(0)} ms`);
  console.log('  ' + row('T → A', z.t, z.a));
  console.log('  ' + row('T → B', z.t, z.b));
  console.log('  ' + row('CT → A', z.ct, z.a));
  console.log('  ' + row('CT → B', z.ct, z.b));
  console.log('  ' + row('T → Mitte', z.t, mid));
  console.log('  ' + row('CT → Mitte', z.ct, mid));
  if (flags.has('--areas')) for (const a of g.areas) console.log(`  · ${a.name.padEnd(18)} ${String(a.nodeCount).padStart(5)} Knoten → ${a.neighbors.map((n) => g.areas[n]!.name).join(', ')}`);
}
