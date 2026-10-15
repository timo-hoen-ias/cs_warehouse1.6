import type { BombPhase } from './bombs';
import { BOMB } from './bombs';
import type { BotRole } from './botBuy';
import { known, nearestThreat, sitePressure, type TeamKnowledge } from './botKnowledge';
import {
  holdSpots, plantSpot, portalHoldSpots, spreadSpots, routesTo, siteEntrances, siteInfo,
  type BotMapInfo, type HoldSpot, type Route, type SiteId,
} from './botMap';
import type { BotRadioKey } from './radio';
import {
  assignTGroups, chooseExecuteSite, ctSetup, ctSlots, retakePlan, routeFrom, viaBetween,
  type CTAssignment, type GroupPlan, type RetakeEntry, type TPlan,
} from './botStrategy';
import type { GrenadeKind } from './weapons';
import type { XYZ } from './nav';

/**
 * Team-Trainer der Bots (pure Zustandsmaschinen je Runde): setzt die Strategie
 * (botStrategy) in Aufträge („Tasks“) je Bot um und reagiert auf Informationen.
 *
 * T:  Aufstellung → (Kontrolle halten | Fake zeigen) → Sammeln am Bereitstellungsraum →
 *     „Los, los, los!“ mit Blend/Rauch → Spot einnehmen, Träger pflanzt, Rest sichert die
 *     Eingänge → nach dem Plant Positionen mit Blick auf Eingänge und Bombe.
 * CT: Halte-Positionen (Anker/Rotierer) → Rotation bei Druck auf einen Spot → nach dem
 *     Plant Sammeln vor mehreren Eingängen, gemeinsamer Retake, Entschärfen unter Deckung,
 *     Rückzug, wenn die Zeit nicht mehr reicht.
 */
export type Speed = 'run' | 'walk' | 'sneak';

export type NadeOrder = { kind: GrenadeKind; target: XYZ; mustSee?: XYZ[]; /** Ersatzziele, falls kein Wurf aufs Hauptziel passt. */ alt?: XYZ[] };

export type Task = {
  /** Wechselt bei jedem neuen Auftrag (Körper plant neu). */
  id: number;
  kind: 'move' | 'hold' | 'plant' | 'defuse' | 'pickup' | 'hunt';
  goal: XYZ | null;
  /** Wegpunkte (Portale einer Route) vor dem Ziel. */
  via: XYZ[];
  speed: Speed;
  /** Eilig: auch in Gefahrenzonen rennen. */
  urgent: boolean;
  /** Punkte, die am Ziel beobachtet werden. */
  look: XYZ[];
  crouch: boolean;
  /** Anker: verlässt die Position nicht. */
  anchor: boolean;
  /** Darf Geräuschen nachgehen (Lurker, Kontrolle, Jagd). */
  roam: boolean;
  /** Ausweichpositionen (Neupositionierung nach Kill/unter Beschuss). */
  alts: XYZ[];
  /** Granaten, die vor/zu Beginn des Auftrags geworfen werden sollen. */
  nades: NadeOrder[];
  label: string;
};

let taskSeq = 1;
export function makeTask(t: Partial<Task> & Pick<Task, 'kind' | 'label'>): Task {
  return { id: taskSeq++, goal: null, via: [], speed: 'run', urgent: false, look: [], crouch: false, anchor: false, roam: false, alts: [], nades: [], ...t };
}

export type CoachBot = {
  id: string;
  pos: XYZ;
  hasBomb: boolean;
  hasKit: boolean;
  nades: Record<GrenadeKind, number>;
  /** Steckt gerade im Gefecht (Coach stört nicht mit neuen Wegen). */
  fighting: boolean;
};

export type CoachCtx = {
  info: BotMapInfo;
  now: number;
  /** Sekunden seit Rundenstart (live). */
  elapsed: number;
  /** Restzeit der Runde (live) bzw. der Bombe. */
  timeLeft: number;
  bots: CoachBot[];
  enemyAlive: number;
  know: TeamKnowledge;
  bomb: { phase: BombPhase; spot: SiteId | null; pos: XYZ | null; dropped: XYZ | null; fuseLeft: number };
  rnd: () => number;
  radio: (id: string, key: BotRadioKey) => void;
};

