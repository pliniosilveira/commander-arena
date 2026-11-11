import type {
  Amount,
  Color,
  DefinedPtAmount,
  ObjectFilter,
  ObjectRef,
  PtAmount,
  StaticPtAmount,
} from '@commander-arena/engine';
import type { IrAmount, IrNoun, IrPtTerm, Span } from '../ir/types';
import { missingFeatures } from './features';
import { colorLetter, lowerFilter, objectRefOf } from './nouns';
import type { LowerContext, LowerResult } from './types';

/**
 * The filter a count or an aggregate reads: the battlefield is the default zone, so a filter on the battlefield says
 * no zone, as the engine's own examples do (D-095).
 */
function countFilter(of: IrNoun): LowerResult<ObjectFilter> {
  const { zone, ...rest } = of.filter;
  return lowerFilter({
    ...of,
    filter: zone === 'battlefield' || zone === undefined ? rest : of.filter,
  });
}

/**
 * The object a stat or a counter is read from (CR 208.1, 122.1): `~`, a target, or the object whose event caused the
 * trigger, from last-known information when it left (CR 608.2h, 113.7a). A spell on the stack has no power
 * (CR 208.1: a creature's), whatever its card says.
 */
function statSource(
  of: IrNoun,
  ctx: LowerContext,
  at: Span,
  rule: string,
): LowerResult<
  Extract<
    ObjectRef,
    { kind: 'this' | 'target' | 'triggerSubject' | 'sacrificedCost' | 'sacrificed' }
  >
> {
  const ref = objectRefOf(of, ctx, { triggerSubject: true, sacrificed: true });
  if (!ref.ok) return ref;
  if (ref.value.kind === 'target') {
    const id = ref.value.id;
    const spec = ctx.targets.find((t) => t.id === id);
    if (spec?.what.kind === 'object' && spec.what.filter.zone === 'stack') {
      return { ok: false, needs: [], at, rule };
    }
    return { ok: true, value: ref.value, rule };
  }
  // `~` or a target, which the engine reads with last-known information (CR 608.2h): "Exile target creature. Its
  // controller gains life equal to its power." counts the power the creature had. `moved` is not something text
  // can name.
  // "The sacrificed creature" (stage P29, D-133): what the cost of the activated ability sacrificed.
  if (
    ref.value.kind === 'this' ||
    ref.value.kind === 'triggerSubject' ||
    ref.value.kind === 'sacrificedCost' ||
    ref.value.kind === 'sacrificed'
  ) {
    return { ok: true, value: ref.value, rule };
  }
  return { ok: false, needs: [], at, rule };
}

/**
 * An amount (CR 107.1 numbers, 107.3 X, 208.1 power, 202.3 mana value). X (stage P16, D-103) needs
 * `amount:x` and marks the context (`usesX`): the caller decides whether the text has an X to read,
 * a spell or an activated ability whose cost has one (CR 107.3a), and refuses it anywhere else (a
 * triggered or static ability, CR 107.3j); `validateCard` is the last gate. An X that the sentence defines ("where X
 * is the number of Zombies you control", stage P28, CR 107.3c) is that amount, written into each slot that says X.
 * `countOf` (D-095) is the number of objects a filter matches, counted as the instruction runs (CR 608.2c): the
 * battlefield is the default zone, so a filter on the battlefield says no zone, as the engine's own examples do.
 * Since stage P28 (D-131) the amounts that read the game follow: the toughness of an object, the counters on one, the
 * greatest or the total of a stat among a group, devotion, the colors of the commanders, half, multiples and sums of
 * those, the opponents who have more than you and what an earlier instruction did.
 */
