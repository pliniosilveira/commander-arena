/**
 * Effect rule of the Multiverse Reforged deck (issue 81, Jace, Multiverse Architect): "they may pay {2}. If they don't, creatures they control can't attack Jaces you control this turn."
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { PLANESWALKER_TYPES } from '../noun/subtypes';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.pay-or-cant-attack-planeswalkers';

/**
 * `effect.pay-or-cant-attack-planeswalkers`: "they may pay {2}. If they don't, creatures they control can't attack Jaces you control this turn" (CR 118.12a, 508.1a, 611.2a): the player
 * the trigger is about (the player whose combat it is) is asked to pay; one who does not pay has their creatures barred from the planeswalkers of that subtype the controller controls
 * until end of turn. The engine's `unlessPays` of the trigger's player with `cantAttackPlaneswalkers`. Only a planeswalker subtype, in the plural, and only a mana cost.
 */
export const EFFECT_PAY_OR_CANT_ATTACK_PLANESWALKERS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['they'],
  cites: [
    'CR 118.12a (Costs)',
    'CR 508.1a (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 306.5b (Planeswalkers)',
  ],
  examples: [
    "they may pay {2}. If they don't, creatures they control can't attack Jaces you control this turn",
    "they may pay {1}{W}. If they don't, creatures they control can't attack Gideons you control this turn",
  ],
  rejects: [
    "they may pay {2}. If they don't, creatures they control can't attack Jaces you control",
    "they may pay {2}. If they don't, creatures they control can't attack Jaces you control until end of turn",
    "they may pay {2}. If they don't, creatures they control can't attack Goblins you control this turn",
    "they may pay {X}. If they don't, creatures they control can't attack Jaces you control this turn",
    "they may pay {2}. If you don't, creatures they control can't attack Jaces you control this turn",
    "you may pay {2}. If you don't, creatures you control can't attack Jaces you control this turn",
    "they may pay {2}. If they don't, creatures they control can't attack Jaces they control this turn",
    "they may pay {2}. If they don't, creatures they control can't attack Jace you control this turn",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('they may pay '),
        family<IrCost>('cost', { only: ['cost.mana'] }),
        pattern(
          /\. if they don['’]t, creatures they control can['’]t attack ([\p{L}]+)s you control this turn(?![\p{L}\p{N}])/iu,
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value, span } = r.value;
    const [, cost, tail] = value;
    const subtype = tail[1];
    if (subtype === undefined) return fail(ctx, pos);
    const name = `${subtype.charAt(0).toUpperCase()}${subtype.slice(1).toLowerCase()}`;
    if (!PLANESWALKER_TYPES.has(name)) return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          ID,
          'payOrCantAttackPlaneswalkers',
          {
            cost: { kind: 'costList', costs: [cost], span, rule: ID },
            subtype: { kind: 'name', name, span, rule: ID },
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const PAY_OR_CANT_ATTACK_EFFECT_RULES = [EFFECT_PAY_OR_CANT_ATTACK_PLANESWALKERS].map(
  quietly,
);
