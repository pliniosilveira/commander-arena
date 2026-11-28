/**
 * Condition rules of the Peace Offering deck: "if you have exactly thirteen cards in your hand" (Triskaidekaphile), "if that player has no cards in hand" (Ghirapur Orrery) and "if there
 * are twenty or more counters on it or you have twenty or more cards in hand" (Twenty-Toed Toad).
 */
import { fail, literal, type Parser, pattern, quiet, sequence } from '../../combinators';
import type { IrAmount, IrComparison, IrCondition, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';

/**
 * `condition.you-have-exactly-cards-in-hand`: "you have exactly thirteen cards in your hand", "you have exactly seven cards in hand" (CR 402.1: the cards a player holds; CR 603.4: as
 * the intervening "if" it is read as the ability triggers and again as it resolves). The engine's `amountIs` of a `countOf` the cards in the controller's hand, `equal` to the number.
 * Not read: another player, a number with "or more" or "or fewer" (other rules), "exactly no cards", "exactly one card" (a singular noun).
 */
export const CONDITION_YOU_HAVE_EXACTLY_CARDS_IN_HAND = defineRule<IrCondition>({
  id: 'condition.you-have-exactly-cards-in-hand',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 402.1 (Hand)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'you have exactly thirteen cards in your hand',
    'you have exactly seven cards in hand',
    'you have exactly 2 cards in your hand',
  ],
  rejects: [
    'you have exactly thirteen cards',
    'you have exactly one card in your hand',
    'you have exactly no cards in your hand',
    'you have thirteen cards in your hand',
    'you have exactly thirteen or more cards in your hand',
    'an opponent has exactly thirteen cards in their hand',
    'you have exactly thirteen cards in your hand.',
    'you have exactly thirteen cards in your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you have exactly /iu),
      quantity,
      pattern(new RegExp(` cards in (?:your )?hand${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const value = r.value[1];
    if (value < 2) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const id = 'condition.you-have-exactly-cards-in-hand';
    const amount: IrAmount = {
      kind: 'countOf',
      of: {
        kind: 'noun',
        det: 'each',
        filter: { zone: 'hand', controller: 'you', card: true, raw: ctx.text.slice(pos, r.pos) },
        upTo: false,
        plural: true,
        other: false,
        span,
        rule: id,
      },
      span,
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'amountIs', amount, compare: { cmp: 'equal', value } },
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/** "no cards in hand", "three or more cards in hand", "one or fewer cards in hand": the size of a hand compared with a number (CR 402.1). */
const HAND_COMPARE: Parser<IrComparison> = (ctx, pos) => {
  const none = pattern(new RegExp(`no cards in hand${BOUNDARY}`, 'iu'))(ctx, pos);
  if (none.ok) return { ok: true, value: { cmp: 'atMost', value: 0 }, pos: none.pos };
  const n = quantity(ctx, pos);
  if (!n.ok) return n;
  const tail = pattern(new RegExp(` or (more|fewer) cards in hand${BOUNDARY}`, 'iu'))(ctx, n.pos);
  if (!tail.ok) return tail;
  const more = (tail.value[1] ?? '').toLowerCase() === 'more';
  // "One or more cards" is "a card": no rule says it that way, and "zero or fewer" is "no cards".
  if (n.value < (more ? 2 : 1)) return fail(ctx, pos);
  return { ok: true, value: { cmp: more ? 'atLeast' : 'atMost', value: n.value }, pos: tail.pos };
};

/**
 * `condition.that-player-has-cards-in-hand`: "that player has no cards in hand", "that player has three or more cards in hand" (Ghirapur Orrery; CR 402.1, 603.4: the intervening "if"
 * of "at the beginning of each player's upkeep" is read of that player as the ability triggers and again as it resolves). "That player" is the player the trigger is about, which
 * only a lowering that has one reads (the engine's `triggerPlayerStat`, as `condition.the-player-is-opponent-with-cards`). Not read: "the player" (the other rule), "an opponent",
 * a word after "hand", "in their hand".
 */
export const CONDITION_THAT_PLAYER_HAS_CARDS_IN_HAND = defineRule<IrCondition>({
  id: 'condition.that-player-has-cards-in-hand',
  family: 'condition',
  leading: ['that'],
  cites: ['CR 402.1 (Hand)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'that player has no cards in hand',
    'that player has three or more cards in hand',
    'that player has one or fewer cards in hand',
  ],
  rejects: [
    'that player has no cards in their hand',
    'that player has no cards',
    'that player has one or more cards in hand',
    'that player has zero or fewer cards in hand',
    'that player has three cards in hand',
    'the player has no cards in hand',
    'an opponent has no cards in hand',
    'that player has no cards in hand.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(pattern(/that player has /iu), HAND_COMPARE)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thePlayerIs', cardsInHand: r.value[1] },
        span: { start: pos, end: r.pos },
        rule: 'condition.that-player-has-cards-in-hand',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.there-are-counters-on-it`: "there are twenty or more counters on it", "there are three or more counters on ~" (Twenty-Toed Toad; CR 122.1: counters of every kind
 * on the permanent, added together; CR 608.2c: read as the instruction comes up). "It" is a pronoun for the binding pass; the lowering reads it of the permanent the ability is
 * about. The engine's `amountIs` of a `countersOn` with no kind. Not read: one kind of counter (`condition.there-are-counters-on-self`), "fewer", a number below two, another
 * permanent, a bare number.
 */
export const CONDITION_THERE_ARE_COUNTERS_ON_IT = defineRule<IrCondition>({
  id: 'condition.there-are-counters-on-it',
  family: 'condition',
  leading: ['there'],
  cites: ['CR 122.1 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['there are twenty or more counters on it', 'there are 3 or more counters on ~'],
  rejects: [
    'there are twenty counters on it',
    'there are twenty or fewer counters on it',
    'there are one or more counters on it',
    'there are twenty or more +1/+1 counters on it',
    'there are twenty or more counters on target creature',
    'there are twenty or more counters on it.',
    'there are twenty or more counters',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('there are '),
        quantity,
        pattern(new RegExp(` or more counters on (it|~)${BOUNDARY}`, 'iu')),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, value, tail] = r.value.value;
    if (value < 2) return fail(ctx, pos);
    const span = r.value.span;
    const word = (tail[1] ?? '').toLowerCase();
    const of: IrNoun =
      word === '~'
        ? {
            kind: 'noun',
            det: 'self',
            filter: { raw: '~' },
            upTo: false,
            plural: false,
            other: false,
            span,
            rule: 'condition.there-are-counters-on-it',
          }
        : {
            kind: 'noun',
            det: 'anaphor',
            filter: { raw: word },
            upTo: false,
            plural: false,
            other: false,
            span,
            rule: 'condition.there-are-counters-on-it',
          };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'amountIs',
          amount: { kind: 'countersOn', of, span },
          compare: { cmp: 'atLeast', value },
        },
        span,
        rule: 'condition.there-are-counters-on-it',
      },
      pos: r.pos,
    };
  },
});

/** The conditions `condition.or` joins: counts of the game a trailing "if" may end with. */
const OR_JOINABLE = [
  'condition.there-are-counters-on-it',
  'condition.you-have-many-cards-in-hand',
  'condition.you-have-few-cards-in-hand',
  'condition.amount-count',
] as const;

/**
 * `condition.or`: two conditions joined by " or " ("there are twenty or more counters on it or you have twenty or more cards in hand"): either one holds (the engine's `or`, CR 608.2c:
 * read as the instruction comes up). Only two, and only the counts of `OR_JOINABLE`. Not read: a list of three, "and", a condition that is not joinable.
 */
export const CONDITION_OR = defineRule<IrCondition>({
  id: 'condition.or',
  family: 'condition',
  leading: ['there', 'you'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 122.1 (Counters)', 'CR 402.1 (Hand)'],
  examples: [
    'there are twenty or more counters on it or you have twenty or more cards in hand',
    'you have seven or more cards in hand or there are three or more counters on ~',
  ],
  rejects: [
    'there are twenty or more counters on it or',
    'there are twenty or more counters on it and you have twenty or more cards in hand',
    'there are twenty or more counters on it or you control a Frog',
    'there are twenty or more counters on it',
    'there are twenty or more counters on it or you have twenty or more cards in hand or you have one or fewer cards in hand',
  ],
  parse: (ctx, pos) => {
    const term = family<IrCondition>('condition', { only: OR_JOINABLE });
    // Quiet: a disjunction that is not read leaves the diagnostics of the single condition as they were.
    const r = quiet(sequence(term, pattern(/ or /iu), term))(ctx, pos);
    if (!r.ok) return r;
    // A third term is a list this rule does not read.
    if (pattern(/ or /iu)(ctx, r.pos).ok) return fail(ctx, pos);
    const [first, , second] = r.value;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'or', terms: [first, second] },
        span: { start: pos, end: r.pos },
        rule: 'condition.or',
      },
      pos: r.pos,
    };
  },
});

export const HAND_SIZE_CONDITION_RULES = [
  CONDITION_OR,
  CONDITION_YOU_HAVE_EXACTLY_CARDS_IN_HAND,
  CONDITION_THAT_PLAYER_HAS_CARDS_IN_HAND,
  CONDITION_THERE_ARE_COUNTERS_ON_IT,
];