const dist = (a: XYZ, b: XYZ): number => Math.hypot(a.x - b.x, (a.y - b.y) * 1.5, a.z - b.z);

/** Haltepunkte der T im Spot: Blick auf die CT-Eingänge, nahe dem Pflanzpunkt. */
function tSiteSpots(info: BotMapInfo, site: SiteId, around: XYZ, alsoSee: XYZ[] = []): { spot: HoldSpot; watch: XYZ }[] {
  const s = siteInfo(info, site);
  if (!s) return [];
  const out: { spot: HoldSpot; watch: XYZ }[] = [];
  const entries = siteEntrances(info, s, 'defend');
  const lists = entries.map((pid) => ({ pid, spots: portalHoldSpots(info, pid, 'T', { near: around, nearMax: 18, alsoSee, limit: 4, min: 4 }) }));
  for (let k = 0; k < 4; k++) {
    for (const l of lists) {
      const sp = l.spots[k];
      // nicht auf der Bombe stehen (Entschärfer sieht man besser von der Seite)
      if (sp && !out.some((o) => dist(o.spot.pos, sp.pos) < 3) && dist(sp.pos, around) >= 3) out.push({ spot: sp, watch: info.portals[l.pid]!.pos });
    }
  }
  return out;
}

// ============================================================================ T

export type TStage = 'setup' | 'fake' | 'gather' | 'execute' | 'planted';

export class TCoach {
  plan: TPlan;
  stage: TStage = 'setup';
  target: SiteId;
  groups: GroupPlan[] = [];
  roles = new Map<string, BotRole>();
  readonly tasks = new Map<string, Task>();
  private readonly routeOf = new Map<string, Route>();
  private gatherSince = -1;
  private firstReady = -1;
  private goAt = -1;
  private fakeShowAt = -1;
  private plantedSeen = false;
  private carrierRelease = -1;
  private info: BotMapInfo | null = null;
  private siteSpots: { spot: HoldSpot; watch: XYZ }[] = [];

  constructor(plan: TPlan) {
    this.plan = plan;
    this.target = plan.fakeSite ?? plan.site;
  }

  /** Rundenbeginn: Gruppen bilden, erste Aufträge. */
  start(ctx: CoachCtx): void {
    this.info = ctx.info;
    const carrier = ctx.bots.find((b) => b.hasBomb)?.id ?? null;
    const { groups, roles } = assignTGroups(ctx.info, this.plan, ctx.bots.map((b) => b.id), carrier, ctx.rnd);
    this.groups = groups;
    this.roles = roles;
    for (const g of groups) for (const id of g.members) this.routeOf.set(id, g.route);
    const kind = this.plan.kind;
    if (kind === 'rush' || kind === 'split') {
      this.stage = 'gather';
      this.target = this.plan.site;
      this.gatherSince = 0;
      for (const b of ctx.bots) this.toStaging(b, ctx, kind === 'rush');
      this.spread(ctx);
    } else if (kind === 'fake') {
      this.stage = 'fake';
      for (const b of ctx.bots) {
        const r = this.routeOf.get(b.id);
        if (!r) continue;
        if (this.roles.get(b.id) === 'lurker') this.holdControl(b, r, 'Lurker');
        else this.set(b.id, makeTask({ kind: 'move', label: `Fake ${r.site.toUpperCase()}`, goal: r.staging, via: viaBetween(ctx.info, r, b.pos, r.staging), speed: 'run', urgent: true }));
      }
      this.spread(ctx);
    } else {
      this.stage = 'setup';
      for (const b of ctx.bots) {
        const r = this.routeOf.get(b.id);
        if (r) this.holdControl(b, r, kind === 'eco' ? 'Eco' : 'Kontrolle');
      }
    }
    this.spread(ctx);
  }

  private set(id: string, t: Task): void {
    this.tasks.set(id, t);
  }

