import { Behaviour, registerType } from '@needle-tools/engine';
import { ROUND, newRoundState, tickRound, type RoundResult } from '../logic/round';
import { newMoney, endRound, type Money } from '../logic/economy';
import { spotAt } from '../logic/zones';
import { FpsPlayer } from '../player/FpsPlayer';
import { Hud } from '../ui/Hud';

export type RoundHud = { phase: string; timer: number; score: string; bombInfo: string };

/**
 * M2 de_-Gameplay (Single-Machine): treibt die pure Runden-/Bomben-Logik
 * (src/logic/round.ts) mit dem lokalen Spieler als T. CT werden in dieser Stufe
 * durch Ziele/Bots repräsentiert (alive-CT zählt das Setup). Netzwerk in M2d.
 */
@registerType
export class GameMode extends Behaviour {
  readonly round = newRoundState();
  readonly money: Money = newMoney();
  onRoundHud?: (h: RoundHud) => void;

  player?: FpsPlayer;
  hud?: Hud;
  /** Zonen der Karte (Bombenspots). */
  bombSpots?: { a: { x: number; z: number }; b: { x: number; z: number } };
  /** Lebende Entities je Team (vom Setup gefüttert). */
  alive: { T: number; CT: number } = { T: 1, CT: 0 };

  /** Optional: wird pro Frame gefragt (Bots leben/sind tot). */
  aliveSource?: () => { T: number; CT: number };

  /** Wird bei jeder neuen Runde gerufen (Bots respawnen). */
  onNewRound?: () => void;

  private eHeld = false;
  private spawn: { x: number; z: number; yaw: number } = { x: 0, z: 0, yaw: 0 };
  private buyVisible = false;
  private lastRound = 0;

  start(): void {
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.nextRound();
  }

  onDestroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
  }

  /** Freeze-Phase einer neuen Runde starten (Spieler als T respawnen). */
  nextRound(): void {
    this.round.round += 1;
    this.round.phase = 'freeze';
    this.round.timer = ROUND.freezeTime;
    this.round.result = null;
    this.lastRound = this.round.round;
    this.respawn();
  }

  /** Spieler an die T-Zone setzen (wird vom Setup via setSpawn konfiguriert). */
  setSpawn(x: number, z: number, yaw: number): void {
    this.spawn = { x, z, yaw };
    this.respawn();
  }

  private respawn(): void {
    if (!this.player) return;
    this.player.hp = 100;
    this.player.spawn(this.spawn.x, this.spawn.z, this.spawn.yaw);
  }

  /** true während Kaufphase. */
  get canBuyNow(): boolean {
    return this.round.phase === 'warmup' || this.round.phase === 'freeze';
  }

  update(): void {
    const dt = Math.min(this.context.time.deltaTime, 0.1);
    let inSpot: 'a' | 'b' | null = null;
    if (this.player && this.bombSpots) {
      inSpot = spotAt(this.player.motionX(), this.player.motionZ(), this.bombSpots, 2.5);
    }
    const alive = this.aliveSource?.() ?? this.alive;
    const result = tickRound(this.round, {
      alive,
      bombAction: { plant: this.eHeld, defuse: this.eHeld },
      inSpot,
      hasKit: false,
    }, dt);
    if (result) this.onRoundEnd(result);
    // Neue Runde (auto nach roundEnd via round.ts) → Spieler + Bots respawnen
    if (this.round.round !== this.lastRound && this.round.phase === 'freeze') {
      this.lastRound = this.round.round;
      this.respawn();
      this.onNewRound?.();
    }
    this.emitHud();
  }

  private onRoundEnd(result: NonNullable<RoundResult>): void {
    const tWon = result.outcome === 't_win' || result.outcome === 't_win_explode';
    endRound(this.money, tWon);
    this.hud?.showBanner(this.bannerText(result));
  }

  private bannerText(r: NonNullable<RoundResult>): string {
    switch (r.outcome) {
      case 'ct_win': return 'Runde verloren — ' + r.reason;
      case 'ct_win_defuse': return 'Bombe entschärft! (CT)';
      case 't_win': return 'Runde gewonnen!';
      case 't_win_explode': return 'Bombe explodiert!';
    }
  }

  private emitHud(): void {
    this.onRoundHud?.({
      phase: this.round.phase,
      timer: Math.ceil(this.round.timer),
      score: `${this.round.tRounds}:${this.round.ctRounds}`,
      bombInfo: bombInfoText(this.round),
    });
  }

  /** Einfaches Buy-Panel: öffnet mit B während freeze. */
  toggleBuy(): void {
    if (!this.canBuyNow) return;
    this.buyVisible = !this.buyVisible;
    this.hud?.showBuy(this.buyVisible, { t: this.money.amount });
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE') this.eHeld = true;
    if (e.code === 'KeyB') this.toggleBuy();
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE') this.eHeld = false;
  };
}

function bombInfoText(r: import('../logic/round').RoundState): string {
  switch (r.bomb.phase) {
    case 'planting': return `Bombe wird gelegt… ${Math.round(r.bomb.progress * 100)}%`;
    case 'planted': return `Bombe aktiv — ${Math.ceil(r.bomb.fuseLeft)}s`;
    case 'defusing': return `Entschärfe… ${Math.round(r.bomb.progress * 100)}%`;
    case 'defused': return 'Bombe entschärft';
    case 'exploded': return 'Bombe explodiert';
    default: return r.phase === 'bomb' ? 'Bombe!' : '';
  }
}
