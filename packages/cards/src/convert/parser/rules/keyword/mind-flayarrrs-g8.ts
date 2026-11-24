/**
 * Keyword rule of the Mind Flayarrrs deck, group 8: "Replicate—Tap an untapped Horror you control." (Psionic Ritual, CR 702.56a).
 */
import { literal, map, satisfy, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

/** One permanent: the cost is paid once for each copy, so "two" would be a different cost. */
const TAP_COST = satisfy(
  family<IrCost>('cost', { only: ['cost.tap-permanents'] }),
  (cost) => cost.kind === 'tapPermanents' && cost.count === 1,
);

/**
 * `keyword.replicate-tap`: "Replicate—Tap an untapped Horror you control." (CR 702.56a: "As an additional cost to cast this spell, you may pay [cost] any number of times" and "When you cast
 * this spell, if a replicate cost was paid for it, copy it for each time its replicate cost was paid"). The cost is the tapping of one untapped permanent of the caster's that matches, paid
 * once for each copy; the question of how many times, the trigger and the copies are the engine's. Not read: a mana cost after an em dash (the line without it is `keyword.replicate`), a
 * life payment, a cost of several permanents, a missing period, a second cost, other words on the line.
 */
export const KEYWORD_REPLICATE_TAP = defineRule<readonly IrKeyword[]>({
  id: 'keyword.replicate-tap',
  family: 'keyword',
  // The keyword is glued to its em dash, so the first word is not read: the rule is tried at every line.
  leading: [],
  cites: ['CR 702.56a (Replicate)', 'CR 601.2b (Casting Spells)', 'CR 118.3 (Costs)'],
  examples: [
    'Replicate—Tap an untapped Horror you control.',
    'Replicate—Tap an untapped creature you control.',
    'replicate—tap an untapped Elf you control.',
  ],
  rejects: [
    'Replicate—Tap an untapped Horror you control',
    'Replicate—Tap two untapped Horrors you control.',
    'Replicate—Pay 2 life.',
    'Replicate—{1}.',
    'Replicate—Tap an untapped Horror you control, pay 2 life.',
    'Replicate—Tap an untapped Horror you control. Flying',
    'Replicate Tap an untapped Horror you control.',
    'Replicate—Tap an untapped Horror.',
    'Replicate—Tap target Horror.',
    'Flying, replicate—Tap an untapped Horror you control.',
    'Buyback—Tap an untapped Horror you control.',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.replicate-tap',
      map(
        sequence(literal('replicate—'), TAP_COST, literal('.')),
        ([, cost]): readonly IrCost[] => [cost],
      ),
      (cost) => ({ kind: 'keyword', name: 'replicate', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const MIND_FLAYARRRS_G8_KEYWORD_RULES = [KEYWORD_REPLICATE_TAP];
