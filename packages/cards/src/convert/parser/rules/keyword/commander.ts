/**
 * The line "~ can be your commander." (stage P47, D-200, CR 903.3, 113.6n): the ability of a card that is not a legendary creature, Vehicle or
 * Spacecraft and may still be a commander (the planeswalkers Teferi, Temporal Archmage, Nahiri, the Lithomancer and Lord Windgrace). It works before the
 * game, when the deck is built (`packages/cards` reads it when it checks a commander, D-053); it does nothing in play.
 */
import { map, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, node } from '../registry';

/** `keyword.can-be-commander`: "~ can be your commander" (CR 903.3). The card names itself; no other subject is read. */
export const KEYWORD_CAN_BE_COMMANDER = defineRule<readonly IrKeyword[]>({
  id: 'keyword.can-be-commander',
  family: 'keyword',
  leading: ['~'],
  cites: ['CR 903.3 (Commander)', 'CR 113.6n (Abilities)'],
  examples: ['~ can be your commander', '~ can be your commander.'],
  rejects: [
    '~ can be your commanders',
    '~ can be a commander',
    'it can be your commander',
    '~ can be your commander, flying',
    '~ can be your commander and',
    'can be your commander',
  ],
  parse: map(
    node<RegExpExecArray, IrKeyword>(
      'keyword.can-be-commander',
      pattern(/~ can be your commander\.?(?![\p{L}\p{N}])/iu),
      () => ({ kind: 'keyword', name: 'canBeCommander', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const COMMANDER_KEYWORD_RULES = [KEYWORD_CAN_BE_COMMANDER];
