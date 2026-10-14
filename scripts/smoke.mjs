// Smoke-Test (CDP): startet einen headless Browser, lädt die Dev-URL im Auto-Modus
// (?auto=1: Lobby übersprungen, offline gegen Bots) und prüft End-to-End:
// Szene rendert, Runde wird live, Schuss trifft Bot, Eliminierung beendet Runde,
// Granate fliegt, Wand-Decal, Viewmodel, Kauf; keine Console-Fehler.
// Aufruf: bun scripts/smoke.mjs   (Dev-Server muss auf :3000 laufen)
//   Browser: Edge (Windows-Standard) oder per Env BROWSER=/pfad/zu/chromium

const BROWSER = process.env.BROWSER ?? process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9223;
const URL = process.env.URL ?? 'http://localhost:3000/?auto=1&fill=4';
const TIMEOUT = 20000;

function startBrowser() {
  const { spawn } = require('child_process');
  const profile = process.cwd() + '/.edge-smoke-' + process.pid;
  const args = [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800', 'about:blank',
  ];
  const proc = spawn(BROWSER, args, { stdio: 'ignore', detached: true });
  proc._profile = profile;
  return proc;
}

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (v.ok) return;
    } catch { /* weiter */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('CDP nicht erreichbar — Browser startet nicht?');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const proc = startBrowser();
  const fails = [];
  const ok = (msg) => console.log('✓ ' + msg);
  const fail = (msg) => { console.error('✗ ' + msg); fails.push(msg); };
  try {
    await waitForCdp();
    const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
    const target = newTab.ok ? await newTab.json() : null;
    if (!target?.webSocketDebuggerUrl) throw new Error('kein CDP-Target');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const errors = [];
    const send = (method, params = {}) => new Promise((resolve) => {
      const msgId = ++id;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r?.result?.value;
    };
    const evJson = async (expr) => JSON.parse((await ev(`JSON.stringify((${expr}) ?? null)`)) ?? 'null');

    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)?.(m.result); pending.delete(m.id); return; }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        errors.push('[console] ' + m.params.args.map((x) => x.value ?? x.description ?? '').join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('[log] ' + m.params.entry.text);
      if (m.method === 'Runtime.exceptionThrown') errors.push('[exc] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text));
    };

    await new Promise((r) => (ws.onopen = r));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });

    // 1) Szene-Hook
    const t0 = Date.now();
    let state = null;
    while (Date.now() - t0 < TIMEOUT) {
      state = await evJson('globalThis.__csw');
      if (state) break;
      await sleep(500);
    }
    if (!state) fail('Szene-Hook nie gesetzt (Engine gestartet?)');
    else ok('Szene: ' + JSON.stringify(state));

    // 2) Render
    await sleep(2000);
    const frames = await evJson('globalThis.__frames?.()');
    if (!frames || !frames.calls) fail('Renderer meldet keine Draw-Calls');
    else ok(`Render: ${frames.calls} Draw-Calls, ${frames.triangles} Triangles`);

    // 3) Viewmodel
    const vm = await evJson('globalThis.__vm?.()');
    if (vm?.loaded && vm.verts > 200) ok(`Viewmodel: ${vm.meshes} Mesh, ${vm.verts} Vertices`);
    else fail(`Viewmodel nicht geladen (${JSON.stringify(vm)})`);
    const aim = await evJson('globalThis.__vmAim?.()');
    if (aim && aim.z < 0) ok(`Mündung vor Kamera: z=${aim.z}`);
    else fail(`Mündung falsch (${JSON.stringify(aim)})`);

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

    // 4) Kaufphase abwarten (warmup 5 s → freeze), Kevlar kaufen (800 $ → 150 $)
    let st = await waitFor('globalThis.__state?.()', (v) => v.phase === 'freeze', 60000);
    if (st?.phase === 'freeze') ok('Kaufphase erreicht');
    else fail('Kaufphase nie erreicht: ' + JSON.stringify(st));
    const lo = await evJson('globalThis.__buy?.("kevlar")');
    const money = (await evJson('globalThis.__state?.()'))?.money;
    if (lo?.armor === 100 && money === 150) ok('Kauf: Kevlar für 650 $ (Rest 150 $)');
    else fail(`Kauf fehlgeschlagen: armor=${lo?.armor} money=${money}`);

    // 5) Runde live
    st = await waitFor('globalThis.__state?.()', (v) => v.phase === 'live' || v.phase === 'bomb', 60000);
    if (st?.phase === 'live') ok(`Runde live: ${JSON.stringify(st)}`);
    else fail('Runde wurde nie live: ' + JSON.stringify(st));

    // 6) Bots leben und bewegen sich
    const b1 = await evJson('globalThis.__bots?.()');
    await sleep(3000);
    const b2 = await evJson('globalThis.__bots?.()');
    const moved = b1 && b2 && b1.some((b, i) => Math.hypot(b.x - b2[i].x, b.z - b2[i].z) > 0.2);
    if (b1?.length >= 2 && moved) ok(`Bots: ${b1.length}, bewegen sich`);
    else fail(`Bots bewegen sich nicht: ${JSON.stringify(b1)} → ${JSON.stringify(b2)}`);

    // 7) Schuss auf Gegner-Bot (AWP, Körpermitte, 4 m)
    const before = await evJson('globalThis.__enemyHp?.()');
    const aimRes = await evJson('globalThis.__aimAtBot?.()');
    await sleep(1500);
    const after = await evJson('globalThis.__enemyHp?.()');
    const victim = aimRes?.target;
    const hpB = before?.find((p) => p.id === victim)?.hp;
    const hpA = after?.find((p) => p.id === victim)?.hp;
    if (victim && hpA < hpB) ok(`Schuss trifft Bot ${victim}: HP ${hpB} → ${hpA}`);
    else fail(`Schuss ohne Treffer (${JSON.stringify(aimRes)}, ${hpB} → ${hpA})`);

    // 8) Wand-Decal
    await evJson('globalThis.__wallShot?.()');
    await sleep(1200);
    const decals = await evJson('globalThis.__decals?.()');
    if (decals && decals.count >= 1 && decals.maxSize <= 0.1) ok(`Wand-Decal: ${decals.count} aktiv, ${decals.nearest} m, ≤${decals.maxSize} m`);
    else fail(`Wand-Decal fehlt (${JSON.stringify(decals)})`);

    // 9) Granate werfen → fliegt → Rauch
    await evJson('globalThis.__throwNade?.("smoke")');
    const nades = await waitFor('({n: globalThis.__nades?.()})', (v) => v.n >= 1, 5000, 200);
    if (nades?.n >= 1) ok(`Granate unterwegs: ${nades.n}`);
    else fail('Granate nicht erzeugt');
    const sm = await waitFor('globalThis.__state?.()', (v) => v.smokes >= 1, 20000);
    if (sm?.smokes >= 1) ok('Rauchwolke aktiv');
    else fail('Rauch nicht gezündet: ' + JSON.stringify(sm));

    // 10) Alle CT eliminieren → Runde endet 1:0
    await evJson('globalThis.__killTeam?.("CT")');
    const st2 = await waitFor('globalThis.__state?.()', (v) => v.score === '1:0', 10000, 300);
    if (st2?.score === '1:0' && (st2.phase === 'roundEnd' || st2.phase === 'freeze')) ok(`Eliminierung: ${st2.score} → ${st2.phase}, Geld ${st2.money}`);
    else fail(`Eliminierung fehlgeschlagen: ${JSON.stringify(st2)}`);

    // 11) Nächste Runde startet (freeze) und Spieler lebt
    const st3 = await waitFor('globalThis.__state?.()', (v) => v.round === 2, 40000);
    const pos = await evJson('globalThis.__pos?.()');
    if (st3?.round === 2 && st3.alive?.T >= 1 && st3.alive?.CT >= 1 && pos && !pos.dead) ok(`Runde 2 gestartet (${st3.phase}), alle respawnt`);
    else fail(`Runde 2 nicht gestartet: ${JSON.stringify(st3)} ${JSON.stringify(pos)}`);

    const relevant = errors.filter((e) => !/DRACOLoader|KTX2Loader/.test(e));
    if (relevant.length) fail('Console-Fehler:\n' + relevant.join('\n'));
    else ok('Keine Console-Fehler');
    ws.close();
  } catch (e) {
    fail(String(e));
  } finally {
    try { proc.kill(); } catch { /* tot */ }
    try { require('fs').rmSync(proc._profile, { recursive: true, force: true }); } catch { /* egal */ }
  }
  console.log(fails.length ? `SMOKE FEHLGESCHLAGEN (${fails.length})` : 'SMOKE OK');
  process.exit(fails.length ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
