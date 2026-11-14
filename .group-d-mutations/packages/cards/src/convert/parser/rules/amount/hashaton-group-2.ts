/**
 * The amounts of the Hashaton deck program, group 2 (D-365, provisional): "equal to the life that player lost this turn" (CR 119.3, 608.2c: the life the
 * player the instruction affects has lost this turn, from damage, life loss and life paid). The engine's `lifeLostThisTurn`.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.life-lost-this-turn`: "equal to the life that player lost this turn" (CR 119.3, 608.2c). Read after "loses life" only (a gain of life with it is not
 * what the engine runs); the lowering names the engine's `lifeLostThisTurn`, which reads each affected player's own number as the instruction applies to
 * them, and refuses it when the instruction is about "you" ("that player" says another one). Not read: "the life you lost this turn", "this way",
 * "the total life lost this turn", a count in front ("twice"), another period ("last turn"), another player word ("that creature's controller").
 */
export const AMOUNT_LIFE_LOST_THIS_TURN = defineRule<IrAmount>({
  id: 'amount.life-lost-this-turn',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 119.3 (Life)', 'CR 608.2c (Resolving Spells and Abilities)', 'CR 102.2 (Players)'],
  examples: ['equal to the life that player lost this turn'],
  rejects: [
    'equal to the life you lost this turn',
    'equal to the life that player lost',
    'equal to the life that player lost last turn',
    'equal to the life lost this turn',
    'equal to the total life that player lost this turn',
    'equal to the life that player lost this way',
    'equal to twice the life that player lost this turn',
    'equal to the life that player gained this turn',
    'equal to the life that creature’s controller lost this turn',
    'equal to the life that player lost this turn plus 1',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/equal to the life that player lost this turn(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'lifeLostThisTurn', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const HASHATON_G2_AMOUNT_RULES = [AMOUNT_LIFE_LOST_THIS_TURN];
