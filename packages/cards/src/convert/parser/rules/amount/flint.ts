/**
 * Amount rules of the Flint deck (issue 685): "for each 1 life your opponents have lost this turn" (Bloodsoaked Insight, CR 119.3, 102.2, 601.2f), the count of a spell's own cost reduction.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

const ID = 'amount.for-each-opponents-life-lost';

/**
 * `amount.for-each-opponents-life-lost`: "for each 1 life your opponents have lost this turn" (CR 119.3: damage, life loss and life paid; CR 102.2: every opponent still in the game, their
 * losses added up). The engine's `opponentsLifeLostThisTurn`. Not read: another amount of life than 1, "you have lost" (`amount.the-amount-of-life-you-lost`), "an opponent", "last turn", "this
 * game", "gained".
 */
export const AMOUNT_FOR_EACH_OPPONENTS_LIFE_LOST = defineRule<IrAmount>({
  id: ID,
  family: 'amount',
  leading: ['for'],
  cites: ['CR 119.3 (Life)', 'CR 102.2 (Players)', 'CR 601.2f (Casting Spells)'],
  examples: ['for each 1 life your opponents have lost this turn'],
  rejects: [
    'for each 2 life your opponents have lost this turn',
    'for each 1 life you have lost this turn',
    'for each 1 life an opponent has lost this turn',
    'for each 1 life your opponents have lost last turn',
    'for each 1 life your opponents have lost',
    'for each 1 life your opponents have gained this turn',
    'for each life your opponents have lost this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each 1 life your opponents have lost this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'opponentsLifeLostThisTurn', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const FLINT_AMOUNT_RULES = [AMOUNT_FOR_EACH_OPPONENTS_LIFE_LOST];
