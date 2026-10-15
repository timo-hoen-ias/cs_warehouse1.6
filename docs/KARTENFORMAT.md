# Kartenformat (handgebaute Karten)

Karten sind **TypeScript-Module** unter `src/maps/<id>.ts`. Sie beschreiben die Karte als pure
Daten mit kleinen Bau-Helfern (`src/logic/mapkit.ts`, `mapplan.ts`, `mapprops.ts`). Der Compiler
(`src/logic/mapcompile.ts`) macht daraus Kollision, Navigation, Spots, Spawns, Kaufzonen und
Akustik; die Darstellung (`src/level/LevelView.ts`) baut Geometrie mit gebackenem Licht. Es gibt
**keinen Bake-Schritt**: alle Clients rechnen aus demselben Code dasselbe Ergebnis (der Host
wählt nur die Karten-ID).

Referenzkarten: `src/maps/de_lagerstaub.ts` (Grundriss nach dem Klassiker, Logistik-Optik), `src/maps/de_kuehlhaus.ts` (mehrstöckig: B unter A, Kühlhaus-Optik; Ausstattung je Bereich in `src/maps/kuehlhaus/*.ts`), `src/maps/de_gueterbahnhof.ts` (Bahn-Requisiten), `src/maps/de_speicherstadt.ts` (de_inferno als Hafen-Speicherviertel: Backstein, Kopfstein, Kanäle, Speicherböden über einer Gasse; Ausstattung in `src/maps/speicherstadt/*.ts`) und `src/maps/de_umschlag.ts` (drei Ebenen übereinander: Unterführung −3.6 m, Erdgeschoss, Obergeschoss +4.4/+5.5 m; Ausstattung in `src/maps/umschlag/*.ts`).

## Koordinaten und Maße

- Meter. **x = Osten, y = oben, z = Süden.** Blick `yaw 0` = Norden (−Z), `yaw π` = Süden.
- Spieler: Radius 0.35 m, Höhe 1.8 m (geduckt 1.25 m), Augen 1.65 m.
- Stufen bis **0.55 m** läuft man hoch. Sprung: Scheitel ≈ **1.1 m** (CS 45 u), in der Luft zählt die echte Höhe
  (Stufenhöhe dort nur 0.25 m) → vom Boden aus erreicht man **Kanten bis ≈ 1.4 m** (Palette, Kiste 1.2 m, Xbox-Kiste 1.25 m);
  mit **Hocksprung** (Strg in der Luft, Beine anziehen +0.45 m, wie CS 63 u) **bis ≈ 1.85 m**. Alles darüber (Regale, zweite
  Xbox-Stufe 1.95 m, Container 2.4 m) ist nur über Treppen/Rampen oder von anderen Kisten aus erreichbar — Absätze ≥ 1.4 m
  brauchen also Hocksprung oder eine Zwischenstufe (Test `move.body.test.ts` prüft die Kisten der Referenzkarte).
- Rampen bis **40°** sind begehbar, steilere wirken wie Wände.
- Stürze: ab ≈ 5.2 m Fallhöhe Schaden (CS: 580 u/s), tödlich ab ≈ 16 m; Absätze bis 4 m (Laufstege, Gruben) sind harmlos.
- Tempo (CS 1.6, **1 u = 2.48 cm** → Messer 250 u/s = **6.2 m/s**): **Standard = Laufen** mit dem Tempo der gehaltenen Waffe
  (Messer/Pistolen 6.2, AK 5.5, AWP 5.2, Scout 6.45 m/s), **Shift = leise gehen** (52 %, ≈ 3.2 m/s, keine Schrittgeräusche),
  **Strg = Ducken** (34 %, ≈ 2.1 m/s). Beschleunigung/Reibung wie GoldSrc (Vollgas nach ≈ 0.45 s, Gegentaste stoppt in ≈ 0.1 s).
  **Laufzeiten werden mit dem Messer-Lauftempo 6.2 m/s gemessen** (`PLAYER.runSpeed`, früher „Sprint“; `sprintSpeed` ist ein Alias).

