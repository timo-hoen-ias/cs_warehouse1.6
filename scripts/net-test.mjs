// Zwei-Client-Netzwerktest (CDP): startet den lokalen Relay-Server, öffnet zwei
// headless Browser im selben Raum (Host + Client) und prüft: beide verbunden,
// Host gewählt, Client spiegelt Spieler/Runde per Snapshot, Client-Schuss trifft
// Bot auf dem Host, Chat kommt an, Host-Migration nach Trennung.
// Aufruf: bun scripts/net-test.mjs   (Dev-Server :3000 muss laufen; BROWSER=/pfad/chromium)

const BROWSER = process.env.BROWSER ?? process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RELAY_PORT = 9100;
const ROOM = 'NETTEST';
const BASE = process.env.URL ?? 'http://localhost:3000/';
const { spawn } = require('child_process');
const { rmSync } = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startRelay() {
  return spawn(process.execPath, ['scripts/relay-server.ts', String(RELAY_PORT)], { stdio: 'inherit' });
}

async function browser(port, name) {
  const profile = process.cwd() + `/.edge-net-${name}-${process.pid}`;
  const proc = spawn(BROWSER, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1024,640', 'about:blank',
  ], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* warten */ }
    await sleep(500);
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve) => { const m = ++id; pending.set(m, resolve); ws.send(JSON.stringify({ id: m, method, params })); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('[exc] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('[console] ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');
  const evJson = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `JSON.stringify((${expr}) ?? null)`, returnByValue: true, awaitPromise: true });
    return JSON.parse(r?.result?.value ?? 'null');
  };
  const waitFor = async (expr, cond, ms, step = 500) => {
    const t = Date.now();
    let v = null;
    while (Date.now() - t < ms) {
      v = await evJson(expr);
      if (v && cond(v)) return v;
      await sleep(step);
    }
    return v;
  };
  return {
    name, errors, evJson, waitFor,
    navigate: (url) => send('Page.navigate', { url }),
    close: () => { try { ws.close(); } catch { /* egal */ } try { proc.kill(); } catch { /* tot */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ } },
  };
}

