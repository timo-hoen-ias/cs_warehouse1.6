# Waffen-Modelle

Quelle: Quaternius – Ultimate Gun Pack (https://quaternius.com/packs/ultimategun.html)

**Lizenz: CC0 (Public Domain)** — frei für kommerzielle Nutzung, keine Namensnennung erforderlich.
Details: https://quaternius.com/license.html

## Zuordnung Weapon-ID → Datei (OBJ/MTL + editierbares .blend in assets/weapons/blend/)

| Weapon-ID | Modell | OBJ/MTL | Blend |
|---|---|---|---|
| glock | Pistol_1 | Pistol_1.obj/mtl | Pistol_1.blend |
| usp | Pistol_2 | Pistol_2.obj/mtl | Pistol_2.blend |
| mp5 | SubmachineGun_1 | SubmachineGun_1.obj/mtl | SubmachineGun_1.blend |
| ak47 | AssaultRifle_1 | AssaultRifle_1.obj/mtl | AssaultRifle_1.blend |
| m4a1 | AssaultRifle_2 | AssaultRifle_2.obj/mtl | AssaultRifle_2.blend |
| awp | SniperRifle_1 | SniperRifle_1.obj/mtl | SniperRifle_1.blend |
| shotgun | Shotgun_1 | Shotgun_1.obj/mtl | Shotgun_1.blend |
| knife | (kein Modell im Pack) | — | — |

OBJ-Materialien sind reine Farben (keine Texturen). MTL-Dateien werden von den OBJ
per `mtllib` referenziert (Originalnamen). Konvertierung zu GLB optional via Blender
(für Needle-Komprimierung/Draco) — OBJ läuft direkt mit three `OBJLoader`.
