// The secret council cards (Círdan the Shipwright, Elrond of the White Council, Trap the Trespassers, Erestor of the Council, Model of Unity; CR 701.38): the lines read through the whole
// pipeline, the engine nodes they lower to, and the near misses the grammar must not read. The real cards are played in convert-grammar-engine-secret-votes.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { readAll as readAllFace, read as readFace } from './parser-p5-helpers';

type Type = Parameters<typeof readFace>[1];

const read = (text: string, type: Type = 'instant') => readFace(text, type);
const readAll = (text: string, type: Type = 'instant') => readAllFace(text, type);

const NOT_READ = (text: string, type: Type = 'instant') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell, text).toBeFalsy();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const YOU = { kind: 'you' } as const;
const CHOSEN = { kind: 'chosen', id: 'voteChosen' } as const;

describe('"each player secretly votes for ..., then those votes are revealed" (CR 701.38a, 701.38b)', () => {
  test('for a player', () => {
    expect(
      readAll('Each player secretly votes for a player, then those votes are revealed.').spell,
    ).toEqual({
      effect: { kind: 'voteFor', choices: { kind: 'players' }, startingWith: 'you', secret: true },
    });
  });
  test("for a creature you don't control", () => {
    expect(
      readAll(
        "Each player secretly votes for a creature you don't control, then those votes are revealed.",
      ).spell,
    ).toEqual({
      effect: {
        kind: 'voteFor',
        choices: {
          kind: 'objects',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
        },
        startingWith: 'you',
        secret: true,
      },
    });
  });
  test('for words', () => {
    expect(
      readAll('Each player secretly votes for fellowship or aid, then those votes are revealed.')
        .spell,
    ).toEqual({
      effect: { kind: 'vote', options: ['fellowship', 'aid'], startingWith: 'you', secret: true },
    });
  });
  test('near misses are not read', () => {
    NOT_READ('Each player secretly votes for a player.');
    NOT_READ('Each player secretly votes for a planeswalker, then those votes are revealed.');
    NOT_READ('Each opponent secretly votes for a player, then those votes are revealed.');
  });
});

describe('what the votes came to (Círdan the Shipwright, Trap the Trespassers)', () => {
  test('each player draws for each vote they received; players with no votes may put a permanent card', () => {
    const spell = readAll(
      'Each player secretly votes for a player, then those votes are revealed. Each player draws a card for each vote they received. Each player who received no votes may put a permanent card from their hand onto the battlefield.',
    ).spell;
    const effects = spell?.effect?.kind === 'sequence' ? spell.effect.effects : [];
    expect(effects).toHaveLength(3);
    expect(effects[1]).toEqual({
      kind: 'forEachPlayer',
      players: { kind: 'eachPlayer' },
      runsAs: 'each',
      effect: { kind: 'draw', player: YOU, count: { kind: 'votesReceived' } },
    });
    expect(effects[2]).toMatchObject({
      kind: 'forEachPlayer',
      players: { kind: 'eachPlayerWithoutVotes' },
      runsAs: 'each',
      effect: { kind: 'moveToZone', to: 'battlefield' },
    });
  });
  test('stun counters for each creature with votes, then tap', () => {
    const spell = readAll(
      "Each player secretly votes for a creature you don't control, then those votes are revealed. For each creature with one or more votes, put that many stun counters on it, then tap it.",
    ).spell;
    const effects = spell?.effect?.kind === 'sequence' ? spell.effect.effects : [];
    expect(effects.slice(1)).toEqual([
      {
        kind: 'addCounters',
        objects: { kind: 'votedObjects' },
        counter: 'stun',
        perObject: true,
        count: { kind: 'votesForObject', of: { kind: 'eachObject' } },
      },
      { kind: 'tap', objects: { kind: 'votedObjects' } },
    ]);
  });
  test('near misses are not read', () => {
    NOT_READ('Each player draws two cards for each vote they received.');
    NOT_READ(
      'Each player who received no votes may put a creature card from their hand onto the battlefield.',
    );
    NOT_READ(
      'For each creature with one or more votes, put that many +1/+1 counters on it, then tap it.',
    );
  });
});

describe('Elrond of the White Council: the voters choose, the creatures change hands, the aid votes count', () => {
  const text =
    'Each player secretly votes for fellowship or aid, then those votes are revealed. For each fellowship vote, the voter chooses a creature they control. You gain control of each creature chosen this way, and they gain "~ can\'t attack its owner." Then for each aid vote, put a +1/+1 counter on each creature you control.';
  test('the nodes', () => {
    const spell = readAll(text).spell;
    const effects = spell?.effect?.kind === 'sequence' ? spell.effect.effects : [];
    expect(effects).toEqual([
      { kind: 'vote', options: ['fellowship', 'aid'], startingWith: 'you', secret: true },
      {
        kind: 'chooseObjects',
        id: 'voteChosen',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        count: 1,
        exactly: true,
        perVote: 'fellowship',
      },
      { kind: 'gainControl', objects: CHOSEN, duration: 'permanent' },
      {
        kind: 'grantAbility',
        objects: CHOSEN,
        abilities: [{ kind: 'static', static: { kind: 'cantAttackItsOwner' } }],
        duration: 'permanent',
      },
      {
        kind: 'repeat',
        times: { kind: 'votesFor', option: 'aid' },
        effect: {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
          counter: '+1/+1',
          count: 1,
        },
      },
    ]);
  });
  test('near misses are not read', () => {
    NOT_READ(
      'Each player secretly votes for fellowship or aid, then those votes are revealed. For each fellowship vote, you choose a creature you control.',
    );
    NOT_READ('You gain control of each creature chosen this way, and they gain "~ can\'t block."');
  });
});

describe('"Whenever players finish voting" (Erestor of the Council, Model of Unity; CR 701.38a)', () => {
  test('the trigger and the reads of the record', () => {
    const [ability] = readAll(
      "Whenever players finish voting, each opponent who voted for a choice you voted for creates a Treasure token. You scry X, where X is the number of opponents who voted for a choice you didn't vote for. Draw a card.",
      'creature',
    ).abilities;
    expect(ability).toMatchObject({ kind: 'triggered', trigger: { kind: 'votingFinished' } });
    const effects =
      ability?.kind === 'triggered' && ability.effect.kind === 'sequence'
        ? ability.effect.effects
        : [];
    expect(effects).toEqual([
      {
        kind: 'forEachPlayer',
        players: { kind: 'eachOpponentWhoVoted', choice: 'same' },
        runsAs: 'each',
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      },
      {
        kind: 'scry',
        count: { kind: 'playerCount', of: { kind: 'eachOpponentWhoVoted', choice: 'different' } },
      },
      { kind: 'draw', player: YOU, count: 1 },
    ]);
  });
  test('the players who voted alike may scry', () => {
    const [ability] = readAll(
      'Whenever players finish voting, you and each opponent who voted for a choice you voted for may scry 2.',
      'artifact',
    ).abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'votingFinished' },
      effect: {
        kind: 'playersMay',
        players: { kind: 'all', of: [YOU, { kind: 'eachOpponentWhoVoted', choice: 'same' }] },
        runsAs: 'chooser',
        effect: { kind: 'scry', player: YOU, count: 2 },
      },
    });
  });
  test('near misses are not read', () => {
    NOT_READ('Whenever you finish voting, draw a card.', 'creature');
    NOT_READ(
      'Whenever players finish voting, each opponent who voted for a choice you voted for creates a Food token.',
      'creature',
    );
  });
});
