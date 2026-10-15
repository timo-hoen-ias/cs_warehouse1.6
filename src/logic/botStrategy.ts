import type { BuyKind, BotRole } from './botBuy';
import { sitePressure, type TeamKnowledge } from './botKnowledge';
import {
  coverNear, holdSpots, portalApproach, portalHoldSpots, routesTo, siteEntrances, siteInfo,
  type BotMapInfo, type HoldSpot, type Route, type SiteId,
} from './botMap';
import { nearestNode, type XYZ } from './nav';

/**
 * Team-Strategie der Bots (pure Entscheidungen, kartenunabhängig):
 * - **T**: Plan je Runde aus Economy und Zufall — Rush, Default (Kontrolle nehmen,
 *   dann ausführen), Split (zwei Gruppen über verschiedene Routen), Fake (Präsenz an
 *   einem Spot zeigen, dann rotieren), Eco (gestapelt auf einer Route, auf Picks spielen).
 * - **CT**: Aufstellung (z. B. 2-1-2) auf Halte-Positionen an den Eingängen der Spots
 *   und an umkämpften Punkten, Anker und Rotierer.
 * - Spotwahl beim Ausführen (weniger bekannte Gegner) und Retake-Aufteilung auf Eingänge.
 */
export type TPlanKind = 'rush' | 'default' | 'split' | 'fake' | 'eco';

export type TPlan = {
  kind: TPlanKind;
  site: SiteId;
  /** Fake: Spot, an dem Präsenz gezeigt wird. */
  fakeSite: SiteId | null;
  /** Spätester Start der Ausführung (s nach Rundenbeginn). */
  executeAt: number;
};

const WEIGHTS: Record<BuyKind, Partial<Record<TPlanKind, number>>> = {
  pistol: { rush: 0.35, default: 0.35, split: 0.3 },
  eco: { eco: 0.85, rush: 0.15 },
  force: { rush: 0.35, default: 0.25, split: 0.25, fake: 0.15 },
  half: { rush: 0.3, default: 0.3, split: 0.25, fake: 0.15 },
  full: { default: 0.35, split: 0.25, rush: 0.18, fake: 0.22 },
};

/** Plan der T für diese Runde (letzter Plan wird seltener wiederholt). */
export function pickTPlan(info: BotMapInfo, buy: BuyKind, alive: number, rnd: () => number, last: TPlanKind | null = null): TPlan {
  const sites = info.sites.filter((s) => routesTo(info, 'T', s.id).length > 0).map((s) => s.id);
  const site: SiteId = sites.length ? sites[Math.floor(rnd() * sites.length) % sites.length]! : 'a';
  const w: Partial<Record<TPlanKind, number>> = { ...WEIGHTS[buy] };
  if (alive <= 2) { delete w.split; delete w.fake; }
  if (sites.length < 2) delete w.fake;
  if (routesTo(info, 'T', site).length < 2) delete w.split;
  if (last && w[last] !== undefined && Object.keys(w).length > 1) w[last] = w[last]! * 0.4;
  const total = Object.values(w).reduce((s, v) => s + (v ?? 0), 0) || 1;
  let r = rnd() * total;
  let kind: TPlanKind = 'default';
  for (const [k, v] of Object.entries(w) as [TPlanKind, number][]) {
    r -= v;
    if (r <= 0) { kind = k; break; }
  }
  if (!Object.keys(w).length) kind = 'rush';
  const fakeSite: SiteId | null = kind === 'fake' ? (sites.find((s) => s !== site) ?? null) : null;
  const span = (a: number, b: number): number => a + rnd() * (b - a);
  const executeAt = kind === 'rush' ? 0 : kind === 'split' ? span(25, 35) : kind === 'default' ? span(42, 60) : kind === 'fake' ? span(30, 42) : span(58, 72);
  return { kind: fakeSite || kind !== 'fake' ? kind : 'rush', site, fakeSite, executeAt };
}

export type GroupPlan = { route: Route; members: string[] };

/**
 * Gruppen und Rollen der T: Rush/Eco = eine Gruppe, Split = zwei Gruppen über
 * verschiedene Routen zum selben Spot, Default = über alle Routen verteilt (jede mit
 * eigenem Kontrollpunkt), Fake = Hauptgruppe zum Fake-Spot + ein Lurker am echten Spot.
 * Der Bombenträger läuft nie vorne (Rolle 'support', zweiter in der Gruppe).
 */