  /**
   * Mehrere Bots mit (fast) demselben Ziel bekommen verschiedene Stehplätze daneben
   * (hinter dem Ziel, vom Spot weg) — kein Stapeln am Bereitstellungsraum/Kontrollpunkt.
   */
  private spread(ctx: CoachCtx): void {
    const groups: { goal: XYZ; ids: string[] }[] = [];
    for (const b of ctx.bots) {
      const t = this.tasks.get(b.id);
      if (!t?.goal || (t.kind !== 'hold' && t.kind !== 'move')) continue;
      const g = groups.find((q) => dist(q.goal, t.goal!) < 1.5);
      if (g) g.ids.push(b.id);
      else groups.push({ goal: t.goal, ids: [b.id] });
    }
    for (const g of groups) {
      if (g.ids.length < 2) continue;
      const site = siteInfo(ctx.info, this.target);
      const spots = spreadSpots(ctx.info, g.goal, g.ids.length, { awayFrom: site?.plant });
      g.ids.forEach((id, i) => {
        const t = this.tasks.get(id)!;
        t.goal = spots[i]!;
      });
    }
  }

  private holdControl(b: CoachBot, r: Route, label: string): void {
    const goal = r.control ?? r.staging;
    const via = viaBetween(this.info!, r, b.pos, goal);
    this.set(b.id, makeTask({ kind: 'hold', label: `${label}: ${r.label.split(' › ').slice(-3, -1).join(' › ') || r.site}`, goal, via, look: r.contested ? [r.contested] : [], speed: label === 'Lurker' ? 'walk' : 'run', crouch: false, roam: true }));
  }

  private toStaging(b: CoachBot, ctx: CoachCtx, urgent: boolean): void {
    let r = this.routeOf.get(b.id);
    if (!r || r.site !== this.target) {
      r = routeFrom(ctx.info, this.target, b.pos) ?? r;
      if (r) this.routeOf.set(b.id, r);
    }
    if (!r) return;
    const via = viaBetween(ctx.info, r, b.pos, r.staging);
    this.set(b.id, makeTask({ kind: 'move', label: `Sammeln ${this.target.toUpperCase()}`, goal: r.staging, via, speed: 'run', urgent, look: r.entry >= 0 ? [ctx.info.portals[r.entry]!.pos] : [] }));
  }

  private startGather(ctx: CoachCtx, site: SiteId, urgent = false): void {
    this.stage = 'gather';
    this.target = site;
    this.gatherSince = ctx.now;
    this.firstReady = -1;
    for (const b of ctx.bots) this.toStaging(b, ctx, urgent);
    this.spread(ctx);
  }

  private carrier(ctx: CoachCtx): CoachBot | undefined {
    return ctx.bots.find((b) => b.hasBomb);
  }