export function lowerAmount(
  amount: IrAmount,
  ctx: LowerContext,
  rule: string,
): LowerResult<Amount> {
  const needs = (kind: string): LowerResult<Amount> | null => {
    const missing = missingFeatures([`amount:${kind}` as 'amount:x']);
    return missing.length > 0 ? { ok: false, needs: missing, at: amount.span, rule } : null;
  };
  switch (amount.kind) {
    case 'number':
      return { ok: true, value: amount.value, rule };
    case 'x': {
      const defined = ctx.xIs;
      if (defined !== null) {
        // CR 107.3c: X is what the text defines it as, wherever the sentence reads it.
        defined.used = true;
        ctx.xIs = null;
        try {
          return lowerAmount(defined.amount, ctx, rule);
        } finally {
          ctx.xIs = defined;
        }
      }
      const blocked = needs('x');
      if (blocked !== null) return blocked;
      ctx.usesX = true;
      return { ok: true, value: { kind: 'x' }, rule };
    }
    case 'powerOf': {
      const blocked = needs('powerOf');
      if (blocked !== null) return blocked;
      const of = statSource(amount.of, ctx, amount.span, rule);
      if (!of.ok) return of;
      return { ok: true, value: { kind: 'powerOf', of: of.value }, rule };
    }
    case 'toughnessOf': {
      const blocked = needs('toughnessOf');
      if (blocked !== null) return blocked;
      const of = statSource(amount.of, ctx, amount.span, rule);
      if (!of.ok) return of;
      return { ok: true, value: { kind: 'toughnessOf', of: of.value }, rule };
    }
    case 'countersOn': {
      const blocked = needs('countersOn');
      if (blocked !== null) return blocked;
      const of = statSource(amount.of, ctx, amount.span, rule);
      if (!of.ok) return of;
      return {
        ok: true,
        value: { kind: 'countersOn', of: of.value, counter: amount.counter },
        rule,
      };
    }
    case 'manaValueOf': {
      const of = objectRefOf(amount.of, ctx, { triggerSubject: true });
      if (!of.ok) return of;
      const blocked = needs('manaValueOf');
      if (blocked !== null) return blocked;
      // An object an earlier instruction named (a target): the engine's tests read the mana
      // value of a target that stays, one that moved and one that was countered (CR 202.3,
      // 608.2h); or (stage P37, D-180, CR 202.3, 601.2i) the object whose event caused the trigger, "that spell's mana value" of a cast
      // trigger, which `validateCard` accepts for a spell on the stack. The mana value of `~` itself is not something a rule reads.
      if (of.value.kind !== 'target' && of.value.kind !== 'triggerSubject') {
        return { ok: false, needs: [], at: amount.span, rule };
      }
      return { ok: true, value: { kind: 'manaValueOf', of: of.value }, rule };
    }
    case 'triggerDamage': {
      // "You gain that much life" (stage P29, D-133): the damage of the event that caused the trigger; `validateCard`
      // checks the trigger is one that has it.
      const blocked = needs('triggerDamage');
      if (blocked !== null) return blocked;
      return { ok: true, value: { kind: 'triggerDamage' }, rule };
    }
    case 'timesKicked': {
      // CR 702.33c: the engine counts the kicks of the source, the spell or the permanent. "It" is the
      // source only in an ability about the source itself (an enters trigger of ~), as for the
      // condition "it was kicked"; in a spell "it" may be a target, so only "~" is read there.
      const blocked = needs('timesKicked');
      if (blocked !== null) return blocked;
      if (amount.who === 'it' && !ctx.itIsSelf) {
        return { ok: false, needs: [], at: amount.span, rule };
      }
      return { ok: true, value: { kind: 'timesKicked' }, rule };
    }
    case 'manaSpent': {
      // "the amount of mana spent to cast it" (stage P39, D-184, CR 601.2h): the spell the ability belongs to, which the engine reads in "When you cast
      // this spell" only (the spell is the source there); "it" is that spell only when the ability is about the source itself.
      const blocked = needs('manaSpent');
      if (blocked !== null) return blocked;
      if (!ctx.selfCast || (amount.who === 'it' && !ctx.itIsSelf)) {
        return { ok: false, needs: [], at: amount.span, rule };
      }
      return {
        ok: true,
        value: {
          kind: 'manaSpent',
          ...(amount.fromType === undefined ? {} : { fromType: amount.fromType }),
        },
        rule,
      };
    }
    case 'lifeLostThisWay': {
      // CR 702.101a: the engine reads the life lost by a `loseLife` of the same text before this amount
      // (`validateCard` refuses it anywhere else); `lowerSentences` checks the order and refuses the rest.
      const blocked = needs('lifeLostThisWay');
      if (blocked !== null) return blocked;
      return { ok: true, value: { kind: 'lifeLostThisWay' }, rule };
    }
    case 'countOf': {
      const blocked = needs('countOf');
      if (blocked !== null) return blocked;
      const filter = countFilter(amount.of);
      if (!filter.ok) return filter;
      return { ok: true, value: { kind: 'countOf', filter: filter.value }, rule };
    }
    case 'aggregate': {
      const blocked = needs('aggregate');
      if (blocked !== null) return blocked;
      // "... as you cast this spell" (stage P32, D-147, CR 601.2d): read once as the spell is cast, which only the total of a divided
      // damage is; anywhere else the same words would be read as the spell resolves.
      if (amount.asCast === true && !ctx.readAsCast) {
        return { ok: false, needs: [], at: amount.span, rule };
      }
      const filter = countFilter(amount.of);
      if (!filter.ok) return filter;
      return {
        ok: true,
        value: { kind: 'aggregate', how: amount.how, stat: amount.stat, filter: filter.value },
        rule,
      };
    }
    case 'devotion': {
      const blocked = needs('devotion');
      if (blocked !== null) return blocked;
      const colors: Color[] = [];
      for (const word of amount.colors) {
        const letter = colorLetter(word);
        if (letter === undefined) return { ok: false, needs: [], at: amount.span, rule };
        colors.push(letter);
      }
      return { ok: true, value: { kind: 'devotion', colors }, rule };
    }
    case 'commanderManaValue': {
      // CR 903.3, 202.3 (stage P32, D-147): the greatest mana value among the controller's commanders, in any zone, as printed.
      const blocked = needs('commanderManaValue');
      if (blocked !== null) return blocked;
      return { ok: true, value: { kind: 'commanderManaValue' }, rule };
    }
    case 'commanderCasts': {
      // CR 903.8 (stage P68, D-229): the times the controller's commanders were cast from the command zone.
      const blocked = needs('commanderCasts');
      if (blocked !== null) return blocked;
      return { ok: true, value: { kind: 'commanderCasts' }, rule };
    }
    case 'commanderColors': {
      const blocked = needs('commanderColors');
      if (blocked !== null) return blocked;
      return { ok: true, value: { kind: 'commanderColors' }, rule };
    }
    case 'half': {
      const blocked = needs('half');
      if (blocked !== null) return blocked;
      const of = lowerAmount(amount.of, ctx, rule);
      if (!of.ok) return of;
      return { ok: true, value: { kind: 'half', of: of.value, round: amount.round }, rule };
    }
    case 'multiple': {
      const blocked = needs('multiple');
      if (blocked !== null) return blocked;
      // The engine's `multiple` is a whole number of 2 or more times an amount; one times is the amount itself.
      if (!Number.isSafeInteger(amount.factor) || amount.factor < 2) {
        return { ok: false, needs: [], at: amount.span, rule };
      }
      const of = lowerAmount(amount.of, ctx, rule);
      if (!of.ok) return of;
      return { ok: true, value: { kind: 'multiple', factor: amount.factor, of: of.value }, rule };
    }
    case 'sum': {
      const blocked = needs('sum');
      if (blocked !== null) return blocked;
      const parts: Amount[] = [];
      for (const part of amount.of) {
        const lowered = lowerAmount(part, ctx, rule);
        if (!lowered.ok) return lowered;
        parts.push(lowered.value);
      }
      if (parts.length < 2) return { ok: false, needs: [], at: amount.span, rule };
      return { ok: true, value: { kind: 'sum', of: parts }, rule };
    }
    case 'opponentsWithMore': {
      const blocked = needs('opponentsWithMore');
      if (blocked !== null) return blocked;
      return { ok: true, value: { kind: 'opponentsWithMore', stat: amount.stat }, rule };
    }
    case 'shortfall': {
      // CR 701.57 (stage P34, D-152): the limit less the mana value of the card an earlier instruction of this text found by exiling cards
      // until one was cast or kept (`moved`); `lowerSentences` only reaches it after such an instruction.
      const blocked = needs('shortfall');
      if (blocked !== null) return blocked;
      if (ctx.exiled !== 'cast') return { ok: false, needs: [], at: amount.span, rule };
      return {
        ok: true,
        value: { kind: 'shortfall', limit: amount.limit, of: { kind: 'moved' } },
        rule,
      };
    }
    case 'exiledStillThere': {
      // CR 400.7 (stage P34, D-152): the cards the instruction before it exiled, counted when a delayed trigger resolves.
      if (ctx.exiled !== 'top') return { ok: false, needs: [], at: amount.span, rule };
      return { ok: true, value: { kind: 'exiledStillThere' }, rule };
    }
    case 'thisWay': {
      // CR 608.2c: what an earlier instruction of this resolution did; `lowerSentences` checks that one of that kind
      // comes before it in the same list of effects and that the words name what it did.
      const blocked = needs('thisWay');
      if (blocked !== null) return blocked;
      // "that many" counts what the last instruction of its kind did: sacrificed permanents or discarded cards (stage P34).
      const what = amount.thatMany === true ? ctx.thisWay : amount.what;
      return { ok: true, value: { kind: 'thisWay', what }, rule };
    }
    case 'votesFor': {
      // "The number of profit votes" (stage P44, D-195, CR 701.38a): the votes for one option of a vote of the same text; the engine's validation
      // refuses it with no vote before it or with an option the vote does not offer.
      const blocked = needs('votesFor');
      if (blocked !== null) return blocked;
      return { ok: true, value: { kind: 'votesFor', option: amount.option }, rule };
    }
    case 'colorsAmong':
      // "For each color among permanents you control" (stage P37, D-180): the engine reads it only as a static ability's "+N/+N"
      // (`lowerStaticPtStep`); as the amount of an effect it is not lowered.
      return { ok: false, needs: [], at: amount.span, rule };
  }
}