## Bausteine

### Brushes (`MapBuilder.box`, `floor`, `roof`, `block`, `wallX/wallZ`, `ramp`, `stairs`, `rail`)

Ein Brush ist ein achsenparalleler Quader oder ein **Keil** (`ramp: 'px' | 'nx' | 'pz' | 'nz'` =
Richtung, in die die Oberseite von `min[1]` auf `max[1]` ansteigt).

| Feld | Bedeutung |
|---|---|
| `mat` / `top` | Render-Material (Seiten/Unterseite) bzw. Oberseite (`MaterialId`, Texturen in `src/level/textures.ts`) |
| `tint` | Farbton `0xRRGGBB` (multipliziert die Textur) |
| `collide` | `'all'` (Standard), `'move'` (nur Bewegung: Geländer, Clips), `'shot'` (nur Strahlen: Treppenstufen), `'none'` (Deko) |
| `visible` | `false` = unsichtbarer Clip (z. B. die Rampe unter einer Treppe) |
| `occlude` | wirft Schatten beim Licht-Backen (Standard: sichtbar) |
| `noNav` | Oberseite ist kein Navigationsboden |
| `tag` | `'roof'` (nicht im Radar), `'tunnel'` (Radar-Overlay), `'wall'`, `'building'`, `'prop'`, `'facade'` … |
| `uv` / `uvFit` | Texturmaßstab in m bzw. Textur je Fläche einpassen (Fenster, Tore) |
| `surface` | Schrittklang (`concrete`, `metal`, `grate`, `wood`, `gravel`, `tile`), sonst aus dem Material |

- `wallX/wallZ(…, openings)` zerlegt Wände in Pfeiler, Stürze und Brüstungen (Türen, Fenster).
- `stairs(…)` baut sichtbare Stufen (`collide: 'shot'`) plus eine unsichtbare Clip-Rampe über die
  Stufenkanten → gleichmäßiges Hochlaufen wie in CS.
- `rail(…)` = Geländer (Bewegung blockiert, Schüsse gehen durch).

### Grundriss-Raster (`CellPlan`)

Für große Karten malt man Bereiche mit Zeichen auf ein **2-m-Raster**; alles Ungemalte wird
Gebäudemasse. `plan.build(builder, legend, { facades })` erzeugt:

- Bodenplatten (`floor`), Innenraum-Dächer (`roof`), Gebäudeblöcke (`building`), Fensterwände (`window`),
- automatische **Stürze** über Öffnungen (Innenraum → Außenbereich/höherer Raum),
- Akustik-Zonen (`room`), Radar-Tunnel (`tunnel`),
- **Fassaden** (`FacadeStyle`): Verkleidung, Sockel, Farbband, Gesims mit Attika, Fensterreihen,
  Pilaster, Fallrohre — Stil je Zeichen der angrenzenden begehbaren Zelle (Innenräume) oder
  `'@' + Gebäudezeichen` (Außenfassaden). `windows` darf ein **Array** sein (mehrere Geschosse übereinander).
- `build(…, { lintelMat, lintelTint })` – Material/Farbton der Stürze (Standard Wellblech; für Backstein-Karten `'brick'`).
- `CellKind.building.top` – Material der Oberseite eines Gebäudeblocks (z. B. `'water'`: Gebäudezelle mit `h: −1.2` = **Kanal/Hafenbecken**,
  nicht begehbar; Brücken sind normale Straßenzellen darüber, Brüstungen `h ≥ 1.7`, damit niemand hineinspringt).
- Ein Plan genügt auch für **Speicherböden über Gassen**: die Brücke zwischen zwei Obergeschossen baut man explizit (Platte, Dach, Wände) über die
  Straßenzellen; die Anschlusszellen an beiden Enden sind Boden auf Höhe des Obergeschosses (`de_speicherstadt`, „Speicherbrücke“).