  update(ctx: CoachCtx): void {
    const info = ctx.info;
    const bomb = ctx.bomb;
    // Neue Mitglieder ohne Auftrag (z. B. aufgefüllter Bot): wie im aktuellen Abschnitt
    for (const b of ctx.bots) if (!this.tasks.has(b.id)) this.toStaging(b, ctx, false);

    if ((bomb.phase === 'planted' || bomb.phase === 'defusing') && bomb.pos) {
      this.updatePlanted(ctx, bomb.pos);
      return;
    }
    // Liegende Bombe: nächster T (nicht im Gefecht) hebt sie auf
    const carrier = this.carrier(ctx);
    if (!carrier && bomb.dropped) {
      const free = ctx.bots.filter((b) => !b.fighting);
      const pool = free.length ? free : ctx.bots;
      const near = pool.sort((a, b) => dist(a.pos, bomb.dropped!) - dist(b.pos, bomb.dropped!))[0];
      if (near) {
        const cur = this.tasks.get(near.id);
        if (!cur || cur.kind !== 'pickup') this.set(near.id, makeTask({ kind: 'pickup', label: 'C4 aufheben', goal: bomb.dropped, speed: 'run', urgent: true }));
      }
    }
    // Aufgehoben (von wem auch immer) → veraltete Aufhebe-Aufträge zurück in den aktuellen Abschnitt
    for (const b of ctx.bots) {
      const t = this.tasks.get(b.id);
      if (t?.kind !== 'pickup') continue;
      if (!carrier && bomb.dropped && t.goal && dist(t.goal, bomb.dropped) < 1) continue;
      if (this.stage === 'execute') this.executeTask(b, ctx, b.hasBomb, 1);
      else this.toStaging(b, ctx, this.stage === 'gather');
    }

    // Zeitdruck: spätestens jetzt ausführen
    if ((this.stage === 'setup' || this.stage === 'fake') && (ctx.timeLeft < 40 || ctx.elapsed >= this.plan.executeAt + (this.stage === 'fake' ? 25 : 0))) {
      const site = this.stage === 'fake' ? this.plan.site : chooseExecuteSite(info, ctx.know, ctx.now, this.plan.site);
      this.startGather(ctx, site, ctx.timeLeft < 40);
      return;
    }

    switch (this.stage) {
      case 'setup':
        if (ctx.elapsed >= this.plan.executeAt) this.startGather(ctx, chooseExecuteSite(info, ctx.know, ctx.now, this.plan.site));
        // Kontrolle ohne Gegenwehr und Überzahl → früher ausführen
        else if (this.plan.kind === 'default' && ctx.elapsed > 25 && ctx.enemyAlive <= ctx.bots.length - 2) this.startGather(ctx, chooseExecuteSite(info, ctx.know, ctx.now, this.plan.site));
        break;
      case 'fake': {
        const main = ctx.bots.filter((b) => this.roles.get(b.id) !== 'lurker');
        const fakeRoute = this.groups[0]?.route;
        if (this.fakeShowAt < 0 && fakeRoute) {
          const arrived = main.filter((b) => dist(b.pos, fakeRoute.staging) < 7).length;
          if (arrived >= Math.max(1, Math.ceil(main.length / 2))) {
            this.fakeShowAt = ctx.now;
            // Präsenz zeigen: Granaten in den Fake-Spot, Lärm machen
            const entry = fakeRoute.entry >= 0 ? info.portals[fakeRoute.entry]! : null;
            if (entry) {
              const thrower = main.find((b) => b.nades.flash > 0 || b.nades.he > 0 || b.nades.smoke > 0);
              if (thrower) {
                const kind: GrenadeKind = thrower.nades.smoke > 0 ? 'smoke' : thrower.nades.flash > 0 ? 'flash' : 'he';
                const target = { x: entry.pos.x + entry.dir.x * 5, y: entry.pos.y + (kind === 'flash' ? 2 : 0), z: entry.pos.z + entry.dir.z * 5 };
                const t = this.tasks.get(thrower.id);
                if (t) t.nades.push({ kind, target });
              }
            }
          }
        } else if (this.fakeShowAt >= 0 && ctx.now - this.fakeShowAt > 5) {
          this.startGather(ctx, this.plan.site, true);
        }
        break;
      }
      case 'gather': {
        const ready = ctx.bots.filter((b) => {
          const t = this.tasks.get(b.id);
          return t?.goal && dist(b.pos, t.goal) < 6;
        });
        if (ready.length && this.firstReady < 0) this.firstReady = ctx.now;
        const need = Math.max(1, Math.ceil(ctx.bots.length * 0.7));
        const waited = this.firstReady >= 0 ? ctx.now - this.firstReady : 0;
        const split = this.plan.kind === 'split' && ctx.elapsed < this.plan.executeAt;
        const go = (ready.length >= need && !split) || (ready.length >= ctx.bots.length && ctx.bots.length > 0)
          || (this.plan.kind === 'rush' && waited > 2.5)
          || waited > (this.plan.kind === 'split' ? 16 : 11) || ctx.timeLeft < 30 || ctx.now - this.gatherSince > 32;
        if (go) this.startExecute(ctx);
        break;
      }
      case 'execute': {
        const c = this.carrier(ctx);
        if (c && this.carrierRelease >= 0 && ctx.now >= this.carrierRelease) {
          this.carrierRelease = -1;
          this.executeTask(c, ctx, true);
        } else if (c && this.carrierRelease < 0 && this.tasks.get(c.id)?.kind !== 'plant') {
          // Neuer Träger (C4 aufgehoben) → pflanzen
          this.executeTask(c, ctx, true);
        }
        break;
      }
      case 'planted':
        break;
    }
  }