/**
 * One half of the power and toughness change of a resolving effect (stage P20, D-115): a number as it
 * is, "+X" as the X announced (CR 107.3a: `amount:x`, and the context is marked as using X) and "-X" as
 * a multiple of it, `{ kind: 'times', factor: -1, of: { kind: 'x' } }` (`amount:times`).
 */
export function lowerPtTerm(
  term: IrPtTerm,
  at: Span,
  ctx: LowerContext,
  rule: string,
): LowerResult<PtAmount> {
  if (typeof term === 'number') return { ok: true, value: term, rule };
  const x = lowerAmount({ kind: 'x', span: at }, ctx, rule);
  if (!x.ok || term.sign === 1) return x;
  const missing = missingFeatures(['amount:times']);
  if (missing.length > 0) return { ok: false, needs: missing, at, rule };
  return { ok: true, value: { kind: 'times', factor: -1, of: x.value }, rule };
}

/**
 * What an effect adds to power or toughness for each object counted (stage P28, "All creatures get -1/-1 until end of
 * turn for each Swamp you control."): 0 stays 0, 1 is the count, another whole number a multiple of it, negative for
 * "-1/-1" (`amount:times`). The count is worked out once, as the effect resolves (CR 611.2c, 608.2h). An X as the step
 * ("+X/+X for each ...") would multiply two unknowns and is not read.
 */
