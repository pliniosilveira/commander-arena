/**
 * Threat scenarios of the turn planner (issue 624, phase 3): what the opponents could hold, reasoned by
 * category the way a player does ("can they have removal? a counterspell? a big haste creature with this
 * mana?"), instead of one random guess at their hand.
 *
 * The universe of what an opponent can hold is its POOL: the cards of its hand and library on the
 * determinized sample. `determinize` deals those slots from the opponent's decklist minus its public cards
 * (SPEC A31: the decklists are known), so the pool is the same multiset on every sample and never the
 * hidden truth. Each card of the pool is classified (`kindOf`) from the engine's parsed abilities
 * (`heuristic-card-traits.ts`) and the opponent's profile (`heuristic-profile.ts`), and is CASTABLE in a
 * window when the mana the opponent will have then pays for it: at instant speed during the agent's turn
 * with the sources it has untapped now, and anything but a counterspell or a trick on its own turn with all
 * its sources.
 *
 * The profile decides which questions are worth asking (issue 653, step 2b). The planner looks to the start
 * of the agent's next turn, so a big creature is a THREAT only when it can attack before then: it has haste,
 * or a permanent of its controller gives haste; a deck with neither gets no threat scenario. A counterspell,
 * a trick or a flash creature (what open mana on the agent's turn means) is asked about from an aggro deck,
 * which taps out on its own turn, only from `plan.aggroOpenMana` times the usual chance.
 *
 * The chance that the opponent holds at least one castable card of a category is hypergeometric:
 * `1 - C(N - k, h) / C(N, h)` for a pool of N cards, k of them in the category, and a hand of h. A
 * category from `plan.minThreatChance` gets a scenario, at most `MAX_THREATS` of them by chance times
 * impact. Every scenario is the sample with the opponents' hands rearranged: the BASE scenario ("nothing
 * relevant") holds no card of any category, and the scenario of a category holds its most dangerous
 * castable card (deterministic choice) and otherwise nothing relevant. Only the hidden slots of the
 * opponent on the sample are dealt again, as `determinize` deals them; the sample is a copy and the real
 * game is never touched.
 *
 * The attack search asks the same pool one more question (`hiddenAttackersOf`): which creature the opponent
 * could cast and attack with before the agent's next turn (haste on its own turn, flash with the mana it has
 * open now), and how likely it is to hold one.
 */
import {
  type CardId,
  type GameState,
  type GameView,
  getView,
  type ObjectId,
  type ObjectView,
  type SeatId,
} from '@commander-arena/engine';
import { isLand, manaValueOf, powerOf } from './casual-view';
import { type CardTraits, traitsOf } from './heuristic-card-traits';
import { hitDamage } from './heuristic-danger';
import { canPayAll, type Unit, unitsOf } from './heuristic-mana';
import { attacksAtOnce, definitionOf, type OpponentProfile, profileOf } from './heuristic-profile';
import { isInstantSpeed } from './heuristic-sets';
import type { AgentWeights } from './weights';

export type ThreatKind = 'counter' | 'wipe' | 'removal' | 'trick' | 'flash' | 'threat';

/** How much a category can change a turn, to rank categories of equal chance (a bound, not a weight). */
const IMPACT: Readonly<Record<ThreatKind, number>> = {
  wipe: 4,
  counter: 3,
  removal: 3,
  threat: 3,
  flash: 2,
  trick: 1.5,
};

/** The most categories that get a scenario of their own (a bound of the search). */
export const MAX_THREATS = 3;

/** The least power of a creature that is a threat when it can attack at once (a bound, not a weight). */
const THREAT_POWER = 3;

/** The categories an opponent casts during the agent's turn, with the mana it left open. */
const OPEN_MANA: ReadonlySet<ThreatKind> = new Set(['counter', 'trick', 'flash']);

/**
 * The category of a card of an opponent's pool, or null when it is none of them: `o` is its view in the hand,
 * `t` its traits and `p` the opponent's profile (`hasteOnBoard`).
 */
export function kindOf(
  o: ObjectView,
  t: CardTraits,
  p: Pick<OpponentProfile, 'hasteOnBoard'>,
): ThreatKind | null {
  if (isLand(o)) return null;
  if (t.counter && t.instantSpeed) return 'counter';
  if (!t.creature && t.wipe) return 'wipe';
  if (!t.creature && t.removal) return 'removal';
  if (t.trick) return 'trick';
  if (t.creature && t.flash) return 'flash';
  if (attacksAtOnce(t, p) && powerOf(o) >= THREAT_POWER) return 'threat';
  return null;
}

