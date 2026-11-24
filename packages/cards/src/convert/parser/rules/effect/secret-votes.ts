/**
 * Effect rules of the secret council cards (Círdan the Shipwright, Elrond of the White Council, Trap the Trespassers, Erestor of the Council, Model of Unity; CR 701.38): a secret vote
 * for a player, a creature or a word, and the sentences that read what was voted ("each player draws a card for each vote they received", "for each creature with one or more votes",
 * "for each fellowship vote, the voter chooses ...", "each opponent who voted for a choice you voted for ..."). Each phrase is one template of those cards, written whole: the engine's
 * `voteFor`, `vote` with `secret`, and the readers of the vote record (`lower/secret-votes.ts`). The votes of a card that says "starting with you" are `effect.vote`.
 */
import { choice, fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAmount, IrChoiceArg, IrNameArg, IrNoun, IrZoneSpec, Span } from '../../ir/types';
import { PERMANENT_CARD_TYPES } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { VOTE_OPTION } from '../vote-words';
import { type Clauses, single } from './operands';

const RULE_VOTE = 'effect.secret-vote';
const WORD_END = '(?![\\p{L}\\p{N}-])';

/** "fellowship or aid", "gold, iron or ash": two or more options (the list ends with " or <option>"). */
const OPTION_LIST = new RegExp(
  `(${VOTE_OPTION}(?:, ${VOTE_OPTION})*),? or (${VOTE_OPTION})${WORD_END}`,
  'u',
);

function nameArg(name: string, span: Span, rule: string): IrNameArg {
  return { kind: 'name', name, span, rule };
}

/**
 * `effect.secret-vote`: "each player secretly votes for a player / a creature you don't control / fellowship or aid, then those votes are revealed" (CR 701.38a: each player, in turn
 * order from the controller, chooses; "secretly": nobody sees a vote before all are cast, and then they are revealed together; CR 701.38b: the choices may be objects, here players or
 * creatures, or words with no rules meaning). The engine's `voteFor` or `vote` with `secret`. Not read: a vote that is not secret (`effect.vote`), another starting player, another kind of
 * object, one option, "an additional time", words after "revealed".
 */
