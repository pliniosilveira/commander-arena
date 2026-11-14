/**
 * The total cost of a spell and whether it can be paid (CR 601.2b, 601.2f-h, D-095). Used by the
 * legal-action code (`canCast`) and by the casting transaction (`rules/cast.ts`), so what the engine
 * offers is what it then asks for.
 *
 * CR 601.2f: the total cost is the mana cost or the alternative cost, plus all additional costs and
 * cost increases, minus all cost reductions. Here that is, in order:
 *   1. the mana cost, with X generic mana for each {X} in it (CR 107.3a: X was announced before, CR
 *      601.2b, so it is part of the cost determined here; D-103); or the flashback cost (CR
 *      702.34a), or nothing for the `free` alternative cost "without paying its mana cost" (CR
 *      118.9), which has no {X} to pay (CR 107.3b),
 *   2. commander tax, when cast from the command zone (CR 903.8): an additional cost, so it applies
 *      to an alternative cost too (CR 118.9d),
 *   3. the kicker cost of a kicked spell (CR 702.33a) and the mana of the face's additional costs,
 *   4. minus the reductions: the generic mana of the cost, never below zero (CR 118.7a, 601.2f).
 * What the cost asks besides mana is the life of the kicker, of an additional `payLife` and of
 * "pay X life" (X times), the permanent to sacrifice and the number of cards to discard (CR 118.8).
 * The reductions take X generic mana off like any other generic mana: the total they reduce is the
 * one with X in it.
 *
 * The reductions come from the spell itself (a `this` static ability, which functions on the stack,
 * CR 113.6d) and from the static abilities of permanents on the battlefield that name the spell
 * (CR 604.2). The total is locked in once it is determined (CR 601.2f): the sacrifice that is paid
 * afterwards does not change it (CR 601.2h example).
 */
import type { CastAlternativeKind } from '../ast/features';
import type { Cost, NamedAlternativeKind, ObjectFilter } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { ObjectId, SeatId } from '../ids';
import type { PaymentPlan, PaymentSource } from '../mana';
import type { ManaColor } from '../mana/types';
import { definitionOf, getSeat, patchSeat, printedCard } from '../state/ops';
import type { GameObject, GameState, StackData } from '../state/types';
import {
  alternativeOf,
  escalateCostOf,
  flashbackCostOf,
  kickerLikeCostOf,
  manaSymbolsOf,
  modeCostsOf,
  namedAlternativeCostOf,
  replicateCostOf,
} from './alt-costs';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { expandKeywords } from './derive-keywords';
import { costReductionSources } from './derive-statics';
import { amountOf } from './effect-support';
import { lifeOf } from './enters';
import { asFace } from './layouts';
import { applyPaymentPlan, planFor } from './mana-engine';
import type { PlanOptions } from './mana-sources';
import { payMechanismsOf, payOptionSources } from './pay-options';
import { sacrificeCandidates, tapCandidates } from './sacrifice';
import { matchesFilter, type SelectContext } from './select';
import { hasX, largestPayableX, spellXCost, withX, type XCost } from './x-value';

/** How a spell is cast instead of from the hand or the command zone: see `PriorityOption`. */
export type CastAlternative = CastAlternativeKind;

/**
 * Where a spell is cast from. 'graveyard' is only for flashback (CR 702.34a), 'exile' only for a
 * card exiled on an Adventure (CR 715.3d), or one an effect lets the player cast (D-151); 'library' only for the top card, with
 * `castFromTopOfLibrary`.
 */
export type CastFrom = 'hand' | 'command' | 'graveyard' | 'exile' | 'library';

