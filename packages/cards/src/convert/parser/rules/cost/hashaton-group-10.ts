/**
 * Costs of the Hashaton deck program, group 10 (D-386): "discard X cards" (CR 107.3a, 701.9, 118.8), the additional cost of Restless Dreams.
 * Read only by `static.additional-cost`; the lowering of any other cost refuses it.
 */
import { map, pattern } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `cost.discard-x`: "Discard X cards" (CR 107.3a: X is announced as the spell is cast, CR 601.2b; CR 701.9a: the player chooses the cards of their hand, CR 118.3: a cost that cannot
 * be paid is not paid, so X is at most the cards in hand). Its own rule, not a form of `cost.discard` (a number of cards is a different cost), so the keyword costs that discard
 * (Cycling, Ward) never read it; it lowers as the engine's `discardX`, an additional cost to cast a spell. Not read: "Discard X card", "Discard X cards at random", "Discard X",
 * "Discard Y cards", "Discard {X} cards", "Discard half your hand", "Discard X creature cards".
 */
export const COST_DISCARD_X = defineRule<IrCost>({
  id: 'cost.discard-x',
  family: 'cost',
  leading: ['discard'],
  cites: ['CR 107.3a (Numbers and Symbols)', 'CR 701.9 (Discard)', 'CR 118.8 (Costs)'],
  examples: ['Discard X cards', 'discard X cards'],
  rejects: [
    'Discard X card',
    'Discard X cards at random',
    'Discard X',
    'Discard Y cards',
    'Discard {X} cards',
    'Discard half your hand',
    'Discard X creature cards',
    'Discard 2 cards',
    'Discard cards',
  ],
  parse: node<string, IrCost>(
    'cost.discard-x',
    map(pattern(/discard X cards(?![\p{L}\p{N}])(?! at random)/iu), (m) => m[0]),
    () => ({ kind: 'discardX' }),
  ),
});

export const HASHATON_G10_COST_RULES = [COST_DISCARD_X];
