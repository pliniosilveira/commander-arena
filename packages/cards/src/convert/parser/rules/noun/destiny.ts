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

/**
 * `noun.each-opponent-dealt-combat-damage-by-named`: "each opponent dealt combat damage this game by a creature named ~" (Gollum, Obsessed Stalker; CR 120.2a, 510.2: combat damage a
 * creature dealt to a player, 102.2: the opponents, 101.4: in turn order). The `~` is the name of the card with the ability: the engine's `PlayerSelector` `combatDamagedByNamed`,
 * read from the names of the creatures that have dealt combat damage to each player this game. Not read: another group ("each player", "target opponent"), another span ("this turn",
 * "last turn", no span), another kind of damage, another name than the card's own ("a creature named Gollum"), "a creature" alone, "by ~" (the permanent itself).
 */
export const NOUN_EACH_OPPONENT_COMBAT_DAMAGED_BY_NAMED = defineRule<IrNoun>({
  id: 'noun.each-opponent-dealt-combat-damage-by-named',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 120.2a (Damage)',
    'CR 510.2 (Combat Damage Step)',
    'CR 102.2 (Players)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'each opponent dealt combat damage this game by a creature named ~',
    'Each opponent dealt combat damage this game by a creature named ~',
  ],
  rejects: [
    'each opponent dealt combat damage this turn by a creature named ~',
    'each opponent dealt combat damage by a creature named ~',
    'each opponent dealt damage this game by a creature named ~',
    'each player dealt combat damage this game by a creature named ~',
    'each opponent dealt combat damage this game by a creature',
    'each opponent dealt combat damage this game by ~',
    'each opponent dealt combat damage this game by a creature named Gollum',
    'each opponent dealt combat damage this game by creatures named ~',
    'each opponents dealt combat damage this game by a creature named ~',
    'target opponent dealt combat damage this game by a creature named ~',
  ],
  parse: node<string, IrNoun>(
    'noun.each-opponent-dealt-combat-damage-by-named',
    map(
      pattern(
        /each opponent dealt combat damage this game by a creature named ~(?![\p{L}\p{N}])/iu,
      ),
      (m) => m[0],
    ),
    (raw) => ({
      kind: 'noun',
      det: 'combatDamagedByNamed',
      filter: { raw, namedSelf: true },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const DESTINY_EARLY_NOUN_RULES = [
  NOUN_EACH_PLAYER_ATTACKED,
  NOUN_EACH_OPPONENT_COMBAT_DAMAGED_BY_NAMED,
];
