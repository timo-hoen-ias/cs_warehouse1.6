import type { BombPhase } from './bombs';
import { BOMB } from './bombs';
import { aimError, firstSight } from './botDecide';
import { mateInLineOfFire, nadeHurtsMates, shotSpread, yieldStep } from './botFriendly';
import {
  aimPoint, chooseWeapon, combatTick, effectiveRange, engage, needsReload, newCombat, onShot as combatOnShot,
  shouldRetreat, type CombatState,
} from './botCombat';
import { BOMB_ESCAPE, type NadeOrder, type Task } from './botCoach';
import { nearestThreat, type TeamKnowledge } from './botKnowledge';
import { enemyOf, threatPoints, zoneAt, type BotMapInfo } from './botMap';
import { viewAngle } from './botPerception';
import { fireSpread } from './fire';
import { solveThrow, type ThrowPlan } from './botThrow';
import type { Collider } from './collision';
import type { Team } from './economy';
import type { Smoke } from './grenade';
import type { Loadout } from './loadout';
import { GRENADE_ID } from './loadout';
import { NAV_FLAG, astar, forNodesNear, nearestNode, type Avoid, type XYZ } from './nav';
import type { BotRadioKey } from './radio';
import type { RoundPhase } from './round';
import { WEAPONS } from './weapons';

/**
 * Taktisches Verhalten eines einzelnen Bots (pure): führt den Auftrag des Team-Trainers
 * aus und reagiert wie ein CS-Spieler auf die Lage:
 * - **Kampf**: Reaktionszeit, Gegenlenken, Feuerkontrolle (botCombat), Zielpunkt Kopf/Brust,
 *   Pistole bei leerem Magazin, Rückzug in Deckung bei wenig HP/Überzahl,
 * - **Information**: verlorenen Gegner „anhalten“ (Winkel halten, ggf. HE), Treffer aus dem
 *   Nichts → zur Quelle drehen und Deckung, Geräusche vorzielen bzw. vorsichtig nachgehen,
 * - **Bewegung**: Gehen statt Rennen, wo Gegner sein können, Schleichen beim Nachgehen,
 *   Ecken checken (Blick auf Gefahrenpunkte statt auf den Weg), Rauch und bekannte
 *   Schusslinien meiden,
 * - **Halten**: Blick wechselnd auf die beobachteten Punkte, geduckt bei langen Winkeln,
 *   nach einem Kill oder Beschuss die Position wechseln,
 * - **Granaten**: Würfe aus dem Auftrag (Blend/Rauch beim Ausführen, Rauch aufs Entschärfen)
 *   per Wurf-Suche, nach eigener Blendgranate wegdrehen,
 * - **Bombe**: Pflanzen/Entschärfen (bei Feindkontakt abbrechen, außer es ist zu spät dafür),
 * - **Rücksicht** (`botFriendly`): kein Schuss durch Teamkameraden (Feuer halten, seitlich treten),
 *   nicht vor zielenden Kameraden stehen, HE/Blend nicht zu Kameraden.
 */
export type MoveSpeed = 'run' | 'walk' | 'sneak' | 'stop';

export type Intent = {
  goal: XYZ | null;
  via: XYZ[];
  /** Ändert sich, wenn der Körper neu planen soll. */
  plan: number;
  speed: MoveSpeed;
  /** Direkte Bewegung (Strafen, Ausweichen) statt Pfad: Richtung (XZ, normiert). */
  strafe: { x: number; z: number } | null;
  crouch: boolean;
  look: XYZ | null;
  /** Kampf: schnell drehen. */
  snap: boolean;
  fire: { target: string; aim: XYZ } | null;
  weapon: string;
  reload: boolean;
  /** Taste E (Pflanzen/Entschärfen). */
  use: boolean;
  throwNade: { kind: 'he' | 'flash' | 'smoke'; dir: XYZ; strength: number } | null;
  avoid: Avoid[];
  radio: BotRadioKey | null;
  /** Zustand fürs Debug/HUD. */
  state: string;
  /** Feuer gehalten, weil Kamerad Nr. `mate` (Index in `BrainInput.mates`) in der Schusslinie `from → to` steht. */
  held?: { mate: number; from: XYZ; to: XYZ };
};

export type SeenEnemy = { id: string; pos: XYZ; crouch: boolean; dist: number };

export type BrainInput = {
  now: number;
  elapsed: number;
  dt: number;
  phase: RoundPhase;
  info: BotMapInfo;
  col: Collider;
  smokes: readonly Smoke[];
  self: {
    pos: XYZ;
    eye: XYZ;
    yaw: number;
    hp: number;
    loadout: Loadout;
    weapon: string;
    crouch: boolean;
    /** Sekunden ohne Bewegung. */
    stillFor: number;
    reloading: boolean;
    blind: number;
    /** Nächster Wegpunkt des aktuellen Pfads (Blick in Laufrichtung). */
    ahead: XYZ | null;
    inSite: boolean;
  };
  visible: SeenEnemy[];
  /** Lebende Kameraden (Positionen). */
  mates: readonly XYZ[];
  /** Schusslinien von Kameraden, die ich gerade am Schießen hindere (sie halten das Feuer): aus der Linie treten. */
  blocking?: readonly { from: XYZ; to: XYZ }[];
  know: TeamKnowledge;
  task: Task | null;
  bomb: { phase: BombPhase; pos: XYZ | null; fuseLeft: number; progress: number };
};

