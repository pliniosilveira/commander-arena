/**
 * Effect rules of the Quandrix Unlimited deck, group G: "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d, 122.6).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, operands, single } from './operands';

const COUNTER_NAME = /[+-]\d+\/[+-]\d+|[a-z]+/i;

/**
 * `effect.distribute-counters`: "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d: the caster divides the counters among the targets as the
 * spell is cast, each target getting at least 1; CR 122.6: counters put on an object). The count is a number or the X the spell announces (CR 107.3a); the targets are "any number of
 * target ..." (no fewest, at most as many as the counters). Not read: "up to" targets, "target creature" (one target), a missing "among", the singular "counter", "that many",
 * "divided as you choose", counters put on each of the targets, or anything after the sentence.
 */
export const EFFECT_DISTRIBUTE_COUNTERS = defineRule<Clauses>({
  id: 'effect.distribute-counters',
  family: 'effect',
  leading: ['distribute'],
  cites: [
    'CR 601.2d (Casting Spells)',
    'CR 122.6 (Counters)',
    'CR 115.1 (Targets)',
    'CR 107.3a (Numbers and Symbols)',
  ],
  examples: [
    'distribute X +1/+1 counters among any number of target creatures you control',
    'distribute three +1/+1 counters among any number of target creatures',
    'distribute 4 -1/-1 counters among any number of target creatures you don’t control',
  ],
  rejects: [
    'distribute X +1/+1 counters among target creatures you control',
    'distribute X +1/+1 counters among up to three target creatures you control',
    'distribute X +1/+1 counter among any number of target creatures you control',
    'distribute X +1/+1 counters among any number of creatures you control',
    'distribute X +1/+1 counters any number of target creatures you control',
    'distribute that many +1/+1 counters among any number of target creatures you control',
    'distribute X counters among any number of target creatures you control',
    'distribute X +1/+1 counters among any number of target creatures you control and draw a card',
    'distribute X +1/+1 counters as you choose among any number of target creatures',
  ],
  parse: single(
    'effect.distribute-counters',
    sequence(
      literal('distribute '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
      literal(' '),
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.distribute-counters',
        }),
      ),
      literal(' counters among '),
      family<IrNoun>('noun', { only: ['noun.any-number-targets'] }),
    ),
    ([, count, , counter, , to]) => ({
      verb: 'distributeCounters',
      args: { count, counter, to },
    }),
  ),
});

/**
 * `effect.remove-counters-self`: "remove a +1/+1 counter from ~" (CR 122.1, 122.2: a counter comes off the permanent; with "you may" and "If you do" it is the offer the next
 * sentence reads, CR 608.2c). The permanent is the one with the ability: `~` or "it". The engine's `removeCounters`, which does something only when a counter of the kind was there.
 * Not read: "all counters" (`effect.remove-all-counters`), "any number of", a target, another kind of object, "X", or a missing kind.
 */
export const EFFECT_REMOVE_COUNTERS_SELF = defineRule<Clauses>({
  id: 'effect.remove-counters-self',
  family: 'effect',
  leading: ['remove'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.2 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'remove a +1/+1 counter from ~',
    'remove a +1/+1 counter from it',
    'remove two charge counters from ~',
    'remove a time counter from ~',
  ],
  rejects: [
    'remove all +1/+1 counters from ~',
    'remove any number of +1/+1 counters from ~',
    'remove a +1/+1 counter from target creature',
    'remove a counter from ~',
    'remove X +1/+1 counters from ~',
    'remove a +1/+1 counter from each creature you control',
    'remove a +1/+1 counter from ~ and draw a card',
    'remove a +1/+1 counter',
  ],
  parse: single(
    'effect.remove-counters-self',
    sequence(
      literal('remove '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
      literal(' '),
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.remove-counters-self',
        }),
      ),
      pattern(/ counters? from /i),
      operands(['noun.self', 'noun.it'], 'effect.remove-counters-self'),
    ),
    ([, count, , counter, , from]) => ({
      verb: 'removeCountersSelf',
      args: { count, counter, from },
    }),
  ),
});

/**
 * `effect.choose-parity-return`: "Choose odd or even. Return each creature with power of the chosen quality to its owner's hand." (CR 608.2d: the controller chooses as the instruction
 * resolves; CR 208.1: a creature's power is a number, odd or even, zero being even; CR 400.3: the owner's hand). Two sentences that `splitSentences` keeps together. The engine's
 * `chooseOne` of the two returns, each of the creatures whose power is odd or even as the instruction runs. Not read: "all creatures", another zone, a quality of toughness or mana value, "target
 * creature", a missing second sentence, "choose odd or even" alone.
 */
export const EFFECT_CHOOSE_PARITY_RETURN = defineRule<Clauses>({
  id: 'effect.choose-parity-return',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 208.1 (Power/Toughness)',
    'CR 400.3 (General)',
  ],
  examples: [
    'choose odd or even. Return each creature with power of the chosen quality to its owner’s hand',
    "choose odd or even. Return each creature with power of the chosen quality to its owner's hand",
  ],
  rejects: [
    'choose odd or even',
    'choose odd or even. Return each creature with toughness of the chosen quality to its owner’s hand',
    'choose odd or even. Return all creatures with power of the chosen quality to their owners’ hands',
    'choose odd or even. Destroy each creature with power of the chosen quality',
    'choose odd or even. Return each creature with power of the chosen quality to its owner’s library',
    'choose odd or even. Return target creature with power of the chosen quality to its owner’s hand',
    'choose a number. Return each creature with power of the chosen quality to its owner’s hand',
  ],
  parse: single(
    'effect.choose-parity-return',
    pattern(
      /choose odd or even\. return each creature with power of the chosen quality to its owner['’]s hand(?![\p{L}\p{N}])/iu,
    ),
    () => ({ verb: 'chooseParityReturn', args: {} }),
  ),
});

/**
 * `effect.remove-those-counters`: "remove those counters" (Prize Pig, CR 122.1, 122.2, 608.2c): every counter of the kind the sentence's own condition counted ("Then if there are three or more
 * ribbon counters on ~, remove those counters") comes off the permanent with the ability. The binding pass gives the clause the kind from that condition, so a sentence with no such
 * condition leaves it unbound and the lowering refuses it. The engine's `removeCounters`. Not read: "all counters", a kind named, a target, "remove those counters from" another permanent.
 */
export const EFFECT_REMOVE_THOSE_COUNTERS = defineRule<Clauses>({
  id: 'effect.remove-those-counters',
  family: 'effect',
  leading: ['remove'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.2 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['remove those counters', 'Remove those counters'],
  rejects: [
    'remove all counters',
    'remove those',
    'remove those counters from it',
    'remove those counter',
    'remove these counters',
    'remove them',
  ],
  parse: single(
    'effect.remove-those-counters',
    pattern(/remove those counters(?![\p{L}\p{N}])/iu),
    () => ({ verb: 'removeThoseCounters', args: {} }),
  ),
});

export const QUANDRIX_G_EFFECT_RULES = [
  EFFECT_DISTRIBUTE_COUNTERS,
  EFFECT_REMOVE_COUNTERS_SELF,
  EFFECT_REMOVE_THOSE_COUNTERS,
  EFFECT_CHOOSE_PARITY_RETURN,
];