export const EFFECT_SECRET_VOTE = defineRule<Clauses>({
  id: RULE_VOTE,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.38a (Vote)',
    'CR 701.38b (Vote)',
    'CR 701.38c (Vote)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'each player secretly votes for a player, then those votes are revealed',
    "each player secretly votes for a creature you don't control, then those votes are revealed",
    'each player secretly votes for fellowship or aid, then those votes are revealed',
    'Each player secretly votes for gold, iron or ash, then those votes are revealed',
  ],
  rejects: [
    'each player votes for a player, then those votes are revealed',
    'each player secretly votes for a player',
    'each player secretly votes for a player, then those votes are revealed and',
    'each player secretly votes for a planeswalker, then those votes are revealed',
    'each player secretly votes for fellowship, then those votes are revealed',
    'each opponent secretly votes for a player, then those votes are revealed',
    'each player secretly votes for a creature, then those votes are revealed',
    'each player may secretly vote for a player, then those votes are revealed',
    'each player secretly votes for a player an additional time, then those votes are revealed',
  ],
  parse: single(
    RULE_VOTE,
    sequence(
      literal('each player secretly votes for '),
      spanned(
        choice(
          pattern(/a player(?= ?,)/u),
          pattern(/a creature you don['’]t control(?= ?,)/u),
          pattern(OPTION_LIST),
        ),
      ),
      pattern(new RegExp(`, then those votes are revealed${WORD_END}`, 'u')),
    ),
    ([, listed]) => {
      const text = listed.value[0];
      if (text === 'a player' || text.startsWith('a creature')) {
        return {
          verb: 'voteSecret',
          args: {
            choice: nameArg(text === 'a player' ? 'player' : 'creature', listed.span, RULE_VOTE),
          },
        };
      }
      const options = text.split(/,? or |, /u);
      const choiceArg: IrChoiceArg = {
        kind: 'choiceKind',
        what: 'option',
        options,
        span: listed.span,
        rule: RULE_VOTE,
      };
      return { verb: 'voteSecret', args: { options: choiceArg } };
    },
  ),
});

/**
 * `effect.each-player-draws-per-vote`: "each player draws a card for each vote they received" (CR 701.38a, 121.1, 101.4: each player in turn order draws as many cards as there were votes
 * for them). The engine's `forEachPlayer` that runs as each player, of a `draw` of `votesReceived`. Not read: "you draw", a number of cards other than one, another count.
 */
export const EFFECT_EACH_PLAYER_DRAWS_PER_VOTE = defineRule<Clauses>({
  id: 'effect.each-player-draws-per-vote',
  family: 'effect',
  leading: ['each'],
  cites: ['CR 701.38a (Vote)', 'CR 121.1 (Draw)', 'CR 101.4 (Handling Simultaneous Decisions)'],
  examples: ['each player draws a card for each vote they received'],
  rejects: [
    'each player draws a card for each vote',
    'each player draws two cards for each vote they received',
    'each opponent draws a card for each vote they received',
    'you draw a card for each vote you received',
    'each player draws a card for each vote they received and',
    'each player draws a card for each vote they received this turn',
  ],
  parse: single(
    'effect.each-player-draws-per-vote',
    pattern(new RegExp(`each player draws a card for each vote they received${WORD_END}`, 'iu')),
    () => ({ verb: 'eachPlayerDrawsPerVote', args: {} }),
  ),
});

/**
 * `effect.each-player-without-votes-may-put`: "each player who received no votes may put a permanent card from their hand onto the battlefield" (CR 701.38a, 101.4, 110.2a, 608.2d: each
 * such player in turn order may choose a permanent card from their own hand and puts it onto the battlefield under their control). The engine's `forEachPlayer` over
 * `eachPlayerWithoutVotes`, running as each, of a `moveToZone` of a chosen card. Not read: another kind of card or zone, "you may", "each player who received votes".
 */
export const EFFECT_EACH_PLAYER_WITHOUT_VOTES_MAY_PUT = defineRule<Clauses>({
  id: 'effect.each-player-without-votes-may-put',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.38a (Vote)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 110.2a (Permanents)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'each player who received no votes may put a permanent card from their hand onto the battlefield',
  ],
  rejects: [
    'each player who received no votes may put a creature card from their hand onto the battlefield',
    'each player who received no votes puts a permanent card from their hand onto the battlefield',
    'each player who received votes may put a permanent card from their hand onto the battlefield',
    'each player who received no votes may put a permanent card from their graveyard onto the battlefield',
    'each player who received no votes may put a permanent card from their hand onto the battlefield tapped',
    'each opponent who received no votes may put a permanent card from their hand onto the battlefield',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `each player who received no votes may put a permanent card from their hand onto the battlefield${WORD_END}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (/^ tapped/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const rule = 'effect.each-player-without-votes-may-put';
    const span = r.value.span;
    const objects: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: {
        zone: 'hand',
        anyOf: PERMANENT_CARD_TYPES.map((t) => ({ types: [t], raw: t })),
        controller: 'you',
        card: true,
        raw: 'permanent card',
      },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule,
    };
    const to: IrZoneSpec = { kind: 'zoneSpec', zone: 'battlefield', span, rule };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'eachPlayerWithoutVotesMayPut',
          args: { objects, to },
          optional: false,
          span,
          rule,
        },
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.stun-voted-creatures`: "for each creature with one or more votes, put that many stun counters on it, then tap it" (CR 701.38a, 122.1d, 701.26: each creature voted for gets
 * as many stun counters as it got votes, and is tapped). The engine's `addCounters` of `stun` on the `votedObjects`, one count for each, and a `tap` of them. Not read: another
 * counter, another action after "then", a creature chosen otherwise.
 */
export const EFFECT_STUN_VOTED_CREATURES = defineRule<Clauses>({
  id: 'effect.stun-voted-creatures',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 701.38a (Vote)',
    'CR 122.1d (Counters)',
    'CR 701.26 (Tap and Untap)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each creature with one or more votes, put that many stun counters on it, then tap it',
  ],
  rejects: [
    'for each creature with one or more votes, put that many +1/+1 counters on it, then tap it',
    'for each creature with one or more votes, put that many stun counters on it',
    'for each creature with one or more votes, put that many stun counters on it, then untap it',
    'for each creature with votes, put that many stun counters on it, then tap it',
    'for each creature with one or more votes, put a stun counter on it, then tap it',
    'for each creature with one or more votes, put that many stun counters on it, then tap it and',
  ],
  parse: single(
    'effect.stun-voted-creatures',
    pattern(
      new RegExp(
        `for each creature with one or more votes, put that many stun counters on it, then tap it${WORD_END}`,
        'iu',
      ),
    ),
    () => ({ verb: 'stunVotedCreatures', args: {} }),
  ),
});

/**
 * `effect.voter-chooses-per-vote`: "for each fellowship vote, the voter chooses a creature they control" (CR 701.38a, 608.2d: one choice for each vote for the option, made by the player who
 * cast it, among the creatures they control). The engine's `chooseObjects` with `perVote`; what is chosen is "chosen this way" for the instructions after it. Not read: another kind of
 * permanent, "you choose", "each voter", a choice of an object the voter does not control.
 */
export const EFFECT_VOTER_CHOOSES_PER_VOTE = defineRule<Clauses>({
  id: 'effect.voter-chooses-per-vote',
  family: 'effect',
  leading: ['for'],
  cites: ['CR 701.38a (Vote)', 'CR 701.38b (Vote)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'for each fellowship vote, the voter chooses a creature they control',
    'For each Redhorn Pass vote, the voter chooses a creature they control',
  ],
  rejects: [
    'for each vote, the voter chooses a creature they control',
    'for each fellowship vote, the voter chooses a permanent they control',
    'for each fellowship vote, you choose a creature you control',
    'for each fellowship vote, the voter chooses a creature',
    'for each fellowship vote, each voter chooses a creature they control',
    'for each fellowship vote, the voter chooses a creature they control and',
    'for each extra vote, the voter chooses a creature they control',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `[Ff]or each (${VOTE_OPTION}) vote, the voter chooses a creature they control${WORD_END}`,
        'u',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const option = r.value[1] ?? '';
    if (NOT_AN_OPTION.has(option.toLowerCase())) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'voterChoosesPerVote',
          args: { option: nameArg(option, span, 'effect.voter-chooses-per-vote') },
          optional: false,
          span,
          rule: 'effect.voter-chooses-per-vote',
        },
      ],
      pos: r.pos,
    };
  },
});

