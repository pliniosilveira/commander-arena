/**
 * Costs of the Hashaton deck program, group 9 (D-390): the Phyrexian mana symbol in the cost of an activated ability (Rona, Herald of Invasion,
 * "{5}{B/P}: Transform ~."). CR 107.4f: a Phyrexian mana symbol is paid with one mana of its color or with 2 life.
 */
import { map, pattern, satisfy } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule, node } from '../registry';

/** A plain symbol (a number or one color) or a single-color Phyrexian one ({B/P}); a cost of only these. */
const PHYREXIAN_COST = /(?:\{(?:0|[1-9][0-9]*|[WUBRGC])\}|\{[WUBRG]\/P\})+(?![\p{L}\p{N}{])/iu;

/**
 * `cost.mana-phyrexian`: "{B/P}", "{5}{B/P}", "{1}{U/P}{U/P}" (CR 107.4f: each Phyrexian symbol is paid with one mana of its color or 2 life; CR 118.1 costs;
 * CR 602.1 the cost of an activated ability is what precedes the colon). At least one Phyrexian symbol, which is what tells it from `cost.mana`. It lowers in the
 * cost of an ordinary activated ability, where the engine's payment planner pays it (it pays the mana when it can, and the life when it cannot, and never
 * to 0 life, CR 119.4); a mana ability's cost has no Phyrexian symbol the engine runs, so `lowerCost` drops it whole there and the text stays unparsed (a keyword's
 * cost and a spell's additional cost are read by `cost.mana`, which does not read the symbol). Not read: a Phyrexian symbol next to a hybrid one, an X or a snow symbol, a hybrid Phyrexian symbol
 * ({W/U/P}), and a Phyrexian symbol of no color ({P}, {2/P}).
 */
export const COST_MANA_PHYREXIAN = defineRule<IrCost>({
  id: 'cost.mana-phyrexian',
  family: 'cost',
  leading: [],
  cites: [
    'CR 107.4f (Numbers and Symbols)',
    'CR 118.1 (Costs)',
    'CR 119.4 (Life)',
    'CR 602.1 (Activating Activated Abilities)',
  ],
  examples: ['{B/P}', '{5}{B/P}', '{1}{U/P}{U/P}', '{G/P}{G}', '{b/p}'],
  rejects: [
    '{B}',
    '{5}',
    '{T}',
    '{B/P}{R/W}',
    '{B/P}{X}',
    '{B/P}{S}',
    '{W/U/P}',
    '{P}',
    '{2/P}',
    '{B/R}',
    '{B/P} {B/P}',
    '{B/P}x',
  ],
  parse: node<string[], IrCost>(
    'cost.mana-phyrexian',
    satisfy(
      map(pattern(PHYREXIAN_COST), (m): string[] =>
        [...m[0].matchAll(/\{([^}]+)\}/g)].map((s) => (s[1] ?? '').toUpperCase()),
      ),
      (symbols) => symbols.some((s) => s.endsWith('/P')),
    ),
    (symbols) => ({ kind: 'mana', symbols }),
  ),
});

export const HASHATON_G9_COST_RULES = [COST_MANA_PHYREXIAN];
