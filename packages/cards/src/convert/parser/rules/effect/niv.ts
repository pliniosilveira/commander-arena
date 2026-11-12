/**
 * Effect rules of the Niv-Mizzet deck (issue 25): the shuffle of the source and the graveyard into their owners' libraries.
 */
import { pattern } from '../../combinators';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.shuffle-self-and-graveyard`: "shuffle ~ and your graveyard into their owner's library" (CR 701.24c, 701.24d, 400.3, 404.1): the object the
 * ability belongs to and every card of the controller's graveyard each go to the library of its owner (a card of a graveyard always has its owner's
 * graveyard, but the source may be controlled by a player who does not own it), and every library that received a card is shuffled, even when none did
 * (CR 701.24c, 701.24d). A commander goes to the command zone instead at its owner's choice (CR 903.9a, 903.9b), which the engine asks as it moves the cards.
 * The one phrase of "shuffle your graveyard into your library" with the source in it; the lowering writes the shuffle of the owner of the source too.
 */
export const EFFECT_SHUFFLE_SELF_AND_GRAVEYARD = defineRule<Clauses>({
  id: 'effect.shuffle-self-and-graveyard',
  family: 'effect',
  leading: ['shuffle'],
  cites: [
    'CR 701.24c (Shuffle)',
    'CR 701.24d (Shuffle)',
    'CR 404.1 (Graveyard)',
    'CR 108.3 (Owner and Controller)',
    'CR 903.9a (Commander)',
  ],
  examples: [
    "shuffle ~ and your graveyard into their owner's library",
    'shuffle ~ and your graveyard into their owner’s library',
  ],
  rejects: [
    "shuffle ~ and your graveyard into their owner's library.",
    'shuffle ~ and your graveyard into their library',
    'shuffle ~ and your graveyard into your library',
    "shuffle ~ and your graveyard into its owner's library",
    "shuffle ~ into their owner's library",
    "shuffle your graveyard and ~ into their owner's library",
    "shuffle ~ and all graveyards into their owner's library",
    "shuffle ~ and target player's graveyard into their owner's library",
    "shuffle ~ and your hand into their owner's library",
    "shuffle ~ and your graveyard into their owner's library and draw a card",
    'shuffle ~ and your graveyard',
  ],
  parse: single(
    'effect.shuffle-self-and-graveyard',
    spanned(
      pattern(/shuffle ~ and your graveyard into their owner['’]s library(?![\p{L}\p{N}])/iu),
    ),
    ({ span }) => ({
      verb: 'shuffleSelfAndGraveyardIn',
      args: {
        objects: {
          kind: 'noun',
          det: 'each',
          filter: { zone: 'graveyard', controller: 'you', card: true, raw: 'your graveyard' },
          upTo: false,
          plural: true,
          other: false,
          span,
          rule: 'effect.shuffle-self-and-graveyard',
        },
      },
    }),
  ),
});

export const NIV_EFFECT_RULES = [EFFECT_SHUFFLE_SELF_AND_GRAVEYARD];