Rampen-/Treppenzellen bekommen in der Legende `ramp: true` (Unterbau auf Höhe `floor`), die
Rampe selbst setzt man danach explizit mit `b.ramp` bzw. `b.stairs`.

### Mehrstöckige Karten (z. B. Keller unter einer Halle)

Ein `CellPlan` kennt je Zelle nur einen Boden. Für übereinanderliegende Ebenen baut man **zwei Pläne** auf derselben Fläche
(Vorbild `de_kuehlhaus`):

- **Erdgeschoss-Plan:** `build(…, { floorBottom: -0.3 })` → dünne Bodenplatte statt Vollkörper bis zur Tiefe.
- **Keller-Plan:** `build(…, { floorBottom: -8, lintelTop: -0.3 })`; Gebäudezellen mit `h: -0.3` füllen alles Nicht-Begehbare, Räume haben
  `floor: -5, roof: -0.8` (Decke = Unterseite der Erdgeschoss-Platte).
- **Schächte** (Rampen, Treppen) liegen im Erdgeschoss-Plan mit `floor: -5, bottom: -8` und sind im Keller-Plan **leer** (`_: {}`); die Rampe/Treppe setzt man explizit.
- `CellKind.bottom` – Unterkante des Unterbaus dieser Zellart (statt `floorBottom`).
- `CellKind.bare` – Gebäudezelle **ohne Fassadenverkleidung**; nötig über Tunnelmündern, sonst malt die Verkleidung die Öffnung zu.
- `CellKind.roofWalk` – das Dach ist begehbar (Dachweg/Plattform, Tag `floor`); es bekommt keinen Sturz zum Außenbereich. Ein Gebäude ringsum
  mit niedriger Brüstungszelle (`h ≈ 5.6`) statt 16 m hoher Wand lässt den Dachweg zum Himmel offen.
- **Steigung:** Clip-Rampen/Treppen über 40° wirken wie Wände. Bei 5 m Höhenunterschied ≥ 8 m Lauflänge einplanen (Treppe: die Clip-Rampe deckt nur n−1 Stufen).
- Bomben-Spots übereinander: `site`-Boxen mit getrennten Höhen (A: `y ≥ −0.4`, B: `y ≤ −1.2`), damit `siteAt` eindeutig bleibt.

Weitere Bausteine: Materialien `cobble` (Kopfsteinpflaster, Oberfläche gravel), `water` (Kanal/Hafen), `sack` (Jute) sowie `panel` (Sandwichpaneel) und `frost` (Reif/Eis), Decal `frost`, Deko `tank`/`tankDome`/`stripCurtain`/`compressor`/`condenser`
(Frost-Optik außerdem über Tönung und `room: 'cold'` für die Akustik).

### Requisiten (`prop(builder, kind, x, y, z, { rot, … })`)

`pallet`, `palletStack`, `palletGoods`, `crate`, `crateStack` (Xbox-Kiste), `gitterbox`, `container`,
`container40`, `trailer`, `truck`, `forklift`, `barrel`, `barrelGroup`, `drum`, `rack` (Hochregal mit Ware),
`shelf`, `serverRack`, `serverRow`, `ups`, `cooler`, `conveyor`, `cartons`, `ibc`, `desk`, `bumper`,
`lampPost`, `fence`, `handTruck`, `cableTray`, `locker`, `generator`, `rollerDoor`, `doorSteel`,
`acUnit`, `electricBox`, `cones`, `silo` (Großtank, `len` = Durchmesser, `h` = Höhe, Kollision als Achteck-Kern), `chiller` (Verflüssiger auf Füßen), `compressor`, `stripCurtain` (Streifenvorhang, nur Optik), `rollCage` (Rollcontainer). Option `cold: true` färbt Ware/Kartons/Regale in Tiefkühl-Töne (Folie statt Karton).

`rot` in Vierteldrehungen (0..3), damit Kollisionsquader achsenparallel bleiben; lokale Front = +Z
(`rot 2` → Front nach −Z, `rot 1` → −X, `rot 3` → +X). `(x, y, z)` = Fußpunkt-Mitte. Oberseiten
höher als 1.9 m sind automatisch kein Navigationsboden.

