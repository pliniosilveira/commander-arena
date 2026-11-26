/**
 * Conditions of group C of the Jump Scare! deck (issue 108): "~'s power is even" (Kianne, Corrupted Memory) (the cards in hand of Kefnet are read by `condition.you-have-many-cards-in-hand`).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

const PARITY_ID = 'condition.this-power-parity';

/**
 * `condition.this-power-parity`: "~'s power is even", "~'s power is odd" (Kianne, Corrupted Memory; CR 107.1: the numbers of the game are integers, a power may be negative; CR 208.1): the power of the permanent
 * itself as it is now. The engine's `thisPowerParity`. Not read: another permanent's power, "is an even number", a comparison, "toughness".
 */
export const CONDITION_THIS_POWER_PARITY = defineRule<IrCondition>({
  id: PARITY_ID,
  family: 'condition',
  leading: ["~'s", '~’s'],
  cites: ['CR 107.1 (Numbers)', 'CR 208.1 (Power and Toughness)'],
  examples: ["~'s power is even", "~'s power is odd", '~’s power is even'],
  rejects: [
    "~'s toughness is even",
    "~'s power is even.",
    "~'s power is an even number",
    "~'s power is 4 or greater",
    "that creature's power is even",
    '~ power is even',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~['’]s power is (even|odd)(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const parity = (r.value[1] ?? '').toLowerCase() === 'even' ? 'even' : 'odd';
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thisPowerParity', parity },
        span,
        rule: PARITY_ID,
      },
      pos: r.pos,
    };
  },
});

export const JUMP_SCARE_C_CONDITION_RULES = [CONDITION_THIS_POWER_PARITY];
