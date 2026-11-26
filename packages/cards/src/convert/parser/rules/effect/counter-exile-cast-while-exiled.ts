/**
 * Effect of the cards that counter a spell, exile it and let their controller cast it later: `effect.counter-exile-cast-while-exiled`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.counter-exile-cast-while-exiled`: "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card
 * without paying its mana cost for as long as it remains exiled." (CR 701.6a, 614.1a, 118.9, 611.2b, 406.3). Three sentences that `splitSentences` keeps together. The engine's `counter`
 * with `exileInstead`, then a `mayPlay` of the card exiled (cast only, for no mana cost, with no end of its own but the card leaving exile). Not read: a counter with a condition
 * ("unless"), another place for the spell, a cast that costs mana, a cast that has an end ("this turn"), the later sentences alone.
 */
export const EFFECT_COUNTER_EXILE_CAST_WHILE_EXILED = defineRule<Clauses>({
  id: 'effect.counter-exile-cast-while-exiled',
  family: 'effect',
  leading: ['counter'],
  cites: [
    'CR 701.6a (Counter)',
    'CR 614.1a (Replacement Effects)',
    'CR 118.9 (Alternative Costs)',
    'CR 611.2b (Continuous Effects)',
  ],
  examples: [
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost for as long as it remains exiled",
    "counter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost for as long as it remains exiled",
  ],
  rejects: [
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard",
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost",
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost this turn",
    "counter target spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card by paying {2} for as long as it remains exiled",
    "counter target spell unless its controller pays {1}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard. You may cast that card without paying its mana cost for as long as it remains exiled",
    "counter target spell. If that spell is countered this way, put it into its owner's hand. You may cast that card without paying its mana cost for as long as it remains exiled",
  ],
  parse: single(
    'effect.counter-exile-cast-while-exiled',
    sequence(
      literal('counter '),
      family<IrNoun>('noun', {
        only: ['noun.target-spell'],
      }),
      pattern(
        /\. if that spell is countered this way, exile it instead of putting it into its owner['’]s graveyard\. you may cast that card without paying its mana cost for as long as it remains exiled(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, objects]) => ({ verb: 'counterExileCastWhileExiled', args: { objects } }),
  ),
});

export const COUNTER_EXILE_CAST_WHILE_EXILED_EFFECT_RULES = [
  EFFECT_COUNTER_EXILE_CAST_WHILE_EXILED,
].map(quietly);
