// Zwei-Client-Netzwerktest (CDP): startet den lokalen Relay-Server, öffnet zwei
// headless Browser im selben Raum (Host + Client) und prüft: Client mit falscher Karte
// lädt die Karte des Hosts, beide verbunden, Host gewählt, Client spiegelt Spieler/Runde
// per Snapshot, Client-Schuss trifft Bot auf dem Host, bösartige Nachrichten (XSS,
// `__proto__`, NaN, gefälschte Stürze/Kicks/Snapshots) richten nichts an, Host-Migration.
// Aufruf: bun scripts/net-test.mjs   (Dev-Server :3000 muss laufen; BROWSER=/pfad/chromium)

const BROWSER = process.env.BROWSER ?? process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
// Parallel laufende Sitzungen: Relay-Port, Raum und CDP-Ports per Umgebung abweichend setzen
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 9100);
const ROOM = process.env.ROOM ?? 'NETTEST';
const CDP_A = Number(process.env.CDP_A ?? 9231);
const CDP_B = Number(process.env.CDP_B ?? 9232);
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
    const url = (name, team) => `${BASE}?auto=1&quality=low&room=${ROOM}&server=${encodeURIComponent(server)}&name=${name}&team=${team}&fill=4`;
    a = await browser(CDP_A, 'A');
    b = await browser(CDP_B, 'B');
    await a.navigate(url('Anna', 'T'));
    const hostMap = (await a.waitFor('globalThis.__map?.()', (v) => !!v?.id, 60000))?.id;
    await sleep(2000);
    // B startet absichtlich mit einer anderen Karte: Host lehnt mit Grund 'map' ab, B lädt die Host-Karte neu
    const wrongMap = hostMap === 'de_kuehlhaus' ? 'de_lagerstaub' : 'de_kuehlhaus';
    await b.navigate(url('Bert', 'CT') + '&map=' + wrongMap);

    // 0) Karten-Abgleich
    const bm = await b.waitFor('(() => { const m = globalThis.__map?.(); const n = globalThis.__netId?.(); return m && n ? { id: m.id, peers: n.peers.length, search: location.search } : null; })()', (v) => v.id === hostMap && v.peers >= 1, 120000);
    if (bm?.id === hostMap) ok(`Falsche Karte (${wrongMap}) → Host-Karte ${hostMap} geladen`);
    else fail(`Karten-Abgleich fehlgeschlagen: Host=${hostMap} B=${JSON.stringify(bm)}`);

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

    // 2b) Ping: Host misst den Client per Ping/Pong; Client sieht seinen Wert im Snapshot, Host und Bots = 0
    const cid0 = (await client.evJson('globalThis.__netId?.()'))?.id;
    const hid0 = (await host.evJson('globalThis.__netId?.()'))?.id;
    const pingOf = (list, id) => list?.find((p) => p.id === id)?.ping;
    const pH = await host.waitFor('globalThis.__pings?.()', (v) => pingOf(v, cid0) >= 0, 20000, 500);
    const pC = await client.waitFor('globalThis.__pings?.()', (v) => pingOf(v, cid0) >= 0, 20000, 500);
    const botsZero = (pC ?? []).filter((p) => p.bot).every((p) => p.ping === 0);
    if (pingOf(pH, cid0) >= 0 && pingOf(pC, cid0) >= 0 && pingOf(pC, hid0) === 0 && botsZero) ok(`Ping: Client ${pingOf(pH, cid0)} ms (Host-Messung) / ${pingOf(pC, cid0)} ms (Snapshot), Host 0, Bots 0`);
    else fail(`Ping fehlt: Host=${JSON.stringify(pH)} Client=${JSON.stringify(pC)}`);

    // 3) Runde live auf beiden
    // Bots können eine Runde schnell beenden → „live erreicht“ heißt: live oder bereits eine spätere Runde.
    const reached = (v) => v.phase === 'live' || v.phase === 'bomb' || v.round >= 2;
    const lh = await host.waitFor('globalThis.__state?.()', reached, 60000);
    const lc = await client.waitFor('globalThis.__state?.()', reached, 20000);
    // Client spiegelt Rundennummer und Spielstand des Hosts
    const hs = await host.evJson('globalThis.__state?.()');
    const cs = await client.waitFor('globalThis.__state?.()', (v) => v.round === hs?.round && v.score === hs?.score, 5000, 250);
    if (lh && reached(lh) && lc && reached(lc) && cs?.round === hs?.round) ok(`Runde läuft auf Host und Client (Runde ${hs.round}, ${hs.score})`);
    else fail(`Runde nicht synchron: lh=${JSON.stringify(lh)} lc=${JSON.stringify(lc)} Host=${JSON.stringify(hs)} Client=${JSON.stringify(cs)}`);

    // 4) Client schießt auf einen Gegner-Bot → Host verrechnet Schaden, Client sieht ihn im Snapshot
    // Auf dem Host: Client sicher am Leben und Bots kurz angehalten (deterministischer Treffer)
    const clientId = (await client.evJson('globalThis.__netId?.()'))?.id;
    await host.evJson(`globalThis.__reviveId?.(${JSON.stringify(clientId)})`);
    await host.evJson('globalThis.__pauseBots?.(6000)');
    await sleep(1500); // Snapshot mit den angehaltenen Bot-Posen beim Client abwarten
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

    // 5b) Bösartige Nachrichten — nichts darf kaputtgehen
    {
      const hid = (await host.evJson('globalThis.__netId?.()'))?.id;
      const cid2 = (await client.evJson('globalThis.__netId?.()'))?.id;
      await host.evJson('globalThis.__pauseBots?.(12000)');
      await host.evJson(`globalThis.__reviveId?.(${JSON.stringify(hid)})`);
      await host.evJson(`globalThis.__reviveId?.(${JSON.stringify(cid2)})`);
      await sleep(600);
      const before = await host.evJson('globalThis.__players?.()');
      const evil = [
        { t: 'hello', id: '__proto__', name: '<img src=x id=pwn0 onerror=alert(1)>', team: 'T' },
        { t: 'hello', id: 'constructor', name: 'x', team: 'T' },
        { t: 'hello', id: 'bot-99', name: 'Fake', team: 'CT' },
        { t: 'hello', id: 'ghost-1', name: 'Ghost', team: 'T' },
        { t: 'team', id: cid2, team: 'toString' },
        { t: 'throw', id: cid2, kind: 'toString', o: [0, 1, 0], d: [0, 0, 1], s: 1 },
        { t: 'throw', id: cid2, kind: 'he', o: [0, 1, 0], d: ['x', 0, 1], s: 1 },
        { t: 'fire', id: cid2, w: 'glock', o: [0, 1e9, 0], d: [[0, 0, 0]], seq: 1 },
        { t: 'fire', id: 'bot-0', w: 'awp', o: [0, 1.6, 0], d: [[0, 0, 1]], seq: 1 },
        { t: 'fall', id: hid, v: 40 },
        { t: 'fall', id: cid2, v: 40 },
        { t: 'buy', id: cid2, item: '__proto__' },
        { t: 'pose', id: cid2, x: 'a', y: 0, z: 0, yaw: 0, pitch: 0, w: 'knife', c: false, m: false, e: false },
      ];
      // a) übers Netz (Relay stempelt den Absender → fremde IDs fallen schon dort durch)
      for (const m of evil) await client.evJson(`globalThis.__netSendRaw?.(${JSON.stringify(m)})`);
      // b) direkt auf dem Host wie vom Needle-Server ohne Absender (nur die Prüfung schützt), inkl. NaN/Infinity
      for (const m of evil) await host.evJson(`globalThis.__netInject?.(${JSON.stringify(m)}, null)`);
      await host.evJson(`globalThis.__netInject?.({ t: 'throw', id: ${JSON.stringify(cid2)}, kind: 'he', o: [0, NaN, 0], d: [NaN, 0, 1], s: 1 }, null)`);
      await host.evJson(`globalThis.__netInject?.({ t: 'fire', id: ${JSON.stringify(cid2)}, w: 'glock', o: [0, 1.6, 0], d: [[Infinity, 0, 1]], seq: 2 }, null)`);
      await host.evJson(`globalThis.__netInject?.({ t: 'fire', id: ${JSON.stringify(cid2)}, w: 'glock', o: [0, 1.6, 0], d: Array.from({ length: 100000 }, () => [0, 0, 1]), seq: 3 }, null)`);
      await sleep(1500);
      const after = await host.evJson('globalThis.__players?.()');
      const ids = (l) => (l ?? []).map((p) => p.id).sort().join(',');
      const sane = (after ?? []).every((p) => typeof p.hp === 'number' && Number.isFinite(p.hp) && typeof p.team === 'string' && (p.team === 'T' || p.team === 'CT'));
      const hostHp = after?.find((p) => p.id === hid)?.hp;
      const clientHp = after?.find((p) => p.id === cid2)?.hp;
      const polluted = await host.evJson('[({}).name, ({}).hp, ({}).team, Object.prototype.hasOwnProperty.call(Object.prototype, "id")]');
      if (ids(after) === ids(before) && sane && hostHp === 100 && clientHp === 100 && (polluted ?? []).every((v) => v === null || v === false)) {
        ok(`Bösartige Client-Nachrichten wirkungslos (${evil.length}× Netz + direkt, Spieler unverändert, HP endlich, kein Prototyp-Eintrag)`);
      } else fail(`Bösartige Client-Nachrichten: vorher=${ids(before)} nachher=${ids(after)} sane=${sane} hostHp=${hostHp} clientHp=${clientHp} proto=${JSON.stringify(polluted)}`);

      // c) gefälschte Host-Nachrichten beim Client (h = echter Host, ohne Absender wie beim Needle-Server)
      const snapsBefore = (await client.evJson('globalThis.__counters?.()'))?.snapsApplied ?? 0;
      const forged = (seq, extra = {}) => ({
        seq, time: 0,
        round: { phase: 'live', timer: 50, round: '<img src=x id=pwn1 onerror=alert(1)>', ctRounds: 0, tRounds: '<img src=x id=pwn2>', bomb: { phase: 'none', progress: 0, fuseLeft: 0, spot: null, hasKit: false }, result: null },
        players: [{ id: '__proto__', name: '<img src=x id=pwn3>', team: 'T', bot: false, hp: 'NaN', alive: true, money: 1, kills: '<b id=pwn4>', deaths: 0, weapon: 'toString', armor: 0, helmet: false, bomb: false, kit: false, primary: null, secondary: null, nades: [0, 0, 0], ping: 0 }],
        lossStreak: { T: 0, CT: 0 }, winner: null, matchEndTimer: 0, nades: [], smokes: [], bombPos: null, ...extra,
      });
      // Riesen-Sequenz (früher: friert den Client ein) und eine gerade passende Sequenz mit HTML/`__proto__`
      await client.evJson(`globalThis.__netInject?.({ t: 'snap', h: ${JSON.stringify(hid)}, s: ${JSON.stringify(forged(1e11))} }, null)`);
      const last = await client.evJson('globalThis.__driver?.snapGate?.last');
      await client.evJson(`globalThis.__netInject?.({ t: 'snap', h: ${JSON.stringify(hid)}, s: ${JSON.stringify(forged((last ?? 0) + 1))} }, null)`);
      await client.evJson(`(() => { globalThis.__driver.hud.setScoreboard?.(globalThis.__driver.match, globalThis.__netId().id); return 1; })()`);
      // Gefälschter Kick (Spieler ist längst im Match) und Ereignis mit HTML-Namen
      await client.evJson(`globalThis.__netInject?.({ t: 'ev', h: ${JSON.stringify(hid)}, e: { k: 'kick', id: ${JSON.stringify(cid2)}, reason: 'password' } }, null)`);
      await client.evJson(`globalThis.__netInject?.({ t: 'ev', h: ${JSON.stringify(hid)}, e: { k: 'kill', killer: '__proto__', victim: ${JSON.stringify(cid2)}, weapon: '<img src=x id=pwn5>', hs: true } }, null)`);
      await client.evJson(`globalThis.__netInject?.({ t: 'ev', h: ${JSON.stringify(hid)}, e: { k: 'join', id: 'x', name: '<img src=x id=pwn6>', team: 'T' } }, null)`);
      await sleep(2500);
      const pwn = await client.evJson('document.querySelectorAll("[id^=pwn]").length');
      const roundTxt = await client.evJson('document.body.innerHTML.includes("onerror")');
      const snapsAfter = (await client.evJson('globalThis.__counters?.()'))?.snapsApplied ?? 0;
      const still = await client.evJson('globalThis.__state?.()');
      const cPlayers = await client.evJson('globalThis.__players?.()');
      const cPolluted = await client.evJson('[({}).name, ({}).hp, ({}).team]');
      if (pwn === 0 && roundTxt === false && snapsAfter > snapsBefore + 5 && still?.host === false && (cPlayers ?? []).filter((p) => !p.bot).length >= 2 && (cPolluted ?? []).every((v) => v === null)) {
        ok(`Gefälschte Snapshots/Kicks beim Client wirkungslos (kein HTML im DOM, Snapshots laufen weiter: +${snapsAfter - snapsBefore}, nicht gekickt)`);
      } else fail(`Gefälschte Host-Nachrichten: pwn=${pwn} onerror=${roundTxt} snaps ${snapsBefore}→${snapsAfter} state=${JSON.stringify(still)} players=${JSON.stringify(cPlayers)} proto=${JSON.stringify(cPolluted)}`);
    }

    // 6) Host-Migration: Host-Browser schließen → Client wird Host und spielt weiter
    host.close();
    const mig = await client.waitFor('globalThis.__state?.()', (v) => v.host === true, 30000);
    if (mig?.host === true && mig.players >= 1) ok(`Host-Migration: Client ist jetzt Host (${mig.players} Spieler, Phase ${mig.phase})`);
    else fail('Host-Migration fehlgeschlagen: ' + JSON.stringify(mig));
    // Alter Host darf nicht als Geisterspieler zurückbleiben
    const oldHostId = hostIsA ? na.id : nb.id;
    const left = await client.waitFor('globalThis.__players?.()', (v) => !v.some((p) => p.id === oldHostId), 8000, 300);
    if (left && !left.some((p) => p.id === oldHostId)) ok(`Alter Host entfernt (${left.filter((p) => !p.bot).length} Mensch, ${left.filter((p) => p.bot).length} Bots)`);
    else fail('Alter Host noch im Match: ' + JSON.stringify(left));

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
