# CS Warehouse 1.6

Ein Ego-Shooter im Browser: ein Counter-Strike-1.6-inspirierter Bomben-Modus (Terroristen gegen Counter-Terroristen), der in Lagerhallen und Logistikzentren spielt. Die Karten (`de_`-Maps) sind von Hand gebaut — mit Rampen, Treppen, Laufstegen, Emporen, Gruben und Tunneln auf mehreren Ebenen, gebackenem Licht und einem 3D-Navigationsgraphen für die Bots. Gebaut mit Needle Engine 5, Vite und TypeScript; Bun dient als Laufzeit und Paketmanager. Man kann offline gegen Bots spielen oder online mit Freunden per Raumcode.

## Schnellstart

Voraussetzung: [Bun](https://bun.sh) (getestet mit 1.4).

```bash
bun install          # Abhängigkeiten installieren
bun run dev          # Dev-Server auf http://localhost:3000
bun run build        # statische Seite nach dist/
```

Der Build verwendet `base: "./"` und läuft daher auch unter einem Unterpfad (z. B. GitHub Pages).

## Spielen

Beim Start erscheint das **Hauptmenü** (animierte Lagerhalle im Hintergrund, Menümusik — Browser starten Ton erst nach dem ersten Klick, Hinweis „Klicken für Ton“; Lautsprecher-Knopf oben rechts oder Taste `M` schaltet stumm). Bedienung mit Maus, Pfeiltasten/Enter/Esc oder Gamepad (Steuerkreuz, A, B).

- **Einzelspieler:** Karte wählen (Karten-Kacheln mit Vorschau), Team (automatisch/T/CT), Teamgröße (1 gegen 1 bis 8 gegen 8, Rest Bots) und Bot-Schwierigkeit (Leicht bis Experte) einstellen, „Spiel starten“. „Schnellstart“ auf der Startseite übernimmt die letzten Einstellungen.
- **Server erstellen:** Servername, Karte, max. Spieler (2–16 Menschen), Auffüllen mit Bots, Bot-Stärke, optionales Passwort, „Im Serverbrowser anzeigen“, „Serverlobby“. Du bist Host; das Spiel läuft in deinem Browser über das öffentliche Needle-Netzwerk-Backend (oder deinen Relay, siehe unten).
- **Serverlobby:** Bis du „Spiel starten“ drückst, läuft ein Aufwärmen: Spielerliste je Team mit Teamwechsel, Chat, Raumcode und Knopf „Einladungslink“ (kopiert z. B. `http://localhost:3000/?room=ABCDE&map=de_lagerstaub`). „Aufwärmen (herumlaufen)“ blendet die Lobby aus, `Esc` holt sie zurück.
- **Mehrspieler (Serverbrowser):** listet alle offenen Server (Name, Karte, Spieler + Bots, Latenz, Status, Schloss = Passwort). Filter „Nicht voll“, „Nicht leer“, „Ohne Passwort“, Suche, Sortierung per Spaltenkopf, „Aktualisieren“ (`F5`). Doppelklick oder Enter tritt bei; „Per Code“ tritt einem Raum direkt bei. Ein Einladungslink öffnet den Browser mit vorbelegtem Raum.
  - *Wie die Erkennung funktioniert:* Needle `context.connection` kann nur einen Raum gleichzeitig. Jeder Client öffnet deshalb eine zweite, schlanke WebSocket-Verbindung zum selben Backend und betritt den gemeinsamen Raum `csw16-lobby`. Der Host meldet dort alle 3 s einen Heartbeat (Name, Karte, Spieler, Phase, Passwort ja/nein, Version); der Browser fragt beim Öffnen aktiv nach (`csw16-q`, mit Zeitstempel → Latenz) und verwirft Einträge nach 10 s ohne Meldung. Funktioniert mit dem Needle-Backend und dem eigenen Relay gleichermaßen.
  - Der Host prüft Passwort (nur als Prüfsumme übertragen), Spielerlimit und Spielversion; abgelehnte Spieler landen mit Meldung wieder im Menü. Verlässt der Host das Spiel, übernimmt der Dienstälteste (Host-Migration, inkl. Server-Konfiguration).
- **LAN / Self-Hosting mit Relay:** Ohne Internet oder mit eigenem Server den mitgelieferten Relay starten:

  ```bash
  bun scripts/relay-server.ts [port]      # Standard-Port 9100, WebSocket-Pfad /socket
  # oder: bun run relay
  ```

  Im Menü unter „Erweitert: eigener Server“ die Adresse eintragen oder die Seite mit `?server=ws://<host>:9100/socket` öffnen (hinter TLS `wss://`). `GET /status` liefert die aktiven Räume als JSON.
- **Automatisierung/Tests:** `?auto=1&fill=4` startet ohne Menü offline; mit `&room=CODE` tritt man bei, `&host=1&sname=Name&pw=…&max=…&lobby=1` hostet. `?menu=browser` öffnet direkt den Serverbrowser.

### HUD

CS-1.6-Aufteilung mit modernem Feinschliff, skaliert automatisch von 1280×720 bis 4K/Ultrawide (Einstellung „HUD-Größe“ zusätzlich): Leben/Rüstung/Geld unten links (mit Geld-Änderung, Kaufzone-, C4- und Kit-Symbol), Waffe/Munition und Inventar unten rechts, Spielstand mit Spieler-Avataren (lebend/tot) und Zeit oben Mitte (Bombe gelegt = rote Uhr), Radar mit A/B-Spots oben links, Kill-Feed mit Waffensilhouetten und Kopfschuss-Symbol oben rechts, dynamisches Fadenkreuz (Farbe/Stil/Länge/Abstand/Stärke einstellbar), Trefferanzeige, Schadensrichtung, Rundenende-Banner („Terroristen gewinnen“ + Grund), Todesinfo („Getötet von X mit AWP (Kopfschuss)“, Rest-HP des Gegners), Zuschauerleiste, Fortschrittsbalken beim Legen/Entschärfen. Kaufmenü (`B`) mit CS-1.6-Tasten 1–8 und Maus, Waffenkarten mit Silhouette, Preis, Werten und Zustand (zu teuer, im Besitz, nur CT/T). Scoreboard (`Tab`) mit K/D, Geld der Teamkameraden, Ping, Bot-/Host-/C4-/Kit-Markierungen.

### Musik

Menümusik: Derek „JoJo“ Stegall, Tracks aus dem Red-Eclipse-Soundpaket (<https://github.com/redeclipse/sounds>), lizenziert unter CC BY-SA; Lautheit normalisiert und neu kodiert. Details: `assets/audio/music/CREDITS.md`.

## Steuerung

| Taste | Aktion |
|---|---|
| W A S D | Bewegen |
| Shift | Leise gehen (Schleichen, 52 % Tempo, keine Schritte zu hören) |
| Strg | Ducken (34 % Tempo); in der Luft Beine anziehen = Hocksprung |
| Leertaste | Springen (für den nächsten Sprung neu drücken) |
| Linke Maustaste | Schießen |
| Rechte Maustaste | Zielfernrohr (AWP, Scout, G3SG1, SG 550, AUG, SG 552) / schwerer Messerstich / kurzer Granatenwurf |
| R | Nachladen |
| 1–5 | Waffenslot wählen |
| Mausrad / Q | Waffe wechseln |
| G | Waffe oder C4 fallen lassen (Drüberlaufen hebt auf) |
| B | Kaufmenü |
| E | Bombe legen / entschärfen |
| Tab | Punktetafel |
| Y / U | Chat an alle / Teamchat |
| Z / X / C | Funkbefehle (Ziffer wählt) |
| M | Team-Menü |
| O | Einstellungen |
| F | Waffe inspizieren |
| Esc | Maus freigeben (in der Serverlobby: Lobby zeigen) |

## Features

- Bombenmodus Terroristen gegen Counter-Terroristen mit Einfrierphase (6 s), Rundenzeit 1:55, Bombenzeit 40 s; wer zuerst 16 Runden gewinnt, gewinnt das Match
- Wirtschaft nach CS-Vorbild: Startgeld 800 $, Rundensieg 3250 $, Verlierbonus von 1400 $ bis 3400 $, 300 $ pro Kill
- Komplettes CS-1.6-Arsenal: Pistolen, Schrotflinten, MPs, Sturmgewehre, Scharfschützengewehre, M249, Granaten (HE, Blend, Rauch), Kevlar, Helm und Entschärfer-Kit
- Bots in beiden Teams: kaufen ein, legen die Bombe, entschärfen und jagen Gegner
- Waffengefühl nach CS: feste, lernbare Spray-Muster bei Automatikwaffen (gegenziehen!), Noscope-Streuung, Zielfernrohr mit Auto-Rezoom, Repetierzeiten, Rüstungsdurchschlag, Distanz-Schadensabfall, Kopfschüsse
- Waffen und C4 fallen beim Tod zu Boden und lassen sich aufheben; Kaufen nur in der Kaufzone am Spawn
- Zuschauer-Kamera nach dem Tod (Klick wechselt den Spieler), Schrittgeräusche, schneller werdendes Bomben-Piepen
- Große, handgebaute Karten (~160 × 160 m) mit echter Vertikalität: Rampen, Treppen, Laufstege, Emporen, Laderampen, Gruben, Unter- und Obertunnel; Kisten und Paletten zum Draufspringen
- Gebackene Beleuchtung (Sonne mit Schatten, Himmel, Hallenleuchten, Lichtkegel, Ambient Occlusion) bei minimalen Laufzeitkosten; Himmel mit Sonne und Industrie-Skyline
- Bots navigieren in 3D (A* über alle Ebenen, Callout-Bereiche), legen und entschärfen die Bombe
- Einstellungen (O oder im Hauptmenü): Mausempfindlichkeit, Y-Invertierung, Sichtfeld, Lautstärke mit Kanälen (Effekte/Umgebung/Oberfläche), Menümusik, Fadenkreuz (Farbe/Stil/Länge/Abstand/Stärke/dynamisch, mit Vorschau), HUD-Größe, Kopfbewegung, FPS-Anzeige
- Host-autoritativer Mehrspieler mit Host-Migration; Raumcodes, Teilen-Link, optionaler Relay-Server
- Grafikstufe für schwache Rechner: `?quality=low` (gröberes Licht-Raster, keine Lichtkegel, reduzierte Auflösung)
- Karten sind Code-Module: alle Clients bauen aus der Karten-ID des Hosts dieselbe Welt (kein Bake-Schritt)

## Karten

| Karte | Beschreibung |
|---|---|
| `de_lagerstaub` | **Lagerstaub** — Logistikzentrum im Abendlicht nach klassischem Grundriss: T-Hof (Speditionshof), Außen Lang → Hallentor → Lang A mit Grube und Stapler („Auto“), A-Rampe auf die Laderampe mit dem „Serverschrank A“, Kurz A über den Gitterrost-Steg aus der Mitte (Xbox-Kiste), Mitteltür (Brandschutztor) zum CT-Bereich, Außen Tunnel → Ober-/Untertunnel (Versorgungstunnel) → Serverraum B mit Hinterer Plattform, B-Empore, B-Fenster und B-Tür. |

Laufzeiten (Laufen mit dem Messer, 6.2 m/s): T → A ≈ 23 s, T → B ≈ 24 s, CT → A ≈ 8 s, CT → B ≈ 12.5 s, Mitte für beide ≈ 10 s.
Das Kartenformat und eine Anleitung für neue Karten stehen in [`docs/KARTENFORMAT.md`](docs/KARTENFORMAT.md).
Eine Draufsicht (PNG) samt Laufzeiten erzeugt `bun run overview [karten-id] [datei.png] [px-pro-meter] [--areas]`.

## Entwicklung

```bash
bun run test            # Vitest (Unit-Tests der Logik)
bunx tsc --noEmit       # Typecheck
bun run build           # Produktions-Build
```

Es gilt die Testpflicht aus `AGENTS.md`: neue oder geänderte Logik bekommt Vitest-Tests (`*.test.ts` neben der Quelle), die vor Abschluss grün sein müssen.

**Smoke-Test** (headless Chromium/Edge über CDP; der Dev-Server muss laufen):

```bash
bun run dev                                          # in einem Terminal
BROWSER=/pfad/zu/chromium bun scripts/smoke.mjs      # in einem zweiten
```

**Zwei-Client-Netzwerktest** (startet einen eigenen Relay, Dev-Server muss laufen):

```bash
BROWSER=/pfad/zu/chromium bun scripts/net-test.mjs
```

**Serverbrowser-/Lobby-Test** (zwei Browser: Erkennung, Passwort-Kick, Beitritt, Lobby-Start; Dev-Server muss laufen):

```bash
BROWSER=/pfad/zu/chromium bun scripts/lobby-test.mjs      # optional SHOT_DIR=… für Screenshots
```

**Karten-Übersicht und Validator:**

```bash
bun run overview de_lagerstaub karte.png 5 --areas   # Draufsicht + Laufzeiten + Bereichsgraph
bun run test src/maps                                # Karten-Validator (Spawns, Spots, Wege, Laufzeiten …)
```

### Projektstruktur

| Pfad | Inhalt |
|---|---|
| `src/logic/` | Reine, framework-freie und getestete Logik (Kollision mit Rampen, Navigation, Kartenbaukasten/Compiler, Licht-Backen, Economy, Runden, Bombe, Waffen, Schaden, Bots, Netzwerk-Nachrichten) und Datentabellen wie `weapons.json` |
| `src/maps/` | Handgebaute Karten (TypeScript-Module) + Registry |
| `src/game/` | Spielwelt und Match-Ablauf (`World.ts`, `MatchDriver.ts`) |
| `src/player/`, `src/entities/` | Spieler-Steuerung und Soldaten-Figuren |
| `src/multi/` | Netzwerk-Transport (Needle-Backend oder eigener Relay), Server-Erkennung (`Discovery.ts`) |
| `src/ui/` | Hauptmenü (`MainMenu`, Hintergrund `MenuBackdrop`, Musik `MenuMusic`), Serverlobby (`LobbyOverlay`), HUD (`Hud` + `hud.css`), Einstellungen |
| `src/weapons/` | Schießen, Granaten, Viewmodel, Effekte; `models/` = prozedurale Waffen + Arme |
| `src/level/` | Darstellung der Karten (Geometrie mit gebackenem Licht, Deko-Instanzen, Himmel, Texturen, Licht für Figuren) |
| `src/audio/` | Soundeffekte |
| `docs/` | Kartenformat und Anleitung für neue Karten |
| `assets/` | Laufzeit-Assets (Menümusik, Klänge, Referenzmodelle), werden nach `dist/assets/` kopiert |
| `scripts/` | Relay-Server, Karten-Übersicht (PNG), Smoke-, Screenshot-, Netzwerk- und Lobbytest |

Weitere Hintergründe und der Stand der Umsetzung stehen in `IMPLEMENTIERUNGSPLAN.md`.

## Deployment

**GitHub Pages:** Der Workflow `.github/workflows/pages.yml` läuft bei jedem Push auf `main` (und manuell über „Run workflow“). Er führt `bun install --frozen-lockfile`, Tests, Typecheck und Build aus und veröffentlicht `dist/`. Der Repo-Eigentümer muss einmalig unter *Settings → Pages* als Quelle **GitHub Actions** auswählen.

Hinweis: Wird das Spiel über https ausgeliefert, braucht ein eigener Relay `wss://` (siehe unten). Der Standardweg über das Needle-Backend funktioniert ohne eigenen Server.

**Relay per Docker:**

```bash
docker build -f Dockerfile.relay -t csw-relay .
docker run -p 9100:9100 csw-relay
```

Für `wss://` muss ein TLS-terminierender Reverse-Proxy (z. B. Caddy oder nginx) davorgeschaltet werden.

## Lizenz und Hinweise

- **Needle Engine:** Die kostenlose Variante blendet ein „made with Needle“-Label ein und ist für nicht-kommerzielle Nutzung gedacht. Für kommerzielle oder öffentliche Nutzung kann eine Needle-Lizenz nötig sein: <https://needle.tools/pricing>.
- **Waffenmodelle:** prozedural im Code (`src/weapons/models/`). Das Quaternius „Ultimate Gun Pack“ (CC0) unter `assets/weapons/` liegt nur noch als Referenz bei.
- **Sounds (Credits):** bearbeitete Aufnahmen aus dem [Red-Eclipse-Soundpaket](https://github.com/redeclipse/sounds)
  (Red Eclipse Team, Quinton „quin“ Reeves, Alex „blackshoe“ Anguix, Q009, Therac-25, fresco, WIM, Dob „dobroide“ Roide,
  bart) unter CC-BY-SA 4.0 / CC-BY-SA 3.0 / CC-BY 3.0 / CC0 sowie eigene Synthese; die bearbeiteten Dateien in
  `assets/audio/` stehen unter CC-BY-SA 4.0. Vollständige Liste (Datei, Urheber, Lizenz, Änderungen):
  [`assets/audio/CREDITS.md`](assets/audio/CREDITS.md). Keine Valve-/Counter-Strike-Assets.
- Dieses Projekt ist von Counter-Strike 1.6 inspiriert, aber ein eigenständiges Fan-Projekt ohne Bezug zu Valve.
