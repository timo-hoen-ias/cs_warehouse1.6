# Projektregeln — cs_warehouse1.6

CS-1.6-inspirierter Bomben-Modus (de_-Maps) in handgebauten Lager-/Logistik-Karten mit mehreren Ebenen.
Stack: Needle Engine 5.x (Vite + TypeScript, kein React), Bun 1.4, Vitest.

## Testpflicht (verpflichtend, oberste Regel)

- **Jede neue oder geänderte Logik bekommt Tests** (Vitest), die **vor** Abschluss der Aufgabe
  grün sein müssen (`bun run test`). Das gilt für:
  - Pure Logic (`src/logic/**`): Kollision/Rampen, Navigation, Kartenbaukasten/Compiler, Licht-Backen, Economy,
    Round-State-Machine, Bomben-Timer, Waffen-Daten/Schadens-/Recoil-Mathematik, Bot-Logik.
  - Karten (`src/maps/**`): jede Karte muss den Validator `src/maps/maps.test.ts` bestehen.
  - Jede weitere nicht-triviale Funktion (Verzweigung, Schleife, Parser, Geld-/Sicherheitslogik).
- Ausnahme: reine Trivialitäten (Einzeiler ohne Verzweigung) brauchen keinen Test.
- Tests liegen als `*.test.ts` **neben** der Quelle (z. B. `layout.test.ts` neben `layout.ts`).
- **Workflow:** Test zuerst schreiben bzw. mit schreiben — nicht nachschieben. Rot → Grün → Refactor.
- Vor Abschluss eines Meilensteins laufen: `bun run test`, `bunx tsc --noEmit`, `bun run build`,
  bei Spiel-/Netzänderungen zusätzlich `BROWSER=<chromium> bun scripts/smoke.mjs` und `bun scripts/net-test.mjs`
  (Dev-Server muss laufen; Tests nutzen `?quality=low`).
- Fehlerhafte/rote Tests blockieren den Abschluss — kein „mache ich später".

## Best Practices

- **Stack:** Needle Engine pur (`@needle-tools/engine`, drei-Fork als `three`-Alias). Kein React/R3F.
- **Deutsch** für Nutzertexte, UI-Beschriftungen und Kommentare; **englische** Bezeichner.
- **Pure Logic trennen:** Business-/Rechenlogik in `src/logic/` framework-frei halten (kein three-/
  Needle-Import), damit sie leicht testbar und portierbar bleibt. three/Needle nur in `src/**`-Rendertellen
  (level/player/weapons/multi/ui).
- Rechen- und Spiel-Daten (Waffen, Preise, Timer, Balancen) als **Datenmodule** (Tabellen/Konstanten),
  nicht hart in Komponenten verdrahten.
- **Keine neuen Abhängigkeiten** für Dinge, die wenige Zeilen Standardlösung sind (ponytail-Prinzip).
- Karten sind **TypeScript-Module** (`src/maps/<id>.ts`, Registry `src/maps/index.ts`), gebaut mit `src/logic/mapkit.ts`,
  `mapplan.ts` (Grundriss-Raster + Fassaden) und `mapprops.ts`; der Compiler (`mapcompile.ts`) ist deterministisch → kein
  Bake-Schritt, alle Clients bauen aus der Karten-ID dieselbe Welt. Format, Gestaltungsregeln (Laufzeiten, Wege) und
  Anleitung: `docs/KARTENFORMAT.md`. Draufsicht/Laufzeiten: `bun run overview <id>`.
- Bewegung/Einheiten: `src/logic/units.ts` (1 CS-Einheit = 0.0248 m → Messer 250 u/s = 6.2 m/s; alle Kartenlaufzeiten gelten für `PLAYER.runSpeed`). Spielerbewegung = `stepBody` (`move.ts`, GoldSrc-Reibung/Beschleunigung), Tempo je Waffe aus `weapons.json` (`maxSpeed`, `weaponSpeed()`), Sturzschaden `fall.ts`, Streuung nach echtem Tempo `fireSpread` (`fire.ts`); `stepPlayer` bleibt die einfache Bewegung für Bots. Dynamisches Licht auf der Level-Geometrie: Pool in `logic/dynlight.ts`, Shader-Patch `level/DynamicLights.ts` (Fx/Granaten füttern es).
- Kollision/Strahlen nur über den `Collider` (`src/logic/collision.ts`, Raster + Rampen), Navigation über `src/logic/nav.ts`
  (`World.findPath`, `World.areaAt`); keine Schleifen über alle Brushes pro Frame. Bot-Wege halten Wandabstand (`NAV.wallCost`, `NavGraph.rim`,
  Glättung mit `NAV.smoothRadius`); Laufzeit-Messungen der Karten (`routeLength`) nutzen den kürzesten Knotenweg (`hugWalls`).
- Namensschilder über Spielfiguren nur für lebende Kameraden (`logic/nameplate.ts`) — sie werden ohne Tiefentest gezeichnet.
- Waffen-Modelle sind **prozedural** (`src/weapons/models/`, eine Builder-Funktion je Waffe, Katalog-Test `catalog.test.ts`); Zuordnung in `weapons.ts` (`visual.model`). Animationen als pure Clips in `src/logic/viewAnim.ts`. **Geometrie je Modell** (Länge, Mündung, Auswurf, Schuss-/Stützhand, Kimme/Korn, Haltung) steht in `src/logic/weaponGeom.ts` und ist die einzige Quelle für Viewmodel-Anker, Soldaten-Haltung (`entities/soldierHold.ts`), Drops und Effekte — bei Modelländerungen dort nachziehen, `catalog.test.ts` prüft die Modelle dagegen; Sichtprüfung: `weapon-lab.html` + `scripts/weapon-sheet.mjs`. Die Quaternius-OBJs unter `assets/weapons/` sind nur noch Referenz. Neue Assets in `assets/` ablegen (Needle kopiert `assets/` → `dist/assets/`).
- Netzwerk: Host authoritativ (Dienstältester im Raum), Clients senden Posen/Schüsse/Käufe, Host sendet
  Snapshots + Ereignisse (`src/logic/net.ts`, `src/game/MatchDriver.ts`). Neue Spielregeln immer als pure
  Funktion in `src/logic/` + Test, der Driver ruft sie nur auf. Eingaben fremder Clients auf dem Host prüfen.
- **Bots** sind pure Logik (`src/logic/bot*.ts`, Einstieg `BotSystem`), kartenunabhängig aus Navigation/Callouts/Spots
  abgeleitet; Änderungen am Bot-Verhalten mit `bun scripts/bot-sim.ts` (Headless-Statistik) prüfen, der Simulationstest
  `botSim.test.ts` muss grün bleiben.
- Spielzeit nie direkt aus `context.time.deltaTime` (auf 0.1 s gedeckelt) für Timer verwenden, sondern über den
  Driver (eigene Uhr, Teilschritte).
- Vor größeren Refactors/Features `IMPLEMENTIERUNGSPLAN.md` lesen und nach Abschluss aktualisieren.

## Karten-Pipeline (seit M4)

Die frühere DB-Pipeline (`query.ts`, `layout.ts`, `transform.ts`, `scripts/bake-map.ts`, `levels/*.json`) wurde
entfernt; Karten werden von Hand entworfen. Details: `docs/KARTENFORMAT.md`, `IMPLEMENTIERUNGSPLAN.md` (M4).
