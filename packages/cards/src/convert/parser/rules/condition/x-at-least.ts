/**
 * The condition of a spell that reads its X (issue 233, Martial Coup): "X is 5 or more" (CR 107.3a, 608.2c), read after the "if" of a sentence of a spell. The engine reads the X
 * announced for the spell (`amountIs` of `x`); the lowering reads it only where the face has an {X} to announce.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.x-at-least`: "X is 5 or more" (a whole number of at least 1). Not read: another comparison ("less", "exactly"), a word for the number, an amount that is not X, and
 * "or more" missing.
 */
export const CONDITION_X_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.x-at-least',
  family: 'condition',
  leading: ['x'],
  cites: ['CR 107.3a (Variables)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['X is 5 or more', 'X is 1 or more', 'x is 10 or more'],
  rejects: [
    'X is 5 or less',
    'X is 5',
    'X is five or more',
    'X is 0 or more',
    'Y is 5 or more',
    'X is 5 or more.',
    'X is greater than 5',
    'X is 5 or more and you control a Forest',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/x is ([1-9]\d*) or more(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'xAtLeast', atLeast: Number(r.value[1]) },
        span: { start: pos, end: r.pos },
        rule: 'condition.x-at-least',
      },
      pos: r.pos,
    };
  },
});