  private startExecute(ctx: CoachCtx): void {
    this.stage = 'execute';
    this.goAt = ctx.now;
    const s = siteInfo(ctx.info, this.target);
    if (!s) return;
    this.siteSpots = tSiteSpots(ctx.info, this.target, s.plant);
    const leader = ctx.bots.find((b) => !b.hasBomb) ?? ctx.bots[0];
    if (leader) ctx.radio(leader.id, 'go');
    let usedFlash = 0;
    let usedSmoke = 0;
    let k = 0;
    for (const b of ctx.bots) {
      if (b.hasBomb && ctx.bots.length > 1) {
        // Träger wartet einen Moment, die anderen gehen vor
        this.carrierRelease = ctx.now + 1.6;
        continue;
      }
      this.executeTask(b, ctx, false, k++);
      // Granaten: Blend in den Spot (Entry), Rauch auf die CT-Position (Support)
      const r = this.routeOf.get(b.id);
      const entry = r && r.entry >= 0 ? ctx.info.portals[r.entry]! : null;
      const t = this.tasks.get(b.id);
      if (!entry || !t) continue;
      const ctSpots = portalHoldSpots(ctx.info, entry.id, 'CT', { limit: 3 });
      if (b.nades.flash > 0 && usedFlash < 2) {
        t.nades.push({ kind: 'flash', target: { x: entry.pos.x + entry.dir.x * 4, y: entry.pos.y + 2.3, z: entry.pos.z + entry.dir.z * 4 }, mustSee: ctSpots.map((c) => ({ x: c.pos.x, y: c.pos.y + 1.6, z: c.pos.z })) });
        usedFlash++;
      } else if (b.nades.smoke > 0 && usedSmoke < 1 && ctSpots[0]) {
        const smoke = ctx.info.hints.find((h) => h.kind === 'smoke' && h.team === 'T' && (!h.site || h.site.toLowerCase() === this.target));
        // Rauch zwischen Eingang und die CT-Lieblingsposition (Sichtlinie trennen), Ersatzpunkte entlang der Linie
        const sp = ctSpots[0].pos;
        const along = (f: number): XYZ => ({ x: entry.pos.x + (sp.x - entry.pos.x) * f, y: Math.min(entry.pos.y, sp.y), z: entry.pos.z + (sp.z - entry.pos.z) * f });
        const target = smoke && smoke.kind === 'smoke' ? { x: smoke.target[0], y: smoke.target[1], z: smoke.target[2] } : along(0.6);
        t.nades.push({ kind: 'smoke', target, alt: [along(0.45), along(0.75), along(0.3), ...ctSpots.slice(1).map((c) => ({ ...c.pos }))] });
        usedSmoke++;
      }
    }
  }

  private executeTask(b: CoachBot, ctx: CoachCtx, carrier: boolean, k = 0): void {
    const s = siteInfo(ctx.info, this.target);
    if (!s) return;
    let r = this.routeOf.get(b.id);
    if (!r || r.site !== this.target) r = routeFrom(ctx.info, this.target, b.pos) ?? undefined;
    const via = r ? viaBetween(ctx.info, r, b.pos) : [];
    if (carrier) {
      const at = plantSpot(ctx.info, s, ctx.rnd);
      this.set(b.id, makeTask({ kind: 'plant', label: `Pflanzen ${this.target.toUpperCase()}`, goal: at, via, speed: 'run', urgent: true, look: this.siteSpots.map((x) => x.watch).slice(0, 2) }));
      return;
    }
    const pick = this.siteSpots.length ? this.siteSpots[k % this.siteSpots.length]! : null;
    this.set(b.id, makeTask({
      kind: 'hold', label: `Spot ${this.target.toUpperCase()} sichern`, goal: pick?.spot.pos ?? s.plant, via, speed: 'run', urgent: true,
      look: pick ? [pick.watch] : [], alts: this.siteSpots.filter((x) => x !== pick).slice(0, 2).map((x) => x.spot.pos),
    }));
  }

