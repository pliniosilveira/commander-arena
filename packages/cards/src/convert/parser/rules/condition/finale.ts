/**
 * Condition of Finale of Revelation (issue 337): "X is 10 or more" (CR 107.3, 608.2c).
 */
import { fail, pattern } from '../../combinators';
import type { IrComparison, IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.x-is`: "X is 10 or more", "X is 5 or less", "X is 3" (CR 107.3a, 608.2c: the X announced for the spell that is resolving, against a number). The
 * number is written in digits and is at least 1; "or greater" and "or higher" are "or more", "or lower" is "or less". Only the capital X of the spell's cost
 * (the engine's `xIs`; an X the text defines, "where X is ...", is another amount) and only the words of the comparison: a range, a list or a number word are not read.
 * Whether the spell has an X is checked by `validateCard`.
 */
export const CONDITION_X_IS = defineRule<IrCondition>({
  id: 'condition.x-is',
  family: 'condition',
  leading: ['x'],
  cites: ['CR 107.3 (Variables)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'X is 10 or more',
    'X is 5 or less',
    'X is 3',
    'X is 4 or greater',
    'X is 4 or higher',
  ],
  rejects: [
    'X is',
    'X is 0',
    'X is ten or more',
    'X is 10 or',
    'X is 1-3',
    'X is 1 or 2',
    'X is 10 or more or less',
    'X is at least 10',
    'X is greater than 10',
    'Y is 10 or more',
    'X was 10 or more',
    'the X is 10 or more',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /X is (\d+)(?: or (more|higher|greater|less|lower))?(?![\p{L}\p{N}])(?![-–—])(?! or )/u,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: match, span } = r.value;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value) || value < 1) return fail(ctx, pos);
    const word = (match[2] ?? '').toLowerCase();
    const compare: IrComparison = {
      cmp: word === '' ? 'equal' : word === 'less' || word === 'lower' ? 'atMost' : 'atLeast',
      value,
    };
    return {
      ok: true,
      value: { kind: 'condition', test: { kind: 'xIs', compare }, span, rule: 'condition.x-is' },
      pos: r.pos,
    };
  },
});

export const FINALE_CONDITION_RULES = [CONDITION_X_IS];