const d2 = (a: XYZ, b: XYZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const d3 = (a: XYZ, b: XYZ): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export const BRAIN = {
  /** Verlorenen Gegner so lange „anhalten“ (s). */
  holdAngle: 2.5,
  /** Auf Geräusche reagieren, wenn nicht älter als (s) und näher als (m). */
  noiseAge: 3,
  noiseRange: 30,
  /** Nachgehen (Untersuchen) höchstens so lange (s). */
  investigate: 9,
  /** Blickwechsel beim Halten (s). */
  lookDwell: [1.4, 3.2] as const,
  /** Angekommen (m). */
  arrive: 1.3,
  /** Eilige Wege: Gegner weiter weg als das (m) werden nicht im Stehen bekämpft. */
  passRange: 25,
} as const;

export class BotBrain {
  readonly id: string;
  readonly team: Team;
  skill: number;
  readonly rnd: () => number;
  readonly combat: CombatState = newCombat();
  /** Restreaktionszeit, Zielzeit (für den Zielfehler). */
  reaction = 0;
  sightTime = 0;
  private target: string | null = null;
  private lastTarget: { id: string; pos: XYZ; t: number } | null = null;
  private heard: { pos: XYZ; t: number } | null = null;
  private damage: { from: XYZ; t: number } | null = null;
  private taskId = -1;
  private nadeQueue: NadeOrder[] = [];
  private nadeSeen = 0;
  private nadeTryAt = 0;
  private nadeTries = 0;
  private throwing: { plan: ThrowPlan; t: number; released: boolean } | null = null;
  private avertUntil = -1;
  private avertYaw = 0;
  private retreat: { goal: XYZ; until: number } | null = null;
  private investigate: { pos: XYZ; until: number } | null = null;
  private arrivedAt = -1;
  private lookIdx = 0;
  private lookUntil = 0;
  private lookOff = { x: 0, z: 0 };
  private checkPts: XYZ[] = [];
  private checkAt = 0;
  private checkIdx = 0;
  private altIdx = -1;
  private killAt = -1;
  private lastHeAt = -100;
  private plan = 1;
  private goalOverride: XYZ | null = null;
  private crouchHold = false;
  private radioDone = new Set<string>();
  private pendingRadio: BotRadioKey | null = null;

  constructor(id: string, team: Team, skill: number, rnd: () => number) {
    this.id = id;
    this.team = team;
    this.skill = skill;
    this.rnd = rnd;
  }

  /** Ereignis: dieser Bot hat getötet. */
  onKill(now: number): void {
    this.killAt = now;
    this.target = null;
    this.lastTarget = null;
    if (this.rnd() < 0.45) this.pendingRadio = 'enemyDown';
  }

  /** Ereignis: getroffen (Angreiferposition). */
  onDamaged(from: XYZ, now: number): void {
    this.damage = { from: { ...from }, t: now };
  }

  /** Ereignis: Geräusch gehört (Schritte, Schüsse, Granaten). */
  onHeard(pos: XYZ, now: number): void {
    if (!this.heard || now - this.heard.t > 0.6 || this.rnd() < 0.3) this.heard = { pos: { ...pos }, t: now };
  }

  /** Feuerstoß zählen (vom System nach einem echten Schuss gemeldet). */
  onShot(dist: number, weapon: string): void {
    const def = WEAPONS[weapon];
    if (def) combatOnShot(this.combat, { def, dist, skill: this.skill, rnd: this.rnd });
  }

  get engaged(): boolean {
    return this.target !== null;
  }

  private idle(state: string, weapon: string): Intent {
    return { goal: null, via: [], plan: this.plan, speed: 'stop', strafe: null, crouch: false, look: null, snap: false, fire: null, weapon, reload: false, use: false, throwNade: null, avoid: [], radio: null, state };
  }

  think(v: BrainInput): Intent {
    const out = this.decide(v);
    return v.phase === 'live' || v.phase === 'bomb' ? this.keepClear(v, out) : out;
  }

  /**
   * Rücksicht auf Kameraden (nach der eigentlichen Entscheidung): liegt einer in der Schusslinie,
   * wird nicht geschossen und seitlich getreten; wer einen Kameraden so am Schießen hindert und selbst
   * nicht kämpft, tritt aus dessen Linie (kämpft er selbst, weicht der Schütze aus — Zielen und Laufen vertragen sich nicht).
   */
  private keepClear(v: BrainInput, out: Intent): Intent {
    const s = v.self;
    if (out.fire && v.mates.length) {
      const def = WEAPONS[s.weapon];
      const gun = s.loadout.guns[s.weapon];
      const weaponSpread = def ? (gun ? fireSpread(def, gun, s.stillFor < 0.15, s.crouch, s.stillFor > 0.25) : def.spreadBase) : 0;
      const spread = shotSpread(aimError(this.sightTime, this.skill) * (s.blind > 0 ? 3 : 1), weaponSpread);
      const block = mateInLineOfFire(s.eye, out.fire.aim, v.mates, { spread });
      if (block) {
        out.held = { mate: v.mates.indexOf(block.mate), from: { ...s.eye }, to: { ...out.fire.aim } };
        out.fire = null;
        this.stepAside(v, out, block.escape);
        out.state += ' · Kamerad im Schussfeld';
        return out;
      }
    }
    if (!out.use && !out.throwNade && !this.throwing && !out.fire && !this.engaged && v.blocking?.length) {
      const esc = yieldStep(s.pos, v.blocking);
      if (esc && this.stepAside(v, out, esc)) out.state += ' · weicht aus';
    }
    return out;
  }

  /** Seitenschritt (nur auf begehbarem Boden, wie das Strafen im Körper); false = kein Platz. */
  private stepAside(v: BrainInput, out: Intent, dir: { x: number; z: number }): boolean {
    const s = v.self;
    const n = nearestNode(v.info.nav, s.pos.x + dir.x * 0.7, s.pos.y, s.pos.z + dir.z * 0.7, 0.9);
    if (n < 0 || Math.abs(v.info.nav.y[n]! - s.pos.y) >= 0.6) return false;
    out.strafe = { x: dir.x, z: dir.z };
    if (out.speed === 'stop' || out.speed === 'sneak') out.speed = 'walk';
    return true;
  }

  private decide(v: BrainInput): Intent {
    const s = v.self;
    const lo = s.loadout;
    const nearestVisible = v.visible.length ? Math.min(...v.visible.map((e) => e.dist)) : null;
    const wantWeapon = chooseWeapon(lo, nearestVisible ?? (this.lastTarget && v.now - this.lastTarget.t < 2 ? d3(s.pos, this.lastTarget.pos) : null));
    if (v.phase !== 'live' && v.phase !== 'bomb') {
      this.target = null;
      this.reaction = 0;
      return this.idle(v.phase === 'freeze' ? 'Kaufzeit' : 'warten', wantWeapon);
    }
    const task = v.task;
    if (task && task.id !== this.taskId) {
      this.taskId = task.id;
      this.nadeQueue = [...task.nades];
      this.nadeSeen = task.nades.length;
      this.nadeTries = 0;
      this.arrivedAt = -1;
      this.altIdx = -1;
      this.goalOverride = null;
      this.investigate = null;
      this.crouchHold = task.crouch;
      this.plan++;
    }
    // Neue Granaten-Aufträge im laufenden Auftrag (z. B. Fake-Präsenz)
    if (task && task.nades.length > this.nadeSeen) {
      this.nadeQueue.push(...task.nades.slice(this.nadeSeen));
      this.nadeSeen = task.nades.length;
    }
    let out: Intent = this.idle('', wantWeapon);
    out.radio = this.pendingRadio;
    this.pendingRadio = null;

    // --- Geblendet: kaum handlungsfähig, sprüht ggf. in die letzte Richtung
    if (s.blind > 0.6) {
      this.reaction = Math.max(this.reaction, 0.3);
      out.state = 'geblendet';
      out.crouch = this.skill > 0.5;
      if (this.lastTarget && v.now - this.lastTarget.t < 1.5 && d3(s.pos, this.lastTarget.pos) < 12) {
        out.look = { ...this.lastTarget.pos, y: this.lastTarget.pos.y + 1.2 };
        out.fire = { target: this.lastTarget.id, aim: out.look };
      }
      return out;
    }

    // --- Laufender Granatenwurf
    if (this.throwing) {
      const close = nearestVisible !== null && nearestVisible < 10;
      if (close && !this.throwing.released) this.throwing = null;
      else return this.continueThrow(v, out);
    }

    // --- Bombe explodiert gleich und ich stehe im Wirkungsbereich (T): weglaufen statt kämpfen (außer der Gegner ist ganz nah)
    if (bombFlight(this.team, v.bomb, s.pos) && task?.goal && !(nearestVisible !== null && nearestVisible < 8)) {
      this.retreat = null;
      const o = this.execute(v, out, task);
      if (nearestVisible !== null) o.look = aimPoint(v.visible[0]!.pos, v.visible[0]!.crouch, false);
      o.speed = 'run';
      o.state = 'Abstand zur Bombe';
      return o;
    }

    // --- Sichtkontakt: kämpfen
    if (v.visible.length) {
      const r = this.fight(v, out, wantWeapon);
      if (r) return r;
    } else {
      if (this.target) this.target = null;
      this.reaction = 0;
      this.sightTime = Math.max(0, this.sightTime - v.dt * 2);
      this.combat.target = null;
    }

    const def = WEAPONS[s.weapon];
    const gun = lo.guns[s.weapon];
    const recentEnemy = this.lastTarget && v.now - this.lastTarget.t < 4;
    const safe = !recentEnemy && !(this.damage && v.now - this.damage.t < 3);
    out.reload = !!def && needsReload(gun, def, safe);
    const avoid = this.avoidZones(v, task);
    out.avoid = avoid;

    // --- Rückzug (unter Feuer, nachladen, wenig HP) → Deckung, danach wieder anschauen
    if (this.retreat) {
      if (v.now > this.retreat.until || d2(s.pos, this.retreat.goal) < 0.8 && v.now > this.retreat.until - 1) this.retreat = null;
      else {
        const there = d2(s.pos, this.retreat.goal) < 0.9;
        out.goal = there ? null : this.retreat.goal;
        out.speed = there ? 'stop' : 'run';
        out.crouch = there;
        out.look = this.lastTarget?.pos ? { ...this.lastTarget.pos, y: this.lastTarget.pos.y + 1.4 } : this.damage ? { ...this.damage.from, y: this.damage.from.y + 1.4 } : null;
        out.state = 'Rückzug';
        out.plan = this.plan;
        return out;
      }
    }
    if ((s.reloading || out.reload) && this.lastTarget && v.now - this.lastTarget.t < 4 && d3(s.pos, this.lastTarget.pos) < 22) {
      const cover = findCover(v.info, v.col, s.pos, this.lastTarget.pos);
      if (cover) {
        this.retreat = { goal: cover, until: v.now + 2.5 };
        this.plan++;
      }
    }

    // --- Verlorenen Gegner anhalten (Winkel halten), ggf. HE hinterher
    if (this.lastTarget && v.now - this.lastTarget.t < BRAIN.holdAngle && !(task?.kind === 'defuse' || task?.kind === 'plant') && !task?.urgent) {
      const lt = this.lastTarget;
      const dd = d3(s.pos, lt.pos);
      if (lo.grenades.he > 0 && dd > 8 && dd < 28 && v.now - this.lastHeAt > 8 && v.now - lt.t > 0.8) {
        const plan = solveThrow(v.col, 'he', s.eye, lt.pos, { reject: this.hurtsMates(v, 'he') });
        if (plan) {
          this.lastHeAt = v.now;
          this.throwing = { plan, t: 0, released: false };
          return this.continueThrow(v, out);
        }
      }
      out.look = { x: lt.pos.x, y: lt.pos.y + 1.45, z: lt.pos.z };
      out.speed = 'stop';
      out.crouch = this.crouchHold && dd > 15;
      out.state = 'Winkel halten';
      return out;
    }

    // --- Treffer aus dem Nichts → hinsehen, ggf. Deckung
    if (this.damage && v.now - this.damage.t < 1.6) {
      out.look = { ...this.damage.from, y: this.damage.from.y + 1.4 };
      if (s.hp < 60 && task?.kind === 'hold' && !task.urgent) {
        const cover = findCover(v.info, v.col, s.pos, this.damage.from);
        if (cover) {
          this.retreat = { goal: cover, until: v.now + 1.5 + this.rnd() * 1.5 };
          this.altIdx++;
          this.plan++;
          this.damage = null;
        }
      }
    }

    // --- Geplante Granaten des Auftrags (erst in Wurfweite; Ersatzziele, wenn das erste nicht geht)
    if (this.nadeQueue.length && !v.visible.length && v.now >= this.nadeTryAt) {
      const n = this.nadeQueue[0]!;
      const targets = [n.target, ...(n.alt ?? [])];
      const inRange = targets.some((t) => d2(s.eye, t) <= 27);
      if (lo.grenades[n.kind] <= 0 || this.nadeTries >= 4) {
        this.nadeQueue.shift();
        this.nadeTries = 0;
      } else if (inRange) {
        this.nadeTryAt = v.now + 0.5;
        this.nadeTries++;
        for (const t of targets) {
          if (d2(s.eye, t) > 27 || d2(s.eye, t) < 3) continue;
          const plan = solveThrow(v.col, n.kind, s.eye, t, { mustSee: n.mustSee, clear: (a, b) => v.col.clear(a, b), reject: this.hurtsMates(v, n.kind) });
          if (plan) {
            this.nadeQueue.shift();
            this.nadeTries = 0;
            this.throwing = { plan, t: 0, released: false };
            return this.continueThrow(v, out);
          }
        }
      }
    }
    // --- Halter: mehrere Gegner an der beobachteten Engstelle → HE (oder Blend) drauf
    if (task?.kind === 'hold' && this.arrivedAt >= 0 && !v.visible.length && v.now - this.lastHeAt > 10 && (lo.grenades.he > 0 || lo.grenades.flash > 0)) {
      const fresh = [...v.know.enemies.values()].filter((e) => v.now - e.t < 2.5);
      for (const p of task.look) {
        const near = fresh.filter((e) => d2(e.pos, p) < 9);
        const dd = d2(s.pos, p);
        if (near.length >= 2 && dd > 9 && dd < 30) {
          const kind = lo.grenades.he > 0 ? 'he' : 'flash';
          const tgt = kind === 'flash' ? { x: p.x, y: p.y + 2.2, z: p.z } : near[0]!.pos;
          const plan = solveThrow(v.col, kind, s.eye, tgt, { clear: (a, b) => v.col.clear(a, b), reject: this.hurtsMates(v, kind) });
          this.lastHeAt = v.now;
          if (plan) {
            this.throwing = { plan, t: 0, released: false };
            return this.continueThrow(v, out);
          }
          break;
        }
      }
    }

    // --- Geräusche nachgehen (Lurker, Jagd, nicht verankerte Halter)
    if (this.heard && v.now - this.heard.t < BRAIN.noiseAge && d3(s.pos, this.heard.pos) < BRAIN.noiseRange) {
      // Nur „freie“ Rollen gehen nach (Lurker, Kontrolle, Jagd); Halter zielen nur vor
      const canLeave = task && task.roam && !task.anchor && !task.urgent && (task.kind === 'hunt' || (this.arrivedAt >= 0 && v.now - this.arrivedAt > 4));
      if (canLeave && !this.investigate) {
        this.investigate = { pos: { ...this.heard.pos }, until: v.now + BRAIN.investigate };
        this.plan++;
      }
    }
    if (this.investigate) {
      if (v.now > this.investigate.until || d2(s.pos, this.investigate.pos) < 2.5) {
        this.investigate = null;
        this.plan++;
      } else {
        out.goal = this.investigate.pos;
        out.speed = 'sneak';
        out.look = this.heard ? { ...this.heard.pos, y: this.heard.pos.y + 1.4 } : null;
        out.state = 'Geräusch nachgehen';
        out.plan = this.plan;
        return out;
      }
    }

    // --- Auftrag ausführen
    out = this.execute(v, out, task);
    // Geräusch: frisch gehört → dorthin vorzielen (auch beim Halten), sonst nur, wenn nichts Wichtigeres
    if (this.heard && d3(s.pos, this.heard.pos) < BRAIN.noiseRange && !out.use) {
      const age = v.now - this.heard.t;
      if (age < 1.5 || (!out.look && age < BRAIN.noiseAge)) out.look = { ...this.heard.pos, y: this.heard.pos.y + 1.4 };
    }
    if (!out.look && this.flashAvert(v)) out.look = this.flashAvert(v);
    return out;
  }

  // ------------------------------------------------------------------ Kampf

  private fight(v: BrainInput, out: Intent, wantWeapon: string): Intent | null {
    const s = v.self;
    let t = v.visible.find((e) => e.id === this.target) ?? null;
    if (!t) {
      t = [...v.visible].sort((a, b) => a.dist - b.dist)[0]!;
      const first = firstSight(this.skill, this.rnd, viewAngle(s.yaw, s.pos, t.pos), s.stillFor);
      this.reaction = first.reaction;
      this.sightTime = first.sightTime;
      this.target = t.id;
      this.combat.target = null;
    } else {
      this.reaction = Math.max(0, this.reaction - v.dt);
      this.sightTime += v.dt;
    }
    const weapon = wantWeapon;
    const def = WEAPONS[weapon] ?? WEAPONS['knife']!;
    engage(this.combat, t.id, { def, dist: t.dist, skill: this.skill, rnd: this.rnd });
    this.lastTarget = { id: t.id, pos: { ...t.pos }, t: v.now };
    const task = v.task;
    // Entschärfen/Pflanzen: weitermachen, wenn Abbrechen ohnehin verloren wäre
    if (task && (task.kind === 'defuse' || task.kind === 'plant') && s.stillFor > 0.2 && this.atUseSpot(v, task)) {
      const left = task.kind === 'defuse' ? (1 - v.bomb.progress) * (s.loadout.defuseKit ? BOMB.defuseKitTime : BOMB.defuseTime) : (1 - v.bomb.progress) * BOMB.plantTime;
      const commit = task.kind === 'defuse' ? v.bomb.phase === 'defusing' && (left < 1.6 || v.bomb.fuseLeft - left < 1.5) : v.bomb.phase === 'planting' && left < 0.8;
      if (commit) {
        out.use = true;
        out.weapon = task.kind === 'plant' ? 'c4' : weapon;
        out.crouch = true;
        out.look = aimPoint(t.pos, t.crouch, false);
        out.state = task.kind === 'defuse' ? 'entschärft trotz Feind' : 'pflanzt trotz Feind';
        return out;
      }
    }
    // Rückzug bei wenig HP/Überzahl/Nachladen — nicht bei eiligen Aufträgen (Retake, Ausführen), außer fast tot
    const mayRetreat = !task?.urgent || (task.kind !== 'defuse' && s.hp < 15);
    if (mayRetreat && shouldRetreat(s.hp, v.visible.length, s.reloading, t.dist) && t.dist > 7) {
      const cover = findCover(v.info, v.col, s.pos, t.pos);
      if (cover) {
        this.retreat = { goal: cover, until: v.now + 2 + this.rnd() * 1.5 };
        this.plan++;
        if (s.hp < 45) out.radio = out.radio ?? 'needBackup';
        out.goal = cover;
        out.speed = 'run';
        out.look = aimPoint(t.pos, t.crouch, this.combat.head);
        out.snap = true;
        out.weapon = weapon;
        out.state = 'Rückzug';
        out.plan = this.plan;
        return out;
      }
    }
    if (v.visible.length >= 2 && !this.radioDone.has('backup')) {
      this.radioDone.add('backup');
      out.radio = out.radio ?? 'needBackup';
    }
    // Außer Reichweite (SMG/Pistole gegen Gegner weit weg): nicht stehen bleiben und sprühen, sondern
    // weiterlaufen (Blick auf den Gegner) bzw. bei Treffern in Deckung — außer man hält bereits seine Position.
    const holding = task?.kind === 'hold' && this.arrivedAt >= 0;
    // Eiliger Weg (Retake-Sammeln, Retten …): kein Fernduell aus der Bewegung gegen Gegner, die ihren Winkel halten — weiter zum Ziel
    const passing = task?.kind === 'move' && task.urgent && t.dist > BRAIN.passRange;
    if (task?.goal && !holding && def.mode !== 'melee' && (passing || (def.type !== 'sniper' && t.dist > effectiveRange(def) * 1.2))) {
      if (this.damage && v.now - this.damage.t < 1.5) {
        const cover = findCover(v.info, v.col, s.pos, t.pos);
        if (cover) {
          this.retreat = { goal: cover, until: v.now + 2 };
          this.plan++;
        }
      }
      const o = this.execute(v, out, task);
      o.look = aimPoint(t.pos, t.crouch, false);
      o.snap = true;
      o.weapon = weapon;
      if (o.speed === 'walk' || o.speed === 'sneak') o.speed = 'run';
      o.state = `außer Reichweite (${t.dist.toFixed(0)} m)`;
      return o;
    }
    const c = combatTick(this.combat, { def, dist: t.dist, skill: this.skill, ready: this.reaction <= 0 && !s.reloading, stillFor: s.stillFor, dt: v.dt, rnd: this.rnd });
    const aim = aimPoint(t.pos, t.crouch, this.combat.head);
    out.weapon = weapon;
    out.look = aim;
    out.snap = true;
    out.state = `Kampf (${t.dist.toFixed(0)} m)`;
    out.crouch = c.crouch || (this.crouchHold && t.dist > 18 && def.type !== 'sniper');
    if (c.move === 'strafe') {
      const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      out.strafe = { x: (-dz / l) * this.combat.strafe, z: (dx / l) * this.combat.strafe };
      out.speed = 'walk';
    } else if (c.move === 'push') {
      if (!(task?.kind === 'hold' && this.arrivedAt >= 0) || def.mode === 'melee') {
        out.goal = t.pos;
        out.speed = 'walk';
        out.plan = this.plan + 1000;
      }
    }
    if (c.fire && !s.reloading) out.fire = { target: t.id, aim };
    // Nachladen, wenn leer
    const gun = s.loadout.guns[weapon];
    if (gun && gun.mag === 0 && gun.reserve > 0) out.reload = true;
    return out;
  }

  private atUseSpot(v: BrainInput, task: Task): boolean {
    if (task.kind === 'defuse') return !!v.bomb.pos && d2(v.self.pos, v.bomb.pos) < 1.6 && Math.abs(v.self.pos.y - v.bomb.pos.y) < 1.4;
    return v.self.inSite && !!task.goal && d2(v.self.pos, task.goal) < 2.5;
  }

  // ------------------------------------------------------------------ Granaten

  /** Wurfsuche: Zündpunkte bei Kameraden aussortieren (HE/Blend). */
  private hurtsMates(v: BrainInput, kind: 'he' | 'flash' | 'smoke'): (at: XYZ) => boolean {
    return (at) => nadeHurtsMates(kind, at, v.mates, (a, b) => v.col.clear(a, b));
  }

  private continueThrow(v: BrainInput, out: Intent): Intent {
    const th = this.throwing!;
    th.t += v.dt;
    const kind = th.plan.kind;
    // Kameraden sind inzwischen in die Wurfzone gelaufen → Wurf abbrechen (kurz Pause, dann neue Suche)
    if (!th.released && th.t >= 0.4 && nadeHurtsMates(kind, th.plan.land, v.mates, (a, b) => v.col.clear(a, b))) {
      this.throwing = null;
      this.nadeTryAt = v.now + 1;
      out.state = 'Wurf abgebrochen (Kamerad im Wirkungsbereich)';
      return out;
    }
    out.weapon = GRENADE_ID[kind];
    out.speed = 'stop';
    out.look = { x: v.self.eye.x + th.plan.dir.x * 10, y: v.self.eye.y + th.plan.dir.y * 10, z: v.self.eye.z + th.plan.dir.z * 10 };
    out.snap = true;
    out.state = `Granate (${kind})`;
    // Ziehen + Zielen ≈ 0.45 s, dann loslassen, danach kurz nachschauen
    if (!th.released && th.t >= 0.45 && v.self.weapon === GRENADE_ID[kind]) {
      th.released = true;
      out.throwNade = { kind, dir: th.plan.dir, strength: th.plan.strength };
      if (kind === 'flash') {
        this.avertUntil = v.now + 1.9;
        this.avertYaw = v.self.yaw + Math.PI;
      }
    }
    if (th.released && th.t >= 0.75) this.throwing = null;
    if (th.t > 2.5) this.throwing = null; // Sicherheitsnetz (z. B. Waffenwechsel blockiert)
    return out;
  }

  private flashAvert(v: BrainInput): XYZ | null {
    if (v.now >= this.avertUntil) return null;
    return { x: v.self.eye.x - Math.sin(this.avertYaw) * 5, y: v.self.eye.y - 1, z: v.self.eye.z - Math.cos(this.avertYaw) * 5 };
  }

  // ------------------------------------------------------------------ Aufträge

  private execute(v: BrainInput, out: Intent, task: Task | null): Intent {
    const s = v.self;
    out.plan = this.plan;
    if (!task || !task.goal) {
      out.state = 'ohne Auftrag';
      out.look = this.checkLook(v);
      return out;
    }
    let goal = this.goalOverride ?? task.goal;
    // Neu positionieren: nach einem Kill (oder nach Beschuss) an eine Ausweichposition
    if (task.kind === 'hold' && task.alts.length && this.arrivedAt >= 0 && this.killAt > this.arrivedAt && v.now - this.killAt > 1.2 && this.altIdx < 0) {
      this.altIdx = Math.floor(this.rnd() * task.alts.length);
    }
    if (task.kind === 'hold' && this.altIdx >= 0 && task.alts.length) {
      const alt = task.alts[this.altIdx % task.alts.length]!;
      if (!this.goalOverride || d2(this.goalOverride, alt) > 0.5) {
        this.goalOverride = alt;
        this.arrivedAt = -1;
        this.plan++;
        out.plan = this.plan;
      }
      goal = alt;
    }
    const distGoal = d2(s.pos, goal);
    // Aufheben: bis auf die Waffe/C4 laufen (Aufheberadius ~1 m); besetztes Ziel → daneben ist auch angekommen
    const occupied = task.kind !== 'pickup' && v.mates.some((m) => d2(m, goal) < 0.9 && Math.abs(m.y - goal.y) < 1.2);
    const arrived = distGoal < (task.kind === 'pickup' ? 0.4 : occupied ? 2.5 : BRAIN.arrive) && Math.abs(s.pos.y - goal.y) < 1.3;
    if (arrived && this.arrivedAt < 0) {
      this.arrivedAt = v.now;
      if (task.kind === 'hold' && !this.radioDone.has(`pos${task.id}`) && this.rnd() < 0.25) {
        this.radioDone.add(`pos${task.id}`);
        out.radio = out.radio ?? 'inPosition';
      }
    }
    if (!arrived && this.arrivedAt >= 0 && distGoal > 3) this.arrivedAt = -1;

    if (task.kind === 'plant' || task.kind === 'defuse') {
      if (this.atUseSpot(v, task) || (task.kind === 'plant' && arrived && s.inSite)) {
        out.use = true;
        out.crouch = true;
        out.speed = 'stop';
        if (task.kind === 'plant') out.weapon = 'c4';
        out.look = task.look[0] ? { ...task.look[0], y: task.look[0].y + 1.3 } : null;
        out.state = task.kind === 'plant' ? 'pflanzt' : 'entschärft';
        if (!this.radioDone.has(`use${task.id}`)) {
          this.radioDone.add(`use${task.id}`);
          out.radio = out.radio ?? (task.kind === 'defuse' ? 'defusing' : 'cover');
        }
        return out;
      }
      out.goal = task.kind === 'defuse' && v.bomb.pos ? v.bomb.pos : goal;
      out.via = task.via;
      out.speed = this.speedFor(v, task, distGoal);
      out.look = this.checkLook(v);
      out.state = task.kind === 'plant' ? 'zum Pflanzen' : 'zur Bombe';
      return out;
    }

    if (!arrived) {
      out.goal = goal;
      out.via = this.goalOverride ? [] : task.via;
      out.speed = this.speedFor(v, task, distGoal);
      out.look = this.checkLook(v);
      out.state = task.label;
      return out;
    }
    // Angekommen: halten/beobachten
    out.speed = 'stop';
    out.crouch = this.crouchHold;
    out.look = this.holdLook(v, task);
    out.state = task.kind === 'hold' ? `hält: ${task.label}` : task.label;
    return out;
  }

  /** Tempo: Rennen, außer wo Gegner sein können (Gehen) bzw. kurz vor dem Haltepunkt. */
  private speedFor(v: BrainInput, task: Task, distGoal: number): MoveSpeed {
    if (task.speed === 'sneak') return 'sneak';
    if (task.urgent) return distGoal < 6 && task.kind === 'hold' ? 'walk' : 'run';
    if (task.kind === 'hold' && distGoal < 9) return 'walk';
    if (task.speed === 'walk') return 'walk';
    return this.danger(v) ? 'walk' : 'run';
  }

  /** Könnten hier schon Gegner sein? (bekannte Bedrohung in der Nähe oder Gegner-Laufzeit ≤ Rundenzeit) */
  danger(v: BrainInput): boolean {
    const s = v.self;
    const threat = nearestThreat(v.know, s.pos, v.now, 6);
    if (threat && d3(threat.pos, s.pos) < 28) return true;
    const n = nearestNode(v.info.nav, s.pos.x, s.pos.y, s.pos.z, 4);
    if (n < 0) return false;
    const eta = v.info.dist[enemyOf(this.team)][n]! / 6.2;
    return eta < v.elapsed + 2;
  }

  /** Blick beim Laufen: bekannte Bedrohung → Gefahrenpunkte der Zone (Ecken checken) → Laufrichtung. */
  private checkLook(v: BrainInput): XYZ | null {
    const s = v.self;
    const avert = this.flashAvert(v);
    if (avert) return avert;
    const threat = nearestThreat(v.know, s.pos, v.now, 5);
    if (threat && d3(threat.pos, s.pos) < 40) return { ...threat.pos, y: threat.pos.y + 1.4 };
    if (v.now >= this.checkAt) {
      this.checkAt = v.now + 0.5;
      const zone = zoneAt(v.info, s.pos);
      const pts = threatPoints(v.info, zone, this.team);
      const ahead = s.ahead;
      const fx = ahead ? ahead.x - s.pos.x : -Math.sin(s.yaw);
      const fz = ahead ? ahead.z - s.pos.z : -Math.cos(s.yaw);
      const fl = Math.hypot(fx, fz) || 1;
      const cand: XYZ[] = [];
      for (const p of pts) {
        const dx = p.x - s.pos.x, dz = p.z - s.pos.z;
        const l = Math.hypot(dx, dz);
        if (l < 3 || l > 45) continue;
        if ((dx * fx + dz * fz) / (l * fl) < -0.15) continue;
        const tgt = { x: p.x, y: p.y + 1.4, z: p.z };
        if (cand.length < 3 && v.col.clear(s.eye, tgt)) cand.push(tgt);
      }
      this.checkPts = cand;
    }
    if (this.checkPts.length && this.danger(v)) {
      if (v.now >= this.lookUntil) {
        this.checkIdx = (this.checkIdx + 1) % this.checkPts.length;
        this.lookUntil = v.now + 0.7 + this.rnd() * 0.6;
      }
      return this.checkPts[this.checkIdx % this.checkPts.length]!;
    }
    if (s.ahead) return { x: s.ahead.x, y: s.eye.y, z: s.ahead.z };
    return null;
  }

  /** Blick beim Halten: abwechselnd auf die beobachteten Punkte (leicht versetzt). */
  private holdLook(v: BrainInput, task: Task): XYZ | null {
    const avert = this.flashAvert(v);
    if (avert) return avert;
    const pts = task.look.length ? task.look : threatPoints(v.info, zoneAt(v.info, v.self.pos), this.team).slice(0, 3);
    if (!pts.length) return null;
    if (v.now >= this.lookUntil) {
      this.lookIdx = (this.lookIdx + 1) % pts.length;
      const [a, b] = BRAIN.lookDwell;
      this.lookUntil = v.now + a + this.rnd() * (b - a) * (pts.length > 1 ? 1 : 2);
      this.lookOff = { x: (this.rnd() - 0.5) * 1.6, z: (this.rnd() - 0.5) * 1.6 };
    }
    const p = pts[this.lookIdx % pts.length]!;
    return { x: p.x + this.lookOff.x, y: p.y + 1.35, z: p.z + this.lookOff.z };
  }

  /** Ausweichzonen für die Wegplanung: Rauch, bekannte Gegner (Schusslinien). */
  private avoidZones(v: BrainInput, task: Task | null): Avoid[] {
    const out: Avoid[] = [];
    for (const sm of v.smokes) {
      if (sm.timeLeft <= 1) continue;
      if (task?.goal && d3(task.goal, sm.pos) < sm.radius + 1) continue; // Ziel liegt im Rauch (z. B. Bombe)
      out.push({ x: sm.pos.x, y: sm.pos.y, z: sm.pos.z, r: sm.radius + 1, cost: 30 });
    }
    const urgent = !!task?.urgent;
    for (const e of v.know.enemies.values()) {
      if (v.now - e.t > 8 || e.source !== 'seen') continue;
      out.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, r: 12, cost: urgent ? 6 : 20 });
    }
    return out;
  }
}