/** What a spell costs, with what the cost asks besides mana. */
export interface SpellCost {
  /** The mana symbols to pay (CR 601.2f), after the reductions; empty is {0}. */
  readonly symbols: readonly string[];
  /** The commander tax included in `symbols` before the reductions (CR 903.8). */
  readonly tax: number;
  /** Life paid: the kicker's and the additional costs' (CR 119.4). */
  readonly life: number;
  /** The permanent to sacrifice, by filter, or null. */
  readonly sacrifice: ObjectFilter | null;
  readonly sacrificeCount?: number;
  /** "You may sacrifice one or more creatures" (D-491): the permanents the caster may sacrifice, any number, or null; asked once the mana is paid, the spell is castable with none. */
  readonly sacrificeAny?: ObjectFilter | null;
  /** How many cards to discard. */
  readonly discard: number;
  /** How many other cards of the caster's graveyard are exiled (Escape, CR 702.138a, D-124). */
  readonly exile: number;
  /** The permanents tapped as part of the cost, or null (the `tapPermanents` alternative cost, D-149). */
  readonly tap: TapRequirement | null;
  /** D-351 (CR 609.4b): mana of any type can be spent on the spell, so any mana pays any symbol of `symbols`. */
  readonly anyType?: true;
}

/** "Tap four untapped creatures you control with flying" (D-149): how many permanents matching the filter are tapped. */
export interface TapRequirement {
  readonly filter: ObjectFilter;
  readonly count: number;
}

/** True for the alternative costs that are paid with mana and kept on the face (D-121). */
export function isNamedAlternative(
  alternative: CastAlternative | undefined,
): alternative is NamedAlternativeKind {
  return (
    alternative === 'overload' ||
    alternative === 'evoke' ||
    alternative === 'dash' ||
    alternative === 'spectacle' ||
    alternative === 'escape' ||
    alternative === 'madness' ||
    alternative === 'miracle' ||
    alternative === 'foretell' ||
    alternative === 'tapPermanents'
  );
}

/** The alternative cost a spell on the stack was cast for, or undefined for an ordinary cast. */
export function alternativeOfStack(
  stack: StackData | null | undefined,
): CastAlternative | undefined {
  if (stack?.flashback === true) return 'flashback';
  if (stack?.free === true) return 'free';
  return stack?.alt;
}

/** The face of a spell object, or null. */
function faceOfSpell(state: GameState, spell: GameObject): CardFace | null {
  const card = printedCard(spell);
  if (card === null) return null;
  return definitionOf(state, card).faces[spell.face] ?? null;
}

/**
 * The card `obj` as `face` of it as the spell it would be on the stack, cast by `seat`: what the
 * cost code looks at before the card has moved (`canCast`); the real cast passes the stack object.
 */
export function castAs(obj: GameObject, seat: SeatId, face: number): GameObject {
  return { ...asFace(obj, face), controller: seat };
}

const NUMERIC = /^[0-9]+$/;

/** The generic mana of a cost: the sum of its numeric symbols ({2}{R} has 2). */
function genericOf(symbols: readonly string[]): number {
  let n = 0;
  for (const s of symbols) if (NUMERIC.test(s)) n += Number(s);
  return n;
}

/**
 * CR 118.7a, 601.2f: reduces the generic mana of a cost by `by`, never below zero, leaving the
 * colored mana alone. A cost with no generic mana is not changed. A cost reduced to nothing is {0}:
 * an empty list.
 */
export function reduceGeneric(symbols: readonly string[], by: number): string[] {
  const numeric = symbols.filter((s) => NUMERIC.test(s));
  if (by <= 0 || numeric.length === 0) return [...symbols];
  const left = Math.max(0, genericOf(symbols) - by);
  const rest = symbols.filter((s) => !NUMERIC.test(s));
  return left > 0 ? [String(left), ...rest] : rest;
}

/**
 * How much the spell's cost is reduced (CR 601.2f): its own `this` reductions and those of the
 * battlefield permanents whose filter matches it, each counted now (CR 601.2f: when the cost is
 * determined). The spell is on the stack, so `excluded` keeps a card that has not moved yet from
 * counting itself in the zone it is in.
 */
