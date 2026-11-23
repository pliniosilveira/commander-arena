/**
 * Keyword rule of group 10 of the Ahoy Mateys deck: "Equip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand." (Arm-Mounted Anchor).
 */
import { literal, map, type Parser, sequence } from '../../combinators';
import type { IrCondition, IrCost, IrKeyword, IrRestriction } from '../../ir/types';
import { defineRule, family, node } from '../registry';

/**
 * Looks ahead, without reading and without recording how far it got: the rule is for an equip cost that a following sentence reduces, so for any other equip text it must refuse
 * as if it were not there. Otherwise it would tie with the plain equip rules on the furthest position read and become the `closestRule` of every unread equip text (`Equip {X}`,
 * a restricted equip).
 */
const ONLY_WITH_A_COST_REDUCTION_SENTENCE: Parser<null> = (ctx, pos) => {
  const ahead = /equip [^.]*\. this ability costs /iy;
  ahead.lastIndex = pos;
  return ahead.test(ctx.text) ? { ok: true, value: null, pos } : { ok: false };
};

/**
 * `keyword.equip-cost-reduced`: "Equip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand." (CR 702.6a: "Equip [cost]" is an activated ability; CR
 * 601.2f, 602.2b, 118.7: its cost is worked out as it is activated, so a reduction that depends on the game is read then). The equip keyword with a plain mana cost, and the reduction
 * of its ability by a number of generic mana while a condition holds (the sentence of `restriction.cost-reduction`): the engine's `equip` with `costReducedIf`. Not read: another
 * cost, a reduction that is not generic mana, a missing period after the cost, a second sentence that is not a reduction.
 */
export const KEYWORD_EQUIP_COST_REDUCED = defineRule<readonly IrKeyword[]>({
  id: 'keyword.equip-cost-reduced',
  family: 'keyword',
  leading: ['equip'],
  cites: [
    'CR 702.6a (Equip)',
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 118.7 (Costs)',
  ],
  examples: [
    'Equip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand.',
    'equip {3}. this ability costs {1} less to activate if you control a commander.',
  ],
  rejects: [
    'Equip {2}',
    'Equip {2}.',
    'Equip {2} This ability costs {2} less to activate if you control a commander.',
    'Equip {2}. This ability costs {2} less to activate if you control a commander',
    'Equip {2}. This ability costs {G} less to activate if you control a commander.',
    'Equip {2}. This ability costs {2} more to activate if you control a commander.',
    'Equip {2}. This ability costs {2} less to activate.',
    'Equip {X}. This ability costs {2} less to activate if you control a commander.',
    'Equip—Pay 2 life. This ability costs {2} less to activate if you control a commander.',
  ],
  parse: map(
    node<{ cost: IrCost; reduction: IrRestriction }, IrKeyword>(
      'keyword.equip-cost-reduced',
      map(
        sequence(
          ONLY_WITH_A_COST_REDUCTION_SENTENCE,
          literal('equip '),
          family<IrCost>('cost', { only: ['cost.mana'] }),
          literal('. '),
          family<IrRestriction>('restriction', { only: ['restriction.cost-reduction'] }),
        ),
        ([, , cost, , reduction]) => ({ cost, reduction }),
      ),
      ({ cost, reduction }) => ({
        kind: 'keyword',
        name: 'equip',
        params: [],
        cost: [cost],
        ...(reduction.costReduction === undefined
          ? {}
          : {
              costReducedIf: {
                amount: reduction.costReduction.amount,
                condition: reduction.costReduction.condition as IrCondition,
              },
            }),
      }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const AHOY_G10_KEYWORD_RULES = [KEYWORD_EQUIP_COST_REDUCED];