  private updatePlanted(ctx: CoachCtx, bombPos: XYZ): void {
    if (!this.plantedSeen) {
      this.plantedSeen = true;
      this.stage = 'planted';
      const site = ctx.bomb.spot ?? this.target;
      const spots = tSiteSpots(ctx.info, site, bombPos, [bombPos]);
      ctx.bots.forEach((b, i) => {
        const pick = spots.length ? spots[i % spots.length]! : null;
        this.set(b.id, makeTask({
          kind: 'hold', label: 'Bombe verteidigen', goal: pick?.spot.pos ?? bombPos, speed: 'walk',
          look: pick ? [pick.watch, bombPos] : [bombPos], crouch: !!pick?.spot.crouch && ctx.rnd() < 0.5,
          alts: spots.filter((x) => x !== pick).slice(0, 2).map((x) => x.spot.pos),
        }));
      });
      return;
    }
    // Entschärfen gehört/gesehen → zur Bombe; kurz vor der Explosion → Abstand halten
    const defuseKnown = ctx.bomb.phase === 'defusing' && (ctx.bots.some((b) => dist(b.pos, bombPos) < 28) || !!nearestThreat(ctx.know, bombPos, ctx.now, 3));
    for (const b of ctx.bots) {
      const t = this.tasks.get(b.id);
      if (ctx.bomb.fuseLeft < 4 && ctx.bomb.phase === 'planted' && dist(b.pos, bombPos) < 24) {
        if (t?.label !== 'Abstand zur Bombe') {
          const away = { x: bombPos.x + (b.pos.x - bombPos.x) * 4, y: b.pos.y, z: bombPos.z + (b.pos.z - bombPos.z) * 4 };
          const r = routesTo(ctx.info, 'T', ctx.bomb.spot ?? this.target)[0];
          this.set(b.id, makeTask({ kind: 'move', label: 'Abstand zur Bombe', goal: r?.staging ?? away, speed: 'run', urgent: true }));
        }
      } else if (defuseKnown && t?.kind !== 'hunt') {
        this.set(b.id, makeTask({ kind: 'hunt', label: 'Entschärfen verhindern', goal: bombPos, speed: 'run', urgent: true, look: [bombPos], roam: true }));
      }
    }
  }
}

// ============================================================================ CT

export type CTStage = 'hold' | 'rotate' | 'retake' | 'save';

export class CTCoach {
  stage: CTStage = 'hold';
  called: SiteId | null = null;
  readonly tasks = new Map<string, Task>();
  assign = new Map<string, CTAssignment>();
  private calls = 0;
  private calledAt = -1;
  private retake = new Map<string, RetakeEntry>();
  private retakeGo = false;
  private firstReady = -1;
  private defuser: string | null = null;
  private guardDrop = false;

  start(ctx: CoachCtx, awp: string | null): void {
    this.assign = ctSetup(ctx.info, ctx.bots.map((b) => b.id), ctx.rnd, awp);
    for (const b of ctx.bots) this.holdTask(b.id, ctx);
  }

  private holdTask(id: string, ctx: CoachCtx): void {
    const a = this.assign.get(id);
    if (!a) return;
    const alts = a.slot.spots.filter((s) => s !== a.spot).slice(0, 3).map((s) => s.pos);
    this.tasks.set(id, makeTask({
      kind: 'hold', label: `${a.anchor ? 'Anker' : 'Halten'} ${a.slot.label}`, goal: a.spot.pos, look: [a.slot.watch], speed: 'run',
      crouch: a.spot.crouch && ctx.rnd() < 0.45, anchor: a.anchor, alts,
    }));
  }

  role(id: string): BotRole {
    return this.assign.get(id)?.anchor ? 'anchor' : 'rotator';
  }