const NOT_AN_OPTION = new Set(['an', 'each', 'extra', 'additional', 'the', 'a', 'no', 'all']);

/**
 * `effect.gain-control-chosen-cant-attack-owner`: "you gain control of each creature chosen this way, and they gain "This creature can't attack its owner."" (CR 613.1b, 611.2a, 113.1:
 * a layer 2 effect with no duration, and the creatures gain an ability for good). The engine's `gainControl` of the creatures chosen earlier and a `grantAbility` of the static
 * `cantAttackItsOwner`. Not read: a duration, another gained ability, "target creature".
 */
export const EFFECT_GAIN_CONTROL_CHOSEN_CANT_ATTACK_OWNER = defineRule<Clauses>({
  id: 'effect.gain-control-chosen-cant-attack-owner',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 508.1a (Declare Attackers Step)',
  ],
  examples: [
    'you gain control of each creature chosen this way, and they gain "~ can\'t attack its owner."',
    'you gain control of each creature chosen this way, and they gain "This creature can\'t attack its owner."',
  ],
  rejects: [
    'you gain control of each creature chosen this way',
    'you gain control of each creature chosen this way until end of turn, and they gain "This creature can\'t attack its owner."',
    'you gain control of each creature chosen this way, and they gain "This creature can\'t block."',
    'you gain control of target creature, and it gains "This creature can\'t attack its owner."',
    'you gain control of each creature chosen this way, and they gain "This creature can\'t attack its owner." and',
    'you gain control of each creature chosen this way, and they gain flying',
  ],
  parse: single(
    'effect.gain-control-chosen-cant-attack-owner',
    pattern(
      /you gain control of each creature chosen this way, and they gain ["“](?:This creature|~) can['’]t attack its owner\.["”]/iu,
    ),
    () => ({ verb: 'gainControlChosenCantAttackOwner', args: {} }),
  ),
});

