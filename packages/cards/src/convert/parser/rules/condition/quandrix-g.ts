/**
 * Conditions of the Quandrix Unlimited deck, group G (Zimone, All-Questioning): "you control a prime number of lands" and two conditions joined by "and" (CR 603.4: an
 * intervening "if" is checked as the ability triggers and again as it resolves, whole).
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrAmount, IrCondition, IrNoun } from '../../ir/types';
import { permanentPhrase } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';

const PRIME_ID = 'condition.prime-number-of';

/**
 * `condition.prime-number-of`: "you control a prime number of lands" (a prime number is a whole number of 2 or more with no divisor but 1 and itself: 2, 3, 5, 7, 11; the card
 * says so in its reminder text, and no comprehensive rule defines it). The count is what the phrase of `amount.for-each` counts, of the permanents the player controls. The engine's
 * `amountIsPrime`. Not read: "an even number", "an odd number", "a prime number" with no count, a count of cards in a zone ("a prime number of cards in your graveyard"), "an opponent
 * controls", "a prime number of life".
 */
export const CONDITION_PRIME_NUMBER_OF = defineRule<IrCondition>({
  id: PRIME_ID,
  family: 'condition',
  leading: ['you'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'you control a prime number of lands',
    'you control a prime number of creatures',
    'you control a prime number of artifacts',
  ],
  rejects: [
    'you control an even number of lands',
    'you control a prime number',
    'you control a prime number of cards in your graveyard',
    'you control prime number of lands',
    'you control a prime number of lands.',
    'an opponent controls a prime number of lands',
    'you control two prime numbers of lands',
    'you control a prime number of lands and',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you control a prime number of '),
      spanned(permanentPhrase(true, 'all')),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: filter, span: ofSpan } = r.value[1];
    // The permanents of the player ("lands" says no controller of its own): a count of a kind of permanent, with no other quality of its own to compare.
    if (filter.controller !== undefined || filter.zone !== 'battlefield') return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const of: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: 'you' },
      upTo: false,
      plural: true,
      other: false,
      span: ofSpan,
      rule: PRIME_ID,
    };
    const amount: IrAmount = { kind: 'countOf', of, span };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'amountIsPrime', amount },
        span,
        rule: PRIME_ID,
      },
      pos: r.pos,
    };
  },
});

const AND_ID = 'condition.and';

/** The conditions that may be joined by "and": the ones that read the game as a whole and end where the next one can start. */
const JOINABLE = [
  'condition.control-at-least',
  'condition.control-a',
  'condition.control-land-type',
  'condition.entered-this-turn',
  'condition.amount-count',
  PRIME_ID,
] as const;

/**
 * `condition.and`: two conditions joined by " and " ("a land entered the battlefield under your control this turn and you control a prime number of lands"): both must hold (the
 * engine's `and`, CR 603.4: read as the ability triggers and again as it resolves). Only two, and only the plain conditions about what the player controls, what entered the
 * battlefield this turn or a count of the game (`JOINABLE`). Not read: a list of three, "or", "and" before something that is no condition, a condition that is not joinable
 * ("and ~ has a counter on it"), a condition with its own "and" inside (the second one is read whole).
 */
export const CONDITION_AND = defineRule<IrCondition>({
  id: AND_ID,
  family: 'condition',
  leading: [],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'a land entered the battlefield under your control this turn and you control a prime number of lands',
    'you control a prime number of lands and a creature entered the battlefield under your control this turn',
    'you control three or more lands and you control a prime number of creatures',
  ],
  rejects: [
    'a land entered the battlefield under your control this turn and',
    'a land entered the battlefield under your control this turn or you control a prime number of lands',
    'a land entered the battlefield under your control this turn and draw a card',
    'you control a prime number of lands',
    'a land entered the battlefield under your control this turn and you control a prime number of lands and a creature entered the battlefield under your control this turn',
  ],
  parse: (ctx, pos) => {
    const term = family<IrCondition>('condition', { only: JOINABLE });
    // Quiet: a conjunction that is not read leaves the diagnostics of the single condition as they were.
    const r = quiet(sequence(term, pattern(/ and /iu), term))(ctx, pos);
    if (!r.ok) return r;
    const [first, , second] = r.value;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'and', terms: [first, second] },
        span: { start: pos, end: r.pos },
        rule: AND_ID,
      },
      pos: r.pos,
    };
  },
});

export const QUANDRIX_G_CONDITION_RULES = [CONDITION_AND, CONDITION_PRIME_NUMBER_OF];