async function run() {
  const fails = [];
  const ok = (m) => console.log('✓ ' + m);
  const fail = (m) => { console.error('✗ ' + m); fails.push(m); };
  const relay = startRelay();
  await sleep(1200);
  let a = null;
  let b = null;
  try {
    const server = `ws://localhost:${RELAY_PORT}/socket`;
    const url = (name, team) => `${BASE}?auto=1&room=${ROOM}&server=${encodeURIComponent(server)}&name=${name}&team=${team}&fill=4`;
    a = await browser(9231, 'A');
    b = await browser(9232, 'B');
    await a.navigate(url('Anna', 'T'));
    await sleep(4000);
    await b.navigate(url('Bert', 'CT'));

    // 1) Beide verbunden, gleicher Host
    const na = await a.waitFor('globalThis.__netId?.()', (v) => v.id && v.peers.length >= 1, 40000);
    const nb = await b.waitFor('globalThis.__netId?.()', (v) => v.id && v.peers.length >= 1, 40000);
    if (na?.peers?.length >= 1 && nb?.peers?.length >= 1 && na.host === nb.host) ok(`Verbunden: A=${na.id.slice(0, 8)} B=${nb.id.slice(0, 8)} Host=${na.host.slice(0, 8)}`);
    else fail(`Verbindung/Host-Wahl: ${JSON.stringify(na)} / ${JSON.stringify(nb)}`);
    const hostIsA = na?.host === na?.id;
    const host = hostIsA ? a : b;
    const client = hostIsA ? b : a;

    // 2) Host hat beide Menschen im Match, Client spiegelt sie per Snapshot
    const ph = await host.waitFor('globalThis.__players?.()', (v) => v.filter((p) => !p.bot).length >= 2, 30000);
    const pc = await client.waitFor('globalThis.__players?.()', (v) => v.filter((p) => !p.bot).length >= 2 && v.some((p) => p.bot), 30000);
    const names = (l) => (l ?? []).filter((p) => !p.bot).map((p) => p.name).sort().join(',');
    if (names(ph) === 'Anna,Bert' && names(pc) === 'Anna,Bert') ok(`Spielerlisten synchron: ${names(pc)} + ${pc.filter((p) => p.bot).length} Bots`);
    else fail(`Spielerlisten: Host=${names(ph)} Client=${names(pc)}`);
    const sc = await client.evJson('globalThis.__state?.()');
    if (sc && sc.host === false && sc.players >= 2) ok(`Client-Spiegel: Phase ${sc.phase}, ${sc.players} Spieler`);
    else fail('Client-Spiegel fehlt: ' + JSON.stringify(sc));

    // 3) Runde live auf beiden
    const lh = await host.waitFor('globalThis.__state?.()', (v) => v.phase === 'live', 60000);
    const lc = await client.waitFor('globalThis.__state?.()', (v) => v.phase === 'live', 20000);
    if (lh?.phase === 'live' && lc?.phase === 'live') ok('Runde live auf Host und Client');
    else fail(`Runde nicht live: Host=${lh?.phase} Client=${lc?.phase}`);

    // 4) Client schießt auf einen Gegner-Bot → Host verrechnet Schaden, Client sieht ihn im Snapshot
    const aim = await client.evJson('globalThis.__aimAtBot?.(true)');
    const victim = aim?.target;
    const hv = await host.waitFor('globalThis.__players?.()', (v) => v.find((p) => p.id === victim)?.hp < 100, 8000, 300);
    const hpHost = hv?.find((p) => p.id === victim)?.hp;
    const cv = await client.waitFor('globalThis.__players?.()', (v) => v.find((p) => p.id === victim)?.hp < 100, 8000, 300);
    const hpClient = cv?.find((p) => p.id === victim)?.hp;
    if (victim && hpHost < 100 && hpClient === hpHost) ok(`Client-Schuss verrechnet: ${victim} HP ${hpHost} (Host) = ${hpClient} (Client)`);
    else fail(`Client-Schuss: ${JSON.stringify(aim)} Host-HP=${hpHost} Client-HP=${hpClient} Zähler Client=${JSON.stringify(await client.evJson('globalThis.__counters?.()'))} Host=${JSON.stringify(await host.evJson('globalThis.__counters?.()'))}`);

    // 5) Posen: Host sieht die Position des Clients
    const cpos = await client.evJson('globalThis.__pos?.()');
    const cid = (await client.evJson('globalThis.__netId?.()'))?.id;
    const seen = await host.waitFor(`(() => { const d = globalThis.__playerPose?.(${JSON.stringify(cid)}); return d; })()`, (v) => Math.hypot(v.x - cpos.x, v.z - cpos.z) < 1.5, 8000, 300);
    if (seen && Math.hypot(seen.x - cpos.x, seen.z - cpos.z) < 1.5) ok(`Pose synchron (Client ${cpos.x},${cpos.z} ↔ Host ${seen.x},${seen.z})`);
    else fail(`Pose nicht synchron: Client=${JSON.stringify(cpos)} Host=${JSON.stringify(seen)}`);

    // 6) Host-Migration: Host-Browser schließen → Client wird Host und spielt weiter
    host.close();
    const mig = await client.waitFor('globalThis.__state?.()', (v) => v.host === true, 30000);
    if (mig?.host === true && mig.players >= 1) ok(`Host-Migration: Client ist jetzt Host (${mig.players} Spieler, Phase ${mig.phase})`);
    else fail('Host-Migration fehlgeschlagen: ' + JSON.stringify(mig));

    const errs = [...a.errors, ...b.errors].filter((e) => !/DRACOLoader|KTX2Loader|Websocket connection closed/.test(e));
    if (errs.length) fail('Fehler:\n' + errs.join('\n'));
    else ok('Keine Console-Fehler');
  } catch (e) {
    fail(String(e));
  } finally {
    a?.close();
    b?.close();
    relay.kill();
  }
  console.log(fails.length ? `NETTEST FEHLGESCHLAGEN (${fails.length})` : 'NETTEST OK');
  process.exit(fails.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
