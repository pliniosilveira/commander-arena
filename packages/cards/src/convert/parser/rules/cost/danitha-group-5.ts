/**
 * Costs of the Danitha deck program, group 5 (D-1252): "Blight 1" (CR 701.68a: put -1/-1 counters on a creature you control), a cost of an activated ability.
 */
import { map, pattern } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `cost.blight`: "Blight 1", "Blight 2" (CR 701.68a: to blight N is to put N -1/-1 counters on a creature you control, which the player chooses; CR 701.68b: a player with
 * no creature that can take them can't pay it; CR 118.3). The number is a numeral, as Oracle text writes it; lowered as the engine's `blight`, a cost of an ordinary activated
 * ability. Not read: "Blight X", "Blight one", "Blight 0", "Blight", "Blight 1 creature", "Blight 1 time".
 */
export const COST_BLIGHT = defineRule<IrCost>({
  id: 'cost.blight',
  family: 'cost',
  leading: ['blight'],
  cites: ['CR 701.68a (Blight)', 'CR 701.68b (Blight)', 'CR 118.3 (Costs)'],
  examples: ['Blight 1', 'blight 2', 'Blight 3'],
  rejects: [
    'Blight X',
    'Blight one',
    'Blight 0',
    'Blight',
    'Blight 1 creature',
    'Blight 1 time',
    'Blight 01',
    'Blighted 1',
  ],
  parse: node<number, IrCost>(
    'cost.blight',
    map(pattern(/blight ([1-9]\d*)(?![\p{L}\p{N}])/iu), (m) => Number(m[1])),
    (count) => ({ kind: 'blight', count }),
  ),
});

export const DANITHA_G5_COST_RULES = [COST_BLIGHT];
