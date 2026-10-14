// Waffen-Sichtprüfung (CDP, headless Chromium): speichert für jede Waffe das First-Person-Bild
// (Dev-Hooks __weapon / __vmAim in src/main.ts) als PNG; die Kontaktbögen baut
// scripts/weapon-contact.py daraus. Soldat- und Drop-Ansicht: weapon-lab.html (Dev-Seite, siehe weapon-lab.mjs).
// Aufruf: BROWSER=/opt/pw-browsers/chromium bun scripts/weapon-sheet.mjs <ausgabeordner> [id,id,…] [wartezeit ms]
//   Dev-Server muss laufen (URL per Env, Standard http://localhost:3103/?auto=1&fill=4&quality=low).
const BROWSER = process.env.BROWSER ?? '/opt/pw-browsers/chromium';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9231);
const URL = process.env.URL ?? 'http://localhost:3103/?auto=1&fill=4&quality=low';
const OUT = process.argv[2] ?? '.';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const WAIT = Number(process.argv[4] ?? 2600);
// Optional: Clip einfrieren, z. B. PREVIEW=reload:0.45 (reload | reloadEmpty | draw | inspect | cycle); PREFIX = Dateipräfix
const PREVIEW = process.env.PREVIEW ?? '';
const PREFIX = process.env.PREFIX ?? 'fp';

const { spawn } = require('child_process');
const { writeFileSync, rmSync, mkdirSync } = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  mkdirSync(OUT, { recursive: true });
  const profile = (process.env.TMPDIR ?? '/tmp') + '/.weapon-sheet-' + process.pid;
  const proc = spawn(BROWSER, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,800', 'about:blank',
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
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.exceptionThrown') logs.push('[exc] ' + (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text));
    };
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;
    await new Promise((r) => (ws.onopen = r));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 120; i++) { if (await ev('typeof globalThis.__weapons === "function"')) break; await sleep(500); }
    const ids = ONLY ?? JSON.parse(await ev('JSON.stringify(__weapons())'));
    // Ruhige Ausgangslage: Bots pausieren, Blick geradeaus
    await ev('__pauseBots(600000); __look(0, 0); __lab(true)');
    // HUD ausblenden, nur das Fadenkreuz bleibt (Kind mit top/left 50 % und Breite 0)
    await ev(`(() => { const r = document.querySelector('needle-engine').lastElementChild; for (const c of r.children) if (!(c.style.top === '50%' && c.style.left === '50%' && c.style.width === '0px')) c.style.display = 'none'; })()`);
    const TEAM = process.env.TEAM ?? 'T';
    const meta = {};
    for (const wid of ids) {
      // Rundenstart (onSpawn) kann das Modell zurücksetzen → nach dem Bild prüfen und ggf. wiederholen
      for (let tries = 0; tries < 6; tries++) {
        await ev(`__vmShow(${JSON.stringify(wid)}, ${JSON.stringify(TEAM)})`);
        await sleep(WAIT);
        if (PREVIEW) {
          const [kind, frac] = PREVIEW.split(':');
          await ev(`__vmPreview(${JSON.stringify(kind)}, ${Number(frac ?? 0.5)})`);
          await sleep(900);
        }
        meta[wid] = JSON.parse((await ev('JSON.stringify(__vmAim())')) ?? 'null');
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${OUT}/${PREFIX}-${wid}.png`, Buffer.from(shot.data, 'base64'));
        if ((await ev('__vm().model')) === wid) break;
      }
      console.log('fp', wid, JSON.stringify(meta[wid]));
    }
    writeFileSync(`${OUT}/${PREFIX}-meta.json`, JSON.stringify(meta, null, 1));
    if (logs.length) console.log('Konsole:\n' + logs.filter((l) => !/DRACOLoader|KTX2Loader/.test(l)).join('\n'));
    ws.close();
  } finally {
    try { process.kill(-proc.pid); } catch { try { proc.kill(); } catch { /* tot */ } }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ }
  }
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
