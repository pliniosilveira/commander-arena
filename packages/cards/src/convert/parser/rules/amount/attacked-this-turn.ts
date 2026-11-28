/**
 * Rowdy Research (issue 111): "~ costs {1} less to cast for each creature that attacked this turn." (CR 508.1: a creature attacks when it is declared as an attacker; CR 601.2f: the
 * cost is determined as the spell is cast). The engine's `creaturesAttackedThisTurn`: the different creatures any player declared as attackers this turn.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-creature-attacked`: "for each creature that attacked this turn" (CR 508.1, 601.2f: counted as the cost is determined, once for each creature). Not read: "you
 * controlled", another span ("this combat", "last turn"), a plural "creatures", "attacking" (creatures attacking now), a creature with a quality.
 */
export const AMOUNT_FOR_EACH_CREATURE_ATTACKED = defineRule<IrAmount>({
  id: 'amount.for-each-creature-attacked',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 508.1 (Declare Attackers Step)', 'CR 601.2f (Casting Spells)'],
  examples: [
    'for each creature that attacked this turn',
    'For each creature that attacked this turn',
  ],
  rejects: [
    'for each creature that attacked',
    'for each creature that attacked this combat',
    'for each creature that attacked last turn',
    'for each creature that attacked this turn.',
    'for each creatures that attacked this turn',
    'for each creature you control that attacked this turn',
    'for each creature attacking this turn',
    'for each creature that blocked this turn',
    'for each creature',
    'for each attacking creature',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each creature that attacked this turn(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'creaturesAttackedThisTurn', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const ATTACKED_THIS_TURN_AMOUNT_RULES = [AMOUNT_FOR_EACH_CREATURE_ATTACKED];
