/**
 * Amount rule of the Quandrix Unlimited deck, group D2 (Hydroid Krasis, The Goose Mother): "half X, rounded down" (CR 107.1a, 107.3a: half the X announced for the spell, rounded the
 * way the text says). `normalizeOracleText` writes the rounding right after the "X", where Oracle text says it after the whole instruction ("create half X Food tokens, rounded up.")
 * or in a sentence of its own ("Round down each time."); the engine's `half` of `x`.
 */
import { map, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';

export const AMOUNT_HALF_X = defineRule<IrAmount>({
  id: 'amount.half-x',
  family: 'amount',
  leading: ['half'],
  cites: ['CR 107.1a (Numbers and Symbols)', 'CR 107.3a (Numbers and Symbols)'],
  examples: ['half X, rounded down', 'half X, rounded up', 'Half X, rounded up'],
  rejects: ['half X', 'half, rounded down', 'half Y, rounded down', 'half X rounded down', 'X'],
  parse: map(
    spanned(pattern(/half X, rounded (down|up)(?![\p{L}\p{N}])/iu)),
    ({ value, span }): IrAmount => ({
      kind: 'half',
      of: { kind: 'x', span },
      round: (value[1] ?? 'down').toLowerCase() as 'down' | 'up',
      span,
    }),
  ),
});

export const HALF_X_AMOUNT_RULES = [AMOUNT_HALF_X];
