/**
 * `amount.cards-in-hand-of-that-player`: "equal to the number of cards in that player's hand" (CR 402.1, 120.3, 608.2c), the amount of "it deals damage to each opponent equal to
 * the number of cards in that player's hand": each player the damage is dealt to is hurt for the size of their own hand. The engine's `cardsInHandOfAffected`. Only the damage rules
 * read it (`DAMAGE_AMOUNT`), and the lowering refuses it where the damage is not dealt to players.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

export const AMOUNT_CARDS_IN_HAND_OF_THAT_PLAYER = defineRule<IrAmount>({
  id: 'amount.cards-in-hand-of-that-player',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 402.1 (Hand)', 'CR 120.3 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'equal to the number of cards in that player’s hand',
    "equal to the number of cards in that player's hand",
  ],
  rejects: [
    'equal to the number of cards in your hand',
    'equal to the number of cards in that player’s graveyard',
    'equal to the number of cards in that players hand',
    'equal to the number of cards in that player’s hand plus 1',
    'equal to the number of cards in their hand',
    'the number of cards in that player’s hand',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /equal to the number of cards in that player['’]s hand(?![\p{L}\p{N}])(?! plus| minus)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'cardsInHandOfAffected', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const HAND_OF_THAT_PLAYER_AMOUNT_RULES = [AMOUNT_CARDS_IN_HAND_OF_THAT_PLAYER];