function reductionFor(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  face: CardFace | null,
  excluded: ObjectId | undefined,
  optimistic = false,
  castFrom?: CastFrom,
): number {
  let total = 0;
  const base = excluded === undefined ? {} : { excluded };
  // CR 702.41a (D-120): Affinity is a static ability of the spell, expanded here from the keyword like the
  // other abilities `derive` expands; every instance applies (CR 702.41b).
  for (const a of expandKeywords(face?.abilities ?? [])) {
    if (a.kind !== 'static' || a.static.kind !== 'costReduction' || !('kind' in a.static.spells)) {
      continue;
    }
    // CR 601.2f (D-181): "This spell costs {3} less to cast if you control a creature with power 4 or greater" is read when the cost is determined.
    if (
      a.condition !== undefined &&
      !evaluateCondition(state, a.condition, {
        controller: seat,
        source: spell.id,
        ...base,
        ...(optimistic ? { spellTargetsMayHold: true } : {}),
      })
    ) {
      continue;
    }
    total += amountOf(state, a.static.amount, { controller: seat, source: spell.id, ...base }, []);
  }
  for (const source of costReductionSources(state)) {
    // The filter describes a spell being cast: it is on the stack (CR 601.2a).
    const ctx: SelectContext = {
      controller: controllerOf(state, source.object),
      source: source.object.id,
      ...base,
      // D-235: "spells you cast from anywhere other than your hand": the zone the card is cast from, before it has moved.
      ...(castFrom === undefined ? {} : { castFrom }),
      // D-424: "Aura spells you cast that target enchanted creature cost {3} less": before the targets are chosen the most favourable one is assumed.
      ...(optimistic ? { spellTargetsMayHold: true } : {}),
    };
    if (!matchesFilter(state, spell, { ...source.spells, zone: 'stack' }, ctx)) continue;
    total += amountOf(state, source.amount, ctx, []);
  }
  return total;
}

export interface CostRequest {
  readonly seat: SeatId;
  /** The spell: the stack object, or `castAs` of the card before it moves. */
  readonly spell: GameObject;
  readonly zone: CastFrom;
  readonly alternative: CastAlternative | undefined;
  readonly kicked: boolean;
  /**
   * How many times the kicker cost is paid (CR 702.33c, D-110): the count the caster chose for Multikicker. Left
   * out it is 1 for a kicked spell and 0 for one that is not, which is all plain Kicker has.
   */
  readonly kicks?: number;
  /** How many times the replicate cost is paid (CR 702.56a, D-129): 0 when it is not, or the spell has none. */
  readonly replicas?: number;
  /** The card's own object while it is still in its zone (see `reductionFor`). */
  readonly excluded?: ObjectId;
  /** The X announced for the spell (CR 107.3a, 601.2b): 0 when it has none or none was announced yet. */
  readonly x?: number;
  /**
   * How many modes were chosen (CR 700.2, 702.120a, D-145), for an escalate cost: left out, the modes the spell on the stack
   * has chosen (`StackData.chosenModes`); 0 for a spell that is not on the stack yet or not modal.
   */
  readonly modes?: number;
  /**
   * Which modes were chosen (their indexes, CR 700.2, 700.2h, D-433), for the costs a mode lists before its effect: left out, the modes the spell on the stack has chosen. Where
   * a caller has `modes` for the escalate cost it passes the set too.
   */
  readonly modeSet?: readonly number[];
  /**
   * Which way the caster pays the face's additional cost choice (`CardFace.additionalCostChoice`, D-181): left out, the one the spell on the stack
   * has chosen (`StackData.costOption`); with none chosen yet the cost has neither (`canPayRequest` asks about both).
   */
  readonly costOption?: 0 | 1;
  /** Whether a reduction that depends on the spell's targets is counted although none is chosen yet (D-207): the check that a spell may be cast at all. */
  readonly optimistic?: boolean;
  /**
   * Mana of any type can be spent to cast the spell (D-351, CR 609.4b): left out, what the spell on the stack says (`StackData.anyManaType`); true for a card that is not
   * on the stack yet (the check that an effect lets it be cast).
   */
  readonly anyType?: true;
}

/** The ways the caster could pay the additional cost choice of the face: both, or `undefined` once for a face with no choice (D-181). */
function costOptionsOf(face: CardFace | null): readonly (0 | 1 | undefined)[] {
  return face?.additionalCostChoice === undefined ? [undefined] : [0, 1];
}

/**
 * Whether `seat` can pay what `request` asks for `spell` (CR 118.3, 601.2h) in some way: with an additional cost choice not made yet
 * (D-181) it is enough that one of the two ways can be paid. Where the choice is made, `canPaySpellCost` of `spellCost` says for that way.
 */