#### Hafen-/Speicher-Requisiten (Referenz: `de_speicherstadt`)

`sacks` (Sackstapel/Sandsack-Barrikade: `len` = Breite, `n` = Lagen; Pyramide, Deko-Instanz je Sack, Kollision je Lage), `van` (Lieferwagen,
Front +Z, `tint` = Lack), `fountain` (Brunnen, `len` = Beckendurchmesser; Beckenrand ist kein Navigationsboden), `hoist` (Seilwinden-Erker:
Luke mit Läden, Balken, Seilrolle, Seil; `len`/`h` = Lukenmaß, `n: 1` hängt eine Kiste ans Seil; nur Optik, Rückseite an der Wand),
`archGate` (Rundbogen-Tor: `len` = lichte Weite, `h` = Scheitel, `n` = Pfeilerbreite; Pfeiler und Aufsatz massiv, Zwickel blockieren nur Schüsse),
`archive` (Aktenregal), `crane` (rostiger Hafenkran: Mast = Kollisionspfeiler, `len` = Ausleger entlang lokal +X, `h` = Höhe),
`scaffold` (Baugerüst, nur Optik), `gasLamp` (Gaslaterne 4.2 m mit warmem Licht), `logs` (Baumstammstapel liegend entlang X, `n` = unterste Lage).
Deko-Formen dazu: `sack`, `van`, `fountain`, `lantern`, `log`, `archRing`.

Ausstattungs-Helfer der Karte (`src/maps/speicherstadt/helpers.ts`): `hoists(b, face, wall, a0, a1, floorY, row, every)` setzt Speicherluken in
die Lücken zwischen den Fensterreihen einer Backsteinfassade (Geschoss `row` 1–3), `plate`/`shop` (Straßen- bzw. Firmenschild), `awning`,
`barge` (Lastkahn im Wasser), `ladder`, `chain`, `bollard`.

#### Bahn-Requisiten (`src/logic/railprops.ts`, Referenz: `de_gueterbahnhof`)

`track` (Schotterbett, Schienen im Regelspurabstand, Schwellen; `len`), `boxcar`/`tankcar`/`flatcar`/`loco`
(Maße in `WAGON`, Abstand `WAGON.pitch`; Boden +1.3 m, Dach +3.74 m), `cargoContainer`, `bufferStop`,
`signal`, `catenary`, `ivy` (Efeu an einer Wand, `len`/`h`), `truss` (Hallenbinder). Wagen-Optionen: `doors`
(`closed`/`front`/`both`; offene Wagen sind begehbar und bekommen eine Innenleuchte), `ramp` + `rampLen`
(Verladerampe an der offenen Tür), `walkRoof` (Dach = Navigationsboden, Zugang selbst bauen), `worn` (Rost).
`MapBuilder.walkway(x0, z0, x1, z1, y, { rails })` baut einen Gitterrost-Laufsteg mit Geländer.
Hinweise: Rampen/Treppen auf eine höhere Fläche 1 m auf dieser enden lassen und ≤ 0.5 m Anstieg je Meter
(sonst reißt die Navigation ab); `occlude: false` für dünne Plattenaufsätze; Deko-Farbtöne hell wählen.

#### Umschlag-Requisiten (`src/logic/hubprops.ts`, Referenz: `de_umschlag`)

