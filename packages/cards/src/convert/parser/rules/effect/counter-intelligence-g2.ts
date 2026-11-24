/**
 * Effect rules of the Counter Intelligence deck, group 2 (moving, removing, counting and choosing counters): "Put those counters on target permanent you control" (Resourceful
 * Defense, CR 122.1, 603.10a, 113.7a: the counters a permanent had as it left the battlefield).
 */
import { literal, map, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

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

export const COUNTER_INTELLIGENCE_G2_EFFECT_RULES = [EFFECT_PUT_THOSE_COUNTERS].map(quietly);