export function lowerCountedPtStep(
  step: IrPtTerm,
  count: IrAmount,
  ctx: LowerContext,
  rule: string,
): LowerResult<PtAmount> {
  if (typeof step !== 'number') return { ok: false, needs: [], at: count.span, rule };
  if (step === 0) return { ok: true, value: 0, rule };
  const counted = lowerAmount(count, ctx, rule);
  if (!counted.ok || step === 1) return counted;
  const missing = missingFeatures(['amount:times']);
  if (missing.length > 0) return { ok: false, needs: missing, at: count.span, rule };
  return { ok: true, value: { kind: 'times', factor: step, of: counted.value }, rule };
}

/** Whether the filter, or one of its `anyOf` members, is something a static ability's count cannot read (D-115). */
function staticCannotRead(f: IrNoun['filter']): boolean {
  // D-115, CR 613.8: the count reads types, colors, subtypes, controller and zone and never a power or a
  // toughness (the filter rules read "with power 4 or greater", which the engine refuses here). The objects of
  // another player ("your opponents control") are not counted by a static ability here; the cards in the graveyards
  // of the opponents are the cards of their owners (CR 400.3), which a count reads (stage P28: "for each creature
  // card in your opponents' graveyards").
  const opponentsObjects = f.controller === 'opponent' && f.zone !== 'graveyard';
  return (
    f.power !== undefined ||
    f.toughness !== undefined ||
    f.attackingYou === true ||
    f.attackingOpponents === true ||
    f.attackingOrBlocking === true ||
    f.attacking === true ||
    f.manaValueX === true ||
    f.controllerDamagedBySource === true ||
    f.keywords !== undefined ||
    f.notKeywords !== undefined ||
    opponentsObjects ||
    typeof f.controller === 'object' ||
    (f.anyOf?.some(staticCannotRead) ?? false)
  );
}

