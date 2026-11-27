/**
 * Effect rules of the Elven Council deck (Tales of Middle-earth Commander), group "tokens and shuffles": a target player shuffles their whole graveyard into their library
 * (Learn from the Past) and each player searches for a basic land card and puts it onto the battlefield (Field of Ruin). The lowerings are in `lower/elven-council.ts`.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

const SHUFFLE_ID = 'effect.target-player-shuffles-graveyard';

/**
 * `effect.target-player-shuffles-graveyard`: "Target player shuffles their graveyard into their library." (CR 115.1, 701.24, 404.1, 108.3): the player is a target, every card
 * in their graveyard goes into their library and they shuffle it. The engine's `moveToZone` of each card of that player's graveyard to the library, then `shuffle`. Not read:
 * a player that is not a target ("you", "each player"), a graveyard or a library that is not theirs, only some of the cards, a rider after the sentence.
 */
export const EFFECT_TARGET_PLAYER_SHUFFLES_GRAVEYARD = defineRule<Clauses>({
  id: SHUFFLE_ID,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 701.24 (Shuffle)',
    'CR 404.1 (Graveyard)',
    'CR 108.3 (Owner and Controller)',
  ],
  examples: [
    'target player shuffles their graveyard into their library',
    'Target player shuffles their graveyard into their library',
  ],
  rejects: [
    'target player shuffles your graveyard into their library',
    'target player shuffles their graveyard into your library',
    'target player shuffles their graveyard',
    'target player shuffles their library',
    'target player shuffle their graveyard into their library',
    'target players shuffle their graveyards into their libraries',
    'target player shuffles their hand and graveyard into their library',
    'target player shuffles up to three target cards from their graveyard into their library',
    'target player shuffles their graveyard into their library and draws a card',
    'each player shuffles their graveyard into their library',
    'you shuffle your graveyard into your library',
  ],
  parse: single(
    SHUFFLE_ID,
    sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.filter.player === 'any' && !noun.plural,
      ),
      literal(' '),
      pattern(/shuffles their graveyard into their library(?=\.|$)/iu),
    ),
    ([player]) => ({ verb: 'shuffleGraveyardOf', args: { player } }),
  ),
});

export const ELVEN_COUNCIL_EFFECT_RULES = [EFFECT_TARGET_PLAYER_SHUFFLES_GRAVEYARD].map(quietly);
