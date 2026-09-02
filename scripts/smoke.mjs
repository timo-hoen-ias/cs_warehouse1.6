// Smoke-Test M0 (CDP): startet einen headless Edge mit Dev-Port, lädt die Dev-URL
// und prüft, dass die Szene wirklich rendert (drei renderer.info) + keine Console-Fehler.
// Aufruf: bun scripts/smoke.mjs            (Dev-Server muss auf :3000 laufen)
//         bun run dev & bun run smoke

const EDGE = process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9223;
const URL = 'http://localhost:3000/';
const TIMEOUT = 18000;

function startEdge() {
  const { spawn } = require('child_process');
  // Eindeutiges Nutzerprofil pro Lauf → kein Konflikt mit hängenden Alt-Prozessen.
  const profile = process.cwd() + '/.edge-smoke-' + process.pid;
  const args = [
    '--headless=new', '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,800', 'about:blank',
  ];
  const proc = spawn(EDGE, args, { stdio: 'ignore', detached: true });
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
  throw new Error('CDP nicht erreichbar — Edge startet nicht?');
}

async function closeOldTabs() {
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    for (const t of tabs) if (t.type === 'page' && /localhost:3000/.test(t.url)) await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`).catch(() => {});
  } catch { /* egal */ }
}

async function run() {
  const edgeProc = startEdge();
  try {
    await waitForCdp();
    await closeOldTabs();
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
    const evalValue = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true }))?.result?.value;

    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
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

    // warten bis __csw (unser DEV-Hook) gesetzt ist
    const t0 = Date.now();
    let state = null;
    while (Date.now() - t0 < TIMEOUT) {
      const v = await evalValue(`globalThis.__csw ? JSON.stringify(globalThis.__csw) : null`);
      if (v) { state = JSON.parse(v); break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!state) { console.error('✗ Szene-Hook nie gesetzt (Engine gestartet?)'); process.exitCode = 1; }
    else console.log('✓ Szene: ' + JSON.stringify(state));

    // einige Frames rendern lassen, dann Draw-Calls prüfen
    await new Promise((r) => setTimeout(r, 2000));
    const frames = JSON.parse(await evalValue(`JSON.stringify(globalThis.__frames?.() ?? null)`) ?? 'null');
    if (!frames || !frames.calls || frames.calls <= 0) {
      console.error('✗ Renderer meldet keine Draw-Calls (nichts gerendert?)', frames);
      process.exitCode = 1;
    } else console.log(`✓ Render: ${frames.calls} Draw-Calls, ${frames.triangles} Triangles`);

    // Schießen: Ziel 0 anvisieren + AWP-Schuss → HP muss sinken
    if (!process.exitCode) {
      const before = JSON.parse(await evalValue(`JSON.stringify(globalThis.__dummyHp?.() ?? null)`) ?? 'null');
      await evalValue(`globalThis.__aimShoot?.(0); 'ok'`);
      await new Promise((r) => setTimeout(r, 700));
      const after = JSON.parse(await evalValue(`JSON.stringify(globalThis.__dummyHp?.() ?? null)`) ?? 'null');
      const dmg = before && after ? before[0] - after[0] : 0;
      if (dmg > 0) console.log(`✓ Schuss getroffen: Ziel-HP ${before[0]} → ${after[0]} (${dmg} Schaden)`);
      else { console.error(`✗ Schuss ohne Treffer (HP ${before?.[0]} → ${after?.[0]})`); process.exitCode = 1; }
    }

    // M2: Runde muss in 'live' kommen (freeze 6s)
    if (!process.exitCode) {
      const tRound = Date.now();
      let phase = null;
      while (Date.now() - tRound < 15000) {
        const r = JSON.parse(await evalValue(`JSON.stringify(globalThis.__round?.() ?? null)`) ?? 'null');
        if (r) { phase = r.phase; if (phase === 'live' || phase === 'roundEnd' || phase === 'bomb') break; }
        await new Promise((r2) => setTimeout(r2, 700));
      }
      if (phase === 'live') console.log('✓ Runde: live erreicht');
      else { console.error('✗ Runde wurde nie live (phase=' + phase + ')'); process.exitCode = 1; }
    }

    // M2: alle CT-Bots eliminieren → CT alive 0 → Runde gewonnen (1:0)
    if (!process.exitCode) {
      await evalValue(`globalThis.__killBots?.(); 'ok'`);
      await new Promise((r) => setTimeout(r, 600));
      const r = JSON.parse(await evalValue(`JSON.stringify(globalThis.__round?.() ?? null)`) ?? 'null');
      const alive = await evalValue(`globalThis.__aliveCts?.() ?? null`);
      if (r && (r.phase === 'roundEnd' || r.phase === 'freeze') && r.score === '1:0' && alive === 0) {
        console.log(`✓ Eliminierung: CT-Alive ${alive}, Score ${r.score} → ${r.phase}`);
      } else { console.error(`✗ Eliminierung fehlgeschlagen (phase=${r?.phase}, score=${r?.score}, alive=${alive})`); process.exitCode = 1; }
    }

    // Waffen-Viewmodel + Effekte: echtes OBJ geladen (>200 Vertices) & Schuss erzeugt Effekte
    if (!process.exitCode) {
      const vm = JSON.parse(await evalValue(`JSON.stringify(globalThis.__vm?.() ?? null)`) ?? 'null');
      if (vm?.loaded && vm.verts > 200) console.log(`✓ Viewmodel: ${vm.meshes} Mesh, ${vm.verts} Vertices`);
      else { console.error(`✗ Viewmodel nicht geladen (${JSON.stringify(vm)})`); process.exitCode = 1; }
      // Mündung muss in Kamerarichtung (z<0) und vor der Kamera liegen
      const aim = JSON.parse(await evalValue(`JSON.stringify(globalThis.__vmAim?.() ?? null)`) ?? 'null');
      if (aim && aim.z < 0) console.log(`✓ Mündung vor Kamera: z=${aim.z} (rechts x=${aim.x}, y=${aim.y})`);
      else { console.error(`✗ Mündung falsch ausgerichtet (${JSON.stringify(aim)})`); process.exitCode = 1; }
    }
    // Effekte + Wand-Decal: Schuss auf die leere Ostwand → Decal am echten Trefferpunkt
    if (!process.exitCode) {
      await evalValue(`globalThis.__wallShot?.(); 'ok'`);
      await new Promise((r) => setTimeout(r, 500));
      const decals = await evalValue(`globalThis.__decals?.() ?? null`);
      const created = await evalValue(`globalThis.__fxWall?.() ?? null`);
      const ok = decals && decals.count >= 1 && decals.nearest > 2 && decals.maxSize <= 0.1;
      if (ok) {
        console.log(`✓ Wand-Decal am Trefferpunkt: ${decals.count} aktiv, ${decals.nearest}m entfernt, Größe ≤${decals.maxSize}m (${created} gesamt)`);
      } else { console.error(`✗ Wand-Decal fehlt/am falschen Ort oder zu groß (${JSON.stringify(decals)}, created=${created})`); process.exitCode = 1; }
    }

    if (errors.length) { console.error('✗ Console-Fehler:\n' + errors.join('\n')); process.exitCode = 1; }
    else console.log('✓ Keine Console-Fehler');

    ws.close();
  } finally {
    try { edgeProc.kill(); } catch { /* tot */ }
    // Profil-Verzeichnis aufräumen
    try {
      const { rmSync } = require('fs');
      rmSync(edgeProc._profile, { recursive: true, force: true });
    } catch { /* egal */ }
  }
  console.log(process.exitCode ? 'SMOKE FEHLGESCHLAGEN' : 'SMOKE OK');
  process.exit(process.exitCode ?? 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
