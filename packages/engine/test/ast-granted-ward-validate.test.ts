// Issue 89 (D-638): what `validateCard` allows of a granted ward (CR 702.21a): a static ability and a grantKeyword effect may give it with a cost the ward ability can pay
// (mana, life, a discard), never with no cost or a cost it cannot pay.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type Cost, type Effect, validateCard } from '../src/index';

const creature = (abilities: readonly Ability[]) =>
  singleFace({
    name: 'SYNTHETIC Test Subject',
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'Test.',
    abilities,
  });

const spell = (effect: Effect) =>
  singleFace({
    name: 'SYNTHETIC Test Spell',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Test.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect,
    },
  });

const staticGrant = (cost: readonly Cost[]): Ability => ({
  kind: 'static',
  static: {
    kind: 'grantKeyword',
    subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' }, other: true },
    keyword: { kind: 'ward', cost },
  },
});

const grantEffect = (cost: readonly Cost[]): Effect => ({
  kind: 'grantKeyword',
  objects: { kind: 'target', id: 't1' },
  keyword: { kind: 'ward', cost },
  duration: 'untilEndOfTurn',
});

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card).map((i) => i.message);

describe('a granted ward (D-638)', () => {
  test.each([
    [[{ kind: 'mana', symbols: ['2'] }]],
    [[{ kind: 'payLife', amount: 3 }]],
    [[{ kind: 'mana', symbols: ['1', 'W'] }]],
  ] as const)('a static ability and an effect may give ward with the cost %j', (cost) => {
    expect(messages(creature([staticGrant(cost)]))).toEqual([]);
    expect(messages(spell(grantEffect(cost)))).toEqual([]);
  });

  test('a ward with no cost is refused, in a static ability and in an effect', () => {
    expect(messages(creature([staticGrant([])])).join(' ')).toContain('ward needs a cost');
    expect(messages(spell(grantEffect([]))).join(' ')).toContain('ward needs a cost');
  });

  test('a ward whose cost is not one the ward ability pays is refused', () => {
    const cost = [{ kind: 'tap' }] as const;
    expect(messages(creature([staticGrant(cost)])).join(' ')).toContain(
      'a granted ward may cost mana, life or a discard',
    );
  });
});
