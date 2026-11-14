/**
 * The amounts of the Feather deck's first group (issue 27, D-1300): "for each card you've drawn this turn" (CR 121.1: drawing a card; the engine counts the cards a
 * player has drawn this turn, `SeatState.cardsDrawnThisTurn`). The engine's `cardsDrawnThisTurn`.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-card-drawn`: "for each card you've drawn this turn" and "for each card you have drawn this turn" (CR 121.1, 608.2h: counted as the effect
 * resolves, once). Not read: another player's draws, the whole game, the past tense "drew", a plural "cards", a card with a quality.
 */
export const AMOUNT_FOR_EACH_CARD_DRAWN = defineRule<IrAmount>({
  id: 'amount.for-each-card-drawn',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 121.1 (Drawing a Card)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    "for each card you've drawn this turn",
    'for each card you have drawn this turn',
    'for each card you’ve drawn this turn',
    "For each card you've drawn this turn",
  ],
  rejects: [
    "for each card you've drawn",
    "for each card you've drawn this game",
    'for each card you drew this turn',
    'for each card an opponent has drawn this turn',
    "for each cards you've drawn this turn",
    "for each creature card you've drawn this turn",
    "for each card you've drawn this turn.",
    "each card you've drawn this turn",
    'for each card drawn this turn',
    'for each card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each card you(?:['’]ve| have) drawn this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'cardsDrawnThisTurn', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const FEATHER_G1_AMOUNT_RULES = [AMOUNT_FOR_EACH_CARD_DRAWN];