Generisch für Logistik-/Büro-/Kantinen-Szenen: `parcelVan` (Paket-Lieferwagen 5.6 × 2.1 × 2.7 m, Nase bei +X, Hecktüren, 4 Räder), `dockBay`
(Rolltor-Bucht an einer Fassade, Rückseite bei lokal z = 0, Tor halb offen mit Dunkelheit dahinter, Puffer, Warnleuchte, Nummernschild
aus `n`, `len`/`h`), `plant` (Topfpflanze; nur der Topf kollidiert, `h` = Gesamthöhe), `chairStack` (Stuhlstapel, `n`), `table`
(Kantinentisch mit Bänken, `len`), `bench` (Bank, Sitzhöhe 0.5 m), `counter` (Edelstahl-Arbeitstisch/Küchenzeile, `len`), `stove`
(Großküchenherd mit Haube), `gantryConveyor` (aufgeständerter Sortierförderer, Band auf `h` = 3 m, darunter frei begehbar, Stützen alle 4 m,
Pakete obendrauf, `len`), `gatehouse` (Pförtnerhaus/Ticket-Häuschen 4 × 3 m mit Fenster nach +Z), `console` (Leitstand-Pult mit Monitoren).
`dockRow(b, axis, wall, from, to, facing, …)` (in `src/maps/umschlag/common.ts`) setzt eine Reihe nummerierter Buchten entlang einer Fassade.

#### Obergeschosse auf Sockeln und dünne Fensterwände (Referenz: `de_umschlag`)

Zusätzlich zum Keller-Muster (Kühlhaus) lassen sich **Obergeschosse** als eigener `CellPlan` bauen (Fülltyp `.` = leer, Vorbild
`de_umschlag.ts`, Plan `O`): Räume stehen auf **massiven Sockeln** (Erdgeschoss-Gebäudezellen mit `h` = Unterkante des Obergeschosses, z. B.
4.0 m für Boden +4.4 m); die Obergeschoss-Zellen setzen `bottom: Boden − 0.4`, Wände sind Gebäudezellen mit `bottom`, Laufstege/Brücken
frei schwebende Plattenzellen (`floor` + `bottom`, ohne `roof`). Brücken über niedrige Anbauten stehen auf deren Dach (Sockelhöhe = `bottom`).
Durchgänge durch dicke Wände in der Höhe: Gebäudezelle mit `window: { sill: Obergeschoss-Boden, lintel: +3.2 }`. **Dünne Fensterwände**
(offene Scheibenöffnung mit 1 m Brüstung, 0.4 m dick) baut man besser mit `b.wallX/wallZ(…, openings)` als mit 2-m-Zellen — sonst verdeckt die
2 m tiefe Brüstung den Blick nach unten.

### Deko, Licht, Schilder, Markierungen

- `b.decor(kind, pos, rot, scale, tint)` – instanzierte Formen (Fässer, Rohre, Stapler, Server …).
- `b.light({ kind: 'lamp' | 'spot' | 'tube' | 'window', pos, color, intensity, range })` sowie
  `hallLamp`, `wallLamp`, `tubeLamp` (Leuchte + Licht). Alle Lichter werden **gebacken**; auf
  „hoch“ spiegeln bis zu vier echte Punktlichter die nächsten Lampen für Figuren/Waffen.
- `b.sign(text, pos, facing, w, h, { color, bg, sub })` – Callout-Schilder an Wänden (nicht in die
  Fassadenverkleidung setzen: ≥ 0.12 m vor die Gebäudekante).
- `b.decal({ kind: 'letter' | 'line' | 'stripes' | 'grid' | 'stain' | 'arrow', … })` – Bodenmarkierungen.
- `env` – Sonne (Richtung *zur* Sonne), Himmel, Umgebungslicht, Nebel.

### Spielinhalt

- `b.area(name, x0, z0, x1, z1, y0?, y1?)` – **Callouts** (deutsch, kleinster Bereich gewinnt).
- `b.site('A' | 'B', name, min, max, plant)` – Bombenspot als Box + Pflanzpunkt (Bots).
- `b.spawn(team, x, y, z, yaw)` / `spawnGrid(...)` – mind. 8 je Team.
- `b.buy(team, …)` – Kaufzonen (müssen die Spawns enthalten).
- `b.room(kind, min, max)`, `b.ambient(sound, pos, radius, volume)` – Akustik (`src/logic/acoustics.ts`).
- `b.botHint(h)` – **optionale Bot-Hinweise** (siehe „Bots“); Bots kommen auch ohne aus.

## Bots (taktische KI, kartenunabhängig)