  update(ctx: CoachCtx): void {
    for (const b of ctx.bots) {
      if (this.tasks.has(b.id)) continue;
      const slots = ctSlots(ctx.info);
      if (!slots.length) continue;
      const slot = slots[Math.floor(ctx.rnd() * slots.length) % slots.length]!;
      this.assign.set(b.id, { slot, spot: slot.spots[0]!, anchor: false, site: slot.site });
      this.holdTask(b.id, ctx);
    }
    const bomb = ctx.bomb;
    if ((bomb.phase === 'planted' || bomb.phase === 'defusing') && bomb.pos && bomb.spot) {
      this.updateRetake(ctx, bomb.spot, bomb.pos);
      return;
    }
    // Druck auf die Spots → Rotation
    const pa = sitePressure(ctx.know, ctx.info, 'a', ctx.now, 8);
    const pb = sitePressure(ctx.know, ctx.info, 'b', ctx.now, 8);
    const hot: SiteId | null = Math.max(pa, pb) >= 1.5 && Math.abs(pa - pb) >= 0.8 ? (pa > pb ? 'a' : 'b') : null;
    if (hot && hot !== this.called && (this.calls === 0 || (this.calls < 2 && ctx.now - this.calledAt > 4))) {
      this.rotate(ctx, hot);
    }
    // Liegende Bombe gesehen → ein Rotierer bewacht sie
    if (!this.guardDrop && ctx.know.bomb?.state === 'dropped' && this.stage === 'hold') {
      const pos = ctx.know.bomb.pos;
      const guard = ctx.bots.filter((b) => !this.assign.get(b.id)?.anchor && !b.fighting).sort((a, b) => dist(a.pos, pos) - dist(b.pos, pos))[0];
      const spots = holdSpots(ctx.info, pos, 'CT', { min: 6, max: 26, limit: 3 });
      if (guard && spots[0]) {
        this.guardDrop = true;
        this.tasks.set(guard.id, makeTask({ kind: 'hold', label: 'C4 bewachen', goal: spots[0].pos, look: [pos], speed: 'run' }));
      }
    }
  }

  /** Rotation zu einem Spot: Rotierer (keine Anker anderer Spots) nehmen freie Halte-Positionen dort ein. */
  private rotate(ctx: CoachCtx, site: SiteId): void {
    this.stage = 'rotate';
    this.called = site;
    this.calls++;
    this.calledAt = ctx.now;
    const slots = ctSlots(ctx.info).filter((s) => s.site === site && s.kind === 'site');
    if (!slots.length) return;
    const taken: XYZ[] = [];
    for (const b of ctx.bots) {
      const a = this.assign.get(b.id);
      if (a?.site === site) continue;
      if (a?.anchor && ctx.bots.length > 2) continue; // Anker des anderen Spots bleibt
      const slot = slots[taken.length % slots.length]!;
      const spot = slot.spots.find((s) => !taken.some((t) => dist(t, s.pos) < 3)) ?? slot.spots[0]!;
      taken.push(spot.pos);
      this.tasks.set(b.id, makeTask({ kind: 'hold', label: `Rotation ${site.toUpperCase()}`, goal: spot.pos, look: [slot.watch], speed: 'run', urgent: true, alts: slot.spots.slice(0, 3).map((s) => s.pos) }));
      this.assign.set(b.id, { slot, spot, anchor: false, site });
    }
  }

