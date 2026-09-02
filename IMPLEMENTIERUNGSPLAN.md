# cs_warehouse1.6 — Implementierungsplan

> **Diese Datei ist immer aktuell zu halten.** Nach jedem Milestone, jeder Planänderung und jedem
> größeren Refactor: Häkchen setzen, Entscheidungen ergänzen, Erkenntnisse festhalten.

> **Regel (aus AGENTS.md):** Jede neue oder geänderte Logik bekommt Tests (Vitest), die vor
> Abschluss grün sein müssen. Vor Abschluss jedes Milestones: `bun run test`, `tsc --noEmit`,
> `vite build`.

## Ziel

CS-1.6-inspirierter Bomben-Modus („de_"-Maps) in einem **echten, aus der MSSQL-DB gelesenen
Lager**. Host-authoritativer Multiplayer (Listen-Server wie CS1.6) + Bots → Singleplayer und
Multiplayer spielbar. Maps entstehen per Bake-Script aus der DB und werden als editierbares JSON
abgelegt; ein späterer Map-Editor setzt auf demselben Format auf.

## Fixe Entscheidungen (Beschlüsse)

| # | Entscheidung |
|---|---|
| 1 | Rendering: **Needle Engine 5.x pur** (Vite + TS, `@needle-tools/engine`), **kein React/R3F**. |
| 2 | Runtime/Tooling: **Bun 1.4** (install/dev/build/test/Skripte). Node 22 als Fallback, falls ein Needle-Buildschritt unter Bun nicht läuft. |
| 3 | Repo: neues Repo `C:\git\cs_warehouse1.6`. Reine TS-Logik wird 1:1 aus `ias.warehouse-map` portiert; R3F-Render-Komponenten werden **nicht** übernommen. |
| 4 | Netzwerk: `SyncedRoom` (Transport) + Manual Networking (JSON). **Host authoritativ**, Clients senden Input, Host sendet Snapshots (~15–20 Hz). Bots laufen auf dem Host. |
| 5 | Spieler-Kollision: deterministische AABB-Physik (Vorbild `WalkControls`/`phys.ts` aus warehouse-map). **Rapier nur für Granaten.** |
| 6 | Schüsse = **Hitscan-Raycast** auf Head-/Body-Boxen. |
| 7 | Spielmodus M0–M2: nur **„Bomben" (de_)**. **Feste Teams, kein Halbzeitwechsel.** |
| 8 | Karten-Quelle: **DB-Snapshot als JSON primär** (commitbar → alle Clients identisch), Live-DB optional. |
| 9 | MCP: Needle-MCP-Server in `opencode.json` (stdio: `npx -y needle-cloud mcp`). |
| 10 | Lizenz: nur intern (Firmen-LAN), Needle-Lizenzfrage als nicht blockierend notiert. |
| 11 | Sprache: Nutzertexte/UI deutsch, Kommentare deutsch, Bezeichner englisch. |
| 12 | Keine neuen Abhängigkeiten, wenn wenige Zeilen Standardlösung reichen (ponytail-Prinzip). |

## Tech-Stack

- `@needle-tools/engine` (drei-Fork via `"three": "npm:@needle-tools/three@…"`).
- Vitest für Pure-Logic-Tests; `*.test.ts` **neben** der Quelle.
- Doku: https://engine.needle.tools/docs/three/ , Scripting-Walkthrough, Physics-/Networking-Guides.
- Needle-MCP-Server liefert Docs-Search + offiziellen Coding-Skill in die Session.

## Repo-Struktur (Ziel)

```
cs_warehouse1.6/
├─ package.json  index.html  vite.config.ts  tsconfig.json  bun.lock
├─ AGENTS.md  IMPLEMENTIERUNGSPLAN.md  opencode.json
├─ levels/de_<lager>.json            # editierbares Karten-Format (Bake-Ausgabe)
├─ scripts/bake-map.ts               # MSSQL → levels/*.json (Bun)
├─ src/shared/types.ts               # (Port) + Level-/Zonen-Typen
├─ src/logic/                        # PURE, portabel, getestet
│  ├─ query.ts  layout.ts  transform.ts
│  ├─ weapons.ts                     # Waffen-/Schadens-/Preistabelle (Daten)
│  ├─ economy.ts                     # $-Regeln
│  ├─ round.ts                       # Runden-Zustandsmaschine
│  └─ bombs.ts                       # Spot-/Timer-Logik
├─ src/level/LevelBuilder.ts         # JSON → Meshes + AABBs + Zonen
├─ src/player/FpsPlayer.ts           # PointerLock, Bewegung, Kollision
├─ src/weapons/Weapon.ts Grenade.ts  # Hitscan / Rapier-Projektile
├─ src/multi/GameSync.ts Bot.ts      # Netzwerk / Wegpunkt-Bots
├─ src/ui/                           # HUD, BuyMenu, Scoreboard, Round-Banner
└─ src/main.ts                       # onStart: Level laden, Host/Join
```

## Wiederverwendung aus ias.warehouse-map (1:1 portierbar, framework-frei)

| Quelle | Zweck | Status |
|---|---|---|
| `src/server/query.ts` | SQL + Gruppierung (`LAGER_SQL`/`PLAETZE_SQL`, `groupLagerorte`, `attachBestaende`) | ✅ portiert → `src/logic/query.ts` |
| `src/shared/types.ts` | Lager-Typen | ✅ portiert → `src/shared/types.ts` (+ neu `src/shared/level.ts`) |
| `src/app/scene/layout.ts` | Rack-Struktur/Platzierung aus DB-Dimensionen | ✅ portiert → `src/logic/layout.ts` |
| `src/app/scene/transform.ts` | `rackAabb`, Bounds, Transform | ✅ portiert → `src/logic/transform.ts` |
| `src/app/phys.ts` | Gravitation/Sprung | ✅ übernommen → `src/logic/move.ts` (erweitert: `stepPlayer`, `wishSpeed`, `pointFree`) |
| `src/app/scene/boxes.ts` | merged Box-Geometrien (Logik) | ➖ M0 ohne; `LevelView` baut Box-Meshes direkt (M1 ggf. mergen) |

Neu in M0 (aus Level-/Gameplay-Anforderungen): `src/logic/level.ts` (Solid-Boxen, Wände, Zonen-Vorschlag),
`src/logic/move.ts` (Spieler-Bewegung + Kollision), `src/logic/demo.ts` (Demo-Generator),
`src/player/FpsPlayer.ts`, `src/level/LevelView.ts`.

R3F-Renderteile (`Rack.tsx`, `Cell.tsx`, `WalkControls.tsx`, `RackLabels.tsx`, …) werden in Needle neu gebaut.

---

## Milestones

### M0 — Scaffold + begehbares Lager ✅ (Stand: Sep 2026, verifiziert)
**Ziel:** Level aus JSON laden, herumlaufen, gegen Regale/Wände kollidieren. **Erreicht.**

- [x] `git init`; Needle-Vite-Basis (Struktur wie `npm create needle`); `tsconfig`, Scripts
- [x] AGENTS.md + diese Datei angelegt
- [x] **Bun-Check:** `bun install`, `bun run dev`, `bun run build` mit Needle-Vite-Plugin laufen
- [x] `opencode.json` mit Needle-MCP (stdio) eingerichtet
- [x] Pure Ports in `src/shared/` + `src/logic/` inkl. Vitest-Tests (query, layout, transform, level, move)
- [x] `scripts/bake-map.ts`: MSSQL (per Env) ODER Demo-Generator → `levels/de-demo.json`
- [x] Dev-Fallback-Level ohne DB (Demo-Generator, deterministisch, seed=1)
- [x] `LevelView.buildLevelView`: JSON → Meshes + Kollisions-Boxen; `FpsPlayer` (PointerLock, WASD, Sprint, Jump, AABB-Kollision)
- [x] Smoke-Test `scripts/smoke.mjs` (Headless-Edge/CDP): Szene rendert (93 Draw-Calls), keine Console-Fehler
- **Done:** `bun run test` (60 Tests), `tsc --noEmit`, `bun run build`, `bun run smoke` grün

**Erkenntnisse/Notizen:**
- Needle rendert Canvas im Shadow-DOM des `<needle-engine>`-Elements → Smoke prüft `renderer.info`, nicht `querySelector('canvas')`.
- Needle erzeugt bei Bedarf automatisch eine Fallback-Kamera (`context.mainCamera`).
- `PLAYER`-Konstanten als `as const` → Literal-Typen in Tests: Motion-Objekte mit `PlayerMotion` typisieren.
- Needle-Lizenz: Basic-Label aktiv (intern ok, kein Blocker).
- Bake benennt Datei `de-demo.json`; echte DB-Läufe: `bun run bake <lagerkennung>`.

### M1 — Kern-FPS ✅ (Stand: Sep 2026, verifiziert)
**Ziel:** Schießen fühlt sich CS-artig an. **Erreicht (Kern: Hitscan-Waffen, Nachladen, Ziele, HUD, Slots).**

- [x] CS-Feel: PointerLock + Drag-Look-Fallback (rechte Taste), Augen-Höhe 1.65, Bewegung unabhängig vom Lock
- [x] `logic/weapons.ts` (Daten) + `logic/fire.ts` (Feuer-/Reload-/Recoil-State, pur) + Tests
- [x] `logic/hitbox.ts` (Mensch-Proxy: Kopf/Körper, Slab-Raycast, pure) + Tests — Bugfix: negative Strahlrichtung (Slab t0/t1 je Achse)
- [x] `logic/damage.ts` (HP/applyDamage/heal) + Tests
- [x] `entities/DamageTarget.ts` + `TargetDummy.ts` (3 Trainingspuppen, Kopf+Body, welt-Hitboxen, Tod = dunkel)
- [x] `weapons/Shooter.ts`: Hitscan von Kameramitte, Spread/Recoil/Move-Spread, semi+auto, Reload (R), Slots 1–4 (Messer/Glock/AK/USP), Wände blockieren Schüsse
- [x] Waffen-Daten M1: knife, glock, usp, mp5, ak47, m4a1, awp (CS-angelehnt)
- [x] HUD (DOM): Fadenkreuz + Statuszeile (Waffe, Munition, HP, Slot-Hilfe)
- [x] End-to-End-Smoke: AWP-Körperschuss → Dummy 100→0 HP (getroffen)
- **Done:** 101 Tests, `tsc --noEmit`, `bun run build`, `bun run smoke` grün

**Bewusst offen (M1-Reste, später):** Mündungsfeuer/Impact-Effekte, Waffen-Modelle (Viewmodel, derzeit nur HUD-Name),
Schaden an Spieler (kommt mit Bots/Gegnern in M2), Granaten (M1c verschoben — Rapier erst dort).

- [x] **Player-Feeling: Ducken, Headbob, Weapon Sway (Stand Sep 2026):** Ducken per gehaltenem Strg (CS-Stil). Kamera-Zielhoehe `PLAYER.crouchEye` (1.15 m) weich interpoliert, Tempo auf `PLAYER.crouchSpeed` (2.4 m/s) gedeckelt, Springen gesperrt. Praezision: `fireSpread(def, state, moving, crouched)` in `logic/fire.ts` - geduckt Streuung x`CROUCH_SPREAD_MULT` (0.6, ~40% enger) und Bewegungspenalty nur noch x`CROUCH_MOVE_MULT` (0.25); Shooter reicht `player.crouching()` an Strahl + Fadenkreuz (`spreadPx`) durch. Headbob rein in `logic/bob.ts` (`advanceBob`/`bobScale`/`bobOffset`, Frequenz folgt Tempo, geduckt ~35%), angewandt in `FpsPlayer.update` als Kamera-Offset + minimale Roll, nur am Boden. Weapon Sway subtil in `ViewModel.ts`: Feder aus Kameradrehgeschwindigkeit (`SWAY_*`-Konstanten) + dezente Atembewegung, additiv zum Recoil-Offset. Tests: `bob.test.ts` neu, `fire.test.ts` + Duck-Faelle, `move.test.ts` + PLAYER-Stance; 175 Tests gruen, tsc/build ok.
### M2 — de_-Modus: Runde, Economy, Netzwerk, Bots (Stand: Sep 2026 — Runde/Bots laufen, Netzwerk offen)
**Ziel:** Bomben-Runde spielbar (T vs CT), Singleplayer gegen Bots. Multiplayer (Netzwerk) folgt.
- [x] `logic/economy.ts` ($-Regeln, pure) + Tests: startMoney 800, maxMoney 16000, win 3250, lossBonus 1400→steigend→Cap 3400, Kill/Plant/Defuse 300
- [x] `logic/bombs.ts` (pure): Plant 3.2 s, Fuse 40 s, Defuse 10 s / 5 s mit Kit; Abbruch/Unterbrechung
- [x] `logic/round.ts` (pure, State-Machine): warmup→freeze→live→bomb→roundEnd; Elimination, Zeitablauf, Explosion, Defuse; Score; auto-Neustart nach roundEnd
- [x] `logic/zones.ts` (pure): `spotAt`/`inRadius` für Bombenspots
- [x] `logic/waypoints.ts` (pure): Wegpunkt-Graph aus Rack-Layout + BFS
- [x] `logic/botDecide.ts` (pure): Sicht (LOS via castParts) → Spieler jagen oder goal
- [x] `multi/Bot.ts` (CT-Entity): Bewegung per Wegpunkt, beschließt Spieler bei Sicht, DamageTarget, stirbt/schwärzt
- [x] `multi/BotBrain.ts` (Behaviour): tickt Bots, zählt lebende CT
- [x] `game/GameMode.ts` (Behaviour, Host-Logik): treibt round/bomb/economy, Respawn je Runde, E=Plant/Defuse, B=Buy-Overlay
- [x] HUD: Round-Zeile (Phase/Timer/Score/Bombe) + Banner + Buy-Overlay
- [x] Smoke E2E: Schuss→Treffer; Runde→live; alle CT eliminiert→roundEnd 1:0 + Geld+3250
- **Done:** 145 Tests, `tsc`, `build`, `smoke` grün. Runde manuell durchspielbar (T vs 3 CT-Bots).
- **Offen (nächster Schritt):** M2d Netzwerk (SyncedRoom/manual, Host authoritativ, 2 Fenster); BuyMenu-Einkäufe an Shooter-Loadout anbinden; Defuse-Kit/Geld im HUD.

### M3+ (danach, nicht in M0–M2)
- [x] **Waffen-Viewmodels (Stand Sep 2026):** Quaternius Ultimate Gun Pack (CC0) in `assets/weapons/`; `.blend` als editierbare Quellen, `.obj`+`.mtl` lädt die Engine. Zuordnung Weapon-ID→Modell in `weapons.ts` (`visual.model/scale/pos/muzzle`). `weapons/ViewModel.ts`: Kamera-Kind; OBJ-Modelle haben den Lauf entlang **+X** → `inner.rotation.y=π/2` richtet +X auf −Z (Kamerarichtung); Auto-Fit auf TYPE_LEN (pistol 0.32 m … awp 0.75 m) anhand der **lokalen Box, gemessen VOR der Rotation**; Mündung = Modell-+X-Spitze (`box.max.x`) als Kind von `inner`. OBJLoader braucht absolute URL (mtllib-Auflösung intern via `new URL(mtlfile, url)`). Slot-Wechsel, Recoil. Verifiziert: Glock 3120 Vertices, AK 3768, AWP 4146; Mündung im Kamera-Space vor der Kamera (z<0).
- [x] **Waffen-Daten als JSON + dynamischer Recoil (Stand Sep 2026):** Alle Waffen-Settings (Schaden, RPM, Spread, Recoil, Viewmodel-Offsets) liegen in `src/logic/weapons.json` (`null` = unbegrenzt fürs Messer); `weapons.ts` lädt sie (Typen/Helfer bleiben). Recoil pur in `logic/recoil.ts` (`RecoilSpec {up, side, ramp, cap, recovery}`, `fireRecoil`/`tickRecoil`, Ramp im Dauerfeuer + Recovery nach Pause). Verdrahtet: `FpsPlayer.setRecoil/writeLook` (Offset additiv, schwingt zurück), Shooter feuert Recoil bei jedem Schuss, Viewmodel-Rückstoß, HUD-Fadenkreuz weitet sich mit Streuung. Tests: `recoil.test.ts` + Feld-/JSON-Validierung in `weapons.test.ts`.
- [x] **Schuss-/Treffer-Effekte:** `weapons/Fx.ts` (Mündungsfeuer: Licht + Flammen-Kegel + Rauch; Tracer von der Mündung zum Treffpunkt; Einschlag-Sparks + **Wand-Decals** — jetzt KONSTANT KLEIN (Kern 0.05 m, Rand 0.07 m, Blut 0.02 m, keine Distanz-Skalierung) und FLACH: Decal-Ebene via `quaternion.setFromUnitVectors(+Z, normal)` auf die **Treffer-Normale** gelegt (`boxSurfaceNormal`/`surfaceNormalOnBoxes` in `logic/hitbox.ts`, pure + getestet) statt auf die Kamera — liegt unabhängig vom Schusswinkel auf der Wand; Position = Punkt + 0.005 × Normale. Blut bei Zieltreffern; `wallDecals`-Zähler; Smoke prüft Größe ≤0.1 m und Ort >2 m). Hitmarker-X im HUD (`Hud.hitmarker`), `flashHit()`-Blitz an Dummies/Bots. Shooter verdrahtet (Mündung/Tracer/Impact + Normale).
- [ ] Granaten (HE/Flash, Rapier)
- [ ] Weitere Modi: Geiselbefreiung, „Ziele erreichen"; Map-Editor (nutzt dasselbe Level-JSON)
- [ ] Volle Bot-AI; VoIP; Sound; Feinschliff

---

## Verifikation (vor jedem Milestone-Abschluss)

1. `bun run test` — alle Tests grün
2. `bunx tsc --noEmit` — keine Typfehler
3. `bun run build` — Build erfolgreich
4. Manueller Smoke-Test des Milestone-Ziels
5. Diese Datei + AGENTS.md aktualisieren (Häkchen, Entscheidungen, Erkenntnisse)