Die Bots leiten alles aus der kompilierten Karte ab (`src/logic/botMap.ts`, einmal je Karte, ~20 ms):

- **Zonen** = Callout-Bereiche (`b.area`); ohne Callouts bildet die Analyse automatische Zonen
  (14-m-Raster × Höhenband). **Portale** = Durchgänge zwischen Zonen (je Öffnung eines).
- **Distanzfelder** von T- und CT-Spawn: wer ist wo zuerst? Daraus „umkämpfte Punkte“, Gefahr
  (Gehen statt Rennen) und die eigene Seite beim Halten.
- **Spots**: Zonen mit dem Pflanzpunkt bzw. ≥ 40 % Knoten in der Spot-Box; Eingänge = Portale hinein,
  getrennt nach Angriffs- (T-Routen) und Verteidigungsseite.
- **Routen**: mehrere verschiedene Wege je Team und Spot über den Portalgraphen (benutzte Zonen werden
  verteuert → lang/kurz/Mitte/Tunnel), nie durch den gegnerischen Spawn; mit Bereitstellungsraum vor
  dem Eingang und Kontrollpunkt.
- **Halte-Positionen**: Knoten mit Sicht auf einen Eingang, nicht auf der Anlaufseite, bewertet nach
  Deckung, Höhe, Entfernung, Ducken-Möglichkeit und Angriffsfläche zu anderen Eingängen.

Damit Bots gut spielen, sollte eine Karte: Callouts für alle Bereiche haben (sonst automatische Zonen),
je Spot ≥ 2 Eingänge mit Deckung im Spot, und keine Sichtlinie aus einem Gang direkt in einen Spawn.
Der Validator (`src/maps/maps.test.ts`) prüft je Karte: T-Routen zu jedem Spot, CT-Halte-Positionen an
jedem Angriffseingang, gültige Hinweise.

**Bot-Hinweise** (`MapData.botHints`, `b.botHint(...)`) — nur Aufwertung, nie Pflicht:

| Art | Felder | Wirkung |
|---|---|---|
| `hold` | `pos`, `team?`, `site?` | Halte-Position (+4 Punkte, wenn sie die Sichtprüfung besteht) |
| `sniper` | `pos`, `team?`, `site?` | wie `hold`, für Scharfschützen +6 (lange Sichtlinie) |
| `plant` | `pos`, `site` | bevorzugter Pflanzplatz (muss in der Spot-Box liegen) |
| `smoke` | `from`, `target`, `team`, `site?` | bewährter Rauch beim Ausführen (Ziel; `from` = Wurfposition, der Validator prüft den Wurf mit der Granatenphysik) |

Balance-Erfahrung (de_kuehlhaus, Bot-Simulation): `plant`-Hinweise am eigenen Rand eines Spots (nahe den T-Zugängen) verbessern die T-Chancen deutlich, ein weiterer T-Zugang
zum Spot ebenso; Deckung mitten im Laufweg der T (Kisten direkt vor einer Tür) schadet eher — Deckung an die Seite oder hinter die Tür stellen. Lange gerade Gänge
(> 25 m ohne Versatz) und Durchblicke durch Türen/Räume (Türen fluchtend) geben den CT die erste Salve; Türen versetzen.

Was die Bots von einer Karte erwarten (M6.3, gilt für beide Teams):
- **Halten mit nur einem Eingang im Blick:** Wer still steht und schon auf den Eingang zielt, gewinnt das erste Duell (Vorzielen). CT-Halte-Positionen mit
  Sicht auf einen *weiteren* Eingang werden stark abgewertet (`BOTMAP.exposedPenalty`) — ein Spot braucht daher je Eingang Deckung, von der aus man nur diesen Eingang sieht.
- **Retake-Ecke vor jedem Spot-Eingang:** Die CT sammeln sich 4–14 m vor dem Eingang an einer Stelle *ohne* Sicht in den Spot (hinter einer Ecke, `retakeStaging`); fehlt so eine
  Ecke (lange gerade Gänge), stehen die Sammelnden im Schussfeld der T, die die Bombe bewachen.
