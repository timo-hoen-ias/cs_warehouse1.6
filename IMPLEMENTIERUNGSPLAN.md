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
| 13 | Online ohne Internet: `scripts/relay-server.ts` spricht das Needle-Raum-Protokoll (Lobby-Feld „Server“ bzw. `?server=ws://host:9100/socket`). |

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
                             # loadout, economy, round, bombs, match, net, drops, grenade, botDecide, zones, radar, settings,
                             # viewAnim, acoustics, rng, weaponGeom, viewPlace, stretch, dropRest,
                             # audioMix, reverb, soundBank, ambientFallback
src/game/World.ts            # Kompilierte Karte + Darstellung; API: collider, nav, findPath, areaAt, siteAt, surfaceAt, acoustics
src/game/MatchDriver.ts      # Host-Simulation + Client-Spiegel + Ereignisse + Bots (Navigation) + Zuschauer + Audio
src/multi/Transport.ts       # LocalTransport (offline) / NeedleTransport (Raum)
src/player/FpsPlayer.ts      # Bewegung (Collider), Blick, Ducken (Kopffreiheit), Shake, Todes-/Zuschauerkamera
src/weapons/                 # Shooter (Slots, Zoom, Spray, Messer, G), ViewModel, Fx, Grenades, DroppedView
src/weapons/models/          # Prozedurale Waffenmodelle + First-Person-Arme
src/entities/Soldier.ts      # Spielfiguren (Bots + entfernte Spieler); soldierHold.ts = Waffenhaltung/Arm-IK (pure, getestet)
src/level/                   # LevelView (Geometrie je Material/Kachel, Deko-Instanzen, Schilder, Markierungen, Himmel,
                             # Lichtkegel), Lighting (Sonde + echte Lichter für Figuren), decor, textures (Canvas)
src/ui/                      # Lobby, Hud (Kaufmenü, Scoreboard, Radar mit Kartenbild, Feed, Chat, Scope), SettingsMenu
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

**Laufzeiten de_lagerstaub (Sprint 6.2 m/s, Knotenwege):** T → A 145 m ≈ 23.4 s, T → B 146 m ≈ 23.5 s, CT → A 50 m ≈ 8.1 s, CT → B 77 m ≈ 12.5 s, T → Mitte ≈ 9.6 s, CT → Mitte ≈ 11.4 s.

**Weitere Karte `de_kuehlhaus` (de_nuke als Kühlhaus, Okt 2026) ✅**
- [x] Zwei Grundrisse übereinander (Erdgeschoss mit dünner Platte, Keller −5 m) — **B liegt direkt unter A**; Schächte (Rampenraum, Lüftung, Kellertreppe, Geheimgang-Rampe) mit tieferem Unterbau. Ebenen: Keller −5, Erdgeschoss 0, Himmel/Dachweg +4.5 m; 180 × 184 m, ≈ 17 k Navigationsknoten.
- [x] Nuke-Topologie: Außenbereich/Silos, Garage (+ Garagenflur, Garagendach), Haupteingang, Lobby (Mitte), Hütte (Quietschtür), Westgang, Halle A (Himmel/Hölle, Spot A „Serverschrank A“ an der Kältemaschine), Rampenraum, Lüftung (Treppenschacht A ↔ B), Keller B (Datenraum „Serverschrank B“, Tiefkühllager), Geheimgang, CT-Spawn mit Kontrollraum/Kellertreppe, Mini, Westdach/Dachweg.
- [x] Engine-Erweiterungen (generisch, getestet): `CellKind.bottom/bare/roofWalk` (mehrstöckige Pläne, unverkleidete Tunnelmünder, begehbare Dächer ohne Sturz), Materialien `panel` (Sandwichpaneel) und `frost`, Decal `frost`, Deko `tank`/`tankDome`/`stripCurtain`/`compressor`/`condenser`, Requisiten `silo`/`chiller`/`compressor`/`stripCurtain`/`rollCage` + Option `cold` (Tiefkühlware), Schilder passen die Unterzeile an.
- [x] Tests: Validator (`maps.test.ts`, schneller: Erreichbarkeit einmal statt je Knoten A*) + `de_kuehlhaus.test.ts` (Topologie: B unter A, Lüftung, Rampe ≤ 30°, Geheimgang, Kellertreppe, Dachweg, Callouts).
- **Laufzeiten de_kuehlhaus (Sprint 6.2 m/s):** T → A 138 m ≈ 22.2 s, T → B 134 m ≈ 21.7 s (Geheimgang; über Rampenraum ≈ 25 s), CT → A 42 m ≈ 6.7 s, CT → B 85 m ≈ 13.7 s, T → Mitte ≈ 11.7 s, CT → Mitte ≈ 16.5 s.
- Erkenntnis: Treppen-/Rampen-Clips über 40° wirken wie Wände — bei 5 m Höhe mindestens ≈ 8 m Lauflänge einplanen (hier 26–29°). Die Lücke zwischen Keller und Schacht darf die Fassadenverkleidung nicht zumalen → Tunnelmünder als `bare`-Zellen.

