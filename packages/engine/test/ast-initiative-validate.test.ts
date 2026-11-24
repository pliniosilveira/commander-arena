// What `validateCard` allows of the initiative and of dungeons (CR 726, 701.49): "take the initiative" names one player (CR 726.3), "venture into Undercity" is the only
// venture built, and a card taken with `lookAtTop` can enter with counters only when it goes onto the battlefield (CR 122.6).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Effect, validateCard } from '../src/index';

const spell = (effect: Effect) =>
  singleFace({
    name: 'SYNTHETIC Test Spell',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Test.',
    spell: { effect },
  });

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card).map((i) => i.message);

describe('take the initiative (CR 726.3)', () => {
  test('"you take the initiative"', () => {
    expect(messages(spell({ kind: 'takeInitiative', player: { kind: 'you' } }))).toEqual([]);
  });

  test('only one player can have it: "each player takes the initiative" is refused', () => {
    expect(
      messages(spell({ kind: 'takeInitiative', player: { kind: 'eachPlayer' } })).join(' '),
    ).toContain('only one player can have the initiative');
    expect(
      messages(spell({ kind: 'takeInitiative', player: { kind: 'eachOpponent' } })),
    ).not.toEqual([]);
  });
});

describe('venture into the dungeon (CR 701.49)', () => {
  test('Undercity', () => {
    expect(
      messages(spell({ kind: 'venture', player: { kind: 'you' }, dungeon: 'undercity' })),
    ).toEqual([]);
  });

  test('a dungeon that is not built is refused', () => {
    expect(
      messages(spell({ kind: 'venture', player: { kind: 'you' }, dungeon: 'tomb' as never })).join(
        ' ',
      ),
    ).toContain('undercity');
  });
});

describe('a card taken from the top enters with counters (CR 122.6, 701.20)', () => {
  const take = (to: 'hand' | 'battlefield', count = 3): Effect => ({
    kind: 'lookAtTop',
    count: 10,
    revealAll: true,
    take: {
      filter: { types: ['creature'] },
      max: 1,
      to,
      withCounters: { counter: '+1/+1', count },
    },
    rest: 'top',
  });

  test('onto the battlefield', () => {
    expect(messages(spell(take('battlefield')))).toEqual([]);
  });

  test('into the hand: refused', () => {
    expect(messages(spell(take('hand'))).join(' ')).toContain('only for the battlefield');
  });

  test('a count of 0: refused', () => {
    expect(messages(spell(take('battlefield', 0))).join(' ')).toContain('positive integer');
  });
});