export function canPayRequest(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  request: CostRequest,
): boolean {
  const chosen = request.costOption ?? spell.stack?.costOption;
  const options = chosen === undefined ? costOptionsOf(faceOfSpell(state, spell)) : [chosen];
  return options.some((option) =>
    canPaySpellCost(
      state,
      seat,
      spell,
      spellCost(state, {
        ...request,
        optimistic: true,
        ...(option === undefined ? {} : { costOption: option }),
      }),
    ),
  );
}

/** CR 601.2f: the total cost of the spell, from the state as it is now. */
export function spellCost(state: GameState, request: CostRequest): SpellCost {
  const { seat, spell, zone, alternative } = request;
  const face = faceOfSpell(state, spell);
  const flashback = alternative === 'flashback' ? flashbackCostOf(face) : null;
  // D-121: a named alternative cost (overload, ...) is paid instead of the mana cost.
  const named = isNamedAlternative(alternative) ? namedAlternativeCostOf(face, alternative) : null;
  const perX = spellXCost(face, alternative);
  const x = hasX(perX) ? (request.x ?? 0) : 0;
  const symbols: string[] =
    alternative === 'free'
      ? []
      : flashback !== null
        ? manaSymbolsOf(flashback)
        : named !== null
          ? // D-274: the X of a miracle cost is the announced one (every other named alternative has none).
            withX(manaSymbolsOf(named), x)
          : withX(face?.manaCost ?? [], x);
  let tax = 0;
  if (zone === 'command' && spell.card !== null) {
    const casts = state.commanderCasts[spell.card] ?? 0;
    tax = 2 * casts;
    for (let i = 0; i < casts; i += 1) symbols.push('2');
  }
  const kicks = request.kicks ?? (request.kicked ? 1 : 0);
  const kicker = kicks > 0 ? kickerLikeCostOf(face) : null;
  // CR 702.33c: a multikicker cost is paid once for each time the spell is kicked.
  if (kicker !== null) for (let i = 0; i < kicks; i += 1) symbols.push(...manaSymbolsOf(kicker));
  // CR 702.56a: a replicate cost is an additional cost, paid once for each time the caster chose (mana only).
  const replicate = (request.replicas ?? 0) > 0 ? replicateCostOf(face) : null;
  if (replicate !== null) {
    for (let i = 0; i < (request.replicas ?? 0); i += 1) symbols.push(...manaSymbolsOf(replicate));
  }
  // CR 702.120a (D-145): an escalate cost is paid for each mode chosen beyond the first, as an additional cost.
  const escalate = escalateCostOf(face);
  if (escalate !== null) {
    const modes = request.modes ?? spell.stack?.chosenModes.length ?? 0;
    for (let i = 1; i < modes; i += 1) symbols.push(...manaSymbolsOf(escalate));
  }
  // CR 700.2h, 702.183a (D-433): a mode with a cost before its effect is an additional cost if the mode is chosen; all the costs of the modes chosen are paid.
  symbols.push(
    ...manaSymbolsOf(modeCostsOf(face, request.modeSet ?? spell.stack?.chosenModes ?? [])),
  );
  // CR 118.8, 601.2b (D-181): one of the two ways of the additional cost choice, the one the caster announced.
  const option = request.costOption ?? spell.stack?.costOption;
  const additional: readonly Cost[] = [
    ...(face?.additionalCosts ?? []),
    ...(option === undefined ? [] : (face?.additionalCostChoice?.[option] ?? [])),
  ];
  symbols.push(...manaSymbolsOf(additional));
  let sacrifice: ObjectFilter | null = null;
  let sacrificeAny: ObjectFilter | null = null;
  let sacrificeCount = 1;
  let discard = 0;
  for (const c of additional) {
    if (c.kind === 'sacrifice' && !('kind' in c.what)) {
      // D-491: "you may sacrifice one or more creatures" is no requirement for casting the spell: it is asked as the cost is paid.
      if (c.anyNumber === true) sacrificeAny = c.what;
      else {
        sacrificeCount = c.countX === true ? x : 1;
        if (sacrificeCount > 0) sacrifice = c.what;
      }
    } else if (c.kind === 'discard') discard += c.count;
  }
  const life = lifeOf(additional) + (kicker === null ? 0 : lifeOf(kicker) * kicks) + perX.life * x;
  // D-386 (CR 107.3a, 601.2f): "discard X cards" is X cards of the hand in the total cost.
  discard += (perX.discard ?? 0) * x;
  const reduced = reduceGeneric(
    symbols,
    reductionFor(
      state,
      seat,
      spell,
      face,
      request.excluded,
      request.optimistic === true,
      request.zone,
    ),
  );
  // CR 702.138a: an escape cost also exiles that many other cards from the caster's graveyard.
  const exile = alternative === 'escape' ? (alternativeOf(face, 'escape')?.exile ?? 0) : 0;
  // D-149: a `tapPermanents` alternative cost also taps that many untapped permanents the caster controls.
  const tapAlt = alternative === 'tapPermanents' ? alternativeOf(face, 'tapPermanents') : null;
  const tap = tapAlt === null ? null : { filter: tapAlt.filter, count: tapAlt.count };
  const anyType = request.anyType === true || spell.stack?.anyManaType === true;
  return {
    symbols: reduced,
    tax,
    life,
    sacrifice,
    ...(sacrificeCount === 1 ? {} : { sacrificeCount }),
    ...(sacrificeAny === null ? {} : { sacrificeAny }),
    discard,
    exile,
    tap,
    ...(anyType ? { anyType: true as const } : {}),
  };
}

