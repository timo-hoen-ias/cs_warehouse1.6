/**
 * Spielbezogene Audio-Logik für den MatchDriver: Schritte aller Spieler (Oberfläche,
 * Tempo, Positionen), Sprung/Landung, Bomben-Piepen, C4-Tastenfeld beim Legen,
 * Entschärfen, Treffer-/Todesgeräusche. Hält den Treiber schlank — der ruft nur
 * `update()` und die Ereignis-Helfer auf. Entscheidungen kommen aus `logic/audioMix`.
 */
import {
  advanceStep, keypadPresses, newVertical, trackVertical, type StepState, type V3, type VerticalState,
} from '../logic/audioMix';
import { beepInterval } from '../logic/zones';
import { BOMB, type BombPhase } from '../logic/bombs';
import { WEAPONS } from '../logic/weapons';
import type { GameEvent } from '../logic/net';
import type { Sfx } from './Sfx';

export function toV3(a: readonly [number, number, number]): V3 {
  return { x: a[0], y: a[1], z: a[2] };
}

/** Ein Spieler für die Schritt-Erkennung: Fußpunkt, geduckt, eigener Spieler? */
export type AudioMover = {
  id: string; x: number; y: number; z: number; crouch: boolean; local: boolean;
  /** Bekanntes Lauftempo (m/s, z. B. aus der Eingabe des eigenen Spielers); sonst aus der Bewegung geschätzt. */
  speed?: number;
};

export type BombAudioState = { phase: BombPhase; progress: number; fuseLeft: number; spot: 'a' | 'b' | null };

type MoverState = { x: number; z: number; speed: number; step: StepState; vert: VerticalState };

export class MatchAudio {
  private readonly movers = new Map<string, MoverState>();
  private beepTimer = 0;
  private lastPhase: BombPhase = 'none';
  private plantProgress = -1;

  constructor(
    private readonly sfx: () => Sfx | undefined,
    private readonly spots: () => Record<'a' | 'b', { x: number; z: number }> | undefined,
  ) {}

  /** Bombenort: gelegte Bombe, sonst Mitte des Bombenplatzes. */
  bombAt(spot: 'a' | 'b' | null, bombPos: V3 | null = null): V3 | null {
    if (bombPos) return bombPos;
    const z = spot ? this.spots()?.[spot] : undefined;
    return z ? { x: z.x, y: 0.3, z: z.z } : null;
  }

  /**
   * Pro Frame: Schritte/Sprünge aller Spieler, Bomben-Piepen, Tastenfeld, Entschärfen.
   * `actor` = Position dessen, der legt/entschärft (null = eigener Spieler, undefined = unbekannt → Bombenplatz).
   */
  update(dt: number, movers: readonly AudioMover[], bomb: BombAudioState, bombPos: V3 | null, actor?: V3 | null): void {
    const sfx = this.sfx();
    if (!sfx || dt <= 0) return;
    const seen = new Set<string>();
    for (const m of movers) {
      seen.add(m.id);
      let s = this.movers.get(m.id);
      if (!s) {
        s = { x: m.x, z: m.z, speed: 0, step: { acc: 0, foot: 0 }, vert: newVertical() };
        this.movers.set(m.id, s);
      }
      const moved = Math.hypot(m.x - s.x, m.z - s.z);
      s.x = m.x;
      s.z = m.z;
      if (moved > 2) {
        s.speed = 0; // Teleport/Spawn
        s.vert = newVertical();
        continue;
      }
      // Geschwindigkeit glätten (entfernte Posen werden interpoliert und ruckeln)
      if (m.speed !== undefined) s.speed = moved > 0.002 ? m.speed : 0;
      else s.speed += (moved / dt - s.speed) * Math.min(1, dt * 12);
      const feet = { x: m.x, y: m.y, z: m.z };
      const pos = m.local ? null : feet;
      const v = trackVertical(s.vert, m.y, dt);
      if (v?.kind === 'jump') sfx.jump(sfx.surface(feet), pos);
      else if (v?.kind === 'land') sfx.land(sfx.surface(feet), pos, v.strength);
      if (s.vert.air) continue;
      if (advanceStep(s.step, moved, s.speed, m.crouch)) sfx.footstep(sfx.surface(feet), pos, s.speed, m.crouch);
    }
    for (const id of [...this.movers.keys()]) if (!seen.has(id)) this.movers.delete(id);

    // Bombe: Tastenfeld beim Legen, Entschärf-Geräusch, Piepen
    const at = this.bombAt(bomb.spot, bombPos);
    const who = actor === undefined ? at : actor;
    if (bomb.phase === 'planting') {
      if (this.lastPhase !== 'planting') this.plantProgress = -1;
      const n = keypadPresses(this.plantProgress, bomb.progress);
      for (let i = 0; i < n; i++) sfx.c4('press', who);
      this.plantProgress = bomb.progress;
    }
    if (bomb.phase === 'defusing' && this.lastPhase !== 'defusing') sfx.c4('defuse', who);
    this.lastPhase = bomb.phase;
    if ((bomb.phase === 'planted' || bomb.phase === 'defusing') && bombPos) {
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) {
        this.beepTimer = beepInterval(bomb.fuseLeft, BOMB.fuseTime);
        sfx.beep(bombPos, bomb.fuseLeft);
      }
    } else this.beepTimer = 0;
  }

  /** Eigenes Nachladen (Schrot: Patronen einzeln über die Nachladezeit). */
  localReload(weaponId: string, gun?: { mag: number; reserve: number; reloadLeft: number }): void {
    const def = WEAPONS[weaponId];
    if (!def) return;
    const shells = gun ? Math.max(1, Math.min(def.magSize - gun.mag, gun.reserve)) : 1;
    this.sfx()?.reload(weaponId, gun?.reloadLeft || def.reloadTime, shells);
  }

  /** Treffer-Ereignis: eigener Schmerz, Trefferticks/Messer, Körpertreffer anderer positioniert. */
  hit(e: Extract<GameEvent, { k: 'hit' }>, localId: string, localWeapon: string): void {
    const sfx = this.sfx();
    if (!sfx) return;
    const at = toV3(e.at);
    if (e.victim === localId) sfx.play('hurt');
    else sfx.impact('flesh', at);
    if (e.attacker === localId) {
      if (WEAPONS[localWeapon]?.mode === 'melee') sfx.knifeHit('body');
      else if (e.part === 'head') sfx.play('headshot');
      else sfx.play('hit');
    }
  }

  death(pose?: { x: number; y: number; z: number }): void {
    if (pose) this.sfx()?.death({ x: pose.x, y: pose.y + 1.4, z: pose.z });
  }
}