export function assignTGroups(info: BotMapInfo, plan: TPlan, ids: readonly string[], carrier: string | null, rnd: () => number): { groups: GroupPlan[]; roles: Map<string, BotRole> } {
  const roles = new Map<string, BotRole>();
  const toSite = routesTo(info, 'T', plan.site);
  if (!toSite.length || !ids.length) return { groups: [], roles };
  const order = [...ids];
  // Träger an Position 2 (geschützt hinter dem Entry)
  if (carrier && order.includes(carrier)) {
    order.splice(order.indexOf(carrier), 1);
    order.splice(Math.min(1, order.length), 0, carrier);
  }
  const groups: GroupPlan[] = [];
  const pickRoute = (list: Route[]): Route => (list.length > 1 && rnd() < 0.3 ? list[1]! : list[0]!);
  switch (plan.kind) {
    case 'rush':
    case 'eco':
      groups.push({ route: pickRoute(toSite), members: order });
      break;
    case 'split': {
      const r1 = toSite[0]!;
      const r2 = toSite.find((r) => r !== r1 && r.entry !== r1.entry) ?? toSite[1] ?? r1;
      const a: string[] = [];
      const b: string[] = [];
      order.forEach((id, i) => (i % 2 === 0 ? a : b).push(id));
      // Träger in die größere Gruppe
      if (carrier && b.includes(carrier) && b.length < a.length) { b.splice(b.indexOf(carrier), 1); a.splice(1, 0, carrier); }
      groups.push({ route: r1, members: a });
      if (b.length) groups.push({ route: r2, members: b });
      break;
    }
    case 'default': {
      // Alle Routen beider Spots, je Kontrollpunkt nur eine; Träger auf eine Route zum Plan-Spot
      const all = info.routes.filter((r) => r.team === 'T').sort((p, q) => p.length - q.length);
      const distinct: Route[] = [];
      for (const r of all) {
        const key = r.control ?? r.staging;
        if (distinct.some((d) => Math.hypot((d.control ?? d.staging).x - key.x, (d.control ?? d.staging).z - key.z) < 8)) continue;
        distinct.push(r);
      }
      if (!distinct.length) distinct.push(toSite[0]!);
      const byRoute = new Map<Route, string[]>();
      const rest = order.filter((id) => id !== carrier);
      if (carrier && order.includes(carrier)) byRoute.set(toSite[0]!, [carrier]);
      const start = Math.floor(rnd() * distinct.length);
      rest.forEach((id, i) => {
        const r = distinct[(start + i) % distinct.length]!;
        const list = byRoute.get(r) ?? [];
        list.push(id);
        byRoute.set(r, list);
      });
      for (const [route, members] of byRoute) groups.push({ route, members });
      break;
    }
    case 'fake': {
      const fake = routesTo(info, 'T', plan.fakeSite ?? plan.site);
      const main = order.slice();
      let lurker: string | null = null;
      if (order.length >= 3) {
        lurker = main.reverse().find((id) => id !== carrier) ?? null;
        main.reverse();
        if (lurker) main.splice(main.indexOf(lurker), 1);
      }
      groups.push({ route: pickRoute(fake.length ? fake : toSite), members: main });
      if (lurker) {
        groups.push({ route: toSite[0]!, members: [lurker] });
        roles.set(lurker, 'lurker');
      }
      break;
    }
  }
  for (const g of groups) {
    g.members.forEach((id, i) => {
      if (roles.has(id)) return;
      roles.set(id, i === 0 && id !== carrier ? 'entry' : 'support');
    });
  }
  return { groups, roles };
}

/** Halte-Slot der CT: Eingang eines Spots oder umkämpfter Punkt einer T-Route. */
export type CTSlot = {
  site: SiteId | null;
  kind: 'site' | 'forward';
  watch: XYZ;
  from: XYZ;
  spots: HoldSpot[];
  /** Wichtigkeit (kürzere T-Route = höher). */
  weight: number;
  label: string;
};

/** Alle Halte-Slots der Karte (gecacht). */
export function ctSlots(info: BotMapInfo): CTSlot[] {
  const cached = info.cache.get('ctSlots') as CTSlot[] | undefined;
  if (cached) return cached;
  const out: CTSlot[] = [];
  for (const site of info.sites) {
    const tRoutes = routesTo(info, 'T', site.id);
    const entries = siteEntrances(info, site, 'attack');
    for (const pid of entries) {
      const p = info.portals[pid]!;
      const others = entries.filter((q) => q !== pid).map((q) => info.portals[q]!.pos);
      const spots = portalHoldSpots(info, pid, 'CT', { exposed: others });
      if (!spots.length) continue;
      const best = tRoutes.find((r) => r.entry === pid);
      out.push({ site: site.id, kind: 'site', watch: p.pos, from: portalApproach(info, pid), spots, weight: best ? 100 / best.length : 0.3, label: `${site.id.toUpperCase()}: ${info.zones[p.from]!.name}` });
    }
  }
  // Umkämpfte Punkte (je Ort einmal); gehören sie zu Routen beider Spots → Mitte (site null)
  const seen: { pos: XYZ; slot: CTSlot }[] = [];
  for (const r of info.routes.filter((q) => q.team === 'T' && q.contested && q.contestedFrom)) {
    const near = seen.find((s) => Math.hypot(s.pos.x - r.contested!.x, s.pos.z - r.contested!.z) < 8);
    if (near) {
      if (near.slot.site !== r.site) near.slot.site = null;
      continue;
    }
    const spots = holdSpots(info, r.contested!, 'CT', { from: r.contestedFrom!, min: 6, max: 30 });
    if (!spots.length) continue;
    const slot: CTSlot = { site: r.site, kind: 'forward', watch: r.contested!, from: r.contestedFrom!, spots, weight: 60 / r.length, label: `vorne: ${info.zones[info.zoneOf[nearestNode(info.nav, r.contested!.x, r.contested!.y, r.contested!.z)]!]?.name ?? '?'}` };
    seen.push({ pos: r.contested!, slot });
    out.push(slot);
  }
  info.cache.set('ctSlots', out);
  return out;
}

