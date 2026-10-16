// Smoke-Test (CDP): startet einen headless Browser, lädt die Dev-URL im Auto-Modus
// (?auto=1: Lobby übersprungen, offline gegen Bots) und prüft End-to-End:
// Szene rendert, Runde wird live, Schuss trifft Bot, Eliminierung beendet Runde,
// Granate fliegt, Wand-Decal, Viewmodel, Kauf; keine Console-Fehler.
// Aufruf: bun scripts/smoke.mjs   (Dev-Server muss auf :3000 laufen)
//   Browser: Edge (Windows-Standard) oder per Env BROWSER=/pfad/zu/chromium; CDP_PORT (Standard 9223), URL

const BROWSER = process.env.BROWSER ?? process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
// Parallel laufende Sitzungen: CDP-Port per Umgebung abweichend setzen (CDP_PORT=9308)
const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const URL = process.env.URL ?? 'http://localhost:3000/?auto=1&fill=4&quality=low';
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

    // Audio entsperren (Nutzergeste simulieren; Browser läuft mit --autoplay-policy=no-user-gesture-required)
    await ev(`document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 1`);

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

    // 3b) Audio: Kontext läuft, alle Grund-Samples geladen (keine Fehler), Raum-Teppich spielt
    const au = await waitFor('globalThis.__audio?.()', (v) => v.state === 'running' && v.pending === 0 && v.loaded >= 150 && v.ambienceVoices > 0, 30000);
    if (au?.state === 'running' && au.loaded >= 150 && au.failed === 0 && au.ambienceVoices > 0)
      ok(`Audio: ${au.loaded} Samples (${au.format}), ${au.voices} Stimmen, Raum ${au.room}, Ambience ${au.ambienceVoices}, Emitter ${au.emitters}`);
    else fail('Audio nicht bereit: ' + JSON.stringify(au));

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

    // 6b) Namensschilder: nur lebende Kameraden, nie Gegner (sonst durch Wände zu orten)
    const me = await evJson('globalThis.__players?.().find((p) => !p.bot)');
    const labels = await evJson('globalThis.__labels?.()');
    const enemyShown = labels?.filter((l) => l.team !== me?.team && l.shown) ?? [];
    const mateShown = labels?.filter((l) => l.team === me?.team && l.alive && l.shown) ?? [];
    if (labels?.length && !enemyShown.length && mateShown.length) ok(`Namensschilder: ${mateShown.length} Kameraden sichtbar, 0 Gegner`);
    else fail(`Namensschilder falsch: ${JSON.stringify({ team: me?.team, labels })}`);

    // 6b) Mündung der Spielfigur: vor dem Körper, auf Brust-/Kopfhöhe (Mündungsfeuer/Leuchtspur fremder Spieler)
    const bm = b2?.length ? await evJson(`globalThis.__soldierMuzzle?.(${JSON.stringify(b2[0].id)})`) : null;
    const bmd = bm ? Math.hypot(bm.x - bm.rx, bm.z - bm.rz) : 0;
    // Höhe relativ zu den Füßen (Bots stehen auf der Karte auch auf Rampen/Ebenen)
    const bmh = bm ? bm.y - (bm.ry ?? 0) : 0;
    if (bm && bmh > 1.0 && bmh < 1.75 && bmd > 0.3 && bmd < 1.2) ok(`Mündung des Bots: ${bmd.toFixed(2)} m vor dem Körper, Höhe ${bmh.toFixed(2)} über den Füßen`);
    else fail(`Mündung des Bots unplausibel: ${JSON.stringify(bm)}`);

    // 6c) Bewegung wie CS 1.6: Tempo je Waffe (Messer 6.2, AWP 5.2, gezoomt 3.7 m/s), Shift-Schleichen leise, Strg-Ducken, Sprunghöhe, Sturzschaden
    await evJson('globalThis.__pauseBots?.(60000)');
    await ev('globalThis.__weapon("knife")');
    const home = await evJson('globalThis.__pos?.()');
    const openRun = await evJson('globalThis.__openRun?.()');
    if (openRun?.free >= 12) ok(`Anlaufstrecke: ${openRun.free} m frei`);
    else fail('keine freie Anlaufstrecke: ' + JSON.stringify(openRun));
    // Tasten halten und Tempo/Sprunghöhe messen. Die Spielzeit läuft pro Frame höchstens 0.1 s weiter: bei hoher CPU-Last
    // (Frames von Sekunden) reichen feste Echtzeit-Haltezeiten nicht aus, um das Tempo zu erreichen. Daher: mindestens `ms`
    // halten UND weitermessen, bis das Tempo sich 6 Frames lang nicht mehr erhöht (Plateau); Modus 'jump': bis zur Landung.
    // Obergrenze 40 s. Die Sollwerte und Toleranzen der Prüfungen bleiben unverändert.
    const holdKeys = (codes, ms, mode = 'speed') => ev(`new Promise((res) => {
      const codes = ${JSON.stringify(codes)};
      for (const code of codes) document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      const p0 = globalThis.__pos();
      let max = 0, maxY = 0, frames = 0, lastImprove = 0, airSeen = false;
      const t0 = performance.now();
      const loop = () => {
        const p = globalThis.__pos();
        frames++;
        if (p.speed > max + 0.02) { max = p.speed; lastImprove = frames; }
        maxY = Math.max(maxY, p.y - p0.y);
        if (p.air) airSeen = true;
        const el = performance.now() - t0;
        const done = ${JSON.stringify(mode)} === 'jump' ? (airSeen && !p.air && el > 300) : (el >= ${ms} && frames - lastImprove >= 6);
        if (!done && el < 40000) requestAnimationFrame(loop);
        else { for (const code of codes) document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); res(JSON.stringify({ max, maxY, run: p.run, ms: Math.round(el) })); }
      };
      loop();
    })`).then((v) => JSON.parse(v ?? 'null'));
    const reset = async () => { await ev(`globalThis.__teleport(${home.x}, ${home.z}, ${openRun.yaw}, ${home.y})`); await sleep(400); };
    const steps = async () => (await evJson('globalThis.__audio?.()'))?.played?.step ?? 0;
    const inRange = (v, lo, hi) => v >= lo && v <= hi;
    await reset();
    const kRun = await holdKeys(['KeyW'], 1500);
    if (inRange(kRun?.max, 5.7, 6.35)) ok(`Messer-Lauftempo: ${kRun.max.toFixed(2)} m/s (Soll 6.2)`);
    else fail('Messer-Lauftempo: ' + JSON.stringify(kRun));
    await reset();
    const stepsBeforeRun = await steps();
    await holdKeys(['KeyW'], 2500);
    const stepsRun = (await steps()) - stepsBeforeRun;
    await reset();
    const kWalk = await holdKeys(['KeyW', 'ShiftLeft'], 1500);
    if (inRange(kWalk?.max, 3.0, 3.45)) ok(`Schleichen (Shift): ${kWalk.max.toFixed(2)} m/s (Soll 3.2)`);
    else fail('Schleichen (Shift): ' + JSON.stringify(kWalk));
    await reset();
    const stepsBeforeWalk = await steps();
    await holdKeys(['KeyW', 'ShiftLeft'], 1800);
    const stepsWalk = (await steps()) - stepsBeforeWalk;
    if (stepsRun >= 1 && stepsWalk === 0) ok(`Schritte: Rennen ${stepsRun} Geräusche, Schleichen ${stepsWalk} (leise)`);
    else fail(`Schrittgeräusche: Rennen ${stepsRun}, Schleichen ${stepsWalk}`);
    await reset();
    const kDuck = await holdKeys(['KeyW', 'ControlLeft'], 1500);
    if (inRange(kDuck?.max, 1.9, 2.3)) ok(`Ducken (Strg): ${kDuck.max.toFixed(2)} m/s (Soll 2.1)`);
    else fail('Ducken (Strg): ' + JSON.stringify(kDuck));
    await ev('globalThis.__zoom("awp").then((v) => JSON.stringify(v))');
    await ev('globalThis.__unzoom()');
    await sleep(400);
    await reset();
    const awpRun = await holdKeys(['KeyW'], 1500);
    if (inRange(awpRun?.max, 4.9, 5.35)) ok(`AWP-Lauftempo: ${awpRun.max.toFixed(2)} m/s (Soll 5.2 — langsamer als das Messer)`);
    else fail('AWP-Lauftempo: ' + JSON.stringify(awpRun));
    await ev('globalThis.__zoom("awp").then((v) => JSON.stringify(v))');
    await reset();
    const awpScoped = await holdKeys(['KeyW'], 1500);
    if (inRange(awpScoped?.max, 3.4, 3.95)) ok(`AWP gezoomt: ${awpScoped.max.toFixed(2)} m/s (Soll 3.7)`);
    else fail('AWP gezoomt: ' + JSON.stringify(awpScoped));
    await ev('globalThis.__unzoom()');
    await ev('globalThis.__weapon("knife")');
    await reset();
    const jump = await holdKeys(['Space'], 1100, 'jump');
    if (inRange(jump?.maxY, 0.95, 1.25)) ok(`Sprunghöhe: ${jump.maxY.toFixed(2)} m (Soll ≈ 1.1)`);
    else fail('Sprunghöhe: ' + JSON.stringify(jump));
    // Sturz: 3 m harmlos, 8 m ≈ 30 HP Schaden (Host rechnet)
    const d3 = await evJson('globalThis.__dropTest?.(3)');
    await waitFor('globalThis.__pos?.()', (v) => v.air, 5000, 100);
    await waitFor('globalThis.__pos?.()', (v) => !v.air, 20000, 250); // Software-Rendering: Bildrate niedrig, Spielzeit läuft langsamer
    await sleep(600);
    const p3 = await evJson('globalThis.__pos?.()');
    if (!d3?.error && p3?.hp === 100) ok('Sturz aus 3 m: kein Schaden');
    else fail(`Sturz aus 3 m: ${JSON.stringify(d3)} hp=${p3?.hp}`);
    const d8 = await evJson('globalThis.__dropTest?.(8)');
    await waitFor('globalThis.__pos?.()', (v) => v.air, 5000, 100);
    await waitFor('globalThis.__pos?.()', (v) => !v.air, 30000, 250);
    await sleep(800);
    const p8 = await evJson('globalThis.__pos?.()');
    if (!d8?.error && p8 && p8.hp < 90 && p8.hp > 50) ok(`Sturz aus 8 m: ${100 - p8.hp} HP Schaden`);
    else fail(`Sturz aus 8 m: ${JSON.stringify(d8)} hp=${p8?.hp}`);

    // 6d) Dynamisches Licht: Explosion/Mündungsfeuer landen im Pool und im Shader-Array (Einzelstufe niedrig: 2, hoch: 6 Lichter)
    await evJson('globalThis.__lightTest?.("he", 4)');
    const dl = await waitFor('globalThis.__dynLights?.()', (v) => v.active >= 1, 4000, 100);
    if (dl?.active >= 1 && (dl.max === 2 || dl.max === 6)) ok(`Dynamisches Licht: ${dl.active} aktiv, Pool ${dl.pool}, max ${dl.max}`);
    else fail('Dynamisches Licht fehlt: ' + JSON.stringify(dl));
    await evJson('globalThis.__lightTest?.("muzzle", 3)');
    await waitFor('globalThis.__dynLights?.()', (v) => v.pool === 0, 15000, 200); // klingt ab → Pool leer
    const dl2 = await evJson('globalThis.__dynLights?.()');
    if (dl2?.pool === 0) ok('Dynamisches Licht klingt ab (Pool leer)');
    else fail('Dynamisches Licht bleibt hängen: ' + JSON.stringify(dl2));

    // 7) Schuss auf Gegner-Bot (Pistole, Körpermitte, ~4 m). Der Hook schießt erst, wenn die echte Kamera an der Zielpose
    // steht; Bots bleiben bis dahin angehalten. Unter hoher CPU-Last braucht ein Frame Sekunden → auf den Treffer warten
    // (statt fester Pause) und bei Fehlschlag mit frischen Positionen neu zielen (höchstens 3 Versuche, Prüfung bleibt: HP fällt).
    let hit = null;
    const shotLog = [];
    for (let attempt = 1; attempt <= 3 && !hit; attempt++) {
      const before = await evJson('globalThis.__enemyHp?.()');
      const aimRes = await evJson('globalThis.__aimAtBot?.()');
      const victim = aimRes?.target;
      const hpB = before?.find((p) => p.id === victim)?.hp;
      const after = victim ? await waitFor('globalThis.__enemyHp?.()', (v) => v.find((p) => p.id === victim)?.hp < hpB, 45000, 400) : null;
      const hpA = after?.find((p) => p.id === victim)?.hp;
      const info = await evJson('globalThis.__lastShot?.()');
      shotLog.push(`#${attempt} ${JSON.stringify(aimRes)} ${hpB} → ${hpA} ${JSON.stringify(info)}`);
      if (victim && hpA < hpB) hit = { victim, hpB, hpA, attempt, info };
    }
    if (hit) ok(`Schuss trifft Bot ${hit.victim}: HP ${hit.hpB} → ${hit.hpA} (Versuch ${hit.attempt}, Kamera nach ${hit.info?.settleMs} ms bereit)`);
    else fail('Schuss ohne Treffer:\n  ' + shotLog.join('\n  '));

    // 7b) Zielfernrohr: AWP zoomt (FOV 40), Viewmodel unsichtbar
    const z = JSON.parse((await ev('globalThis.__zoom?.("awp").then((v) => JSON.stringify(v))')) ?? 'null');
    if (z?.zoom === 1 && z.fov < 45 && z.vm === false) ok(`Zielfernrohr: Stufe ${z.zoom}, FOV ${z.fov}`);
    else fail('Zielfernrohr fehlerhaft: ' + JSON.stringify(z));
    await evJson('globalThis.__unzoom?.()');

    // 8) Wand-Decal (Wand 4–25 m vom T-Spawn, geprüfter Schuss; wie bei 7 erst nach stabiler Kamera, bis zu 3 Versuche)
    let wallOk = null;
    const wallLog = [];
    for (let attempt = 1; attempt <= 3 && !wallOk; attempt++) {
      const wallBefore = (await evJson('globalThis.__fxWall?.()')) ?? 0;
      const wres = await evJson('globalThis.__wallShot?.()');
      const wallAfter = wres?.ok ? (await waitFor('({ n: globalThis.__fxWall?.() })', (v) => v.n > wallBefore, 45000, 300))?.n ?? 0 : wallBefore;
      const decals = await evJson('globalThis.__decals?.()');
      wallLog.push(`#${attempt} ${JSON.stringify(wres)} ${wallBefore} → ${wallAfter} ${JSON.stringify(decals)} ${JSON.stringify(await evJson('globalThis.__lastShot?.()'))}`);
      if (wallAfter > wallBefore && decals && decals.maxSize <= 0.1) wallOk = { n: wallAfter - wallBefore, size: decals.maxSize, attempt, dist: wres.wallDist };
    }
    if (wallOk) ok(`Wand-Decal: ${wallOk.n} neu, Größe ≤${wallOk.size} m, Wand ${wallOk.dist} m entfernt (Versuch ${wallOk.attempt})`);
    else fail('Wand-Decal fehlt:\n  ' + wallLog.join('\n  '));

    // 9) Granate werfen → fliegt → Rauch
    await evJson('globalThis.__throwNade?.("smoke")');
    const nades = await waitFor('({n: globalThis.__nades?.()})', (v) => v.n >= 1, 5000, 200);
    if (nades?.n >= 1) ok(`Granate unterwegs: ${nades.n}`);
    else fail('Granate nicht erzeugt');
    const sm = await waitFor('globalThis.__state?.()', (v) => v.smokes >= 1, 20000);
    if (sm?.smokes >= 1) ok('Rauchwolke aktiv');
    else fail('Rauch nicht gezündet: ' + JSON.stringify(sm));

    // 9b) Waffe fallen lassen (G) und wieder aufheben (Drüberlaufen)
    const before9 = await evJson('globalThis.__state?.()');
    await ev(`(() => { const s = globalThis.__state(); globalThis.__weapon(s.secondary); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG', bubbles: true })); return 1; })()`);
    const dropped = await waitFor('globalThis.__state?.()', (v) => v.drops > before9.drops && v.secondary === null, 5000, 200);
    if (dropped && dropped.secondary === null && dropped.dropViews >= 1) ok(`Fallenlassen: ${before9.secondary} liegt am Boden (${dropped.drops} Drops)`);
    else fail('Fallenlassen fehlgeschlagen: ' + JSON.stringify(dropped));
    await sleep(1800);
    // vorwärts laufen (W) bis aufgehoben
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))`);
    const picked = await waitFor('globalThis.__state?.()', (v) => v.secondary !== null, 6000, 200);
    await ev(`document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }))`);
    if (picked?.secondary === before9.secondary) ok(`Aufheben: ${picked.secondary} wieder im Inventar`);
    else fail('Aufheben fehlgeschlagen: ' + JSON.stringify(picked));

    // 9c) Funkbefehl: Z öffnet Menü, 2 wählt „Nimm den Punkt ein!“ → Team-Funkspruch im Chat
    await ev(`(() => { for (const code of ['KeyZ', 'Digit2']) { document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); } return 1; })()`);
    const radio = await waitFor('globalThis.__state?.()', (v) => typeof v.chat === 'string' && v.chat.startsWith('[Funk]'), 3000, 200);
    if (radio?.chat?.startsWith('[Funk]')) ok(`Funkbefehl: ${radio.chat}`);
    else fail('Funkbefehl fehlt: ' + JSON.stringify(radio?.chat));

    // 10) Alle CT eliminieren → Runde endet 1:0
    await evJson('globalThis.__killTeam?.("CT")');
    const st2 = await waitFor('globalThis.__state?.()', (v) => v.score === '1:0', 10000, 300);
    if (st2?.score === '1:0' && (st2.phase === 'roundEnd' || st2.phase === 'freeze')) ok(`Eliminierung: ${st2.score} → ${st2.phase}, Geld ${st2.money}, ${st2.drops} Waffen am Boden`);
    else fail(`Eliminierung fehlgeschlagen: ${JSON.stringify(st2)}`);

    // 11) Nächste Runde startet (freeze) und Spieler lebt
    const st3 = await waitFor('globalThis.__state?.()', (v) => v.round === 2, 40000);
    const pos = await evJson('globalThis.__pos?.()');
    if (st3?.round === 2 && st3.alive?.T >= 1 && st3.alive?.CT >= 1 && pos && !pos.dead) ok(`Runde 2 gestartet (${st3.phase}), alle respawnt`);
    else fail(`Runde 2 nicht gestartet: ${JSON.stringify(st3)} ${JSON.stringify(pos)}`);

    // 11b) Audio nach dem Spielgeschehen: noch fehlerfrei, Stimmen-Limit eingehalten
    const au2 = await evJson('globalThis.__audio?.()');
    const pl = au2?.played ?? {};
    const groups = ['fire', 'impact', 'draw', 'ui', 'smoke'].filter((g) => !(pl[g] > 0));
    if (au2 && au2.failed === 0 && au2.voices <= 48 && au2.loaded >= au?.loaded && !groups.length) ok(`Audio nach Runde: ${au2.loaded} Samples, ${au2.voices} Stimmen, gespielt ${JSON.stringify(pl)}`);
    else fail('Audio fehlerhaft nach Runde: ' + JSON.stringify(au2));

    // 11c) Alle Audio-Pfade (Oberflächen, Explosion nah/fern, Tinnitus, C4, Vorbeiflug, Schrot-Nachladen)
    const before11 = (await evJson('globalThis.__audio?.()'))?.played ?? {};
    await evJson('globalThis.__audioProbe?.()');
    await sleep(800);
    const after11 = (await evJson('globalThis.__audio?.()'))?.played ?? {};
    const need = ['step', 'land', 'fire', 'far', 'flyby', 'impact', 'he', 'c4', 'ear', 'reload', 'ui'];
    const missing = need.filter((g) => !((after11[g] ?? 0) > (before11[g] ?? 0)));
    if (!missing.length) ok(`Audio-Pfade: ${need.join(', ')}`);
    else fail(`Audio-Pfade fehlen: ${missing.join(', ')} (${JSON.stringify(after11)})`);

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
