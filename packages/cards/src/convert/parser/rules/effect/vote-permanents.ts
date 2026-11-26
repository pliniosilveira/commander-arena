/**
 * Effect rules of Council's Judgment (CR 701.38): a vote for permanents and the exile of the permanents with the most votes. Each phrase is one template of that card, written whole: the
 * engine's `voteFor` of the nonland permanents the controller does not control, and an `exile` of `mostVotedObjects` (`lower/vote-permanents.ts`). The votes of words are `effect.vote`,
 * the secret votes `effect.secret-vote`.
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { single } from './operands';
import type { Clauses } from './operands';

const WORD_END = '(?![\\p{L}\\p{N}-])';

/**
 * `effect.vote-for-nonland-permanent`: "starting with you, each player votes for a nonland permanent you don't control" (CR 701.38a: each player, starting with the controller and
 * proceeding in turn order, chooses one of the choices; CR 701.38b: the choices may be objects, here the nonland permanents on the battlefield the controller does not control, and
 * none of them is targeted). The engine's `voteFor` of objects, a public vote. Not read: another starting player, "secretly", another kind of permanent, "an additional time", words after.
 */
export const EFFECT_VOTE_FOR_NONLAND_PERMANENT = defineRule<Clauses>({
  id: 'effect.vote-for-nonland-permanent',
  family: 'effect',
  leading: ['starting'],
  cites: [
    'CR 701.38a (Vote)',
    'CR 701.38b (Vote)',
    'CR 701.38c (Vote)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ["starting with you, each player votes for a nonland permanent you don't control"],
  rejects: [
    "starting with you, each player votes for a permanent you don't control",
    "starting with you, each player votes for a nonland permanent an opponent controls",
    'starting with you, each player votes for a nonland permanent',
    "starting with the player to your left, each player votes for a nonland permanent you don't control",
    "starting with you, each player secretly votes for a nonland permanent you don't control",
    "starting with you, each player votes for a nonland permanent you don't control an additional time",
    "starting with you, each player votes for a nonland permanent you don't control, then draw a card",
    "starting with you, each opponent votes for a nonland permanent you don't control",
  ],
  parse: single(
    'effect.vote-for-nonland-permanent',
    pattern(
      new RegExp(
        `starting with you, each player votes for a nonland permanent you don['’]t control${WORD_END}`,
        'iu',
      ),
    ),
    () => ({ verb: 'voteForNonlandPermanent', args: {} }),
  ),
});

/**
 * `effect.exile-most-voted`: "exile each permanent with the most votes or tied for most votes" (CR 701.38a, 406.1: the permanents with the greatest number of votes, every one of a tie,
 * are exiled; with no votes, nothing). The engine's `exile` of `mostVotedObjects`. Not read: another action, "target", another reading of the votes.
 */
export const EFFECT_EXILE_MOST_VOTED = defineRule<Clauses>({
  id: 'effect.exile-most-voted',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.38a (Vote)', 'CR 406.1 (Exile)'],
  examples: ['exile each permanent with the most votes or tied for most votes'],
  rejects: [
    'destroy each permanent with the most votes or tied for most votes',
    'exile each creature with the most votes or tied for most votes',
    'exile each permanent with the most votes',
    'exile target permanent with the most votes or tied for most votes',
    'exile each permanent with the most votes or tied for most votes and',
    'exile each permanent with the fewest votes or tied for fewest votes',
  ],
  parse: single(
    'effect.exile-most-voted',
    pattern(
      new RegExp(
        `exile each permanent with the most votes or tied for most votes${WORD_END}`,
        'iu',
      ),
    ),
    () => ({ verb: 'exileMostVoted', args: {} }),
  ),
});

export const VOTE_PERMANENTS_EFFECT_RULES = [
  EFFECT_VOTE_FOR_NONLAND_PERMANENT,
  EFFECT_EXILE_MOST_VOTED,
];