export type CTAssignment = { slot: CTSlot; spot: HoldSpot; anchor: boolean; site: SiteId | null };

/**
 * CT-Aufstellung: Spieler je Spot nach Teamgröße (1 → ein Spot, 2 → 1-1, 3 → 1-1-1 mit
 * Mitte, 4 → 2-1-1/2-2, 5 → 2-1-2 …), je Spot zuerst der Eingang der kürzesten T-Route,
 * manchmal eine vorgeschobene Position. Erster je Spot = Anker. Der Scharfschütze
 * bekommt die längste Sichtlinie.
 */
export function ctSetup(info: BotMapInfo, ids: readonly string[], rnd: () => number, awp: string | null = null): Map<string, CTAssignment> {
  const out = new Map<string, CTAssignment>();
  const slots = ctSlots(info);
  if (!slots.length || !ids.length) return out;
  const siteIds = info.sites.map((s) => s.id);
  const mid = slots.filter((s) => s.kind === 'forward' && s.site === null).sort((a, b) => b.weight - a.weight);
  // Verteilung auf Spots (+ Mitte)
  const n = ids.length;
  const counts = new Map<SiteId | 'mid', number>();
  const first: SiteId = siteIds[Math.floor(rnd() * siteIds.length) % siteIds.length] ?? 'a';
  const second: SiteId = siteIds.find((s) => s !== first) ?? first;
  const add = (k: SiteId | 'mid', c = 1): void => void counts.set(k, (counts.get(k) ?? 0) + c);
  if (n === 1) add(first);
  else if (n === 2) { add(first); add(second); }
  else {
    const useMid = mid.length > 0 && (n === 3 || n === 5 || rnd() < 0.5);
    let left = n;
    if (useMid) { add('mid'); left--; }
    add(first, Math.ceil(left / 2));
    add(second, Math.floor(left / 2));
  }
  const taken: XYZ[] = [];
  const choose = (slot: CTSlot, sniper: boolean): HoldSpot => {
    const list = sniper ? [...slot.spots].sort((a, b) => b.dist - a.dist) : slot.spots;
    const free = list.filter((s) => !taken.some((t) => Math.hypot(t.x - s.pos.x, t.z - s.pos.z) < 3));
    const pool = (free.length ? free : list).slice(0, sniper ? 2 : 3);
    const spot = pool[Math.floor(rnd() * pool.length) % pool.length]!;
    taken.push(spot.pos);
    return spot;
  };
  const queue = [...ids];
  // Scharfschütze zuerst auf die Slot-Liste mit der längsten Sicht
  if (awp && queue.includes(awp)) {
    queue.splice(queue.indexOf(awp), 1);
    queue.unshift(awp);
  }
  const plan: { key: SiteId | 'mid'; slot: CTSlot }[] = [];
  for (const [key, c] of counts) {
    const pool = key === 'mid' ? mid : slots.filter((s) => s.site === key).sort((a, b) => b.weight - a.weight);
    const siteSlots = pool.filter((s) => s.kind === 'site');
    const fwd = pool.filter((s) => s.kind === 'forward');
    for (let i = 0; i < c; i++) {
      let slot: CTSlot | undefined;
      if (key === 'mid') slot = pool[i % pool.length];
      else if (i > 0 && fwd.length && rnd() < 0.35) slot = fwd[Math.floor(rnd() * fwd.length) % fwd.length];
      else slot = siteSlots[i % Math.max(1, siteSlots.length)] ?? fwd[0];
      if (slot) plan.push({ key, slot });
    }
  }
  if (awp && plan.length) {
    // Längste Sichtlinie nach vorn sortieren
    const longest = plan.reduce((bi, p, i) => (Math.max(...p.slot.spots.map((s) => s.dist)) > Math.max(...plan[bi]!.slot.spots.map((s) => s.dist)) ? i : bi), 0);
    const [p] = plan.splice(longest, 1);
    plan.unshift(p!);
  }
  const anchored = new Set<SiteId | 'mid'>();
  queue.forEach((id, i) => {
    const p = plan[i % plan.length]!;
    const spot = choose(p.slot, id === awp);
    const anchor = p.key !== 'mid' && !anchored.has(p.key) && p.slot.kind === 'site';
    if (anchor) anchored.add(p.key);
    out.set(id, { slot: p.slot, spot, anchor, site: p.key === 'mid' ? null : p.key });
  });
  return out;
}