/**
 * `effect.then-for-each-vote-counters`: "then for each aid vote, put a +1/+1 counter on each creature you control" (CR 701.38a, 608.2c, 122.6: the counters are put as many times as there
 * were votes for the option, each time on every creature the controller has then, which includes what an earlier instruction gave them). The engine's `repeat` of `votesFor`, of an
 * `addCounters` on each creature you control. Not read: another number of counters, another recipient, a "may", the option "vote" with no word.
 */
export const EFFECT_THEN_FOR_EACH_VOTE_COUNTERS = defineRule<Clauses>({
  id: 'effect.then-for-each-vote-counters',
  family: 'effect',
  leading: ['then', 'for'],
  cites: ['CR 701.38a (Vote)', 'CR 608.2c (Resolving Spells and Abilities)', 'CR 122.6 (Counters)'],
  examples: [
    'then for each aid vote, put a +1/+1 counter on each creature you control',
    'for each aid vote, put a +1/+1 counter on each creature you control',
  ],
  rejects: [
    'then for each vote, put a +1/+1 counter on each creature you control',
    'then for each aid vote, put two +1/+1 counters on each creature you control',
    'then for each aid vote, put a +1/+1 counter on target creature',
    'then for each aid vote, you may put a +1/+1 counter on each creature you control',
    'then for each aid vote, put a +1/+1 counter on each creature you control and',
    'then for each extra vote, put a +1/+1 counter on each creature you control',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      optional(literal('then '), null),
      pattern(
        new RegExp(
          `[Ff]or each (${VOTE_OPTION}) vote, put a (\\+1/\\+1) counter on each creature you control${WORD_END}`,
          'u',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const option = r.value[1][1] ?? '';
    if (NOT_AN_OPTION.has(option.toLowerCase())) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const rule = 'effect.then-for-each-vote-counters';
    const count: IrAmount = { kind: 'votesFor', option, span };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'countersOnYourCreaturesPerVote',
          args: { count, counter: nameArg(r.value[1][2] ?? '+1/+1', span, rule) },
          optional: false,
          span,
          rule,
        },
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.voters-create-treasure`: "each opponent who voted for a choice you voted for creates a Treasure token" (CR 701.38a, 701.38d, 111.2: the opponents whose vote shares a choice with
 * the controller's each create a token, under their control). The engine's `forEachPlayer` over `eachOpponentWhoVoted` that runs as each, of a Treasure `createToken`. Not read: another token,
 * "a choice you didn't vote for", a count.
 */
export const EFFECT_VOTERS_CREATE_TREASURE = defineRule<Clauses>({
  id: 'effect.voters-create-treasure',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.38a (Vote)',
    'CR 701.38d (Vote)',
    'CR 111.2 (Tokens)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: ['each opponent who voted for a choice you voted for creates a Treasure token'],
  rejects: [
    "each opponent who voted for a choice you didn't vote for creates a Treasure token",
    'each opponent who voted for a choice you voted for creates a Food token',
    'each opponent who voted for a choice you voted for creates two Treasure tokens',
    'each player who voted for a choice you voted for creates a Treasure token',
    'each opponent who voted for a choice you voted for creates a Treasure token and',
    'each opponent who voted creates a Treasure token',
  ],
  parse: single(
    'effect.voters-create-treasure',
    pattern(
      new RegExp(
        `each opponent who voted for a choice you voted for creates a Treasure token${WORD_END}`,
        'iu',
      ),
    ),
    () => ({ verb: 'votersCreateTreasure', args: {} }),
  ),
});

/**
 * `effect.scry-opponents-who-voted-differently`: "you scry X, where X is the number of opponents who voted for a choice you didn't vote for" (CR 701.22, 701.38a, 107.3: X is read as the
 * instruction is followed, from the record of the vote). The engine's `scry` of a `playerCount` of `eachOpponentWhoVoted` (`different`). Not read: a count of players who voted alike, a
 * fixed number, "each opponent".
 */
export const EFFECT_SCRY_OPPONENTS_WHO_VOTED_DIFFERENTLY = defineRule<Clauses>({
  id: 'effect.scry-opponents-who-voted-differently',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 701.22 (Scry)', 'CR 701.38a (Vote)', 'CR 107.3 (Variables)'],
  examples: [
    "you scry X, where X is the number of opponents who voted for a choice you didn't vote for",
  ],
  rejects: [
    'you scry X, where X is the number of opponents who voted for a choice you voted for',
    "you scry 2, where X is the number of opponents who voted for a choice you didn't vote for",
    "you scry X, where X is the number of players who voted for a choice you didn't vote for",
    "you scry X, where X is the number of opponents who voted for a choice you didn't vote for and",
    "scry X, where X is the number of opponents who voted for a choice you didn't vote for",
  ],
  parse: single(
    'effect.scry-opponents-who-voted-differently',
    pattern(
      new RegExp(
        `you scry X, where X is the number of opponents who voted for a choice you didn['’]t vote for${WORD_END}`,
        'iu',
      ),
    ),
    () => ({ verb: 'scryOpponentsWhoVotedDifferently', args: {} }),
  ),
});

