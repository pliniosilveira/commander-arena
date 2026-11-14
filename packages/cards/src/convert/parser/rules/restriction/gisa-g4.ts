/**
 * Restriction rules of group 4 of the Gisa deck (issue 41, D-462): "Activate only during your turn." (Tetzimoc, Primal Death). The other restrictions are `restriction.sorcery`,
 * `restriction.if` and `restriction.once-each-turn`.
 */
import { literal } from '../../combinators';
import type { IrRestriction } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `restriction.during-your-turn`: "Activate only during your turn." (CR 602.5b: a restriction on when the ability may be activated, read as it is activated: it is the
 * controller's turn, at any time, with priority; unlike a sorcery's timing it allows the stack to be full and combat). One node with the test "it's your turn" (the engine's
 * `activateOnlyIf` of the condition `yourTurn`). Not read: another turn ("an opponent's turn"), a phase ("only during your main phase"), a second restriction in the same sentence
 * ("and only as a sorcery", "and only once each turn").
 */
export const RESTRICTION_DURING_YOUR_TURN = defineRule<IrRestriction>({
  id: 'restriction.during-your-turn',
  family: 'restriction',
  leading: ['activate'],
  cites: ['CR 602.5b (Activating Activated Abilities)', 'CR 611.3a (Continuous Effects)'],
  examples: ['Activate only during your turn.', 'activate only during your turn.'],
  rejects: [
    'Activate only during your turn',
    'Activate only during an opponent’s turn.',
    'Activate only during your main phase.',
    'Activate only during your turn and only as a sorcery.',
    'Activate only during your turn and only once each turn.',
    'Activate only during your turn, before attackers are declared.',
    'Activate only during combat.',
    'Activate only as a sorcery.',
    'Activate during your turn.',
  ],
  parse: (ctx, pos) => {
    const r = literal('activate only during your turn.')(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const restriction: IrRestriction = {
      kind: 'restriction',
      condition: {
        kind: 'condition',
        test: { kind: 'yourTurn' },
        span,
        rule: 'restriction.during-your-turn',
      },
      span,
      rule: 'restriction.during-your-turn',
    };
    return { ok: true, value: restriction, pos: r.pos };
  },
});

export const GISA_G4_RESTRICTION_RULES = [RESTRICTION_DURING_YOUR_TURN];
