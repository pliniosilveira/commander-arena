/**
 * Effect rules of the Counter Intelligence deck, group 2 (moving, removing, counting and choosing counters): "Put those counters on target permanent you control" (Resourceful
 * Defense, CR 122.1, 603.10a, 113.7a: the counters a permanent had as it left the battlefield).
 */
import { literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { COUNTER_NAME } from './counters';
import { type Clauses, operands, single } from './operands';

const PUT_THOSE_ID = 'effect.put-those-counters';

/** One target permanent: never "up to one", a plural, "any number of", "another" or a player. */
const oneTarget = (noun: IrNoun): boolean =>
  noun.det === 'target' &&
  !noun.plural &&
  !noun.upTo &&
  noun.anyNumber !== true &&
  !noun.other &&
  noun.filter.player === undefined &&
  noun.filter.anyTarget !== true;

/**
 * `effect.put-those-counters`: "Put those counters on target permanent you control" (CR 122.1, 603.10a, 113.7a): every counter, of every kind, that the permanent the trigger is about
 * had as it last was on the battlefield is put on a target permanent. Read only in the body of a trigger about another permanent leaving the battlefield whose intervening "if" is "it
 * had counters on it" (`lower.put-those-counters` checks): the counters are then those the text names. The engine's `putCountersOf` of the triggering permanent. Not read: a kind or a
 * number of counters, "that many", "it", "~", "up to one" or plural targets, a trailing clause.
 */
export const EFFECT_PUT_THOSE_COUNTERS = defineRule<Clauses>({
  id: PUT_THOSE_ID,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 113.7a (Handling Abilities)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    'put those counters on target permanent you control',
    'put those counters on target creature you control',
    'put those counters on target permanent',
  ],
  rejects: [
    'put those counters on ~',
    'put those counters on it',
    'put those counters on up to one target permanent',
    'put those counters on target permanents',
    'put those counters on another target permanent',
    'put those counters on each creature you control',
    'put those +1/+1 counters on target permanent',
    'put that many counters on target permanent',
    'put those counters',
    'put those counters on target permanent you control and draw a card',
  ],
  parse: single(
    PUT_THOSE_ID,
    map(
      sequence(
        literal('put those counters on '),
        satisfy(family<IrNoun>('noun', { only: ['noun.target-permanent'] }), oneTarget),
      ),
      ([, to]) => to,
    ),
    (to) => ({ verb: 'putThoseCounters', args: { to } }),
  ),
});

const CHOICE_ID = 'effect.put-choice-of-counters';

/** "a +1/+1 counter" or "two charge counters": a number and the kind. */
const counterPhrase = sequence(
  family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
  literal(' '),
  map(
    spanned(pattern(COUNTER_NAME)),
    ({ value, span }): IrCounterSpec => ({
      kind: 'counterSpec',
      name: value[0].toLowerCase(),
      span,
      rule: CHOICE_ID,
    }),
  ),
  pattern(/ counters?(?![\p{L}\p{N}])/iu),
);

/**
 * `effect.put-choice-of-counters`: "Put your choice of a +1/+1 counter or two charge counters on up to one other target artifact" (Inspirit, Flagship Vessel; CR 122.6, 608.2d): the
 * controller chooses, as the effect resolves, which of the two instructions to follow (the engine's `chooseOne` of two `addCounters` on the same objects). Each is a whole number of
 * counters of a named kind. Not read: three choices, a count of X or "that many", a choice written without "your", the choice of another player, a trailing clause.
 */
export const EFFECT_PUT_CHOICE_OF_COUNTERS = defineRule<Clauses>({
  id: CHOICE_ID,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.6 (Counters)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 122.1 (Counters)',
  ],
  examples: [
    'put your choice of a +1/+1 counter or two charge counters on up to one other target artifact',
    'put your choice of a +1/+1 counter or a -1/-1 counter on target creature',
    'put your choice of two charge counters or a stun counter on ~',
  ],
  rejects: [
    'put your choice of a +1/+1 counter on target creature',
    'put your choice of a +1/+1 counter, a charge counter or a stun counter on target creature',
    'put your choice of X +1/+1 counters or a charge counter on target creature',
    'put a +1/+1 counter or two charge counters on target creature',
    'put your choice of a +1/+1 counter or two charge counters',
    'put your choice of a +1/+1 counter or two charge counters on target creature and draw a card',
    'put your choice of a +1/+1 counter or a +1/+1 counter on target creature',
  ],
  parse: single(
    CHOICE_ID,
    satisfy(
      sequence(
        literal('put your choice of '),
        counterPhrase,
        literal(' or '),
        counterPhrase,
        literal(' on '),
        operands(['noun.target-permanent', 'noun.up-to-one-permanent', 'noun.self'], CHOICE_ID),
      ),
      ([, first, , second]) => first[2].name !== second[2].name || first[0] !== second[0],
    ),
    ([, first, , second, , objects]) => ({
      verb: 'putChoiceOfCounters',
      args: {
        count: first[0],
        counter: first[2],
        count2: second[0],
        counter2: second[2],
        objects,
      },
    }),
  ),
});

export const COUNTER_INTELLIGENCE_G2_EFFECT_RULES = [
  EFFECT_PUT_THOSE_COUNTERS,
  EFFECT_PUT_CHOICE_OF_COUNTERS,
].map(quietly);
