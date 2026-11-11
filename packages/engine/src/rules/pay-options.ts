/**
 * The cost-payment options of a spell (CR 601.2f-h, D-116, D-120): Convoke (CR 702.51a), Improvise (CR
 * 702.126a) and Delve (CR 702.66a). Each is a static ability that functions while the spell is on the stack and
 * lets its caster pay some of the spell's total cost with other resources instead of mana: tap an untapped
 * creature (for one colored mana of one of its colors, or one generic mana), tap an untapped artifact (generic
 * mana) or exile a card from their graveyard (generic mana). None is an additional or alternative cost: each
 * applies only after the total cost is determined (CR 702.51b, 702.126b, 702.66b), so it works on the cost
 * after reductions and increases. Several instances of one keyword are redundant (CR 702.51d, 702.126c, 702.66c).
 *
 * The cost is read as slots (`slotsOf`): numeric symbols are generic slots, a colored symbol, a hybrid
 * symbol of two colors, the colored half of {2/W} or {C/W} and the colored part of {W/P} are colored slots,
 * and anything else ({C}, {S}) is not paid this way and stays in the cost. A creature taps for a slot of a
 * color it is, or any generic slot (CR 702.51a); the artifacts and the cards exiled pay generic slots only.
 *
 * Two uses:
 *  - the casting transaction (`rules/cast.ts`) asks the caster which resources to use (`choosePayOptions`),
 *    taps or exiles them, and takes the mana they paid off the cost. Which mana each creature paid is worked
 *    out here, colors first, among the ways that pay every chosen resource (`remainders`);
 *  - `canPaySpellCost` (`rules/cast-cost.ts`) adds the resources as extra mana sources of the payment planner
 *    (`payOptionSources`), so a spell is offered when the resources make it payable, the same planner that
 *    pays for it, with a creature that could also tap for mana counted once.
 */
import type { CardFace } from '../cards/definition';
import type { Color } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import type { PaymentSource } from '../mana';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat, patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { moveObject } from './zones';

export type PayMechanism = 'convoke' | 'improvise' | 'delve';

/** The order the questions are asked in. */
export const PAY_MECHANISMS: readonly PayMechanism[] = ['convoke', 'improvise', 'delve'];

/** The cost-payment keywords the face has, in the order they are asked (each at most once). */
export function payMechanismsOf(face: CardFace | null): PayMechanism[] {
  return PAY_MECHANISMS.filter((m) =>
    (face?.abilities ?? []).some((a) => a.kind === 'keyword' && a.keyword.kind === m),
  );
}

interface ColoredSlot {
  readonly symbol: string;
  readonly colors: readonly Color[];
}

interface Slots {
  readonly generic: number;
  readonly colored: readonly ColoredSlot[];
  /** Symbols nothing here pays: {C}, {S}, {X} (already settled before the cost is locked in). */
  readonly fixed: readonly string[];
}

const COLOR_LETTERS = 'WUBRG';

/** CR 702.51a: the mana of a cost a creature could pay for, as generic and colored slots. */
export function slotsOf(symbols: readonly string[]): Slots {
  let generic = 0;
  const colored: ColoredSlot[] = [];
  const fixed: string[] = [];
  for (const symbol of symbols) {
    const two = /^([WUBRG])\/([WUBRG])$/.exec(symbol);
    const half = /^(?:2|C)\/([WUBRG])$/.exec(symbol);
    const phyrexian = /^([WUBRG])\/P$/.exec(symbol);
    if (/^[0-9]+$/.test(symbol)) generic += Number(symbol);
    else if (symbol.length === 1 && COLOR_LETTERS.includes(symbol)) {
      colored.push({ symbol, colors: [symbol as Color] });
    } else if (two !== null) colored.push({ symbol, colors: [two[1] as Color, two[2] as Color] });
    else if (half !== null) colored.push({ symbol, colors: [half[1] as Color] });
    else if (phyrexian !== null) colored.push({ symbol, colors: [phyrexian[1] as Color] });
    else fixed.push(symbol);
  }
  return { generic, colored, fixed };
}

