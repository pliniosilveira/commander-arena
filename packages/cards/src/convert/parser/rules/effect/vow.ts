/**
 * Effect rules of Promise of Loyalty (CR 608.2d, 701.21a, 122.1, 508.1a, 506.3, 611.2b, 611.2c): "Each player puts a vow counter on a creature they control and sacrifices the rest." and
 * "Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it." The two sentences are two rules; the second names what the first
 * kept ("those creatures") by the engine's `chosen` of the name the first gives them, so a second sentence with no first one is refused by the validator, never guessed.
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrCounterSpec } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

const KEEP_ID = 'effect.each-player-keeps-one-with-counter';
const CANT_ID = 'effect.those-creatures-cant-attack-you';

/** "a vow counter": one word, the name of the counter (CR 122.1). */
const COUNTER_NAME = map(
  spanned(pattern(/([A-Za-z]+) counter(?![\p{L}\p{N}])/u)),
  ({ value, span }) => ({ name: (value[1] ?? '').toLowerCase(), span }),
);

const counterSpec = (
  rule: string,
  c: { name: string; span: { start: number; end: number } },
): IrCounterSpec => ({
  kind: 'counterSpec',
  name: c.name,
  span: c.span,
  rule,
});

/**
 * `effect.each-player-keeps-one-with-counter`: "each player puts a vow counter on a creature they control and sacrifices the rest" (CR 608.2d, 701.21a, 122.1, 101.4): each player
 * chooses one creature they control as the effect resolves, in turn order from the active player, puts the counter on it and sacrifices every other creature they control (the lands and the
 * other permanents stay). The engine's `sparePermanents` with `own`, `onlyTypes`, `counter` and `keptAs`. Not read: another subject ("each opponent", "you"), another type than a creature,
 * "up to", "a" counter other than one word, anything after "the rest".
 */
export const EFFECT_EACH_PLAYER_KEEPS_ONE_WITH_COUNTER = defineRule<Clauses>({
  id: KEEP_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21a (Sacrifice)',
    'CR 122.1 (Counters)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: ['each player puts a vow counter on a creature they control and sacrifices the rest'],
  rejects: [
    'each opponent puts a vow counter on a creature they control and sacrifices the rest',
    'each player puts a vow counter on a creature they control',
    'each player puts a vow counter on a creature they control and sacrifices the rest of them',
    'each player puts a vow counter on an artifact they control and sacrifices the rest',
    'each player puts a +1/+1 counter on a creature they control and sacrifices the rest',
    'each player puts a vow counter on a creature you control and sacrifices the rest',
    'each player puts two vow counters on a creature they control and sacrifices the rest',
    'each player put a vow counter on a creature they control and sacrifices the rest',
  ],
  parse: single(
    KEEP_ID,
    sequence(
      literal('each player puts a '),
      COUNTER_NAME,
      literal(' on a creature they control and sacrifices the rest'),
    ),
    ([, counter]) => ({
      verb: 'keepOneWithCounter',
      args: { counter: counterSpec(KEEP_ID, counter) },
    }),
  ),
});

/**
 * `effect.those-creatures-cant-attack-you`: "each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it" (CR 508.1a, 506.3, 611.2b,
 * 611.2c): the creatures of the sentence before, which the spell's controller is protected from, while each has the counter. The engine's `cantAttackController` over `chosen`. Not read:
 * "those creatures" without "each of", a duration other than the counter, "you" alone, "or planeswalkers you control" left out, another word for the counter on it ("a counter").
 */
export const EFFECT_THOSE_CREATURES_CANT_ATTACK_YOU = defineRule<Clauses>({
  id: CANT_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 508.1a (Declare Attackers Step)',
    'CR 506.3 (Beginning of Combat Step)',
    'CR 611.2b (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    "each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it",
  ],
  rejects: [
    "those creatures can't attack you or planeswalkers you control for as long as they have a vow counter on them",
    "each of those creatures can't attack you for as long as it has a vow counter on it",
    "each of those creatures can't attack you or planeswalkers you control",
    "each of those creatures can't attack you or planeswalkers you control until end of turn",
    "each of those creatures can't attack you or planeswalkers you control for as long as it has a counter on it",
    "each of those creatures can't block you or planeswalkers you control for as long as it has a vow counter on it",
    "each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it and",
    "each of those creature can't attack you or planeswalkers you control for as long as it has a vow counter on it",
  ],
  parse: single(
    CANT_ID,
    sequence(
      literal(
        "each of those creatures can't attack you or planeswalkers you control for as long as it has a ",
      ),
      COUNTER_NAME,
      literal(' on it'),
    ),
    ([, counter]) => ({
      verb: 'cantAttackWhileCounter',
      args: { counter: counterSpec(CANT_ID, counter) },
    }),
  ),
});

export const VOW_RULES = [
  EFFECT_EACH_PLAYER_KEEPS_ONE_WITH_COUNTER,
  EFFECT_THOSE_CREATURES_CANT_ATTACK_YOU,
];
