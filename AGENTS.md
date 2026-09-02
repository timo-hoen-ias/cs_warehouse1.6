# Projektregeln — cs_warehouse1.6

CS-1.6-inspirierter Bomben-Modus (de_-Maps) in einem aus der MSSQL-DB gelesenen Lager.
Stack: Needle Engine 5.x (Vite + TypeScript, kein React), Bun 1.4, Vitest.

## Testpflicht (verpflichtend, oberste Regel)

- **Jede neue oder geänderte Logik bekommt Tests** (Vitest), die **vor** Abschluss der Aufgabe
  grün sein müssen (`bun run test`). Das gilt für:
  - Pure Logic (`src/logic/**`): Layout, Query-Gruppierung, Economy, Round-State-Machine, Bomben-Timer,
    Waffen-Daten/Schadens-/Recoil-Mathematik, Wegpunkt-/Bot-Logik.
  - Jede weitere nicht-triviale Funktion (Verzweigung, Schleife, Parser, Geld-/Sicherheitslogik).
- Ausnahme: reine Trivialitäten (Einzeiler ohne Verzweigung) brauchen keinen Test.
- Tests liegen als `*.test.ts` **neben** der Quelle (z. B. `layout.test.ts` neben `layout.ts`).
- **Workflow:** Test zuerst schreiben bzw. mit schreiben — nicht nachschieben. Rot → Grün → Refactor.
- Vor Abschluss eines Meilensteins laufen: `bun run test`, `bunx tsc --noEmit`, `bun run build`.
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
- Karten sind DB-abhängig → Bake-Ergebnisse (`levels/*.json`) committen, damit alle Clients identisch spielen.
- Waffen-Modelle (Quaternius, CC0) liegen unter `assets/weapons/` (`.blend` editierbar + `.obj`/`.mtl` zur Laufzeit). Zuordnung in `weapons.ts` (`visual`). Neue Assets in `assets/` ablegen (Needle kopiert `assets/` → `dist/assets/`).
- Netzwerk: Host authoritativ, Clients senden Input, Snapshots vom Host. Logik dafür auf dem Host einkapseln.
- Vor größeren Refactors/Features `IMPLEMENTIERUNGSPLAN.md` lesen und nach Abschluss aktualisieren.

## Wiederverwendung aus ias.warehouse-map (Framework-frei)

`query.ts`, `layout.ts`, `transform.ts` (+ `phys.ts`, `boxes.ts`-Logik) werden 1:1 portiert;
R3F-Komponenten (`Rack.tsx`, `Cell.tsx`, …) werden **nicht** übernommen, sondern in Needle neu gebaut.
Details: `UMSETZUNGSPLAN.md` / `IMPLEMENTIERUNGSPLAN.md`.
