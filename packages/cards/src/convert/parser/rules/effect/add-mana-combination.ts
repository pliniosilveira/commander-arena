/**
 * Effect rule of the Exit from Exile deck (Xenagos, the Reveler): "Add X mana in any combination of {R} and/or {G}, where X is the number of creatures you control." (CR 106.1b, 608.2d,
 * 107.3c). The lowering is `lower/add-mana-combination.ts`.
 */
import { pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrManaSpec } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.add-mana-combination-of-two-colors';

/**
 * `effect.add-mana-combination-of-two-colors`: X mana, each of the first or the second color named, the player choosing how many of each as the effect resolves (CR 106.1b: mana is of
 * a color or colorless; CR 608.2d: the player chooses as it comes up), where X is a count of what the controller has. The engine's `addManaCombination`. Not read: a mana ability (the
 * words of a mana ability are `effect.add-mana`'s), two colors that are the same, a color that is not one of the five, a number in place of X, another way to say X.
 */
export const EFFECT_ADD_MANA_COMBINATION_OF_TWO_COLORS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['add'],
  cites: [
    'CR 106.1b (Mana)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 107.3c (Variables)',
  ],
  examples: [
    'add X mana in any combination of {R} and/or {G}, where X is the number of creatures you control',
  ],
  rejects: [
    'add X mana in any combination of {R} and/or {R}, where X is the number of creatures you control',
    'add X mana in any combination of {R} and/or {C}, where X is the number of creatures you control',
    'add two mana in any combination of {R} and/or {G}, where X is the number of creatures you control',
    'add X mana in any combination of {R} and/or {G}',
    'add X mana in any combination of {R}, {G}, and/or {W}, where X is the number of creatures you control',
    'add X mana in any combination of {R} or {G}, where X is the number of creatures you control',
    'add X mana in any combination of colors, where X is the number of creatures you control',
  ],
  parse: single(
    ID,
    satisfy(
      sequence(
        pattern(
          /add X mana in any combination of \{([WUBRG])\} and\/or \{([WUBRG])\}, where X is /iu,
        ),
        family<IrAmount>('amount', { only: ['amount.number-of'] }),
      ),
      ([head]) => (head[1] ?? '').toUpperCase() !== (head[2] ?? '').toUpperCase(),
    ),
    ([head, amount]) => {
      const mana: IrManaSpec = {
        kind: 'manaSpec',
        what: {
          kind: 'symbols',
          symbols: [(head[1] ?? '').toUpperCase(), (head[2] ?? '').toUpperCase()],
        },
        span: amount.span,
        rule: ID,
      };
      return { verb: 'addManaCombination', args: { mana, amount } };
    },
  ),
});

export const ADD_MANA_COMBINATION_EFFECT_RULES = [EFFECT_ADD_MANA_COMBINATION_OF_TWO_COLORS];
