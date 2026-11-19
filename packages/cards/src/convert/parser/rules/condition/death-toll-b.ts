/**
 * Conditions of the Death Toll deck, group B: "two cards that share all their card types were milled this way" (CR 205.2a, 608.2c, 701.17a), the test that begins the sentence "If two
 * cards that share all their card types were milled this way, sacrifice this enchantment." It reads the cards the instruction before it milled (the engine's `moved`); the lowering reads it
 * only after a mill.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, quietly } from '../registry';

/**
 * `condition.two-milled-cards-share-all-types`: "two cards that share all their card types were milled this way" (CR 205.2a: the card types are the types of the card, not its supertypes
 * or subtypes; CR 701.17a: the cards a mill put into the graveyard; CR 608.2c: read as the instruction comes up). The engine's `movedShareAllCardTypes`. Not read: another number ("three
 * cards"), "a card type" ("share a card type"), another verb ("exiled", "discarded"), another set of cards ("those cards"), another way ("this turn"), the singular.
 */
export const CONDITION_TWO_MILLED_CARDS_SHARE_ALL_TYPES = defineRule<IrCondition>({
  id: 'condition.two-milled-cards-share-all-types',
  family: 'condition',
  leading: ['two'],
  cites: [
    'CR 205.2a (Card Types)',
    'CR 701.17a (Mill)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['two cards that share all their card types were milled this way'],
  rejects: [
    'three cards that share all their card types were milled this way',
    'two cards that share a card type were milled this way',
    'two cards that share all their card types were exiled this way',
    'two cards that share all their card types were milled',
    'two cards that share all their card types were milled this turn',
    'two cards that share all their types were milled this way',
    'two cards that share all their card types were milled this way.',
    'two cards that share all their card types were milled this way and',
    'two creature cards that share all their card types were milled this way',
    'a card that shares all its card types was milled this way',
    'those cards share all their card types',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /two cards that share all their card types were milled this way(?![\p{L}\p{N}])(?!\s+and(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'movedShareAllCardTypes' },
        span: { start: pos, end: r.pos },
        rule: 'condition.two-milled-cards-share-all-types',
      },
      pos: r.pos,
    };
  },
});

export const DEATH_TOLL_B_CONDITION_RULES = [quietly(CONDITION_TWO_MILLED_CARDS_SHARE_ALL_TYPES)];