/** The chance that a hand of `h` cards from a pool of `n` holds at least one of `k` (hypergeometric). */
export function atLeastOne(n: number, k: number, h: number): number {
  if (k <= 0 || h <= 0 || n <= 0) return 0;
  if (h > n - k) return 1;
  let none = 1;
  for (let i = 0; i < h; i += 1) none *= (n - k - i) / (n - i);
  return 1 - none;
}

/** One card of the pool: its object on the sample, its card, its view (from its owner's seat) and traits. */
export interface PoolCard {
  readonly object: ObjectId;
  readonly card: CardId;
  readonly view: ObjectView;
  readonly traits: CardTraits;
}

/** How a view is built: `getView`, or the counted one of a planning (`heuristic-plan-work.ts`). */
export type ViewOf = (state: GameState, seat: SeatId) => GameView;

/**
 * The pool of `seat` on `sample` (its hand and library), read as its owner would see the cards in hand:
 * the view of a throwaway copy whose library is moved into the hand. Only the cards of the sample's hidden
 * slots are read, never the real game's.
 */
export function poolOf(sample: GameState, seat: SeatId, see: ViewOf = getView): PoolCard[] {
  const s = sample.seats.find((x) => x.id === seat);
  if (s === undefined) return [];
  const ids = [...s.hand, ...s.library];
  const objects = { ...sample.objects };
  for (const id of s.library) {
    const obj = objects[id];
    if (obj !== undefined) objects[id] = { ...obj, zone: 'hand', zoneOwner: seat };
  }
  const copy: GameState = {
    ...sample,
    objects,
    pending: null,
    seats: sample.seats.map((x) => (x.id === seat ? { ...x, hand: ids, library: [] } : x)),
  };
  const hand = see(copy, seat).seats.find((x) => x.id === seat)?.hand ?? [];
  return hand.flatMap((view) => {
    const card = sample.objects[view.id]?.card;
    const def = card === undefined || card === null ? undefined : definitionOf(sample, card);
    return card === undefined || card === null || def === undefined
      ? []
      : [{ object: view.id, card, view, traits: traitsOf(def) }];
  });
}

/** The units of mana `seat` has: untapped now, or all of them (its own next turn). */
function unitsOfSeat(view: GameView, seat: SeatId, all: boolean): Unit[] {
  return view.battlefield
    .filter((o) => o.controller === seat)
    .flatMap((o) => unitsOf(all ? { ...o, tapped: false, summoningSick: false } : o));
}

const costOf = (o: ObjectView): readonly string[] => o.castCost ?? o.manaCost ?? [];

/**
 * Whether the card can be cast in a window the plan plays through (see the module comment). A counterspell
 * and a trick matter only against the agent's own turn, so only the mana open now counts for them.
 */
function castable(
  o: ObjectView,
  kind: ThreatKind,
  now: readonly Unit[],
  later: readonly Unit[],
): boolean {
  if (isInstantSpeed(o) && canPayAll([costOf(o)], now)) return true;
  return kind !== 'counter' && kind !== 'trick' && canPayAll([costOf(o)], later);
}

export interface Threat {
  readonly seat: SeatId;
  readonly kind: ThreatKind;
  /** The chance the seat holds at least one castable card of the kind. */
  readonly chance: number;
  /** The card a scenario of this threat puts in the hand: the most dangerous castable one. */
  readonly card: CardId;
  /** How many castable cards of the kind are in the pool. */
  readonly count: number;
}

/** The pools and profiles of the agent's living opponents on `sample`. */
export interface Opponents {
  readonly pools: ReadonlyMap<SeatId, readonly PoolCard[]>;
  readonly profiles: ReadonlyMap<SeatId, OpponentProfile>;
}

/** The pool and the profile of each living opponent of the agent (`view.viewer`), each pool read once. */
export function opponentsOf(view: GameView, sample: GameState, see: ViewOf = getView): Opponents {
  const pools = new Map<SeatId, PoolCard[]>();
  const profiles = new Map<SeatId, OpponentProfile>();
  for (const seat of view.seats) {
    if (seat.id === view.viewer || seat.hasLost) continue;
    const pool = poolOf(sample, seat.id, see);
    pools.set(seat.id, pool);
    profiles.set(seat.id, profileOf(view, sample, seat.id, pool));
  }
  return { pools, profiles };
}

