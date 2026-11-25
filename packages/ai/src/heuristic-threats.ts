/**
 * Threat scenarios of the turn planner (issue 624, phase 3): what the opponents could hold, reasoned by
 * category the way a player does ("can they have removal? a counterspell? a big haste creature with this
 * mana?"), instead of one random guess at their hand.
 *
 * The universe of what an opponent can hold is its POOL: the cards of its hand and library on the
 * determinized sample. `determinize` deals those slots from the opponent's decklist minus its public cards
 * (SPEC A31: the decklists are known), so the pool is the same multiset on every sample and never the
 * hidden truth. Each card of the pool is classified (`kindOf`) and is CASTABLE in a window when the mana
 * the opponent will have then pays for it: at instant speed during the agent's turn with the sources it
 * has untapped now, and anything but a counterspell or a trick on its own turn with all its sources.
 *
 * The chance that the opponent holds at least one castable card of a category is hypergeometric:
 * `1 - C(N - k, h) / C(N, h)` for a pool of N cards, k of them in the category, and a hand of h. A
 * category from `plan.minThreatChance` gets a scenario, at most `MAX_THREATS` of them by chance times
 * impact. Every scenario is the sample with the opponents' hands rearranged: the BASE scenario ("nothing
 * relevant") holds no card of any category, and the scenario of a category holds its most dangerous
 * castable card (deterministic choice) and otherwise nothing relevant. Only the hidden slots of the
 * opponent on the sample are dealt again, as `determinize` deals them; the sample is a copy and the real
 * game is never touched.
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
import { isHelpfulSpell } from './casual-helpful';
import { hasKeyword, isLand, manaValueOf, powerOf } from './casual-view';
import { canPayAll, type Unit, unitsOf } from './heuristic-mana';
import { isProtectionSpell } from './heuristic-protect';
import { isCounter, isInstantSpeed } from './heuristic-sets';
import { isRemovalSpell } from './heuristic-targets';
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

const WIPE =
  /\b(destroy|exile) (all|each|every) (creatures?|nonland permanents?|permanents?)\b|\bdeals? \d+ damage to each creature\b|\ball creatures get -/i;

/** The category of a card, or null when it is none of them. */
export function kindOf(o: ObjectView): ThreatKind | null {
  if (isLand(o)) return null;
  if (isCounter(o)) return 'counter';
  if (!o.types.includes('creature') && WIPE.test(o.oracleText)) return 'wipe';
  if (isRemovalSpell(o)) return 'removal';
  if (
    isInstantSpeed(o) &&
    !o.types.includes('creature') &&
    (isHelpfulSpell(o) || isProtectionSpell(o))
  ) {
    return 'trick';
  }
  if (o.types.includes('creature')) {
    if (hasKeyword(o, 'flash')) return 'flash';
    const power = powerOf(o);
    if (
      (hasKeyword(o, 'haste') && power >= 3) ||
      power >= 5 ||
      ((hasKeyword(o, 'flying') || hasKeyword(o, 'trample')) && power >= 4)
    ) {
      return 'threat';
    }
  }
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

/** One card of the pool: its object on the sample, its card, its view (from its owner's seat) and category. */
export interface PoolCard {
  readonly object: ObjectId;
  readonly card: CardId;
  readonly view: ObjectView;
  readonly kind: ThreatKind | null;
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
    return card === undefined || card === null
      ? []
      : [{ object: view.id, card, view, kind: kindOf(view) }];
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

/** The threats of every opponent of the agent (`view.viewer`), most important first, before the cut. */
export function threatsOf(
  view: GameView,
  sample: GameState,
  weights: AgentWeights,
  see: ViewOf = getView,
): Threat[] {
  const me = view.viewer;
  const out: Threat[] = [];
  for (const seat of view.seats) {
    if (seat.id === me || seat.hasLost || seat.handCount === 0) continue;
    const pool = poolOf(sample, seat.id, see);
    const now = unitsOfSeat(view, seat.id, false);
    const later = unitsOfSeat(view, seat.id, true);
    const byKind = new Map<ThreatKind, PoolCard[]>();
    for (const c of pool) {
      if (c.kind === null || !castable(c.view, c.kind, now, later)) continue;
      byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
    }
    for (const [kind, cards] of byKind) {
      const chance = atLeastOne(pool.length, cards.length, seat.handCount);
      const best = [...cards].sort(
        (a, b) =>
          manaValueOf(b.view) - manaValueOf(a.view) ||
          powerOf(b.view) - powerOf(a.view) ||
          (a.card < b.card ? -1 : a.card > b.card ? 1 : 0),
      )[0];
      if (best === undefined || chance < weights.plan.minThreatChance) continue;
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
  const kinds = new Map<SeatId, Map<CardId, ThreatKind | null>>();
  const pools = new Map<SeatId, PoolCard[]>();
  for (const seat of view.seats) {
    if (seat.id === view.viewer || seat.hasLost) continue;
    const pool = poolOf(sample, seat.id, see);
    pools.set(seat.id, pool);
    kinds.set(seat.id, new Map(pool.map((c) => [c.card, c.kind])));
  }
  const top = threatsOf(view, sample, weights, see).slice(0, MAX_THREATS);
  let none = 1;
  for (const seat of view.seats) {
    const chosen = top.filter((t) => t.seat === seat.id);
    if (chosen.length === 0) continue;
    none *=
      1 -
      atLeastOne(pools.get(seat.id)?.length ?? 0, sum(chosen.map((t) => t.count)), seat.handCount);
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

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
