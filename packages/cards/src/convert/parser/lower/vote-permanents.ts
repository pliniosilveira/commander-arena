/**
 * Lowerings of Council's Judgment (CR 701.38): a vote for the nonland permanents the controller does not control, and the exile of the permanents with the most votes. Each is the
 * engine's node for one template (`rules/effect/vote-permanents.ts`).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

/** "Starting with you, each player votes for a nonland permanent you don't control." (CR 701.38a, 701.38b): the permanents are read for the controller as they vote. */
export const VOTE_FOR_NONLAND_PERMANENT: Lowering<IrClause, Effects> = {
  head: 'voteForNonlandPermanent',
  id: 'lower.vote-for-nonland-permanent',
  needs: ['effect:voteFor'],
  lower(clause) {
    const effect: Effect = {
      kind: 'voteFor',
      choices: {
        kind: 'objects',
        filter: { zone: 'battlefield', notTypes: ['land'], controller: 'opponent' },
      },
      startingWith: 'you',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Exile each permanent with the most votes or tied for most votes." (CR 701.38a, 406.1). */
export const EXILE_MOST_VOTED: Lowering<IrClause, Effects> = {
  head: 'exileMostVoted',
  id: 'lower.exile-most-voted',
  needs: ['effect:exile', 'selector:mostVotedObjects'],
  lower(clause) {
    const effect: Effect = { kind: 'exile', objects: { kind: 'mostVotedObjects' } };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const VOTE_PERMANENTS_NEEDS: readonly FeatureRef[] = [
  'effect:voteFor',
  'effect:exile',
  'selector:mostVotedObjects',
];

export const VOTE_PERMANENTS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  VOTE_FOR_NONLAND_PERMANENT,
  EXILE_MOST_VOTED,
];
