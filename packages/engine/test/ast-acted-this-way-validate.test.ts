// Peace Offering deck (issue 112), group C: what `validateCard` allows of "each player who drew a card this way" and "each player who searched a library this way" (the `PlayerSelector`
// `actedThisWay`, CR 121.1, 701.23) and of "for each opponent who does" (the `thisWay` count `playersAccepted` of a `playersMay`, CR 101.4, 608.2d). SYNTHETIC cards only.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Effect, type PlayerSelector, validateCard } from '../src/index';

const base = {
  manaCost: ['1'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Test.',
} as const;

const messages = (effect: Effect) =>
  validateCard(
    singleFace({
      ...base,
      name: 'SYNTHETIC Test Sorcery',
      types: ['sorcery'],
      spell: { effect },
    }),
  ).map((i) => i.message);

const DRAW: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
const SEARCH: Effect = {
  kind: 'search',
  player: { kind: 'eachOpponent' },
  optional: true,
  filter: { types: ['land'] },
  max: 1,
  destinations: [{ zone: 'battlefield', count: 1 }],
  reveal: false,
  shuffle: false,
};
const OFFER: Effect = {
  kind: 'playersMay',
  players: { kind: 'eachPlayer' },
  runsAs: 'chooser',
  effect: DRAW,
};
const gain = (player: PlayerSelector): Effect => ({ kind: 'gainLife', player, amount: 1 });

describe('actedThisWay', () => {
  test('the players who drew, after a draw (or an offer of one) in the same sequence', () => {
    expect(
      messages({
        kind: 'sequence',
        effects: [OFFER, gain({ kind: 'actedThisWay', act: 'drew' })],
      }),
    ).toEqual([]);
  });

  test('the opponents who searched, after a search', () => {
    expect(
      messages({
        kind: 'sequence',
        effects: [
          SEARCH,
          { kind: 'shuffle', player: { kind: 'actedThisWay', act: 'searched' } },
          gain({ kind: 'actedThisWay', act: 'searched', of: { kind: 'eachOpponent' } }),
        ],
      }),
    ).toEqual([]);
  });

  test('with nothing done before it, it names nobody and is refused', () => {
    expect(messages(gain({ kind: 'actedThisWay', act: 'drew' })).join()).toContain(
      'needs a draw effect before it',
    );
    expect(
      messages({
        kind: 'sequence',
        effects: [DRAW, gain({ kind: 'actedThisWay', act: 'searched' })],
      }).join(),
    ).toContain('needs a search effect before it');
  });

  test('another act, or a group that is not every player or every opponent, is refused', () => {
    expect(
      messages({
        kind: 'sequence',
        effects: [DRAW, gain({ kind: 'actedThisWay', act: 'cast' } as unknown as PlayerSelector)],
      }).join(),
    ).toContain("reads 'drew' or 'searched'");
    expect(
      messages({
        kind: 'sequence',
        effects: [DRAW, gain({ kind: 'actedThisWay', act: 'drew', of: { kind: 'you' } })],
      }).join(),
    ).toContain("reads the group 'eachPlayer' or 'eachOpponent'");
  });
});

describe('playersAccepted', () => {
  const repeat: Effect = {
    kind: 'repeat',
    times: { kind: 'thisWay', what: 'playersAccepted' },
    effect: DRAW,
  };

  test('counts the players who accepted the offer before it', () => {
    expect(messages({ kind: 'sequence', effects: [OFFER, repeat] })).toEqual([]);
  });

  test('without an offer before it there is nothing to count', () => {
    expect(messages({ kind: 'sequence', effects: [DRAW, repeat] })).not.toEqual([]);
  });
});
