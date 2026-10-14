// Screenshot der laufenden Dev-URL (CDP, headless Chromium/Edge) — zum Sichtprüfen.
// Aufruf: BROWSER=/opt/pw-browsers/chromium bun scripts/screenshot.mjs [out.png] [wartezeit ms] [js-vorher]
const BROWSER = process.env.BROWSER ?? process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9224;
const URL = process.env.URL ?? 'http://localhost:3000/';
const OUT = process.argv[2] ?? 'smoke.png';
const WAIT = Number(process.argv[3] ?? 6000);
const PRE = process.argv[4] ?? '';

const { spawn } = require('child_process');
const { writeFileSync, rmSync } = require('fs');

async function run() {
  const profile = process.cwd() + '/.edge-shot-' + process.pid;
  const proc = spawn(BROWSER, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore', detached: true });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break; } catch { /* warten */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve) => { const m = ++id; pending.set(m, resolve); ws.send(JSON.stringify({ id: m, method, params })); });
    const logs = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.exceptionThrown') logs.push('[exc] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text));
    };
    await new Promise((r) => (ws.onopen = r));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: URL });
    await new Promise((r) => setTimeout(r, WAIT));
    if (PRE) {
      const res = await send('Runtime.evaluate', { expression: PRE, awaitPromise: true, returnByValue: true });
      console.log('Eval:', JSON.stringify(res?.result?.value ?? res?.result?.description ?? null));
      await new Promise((r) => setTimeout(r, 1500));
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log('Screenshot →', OUT);
    if (logs.length) console.log('Konsole:\n' + logs.filter((l) => !/DRACOLoader|KTX2Loader/.test(l)).join('\n'));
    ws.close();
  } finally {
    try { proc.kill(); } catch { /* tot */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ }
  }
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