/** A count the engine can read in a static ability (D-115): `countOf` and nothing that is not one. */
function countInStatic(
  amount: IrAmount,
  ctx: LowerContext,
  rule: string,
): LowerResult<Extract<Amount, { kind: 'countOf' }>> {
  if (amount.kind !== 'countOf') return { ok: false, needs: [], at: amount.span, rule };
  if (staticCannotRead(amount.of.filter)) return { ok: false, needs: [], at: amount.span, rule };
  const lowered = lowerAmount(amount, ctx, rule);
  if (!lowered.ok) return lowered;
  if (
    lowered.value === null ||
    typeof lowered.value !== 'object' ||
    lowered.value.kind !== 'countOf'
  ) {
    return { ok: false, needs: [], at: amount.span, rule };
  }
  return { ok: true, value: lowered.value, rule };
}

/** The sum of counts a static ability or a characteristic-defining ability reads (D-131): every part is a count. */
function sumInStatic(
  amount: Extract<IrAmount, { kind: 'sum' }>,
  ctx: LowerContext,
  rule: string,
): LowerResult<{
  readonly kind: 'sum';
  readonly of: readonly Extract<Amount, { kind: 'countOf' }>[];
}> {
  const missing = missingFeatures(['amount:sum']);
  if (missing.length > 0) return { ok: false, needs: missing, at: amount.span, rule };
  const parts: Extract<Amount, { kind: 'countOf' }>[] = [];
  for (const part of amount.of) {
    const counted = countInStatic(part, ctx, rule);
    if (!counted.ok) return counted;
    parts.push(counted.value);
  }
  if (parts.length < 2) return { ok: false, needs: [], at: amount.span, rule };
  return { ok: true, value: { kind: 'sum', of: parts }, rule };
}

/**
 * What a static ability adds for each object counted (stage P20, "gets +1/+1 for each artifact you
 * control"): 0 stays the number 0, 1 is the count, another whole number a multiple of it, negative for
 * "-1/-1 for each" (`amount:times`). The count is by the ability's controller and follows the board
 * (CR 611.3a).
 */