/** What one point of X costs for this spell cast as `alternative` (see `spellXCost`). */
export function spellXCostOf(
  state: GameState,
  spell: GameObject,
  alternative: CastAlternative | undefined,
): XCost {
  return spellXCost(faceOfSpell(state, spell), alternative);
}

/**
 * The largest X the caster could pay for this spell (CR 107.3a, 601.2b, D-103): every value from 0
 * up to it is payable, since a larger X only adds to the total cost. The rest of the total is in it:
 * commander tax, the kicker if it was paid, additional costs and the reductions (`spellCost`), and
 * what the payment planner can make of every mana source and the pool (`canPaySpellCost`). Life
 * paid for X may be all of the caster's life (CR 119.4).
 */
export function largestSpellX(state: GameState, request: CostRequest): number {
  const spell = request.spell;
  return largestPayableX((x) => canPayRequest(state, request.seat, spell, { ...request, x }));
}

/**
 * The cards in `seat`'s graveyard an escape cost can exile for `spell` (CR 702.138a: other cards, never the
 * card being cast). `spell` is the card itself while it is still in the graveyard (`canCast`) or the spell on
 * the stack once it has moved (the cast), which is in no graveyard either way.
 */
export function exilable(state: GameState, seat: SeatId, spell: ObjectId): ObjectId[] {
  return getSeat(state, seat).graveyard.filter((id) => id !== spell);
}

/** The cards in `seat`'s hand that can be discarded for the cost of `spell` (never the spell). */
export function discardable(state: GameState, seat: SeatId, spell: ObjectId): ObjectId[] {
  return getSeat(state, seat).hand.filter((id) => id !== spell);
}

/**
 * A payment plan for the mana of a spell that leaves what a sacrifice cost needs (CR 601.2g-h): the
 * mana is paid first, so a plan that sacrificed the only permanent the cost could sacrifice (a
 * Treasure for "sacrifice an artifact") would leave the cast stuck. The first plan is used unless
 * that happens; then a plan without the sources that sacrifice themselves is tried.
 */
