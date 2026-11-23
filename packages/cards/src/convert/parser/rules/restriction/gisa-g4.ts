/**
 * Restriction rules of group 4 of the Gisa deck (issue 41, D-462): "Activate only during your turn." (Tetzimoc, Primal Death). The other restrictions are `restriction.sorcery`,
 * `restriction.if` and `restriction.once-each-turn`.
 */
import { literal, sequence } from '../../combinators';
import type { IrCondition, IrRestriction } from '../../ir/types';
import { defineRule, family } from '../registry';

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

/**
 * `restriction.during-your-turn-and-if`: "Activate only during your turn and only if a card left your graveyard this turn." (issue 102, Essence Anchor; CR 602.5b): both
 * tests must hold as the ability is activated, one node whose condition is the engine's `and` of it being the controller's turn and the condition. Not read: another turn,
 * "and only as a sorcery", a missing full stop, "only if" before "during your turn".
 */
export const RESTRICTION_DURING_YOUR_TURN_AND_IF = defineRule<IrRestriction>({
  id: 'restriction.during-your-turn-and-if',
  family: 'restriction',
  leading: ['activate'],
  cites: ['CR 602.5b (Activating Activated Abilities)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'Activate only during your turn and only if a card left your graveyard this turn.',
    'activate only during your turn and only if you control a creature.',
  ],
  rejects: [
    'Activate only during your turn and only if a card left your graveyard this turn',
    'Activate only during your turn and only if',
    'Activate only during your turn and only as a sorcery.',
    'Activate only during an opponent’s turn and only if you control a creature.',
    'Activate only if you control a creature and only during your turn.',
  ],
  parse: (ctx, pos) => {
    const id = 'restriction.during-your-turn-and-if';
    const r = sequence(
      literal('activate only during your turn and only if '),
      family<IrCondition>('condition'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const turn: IrCondition = {
      kind: 'condition',
      test: { kind: 'yourTurn' },
      span,
      rule: id,
    };
    const restriction: IrRestriction = {
      kind: 'restriction',
      condition: {
        kind: 'condition',
        test: { kind: 'and', terms: [turn, r.value[1]] },
        span,
        rule: id,
      },
      span,
      rule: id,
    };
    return { ok: true, value: restriction, pos: r.pos };
  },
});

export const GISA_G4_RESTRICTION_RULES = [
  RESTRICTION_DURING_YOUR_TURN,
  RESTRICTION_DURING_YOUR_TURN_AND_IF,
];
