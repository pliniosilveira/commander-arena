/**
 * The cost "Put ~ on the bottom of its owner's library" (CR 118.3, 401.4): the permanent with the ability leaves for the bottom of its owner's library as the ability is
 * activated, so it is not there for the effect.
 */
import { pattern } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `cost.put-this-on-library-bottom`: "Put ~ on the bottom of its owner's library". Not read: the top of the library, another permanent, a card of another zone, "your library"
 * (the owner is who the rules name, CR 108.3).
 */
export const COST_PUT_THIS_ON_LIBRARY_BOTTOM = defineRule<IrCost>({
  id: 'cost.put-this-on-library-bottom',
  family: 'cost',
  leading: ['put'],
  cites: ['CR 118.3 (Costs)', 'CR 401.4 (Library)', 'CR 108.3 (Owners and Controllers)'],
  examples: [
    "Put ~ on the bottom of its owner's library",
    "put ~ on the bottom of its owner's library",
  ],
  rejects: [
    'Put ~ on the bottom',
    "Put ~ on top of its owner's library",
    'Put ~ on the bottom of your library',
    "Put a creature you control on the bottom of its owner's library",
    "Put ~ on the bottom of its owner's library and",
    "Put ~ on the bottom of its owner's hand",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/put ~ on the bottom of its owner['’]s library(?![\p{L}\p{N}])(?!\s+and)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'putThisOnLibraryBottom',
        span: r.value.span,
        rule: 'cost.put-this-on-library-bottom',
      },
      pos: r.pos,
    };
  },
});

export const EXTRA_TURN_COST_RULES = [COST_PUT_THIS_ON_LIBRARY_BOTTOM];
