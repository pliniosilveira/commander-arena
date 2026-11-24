/**
 * Effect rules of the Counter Blitz deck, group G (Sin, Unending Cataclysm): "put its counters on target creature you control" and "shuffle this card into its owner's library", what the
 * permanent that died hands on and does to the card it became (CR 113.7a, 122.1, 400.7, 603.10a, 701.24).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const PUT_ID = 'effect.put-its-counters-on-target';

/**
 * `effect.put-its-counters-on-target`: "put its counters on target creature you control" (CR 122.1, 122.6, 113.7a, 603.10a: every counter, of every kind, the permanent had as it last
 * was on the battlefield, put on a target of the same ability; "its" is the permanent with the ability). The engine's `putCountersOf` of `this`. Not read: a kind or a number of
 * counters, "their", "each", another permanent's counters, a destination that is not a target.
 */
export const EFFECT_PUT_ITS_COUNTERS_ON_TARGET = defineRule<Clauses>({
  id: PUT_ID,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
    'CR 113.7a (Handling Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
  ],
  examples: [
    'put its counters on target creature you control',
    'put its counters on target creature',
    'put its counters on target permanent you control',
  ],
  rejects: [
    'put its +1/+1 counters on target creature you control',
    'put its counter on target creature you control',
    'put their counters on target creature you control',
    'put its counters on each creature you control',
    'put its counters on that creature',
    'put its counters on ~',
    'put its counters',
    'put its counters on target creature you control and draw a card',
  ],
  parse: single(
    PUT_ID,
    sequence(
      spanned(literal('put its')),
      pattern(/ counters on /iu),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
    ),
    ([from, , to]) => ({
      verb: 'putCountersOf',
      args: {
        from: {
          kind: 'noun',
          det: 'self',
          filter: { raw: '~' },
          upTo: false,
          plural: false,
          other: false,
          span: from.span,
          rule: PUT_ID,
        },
        to,
      },
    }),
  ),
});

const SHUFFLE_ID = 'effect.shuffle-this-card-into-library';

/**
 * `effect.shuffle-this-card-into-library`: "shuffle this card into its owner's library" (CR 701.24, 701.24c, 400.3: the card of the permanent with the ability goes from where it is to the
 * library of its owner, and that library is shuffled whether or not the card got there). The engine's `moveToZone` of `thisCard` and a `shuffle` of its owner. Not read: another
 * object, "your library", "it", "shuffle ~", "on top".
 */
export const EFFECT_SHUFFLE_THIS_CARD_INTO_LIBRARY = defineRule<Clauses>({
  id: SHUFFLE_ID,
  family: 'effect',
  leading: ['shuffle'],
  cites: [
    'CR 701.24 (Shuffle)',
    'CR 701.24c (Shuffle)',
    'CR 400.3 (General)',
    'CR 108.3 (Owner and Controller)',
  ],
  examples: [
    "shuffle this card into its owner's library",
    'shuffle this card into its owner’s library',
  ],
  rejects: [
    'shuffle this card into your library',
    "shuffle this card into its owner's library and draw a card",
    "shuffle this card into its owner's graveyard",
    "shuffle that card into its owner's library",
    "shuffle ~ into its owner's library",
    "shuffle this card on top of its owner's library",
    'shuffle this card',
  ],
  parse: single(
    SHUFFLE_ID,
    spanned(pattern(/shuffle this card into its owner['’]s library(?![\p{L}\p{N}])/iu)),
    ({ span }) => ({
      verb: 'shuffleThisCardIntoLibrary',
      args: { card: { kind: 'flag', value: true, span, rule: SHUFFLE_ID } },
    }),
  ),
});

export const COUNTER_BLITZ_G_EFFECT_RULES = [
  EFFECT_PUT_ITS_COUNTERS_ON_TARGET,
  EFFECT_SHUFFLE_THIS_CARD_INTO_LIBRARY,
];
