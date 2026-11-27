// What `validateCard` accepts of the votes for players and permanents, the secret vote and the vote record (CR 701.38a, 701.38b): every reader of a vote needs the vote it reads.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Effect } from '../src/index';
import { validateCard } from '../src/index';

const YOU = { kind: 'you' } as const;

const spell = (effect: Effect) =>
  singleFace({
    name: 'SYNTHETIC Vote Probe',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'SYNTHETIC: describes what the AST does.',
    spell: { effect },
  });

const playersVote: Effect = { kind: 'voteFor', choices: { kind: 'players' }, startingWith: 'you' };
const objectsVote: Effect = {
  kind: 'voteFor',
  choices: { kind: 'objects', filter: { types: ['creature'], controller: 'opponent' } },
  startingWith: 'you',
  secret: true,
};
const after = (vote: Effect, next: Effect): Effect => ({
  kind: 'sequence',
  effects: [vote, next],
});
const draw: Effect = { kind: 'draw', player: YOU, count: { kind: 'votesReceived' } };

describe('votes of players and permanents', () => {
  test('a vote for players and the amount that reads it', () => {
    expect(validateCard(spell(after(playersVote, draw)))).toEqual([]);
  });
  test('votesReceived needs a vote for players before it', () => {
    expect(validateCard(spell(draw)).length).toBeGreaterThan(0);
    expect(validateCard(spell(after(objectsVote, draw))).length).toBeGreaterThan(0);
  });
  test('votedObjects needs a vote for permanents before it', () => {
    const tap: Effect = { kind: 'tap', objects: { kind: 'votedObjects' } };
    expect(validateCard(spell(after(objectsVote, tap)))).toEqual([]);
    expect(validateCard(spell(after(playersVote, tap))).length).toBeGreaterThan(0);
    expect(validateCard(spell(tap)).length).toBeGreaterThan(0);
  });
  test('a vote is for players or for permanents', () => {
    const bad = { kind: 'voteFor', choices: { kind: 'words' }, startingWith: 'you' } as unknown;
    expect(validateCard(spell(bad as Effect)).length).toBeGreaterThan(0);
  });
  test('the voters of one option choose: needs a vote that offers the option', () => {
    const choose = (perVote: string): Effect => ({
      kind: 'chooseObjects',
      id: 'x',
      filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      count: 1,
      perVote,
    });
    const words: Effect = { kind: 'vote', options: ['a', 'b'], startingWith: 'you', secret: true };
    expect(validateCard(spell(after(words, choose('a'))))).toEqual([]);
    expect(validateCard(spell(after(words, choose('c')))).length).toBeGreaterThan(0);
    expect(validateCard(spell(choose('a'))).length).toBeGreaterThan(0);
  });
  test('the opponents who voted alike need a vote or a votingFinished ability', () => {
    const scry: Effect = {
      kind: 'scry',
      count: { kind: 'playerCount', of: { kind: 'eachOpponentWhoVoted', choice: 'same' } },
    };
    expect(validateCard(spell(scry)).length).toBeGreaterThan(0);
    expect(validateCard(spell(after(playersVote, scry)))).toEqual([]);
    const watcher = singleFace({
      name: 'SYNTHETIC Vote Watcher',
      manaCost: ['2'],
      types: ['artifact'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC: describes what the AST does.',
      abilities: [{ kind: 'triggered', trigger: { kind: 'votingFinished' }, effect: scry }],
    });
    expect(validateCard(watcher)).toEqual([]);
  });
});
