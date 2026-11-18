/**
 * Condition rules of group 1 of the Lorehold Spirit deck (issue 86): "if you search your library this way" (Claim Jumper: "... If you search your library this way, shuffle.").
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.searched-this-way`: "you search your library this way" (CR 608.2c: what the instruction before it did, CR 701.23a: the player looked through the library, even if no
 * card was found; a "may" search that was declined is no search). The engine's `thisWayAtLeast` of `searched`. Only after a search of the same text, which the lowering checks.
 */
export const CONDITION_SEARCHED_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.searched-this-way',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.23a (Search)'],
  examples: ['you search your library this way', 'You search your library this way'],
  rejects: [
    'you searched your library this way',
    'you search your library',
    'you search your library this turn',
    'you search a library this way',
    'an opponent searches their library this way',
    'you search your graveyard this way',
    'you search your library this way and',
    'you did search your library this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you search your library this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'searchedThisWay' },
        span: { start: pos, end: r.pos },
        rule: 'condition.searched-this-way',
      },
      pos: r.pos,
    };
  },
});

export const LOREHOLD_G1_CONDITION_RULES = [CONDITION_SEARCHED_THIS_WAY];
