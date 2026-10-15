# cs_warehouse1.6 — Implementierungsplan

> **Diese Datei ist immer aktuell zu halten.** Nach jedem Milestone, jeder Planänderung und jedem
> größeren Refactor: Häkchen setzen, Entscheidungen ergänzen, Erkenntnisse festhalten.

> **Regel (aus AGENTS.md):** Jede neue oder geänderte Logik bekommt Tests (Vitest), die vor
> Abschluss grün sein müssen. Vor Abschluss jedes Milestones: `bun run test`, `bunx tsc --noEmit`,
> `bun run build`, Smoke (`bun scripts/smoke.mjs`) und Netztest (`bun scripts/net-test.mjs`).

## Ziel

CS-1.6-inspirierter Bomben-Modus („de_"-Maps) in **großen, handgebauten Lager-/Logistik-Karten** mit
echter Vertikalität. Online spielbar (Host-authoritativ, Needle-Raum oder eigener Relay) mit Bots, vollem
CS-1.6-Arsenal, Economy, Granaten, Zielfernrohr und Spray-Mustern.

## Fixe Entscheidungen (Beschlüsse)

| # | Entscheidung |
|---|---|
| 1 | Rendering: **Needle Engine 5.x pur** (Vite + TS, `@needle-tools/engine`), **kein React/R3F**. |
| 2 | Runtime/Tooling: **Bun 1.4** (install/dev/build/test/Skripte). |
| 3 | Reine TS-Logik in `src/logic/` (framework-frei, getestet); Render-/Netz-Teile in `src/game`, `src/multi`, `src/ui`, `src/weapons`, `src/level`, `src/entities`, `src/audio`. |
| 4 | Netzwerk: Needle `context.connection` (JSON-Broadcast, ein Nachrichten-Key `csw16`). **Host = Dienstältester im Raum** (erste ID in Beitrittsreihenfolge des Servers; alle Clients sehen dieselbe Reihenfolge). Host rechnet Runde, Bombe, Treffer, Economy, Bots, Granaten, Drops; Clients simulieren ihre Bewegung selbst, senden Posen (20 Hz), Schüsse, Würfe, Käufe; Host sendet Snapshots (10 Hz) + Ereignisse. Host-Migration beim Verlassen. |
| 5 | Kollision: deterministische Physik (`logic/move.ts` auf `logic/collision.ts`): Quader **und Rampen (Keile)** in einem XZ-Raster, Bodenhöhe/Stufen (≤ 0.55 m), Rampen ≤ 40°, Kopf-Kollision, Kanten; Strahlen per 2D-DDA. Kein Rapier: Granaten prallen per Strahl an Flächennormalen ab (auch auf Rampen). |
| 6 | Schüsse = **Hitscan** auf Kopf-/Körper-Boxen (`logic/combat.ts`), Rüstungsformel nach CS (`armoredDamage`), Distanzabfall. |
| 7 | Spielmodus: **Bomben (de_)**, feste Teams (Wechsel per M), erster auf 16 Runden. |
| 8 | Karten: **handgebaute TypeScript-Module** (`src/maps/<id>.ts`, Format in `docs/KARTENFORMAT.md`), deterministisch kompiliert (Kollision, Navigation, Zonen) → kein Bake-Schritt, alle Clients identisch. (Bis M3: aus der MSSQL-DB gebackene Hallen.) |
| 9 | Waffen-/Spieldaten als Tabellen (`weapons.json`, `ECONOMY`, `ROUND`, `BOMB`, `GRENADE`, `BOT`). |
| 10 | Lizenz: Needle-Basic-Label (nicht-kommerziell); öffentliche/kommerzielle Nutzung → Needle-Lizenz prüfen. |
| 11 | Sprache: Nutzertexte/UI/Kommentare deutsch, Bezeichner englisch. |
| 12 | Keine neuen Abhängigkeiten für Standardlösungen (Texturen per Canvas). Sounds: bearbeitete freie Aufnahmen (`assets/audio/`, Quellen in `CREDITS.md`) über eigene WebAudio-Engine, Synthese als Rückfall — keine Valve-/CS-Assets. |
| 13 | Online ohne Internet: `scripts/relay-server.ts` spricht das Needle-Raum-Protokoll (Menü „Erweitert: eigener Server“ bzw. `?server=ws://host:9100/socket`). Server-Erkennung läuft über denselben Server im Raum `csw16-lobby`. |

## Repo-Struktur (Ist)

```
src/maps/                    # Handgebaute Karten (de_lagerstaub, de_kuehlhaus + kuehlhaus/-Bausteine) + Registry (index.ts) + Validator (maps.test.ts)
docs/KARTENFORMAT.md         # Kartenformat, Gestaltungsregeln, Anleitung für neue Karten
scripts/map-overview.ts      # Draufsicht (PNG, nur Node-Bordmittel) + Laufzeiten + Bereichsgraph
scripts/relay-server.ts      # Bun-WebSocket-Relay (Needle-Raum-Protokoll), Dockerfile.relay
scripts/smoke.mjs            # E2E im headless Chromium/Edge (CDP)
scripts/net-test.mjs         # Zwei-Client-Netztest inkl. Host-Migration
scripts/screenshot.mjs       # Screenshot + JS-Auswertung (Sichtprüfung)
scripts/weapon-sheet.mjs     # First-Person-Bild je Waffe (Dev-Hooks __vmShow/__vmPreview) → weapon-contact.py = Kontaktbogen
scripts/weapon-lab.mjs       # weapon-lab.html (src/dev/weaponLab.ts): Raster aller Waffen als Soldat / liegend / Seitenansicht mit Markern
src/logic/                   # PURE + getestet: collision (Raster, Rampen, Strahlen), move, nav (3D-Graph, A*, Bereiche),
                             # mapkit/mapplan/mapprops (Kartenbaukasten), mapcompile, bake (Licht-Backen), levelmesh
                             # (Geometrie + Vertex-Licht), overview (Draufsicht/Radar), weapons, fire, recoil, combat, damage,
                             # loadout, economy, round, bombs, match, net, drops, grenade, zones, radar, settings, hostRules,
                             # Bots: botMap, botStrategy, botCoach, botBrain, botBody, botCombat, botPerception,
                             # botKnowledge, botThrow, botBuy, botDecide, botSystem, botSim (Headless), botTestMap,
                             # viewAnim, acoustics, rng, weaponGeom, viewPlace, stretch, dropRest,
                             # audioMix, reverb, soundBank, ambientFallback
src/game/World.ts            # Kompilierte Karte + Darstellung; API: collider, nav, findPath, areaAt, siteAt, surfaceAt, acoustics
src/game/MatchDriver.ts      # Host-Simulation + Client-Spiegel + Ereignisse + Bots (BotSystem) + Zuschauer + Audio
scripts/bot-sim.ts           # Headless-Bot-Simulation (Zeitraffer, Statistik, --trace)
src/multi/Transport.ts       # LocalTransport (offline) / NeedleTransport (Raum)
src/player/FpsPlayer.ts      # Bewegung (Collider), Blick, Ducken (Kopffreiheit), Shake, Todes-/Zuschauerkamera
src/weapons/                 # Shooter (Slots, Zoom, Spray, Messer, G), ViewModel, Fx, Grenades, DroppedView
src/weapons/models/          # Prozedurale Waffenmodelle + First-Person-Arme
src/entities/Soldier.ts      # Spielfiguren (Bots + entfernte Spieler); soldierHold.ts = Waffenhaltung/Arm-IK (pure, getestet)
src/level/                   # LevelView (Geometrie je Material/Kachel, Deko-Instanzen, Schilder, Markierungen, Himmel,
                             # Lichtkegel), Lighting (Sonde + echte Lichter für Figuren), decor, textures (Canvas)
src/ui/                      # MainMenu (+Backdrop, Musik, Kartenvorschau), LobbyOverlay, Hud (Kaufmenü, Scoreboard,
                             # Radar mit Kartenbild, Feed, Chat, Scope), SettingsMenu (datengetrieben), CSS
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
- [x] **Karten**: 4 Lager-Profile (Kommissionierhalle, Hochregallager, Blocklager, Verladerampe), Requisiten (Paletten, Gitterboxen, Kisten, Container), Zwischenebenen mit Treppe/Geländer, Laderampe, Spawns je Team, Zonen nach CS-Dramaturgie *(abgelöst durch M4)*
- [x] **Grafik**: Regale mit Stehern/Traversen/Paletten/Kartons (instanziert), Bodenmarkierungen, Hängeschilder, Hallendach mit Leuchten, Tonemapping, Canvas-Texturen; Grafikstufe `?quality=low`
- [x] **Spielfiguren** (`entities/Soldier.ts`, `soldierParts.ts`, `soldierAnim.ts` getestet): T in Wüstentarn mit Sturmhaube, CT in Navy mit Helm/Brille, Weste, Rucksack, Zweihand-Waffenhaltung (IK), Gehen/Ducken mit Kniebeuge, Fallanimation; 8 Draw-Calls je Figur
- [x] **Hallendecke + Beleuchtung** *(in M4 durch gebackenes Licht ersetzt; `Ceiling.ts`/`ceiling.ts` entfernt)*: Hallenhöhe 8 m, Dach als Kollision (Granaten/Schüsse), Fachwerkbinder, Pfetten, Lichtbänder, Lüftungskanal, Sprinkler, Hallenstrahler mit Lichtkegeln, gebackene Boden-Licht-Map, Arbeitslicht über den Bombenspots, Notausgang-Schilder
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

### M3.1 — Waffen passen (Okt 2026) ✅
Auslöser: „die Models müssen passen“. Systematische Prüfung statt Augenmaß:
- **Werkzeug:** `weapon-lab.html` (Soldat von der Seite/vorn, liegend, Seitenansicht mit Ankern/Sichtlinie/Lineal) und `weapon-sheet.mjs` (First Person aller Waffen, auch eingefrorene Nachlade-/Zieh-Clips) erzeugen Kontaktbögen.
- **Befunde vorher:** Gewehre ~30 % zu lang (AK 1,19 m statt 0,88; AWP 1,43 statt 1,18), Pistolen zielten mit 3° Eindrehung nur auf einen Punkt in 2 m, P90 klobig, **Soldaten hielten die Waffe auf der linken Körperseite** (gespiegelte Hände, Arm über die Brust), Mündungsfeuer/Leuchtspur fremder Spieler an der Augenhöhe, Hülsen 35 cm hinter der Mündung, Elites lagen übereinander (eine Pistole schwebte 24 cm hoch).
- **Geometrie-Tabelle** `logic/weaponGeom.ts` (pure): echte Länge, Mündung, Auswurf (+Richtung), Schuss-/Stützhand, Kimme/Korn, Schaftkappe, Haltung, Längsstauchung (`fit`) je Modell — einzige Quelle für Viewmodel-Anker (`Builder.anchor` nimmt Tabellenpunkte), Soldat, Drops, Mündungsfeuer, Hülsen. `catalog.test.ts` prüft die gebauten Modelle gegen die Tabelle (Anker, Länge ±4 %, Mündung/Schaftkappe als äußerste Punkte, Kimme/Korn an der Oberkante, Hände ≤ 3,5 cm von der Oberfläche).
- **Längen:** `logic/stretch.ts` staucht nur in f (Griff/Magazin/Querschnitte bleiben); Datenblattwerte stehen unabhängig im Test (Glock 0,19 … AWP 1,18 m).
- **Viewmodel:** Drehung x/y des Halters wird aus Position + Mündung berechnet (`viewPlace.aimRotation`), Laufachse trifft das Fadenkreuz bei 10 m (Test ≤ 0,5° für alle Schusswaffen); Positionen etwas weiter vorn/rechts.
- **Soldat:** `entities/soldierHold.ts` — Gewehre mit Schaftkappe an der rechten Schulter, Pistolen beidhändig auf Augenhöhe, Messer/Granate rechts, C4 beidhändig; feste Armlängen, Hand-Ziele = Griffpunkte der Tabelle (Test: Reichweite, Schaftkappe, Visierhöhe). Mündung für Feuer/Leuchtspur aus `Soldier.muzzleWorld`.
- **Drops:** `logic/dropRest.ts` — tiefster Punkt genau am Boden (Granaten stehen, C4 flach, Elites als zwei Pistolen nebeneinander).
- **P90** neu (Bullpup, gerundetes Gehäuse mit Daumen-/Griffloch, Magazin oben, Visier auf Stützen); Hilfsfunktion `roundPoly` für organische Profile.
- **Erkenntnisse:** Der Soldat blickt nach +z, seine Rechte liegt bei **−x** (Modell-x der Waffe wird gespiegelt). Auf dem Bildschirm wirkt eine zum Fadenkreuz zeigende Waffe unten rechts immer „steil“ (Perspektive: parallele Linien laufen auf die Bildmitte zu) — das ist der CS-Look, kein Fehler. `net-test.mjs`-Schritt „Client-Schuss“ schlägt in dieser Umgebung schon auf dem Stand vor M3.1 fehl (Host-HP bleibt 100), unabhängig von den Waffen; Relay-Port/Raum/CDP-Ports sind jetzt per Umgebung einstellbar (`RELAY_PORT`, `ROOM`, `CDP_A`, `CDP_B`), damit parallele Sitzungen sich nicht stören.

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

### M4 — Karten-Overhaul: handgebaute Karten, Rampen, 3D-Navigation, gebackenes Licht ✅ (Okt 2026)
- [x] **Kartenformat** (`logic/mapkit.ts`): Brushes (Quader/Keile, Material, Farbton, Kollisionsart, Clip, Oberfläche, eingepasste UVs), Wände mit Öffnungen, Treppen (Stufen + Clip-Rampe), Geländer, Deko, Lichter, Schilder, Bodenmarkierungen, Callout-Bereiche, Spots (Box + Pflanzpunkt), Spawns, Kaufzonen, Akustik (Vertrag `logic/acoustics.ts`), Umgebung
- [x] **Grundriss-Raster** (`logic/mapplan.ts`): 2-m-Zellen malen, Rest = Gebäudemasse; Böden, Dächer, Fensterwände, automatische Stürze, Akustik-Zonen, **Fassaden** (Verkleidung, Sockel, Band, Gesims/Attika, Fenster, Pilaster, Fallrohre)
- [x] **Requisiten** (`logic/mapprops.ts`, 36 Arten): Paletten, Ware in Folie, Kisten, Gitterboxen, Container, Auflieger, Zugmaschine, Stapler, Fässer, Kabeltrommeln, Hochregale mit Ware, Fachregale, Serverschränke/-reihen, USV, Kühlung, Förderband, IBC, Rolltore, Stahltüren, Dachaufbauten …
- [x] **Compiler** (`logic/mapcompile.ts`): Collider, Navigation, Spots/Spawns/Kaufzonen, Zonen-Mittelpunkte, Akustik — deterministisch
- [x] **Physik** (`logic/collision.ts`, `move.ts`): Rampen (Boden folgt der Schräge, bergab ohne Hüpfen, > 40° = Wand, seitlich blockiert nur der hohe Teil), Kopf-Kollision, Unterquerungen, Kanten/Fallen, Boden unter null (Tunnel), Ducken bleibt unter niedriger Decke
- [x] **Strahlen** mit XZ-Raster (2D-DDA) für Schüsse, Sicht, Blendung, HE, Granaten (Abprall an Flächennormalen, Rollen auf Rampen) — `Blockers`-Abstraktion (`hitbox.ts`) für Quaderlisten und Kollisionswelt
- [x] **3D-Navigation** (`logic/nav.ts`): Knoten (1 m) auf allen begehbaren Flächen, Kanten nach Bewegungsregeln (Stufen, Rampen, Wände, Kopffreiheit), Herunterspringen als Einbahnkante, A* mit Binär-Heap + Ausweichzonen, String Pulling, Raster-Hash, Callout-Bereiche + Bereichsgraph, Flags (Deckung, Engstelle, erhöht, geduckt)
- [x] **Bots** auf Navigation umgestellt (Pfad, Neuplanung bei Stillstand, Ebenen-bewusste Sicht und Ziele, Sprint-Tempo) — Pflanzen/Entschärfen/Kampf Ende-zu-Ende geprüft
- [x] **Darstellung** (`level/LevelView.ts`, `logic/levelmesh.ts`, `logic/bake.ts`): Geometrie je Material und Kachel (verdeckte Teilflächen entfallen), Welt-UVs, **gebackenes Vertex-Licht** (Sonne mit Voxel-Schatten, Himmelsverdeckung, Lampen mit Schatten, AO), unbeleuchtete Materialien, instanzierte Deko (Fässer, Stapler, Server mit LEDs, Leuchten …), Schilder, Markierungen, Himmel mit Sonne und Skyline, Lichtkegel (hoch); Figuren über Lichtsonde + ≤ 4 echte Punktlichter
- [x] **Referenzkarte `de_lagerstaub`** (Grundriss nach dem Klassiker, Logistik-Optik): T-Hof, Außen Lang, Lang-Tor, Lang-Ecke, Grube, Lang A (Hochregale, Stapler, Stützen), Lang-Empore, A-Rampe, A-Plattform (Laderampe mit Vordach, „Serverschrank A“), Gans, Kurz A, Steg (Gitterrost), Mitte, Xbox, Obere Mitte, Mitteltür, CT-Mitte, CT-Spawn, B-Gang, B-Fenster (IT-Lager), Serverhalle B (Hintere Plattform, B-Empore, „Serverschrank B“), Oberer/Unterer Tunnel, Tunnelkreuzung, Außen Tunnel; 160 × 162 m, Ebenen −1.6 … +4.4 m
- [x] **Validator** (`src/maps/maps.test.ts`): Spawns (≥ 8, Boden, frei, Kaufzone), Spots begehbar, Erreichbarkeit, keine Fallen/großen unerreichbaren Flächen, Laufzeiten, CT schneller, Mitte umkämpft, Vertikalität, Größe, Determinismus, Grenzen
- [x] **Werkzeug** `scripts/map-overview.ts` (PNG-Draufsicht mit Höhenfarben, Rampenpfeilen, Spots, Spawns, Callouts, Laufzeiten), Doku `docs/KARTENFORMAT.md`
- [x] Lobby/Registry auf `src/maps`; alte DB-Pipeline entfernt (query/layout/transform/demo/level-Generatoren, `levels/*.json`, `bake-map.ts`, MSSQL-Abhängigkeit); HUD-Radar zeigt vorgerenderte Kartendraufsicht
- **Verifikation:** `bun run test`, `tsc`, `build`, Smoke (angepasst: Schussposition mit Sichtlinie, Wand-Suche per Strahl) und Netztest grün; Screenshots hoch/niedrig gesichtet.

- [x] **Karte `de_gueterbahnhof`** („Güterbahnhof“, Topologie von de_train als Bahn-Logistikzentrum): T-Spawn, Efeu-Zugang/Efeu, Hauptgang, Altzug (Durchgangswagen), Mittelgang, Ostgang mit Laderampe, Mitte, Packhallen-Dach (+7 m), Stellwerk-Treppe/Sniper-Nest (+5.8 m), Z-Verbindung, Gleisfeld A (Gleise 1–5, Sandwich, Himmel +5 m, Kranbahn +8.4 m, Bombenzug mit IT-Wagen, Popdog −1.4 m, Leiterraum), Gleisfeld B (Serverinsel, Obere Empore +3 m), Untere/Obere Halle B, CT-Spawn, Mitte-Nord; ~5700 Brushes, 16.4 k Navigationsknoten. Laufzeiten (Sprint): T → A 133 m ≈ 21.4 s, T → B 146 m ≈ 23.6 s, CT → A ≈ 14.2 s, CT → B ≈ 13.6 s. Karten-Code in `src/maps/de_gueterbahnhof.ts` + `src/maps/gueterbahnhof/*` (Halle A/B, Yards, CT).
- [x] **Karten-Baukasten erweitert:** `railprops.ts` (Gleis mit Schwellen, Güterwagen gedeckt/Kessel/Flach/Lok mit Türen, Rampen, begehbarem Dach, Frachtcontainer, Prellbock, Signal, Fahrleitung, Efeu, Hallenbinder), `propgeom.ts` (Vierteldrehung/Rampenrichtung), `MapBuilder.walkway`, Materialien `foliage`/`rust`, Unterzeilen-Autoschrumpf der Schilder; Validator-Test „Vertikalität" mit einem Erreichbarkeitsdurchlauf statt A* je Knoten.
- Erkenntnis: Treppen/Rampen, die auf eine höhere Fläche münden, müssen 1 m auf dieser enden (Überlappung) und ≤ 0.5 m Anstieg je Meter haben, sonst bricht die Nav-Kante (Knoten nahe der Kante werden verworfen, Schritt > 0.55 m). Dunkle Deko-Farbtöne (Kesselwagen) werden mit dem gebackenen Licht multipliziert → schwarz; Container-Türplatten brauchen `occlude: false`.

**Laufzeiten de_lagerstaub (Laufen mit dem Messer, 6.2 m/s, Knotenwege):** T → A 145 m ≈ 23.4 s, T → B 146 m ≈ 23.5 s, CT → A 50 m ≈ 8.1 s, CT → B 77 m ≈ 12.5 s, T → Mitte ≈ 9.6 s, CT → Mitte ≈ 11.4 s.

**Weitere Karte `de_kuehlhaus` (de_nuke als Kühlhaus, Okt 2026) ✅**
- [x] Zwei Grundrisse übereinander (Erdgeschoss mit dünner Platte, Keller −5 m) — **B liegt direkt unter A**; Schächte (Rampenraum, Lüftung, Kellertreppe, Geheimgang-Rampe) mit tieferem Unterbau. Ebenen: Keller −5, Erdgeschoss 0, Himmel/Dachweg +4.5 m; 180 × 184 m, ≈ 17 k Navigationsknoten.
- [x] Nuke-Topologie: Außenbereich/Silos, Garage (+ Garagenflur, Garagendach), Haupteingang, Lobby (Mitte), Hütte (Quietschtür), Westgang, Halle A (Himmel/Hölle, Spot A „Serverschrank A“ an der Kältemaschine), Rampenraum, Lüftung (Treppenschacht A ↔ B), Keller B (Datenraum „Serverschrank B“, Tiefkühllager), Geheimgang, CT-Spawn mit Kontrollraum/Kellertreppe, Mini, Westdach/Dachweg.
- [x] Engine-Erweiterungen (generisch, getestet): `CellKind.bottom/bare/roofWalk` (mehrstöckige Pläne, unverkleidete Tunnelmünder, begehbare Dächer ohne Sturz), Materialien `panel` (Sandwichpaneel) und `frost`, Decal `frost`, Deko `tank`/`tankDome`/`stripCurtain`/`compressor`/`condenser`, Requisiten `silo`/`chiller`/`compressor`/`stripCurtain`/`rollCage` + Option `cold` (Tiefkühlware), Schilder passen die Unterzeile an.
- [x] Tests: Validator (`maps.test.ts`, schneller: Erreichbarkeit einmal statt je Knoten A*) + `de_kuehlhaus.test.ts` (Topologie: B unter A, Lüftung, Rampe ≤ 30°, Geheimgang, Kellertreppe, Dachweg, Callouts).
- **Laufzeiten de_kuehlhaus (Sprint 6.2 m/s):** T → A 138 m ≈ 22.2 s, T → B 134 m ≈ 21.7 s (Geheimgang; über Rampenraum ≈ 25 s), CT → A 42 m ≈ 6.7 s, CT → B 85 m ≈ 13.7 s, T → Mitte ≈ 11.7 s, CT → Mitte ≈ 16.5 s.
- Erkenntnis: Treppen-/Rampen-Clips über 40° wirken wie Wände — bei 5 m Höhe mindestens ≈ 8 m Lauflänge einplanen (hier 26–29°). Die Lücke zwischen Keller und Schacht darf die Fassadenverkleidung nicht zumalen → Tunnelmünder als `bare`-Zellen.

**Erkenntnisse/Notizen (M4):**
- Referenztempo für Laufzeiten ist das Lauftempo mit dem Messer (250 u/s = 6.2 m/s, `PLAYER.runSpeed`; seit M5 ist Laufen der Standard und Shift das leise Gehen); beim Schleichen (3.2 m/s) wären es ~45 s. CT → A ist wie im Vorbild bewusst kurz (≈ 8 s).
- Gebackenes Licht + unbeleuchtete Materialien sind in Software-GL kaum teurer als einfarbige Flächen; die Qualitätsstufe ändert nur Raster/Strahlen beim Backen und die Extras (Lichtkegel, Leuchthöfe).
- Lichtproben für Deko nicht im eigenen Kollisionskörper nehmen (sonst schwarz) — hellste freie Probe über dem Objekt.
- Fassaden-Verkleidung muss dicker sein als der Verdeckungs-Test (0.04 m), damit die Gebäudefläche dahinter entfällt.
- Treppen-Clip-Rampe über die Stufenkanten legen (sonst sinkt man in die Stufen ein); Stufen selbst blockieren nur Strahlen.
- `groundAt` ohne Höhenhinweis = unterste begehbare Ebene an der Stelle (Navigationsknoten), sonst landet man auf Dächern.
- `stepPlayer` unterteilt große Zeitschritte (statt sie auf 0.05 s zu kappen) — sonst liefen Bots/Spieler bei niedriger Bildrate (Host-Teilschritte 0.1 s) nur halb so schnell und brauchten auf den großen Karten doppelt so lange.
- Der Obere Tunnel hat einen Knick vor Spot B, damit CTs aus B nicht 70 m geradeaus in den Tunnel sehen; CT-Bots teilen sich nach Rang im Team auf A/B auf.

### M4 — Overhaul · UI: Hauptmenü, Serverbrowser, Serverlobby, HUD ✅ (Okt 2026)
- [x] **Hauptmenü** (`ui/MainMenu.ts`, `menu.css`): Logo (SVG-Schablonenschrift mit Abnutzung, Warnstreifen, „1.6“-Plakette), Einträge Einzelspieler · Mehrspieler · Server erstellen · Einstellungen · Steuerung & Hilfe · Credits · Beenden („Danke fürs Spielen“ + Schließversuch); Maus, Pfeiltasten/Enter/Esc, Gamepad; Hover-/Klick-Klänge (`ui/uiSound.ts`, WebAudio-synthetisiert); Startseite mit Karten-Kachel, Schnellstart, Tipps
- [x] **Hintergrund** (`ui/MenuBackdrop.ts`): Canvas-Key-Art mit echter Perspektivprojektion — langsamer Kameraflug durch eine Hochregalgasse, Hallenstrahler mit Lichtkegeln, Rolltor-Gegenlicht, Bodenmarkierungen, Staub, Maus-Parallaxe, Filmkorn/Vignette; 30 fps gedrosselt, pausiert im Hintergrund-Tab, `?quality=low` = reduzierte Auflösung. Schnittstelle `MenuBackdropLike` als Haken für einen späteren 3D-Flug durch die Karte (`showMainMenu({ backdrop })`) — bewusst nicht mit `World` gebaut, weil Karten/World parallel umgebaut werden
- [x] **Menümusik** (`ui/MenuMusic.ts`, `logic/music.ts` getestet): 3 Titel von Derek „JoJo“ Stegall (CC BY-SA, Red Eclipse, `assets/audio/music/CREDITS.md`), Zufallsfolge ohne Wiederholung, Überblenden, Einblenden, Ausblenden beim Spielstart, „Klicken für Ton“ bei Autoplay-Sperre, Stumm-Knopf, Einstellungen `musicVolume`/`musicMuted`
- [x] **Einzelspieler**: Karten-Kacheln (Vorschaubild aus der Registry `preview`/`radar`, sonst Radar-Draufsicht aus `logic/overview.ts`, notfalls stilisierter Platzhalter `ui/mapPreview.ts`), Team, Teamgröße 1–8, Bot-Schwierigkeit (Leicht/Normal/Schwer/Experte), Eckdaten; Rundenzahl ist eine Konstante (`ROUND.scoreToWin`) und daher nur Anzeige
- [x] **Serverbrowser + Erkennung** (`multi/Discovery.ts`, `logic/serverList.ts` getestet): eigener WebSocket zum selben Backend (Needle oder Relay), gemeinsamer Raum `csw16-lobby`, Host-Heartbeat alle 3 s, aktive Anfrage mit Zeitstempel (Latenz), TTL 10 s, Bereinigung aller Felder (XSS), Versionsprüfung, Filter/Suche/Sortierung, Beitritt per Doppelklick/Code/Einladungslink
- [x] **Server erstellen + Regeln** (`logic/lobby.ts` getestet): Name, Spielerlimit, Bots, Passwort (nur FNV-Prüfsumme im Netz), „gelistet“, Serverlobby; Host prüft `hello` (Passwort, Limit, Version) → `kick`-Ereignis → Client zurück ins Menü mit Meldung; Konfiguration wandert im Snapshot (übersteht Host-Migration)
- [x] **Serverlobby** (`ui/LobbyOverlay.ts`): gehaltenes Aufwärmen (`holdWarmup`), Spieler je Team mit Teamwechsel, Chat, Raumcode + Einladungslink kopieren, Host „Spiel starten“ (`MatchDriver.startMatch`), Clients „Warte auf den Host“, ausblendbar zum Herumlaufen
- [x] **HUD neu** (`ui/Hud.ts`, `hud.css`, `logic/hudFormat.ts`, `logic/uiScale.ts`, `logic/weaponIcons.ts` getestet): Skalierung über `--u` (Referenz 1080p, 0.6–2.4, plus Einstellung `hudScale`), Super-Ultrawide-Einrückung, scharfes Radar (DPR), prozedurale SVG-Waffensilhouetten für Kill-Feed/Kaufmenü/Inventar, Spielstand mit Avataren, Bombe-gelegt-Uhr, Geld-Änderung, Kaufzone/C4/Kit-Chips, Fortschrittsbalken Legen/Entschärfen, Rundenende-Banner mit Team-Emblem, Todesinfo, Zuschauerleiste, Funkmenü, neues Kaufmenü (Kategorien 1–8, Karten mit Werten und Zustand, Team-Sperren) und Scoreboard; DOM-Änderungen nur bei geänderten Werten; Timer in echter Zeit
- [x] **Einstellungen** datengetrieben (`logic/settingsSchema.ts` getestet): Reiter Maus & Sicht · Ton · Fadenkreuz (Vorschau, Abstand/Stärke/dynamisch neu) · HUD & Anzeige; im Spiel (O) und eingebettet im Menü. **Neue Einstellung = Feld in `settings.ts` + Eintrag in `SETTINGS_SECTIONS`** (Test „deckt alle Einstellungen ab“ erzwingt das)
- **Verifikation:** `bun run test` (560 Tests in 44 Dateien), `tsc`, `build`, Smoke, Netztest und neuer `scripts/lobby-test.mjs` (Erkennung über Relay, Passwort-Kick, Beitritt, Lobby-Start) grün; Screenshots 720p/1440p/4K geprüft.

**Erkenntnisse/Notizen (M4-UI):**
- Needle `context.connection` unterstützt nur einen Raum → Server-Erkennung über eine zweite WebSocket-Verbindung im Needle-Raumprotokoll (`join-room`, `{key,data}`-Broadcast); kein Serverumbau nötig.
- Overlays (Einstellungen, Serverlobby) hängen im `needle-engine`-Element neben dem HUD, sonst liegt das Fadenkreuz im anderen Stapelkontext darüber.
- Engine-`deltaTime` ist gedeckelt → HUD-Timer (Banner, Meldungen) laufen über `performance.now()`.
- Headless-Tests mit mehreren SwiftShader-Browsern sind CPU-gebunden: verwaiste Browserprozesse verlangsamen alles so stark, dass Netz-/Lobbytests zeitlich scheitern — vor Testläufen aufräumen.

### M4 — Taktische Bots (CS-1.6-/CZ-Bot-Gefühl) ✅ (Okt 2026)
Auftrag: „Die Bots müssen sich taktischer bewegen … es soll sich wirklich wie Counter-Strike 1.6 anfühlen.“
Alles pure Logik in `src/logic/bot*.ts` (kartenunabhängig, getestet); der Driver ruft nur `BotSystem.roundStart/tick/notify`.
- [x] **Karten-Analyse** (`botMap.ts`): Zonen (Callouts oder Auto-Cluster), Portale mit Richtung, Distanzfelder je Spawn, Spots mit Angriffs-/Verteidigungs-Eingängen, **verschiedene Routen** je Spot (Portalgraph mit Strafkosten: Kurz A/Lang A/Tunnel/Mitte→B), Bereitstellungsraum (Deckung, keine Sicht auf den Pflanzpunkt), umkämpfter Punkt + Kontrollpunkt, **Halte-Positionen** (Sicht auf Eingang, eigene Seite, Deckung/Höhe/Distanz/Ducken, Hinweise), Gefahrenpunkte je Zone (Vorzielen), Stehplätze für Gruppen
- [x] **Team-Strategie** (`botStrategy.ts`, `botCoach.ts`): T-Pläne Rush/Default/Split/Fake/Eco nach Economy + Zufall (Wiederholung seltener), Gruppen über Routen, Träger nie vorn, Sammeln am Bereitstellungsraum, „Los, los, los!“ mit Blend in den Spot und Rauch auf die CT-Position, Träger pflanzt (Hinweis-Platz), Rest sichert die CT-Eingänge, nach dem Plant Positionen mit Blick auf Eingänge und Bombe (nicht auf der Bombe), bei gehörtem Entschärfen zur Bombe, kurz vor der Explosion Abstand; liegende C4 aufheben (neuer Träger pflanzt); Zeitdruck → ausführen. CT: Aufstellung 1 / 1-1 / 1-1-1 / 2-1-1 / 2-1-2 auf Halte-Positionen (Anker je Spot, Rotierer, vorgeschobene Positionen, AWP auf längste Sicht), **Rotation** bei Druck auf einen Spot (Sichtungen, Geräusche, gefallene Kameraden, Bombe), Retake: Sammeln vor mehreren Eingängen → gemeinsam rein → Kit-Träger entschärft mit Rauch, Rest sichert; ohne Zeit → retten; gesichtete C4 bewachen
- [x] **Bot-Verhalten** (`botBrain.ts`): Reaktionszeit, Gegenlenken, Feuerkontrolle nach Distanz (Tap/Burst/Spray, `botCombat.ts`), Kopf-/Brustziel nach Skill, Strafen zwischen Feuerstößen, Pistole bei leerem Magazin, Nachladen in Sicherheit/hinter Deckung, Rückzug bei wenig HP (nicht bei Retake/Ausführen), Winkel halten nach Sichtverlust (ggf. HE), Treffer aus dem Nichts → hinsehen + Deckung + erneut anschauen, nach Kill neu positionieren, Gehen statt Rennen in Gefahrenzonen, Schleichen beim Nachgehen von Geräuschen (nur freie Rollen), Ecken checken (Blick auf Gefahrenpunkte/CT-Lieblingsplätze), geduckt halten, nach eigener Blendgranate wegdrehen, HE/Blend auf gesammelte Gegner an der Engstelle, Pflanzen/Entschärfen bei Feindkontakt abbrechen (außer es ist zu spät dafür)
- [x] **Körper** (`botBody.ts`): Wegpunkte der Route abschnittsweise (Fortschritt bleibt nach Umwegen erhalten), Rennen 6 m/s / Gehen 4.2 / Schleichen 2.4 (lautlos) / geduckt, Strafen nur auf Navigationsboden, Abstand zu Kameraden (kein Gänsemarsch, besetztes Ziel = angekommen), Festfahr-Erkennung, weiches Drehen (im Kampf schneller); Ausweichzonen für Rauch und bekannte Schusslinien
- [x] **Wahrnehmung + Team-Wissen** (`botPerception.ts`, `botKnowledge.ts`): Sichtkegel, Sichtlinie auf Kopf/Brust (geduckt hinter Kisten unsichtbar), Rauch, Schritte nach Tempo (wie das Spiel-Audio: Schleichen/Ducken lautlos), Schüsse (Schalldämpfer leiser), unscharfe Hörposition; Blackboard mit Zeitstempel/Quelle/Zerfall, Druck je Spot
- [x] **Granaten** (`botThrow.ts`): Wurf-Suche über Neigung/Stärke mit der echten Granatenphysik, Blend muss Ziele sehen, Ersatzziele für Rauch, Wurf erst in Wurfweite
- [x] **Kauf** (`botBuy.ts`): Team-Entscheidung Pistole/Eco/Force/Halb/Voll (inkl. „nächste Runde reicht es“), Rollen (AWP für den reichsten Bot bei Vollkauf, Entry Blendgranaten, Support Rauch, Kit für CT, Deagle bei Restgeld); altes `loadout.botBuy` entfernt
- [x] **Funk** (`radio.ts` `BOT_RADIO`): Gegner gesichtet, Brauche Verstärkung, Bombe gesichtet, Los los los, Ich bin in Position, Gegner ausgeschaltet, Regroup, Deckung, Team zurückfallen, „Bombe gelegt“/„Ich entschärfe“ — mit Team-Mindestabstand (4 s) und Abklingzeiten je Spruch (kein Spam)
- [x] **Karten-Hinweise** (optional, `MapData.botHints`): hold/sniper/plant/smoke, in de_lagerstaub 8 Stück; der Validator prüft Hinweise und Bot-Tauglichkeit jeder Karte
- [x] **Headless-Simulation** (`botSim.ts`, `scripts/bot-sim.ts`): gleicher Host-Regelsatz wie der Driver (Plant/Defuse-Regel jetzt pure in `hostRules.ts`), Zeitraffer ohne Darstellung, prüft Wand-/Fallfehler, Festsitzen, Leerlauf, Eingänge, Pläne
- [x] **Driver**: alter `tickBot`/`botMove`/`decideBot` ersetzt durch `BotSystem`; Ereignisse (Schuss, Treffer, Kill, Explosion) gehen an die Bots, Bots ducken sichtbar (Pose `c`, Hitbox), Funk als Team-Chat, Blendung mit Blickrichtung inkl. Neigung; Debug `__bots()` (Rolle/Auftrag/Zustand), `__botPlan()`
- **Verifikation:** `bun run test` (alle Bot-Module + Simulation 3 × 14 Runden 5v5 auf de_lagerstaub + Testkarte mit/ohne Callouts), `tsc`, `build`, Smoke, Netztest grün; Bots im Browser als Zuschauer beobachtet.

**Simulation (5v5, Skill 0.6, je 5 Seeds × 20 Runden):** de_lagerstaub T 50 : CT 50, Pflanzrate 40–80 %, 16 Entschärfungen, Ø Runde 66–85 s; de_kuehlhaus (Nuke-Topologie) T 14 : CT 79 — T sterben vor allem in „Halle A“ und im langen „Geheimgang“, den CT von Halte-Positionen abdecken (kartenbedingt CT-lastig, Daten für die Kartenpflege: `bun scripts/bot-sim.ts de_kuehlhaus 20 --deaths`). de_gueterbahnhof (Train-Topologie, 3 Seeds) T 31 : CT 29, Pflanzrate 68 % — ohne jede Anpassung an die Karte. Alle drei Karten: Festsitzen ≤ 1.2 s, Leerlauf ≤ 3.3 s, 0 Wand-/Fallfehler, alle Planarten, alle Spot-Eingänge genutzt, ~2 Granaten und ~13 Funksprüche je Runde (beide Teams). 20 Runden rechnen in ~5–8 s.

**Erkenntnisse/Notizen (Bots):**
- Float32-Distanzfelder im Dijkstra führen zu endlosem Neu-Einreihen (Rundung) → intern Float64.
- Wegpunkte einer Route müssen ihren Fortschritt über Umwege (Kampf, Rückzug) hinweg behalten, sonst laufen Bots zum Spawn zurück.
- Gruppen brauchen getrennte Stehplätze (sonst schubsen sie sich endlos am selben Knoten); ein leicht verschobenes Ziel muss übernommen werden (sonst „angekommen“ am alten Ziel).
- Eine Sichtlinie aus einem Gang direkt in den T-Spawn entscheidet Runden in Sekunden — Kartenregel (die Testkarte hat deshalb eine Spawnwand).
- Die Balance schwankt je Match stark (Economy-Schneeball wie in CS); für Aussagen ≥ 60 Runden über mehrere Seeds simulieren.
- Rush heißt „ohne Halt durch“ (Granaten fliegen, sobald das Ziel in Wurfweite ist); Split wartet nur kurz auf die zweite Gruppe — langes Warten am Bereitstellungsraum gibt den CT Zeit zum Rotieren.
- Nach dem Plant muss mindestens ein T die Bombe selbst sehen; nur Eingänge zu beobachten lässt Entschärfer unbemerkt durch (Serverräume mit Regalen).
- SMG/Pistole gegen Gegner weit außerhalb der Reichweite: weiterlaufen statt stehen bleiben (sonst Kanonenfutter für AWP-Linien).
- Deckungssuche prüft den Laufweg (dünne Wände): sonst pendelt ein Bot zwischen unerreichbaren „Deckungen“.

### M5 — Spielgefühl wie CS 1.6: Bewegung, Treffsicherheit, dynamisches Licht ✅ (Okt 2026)
- [x] **Einheiten** (`logic/units.ts`): 1 CS-Einheit = 0.0248 m → Messer 250 u/s = 6.2 m/s, damit alle Kartenlaufzeiten gültig bleiben (`PLAYER.runSpeed`, `sprintSpeed` als Alias für Validator/Bots)
- [x] **Bewegung im GoldSrc-Stil** (`logic/move.ts`, `stepBody`, getestet in `move.body.test.ts`): `sv_accelerate 5`, `sv_friction 4`, `sv_stopspeed 100`, `sv_airaccelerate 10` (Luft: Wunschtempo auf 30 u/s gedeckelt → Air-Strafing), Beschleunigung nach Basistempo der Waffe (Schleichen/Ducken werden nicht von der Reibung erstickt), Wandgleiten mit Tempoverlust, Sprung 6.65 m/s (≈ 268 u/s) nur nach Loslassen (kein Dauerhopsen), **Bunnyhop-Bremse** (CS 1.6: über 1.2 × Tempo → × 0.8), Rampen/Stufen/Stillstand wie zuvor (kein Rutschen auf flachen Rampen)
- [x] **Standard = Laufen**, Shift = leise gehen (52 %, Schritte lautlos: `STEP.minSpeed` 140 u/s), Strg = Ducken (34 %); **Tempo je Waffe** aus `weapons.json` (`maxSpeed` in u/s: Messer/Pistolen/Granaten/C4 250, P90 245, M3 230, XM1014 240, AK 221, M4 230, Famas 220, Galil 240, AUG 221, SG552 235, Scout 260, AWP/G3/SG550 210, M249 220; `scopedSpeed`: AWP/G3/SG550 150, Scout 220) und `weaponSpeed(def, scoped)` als reiner Helfer (Bots können ihn später übernehmen; `MatchDriver.BOT_SPEED` ist bewusst unverändert)
- [x] **Hocksprung** (+0.45 m = 18 u Beine anziehen) mit echter Luft-Stufenhöhe (0.25 m): Standsprung erreicht Kanten bis ≈ 1.4 m (Kisten 1.2/Xbox 1.25 m), Hocksprung bis ≈ 1.85 m, nicht die zweite Xbox-Stufe (Test gegen die Kisten von `de_lagerstaub`)
- [x] **Landung und Sturz** (`logic/fall.ts`): harte Landung ab 350 u/s (Kameraruck, Tempo bis × 0.5), Schaden ab 580 u/s linear bis 100 HP bei 1024 u/s (≈ 5.2 m / 16 m Fallhöhe bei g = 20); **host-autoritativ**: Spieler meldet Aufprallgeschwindigkeit (`FallMsg`), Host prüft (`acceptFallReport`: endlich, ≤ 40 m/s, ≥ 0.4 s Abstand, nur lebende Menschen), `applyFall` (Rüstung schützt nicht, Waffe `fall`, Kill-Feed „Sturz“), Ereignis `hit` mit `fall: true`; Bots erleiden keinen Sturzschaden (sie springen nicht)
- [x] **Treffsicherheit nach echter Bewegung** (`logic/fire.ts`): Streuung aus Horizontaltempo + Luft (`MoveSpreadState`), weiche Schwellen 140–170 u/s (Schleichen bleibt genau, Rennen ≈ 6× ungenauer), Scharfschützengewehre schon ab 10 u/s ungenau, Sprung = `airSpread` je Waffe (AK 0.16 ≈ 16× Stehwert, AWP 0.30), Ducken wie zuvor; Wärme klingt in < 1 s ab (erster Schuss wieder genau); `boolean` bleibt für Bots gültig
- [x] **Sicht** (`player/FpsPlayer.ts`): Bob dezent (1.6 cm, kein Kamera-Roll), weiches Nachgleiten nach Absätzen/Aufspringen, Landedip, Sprint-Haltung des Viewmodels entfällt (CS kennt kein Sprinten); FOV unverändert 75° vertikal (≈ CS-Standard 90° horizontal bei 4:3)
- [x] **Dynamisches Licht** (`logic/dynlight.ts` getestet, `level/DynamicLights.ts`): Pool (16) mit Lebensdauer-Kurven (Flash/Blast), Auswahl der wichtigsten Lichter nach Kameranähe (hoch 6, niedrig 2), Mündungsfeuer/HE/C4/Blendgranate aus `Fx`/`Grenades`; Shader-Patch (`onBeforeCompile`) auf den unbeleuchteten Level-, Deko-, Schilder- und Markierungs-Materialien: ein Uniform-Array, Abstand² bis zum Radius, Flächenausrichtung aus Bildschirm-Ableitungen (Licht hinter Wänden strahlt die Vorderseite nicht an), ohne Schatten, Early-out bei 0 Lichtern; ein neues Licht ist mindestens einen Frame sichtbar (auch bei niedriger Bildrate)
- **Verifikation:** `bun run test` (siehe Abschlussbericht), `tsc`, `build`, Smoke (neu: Tempo Messer/AWP/gezoomt, Schleichen, Ducken, Schrittgeräusche leise, Sprunghöhe, Sturz 3 m/8 m; `CDP_PORT` per Umgebung), Netztest; Screenshots Tunnel (Mündungsfeuer/HE/Blendgranate) in hoch/niedrig.

**Erkenntnisse/Notizen (M5):**
- Reibung schluckt bei GoldSrc-Zahlen langsame Zielgeschwindigkeiten (Ducken mit AWP: 70 u/s Ziel, 400 u/s² Bremse) → Beschleunigung richtet sich nach dem Basistempo der Waffe, das Ziel nach der Haltung.
- Mit echter Luft-Stufenhöhe (0.25 m statt 0.55 m) braucht ein Sprung auf Kisten Anlauf/Timing wie in CS; `stepPlayer` (Bots) behält die alte Stufenhöhe (`airStep` ist optional).
- Dynamisches Licht darf nicht mit dem gebackenen Vertex-Licht multipliziert werden (dunkle Tunnel würden kaum heller) → Albedo vor der Vertex-Farbe abgreifen; für Deko/Markierungen Farbton auf feste Helligkeit normieren.
- Spielzeit pro Frame ist auf 0.1 s gedeckelt: bei Software-Rendering (≈ 3 fps) läuft die Spielzeit langsamer als die Echtzeit; Smoke wartet daher auf Zustände (`air`), nicht auf feste Zeiten.

### Offen / Ideen
- [ ] Weitere Modi (Geiselbefreiung `cs_`, Deathmatch), Map-Editor auf dem Level-JSON
- [ ] Wallbangs (Durchschuss durch dünne Requisiten); Sturzschaden für Bots
- [ ] Sprach-Chat (Needle `Voip`), Chat-Teamfilter
- [ ] Weitere Karten im neuen Format (z. B. Hafen/Containerterminal, Kühlhaus)
- [ ] Bots: Sprung-/Kistenpositionen (Navigation ohne Sprungkanten), Wallbangs, Messer-Rush bei Eco, Sprachausgabe der Funksprüche, Lerneffekte über Runden (CT merkt sich bevorzugte T-Routen)
- [ ] Sprung-Kanten in der Navigation (Kisten ≤ 1.1 m), Leitern
- [ ] Anti-Cheat jenseits der Plausibilitätsprüfungen (Absender-IDs sind im Needle-Protokoll nicht signiert)

---

## Verifikation (vor jedem Milestone-Abschluss)

1. `bun run test` — alle Tests grün
2. `bunx tsc --noEmit` — keine Typfehler
3. `bun run build` — Build erfolgreich
4. `bun run dev` + `BROWSER=… bun scripts/smoke.mjs` und `BROWSER=… bun scripts/net-test.mjs`
5. Diese Datei + AGENTS.md aktualisieren (Häkchen, Entscheidungen, Erkenntnisse)