/** The least chance at which a category of `profile` gets a scenario (see the module comment). */
function floorOf(kind: ThreatKind, profile: OpponentProfile | undefined, w: AgentWeights): number {
  const open = OPEN_MANA.has(kind) && profile?.archetype === 'aggro';
  return w.plan.minThreatChance * (open ? w.plan.aggroOpenMana : 1);
}

/**
 * The threats of every opponent of the agent (`view.viewer`), most important first, before the cut. `known`
 * holds the opponents' pools and profiles when the caller has read them already (`scenariosOf`), so none is
 * read twice.
 */
export function threatsOf(
  view: GameView,
  sample: GameState,
  weights: AgentWeights,
  known: Opponents = opponentsOf(view, sample),
): Threat[] {
  const me = view.viewer;
  const out: Threat[] = [];
  for (const seat of view.seats) {
    if (seat.id === me || seat.hasLost || seat.handCount === 0) continue;
    const pool = known.pools.get(seat.id) ?? [];
    const profile = known.profiles.get(seat.id);
    const hasteOnBoard = profile?.hasteOnBoard ?? false;
    const now = unitsOfSeat(view, seat.id, false);
    const later = unitsOfSeat(view, seat.id, true);
    const byKind = new Map<ThreatKind, PoolCard[]>();
    for (const c of pool) {
      const kind = kindOf(c.view, c.traits, { hasteOnBoard });
      if (kind === null || !castable(c.view, kind, now, later)) continue;
      byKind.set(kind, [...(byKind.get(kind) ?? []), c]);
    }
    for (const [kind, cards] of byKind) {
      const chance = atLeastOne(pool.length, cards.length, seat.handCount);
      const best = [...cards].sort(
        (a, b) =>
          manaValueOf(b.view) - manaValueOf(a.view) ||
          powerOf(b.view) - powerOf(a.view) ||
          (a.card < b.card ? -1 : a.card > b.card ? 1 : 0),
      )[0];
      if (best === undefined || chance < floorOf(kind, profile, weights)) continue;
      out.push({ seat: seat.id, kind, chance, card: best.card, count: cards.length });
    }
  }
  return out.sort(
    (a, b) =>
      b.chance * IMPACT[b.kind] - a.chance * IMPACT[a.kind] ||
      a.seat - b.seat ||
      (a.kind < b.kind ? -1 : 1),
  );
}

export interface Scenario {
  readonly label: string;
  readonly weight: number;
  readonly state: GameState;
}

/**
 * The sample with the hand of each opponent holding no card of any category, and with `insert` (one card
 * of one opponent's pool) put into that opponent's first hand slot. Cards move between the opponent's own
 * hidden slots only (hand and library), as `determinize` deals them.
 */
function arrange(
  sample: GameState,
  kinds: ReadonlyMap<SeatId, ReadonlyMap<CardId, ThreatKind | null>>,
  insert: { seat: SeatId; card: CardId } | null,
): GameState {
  const objects = { ...sample.objects };
  const cardAt = (id: ObjectId): CardId | null => objects[id]?.card ?? null;
  const swap = (a: ObjectId, b: ObjectId): void => {
    const x = objects[a];
    const y = objects[b];
    if (x === undefined || y === undefined) return;
    objects[a] = { ...x, card: y.card };
    objects[b] = { ...y, card: x.card };
  };
  for (const seat of sample.seats) {
    const kind = kinds.get(seat.id);
    if (kind === undefined) continue;
    const relevant = (id: ObjectId): boolean => {
      const c = cardAt(id);
      return c !== null && (kind.get(c) ?? null) !== null;
    };
    const hand = [...seat.hand];
    const fixed = new Set<ObjectId>();
    if (insert !== null && insert.seat === seat.id && hand.length > 0) {
      const into = hand[0] as ObjectId;
      const from = [...seat.hand, ...seat.library].find((id) => cardAt(id) === insert.card);
      if (from !== undefined && from !== into) swap(into, from);
      fixed.add(into);
    }
    let next = 0;
    for (const id of hand) {
      if (fixed.has(id) || !relevant(id)) continue;
      while (next < seat.library.length && relevant(seat.library[next] as ObjectId)) next += 1;
      const filler = seat.library[next];
      if (filler === undefined) break;
      swap(id, filler);
      next += 1;
    }
  }
  return { ...sample, objects };
}

/**
 * The scenarios a line is scored on: the base ("nothing relevant") and one for each of the top threats,
 * weighted so they sum to 1: the base gets the chance that no opponent holds any of the chosen kinds, the
 * threats share the rest in proportion to their chances.
 */
