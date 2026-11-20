/**
 * Effect rule of Burning Curiosity (CR 701.13, 614.1a, 608.2c): the elliptical "exile the top three cards" that ends "If this spell's additional cost was paid, exile the top
 * three cards instead.", where the sentence before it ("Exile the top two cards of your library.") has said whose library. It names no library, so it means something only as the
 * "instead" of an exile of the top cards of the controller's library, and the lowering of such a sentence is the only one that reads it (`ellipticalExileTop`): the engine runs
 * the earlier `exileTop` with the new number.
 */
import { map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';
import { BOUNDARY, number } from './dragons';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.exile-top-instead';

/**
 * `effect.exile-top-instead`: "exile the top three cards" (a number of two or more, in digits or words), with no library said. Only the lowering of a sentence that says " instead" after
 * an exile of the top cards of the controller's library reads it. Not read: "the top card", one card, X, a library named ("of your library", "of target player's library", which
 * `effect.exile-top` and `effect.exile-top-face-down` read), "face down", and without "the top".
 */
export const EFFECT_EXILE_TOP_INSTEAD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 614.1a (Replacement Effects)'],
  examples: ['exile the top three cards', 'exile the top 3 cards', 'exile the top two cards'],
  rejects: [
    'exile the top card',
    'exile the top one cards',
    'exile the top X cards',
    'exile the top three cards of your library',
    'exile the top three cards face down',
    'exile the top cards',
    'exile top three cards',
    'exile the top three card',
    'exile the top 0 cards',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/exile the top /iu),
      spanned(
        map(
          sequence(
            satisfy(quantity, (n) => n >= 2),
            pattern(new RegExp(` cards${BOUNDARY}`, 'iu')),
          ),
          ([n]) => n,
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value, span } = r.value[1];
    const count: IrAmount = number(value, span);
    return {
      ok: true,
      value: [makeClause(ID, 'exileTopInstead', { count }, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});

export const EXILE_TOP_INSTEAD_EFFECT_RULES = [EFFECT_EXILE_TOP_INSTEAD].map(quietly);
