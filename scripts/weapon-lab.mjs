// Waffen-Labor-Screenshots (CDP, headless Chromium): rendert weapon-lab.html (src/dev/weaponLab.ts)
// mit verschiedenen Ansichten und speichert PNGs (je Ansicht ein Raster aller Waffen).
// Aufruf: BROWSER=/opt/pw-browsers/chromium bun scripts/weapon-lab.mjs <ausgabeordner> [name=query ...]
//   Beispiel: bun scripts/weapon-lab.mjs out soldier-side="view=soldier&az=90" dropped="view=dropped&az=30&el=20"
//   Ohne Ansichten: soldier-side, soldier-front, dropped, spec.
// Basis-URL per Env LAB (Standard http://localhost:3103/weapon-lab.html). Dev-Server muss laufen.
const BROWSER = process.env.BROWSER ?? '/opt/pw-browsers/chromium';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9232);
const BASE = process.env.LAB ?? 'http://localhost:3103/weapon-lab.html';
const OUT = process.argv[2] ?? '.';
const DEFAULT_VIEWS = {
  'soldier-side': 'view=soldier&az=90&el=6',
  'soldier-front': 'view=soldier&az=35&el=8',
  dropped: 'view=dropped&az=20&el=22',
  spec: 'view=spec',
};
const views = process.argv.length > 3
  ? Object.fromEntries(process.argv.slice(3).map((a) => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; }))
  : DEFAULT_VIEWS;

const { spawn } = require('child_process');
const { writeFileSync, rmSync, mkdirSync } = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  mkdirSync(OUT, { recursive: true });
  const profile = (process.env.TMPDIR ?? '/tmp') + '/.weapon-lab-' + process.pid;
  const proc = spawn(BROWSER, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1920,1500', 'about:blank',
  ], { stdio: 'ignore', detached: true });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break; } catch { /* warten */ }
      await sleep(500);
    }
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const logs = [];
    const send = (method, params = {}) => new Promise((resolve) => { const m = ++id; pending.set(m, resolve); ws.send(JSON.stringify({ id: m, method, params })); });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.exceptionThrown') logs.push('[exc] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text));
    };
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;
    await new Promise((r) => (ws.onopen = r));
    await send('Runtime.enable');
    await send('Page.enable');
    for (const [name, query] of Object.entries(views)) {
      const m = /cols=(\d+)/.exec(query);
      const cols = m ? Number(m[1]) : 6;
      const n = Number((/only=([^&]*)/.exec(query)?.[1] ?? '').split(',').filter(Boolean).length) || 29;
      const cw = Number(/cw=(\d+)/.exec(query)?.[1] ?? 320);
      const ch = Number(/ch=(\d+)/.exec(query)?.[1] ?? 300);
      const w = cols * cw;
      const h = Math.ceil(n / cols) * ch;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: `${BASE}?${query}` });
      let ready = false;
      for (let i = 0; i < 120 && !ready; i++) { await sleep(500); ready = await ev('globalThis.__labReady === true'); }
      if (!ready) console.log('!! nicht fertig:', name);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'));
      console.log('→', `${OUT}/${name}.png`);
    }
    if (logs.length) console.log('Konsole:\n' + logs.join('\n'));
    ws.close();
  } finally {
    try { process.kill(-proc.pid); } catch { try { proc.kill(); } catch { /* tot */ } }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ }
  }
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