export function castManaPlan(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  symbols: readonly string[],
  sacrifice: ObjectFilter | null,
  /** The creatures, artifacts and cards Convoke, Improvise and Delve could use (`rules/pay-options.ts`). */
  extraSources?: readonly PaymentSource[],
  /** The permanents the cost taps afterwards (D-149): the plan leaves enough of them untapped. */
  tap?: TapRequirement | null,
  /** D-351 (CR 609.4b): mana of any type can be spent on the spell: left out, what the spell on the stack says. */
  anyType: boolean = spell.stack?.anyManaType === true,
  sacrificeCount = 1,
): PaymentPlan | null {
  const derived = derive(state, spell);
  // D-149: mana that may be spent only on a spell of a type and creature type ("only to cast an Angel spell") reads the subtypes.
  const target = {
    types: derived.types,
    subtypes: derived.subtypes,
    ...(anyType ? { anyType: true as const } : {}),
  };
  const options = extraSources === undefined ? {} : { extraSources };
  const reserve = handReserve(state, seat, spell);
  const plan = planFor(state, seat, symbols, target, reserve, options);
  if (plan === null || (sacrifice === null && (tap ?? null) === null)) return plan;
  const leaves = (p: PaymentPlan): boolean => {
    const after = applyPaymentPlan(state, seat, p, p.lifePaid).state;
    return (
      (sacrifice === null ||
        sacrificeCandidates(after, seat, spell.id, sacrifice).length >= sacrificeCount) &&
      (tap == null || tapCandidates(after, seat, spell.id, tap.filter).length >= tap.count)
    );
  };
  if (leaves(plan)) return plan;
  // Without the sources that sacrifice themselves, and without those that tap a permanent the cost needs to tap.
  const kept = tap == null ? [] : tapCandidates(state, seat, spell.id, tap.filter);
  const variants: PlanOptions[] = [
    ...(sacrifice === null ? [] : [{ avoidSacrificing: true }]),
    ...(kept.length === 0 ? [] : [{ avoidObjects: kept }]),
    ...(sacrifice !== null && kept.length > 0
      ? [{ avoidSacrificing: true, avoidObjects: kept }]
      : []),
  ];
  for (const variant of variants) {
    const other = planFor(state, seat, symbols, target, reserve, { ...options, ...variant });
    if (other !== null && leaves(other)) return other;
  }
  return null;
}

/**
 * Issue 18: the colors of mana the cards still in the seat's hand ask for (the symbols of their mana costs, a hybrid or Phyrexian
 * symbol counting each of its colors). Automatic payment keeps the sources of these colors untapped when the spell being paid for
 * can be paid another way (`reserve` of the payment planner, a preference and never a reason to fail), so a second spell can be cast.
 */
function handReserve(state: GameState, seat: SeatId, spell: GameObject): readonly ManaColor[] {
  const colors = new Set<ManaColor>();
  for (const id of getSeat(state, seat).hand) {
    if (id === spell.id) continue;
    const obj = state.objects[id];
    if (obj === undefined) continue;
    for (const symbol of derive(state, obj).manaCost ?? []) {
      for (const letter of symbol.match(/[WUBRG]/g) ?? []) colors.add(letter as ManaColor);
    }
  }
  return [...colors];
}

/**
 * Whether `seat` can pay `cost` for `spell` (CR 118.3, 601.2h): the life (CR 119.4: at least as much life as is paid; the mana planner
 * then has no life of its own left to spend, `lifeAvailable` in `mana-sources.ts`), the cards to discard, a permanent to sacrifice and the mana.
 */
export function canPaySpellCost(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  cost: SpellCost,
): boolean {
  const life = getSeat(state, seat).life;
  // CR 119.4: life can be paid only if the life total is at least the payment; paying all of it is allowed (the player then has 0 life and
  // loses when state-based actions are next checked, CR 704.5a).
  if (cost.life > 0 && life < cost.life) return false;
  if (cost.discard > discardable(state, seat, spell.id).length) return false;
  if (cost.exile > exilable(state, seat, spell.id).length) return false;
  if (
    cost.sacrifice !== null &&
    sacrificeCandidates(state, seat, spell.id, cost.sacrifice).length < (cost.sacrificeCount ?? 1)
  ) {
    return false;
  }
  if (
    cost.tap !== null &&
    tapCandidates(state, seat, spell.id, cost.tap.filter).length < cost.tap.count
  ) {
    return false;
  }
  if (cost.symbols.length === 0) return true;
  const paid = cost.life > 0 ? patchSeat(state, seat, { life: life - cost.life }) : state;
  // D-120: Convoke, Improvise and Delve pay part of the total cost with creatures, artifacts and graveyard
  // cards, so they count as sources of the payment here (the caster chooses them as the cost is paid).
  const mechanisms = payMechanismsOf(faceOfSpell(state, spell));
  const extra = mechanisms.length === 0 ? undefined : payOptionSources(state, seat, mechanisms);
  return (
    castManaPlan(
      paid,
      seat,
      spell,
      cost.symbols,
      cost.sacrifice,
      extra,
      cost.tap,
      cost.anyType === true,
      cost.sacrificeCount ?? 1,
    ) !== null
  );
}

