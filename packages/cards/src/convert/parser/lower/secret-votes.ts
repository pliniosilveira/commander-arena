/**
 * Lowerings of the secret council cards (Círdan the Shipwright, Elrond of the White Council, Trap the Trespassers, Erestor of the Council, Model of Unity; CR 701.38): a secret vote for a
 * player, a creature or a word, and the sentences that read what was voted. Each is the engine's node for one template of those cards (`rules/effect/secret-votes.ts`).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const YOU = { kind: 'you' } as const;

/** The name the creatures chosen "for each fellowship vote" are remembered under, which "each creature chosen this way" reads. */
const CHOSEN_ID = 'voteChosen';

/** "Each player secretly votes for a player / a creature you don't control / fellowship or aid, then those votes are revealed." (CR 701.38a, 701.38b). */
export const VOTE_SECRET: Lowering<IrClause, Effects> = {
  head: 'voteSecret',
  id: 'lower.vote-secret',
  needs: ['effect:vote', 'effect:voteFor'],
  lower(clause) {
    const options = arg(clause, 'options');
    if (options?.kind === 'choiceKind' && options.what === 'option' && options.options) {
      const effect: Effect = {
        kind: 'vote',
        options: options.options,
        startingWith: 'you',
        secret: true,
      };
      return { ok: true, value: [effect], rule: clause.rule };
    }
    const choice = arg(clause, 'choice');
    if (choice?.kind !== 'name') return failure(clause);
    if (choice.name === 'player') {
      const effect: Effect = {
        kind: 'voteFor',
        choices: { kind: 'players' },
        startingWith: 'you',
        secret: true,
      };
      return { ok: true, value: [effect], rule: clause.rule };
    }
    if (choice.name !== 'creature') return failure(clause);
    // "A creature you don't control": the creatures the controller does not control, read for the controller as they vote.
    const effect: Effect = {
      kind: 'voteFor',
      choices: {
        kind: 'objects',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
      },
      startingWith: 'you',
      secret: true,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Each player draws a card for each vote they received." (CR 701.38a, 121.1, 101.4): each player, as themselves, in turn order. */
export const EACH_PLAYER_DRAWS_PER_VOTE: Lowering<IrClause, Effects> = {
  head: 'eachPlayerDrawsPerVote',
  id: 'lower.each-player-draws-per-vote',
  needs: ['effect:forEachPlayer', 'effect:draw', 'amount:votesReceived'],
  lower(clause) {
    const effect: Effect = {
      kind: 'forEachPlayer',
      players: { kind: 'eachPlayer' },
      runsAs: 'each',
      effect: { kind: 'draw', player: YOU, count: { kind: 'votesReceived' } },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Each player who received no votes may put a permanent card from their hand onto the battlefield." (CR 701.38a, 101.4, 110.2a). */
export const EACH_PLAYER_WITHOUT_VOTES_MAY_PUT: Lowering<IrClause, Effects> = {
  head: 'eachPlayerWithoutVotesMayPut',
  id: 'lower.each-player-without-votes-may-put',
  needs: [
    'effect:forEachPlayer',
    'effect:moveToZone',
    'selector:choose',
    'selector:eachPlayerWithoutVotes',
  ],
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    const effect: Effect = {
      kind: 'forEachPlayer',
      players: { kind: 'eachPlayerWithoutVotes' },
      runsAs: 'each',
      effect: {
        kind: 'moveToZone',
        objects: { kind: 'choose', filter: filter.value, optional: true },
        to: 'battlefield',
      },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "For each creature with one or more votes, put that many stun counters on it, then tap it." (CR 701.38a, 122.1d). */
export const STUN_VOTED_CREATURES: Lowering<IrClause, Effects> = {
  head: 'stunVotedCreatures',
  id: 'lower.stun-voted-creatures',
  needs: [
    'effect:addCounters',
    'effect:tap',
    'selector:votedObjects',
    'selector:eachObject',
    'amount:votesForObject',
  ],
  lower(clause) {
    const effects: Effect[] = [
      {
        kind: 'addCounters',
        objects: { kind: 'votedObjects' },
        counter: 'stun',
        perObject: true,
        count: { kind: 'votesForObject', of: { kind: 'eachObject' } },
      },
      { kind: 'tap', objects: { kind: 'votedObjects' } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** "For each fellowship vote, the voter chooses a creature they control." (CR 701.38a, 608.2d). */
export const VOTER_CHOOSES_PER_VOTE: Lowering<IrClause, Effects> = {
  head: 'voterChoosesPerVote',
  id: 'lower.voter-chooses-per-vote',
  needs: ['effect:chooseObjects'],
  lower(clause) {
    const option = arg(clause, 'option');
    if (option?.kind !== 'name') return failure(clause);
    const effect: Effect = {
      kind: 'chooseObjects',
      id: CHOSEN_ID,
      filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      count: 1,
      exactly: true,
      perVote: option.name,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "You gain control of each creature chosen this way, and they gain "This creature can't attack its owner."" (CR 613.1b, 611.2a, 508.1a). */
export const GAIN_CONTROL_CHOSEN_CANT_ATTACK_OWNER: Lowering<IrClause, Effects> = {
  head: 'gainControlChosenCantAttackOwner',
  id: 'lower.gain-control-chosen-cant-attack-owner',
  needs: ['effect:gainControl', 'effect:grantAbility', 'static:cantAttackItsOwner'],
  lower(clause) {
    const chosen = { kind: 'chosen', id: CHOSEN_ID } as const;
    const effects: Effect[] = [
      { kind: 'gainControl', objects: chosen, duration: 'permanent' },
      {
        kind: 'grantAbility',
        objects: chosen,
        abilities: [{ kind: 'static', static: { kind: 'cantAttackItsOwner' } }],
        duration: 'permanent',
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** "Then for each aid vote, put a +1/+1 counter on each creature you control." (CR 701.38a, 608.2c, 122.6). */
export const COUNTERS_ON_YOUR_CREATURES_PER_VOTE: Lowering<IrClause, Effects> = {
  head: 'countersOnYourCreaturesPerVote',
  id: 'lower.counters-on-your-creatures-per-vote',
  needs: ['effect:repeat', 'effect:addCounters', 'amount:votesFor'],
  lower(clause, ctx) {
    const times = amountArg(clause, 'count', ctx);
    if (!times.ok) return times;
    const counter = arg(clause, 'counter');
    if (counter?.kind !== 'name') return failure(clause);
    const effect: Effect = {
      kind: 'repeat',
      times: times.value,
      effect: {
        kind: 'addCounters',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
        counter: counter.name,
        count: 1,
      },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Each opponent who voted for a choice you voted for creates a Treasure token." (CR 701.38a, 111.2, 101.4). */
export const VOTERS_CREATE_TREASURE: Lowering<IrClause, Effects> = {
  head: 'votersCreateTreasure',
  id: 'lower.voters-create-treasure',
  needs: ['effect:forEachPlayer', 'effect:createToken', 'selector:eachOpponentWhoVoted'],
  lower(clause) {
    const effect: Effect = {
      kind: 'forEachPlayer',
      players: { kind: 'eachOpponentWhoVoted', choice: 'same' },
      runsAs: 'each',
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "You scry X, where X is the number of opponents who voted for a choice you didn't vote for." (CR 701.22, 701.38a). */
export const SCRY_OPPONENTS_WHO_VOTED_DIFFERENTLY: Lowering<IrClause, Effects> = {
  head: 'scryOpponentsWhoVotedDifferently',
  id: 'lower.scry-opponents-who-voted-differently',
  needs: ['effect:scry', 'amount:playerCount', 'selector:eachOpponentWhoVoted'],
  lower(clause) {
    const effect: Effect = {
      kind: 'scry',
      count: {
        kind: 'playerCount',
        of: { kind: 'eachOpponentWhoVoted', choice: 'different' },
      },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "You and each opponent who voted for a choice you voted for may scry 2." (CR 701.22, 701.38a, 101.4, 608.2d). */
export const YOU_AND_VOTERS_MAY_SCRY: Lowering<IrClause, Effects> = {
  head: 'youAndVotersMayScry',
  id: 'lower.you-and-voters-may-scry',
  needs: ['effect:playersMay', 'effect:scry', 'selector:eachOpponentWhoVoted'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const effect: Effect = {
      kind: 'playersMay',
      players: {
        kind: 'all',
        of: [YOU, { kind: 'eachOpponentWhoVoted', choice: 'same' }],
      },
      runsAs: 'chooser',
      effect: { kind: 'scry', player: YOU, count: count.value },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** Features the lowerings of this file can name, for the dimension test. */
export const SECRET_VOTES_NEEDS: readonly FeatureRef[] = [
  'effect:vote',
  'effect:voteFor',
  'effect:forEachPlayer',
  'effect:draw',
  'effect:moveToZone',
  'effect:addCounters',
  'effect:tap',
  'effect:chooseObjects',
  'effect:gainControl',
  'effect:grantAbility',
  'effect:repeat',
  'effect:createToken',
  'effect:scry',
  'effect:playersMay',
  'amount:votesReceived',
  'amount:votesForObject',
  'amount:votesFor',
  'amount:playerCount',
  'selector:choose',
  'selector:votedObjects',
  'selector:eachObject',
  'selector:eachPlayerWithoutVotes',
  'selector:eachOpponentWhoVoted',
  'static:cantAttackItsOwner',
  'trigger:votingFinished',
];

export const SECRET_VOTES_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  VOTE_SECRET,
  EACH_PLAYER_DRAWS_PER_VOTE,
  EACH_PLAYER_WITHOUT_VOTES_MAY_PUT,
  STUN_VOTED_CREATURES,
  VOTER_CHOOSES_PER_VOTE,
  GAIN_CONTROL_CHOSEN_CANT_ATTACK_OWNER,
  COUNTERS_ON_YOUR_CREATURES_PER_VOTE,
  VOTERS_CREATE_TREASURE,
  SCRY_OPPONENTS_WHO_VOTED_DIFFERENTLY,
  YOU_AND_VOTERS_MAY_SCRY,
];