**Erkenntnisse/Notizen (M4):**
- Referenztempo für Laufzeiten ist der Sprint (≈ CS-Lauftempo 250 u/s); mit Gehtempo 4.2 m/s wären es ~35 s. CT → A ist wie im Vorbild bewusst kurz (≈ 8 s).
- Gebackenes Licht + unbeleuchtete Materialien sind in Software-GL kaum teurer als einfarbige Flächen; die Qualitätsstufe ändert nur Raster/Strahlen beim Backen und die Extras (Lichtkegel, Leuchthöfe).
- Lichtproben für Deko nicht im eigenen Kollisionskörper nehmen (sonst schwarz) — hellste freie Probe über dem Objekt.
- Fassaden-Verkleidung muss dicker sein als der Verdeckungs-Test (0.04 m), damit die Gebäudefläche dahinter entfällt.
- Treppen-Clip-Rampe über die Stufenkanten legen (sonst sinkt man in die Stufen ein); Stufen selbst blockieren nur Strahlen.
- `groundAt` ohne Höhenhinweis = unterste begehbare Ebene an der Stelle (Navigationsknoten), sonst landet man auf Dächern.
- `stepPlayer` unterteilt große Zeitschritte (statt sie auf 0.05 s zu kappen) — sonst liefen Bots/Spieler bei niedriger Bildrate (Host-Teilschritte 0.1 s) nur halb so schnell und brauchten auf den großen Karten doppelt so lange.
- Der Obere Tunnel hat einen Knick vor Spot B, damit CTs aus B nicht 70 m geradeaus in den Tunnel sehen; CT-Bots teilen sich nach Rang im Team auf A/B auf.

### Offen / Ideen
- [ ] Weitere Modi (Geiselbefreiung `cs_`, Deathmatch), Map-Editor auf dem Level-JSON
- [ ] Wallbangs (Durchschuss durch dünne Requisiten), Fallschaden
- [ ] Sprach-Chat (Needle `Voip`), Chat-Teamfilter
- [ ] Weitere Karten im neuen Format (z. B. Hafen/Containerterminal, Kühlhaus), taktische Bots auf dem Bereichsgraphen (Rollen je Callout, Smokes/Flashes, Rotationen)
- [ ] Sprung-Kanten in der Navigation (Kisten ≤ 1.1 m), Leitern
- [ ] Anti-Cheat jenseits der Plausibilitätsprüfungen (Absender-IDs sind im Needle-Protokoll nicht signiert)

---

## Verifikation (vor jedem Milestone-Abschluss)

1. `bun run test` — alle Tests grün
2. `bunx tsc --noEmit` — keine Typfehler
3. `bun run build` — Build erfolgreich
4. `bun run dev` + `BROWSER=… bun scripts/smoke.mjs` und `BROWSER=… bun scripts/net-test.mjs`
5. Diese Datei + AGENTS.md aktualisieren (Häkchen, Entscheidungen, Erkenntnisse)
