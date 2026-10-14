# cs_warehouse1.6 — Implementierungsplan

> **Diese Datei ist immer aktuell zu halten.** Nach jedem Milestone, jeder Planänderung und jedem
> größeren Refactor: Häkchen setzen, Entscheidungen ergänzen, Erkenntnisse festhalten.

> **Regel (aus AGENTS.md):** Jede neue oder geänderte Logik bekommt Tests (Vitest), die vor
> Abschluss grün sein müssen. Vor Abschluss jedes Milestones: `bun run test`, `bunx tsc --noEmit`,
> `bun run build`, Smoke (`bun scripts/smoke.mjs`) und Netztest (`bun scripts/net-test.mjs`).

## Ziel

CS-1.6-inspirierter Bomben-Modus („de_"-Maps) in **echten, aus der MSSQL-DB gelesenen Lagern**.
Online spielbar (Host-authoritativ, Needle-Raum oder eigener Relay) mit Bots, vollem CS-1.6-Arsenal,
Economy, Granaten, Zielfernrohr, Spray-Mustern und mehreren Lager-Karten mit Vertikalität.

## Fixe Entscheidungen (Beschlüsse)

| # | Entscheidung |
|---|---|
| 1 | Rendering: **Needle Engine 5.x pur** (Vite + TS, `@needle-tools/engine`), **kein React/R3F**. |
| 2 | Runtime/Tooling: **Bun 1.4** (install/dev/build/test/Skripte). |
| 3 | Reine TS-Logik in `src/logic/` (framework-frei, getestet); Render-/Netz-Teile in `src/game`, `src/multi`, `src/ui`, `src/weapons`, `src/level`, `src/entities`, `src/audio`. |
| 4 | Netzwerk: Needle `context.connection` (JSON-Broadcast, ein Nachrichten-Key `csw16`). **Host = Dienstältester im Raum** (erste ID in Beitrittsreihenfolge des Servers; alle Clients sehen dieselbe Reihenfolge). Host rechnet Runde, Bombe, Treffer, Economy, Bots, Granaten, Drops; Clients simulieren ihre Bewegung selbst, senden Posen (20 Hz), Schüsse, Würfe, Käufe; Host sendet Snapshots (10 Hz) + Ereignisse. Host-Migration beim Verlassen. |
| 5 | Kollision: deterministische AABB-Physik (`logic/move.ts`) inkl. **Bodenhöhe/Stufen** (≤ 0.55 m ohne Sprung, Sprung ~1.2 m). Kein Rapier: Granaten prallen pur an AABBs ab (`logic/grenade.ts`). |
| 6 | Schüsse = **Hitscan** auf Kopf-/Körper-Boxen (`logic/combat.ts`), Rüstungsformel nach CS (`armoredDamage`), Distanzabfall. |
| 7 | Spielmodus: **Bomben (de_)**, feste Teams (Wechsel per M), erster auf 16 Runden. |
| 8 | Karten: Bake-Ergebnisse (`levels/de_*.json`, Format 2: Lager + Zonen + Requisiten + Spawns + Strukturen) werden committet → alle Clients identisch. |
| 9 | Waffen-/Spieldaten als Tabellen (`weapons.json`, `ECONOMY`, `ROUND`, `BOMB`, `GRENADE`, `BOT`). |
| 10 | Lizenz: Needle-Basic-Label (nicht-kommerziell); öffentliche/kommerzielle Nutzung → Needle-Lizenz prüfen. |
| 11 | Sprache: Nutzertexte/UI/Kommentare deutsch, Bezeichner englisch. |
| 12 | Keine neuen Abhängigkeiten für Standardlösungen (Texturen per Canvas). Sounds: bearbeitete freie Aufnahmen (`assets/audio/`, Quellen in `CREDITS.md`) über eigene WebAudio-Engine, Synthese als Rückfall — keine Valve-/CS-Assets. |
| 13 | Online ohne Internet: `scripts/relay-server.ts` spricht das Needle-Raum-Protokoll (Lobby-Feld „Server“ bzw. `?server=ws://host:9100/socket`). |

## Repo-Struktur (Ist)

```
levels/de_{kommission,hochregal,blocklager,rampe}.json   # gebackene Karten (Format 2)
scripts/bake-map.ts          # MSSQL/Demo → levels/*.json (alle Karten oder eine DB-Kennung)
scripts/relay-server.ts      # Bun-WebSocket-Relay (Needle-Raum-Protokoll), Dockerfile.relay
scripts/smoke.mjs            # E2E im headless Chromium/Edge (CDP)
scripts/net-test.mjs         # Zwei-Client-Netztest inkl. Host-Migration
scripts/screenshot.mjs       # Screenshot + JS-Auswertung (Sichtprüfung)
src/logic/                   # PURE + getestet: weapons, fire, recoil (Spray), combat, damage, loadout,
                             # economy, round, bombs, match, net, drops, grenade, botDecide, waypoints,
                             # move (Stufen), level, structures, props, spawns, maps, demo, zones, radar,
                             # settings, ceiling, viewAnim, layout/query/transform (Port aus ias.warehouse-map)
src/game/World.ts            # Level → Sicht + Kollision + Wegpunkte + Spawns
src/game/MatchDriver.ts      # Host-Simulation + Client-Spiegel + Ereignisse + Bots + Zuschauer + Audio
src/multi/Transport.ts       # LocalTransport (offline) / NeedleTransport (Raum)
src/player/FpsPlayer.ts      # Bewegung, Blick, Ducken, Shake, Todes-/Zuschauerkamera
src/weapons/                 # Shooter (Slots, Zoom, Spray, Messer, G), ViewModel, Fx, Grenades, DroppedView
src/weapons/models/          # Prozedurale Waffenmodelle (Builder, Materialien, Pistolen/Gewehre/MG/Schrot/SMG,
                             # Messer/Granaten/C4) + First-Person-Arme mit Handschuhen je Team
src/entities/Soldier.ts      # Spielfiguren (Bots + entfernte Spieler)
src/level/                   # LevelView (Regale instanziert, Strukturen, Schilder), Canvas-Texturen
src/ui/                      # Lobby, Hud (Kaufmenü, Scoreboard, Radar, Feed, Chat, Scope), SettingsMenu
src/audio/                   # Sfx (Fassade), AudioEngine (Lader, 3D, Hall, Verdeckung), Ambience,
                             # MatchAudio (Schritte/Bombe/Treffer für den Driver), SynthFallback, worldHooks
src/logic/{audioMix,reverb,soundBank,ambientFallback}.ts  # Audio-Entscheidungen, Hall-IRs, Klang-Katalog
assets/audio/                # Ogg Vorbis + AAC (gebaut von scripts/audio/build_audio.py), CREDITS.md
.github/workflows/pages.yml  # Test + Build + Deploy auf GitHub Pages
```

---

## Milestones

### M0 — Scaffold + begehbares Lager ✅
Level aus JSON, Bewegung mit AABB-Kollision, Bake-Script (MSSQL oder Demo), Smoke-Test.

### M1 — Kern-FPS ✅
Hitscan-Waffen, Nachladen, Recoil, Viewmodels (anfangs Quaternius CC0, seit M3 prozedural), Effekte (Mündungsfeuer, Tracer, Decals), Ducken, Headbob, Sway.

### M2 — de_-Modus Einzelspieler ✅
Runden-/Bomben-/Economy-Logik, erste Bots, HUD.

### M3 — Online spielbar, volles CS-Paket ✅ (Okt 2026)
- [x] **Arsenal CS 1.6** (29 Einträge inkl. HE/Flash/Smoke, C4, Messerstich): Preise, Teams, Slots, `armorPen`, Schrot-Pellets, Zoom-Stufen, Repetierzeiten (`cycle`)
- [x] **Loadout/Kauf** (`logic/loadout.ts`): Slots 1–5, Granaten-Limits, Kevlar/Helm (Helm-Nachkauf 350 $), Kit (nur CT), Munition (6/7), Rundenübertrag, Bot-Kauf
- [x] **Match-Logik** (`logic/match.ts`): Spielerliste, Auto-Team/Balance, Rundenstart mit Bombenvergabe, Treffer mit Rüstung/Distanz, Kill-Feed, Team-Verlustserien, Plant-Bonus, Match-Sieg/Neustart, Warmup-Reset
- [x] **CS-Regeln**: Zünder läuft beim Entschärfen weiter; nach dem Plant beenden tote T die Runde nicht
- [x] **Granaten** (`logic/grenade.ts`): Flug mit Abprall, HE (Radialschaden mit Sichtlinie, Rüstung), Flash (Blickwinkel/Distanz, auch Bots), Rauch (blockiert Sicht von Bots)
- [x] **Waffengefühl**: feste Spray-Muster (`sprayOffset`, Kamera nimmt 50 % mit), Noscope-Streuung, Zielfernrohr mit Overlay/Empfindlichkeits-Skalierung/Auto-Rezoom, erster Schuss sofort, kräftiger Viewmodel-Kick, Kamera-Shake, Hülsen, Zieh-/Nachlade-/Messer-Animationen
- [x] **Drops**: Tod → beste Waffe + C4 fallen; G wirft; Drüberlaufen hebt auf; Bots holen die C4
- [x] **Bots** beider Teams (`logic/botDecide.ts`): Sicht inkl. Rauch, Reaktionszeit, Zielfehler nach Skill, Burst-Feuer, Erinnerung/Jagd, Rollen (Plant, Spot halten, Bombe verteidigen/entschärfen), Kauf
- [x] **Netzwerk**: Host-Wahl nach Beitrittsreihenfolge, Snapshots (Spieler, Runde, Granaten, Rauch, Bombe, Drops), Posen-Interpolation, Ereignisse, Host-Migration (Snapshot-Zähler, Geisterspieler, Bot-IDs, kein Doppelstart), Eingabe-Validierung auf dem Host (Waffe im Inventar, Kadenz, Strahlen, Ursprung), Relay-Server für LAN
- [x] **UI**: Lobby (Name, Karte, Team, Spielerzahl, Bot-Stärke, Raum erstellen/beitreten, Server), HUD (HP/Rüstung/Geld, Munition, Slots, Rundenleiste, Kill-Feed, Radar, Hinweise, Blend-/Schadens-Overlay, Zielfernrohr), Kaufmenü (B), Scoreboard (Tab), Chat (Y), Teamwahl (M), Einstellungen (O)
- [x] **Karten**: 4 Lager-Profile (Kommissionierhalle, Hochregallager, Blocklager, Verladerampe), Requisiten (Paletten, Gitterboxen, Kisten, Container), Zwischenebenen mit Treppe/Geländer, Laderampe, Spawns je Team, Zonen nach CS-Dramaturgie
- [x] **Grafik**: Regale mit Stehern/Traversen/Paletten/Kartons (instanziert), Bodenmarkierungen, Hängeschilder, Hallendach mit Leuchten, Tonemapping, Canvas-Texturen; Grafikstufe `?quality=low`
- [x] **Spielfiguren** (`entities/Soldier.ts`, `soldierParts.ts`, `soldierAnim.ts` getestet): T in Wüstentarn mit Sturmhaube, CT in Navy mit Helm/Brille, Weste, Rucksack, Zweihand-Waffenhaltung (IK), Gehen/Ducken mit Kniebeuge, Fallanimation; 8 Draw-Calls je Figur
- [x] **Hallendecke + Beleuchtung** (`level/Ceiling.ts`, `level/Lighting.ts`, `logic/ceiling.ts` getestet): Hallenhöhe 8 m, Dach als Kollision (Granaten/Schüsse), Fachwerkbinder, Pfetten, Lichtbänder, Lüftungskanal, Sprinkler, Hallenstrahler mit Lichtkegeln, gebackene Boden-Licht-Map, Arbeitslicht über den Bombenspots, Notausgang-Schilder
- [x] **Waffenmodelle + Animationen** (`weapons/models/`, `logic/viewAnim.ts` getestet): alle 29 Einträge prozedural modelliert (abgeschrägte Profile, Holz/Polymer/Brünierung, bewegliche Teile: Schlitten, Spannhebel, Kammerstängel, Pumpe, Magazin, MG-Deckel, Splint), First-Person-Arme mit Ärmeln/Handschuhen je Team und Hand-Zielen; Clip-Bibliothek (Ziehen, Inspizieren `F`, Magazin-/Pistolen-/Schrot-/MG-Nachladen, Repetieren, Schlitten-Zyklus, Trockenschuss, Messer, Granate, C4) mit Überblendung, dazu Atmen, Lauf-Bob, Strafe-Neigung, Sprint-Haltung und Rückstoß-Feder; dieselben Modelle für Drops und Spielfiguren
- [x] **Audio**: synthetisierte Schüsse je Waffentyp, Treffer/Kopfschuss/Kill, Schritte (geduckt lautlos), Bomben-Piepen, Granaten, Rundenjingles
- [x] **Zuschauer** nach dem Tod (Teamkameraden aus deren Sicht, Klick wechselt), Todeskamera
- [x] **Deployment**: GitHub-Pages-Workflow, Dockerfile für den Relay, README
- **Verifikation:** `bun run test` (≈ 430 Tests), `tsc`, `build`, Smoke (Kauf, Runde, Bots, Treffer, Zielfernrohr, Decal, Granate/Rauch, Fallenlassen/Aufheben, Eliminierung, Runde 2) und Netztest (Host-Wahl, Spiegel, Client-Schuss → Host-Schaden, Posen, Migration, kein Geisterspieler) grün.

**Erkenntnisse/Notizen (M3):**
- Needle deckelt `context.time.deltaTime` auf 0.1 s → der Host misst die Spielzeit selbst (`performance.now()`) und rechnet große Frames in Teilschritten; sonst laufen Runden bei niedriger Bildrate zu langsam.
- Headless-Chromium mit SwiftShader ist füllratenbegrenzt (2–5 FPS bei 1280×800). Tests laufen mit `?quality=low`; Test-Hooks warten ≥ 700 ms, damit die Kamera vor dem Schuss am neuen Ort steht.
- Ein dauerhaftes Punktlicht (z. B. an der Waffe) verteuert jeden Pixel der Szene → Waffe nutzt leichte Eigenleuchtkraft statt Licht.
- `send()` erreicht den Absender nicht; Snapshots werden sofort gesendet, Ereignisse gepuffert → Kauf-Ereignisse können vor dem Snapshot eintreffen (Client rüstet den Spiegel selbst aus).
- Geländer blockieren Bewegung, aber nicht Schüsse/Sicht (`World.aabbs` ohne `rail`).
- Die Dachplatte steckt nur in `World.aabbs` (Schüsse, Sicht, Granaten), nicht in `World.solids` — sonst blockierte sie Radar, Wegpunkte und den Waffen-Wandabstand (XZ-Tests).
- `lightMap` addiert Licht (physikalisch skaliert): nur die Lichtflecken backen, Intensität klein halten, sonst bleicht der Boden aus.
- Waffen sind prozedural (`weapons/models/`): kein Asset-Laden, bewegliche Teile als benannte Knoten, Animationszeiten aus `reload`/`cycle` der Waffendaten. Die Quaternius-OBJs unter `assets/weapons/` werden nicht mehr geladen.

### M4 — Overhaul · Audio ✅ (Okt 2026)
- [x] **Echte Aufnahmen** statt reiner Synthese: 200 Dateien (Ogg Vorbis + AAC-Fallback für Safari, zusammen 5,5 MB)
  aus dem Red-Eclipse-Soundpaket (CC-BY-SA 4.0 / CC-BY 3.0 / CC0), reproduzierbar gebaut mit
  `scripts/audio/build_audio.py` (numpy/scipy + ffmpeg; Quelle → Ausgabe in `scripts/audio/sources-used.txt`).
- [x] **Eigener Klang je Waffe** (Tonhöhe, EQ, Hall-Länge, Tiefton-Punch, Knall-Transiente, Mechanik-Klick):
  AK tief/rau, M4 hell, AWP sehr laut + Kammerstängel, Scout trocken, Deagle schwer, P90/MAC-10 hell/schnarrend,
  M3 + Pumpe, XM1014; Schalldämpfer: USP (Standard gedämpft), M4A1 (umschaltbar über `Sfx.silenced`), TMP.
  Fernklang-Ebene je Klasse, Nah/Fern-Überblendung (`nearFarMix`), Hülsenfall, Nachladen je Klasse
  (Schrot: Patrone für Patrone), Ziehen, Trockenklick.
- [x] **3D-Audio**: Hörer = Kamera (`AudioListener`), PannerNode (HRTF hoch / equalpower niedrig), eigene
  Abstandskurve (Schüsse ~120–260 m hörbar), Luft-Tiefpass, Verdeckung per Welt-Raycast (`segmentBlocked`),
  Stimmen-Limit 48, Limiter am Master.
- [x] **Raumhall**: prozedurale Impulsantworten je `RoomKind` (`logic/reverb.ts`: draußen Slapback, Halle lang,
  Raum kurz, Tunnel Flatterecho, Kühlraum gedämpft), zwei Convolver mit Überblendung beim Raumwechsel.
- [x] **Ambience**: Emitter-Schleifen (`AmbientEmitter`, Pegel `emitterGain`), Raum-Grundteppich je `RoomKind`,
  zufällige Leben-Ereignisse (Rückfahrwarner, Klappern, Palette, Gong, Tauben, Lkw-Hupe, Tür). Karten ohne
  Akustik-Daten bekommen `fallbackAcoustics` (Lüftung, Leuchten, Maschine, Kompressor, Stapler, Radio).
- [x] **Ereignisse**: Einschläge je Material + Querschläger, Vorbeiflug (`flybyCheck`), Schritte je Oberfläche
  (`World.surfaceAt`, sonst Beton; geduckt/schleichend lautlos), Sprung/Landung (`trackVertical`), Schmerz/Tod,
  Kopftreffer-„Dink“, Granaten (Wurf, Abpraller, HE nah/fern, Blitz, Rauch-Zischen), Tinnitus + dumpfe Welt nach
  Blendung (`earRing`), C4-Tastenfeld beim Legen, Piepen (am Ende höher), Entschärfen, Explosion nah/fern.
- [x] **Lautstärke-Kanäle** Gesamt/Effekte/Umgebung/Oberfläche im Einstellungsmenü (`settings.ts`, quadratische Kurve).
- [x] Bugfix: Bot-Schüsse klangen auf dem Host doppelt; Nachladeklang wurde vom Driver überschrieben.
- Schnittstelle für Karte/Bots: `sfx.setAcoustics(zones, emitters)`, `setSurfaceLookup`, `setOcclusion`,
  `shotAt(w, origin, ends, walls)`, `footstep(surface, pos|null, speed, crouch)`, `explosion(kind, pos)`,
  `flashed(s)`, `c4(event, pos)`, `beep(pos, fuseLeft)`; `connectWorldAudio(sfx, world)` nutzt
  `World.surfaceAt`/`World.acoustics` automatisch, sobald die Welt sie anbietet.
- Debug: `__audio()` (geladen/Stimmen/Raum/gespielt je Gruppe), `__audioProbe()` (alle Pfade), `__sfx`.
- Offen: Nachladen/Ziehen entfernter Spieler (keine Netz-Ereignisse), Messer gegen Wand, Funk-Sprachsamples.

### Offen / Ideen
- [ ] Weitere Modi (Geiselbefreiung `cs_`, Deathmatch), Map-Editor auf dem Level-JSON
- [ ] Wallbangs (Durchschuss durch dünne Requisiten), Fallschaden
- [ ] Sprach-Chat (Needle `Voip`), Chat-Teamfilter
- [ ] Bots auf Zwischenebenen (Wegpunkte in mehreren Höhen)
- [ ] Anti-Cheat jenseits der Plausibilitätsprüfungen (Absender-IDs sind im Needle-Protokoll nicht signiert)

---

## Verifikation (vor jedem Milestone-Abschluss)

1. `bun run test` — alle Tests grün
2. `bunx tsc --noEmit` — keine Typfehler
3. `bun run build` — Build erfolgreich
4. `bun run dev` + `BROWSER=… bun scripts/smoke.mjs` und `BROWSER=… bun scripts/net-test.mjs`
5. Diese Datei + AGENTS.md aktualisieren (Häkchen, Entscheidungen, Erkenntnisse)