/**
 * What the card in a hand or a command zone would cost to cast as its front face now, as mana
 * symbols after commander tax and reductions (D-095): what the view shows, so the player and the AI
 * read the real cost. Null for a card with no mana cost (a land). Additional costs are not mana and
 * are not in it (`ObjectView.additionalCosts`); kicker and the alternative costs are not either.
 */
export function castCostOf(state: GameState, obj: GameObject): readonly string[] | null {
  if (obj.card === null || (obj.zone !== 'hand' && obj.zone !== 'command')) return null;
  const face = definitionOf(state, obj.card).faces[0];
  if (face === undefined || face.manaCost === null) return null;
  const spell = castAs(obj, obj.owner, 0);
  const symbols = spellCost(state, {
    seat: obj.owner,
    spell,
    zone: obj.zone,
    alternative: undefined,
    kicked: false,
    excluded: obj.id,
  }).symbols;
  // The {X} of the card is shown as printed: its value is announced as it is cast (D-103).
  return [...face.manaCost.filter((s) => s === 'X'), ...symbols];
}

/** A named alternative cost of a card and what it costs now (`ObjectView.alternativeCosts`, D-121, D-124). */
export interface AlternativeCostInfo {
  readonly kind: NamedAlternativeKind;
  readonly cost: readonly string[];
  /** For escape: how many other cards of the graveyard are exiled too. */
  readonly exile?: number;
  /** For `tapPermanents` (D-149): the untapped permanents tapped too. */
  readonly tap?: TapRequirement;
}

/**
 * What the card in a hand or a command zone would cost to cast for each named alternative cost its front
 * face lists, as mana symbols after commander tax and reductions (D-121): what the view shows next to
 * `castCostOf`. A card in its owner's graveyard lists only its escape cost (CR 702.138a), with the number of
 * other cards it exiles (D-124); the other alternatives are cast from the hand and the command zone. Empty for
 * a card with none, a land, and in every other zone.
 */
export function alternativeCostsOf(state: GameState, obj: GameObject): AlternativeCostInfo[] {
  const zone = obj.zone;
  // A card foretold in exile lists its foretell cost (CR 702.143a, D-128).
  const foretold = zone === 'exile' && obj.foretoldTurn !== undefined;
  if (
    obj.card === null ||
    (zone !== 'hand' && zone !== 'command' && zone !== 'graveyard' && !foretold)
  ) {
    return [];
  }
  const face = definitionOf(state, obj.card).faces[0];
  const spell = castAs(obj, obj.owner, 0);
  const out: AlternativeCostInfo[] = [];
  for (const alt of face?.alternativeCosts ?? []) {
    // Madness and miracle are cast only as their ability resolves (CR 702.35a, 702.94a), never from a hand: no cast option, so no cost to show.
    if (!isNamedAlternative(alt.kind) || alt.kind === 'madness' || alt.kind === 'miracle') continue;
    // Where each is cast from: escape from a graveyard, foretell from exile, the others from a hand or a command zone.
    const home = alt.kind === 'escape' ? 'graveyard' : alt.kind === 'foretell' ? 'exile' : 'hand';
    if (home !== (zone === 'command' ? 'hand' : zone)) continue;
    const { symbols, exile, tap } = spellCost(state, {
      seat: obj.owner,
      spell,
      zone,
      alternative: alt.kind,
      kicked: false,
      excluded: obj.id,
    });
    out.push({
      kind: alt.kind,
      cost: symbols,
      ...(exile > 0 ? { exile } : {}),
      ...(tap === null ? {} : { tap }),
    });
  }
  return out;
}
