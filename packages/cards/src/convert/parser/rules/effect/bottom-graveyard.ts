/**
 * Effect rule of the Elemental Incarnation cycle (Endurance): a player puts their whole graveyard on the bottom of their library in a random order. The lowering is in
 * `lower/bottom-graveyard.ts`.
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.bottom-graveyard-random';

/**
 * `effect.bottom-graveyard-random`: "up to one target player puts all the cards from their graveyard on the bottom of their library in a random order." (CR 115.1,
 * 401.4, 404.1, 108.3): the player is a target (none to one), and the cards are the ones in that player's own graveyard, which go to the bottom of their library in an order the
 * game's generator makes, so nobody chooses it. Not read: another player word ("you", "each opponent"), a graveyard or a library that is not theirs, a kind of card, a chosen
 * order ("in any order"), the top of the library, or anything after the sentence.
 */
export const EFFECT_BOTTOM_GRAVEYARD_RANDOM = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['up', 'target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 401.4 (Library)',
    'CR 404.1 (Graveyard)',
    'CR 108.3 (Owner and Controller)',
  ],
  examples: [
    'up to one target player puts all the cards from their graveyard on the bottom of their library in a random order',
    'target player puts all the cards from their graveyard on the bottom of their library in a random order',
  ],
  rejects: [
    'up to two target players put all the cards from their graveyards on the bottom of their library in a random order',
    'you put all the cards from your graveyard on the bottom of your library in a random order',
    'target player puts all the cards from their graveyard on the top of their library in a random order',
    'target player puts all the cards from their graveyard on the bottom of their library in any order',
    'target player puts all the cards from your graveyard on the bottom of their library in a random order',
    'target player puts all the cards from their graveyard on the bottom of your library in a random order',
    'target player puts all the creature cards from their graveyard on the bottom of their library in a random order',
    'target player puts all the cards from their graveyard on the bottom of their library',
    'target opponent puts all the cards from their graveyard on the bottom of their library in a random order and draws a card',
  ],
  parse: single(
    ID,
    sequence(
      optional(literal('up to one '), null),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.filter.player === 'any' && !noun.plural,
      ),
      literal(' '),
      pattern(
        /puts all the cards from their graveyard on the bottom of their library in a random order(?=\.|$)/iu,
      ),
    ),
    ([upTo, player]) => ({
      verb: 'bottomGraveyardRandom',
      // "Up to one target player" is none to one (CR 115.1, 601.2c), as boundsOf reads it from `upTo` and the count.
      args: {
        player:
          upTo === null
            ? player
            : {
                ...player,
                upTo: true,
                count: { kind: 'number' as const, value: 1, span: player.span },
              },
      },
    }),
  ),
});

export const BOTTOM_GRAVEYARD_EFFECT_RULES = [EFFECT_BOTTOM_GRAVEYARD_RANDOM].map(quietly);
