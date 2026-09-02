import { Behaviour, registerType } from '@needle-tools/engine';
import type { SolidBox } from '../logic/level';
import type { WaypointGraph } from '../logic/waypoints';
import type { FpsPlayer } from '../player/FpsPlayer';
import { Bot } from './Bot';

/**
 * Treibt alle CT-Bots pro Frame an (Needle-Behaviour) und pflegt das
 * "alive"-Zählerbild für die Runde.
 */
@registerType
export class BotBrain extends Behaviour {
  bots: Bot[] = [];
  solids: SolidBox[] = [];
  waypoints: WaypointGraph = { points: [], bounds: null };
  player?: FpsPlayer;

  onBotDeath?: (bot: Bot) => void;

  private started = false;

  update(): void {
    const dt = Math.min(this.context.time.deltaTime, 0.05);
    if (!this.started && this.waypoints.points.length) {
      this.started = true;
      for (const b of this.bots) {
        b.solids = this.solids;
        b.waypoints = this.waypoints;
        b.player = this.player;
      }
    }
    for (const b of this.bots) b.think(dt);
  }

  /** Fügt einen Bot hinzu und verdrahtet Tod → Runden-Logik. */
  addBot(b: Bot): void {
    b.solids = this.solids;
    b.waypoints = this.waypoints;
    b.player = this.player;
    b.onDeath = () => this.onBotDeath?.(b);
    this.bots.push(b);
  }

  /** Lebende Bots zählen. */
  aliveCount(): number {
    return this.bots.filter((b) => b.health.alive).length;
  }
}
