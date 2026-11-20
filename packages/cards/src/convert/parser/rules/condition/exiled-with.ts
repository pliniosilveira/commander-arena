/**
 * `condition.cards-exiled-with-self`: "there are cards exiled with ~" (Valakut Exploration; CR 603.4 intervening "if", 607.2a linked abilities): at least one card the permanent exiled with
 * its linked ability is still in exile, read as the ability triggers and again as it resolves. The engine's `amountIs` of a count of the cards `exiledWithSource`; the lowering accepts it
 * only as the intervening "if" of a triggered ability, and leaves the cards for "put them into their owner's graveyard" to name. Not read: "a card exiled with ~", "no cards exiled with ~",
 * "cards exiled with it", another source, "there are three or more cards exiled with ~", "cards in exile".
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';

export const CONDITION_CARDS_EXILED_WITH_SELF = defineRule<IrCondition>({
  id: 'condition.cards-exiled-with-self',
  family: 'condition',
  leading: ['there'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 607.2a (Linked Abilities)'],
  examples: ['there are cards exiled with ~'],
  rejects: [
    'there is a card exiled with ~',
    'there are no cards exiled with ~',
    'there are cards exiled with it',
    'there are cards exiled with target creature',
    'there are three or more cards exiled with ~',
    'there are cards in exile',
    'there are cards exiled with ~.',
    'there are cards exiled with ~ and',
    'there are creature cards exiled with ~',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/there are cards exiled with ~(?![\p{L}\p{N}'’])(?!\s+(?:and|or)\b)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'cardsExiledWithSelf' },
        span: r.value.span,
        rule: 'condition.cards-exiled-with-self',
      },
      pos: r.pos,
    };
  },
});

export const EXILED_WITH_CONDITION_RULES = [CONDITION_CARDS_EXILED_WITH_SELF].map(quietly);
