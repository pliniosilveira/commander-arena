/**
 * Restriction rules of group 2 of the Hylda deck (issue 42, D-1516): "This ability costs {1} less to activate during your turn." (Hylda's Crown of Winter). The other cost
 * reductions of an ability are `restriction.cost-reduction` (a condition after "if") and `restriction.cost-reduced-by` (for each).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrRestriction } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `restriction.cost-reduction-your-turn`: "This ability costs {1} less to activate during your turn." (CR 601.2f, 602.2b, 118.7: the total cost is worked out as the ability is
 * activated, reduced generic mana first; CR 602.5b). The reduction is generic mana, a plain number in braces, and happens only while it is the controller's turn as the ability
 * is activated: the same node as the reduction of "... less to activate if <condition>", with the test "it's your turn" (the engine's `costReducedIf` of the condition
 * `yourTurn`). The sentence follows the effect of the ability it is about. Not read: another turn ("during an opponent's turn"), no period, a colored or X or zero amount, "more",
 * "to cast" (a spell's cost), "during each turn", "during your turn" with more words after it.
 */
export const RESTRICTION_COST_REDUCTION_YOUR_TURN = defineRule<IrRestriction>({
  id: 'restriction.cost-reduction-your-turn',
  family: 'restriction',
  leading: ['this'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 118.7 (Costs)',
    'CR 602.5b (Activating Activated Abilities)',
  ],
  examples: [
    'This ability costs {1} less to activate during your turn.',
    'this ability costs {2} less to activate during your turn.',
  ],
  rejects: [
    'This ability costs {1} less to activate during your turn',
    'This ability costs {1} less to activate during an opponent’s turn.',
    'This ability costs {1} less to activate during each turn.',
    'This ability costs {G} less to activate during your turn.',
    'This ability costs {X} less to activate during your turn.',
    'This ability costs {0} less to activate during your turn.',
    'This ability costs {1}{B} less to activate during your turn.',
    'This ability costs {1} more to activate during your turn.',
    'This spell costs {1} less to cast during your turn.',
    'This ability costs {1} less to activate during your turn and only as a sorcery.',
    'This ability costs {1} less to activate.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('this ability costs {'),
      pattern(/[1-9][0-9]*/u),
      literal('} less to activate during your turn.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, digits] = r.value;
    const span = { start: pos, end: r.pos };
    const start = pos + 'this ability costs {'.length;
    const restriction: IrRestriction = {
      kind: 'restriction',
      costReduction: {
        amount: { kind: 'number', value: Number(digits[0]), span: { start, end: start + digits[0].length } },
        condition: {
          kind: 'condition',
          test: { kind: 'yourTurn' },
          span,
          rule: 'restriction.cost-reduction-your-turn',
        },
      },
      span,
      rule: 'restriction.cost-reduction-your-turn',
    };
    return { ok: true, value: restriction, pos: r.pos };
  },
});

export const HYLDA_G2_RESTRICTION_RULES = [RESTRICTION_COST_REDUCTION_YOUR_TURN];
