/**
 * Effect rule of the Exit from Exile deck (Dream Pillager): "exile that many cards from the top of your library" (CR 701.13, 401.1, 608.2c). The number is whatever "that many" counts in
 * the ability (here the combat damage a trigger is about); the cards are what "those exiled cards" name afterwards, as for `effect.exile-top`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.exile-that-many-from-top';

export const EFFECT_EXILE_THAT_MANY_FROM_TOP = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['exile that many cards from the top of your library'],
  rejects: [
    'exile that many cards',
    'exile that many cards from the top of target player’s library',
    'exile that many cards from the top of each library',
    'exile that much cards from the top of your library',
    'exile that many from the top of your library',
    'exile that many cards from the top of your library face down',
    'exile that many cards from your library',
  ],
  parse: single(
    ID,
    sequence(
      // One guard, so a text that is not this exile fails where it starts ("exile your graveyard" is no near miss of this rule).
      pattern(/exile (?=that many cards from the top of your library)/iu),
      family<IrAmount>('amount', { only: ['amount.that-many'] }),
      literal(' cards from the top of your library'),
    ),
    ([, count]) => ({ verb: 'exileTop', args: { count } }),
  ),
});

export const EXILE_THAT_MANY_EFFECT_RULES = [EFFECT_EXILE_THAT_MANY_FROM_TOP];