export function lowerStaticPtStep(
  step: number,
  count: IrAmount,
  ctx: LowerContext,
  rule: string,
): LowerResult<StaticPtAmount> {
  if (step === 0) return { ok: true, value: 0, rule };
  // "+1/+1 for each time you've cast your commander from the command zone this game" (stage P68, D-229): the engine's `commanderCasts`; a step other than 1 is
  // not a multiple the engine reads.
  if (count.kind === 'commanderCasts') {
    return step === 1
      ? lowerStaticAmount(count, ctx, rule)
      : { ok: false, needs: [], at: count.span, rule };
  }
  // "+1/+1 for each color among permanents you control" (stage P37, D-180, CR 105.2): the engine's `colorsAmong`, which follows the board; a step
  // other than 1 is not a multiple the engine reads.
  if (count.kind === 'colorsAmong') {
    const missing = missingFeatures(['amount:colorsAmong']);
    if (missing.length > 0) return { ok: false, needs: missing, at: count.span, rule };
    if (step !== 1 || staticCannotRead(count.of.filter)) {
      return { ok: false, needs: [], at: count.span, rule };
    }
    const { zone, ...rest } = count.of.filter;
    void zone;
    const filter = lowerFilter({ ...count.of, filter: rest });
    return filter.ok
      ? { ok: true, value: { kind: 'colorsAmong', filter: filter.value }, rule }
      : filter;
  }
  const counted = countInStatic(count, ctx, rule);
  if (!counted.ok || step === 1) return counted;
  const missing = missingFeatures(['amount:times']);
  if (missing.length > 0) return { ok: false, needs: missing, at: count.span, rule };
  return { ok: true, value: { kind: 'times', factor: step, of: counted.value }, rule };
}

/**
 * The amount of "gets +X/+X, where X is ..." in a static ability (stage P32, D-147): the greatest mana value among the controller's
 * commanders (the engine's `commanderManaValue`), or a count of permanents, which follows the board as a "+1/+1 for each" does. Any other
 * amount reads something a static ability does not (CR 613.8) and is refused.
 */
export function lowerStaticAmount(
  amount: IrAmount,
  ctx: LowerContext,
  rule: string,
): LowerResult<StaticPtAmount> {
  if (amount.kind === 'commanderManaValue') {
    const lowered = lowerAmount(amount, ctx, rule);
    return lowered.ok ? { ok: true, value: { kind: 'commanderManaValue' }, rule } : lowered;
  }
  if (amount.kind === 'commanderCasts') {
    const lowered = lowerAmount(amount, ctx, rule);
    return lowered.ok ? { ok: true, value: { kind: 'commanderCasts' }, rule } : lowered;
  }
  return lowerStaticPtStep(1, amount, ctx, rule);
}

/**
 * What a characteristic-defining ability is equal to (CR 604.3): the count, or the sum of counts, as the engine reads
 * it.
 */
export function lowerDefinedPt(
  count: IrAmount,
  ctx: LowerContext,
  rule: string,
): LowerResult<DefinedPtAmount> {
  return count.kind === 'sum' ? sumInStatic(count, ctx, rule) : countInStatic(count, ctx, rule);
}

/** The feature refs of the amounts this module can produce, for the dimension test. */
export const AMOUNT_NEEDS = [
  'amount:x',
  'amount:powerOf',
  'amount:manaValueOf',
  'amount:countOf',
  'amount:timesKicked',
  'amount:manaSpent',
  'amount:lifeLostThisWay',
  'amount:times',
  'amount:toughnessOf',
  'amount:countersOn',
  'amount:aggregate',
  'amount:devotion',
  'amount:commanderColors',
  'amount:commanderManaValue',
  'amount:commanderCasts',
  'amount:colorsAmong',
  'amount:half',
  'amount:multiple',
  'amount:sum',
  'amount:opponentsWithMore',
  'amount:thisWay',
  'amount:triggerDamage',
  'amount:votesFor',
] as const;
