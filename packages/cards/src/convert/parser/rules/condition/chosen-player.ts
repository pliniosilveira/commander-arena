/**
 * Condition of Slithermuse: "that player has more cards in hand than you", of the player a sentence before it chose.
 */
import { pattern } from '../../combinators';
import type { IrAmount, IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.chosen-player-has-more`: "that player has more cards in hand than you", "that player has more life than you" (CR 608.2c, 119.1, 402.1): the player the sentence before it
 * chose ("Choose an opponent.") has a greater life total or hand than the controller of the ability, read as the sentence resolves. The engine's `amountIs` of `chosenPlayerLead` that is
 * at least 1. The lowering refuses it where no sentence before it chose a player. Not read: "controls more" (another rule reads the player of a trigger), "an opponent", "each player",
 * "fewer", "as many as".
 */
export const CONDITION_CHOSEN_PLAYER_HAS_MORE = defineRule<IrCondition>({
  id: 'condition.chosen-player-has-more',
  family: 'condition',
  leading: ['that'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 119.1 (Life)', 'CR 402.1 (Hand)'],
  examples: ['that player has more cards in hand than you', 'that player has more life than you'],
  rejects: [
    'that player has more cards in hand',
    'that player has fewer cards in hand than you',
    'that player controls more creatures than you',
    'that player has more lands than you',
    'those players have more cards in hand than you',
    'that player has more cards in hand than each other player',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/that player has more (life|cards in hand) than you(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const stat = (r.value.value[1] ?? '').toLowerCase() === 'life' ? 'life' : 'cardsInHand';
    const amount: IrAmount = { kind: 'chosenPlayerLead', stat, span: r.value.span };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'amountIs', amount, compare: { cmp: 'atLeast', value: 1 } },
        span: { start: pos, end: r.pos },
        rule: 'condition.chosen-player-has-more',
      },
      pos: r.pos,
    };
  },
});

export const CHOSEN_PLAYER_CONDITION_RULES = [CONDITION_CHOSEN_PLAYER_HAS_MORE];