/**
 * `effect.you-and-voters-may-scry`: "you and each opponent who voted for a choice you voted for may scry 2" (CR 701.22, 701.38a, 101.4, 608.2d: you and those opponents, in turn order, may each
 * scry, each choosing for themselves). The engine's `playersMay` of `all` of `you` and `eachOpponentWhoVoted` (`same`), run as each chooser, of a `scry`. Not read: another number, "each
 * player", "you may scry 2".
 */
export const EFFECT_YOU_AND_VOTERS_MAY_SCRY = defineRule<Clauses>({
  id: 'effect.you-and-voters-may-scry',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 701.22 (Scry)',
    'CR 701.38a (Vote)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['you and each opponent who voted for a choice you voted for may scry 2'],
  rejects: [
    "you and each opponent who voted for a choice you didn't vote for may scry 2",
    'you and each opponent who voted for a choice you voted for scry 2',
    'you and each opponent who voted for a choice you voted for may scry',
    'you and each player who voted for a choice you voted for may scry 2',
    'you and each opponent who voted for a choice you voted for may scry 2 and',
    'you may scry 2',
  ],
  parse: (ctx, pos) => {
    const r = map(
      spanned(
        sequence(
          literal('you and each opponent who voted for a choice you voted for may scry '),
          family<IrAmount>('amount', { only: ['amount.number'] }),
        ),
      ),
      ({ value, span }) => ({ amount: value[1], span }),
    )(ctx, pos);
    if (!r.ok) return r;
    const rule = 'effect.you-and-voters-may-scry';
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'youAndVotersMayScry',
          args: { count: r.value.amount },
          optional: false,
          span: r.value.span,
          rule,
        },
      ],
      pos: r.pos,
    };
  },
});

export const SECRET_VOTES_EFFECT_RULES = [
  EFFECT_SECRET_VOTE,
  EFFECT_EACH_PLAYER_DRAWS_PER_VOTE,
  EFFECT_EACH_PLAYER_WITHOUT_VOTES_MAY_PUT,
  EFFECT_STUN_VOTED_CREATURES,
  EFFECT_VOTER_CHOOSES_PER_VOTE,
  EFFECT_GAIN_CONTROL_CHOSEN_CANT_ATTACK_OWNER,
  EFFECT_THEN_FOR_EACH_VOTE_COUNTERS,
  EFFECT_VOTERS_CREATE_TREASURE,
  EFFECT_SCRY_OPPONENTS_WHO_VOTED_DIFFERENTLY,
  EFFECT_YOU_AND_VOTERS_MAY_SCRY,
];