/** T im Wirkungsbereich der gelegten Bombe kurz vor der Explosion (dann zählt nur noch Abstand). */
export function bombFlight(team: Team, bomb: BrainInput['bomb'], pos: XYZ): boolean {
  return team === 'T' && bomb.phase === 'planted' && !!bomb.pos && bomb.fuseLeft < BOMB_ESCAPE.time && Math.hypot(pos.x - bomb.pos.x, (pos.y - bomb.pos.y) * 1.5, pos.z - bomb.pos.z) < BOMB_ESCAPE.safe;
}

/**
 * Deckung in der Nähe: Knoten (≤ 9 m), von dem aus die Bedrohung keine Sichtlinie
 * hat, möglichst mit Deckungsflag und nicht näher an der Bedrohung. Null, wenn keiner.
 */
export function findCover(info: BotMapInfo, col: Collider, pos: XYZ, threat: XYZ, radius = 9): XYZ | null {
  const g = info.nav;
  const eye = { x: threat.x, y: threat.y + 1.5, z: threat.z };
  const dThreat = d2(pos, threat);
  const scored: { p: XYZ; node: number; sc: number }[] = [];
  let checks = 0;
  const cand: number[] = [];
  forNodesNear(g, pos.x, pos.z, radius, (i) => {
    if (Math.abs(g.y[i]! - pos.y) > 1.2 || (g.flags[i]! & NAV_FLAG.crouch)) return;
    cand.push(i);
  });
  // Nähere zuerst, höchstens 48 Sichtprüfungen
  cand.sort((a, b) => Math.hypot(g.x[a]! - pos.x, g.z[a]! - pos.z) - Math.hypot(g.x[b]! - pos.x, g.z[b]! - pos.z));
  const stride = Math.max(1, Math.floor(cand.length / 48));
  for (let k = 0; k < cand.length && checks < 48; k += stride) {
    const i = cand[k]!;
    const p = { x: g.x[i]!, y: g.y[i]!, z: g.z[i]! };
    const dd = d2(p, pos);
    if (dd < 1.2) continue;
    checks++;
    if (col.clear(eye, { x: p.x, y: p.y + 1.4, z: p.z })) continue;
    let sc = -dd * 0.4;
    if (g.flags[i]! & NAV_FLAG.cover) sc += 2;
    if (d2(p, threat) < dThreat - 1) sc -= 3;
    scored.push({ p, node: i, sc });
  }
  // Erreichbarkeit prüfen (dünne Wand dazwischen?): Laufweg höchstens ~2.2× Luftlinie
  scored.sort((a, b) => b.sc - a.sc);
  const start = nearestNode(g, pos.x, pos.y, pos.z, 3);
  for (const c of scored.slice(0, 4)) {
    if (start < 0) return c.p;
    const nodes = astar(g, start, c.node, { maxExpand: 600 });
    if (nodes.length && nodes.length - 1 <= Math.max(6, d2(c.p, pos) * 2.2)) return c.p;
  }
  return null;
}