/** The symbols left once `generic` generic mana and the colored slots not in `used` are still to pay. */
function leftOf(slots: Slots, generic: number, used: number): string[] {
  return [
    ...(generic > 0 ? [String(generic)] : []),
    ...slots.colored.filter((_, k) => (used & (1 << k)) === 0).map((s) => s.symbol),
    ...slots.fixed,
  ];
}

/**
 * Every distinct cost that can be left when each of the resources (`items`, the colors of each: none for
 * generic only) pays for one mana of the cost, in the order colors-first: the ways that cover most colored
 * mana come first. Empty when some resource cannot pay for anything (too many, or no mana of its colors).
 */
export function remainders(
  symbols: readonly string[],
  items: readonly (readonly Color[])[],
): string[][] {
  const slots = slotsOf(symbols);
  const found = new Map<string, string[]>();
  const visited = new Set<string>();
  const walk = (i: number, generic: number, used: number): void => {
    const key = `${i}|${generic}|${used}`;
    if (visited.has(key)) return;
    visited.add(key);
    const colors = items[i];
    if (colors === undefined) {
      const left = leftOf(slots, generic, used);
      found.set(left.join(' '), left);
      return;
    }
    if (generic > 0) walk(i + 1, generic - 1, used);
    slots.colored.forEach((slot, k) => {
      if ((used & (1 << k)) === 0 && colors.some((c) => slot.colors.includes(c))) {
        walk(i + 1, generic, used | (1 << k));
      }
    });
  };
  walk(0, slots.generic, 0);
  const coloredLeft = (left: readonly string[]): number =>
    left.filter((s) => !/^[0-9]+$/.test(s)).length;
  return [...found.values()].sort((a, b) => {
    const byColors = coloredLeft(a) - coloredLeft(b);
    if (byColors !== 0) return byColors;
    const x = a.join(' ');
    const y = b.join(' ');
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** The most resources of `items` that can each pay for a different mana of the cost. */
export function maxAssignable(
  symbols: readonly string[],
  items: readonly (readonly Color[])[],
): number {
  const slots = slotsOf(symbols);
  const memo = new Map<string, number>();
  const best = (i: number, generic: number, used: number): number => {
    const colors = items[i];
    if (colors === undefined) return 0;
    const key = `${i}|${generic}|${used}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let most = best(i + 1, generic, used); // this one is not used
    if (generic > 0) most = Math.max(most, 1 + best(i + 1, generic - 1, used));
    slots.colored.forEach((slot, k) => {
      if ((used & (1 << k)) === 0 && colors.some((c) => slot.colors.includes(c))) {
        most = Math.max(most, 1 + best(i + 1, generic, used | (1 << k)));
      }
    });
    memo.set(key, most);
    return most;
  };
  return best(0, slots.generic, 0);
}

interface Candidate {
  readonly object: ObjectId;
  readonly colors: readonly Color[];
}

/**
 * The resources `seat` could use for the mechanism, before looking at the cost: the untapped creatures
 * (CR 702.51a; summoning sickness does not matter, tapping for convoke is not a {T} cost ability, CR 302.6) or
 * artifacts (CR 702.126a) they control, or the cards in their graveyard (CR 702.66a).
 */
export function payCandidates(
  state: GameState,
  seat: SeatId,
  mechanism: PayMechanism,
): Candidate[] {
  if (mechanism === 'delve') {
    return getSeat(state, seat).graveyard.map((object) => ({ object, colors: [] }));
  }
  const out: Candidate[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat || obj.tapped) continue;
    const d = derive(state, obj);
    if (mechanism === 'convoke' && d.types.includes('creature')) {
      out.push({ object: id, colors: d.colors });
    } else if (mechanism === 'improvise' && d.types.includes('artifact')) {
      out.push({ object: id, colors: [] });
    }
  }
  return out;
}

/** What the decision says before the planner has been asked what is payable (`suggested`, `choices`). */
export type PayOptionsBase = Omit<
  Extract<NewDecision, { kind: 'choosePayOptions' }>,
  'suggested' | 'choices'
>;

/** What each mechanism is asked for the cost still to pay: null when nothing could be used for it. */
export function payOptionsDecision(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  mechanism: PayMechanism,
  symbols: readonly string[],
): PayOptionsBase | null {
  const slots = slotsOf(symbols);
  const useful = payCandidates(state, seat, mechanism).filter(
    (c) =>
      slots.generic > 0 ||
      (mechanism === 'convoke' &&
        slots.colored.some((slot) => slot.colors.some((color) => c.colors.includes(color)))),
  );
  if (useful.length === 0) return null;
  return {
    kind: 'choosePayOptions',
    seat,
    source,
    mechanism,
    cost: symbols,
    candidates: useful.map((c) => c.object),
    ...(mechanism === 'convoke'
      ? { colors: Object.fromEntries(useful.map((c) => [c.object, c.colors])) }
      : {}),
    maxUsable: maxAssignable(
      symbols,
      useful.map((c) => c.colors),
    ),
  };
}

/** The colors of the chosen objects of a decision, in the order chosen (none for generic only). */
export function colorsOfChoice(
  d: { readonly colors?: Readonly<Record<ObjectId, readonly Color[]>> },
  objects: readonly ObjectId[],
): (readonly Color[])[] {
  return objects.map((id) => d.colors?.[id] ?? []);
}

/**
 * Whether the answer is legal for the decision (CR 601.2f-h): distinct candidates, each paying for a different
 * mana of the cost. A pure function of the decision, so the legal actions list only answers it accepts.
 */
export function payOptionsAnswerOk(
  d: {
    readonly cost: readonly string[];
    readonly candidates: readonly ObjectId[];
    readonly colors?: Readonly<Record<ObjectId, readonly Color[]>>;
  },
  objects: readonly ObjectId[],
): boolean {
  if (new Set(objects).size !== objects.length) return false;
  if (!objects.every((id) => d.candidates.includes(id))) return false;
  return objects.length === 0 || remainders(d.cost, colorsOfChoice(d, objects)).length > 0;
}

/**
 * Taps the creatures or artifacts, or exiles the graveyard cards, that the caster chose (CR 601.2h): tapping
 * is not a {T} ability (CR 302.6), so a summoning-sick creature may; the cards go to exile as cards, public like
 * the graveyard (CR 400.2).
 */
export function usePayOptions(
  state: GameState,
  mechanism: PayMechanism,
  objects: readonly ObjectId[],
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  for (const id of objects) {
    if (mechanism === 'delve') {
      const moved = moveObject(next, { object: id, to: 'exile' });
      if (moved.kind !== 'done') return null;
      next = moved.state;
      events.push(...moved.events);
    } else {
      next = patchObject(next, id, { tapped: true });
      events.push({ kind: 'tapped', object: id });
    }
  }
  return { state: next, events };
}

/**
 * The resources of the spell's cost-payment keywords as extra sources for the payment planner (see the file
 * comment): a creature of colors makes one mana of one of them, a colorless creature, an artifact or a graveyard
 * card makes mana that pays generic mana only. They exist only to ask whether the cost can be paid.
 */
export function payOptionSources(
  state: GameState,
  seat: SeatId,
  mechanisms: readonly PayMechanism[],
): PaymentSource[] {
  const out: PaymentSource[] = [];
  mechanisms.forEach((mechanism) => {
    const abilityIndex = -1 - PAY_MECHANISMS.indexOf(mechanism);
    for (const { object, colors } of payCandidates(state, seat, mechanism)) {
      const colored = mechanism === 'convoke' && colors.length > 0;
      out.push({
        object,
        abilityIndex,
        produces: colored ? colors.map((c) => [c]) : [['C']],
        tier: mechanism === 'convoke' ? 'creature' : 'artifact',
        snow: false,
        restriction: null,
        ...(colored ? {} : { genericOnly: true as const }),
      });
    }
  });
  return out;
}