- **Wege je Spot zählen mehr als Sichtachsen:** Für die Balance entscheidend sind die **Zahl der T-Wege** je Spot (ein
  Nebenweg, den die CT nicht mit abdecken können, kostet ≈ 15 Punkte CT-Siegquote — als Einbahn/Absatz sperren und den CT
  als Rotation lassen), die **Lage des CT-Spawns** (nahe der Rampe/den Spots) und **Pflanzpunkte**, die nicht beidseitig
  von Deckung (z. B. Schrankreihen) eingerahmt sind. Lange Sichtachsen (> 40 m) sind gegenseitig: Sie zu brechen hilft nur,
  wenn eine Seite sie einseitig nutzen kann (erhöhte Position ohne Gegenblick); in de_speicherstadt machte das Brechen
  der Achsen die T stärker (Messbefund Runde 2, `IMPLEMENTIERUNGSPLAN.md`). Messen: Kill-Positionen/K:D je Halteplatz
  aus der Simulation (`bun scripts/bot-sim.ts <id> 20 --deaths`) statt nach Augenmaß.
- **Balance-Wächter:** Jede Karte ruft in `src/maps/<id>.test.ts` `balanceGuard('<id>')` auf (`src/maps/balanceGuard.ts`: 5 Seeds × 20 Runden, T 30–70 %, Plants auf beiden
  Spots, keine Wand-/Fallfehler, Festsitzen ≤ 6 s). Für Aussagen zur Balance ≥ 2 × 24 Seeds rechnen (Streuung ±4–5 Punkte je Block).

Werkzeug: `bun scripts/bot-sim.ts <karten-id> [runden] [je-team] [skill] [seed] --rounds` spielt Bot-gegen-Bot-
Runden im Zeitraffer (Statistik: Siege, Pflanzrate, Entschärfungen, Eingänge, Festsitzen, Wand-/Fallfehler);
`--trace=<runde>` zeigt alle 4 s Auftrag und Zustand je Bot. Im Spiel: `__bots()`, `__botPlan()`.

## Compiler und Laufzeit-API

`compileMap(data)` → `{ collider, nav, sites, spawns, buyZones, zones, acoustics }`.
`World` (`src/game/World.ts`) bietet:

| API | Zweck |
|---|---|
| `world.collider` | Kollision (Quader + Rampen im 4-m-Raster): `groundHeight`, `resolve`, `raycast`, `clear`, `surfaceAt` |
| `world.findPath(from, to, { avoid })` | A* + Glättung → `{ nodes, points, length }` |
| `world.areaAt(pos)` / `world.nav.areas` | Callout an einer Position; Bereichsgraph (Zentrum, Knotenzahl, Nachbarn) |
| `world.nav` | Knoten (x/y/z, Flags `cover`, `choke`, `high`, `crouch`), Kanten (`walk`, `drop`) |
| `world.siteAt(p)`, `world.inBuyZone(team, p)` | Spielregeln |
| `world.surfaceAt(x, y, z)`, `world.acoustics` | Audio-Schicht |

Navigation: Knoten im 1-m-Raster auf allen begehbaren Oberflächen (alle Höhen), Kanten nach den
Bewegungsregeln (Stufen, Rampen, Wände, Kopffreiheit), Herunterspringen als Einbahnkante.

## Gestaltungsregeln (CS-Dramaturgie)

1. **Laufzeiten (Laufen mit dem Messer, 6.2 m/s):** T-Spawn → Spot **18–25 s**, CT-Spawn → Spot **6–15 s** und
   mindestens 5 s schneller als T. Mitte für beide Teams ähnlich schnell (≤ 5 s Unterschied).
2. **Drei Wege** je Seite (lang, kurz/Verbinder, Mitte) mit Engstellen; jeder Spot hat **2–3 Eingänge**.
3. Keine großen leeren Flächen: Deckung alle ~10–15 m (Kisten, Paletten, Container, Stützen).
4. **Vertikalität:** mehrere begehbare Ebenen (Laufstege, Emporen, Rampen, Treppen, Gruben,
   Tunnel), erhöhte Positionen mit Gegenspiel.
