/**
 * Effect rule of the Multiverse Reforged deck (issue 81, Plan for All Outcomes): the owner of a permanent puts it on the top or the bottom of their library.
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.owner-puts-on-library';

/**
 * `effect.owner-puts-on-library`: "the owner of up to one other target nonland permanent puts it on their choice of the top or bottom of their library" (CR 108.3, 401.4: the owner of
 * the permanent, not its controller, chooses between the top and the bottom; CR 111.7: a token ceases to exist). The engine's `ownerPutsOnLibrary`. Not read: the controller, "you put it",
 * another place, "shuffles it into", a group.
 */
export const EFFECT_OWNER_PUTS_ON_LIBRARY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['the'],
  cites: ['CR 108.3 (Objects)', 'CR 401.4 (Library)', 'CR 111.7 (Tokens)'],
  examples: [
    'the owner of up to one other target nonland permanent puts it on their choice of the top or bottom of their library',
    'the owner of target creature puts it on their choice of the top or bottom of their library',
    'the owner of target spell, nonland permanent, or card in a graveyard puts it on their choice of the top or bottom of their library',
  ],
  rejects: [
    'the owner of target creature puts it on top of their library',
    'the owner of target creature puts it on the bottom of their library',
    'the controller of target creature puts it on their choice of the top or bottom of their library',
    'you put target creature on your choice of the top or bottom of your library',
    'the owner of target creature shuffles it into their library',
    'the owner of target creature puts it on their choice of the top or bottom of their library and draws a card',
    'the owner of each creature puts it on their choice of the top or bottom of their library',
  ],
  parse: single(
    ID,
    sequence(
      literal('the owner of '),
      // Endless Detour: "target spell, nonland permanent, or card in a graveyard".
      family<IrNoun>('noun', {
        only: ['noun.target-permanent', 'noun.target-spell-permanent-or-graveyard-card'],
      }),
      literal(' puts it on their choice of the top or bottom of their library'),
    ),
    ([, objects]) => ({ verb: 'ownerPutsOnLibrary', args: { objects } }),
  ),
});

export const OWNER_LIBRARY_EFFECT_RULES = [EFFECT_OWNER_PUTS_ON_LIBRARY];
