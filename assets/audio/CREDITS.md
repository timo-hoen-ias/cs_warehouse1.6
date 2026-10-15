# Audio-Quellen und Lizenzen

Alle Spiel-Sounds unter `assets/audio/` sind **bearbeitete Fassungen freier Aufnahmen** plus eigene
Synthese. Es werden **keine** Valve-/Counter-Strike-Assets verwendet. Gebaut werden die Dateien
reproduzierbar mit `scripts/audio/build_audio.py` (Python + numpy/scipy + ffmpeg); die genaue
Zuordnung Quelle → Ausgabe schreibt das Skript nach `scripts/audio/sources-used.txt`.

## Quellprojekt

**Red Eclipse – Sounds** · <https://github.com/redeclipse/sounds> (Stand: Branch `master`, 2026)

| Verzeichnis/Datei im Quellprojekt | Urheber | Lizenz |
|---|---|---|
| `weapons/**`, `sfx/**`, `player/**`, `interface/**` | Red Eclipse Team (u. a. Quinton „quin“ Reeves, Q009, xJoJox) | [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (Standardlizenz laut `readme.txt`) |
| `ambience/*.ogg` (sofern unten nicht anders) | Quinton „quin“ Reeves, Alex „blackshoe“ Anguix | [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (`ambience/readme.txt`) |
| `ambience/hum.ogg` | Therac-25 (freesound.org #25322) | [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `ambience/distant_cars.ogg` | fresco, WIM (freesound.org #34522, #34523, #26173) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `ambience/forest1.ogg` | Dob „dobroide“ Roide (freesound.org) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `ambience/morph/rain.ogg` | Q009 („morph“ ambient pack) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) (`ambience/morph/readme.txt`) |
| `ambience/bart/whoosh.ogg`, `whoosh2.ogg` | bart („18 Random Video Game Sound Effects“, OpenGameArt) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (`ambience/bart/readme.txt`) |

## Lizenz der bearbeiteten Dateien

Die Dateien in `assets/audio/` sind Bearbeitungen (abgeleitete Werke) der genannten Aufnahmen und
stehen deshalb – soweit sie CC-BY-SA-Material enthalten – ebenfalls unter **CC-BY-SA 4.0**
(Namensnennung: Red Eclipse Team und die oben genannten Urheber; Bearbeitung: cs_warehouse1.6).
Rein synthetische Klänge (C4-Tastenfeld/Piepen, Tinnitus, Funk-/Rundensignale, Treffer-Ticks,
Gabelstapler-Rückfahrwarner, Durchsage-Gong, Lkw-Hupe, Taubenflattern-Anteil, Radio) sind eigene
Erzeugnisse und werden ebenfalls unter CC-BY-SA 4.0 bereitgestellt.

## Vorgenommene Änderungen (alle Dateien)

- Mono-Mischung, Resampling (Effekte 44,1 kHz, Ambience 32 kHz), Anfang getrimmt, Ende ausgeblendet,
  Spitzenpegel auf −1,5 dBFS normiert (Ambience: RMS-normiert).
- Waffen: Tonhöhe je Waffe verändert (Bandgeschwindigkeit), Hoch-/Tiefpass, Glocken-/Kuhschwanz-EQ,
  Nachhall per Hüllkurve gekürzt, geschichtet mit synthetischem Tiefton-Punch (Sinus-Sweep),
  Knall-Transiente (gefiltertes Rauschen) und Mechanik-Klick (Schlitten/Verschluss), Sättigung.
  Schalldämpfer: stark tiefpassgefiltert + „Pfft“-Rauschen + Verschlussklick.
  Fernklänge: Tiefpass + diskrete Gebäude-Echos.
- Explosionen: mehrere Quellen geschichtet, Sub-Bass-Sweep, Trümmer-Nachklang, Sättigung.
- Schritte: aus Beton-Schritten abgeleitet (Metall: Resonanz-Teiltöne + Klirren; Gitter: Rassel-Transienten;
  Holz: tiefer + hohler EQ; Fliesen: höher + heller; Kies: granular synthetisiertes Knirschen).
- Schleifen: nahtlos überblendet (Ende → Anfang) bzw. original schleifenfähig übernommen.
- Formate: Ogg Vorbis (`.ogg`) und AAC (`.m4a`, Safari-Fallback).

## Ausgabe → Quelle

| Ausgabe (ohne Pfad/Endung) | Quelle(n) im Red-Eclipse-Paket |
|---|---|
| `ak47_1` | `weapons/rifle/primary.ogg` |
| `ak47_2` | `weapons/rifle/primary2.ogg` |
| `alarmfar` | `ambience/alarm_far.ogg` |
| `aug_1` | `weapons/rifle/secondary3.ogg` |
| `aug_2` | `weapons/rifle/secondary.ogg` |
| `awp_1` | `weapons/rifle/primary.ogg` |
| `awp_2` | `weapons/rifle/primary3.ogg` |
| `birds` | `ambience/forest1.ogg` (CC-BY 3.0 (Dob „dobroide“ Roide)) |
| `bolt` | `weapons/rifle/reload.ogg` |
| `buy` | `interface/press.ogg`, `weapons/smg/switch.ogg` |
| `buzz` | `ambience/electro.ogg` |
| `c4_defuse` | `weapons/pistol/reload.ogg`, `weapons/smg/reload.ogg` |
| `c4_explode` | `sfx/debris.ogg`, `sfx/debris3.ogg`, `weapons/bigblast.ogg`, `weapons/explode3.ogg`, `weapons/mine/explode2.ogg` |
| `c4_explode_far` | `weapons/explodefar3.ogg` |
| `c4_planted` | `weapons/switch.ogg` |
| `cold` | `ambience/hum.ogg` (CC-BY-SA 3.0 (Therac-25)) |
| `compressor` | `ambience/pump_majig.ogg` |
| `conveyor` | `ambience/grinds_my_gears.ogg` |
| `deagle_1` | `weapons/pistol/secondary.ogg` |
| `deagle_2` | `weapons/pistol/secondary2.ogg` |
| `death_1` | `player/death.ogg` |
| `death_2` | `player/death2.ogg` |
| `death_3` | `player/death3.ogg` |
| `death_4` | `player/death4.ogg` |
| `death_5` | `player/death5.ogg` |
| `draw_knife` | `weapons/sword/switch.ogg` |
| `draw_nade` | `weapons/grenade/switch.ogg` |
| `draw_pistol` | `weapons/pistol/reload.ogg`, `weapons/switch.ogg` |
| `draw_rifle` | `weapons/smg/switch.ogg` |
| `drip` | `ambience/leak_metalic.ogg` |
| `elite_1` | `weapons/pistol/primary3.ogg` |
| `elite_2` | `weapons/pistol/primary2.ogg` |
| `famas_1` | `weapons/rifle/primary2.ogg` |
| `famas_2` | `weapons/rifle/primary3.ogg` |
| `far_pistol_1` | `weapons/pistol/primaryfar2.ogg` |
| `far_pistol_2` | `weapons/pistol/primaryfar3.ogg` |
| `far_rifle_1` | `weapons/rifle/primaryfar2.ogg` |
| `far_rifle_2` | `weapons/rifle/secondaryfar2.ogg` |
| `far_shotgun_1` | `weapons/shotgun/primaryfar2.ogg` |
| `far_shotgun_2` | `weapons/shotgun/primaryfar3.ogg` |
| `far_smg_1` | `weapons/smg/primaryfar2.ogg` |
| `far_smg_2` | `weapons/smg/primaryfar3.ogg` |
| `far_sniper_1` | `weapons/rifle/primaryfar3.ogg` |
| `far_sniper_2` | `weapons/rifle/secondaryfar3.ogg` |
| `fiveseven_1` | `weapons/pistol/primary.ogg` |
| `fiveseven_2` | `weapons/pistol/primary3.ogg` |
| `flash_bang` | `weapons/smallblast.ogg` |
| `flyby_1` | `weapons/whizz.ogg` |
| `flyby_2` | `weapons/singe.ogg` |
| `flyby_3` | `weapons/singe2.ogg` |
| `forklift` | `ambience/engine_slow1.ogg` |
| `g3sg1_1` | `weapons/rifle/primary2.ogg` |
| `g3sg1_2` | `weapons/rifle/primary.ogg` |
| `galil_1` | `weapons/rifle/primary3.ogg` |
| `galil_2` | `weapons/rifle/primary.ogg` |
| `glock_1` | `weapons/pistol/primary.ogg` |
| `glock_2` | `weapons/pistol/primary2.ogg` |
| `hallhum` | `ambience/hum.ogg` (CC-BY-SA 3.0 (Therac-25)), `ambience/machine_room_1.ogg` |
| `he_far_1` | `weapons/explodefar2.ogg` |
| `he_far_2` | `weapons/explodefar3.ogg` |
| `he_near_1` | `sfx/debris3.ogg`, `weapons/bigblast.ogg`, `weapons/explode.ogg` |
| `he_near_2` | `sfx/debris3.ogg`, `weapons/bigblast2.ogg`, `weapons/explode2.ogg` |
| `headshot` | `weapons/tink.ogg` |
| `imp_concrete_1` | `sfx/debris.ogg` |
| `imp_concrete_2` | `sfx/debris3.ogg` |
| `imp_concrete_3` | `sfx/debris2.ogg` |
| `imp_flesh_1` | `weapons/thwack2.ogg` |
| `imp_flesh_2` | `weapons/thwack3.ogg` |
| `imp_metal_1` | `weapons/tink.ogg` |
| `imp_metal_2` | `weapons/tink.ogg` |
| `imp_metal_3` | `weapons/tink.ogg` |
| `imp_wood_1` | `weapons/thud.ogg` |
| `imp_wood_2` | `weapons/thud2.ogg` |
| `knife_hit_1` | `weapons/thwack.ogg` |
| `knife_hit_2` | `weapons/thwack2.ogg` |
| `knife_slash_1` | `weapons/sword/primary.ogg` |
| `knife_slash_2` | `weapons/sword/primary2.ogg` |
| `knife_stab` | `weapons/sword/secondary.ogg` |
| `knife_wall_1` | `weapons/thud3.ogg`, `weapons/tink.ogg` |
| `knife_wall_2` | `weapons/thud3.ogg`, `weapons/tink.ogg` |
| `land` | `player/concstep.ogg`, `player/concstep3.ogg`, `player/land.ogg` |
| `life_clank_1` | `weapons/thud2.ogg`, `weapons/tink.ogg` |
| `life_clank_2` | `weapons/thud2.ogg`, `weapons/tink.ogg` |
| `life_door` | `ambience/door.ogg` |
| `life_pallet` | `sfx/debris3.ogg`, `weapons/thud.ogg`, `weapons/thud2.ogg` |
| `life_pigeons` | `ambience/bart/whoosh2.ogg` (CC0 (bart)) |
| `life_reverse` | `ambience/engine1.ogg` |
| `m249_1` | `weapons/rifle/primary3.ogg` |
| `m249_2` | `weapons/rifle/primary2.ogg` |
| `m3_1` | `weapons/shotgun/primary.ogg` |
| `m3_2` | `weapons/shotgun/primary2.ogg` |
| `m4a1_1` | `weapons/rifle/secondary.ogg` |
| `m4a1_2` | `weapons/rifle/secondary2.ogg` |
| `m4a1_sil_1` | `weapons/rifle/secondary.ogg` |
| `m4a1_sil_2` | `weapons/rifle/secondary2.ogg` |
| `mac10_1` | `weapons/smg/primary3.ogg` |
| `mac10_2` | `weapons/smg/primary.ogg` |
| `machine` | `ambience/hammering_machine.ogg` |
| `mp5_1` | `weapons/smg/primary.ogg` |
| `mp5_2` | `weapons/smg/primary2.ogg` |
| `nade_bounce_1` | `weapons/thud.ogg`, `weapons/tink.ogg` |
| `nade_bounce_2` | `weapons/thud.ogg`, `weapons/tink.ogg` |
| `nade_bounce_3` | `weapons/thud.ogg`, `weapons/tink.ogg` |
| `nade_pin` | `weapons/grenade/switch.ogg` |
| `nade_throw` | `ambience/bart/whoosh.ogg` (CC0 (bart)) |
| `p228_1` | `weapons/pistol/primary2.ogg` |
| `p228_2` | `weapons/pistol/primary3.ogg` |
| `p90_1` | `weapons/smg/primary2.ogg` |
| `p90_2` | `weapons/smg/primary3.ogg` |
| `pain_1` | `player/pain.ogg` |
| `pain_2` | `player/pain2.ogg` |
| `pain_3` | `player/pain3.ogg` |
| `pain_4` | `player/pain4.ogg` |
| `pain_5` | `player/pain5.ogg` |
| `pain_6` | `player/pain6.ogg` |
| `pickup` | `weapons/smg/switch.ogg`, `weapons/switch.ogg` |
| `pump` | `weapons/smg/switch.ogg` |
| `rain` | `ambience/morph/rain.ogg` (CC-BY 3.0 (Q009)) |
| `reload_mg` | `weapons/rifle/reload.ogg` |
| `reload_pistol` | `weapons/pistol/reload.ogg` |
| `reload_rifle` | `weapons/rifle/reload.ogg` |
| `reload_shell` | `weapons/shotgun/reload.ogg` |
| `reload_smg` | `weapons/smg/reload.ogg` |
| `reload_sniper` | `weapons/rifle/reload2.ogg` |
| `ricochet_1` | `weapons/ricochet.ogg` |
| `ricochet_2` | `weapons/ricochet.ogg` |
| `ricochet_3` | `weapons/ricochet.ogg` |
| `scout_1` | `weapons/rifle/secondary.ogg` |
| `scout_2` | `weapons/rifle/secondary3.ogg` |
| `sg550_1` | `weapons/rifle/secondary2.ogg` |
| `sg550_2` | `weapons/rifle/secondary.ogg` |
| `sg552_1` | `weapons/rifle/secondary2.ogg` |
| `sg552_2` | `weapons/rifle/secondary3.ogg` |
| `shell_1` | `sfx/shell.ogg` |
| `shell_2` | `sfx/shell2.ogg` |
| `shell_3` | `sfx/shell3.ogg` |
| `shell_4` | `sfx/shell4.ogg` |
| `shell_5` | `sfx/shell5.ogg` |
| `shell_6` | `sfx/shell6.ogg` |
| `shell_shotgun_1` | `sfx/shell.ogg` |
| `shell_shotgun_2` | `sfx/shell3.ogg` |
| `smoke_hiss` | `sfx/extinguish.ogg`, `sfx/extinguish2.ogg`, `sfx/extinguish3.ogg` |
| `step_concrete_1` | `player/concstep.ogg` |
| `step_concrete_2` | `player/concstep2.ogg` |
| `step_concrete_3` | `player/concstep3.ogg` |
| `step_concrete_4` | `player/concstep4.ogg` |
| `step_gravel_1` | `player/concstep.ogg` |
| `step_gravel_2` | `player/concstep2.ogg` |
| `step_gravel_3` | `player/concstep3.ogg` |
| `step_gravel_4` | `player/concstep4.ogg` |
| `step_metal_1` | `player/concstep.ogg`, `weapons/tink.ogg` |
| `step_metal_2` | `player/concstep2.ogg`, `weapons/tink.ogg` |
| `step_metal_3` | `player/concstep3.ogg`, `weapons/tink.ogg` |
| `step_metal_4` | `player/concstep4.ogg`, `weapons/tink.ogg` |
| `step_tile_1` | `player/concstep.ogg` |
| `step_tile_2` | `player/concstep2.ogg` |
| `step_tile_3` | `player/concstep3.ogg` |
| `step_tile_4` | `player/concstep4.ogg` |
| `step_wood_1` | `player/concstep.ogg` |
| `step_wood_2` | `player/concstep2.ogg` |
| `step_wood_3` | `player/concstep3.ogg` |
| `step_wood_4` | `player/concstep4.ogg` |
| `tmp_1` | `weapons/smg/primary.ogg` |
| `tmp_2` | `weapons/smg/primary3.ogg` |
| `traffic` | `ambience/distant_cars.ogg` (CC-BY 3.0 (fresco, WIM)) |
| `tunnel` | `ambience/wastewind.ogg` |
| `ui_back` | `interface/back.ogg` |
| `ui_change` | `interface/change.ogg` |
| `ui_chat` | `sfx/chat.ogg` |
| `ui_click` | `interface/press.ogg` |
| `ump45_1` | `weapons/smg/secondary.ogg` |
| `ump45_2` | `weapons/smg/secondary2.ogg` |
| `usp_1` | `weapons/pistol/primary.ogg` |
| `usp_2` | `weapons/pistol/primary3.ogg` |
| `usp_sil_1` | `weapons/pistol/primary.ogg` |
| `usp_sil_2` | `weapons/pistol/primary3.ogg` |
| `ventilation` | `ambience/server2.ogg` |
| `wind` | `ambience/windy_industry.ogg` |
| `xm1014_1` | `weapons/shotgun/primary2.ogg` |
| `xm1014_2` | `weapons/shotgun/primary3.ogg` |

Nur synthetisch (keine Fremdquelle): `dryfire`, `c4_press_1..3`, `c4_beep`, `c4_defused`, `ear_ring`,
`hitmarker`, `kill`, `radio` (UI), `round_start`, `round_win`, `round_lose`, `life_chime`, `life_horn`,
`ambience/radio`.