export function scenariosOf(
  view: GameView,
  sample: GameState,
  weights: AgentWeights,
  see: ViewOf = getView,
): Scenario[] {
  const known = opponentsOf(view, sample, see);
  const kinds = kindsOf(known);
  const top = threatsOf(view, sample, weights, known).slice(0, MAX_THREATS);
  let none = 1;
  for (const seat of view.seats) {
    const chosen = top.filter((t) => t.seat === seat.id);
    if (chosen.length === 0) continue;
    none *=
      1 -
      atLeastOne(
        known.pools.get(seat.id)?.length ?? 0,
        sum(chosen.map((t) => t.count)),
        seat.handCount,
      );
  }
  const total = sum(top.map((t) => t.chance));
  const base: Scenario = {
    label: 'base',
    weight: top.length === 0 ? 1 : none,
    state: arrange(sample, kinds, null),
  };
  return [
    base,
    ...top.map((t) => ({
      label: `${t.kind}@${t.seat}`,
      weight: total === 0 ? 0 : ((1 - none) * t.chance) / total,
      state: arrange(sample, kinds, { seat: t.seat, card: t.card }),
    })),
  ];
}

/** The category of each card of each opponent's pool. */
function kindsOf(known: Opponents): Map<SeatId, Map<CardId, ThreatKind | null>> {
  const kinds = new Map<SeatId, Map<CardId, ThreatKind | null>>();
  for (const [seat, pool] of known.pools) {
    const hasteOnBoard = known.profiles.get(seat)?.hasteOnBoard ?? false;
    kinds.set(seat, new Map(pool.map((c) => [c.card, kindOf(c.view, c.traits, { hasteOnBoard })])));
  }
  return kinds;
}

/**
 * The base scenario ("nothing relevant" in any opponent's hand) of another sample: the second sample of the
 * deepening (`heuristic-plan-deep.ts`), which deals the agent's own library and the opponents' hidden slots
 * again. Its weight is the caller's to set.
 */
export function baseScenarioOf(view: GameView, sample: GameState, see: ViewOf = getView): Scenario {
  return {
    label: 'base#2',
    weight: 1,
    state: arrange(sample, kindsOf(opponentsOf(view, sample, see)), null),
  };
}

/** A creature an opponent may cast and attack with before the agent's next turn, and how likely it holds one. */
export interface HiddenAttacker {
  /** The chance it holds at least one such creature it can pay for, once it has drawn for its turn. */
  readonly chance: number;
  /** The one that would hit hardest, as it would attack: on its battlefield, untapped. */
  readonly attacker: ObjectView;
}

/**
 * For each living opponent of the agent whose deck can do it (its profile: a creature with haste, or haste given by a
 * permanent it controls, or one with flash): the creature of its pool it could cast and attack with before the
 * agent's next turn, haste on its own turn with all its mana, flash during the agent's turn with the mana it has
 * open now; with the chance that its hand holds one once it has drawn. Opponents with none are left out.
 */
export function hiddenAttackersOf(
  view: GameView,
  sample: GameState,
  known: Opponents = opponentsOf(view, sample),
): Map<SeatId, HiddenAttacker> {
  const out = new Map<SeatId, HiddenAttacker>();
  for (const seat of view.seats) {
    const pool = known.pools.get(seat.id);
    const profile = known.profiles.get(seat.id);
    if (pool === undefined || profile === undefined || seat.handCount + seat.libraryCount === 0)
      continue;
    const now = unitsOfSeat(view, seat.id, false);
    const later = unitsOfSeat(view, seat.id, true);
    const fits = pool.filter(
      (c) =>
        powerOf(c.view) > 0 &&
        ((attacksAtOnce(c.traits, profile) && canPayAll([costOf(c.view)], later)) ||
          (c.traits.creature && c.traits.flash && canPayAll([costOf(c.view)], now))),
    );
    const best = [...fits].sort(
      (a, b) => hitDamage(b.view) - hitDamage(a.view) || (a.card < b.card ? -1 : 1),
    )[0];
    if (best === undefined) continue;
    const hand = seat.handCount + (seat.libraryCount > 0 ? 1 : 0);
    out.set(seat.id, {
      chance: atLeastOne(pool.length, fits.length, hand),
      attacker: {
        ...best.view,
        zone: 'battlefield',
        controller: seat.id,
        tapped: false,
        summoningSick: false,
        damage: 0,
      },
    });
  }
  return out;
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
