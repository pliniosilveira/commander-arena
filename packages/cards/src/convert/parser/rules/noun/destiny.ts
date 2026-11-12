/**
 * Noun rules of the Angel of Destiny group (D-269): the players a creature attacked this turn.
 */
import { map, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `noun.each-player-attacked`: "each player ~ attacked this turn" (D-269, CR 508.6: a player has "attacked [a player]" if the first player declared one
 * or more creatures as attackers attacking the second player; CR 506.3: a planeswalker or a battle can be attacked too, and is not a player). The
 * `~` is the permanent of the ability ("this creature" in the Oracle text): the engine's `PlayerSelector` `attackedPlayers`, read from the turn log. Not
 * read: another verb of combat ("attacks", "is attacking", "was dealt combat damage by"), another span ("this combat", "last turn", no span at all),
 * another group ("each opponent", "that player"), another attacker than the permanent itself.
 */
export const NOUN_EACH_PLAYER_ATTACKED = defineRule<IrNoun>({
  id: 'noun.each-player-attacked',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 508.6 (Declare Attackers Step)',
    'CR 506.3 (Combat Phase)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: ['each player ~ attacked this turn', 'Each player ~ attacked this turn'],
  rejects: [
    'each player ~ attacked',
    'each player ~ attacked this combat',
    'each player ~ attacked last turn',
    'each player ~ attacks this turn',
    'each player ~ is attacking',
    'each opponent ~ attacked this turn',
    'each players ~ attacked this turn',
    'each player that attacked this turn',
    'each player attacked this turn',
    'each player a creature attacked this turn',
    'each player it attacked this turn',
    'each player ~ attacked or blocked this turn',
    'each player ~ attacked this turn with a creature',
  ],
  parse: node<string, IrNoun>(
    'noun.each-player-attacked',
    map(pattern(/each player ~ attacked this turn(?![\p{L}\p{N}])/iu), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'attackedPlayers',
      filter: { raw },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const DESTINY_EARLY_NOUN_RULES = [NOUN_EACH_PLAYER_ATTACKED];