/** Spot fürs Ausführen: der mit deutlich weniger bekannten CT, sonst der Plan-Spot. */
export function chooseExecuteSite(info: BotMapInfo, k: TeamKnowledge, now: number, planned: SiteId): SiteId {
  if (info.sites.length < 2) return planned;
  const other: SiteId = planned === 'a' ? 'b' : 'a';
  if (!siteInfo(info, other) || !routesTo(info, 'T', other).length) return planned;
  const pPlan = sitePressure(k, info, planned, now, 25);
  const pOther = sitePressure(k, info, other, now, 25);
  return pPlan - pOther >= 1.2 ? other : planned;
}

/** Route eines Teams zum Spot, die zur aktuellen Position passt (Zone auf der Route, sonst nächster Bereitstellungsraum). */
export function routeFrom(info: BotMapInfo, site: SiteId, pos: XYZ, team: 'T' | 'CT' = 'T'): Route | null {
  const list = routesTo(info, team, site);
  if (!list.length) return null;
  const n = nearestNode(info.nav, pos.x, pos.y, pos.z, 8);
  const zone = n >= 0 ? info.zoneOf[n]! : -1;
  const on = list.filter((r) => r.zones.includes(zone));
  const pool = on.length ? on : list;
  let best = pool[0]!;
  let bd = Infinity;
  for (const r of pool) {
    const d = Math.hypot(r.staging.x - pos.x, r.staging.z - pos.z) + (on.length ? 0 : r.length * 0.1);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/**
 * Wegpunkte einer Route zwischen zwei Positionen: Portale ab der Zone von `from`
 * (bereits passierte entfallen) bis in die Zone von `goal` (ohne `goal` = bis zum Spot).
 */
export function viaBetween(info: BotMapInfo, route: Route, from: XYZ, goal?: XYZ): XYZ[] {
  const zoneOf = (p: XYZ): number => {
    const n = nearestNode(info.nav, p.x, p.y, p.z, 8);
    return n >= 0 ? info.zoneOf[n]! : -1;
  };
  const i0 = Math.max(0, route.zones.indexOf(zoneOf(from)));
  const gi = goal ? route.zones.indexOf(zoneOf(goal)) : -1;
  const i1 = gi >= 0 ? gi : route.zones.length - 1;
  return i1 > i0 ? route.via.slice(i0, i1) : [];
}

export type RetakeEntry = { entry: number; staging: XYZ };

/**
 * Retake: jeder CT bekommt einen Eingang des Spots (nächster; bei ähnlicher Entfernung
 * ein noch freier → Angriff von mehreren Seiten) und einen Sammelpunkt davor.
 */
export function retakePlan(info: BotMapInfo, site: SiteId, ctPositions: readonly { id: string; pos: XYZ }[]): Map<string, RetakeEntry> {
  const out = new Map<string, RetakeEntry>();
  const s = siteInfo(info, site);
  if (!s || !s.entrances.length) return out;
  const used = new Map<number, number>();
  const stagingOf = (pid: number): XYZ => {
    const a = portalApproach(info, pid, 9);
    let n = nearestNode(info.nav, a.x, a.y, a.z, 6);
    if (n < 0) n = info.portals[pid]!.fromNode;
    n = coverNear(info, n, 3);
    return { x: info.nav.x[n]!, y: info.nav.y[n]!, z: info.nav.z[n]! };
  };
  const sorted = [...ctPositions].sort((a, b) => Math.hypot(a.pos.x - s.plant.x, a.pos.z - s.plant.z) - Math.hypot(b.pos.x - s.plant.x, b.pos.z - s.plant.z));
  for (const ct of sorted) {
    const costs = s.entrances.map((pid) => ({ pid, c: Math.hypot(portalApproach(info, pid, 9).x - ct.pos.x, portalApproach(info, pid, 9).z - ct.pos.z) + Math.abs(info.portals[pid]!.pos.y - ct.pos.y) * 3 }));
    costs.sort((a, b) => a.c - b.c);
    let choice = costs[0]!;
    const fresh = costs.find((c) => !used.has(c.pid));
    if (fresh && fresh.c <= choice.c * 1.35 + 6) choice = fresh;
    used.set(choice.pid, (used.get(choice.pid) ?? 0) + 1);
    out.set(ct.id, { entry: choice.pid, staging: stagingOf(choice.pid) });
  }
  return out;
}