5. Durchgänge **≥ 2 m** breit (Navigationsraster 1 m), Kopffreiheit ≥ 2.2 m, Rampen ≤ 30° bevorzugt.
6. Lange Sichtlinien (> 50 m) nur gezielt (Lang A, Mitte) und mit Deckung entlang des Weges. Lange gekrümmte Gassen (Banane) brauchen **versetzte Abschnitte**
   (Mittelachse je ≥ 6 m verschoben, sonst bleibt eine Diagonale frei) und Schikanen; Sichtachsen zwischen den Spawns mit einem Gebäude in der Mitte brechen
   (Messung: Knotenpaare mit `collider.clear` wie in `de_speicherstadt.test.ts`).
7. Thema erzählen: Requisiten, Schilder mit Callouts, Licht (Hallen warm, Serverräume kühl).

## Neue Karte anlegen – Kurzanleitung

1. `src/maps/de_meinekarte.ts` mit einer `build…(): MapData`-Funktion anlegen (Vorlage:
   `de_lagerstaub.ts`): `MapBuilder` + `CellPlan` für den Grundriss, dann Rampen/Treppen,
   Türen, Requisiten, Licht, Schilder, Callouts, Spots, Spawns, Kaufzonen, Akustik.
2. In `src/maps/index.ts` in `MAPS` eintragen (ID beginnt mit `de_`).
3. Iterieren: `bun run overview de_meinekarte /tmp/karte.png 5 --areas` zeigt Draufsicht
   (Höhen farbig, Rampenpfeile, Spots, Spawns, Callouts), Knotenzahl und Laufzeiten.
4. Validator: `bun run test src/maps` (Spawns auf Boden/frei/in Kaufzone, Spots begehbar,
   Erreichbarkeit, keine Fallen, Laufzeiten, Callouts, Vertikalität, Determinismus, Bot-Routen/-Hinweise).
   Bot-Probe: `bun scripts/bot-sim.ts de_meinekarte 20` (beide Teams gewinnen, es wird gepflanzt, niemand sitzt fest); Balance-Wächter
   `src/maps/de_meinekarte.test.ts` mit `balanceGuard('de_meinekarte')` anlegen.
5. Sichtprüfung im Spiel: Dev-Server + `scripts/screenshot.mjs`; Debug-Hooks `__teleport(x, z, yaw, y?)`,
   `__area()`, `__map()`, `__bots()` (inkl. Callout je Bot).

## Leistung

- Geometrie wird je Material und 32/40-m-Kachel zusammengeführt (wenige Draw-Calls,
  Frustum-Culling je Kachel); verdeckte Teilflächen entfallen.
- Licht wird beim Laden gebacken (Voxel-Schatten für Sonne/Lampen, Himmelsverdeckung, AO):
  „hoch“ ≈ 1.25-m-Unterteilung, „niedrig“ ≈ 2.5 m. Materialien sind unbeleuchtet → sehr günstig.
- **Bodenhöhen im Freien auf das 0.5-m-Voxelraster legen:** Das Backen nutzt 0.5-m-Voxel; liegt die Oberkante einer Platte knapp über einer
  Voxelgrenze (z. B. 5.6 m → Voxel 5.5–6.0 ist „belegt“), verschattet sich die Fläche selbst gegen die Sonne und wird dunkel. Gut: Vielfache von
  0.5 m (2.0, 5.5) oder Höhen mit Rest ≥ 0.4 (4.4, 4.9); schlecht: Rest 0.05–0.35 (5.6, 3.2) bei Außenflächen.
- Richtwert Lagerstaub: ~1600 Brushes, ~140 k Vertices (hoch) / ~65 k (niedrig), ~11 k Navigationsknoten,
  Kompilieren + Backen ≈ 1–3 s im Browser.
