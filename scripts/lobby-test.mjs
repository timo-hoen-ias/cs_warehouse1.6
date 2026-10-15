// Serverbrowser-/Serverlobby-Test (CDP, zwei Browser): startet den lokalen Relay,
// Browser A erstellt einen passwortgeschützten Server mit Serverlobby (?auto=1&host=1),
// Browser B öffnet das Hauptmenü im Serverbrowser und prüft: Server wird über den
// Discovery-Raum gefunden (Name, Karte, Spieler, Schloss, Status, Latenz), falsches
// Passwort → Kick zurück ins Menü mit Meldung, richtiges Passwort → Beitritt,
// beide sehen die Serverlobby, Host startet das Match → Kaufphase auf beiden.
// Aufruf: URL=http://localhost:3000/ BROWSER=/pfad/chromium bun scripts/lobby-test.mjs
//   Optional: SHOT_DIR=/pfad → Screenshots von Serverbrowser und Lobby.

const BROWSER = process.env.BROWSER ?? process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RELAY_PORT = 9102;
const ROOM = 'LOBBY7';
const BASE = process.env.URL ?? 'http://localhost:3000/';
const SHOT_DIR = process.env.SHOT_DIR ?? '';
const { spawn } = require('child_process');
const { rmSync, writeFileSync } = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browser(port, name) {
  const profile = process.cwd() + `/.edge-lobby-${name}-${process.pid}`;
  const proc = spawn(BROWSER, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', 'about:blank',
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const evJson = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `JSON.stringify((() => { try { return (${expr}); } catch (e) { return null; } })() ?? null)`, returnByValue: true, awaitPromise: true });
    try { return JSON.parse(r?.result?.value ?? 'null'); } catch { return null; }
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
  const shot = async (file) => {
    if (!SHOT_DIR) return;
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOT_DIR}/${file}`, Buffer.from(s.data, 'base64'));
  };
  return {
    name, errors, evJson, waitFor, shot,
    navigate: (url) => send('Page.navigate', { url }),
    close: () => { try { ws.close(); } catch { /* egal */ } try { proc.kill(); } catch { /* tot */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ } },
  };
}

async function run() {
  const fails = [];
  const ok = (m) => console.log('✓ ' + m);
  const fail = (m) => { console.error('✗ ' + m); fails.push(m); };
  const relay = spawn(process.execPath, ['scripts/relay-server.ts', String(RELAY_PORT)], { stdio: 'ignore' });
  await sleep(1200);
  let a = null;
  let b = null;
  try {
    const server = encodeURIComponent(`ws://localhost:${RELAY_PORT}/socket`);
    a = await browser(9241, 'A');
    b = await browser(9242, 'B');
    await a.navigate(`${BASE}?auto=1&host=1&lobby=1&room=${ROOM}&sname=Testlager&pw=geheim&max=4&fill=2&name=Anna&team=T&quality=low&server=${server}`);

    // 1) Host läuft, Serverlobby hält das Aufwärmen
    const la = await a.waitFor('globalThis.__lobby?.()', (v) => v.host && v.held, 60000);
    if (la?.held && la.cfg?.name === 'Testlager' && la.cfg?.pw && la.cfg.pw !== 'geheim') ok(`Host mit Serverlobby: ${la.cfg.name}, max ${la.cfg.maxPlayers}, Passwort als Prüfsumme`);
    else fail('Host/Lobby fehlt: ' + JSON.stringify(la));

    // 2) Browser B: Hauptmenü → Serverbrowser findet den Server über den Discovery-Raum
    await b.navigate(`${BASE}?menu=browser&quality=low&server=${server}`);
    const row = await b.waitFor(`(() => { const r = document.querySelector('tr[data-room="${ROOM}"]'); return r ? { text: r.textContent, lock: !!r.querySelector('.lock svg') } : null; })()`, (v) => /Testlager/.test(v.text) && /ms/.test(v.text), 40000);
    if (row && /Testlager/.test(row.text) && row.lock && /1\/4/.test(row.text) && /Lobby/.test(row.text) && /ms/.test(row.text)) ok(`Serverbrowser: ${row.text.replace(/\s+/g, ' ').trim()}`);
    else fail('Server nicht (vollständig) gefunden: ' + JSON.stringify(row));
    await b.shot('30_serverbrowser.png');

    // 3) Falsches Passwort → Host lehnt ab → zurück im Menü mit Meldung
    await b.evJson(`(() => { document.querySelector('tr[data-room="${ROOM}"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()`);
    const dlg = await b.waitFor('document.querySelector("#mm-joinpw") ? 1 : null', (v) => v === 1, 5000, 200);
    if (dlg) ok('Passwort-Dialog erscheint');
    else fail('Kein Passwort-Dialog');
    await b.evJson(`(() => { document.querySelector('#mm-joinpw').value = 'falsch'; document.querySelector('[data-act="pw-ok"]').click(); return 1; })()`);
    const kicked = await b.waitFor('document.querySelector(".mm-msg.on")?.textContent', (v) => /Passwort/.test(v), 60000);
    if (kicked) ok(`Falsches Passwort abgewiesen: „${kicked}“`);
    else fail('Kein Kick bei falschem Passwort: ' + JSON.stringify(await b.evJson('[location.search, globalThis.__state?.(), document.querySelector(".mm-msg")?.textContent]')));

    // 4) Richtiges Passwort → Beitritt
    await b.waitFor(`document.querySelector('tr[data-room="${ROOM}"]') ? 1 : null`, (v) => v === 1, 30000);
    await b.evJson(`(() => { document.querySelector('tr[data-room="${ROOM}"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()`);
    await b.waitFor('document.querySelector("#mm-joinpw") ? 1 : null', (v) => v === 1, 5000, 200);
    await b.evJson(`(() => { document.querySelector('#mm-joinpw').value = 'geheim'; document.querySelector('[data-act="pw-ok"]').click(); return 1; })()`);
    const joined = await a.waitFor('globalThis.__players?.()', (v) => v.filter((p) => !p.bot).length === 2, 60000);
    const mirror = await b.waitFor('globalThis.__lobby?.()', (v) => v.held && !v.host, 30000);
    if (joined?.filter((p) => !p.bot).length === 2 && mirror) ok(`Beitritt mit Passwort: Host sieht ${joined.filter((p) => !p.bot).map((p) => p.name).join(', ')}, Client in der Serverlobby`);
    else fail(`Beitritt fehlgeschlagen: ${JSON.stringify(joined)} / ${JSON.stringify(mirror)} / B=${JSON.stringify(await b.evJson('[location.search, globalThis.__netId?.(), globalThis.__driver?.options?.passwordDigest]'))} A=${JSON.stringify(await a.evJson('[globalThis.__netId?.(), globalThis.__driver?.lobbyConfig?.pw, globalThis.__frames?.()]'))}`);
    const lobbyUi = await b.waitFor('document.querySelector("#lobby.on")?.textContent', (v) => /Warte auf den Host/.test(v), 15000);
    if (lobbyUi) ok('Serverlobby beim Client sichtbar (wartet auf Host)');
    else fail('Serverlobby-Overlay beim Client fehlt');
    const hostUi = await a.waitFor('document.querySelector("#lobby-start") ? document.querySelector("#lobby").textContent : null', (v) => /Anna/.test(v), 15000);
    if (hostUi) ok('Host sieht „Spiel starten“ und die Spielerliste');
    else fail('Host-Lobby ohne Start-Knopf');
    await a.shot('31_serverlobby_host.png');

    // 5) Host startet → Kaufphase auf beiden, Lobby weg
    await a.evJson('(() => { document.querySelector("#lobby-start").click(); return 1; })()');
    const started = await a.waitFor('globalThis.__state?.()', (v) => !v.lobby && (v.phase === 'freeze' || v.phase === 'live'), 40000);
    const startedB = await b.waitFor('globalThis.__state?.()', (v) => !v.lobby && v.round >= 1, 30000);
    if (started && !started.lobby && (started.phase === 'freeze' || started.phase === 'live') && startedB && !startedB.lobby && startedB.round >= 1) ok(`Match gestartet: Host ${started.phase}, Client Runde ${startedB.round}`);
    else fail(`Start fehlgeschlagen: ${JSON.stringify(started)} / ${JSON.stringify(startedB)}`);

    const errs = [...a.errors, ...b.errors].filter((e) => !/DRACOLoader|KTX2Loader|Websocket connection closed|networking-2\.needle/.test(e));
    if (errs.length) fail('Fehler:\n' + errs.join('\n'));
    else ok('Keine Console-Fehler');
  } catch (e) {
    fail(String(e));
  } finally {
    a?.close();
    b?.close();
    relay.kill();
  }
  console.log(fails.length ? `LOBBYTEST FEHLGESCHLAGEN (${fails.length})` : 'LOBBYTEST OK');
  process.exit(fails.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
