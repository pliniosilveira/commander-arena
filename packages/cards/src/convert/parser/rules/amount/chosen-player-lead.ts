/**
 * The amount of Slithermuse: "the difference", what the player chosen before has more of than the controller.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.equal-to-the-difference`: "equal to the difference" (CR 608.2c, 107.1b: the result of a subtraction), after "If that player has more cards in hand than you": how much more of the compared stat the
 * player chosen before has. The engine's `chosenPlayerLead`; the lowering takes the stat from the condition before it and refuses the words anywhere else. Not read: "the difference
 * between ...", "a difference", "the differences", the words without "equal to".
 */
export const AMOUNT_EQUAL_TO_THE_DIFFERENCE = defineRule<IrAmount>({
  id: 'amount.equal-to-the-difference',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 107.1b (Numbers)'],
  examples: ['equal to the difference'],
  rejects: [
    'equal to the difference between them',
    'equal to a difference',
    'equal to the differences',
    'the difference',
    'equal to difference',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/equal to the difference(?![\p{L}\p{N}]| between)/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'chosenPlayerLead', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const CHOSEN_PLAYER_LEAD_AMOUNT_RULES = [AMOUNT_EQUAL_TO_THE_DIFFERENCE];
