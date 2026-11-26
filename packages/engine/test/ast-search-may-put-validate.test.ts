// Validation of `search.mayPut` (CR 608.2c, 608.2d, 701.23; Scholar of New Horizons): "If an opponent controls more lands than you, you may put that card onto the battlefield tapped. If you
// don't, put it into your hand." The search is yours, finds one card, has the hand as its only destination and nothing of the other search options. Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { type Ability, type CardDefinition, type Effect, validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const MORE_LANDS = {
  kind: 'amountIs',
  amount: { kind: 'opponentsWithMore', stat: 'lands' },
  compare: { cmp: 'atLeast', value: 1 },
} as const;

const search = (extra: Partial<Extract<Effect, { kind: 'search' }>> = {}): Effect => ({
  kind: 'search',
  player: { kind: 'you' },
  filter: { subtypes: ['Plains'] },
  max: 1,
  destinations: [{ zone: 'hand', count: 1 }],
  mayPut: { condition: MORE_LANDS, tapped: true },
  reveal: true,
  shuffle: true,
  ...extra,
});

function card(effect: Effect): CardDefinition {
  const ability: Ability = {
    kind: 'activated',
    cost: [{ kind: 'tap' }],
    effect,
  };
  return singleFaceCard({
    name: 'SYNTHETIC Scholar Probe',
    manaCost: ['1', 'W'],
    types: ['creature'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
    abilities: [ability],
    power: 1,
    toughness: 1,
  });
}

const messages = (effect: Effect) => validateCard(card(effect)).map((i) => i.message);

describe('search.mayPut', () => {
  test('a search for one card of yours into the hand, revealed and shuffled, is valid', () => {
    expect(messages(search())).toEqual([]);
  });

  test('the put may be untapped', () => {
    expect(messages(search({ mayPut: { condition: MORE_LANDS } }))).toEqual([]);
  });

  test('another player searching is refused', () => {
    expect(messages(search({ player: { kind: 'eachOpponent' } })).join(' ')).toContain(
      'may put its card onto the battlefield',
    );
  });

  test('a destination that is not the hand is refused', () => {
    expect(
      messages(search({ destinations: [{ zone: 'graveyard', count: 1 }] })).join(' '),
    ).toContain('may put its card onto the battlefield');
  });

  test('more than one card is refused', () => {
    expect(
      messages(search({ max: 2, destinations: [{ zone: 'hand', count: 2 }] })).join(' '),
    ).toContain('may put its card onto the battlefield');
  });

  test('a "may" search is refused: the player is asked about the put alone', () => {
    expect(messages(search({ optional: true })).join(' ')).toContain(
      'may put its card onto the battlefield',
    );
  });

  test('a tapped flag that is not true is refused', () => {
    const bad = search({ mayPut: { condition: MORE_LANDS, tapped: false as unknown as true } });
    expect(messages(bad).join(' ')).toContain('tapped must be true');
  });

  test('a condition that is not well formed is refused', () => {
    const bad = search({
      mayPut: { condition: { kind: 'controlsAtLeast', filter: {}, count: 0 } },
    });
    expect(messages(bad)).not.toEqual([]);
  });
});