  private updateRetake(ctx: CoachCtx, site: SiteId, bombPos: XYZ): void {
    const info = ctx.info;
    if (this.stage !== 'retake' && this.stage !== 'save') {
      this.stage = 'retake';
      this.retake = retakePlan(info, site, ctx.bots);
      this.retakeGo = false;
      this.firstReady = -1;
      for (const b of ctx.bots) {
        const r = this.retake.get(b.id);
        if (!r) continue;
        this.tasks.set(b.id, makeTask({ kind: 'move', label: `Sammeln Retake ${site.toUpperCase()}`, goal: r.staging, speed: 'run', urgent: true, look: [info.portals[r.entry]!.pos] }));
      }
      if (ctx.bots.length > 1) ctx.radio(ctx.bots[0]!.id, 'regroup');
    }
    if (this.stage === 'save') return;
    // Wer entschärft? Kit bevorzugt, dann der Nächste
    const byDist = [...ctx.bots].sort((a, b) => dist(a.pos, bombPos) - dist(b.pos, bombPos) - (a.hasKit ? 8 : 0) + (b.hasKit ? 8 : 0));
    const def = byDist[0];
    if (!def) return;
    const defuseTime = def.hasKit ? BOMB.defuseKitTime : BOMB.defuseTime;
    const travel = dist(def.pos, bombPos) / 5.5;
    // Keine Chance mehr → retten (nicht für die Bombe sterben)
    if (ctx.bomb.phase === 'planted' && ctx.bomb.fuseLeft < defuseTime + travel * 0.8 + 0.3) {
      this.stage = 'save';
      for (const b of ctx.bots) this.tasks.set(b.id, makeTask({ kind: 'move', label: 'Retten', goal: info.spawn.CT, speed: 'run', urgent: true }));
      if (ctx.bots[0]) ctx.radio(ctx.bots[0].id, 'fallBack');
      return;
    }
    if (!this.retakeGo) {
      const ready = ctx.bots.filter((b) => {
        const r = this.retake.get(b.id);
        return !r || dist(b.pos, r.staging) < 5;
      });
      if (ready.length && this.firstReady < 0) this.firstReady = ctx.now;
      const tight = ctx.bomb.fuseLeft < defuseTime + travel + 6;
      const allIn = ready.length >= ctx.bots.length;
      const enough = ready.length >= Math.min(ctx.bots.length, 2) && this.firstReady >= 0 && ctx.now - this.firstReady > 5;
      // Gegner bekanntlich tot → kein Warten
      const clear = ctx.enemyAlive === 0 || known(ctx.know, ctx.now, 6).length === 0 && ctx.enemyAlive <= 1 && ready.length > 0;
      if (allIn || enough || tight || clear || ctx.bots.length === 1) {
        this.retakeGo = true;
        this.defuser = def.id;
        if (ctx.bots.length > 1) ctx.radio(def.id, 'go');
        const s = siteInfo(info, site);
        const attack = s ? siteEntrances(info, s, 'attack') : [];
        let k = 0;
        for (const b of ctx.bots) {
          const r = this.retake.get(b.id);
          const via = r ? [info.portals[r.entry]!.pos] : [];
          if (b.id === def.id) {
            const nades = b.nades.smoke > 0 && ctx.enemyAlive > 0 ? [{ kind: 'smoke' as GrenadeKind, target: bombPos }] : [];
            this.tasks.set(b.id, makeTask({ kind: 'defuse', label: 'Entschärfen', goal: bombPos, via, speed: 'run', urgent: true, look: [bombPos], nades }));
            continue;
          }
          const pid = attack[k++ % Math.max(1, attack.length)];
          const spots = pid !== undefined ? portalHoldSpots(info, pid, 'CT', { near: bombPos, nearMax: 14, limit: 3 }) : [];
          const goal = spots[k % Math.max(1, spots.length)]?.pos ?? { x: bombPos.x + (b.pos.x - bombPos.x) * 0.2, y: bombPos.y, z: bombPos.z + (b.pos.z - bombPos.z) * 0.2 };
          const flash = b.nades.flash > 0 && r ? [{ kind: 'flash' as GrenadeKind, target: { x: info.portals[r.entry]!.pos.x + info.portals[r.entry]!.dir.x * 5, y: info.portals[r.entry]!.pos.y + 2.3, z: info.portals[r.entry]!.pos.z + info.portals[r.entry]!.dir.z * 5 } }] : [];
          this.tasks.set(b.id, makeTask({ kind: 'hold', label: 'Retake: Spot sichern', goal, via, speed: 'run', urgent: true, look: pid !== undefined ? [info.portals[pid]!.pos, bombPos] : [bombPos], nades: flash }));
        }
      }
    }
    // Entschärfer gefallen → nächster übernimmt
    if (this.retakeGo && this.defuser && !ctx.bots.some((b) => b.id === this.defuser)) {
      this.defuser = def.id;
      this.tasks.set(def.id, makeTask({ kind: 'defuse', label: 'Entschärfen', goal: bombPos, speed: 'run', urgent: true, look: [bombPos] }));
    }
  }
}
