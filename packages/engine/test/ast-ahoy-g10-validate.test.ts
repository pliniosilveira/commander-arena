// Ahoy Mateys deck, group 10: what `validateCard` allows of the cost reduction of an equip keyword (`equip.costReducedIf`, CR 601.2f, 602.2b), of "that targets you" (`targetsPlayer` of 'you', CR 115.1,
// 601.2c), of "each creature that convoked this spell" (`convokers`, CR 702.51a) and of a reveal branch the controller does (`revealTopBranches.branches[].asController`, CR 701.20a).
// The CR text was not available here: the numbers are those the engine's comments cite.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type Condition, type Effect, validateCard } from '../src/index';

const base = {
  manaCost: ['1'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Test.',
} as const;

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card).map((i) => i.message);

const equipment = (keyword: Record<string, unknown>) =>
  singleFace({
    ...base,
    name: 'SYNTHETIC Test Equipment',
    types: ['artifact'],
    subtypes: ['Equipment'],
    abilities: [{ kind: 'keyword', keyword } as unknown as Ability],
  });

const sorcery = (effect: Effect, targets?: readonly unknown[]) =>
  singleFace({
    ...base,
    name: 'SYNTHETIC Test Sorcery',
    types: ['sorcery'],
    spell: { effect, ...(targets === undefined ? {} : { targets }) } as never,
  });

const FEW_CARDS: Condition = {
  kind: 'amountIs',
  amount: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
  compare: { cmp: 'atMost', value: 1 },
};

describe('equip with a cost reduction', () => {
  const equip = (
    extra: Record<string, unknown>,
    cost: unknown = [{ kind: 'mana', symbols: ['2'] }],
  ) => equipment({ kind: 'equip', cost, ...extra });

  test('a positive reduction with a condition is valid', () => {
    expect(messages(equip({ costReducedIf: { generic: 2, condition: FEW_CARDS } }))).toEqual([]);
  });

  test('a reduction of zero is refused', () => {
    expect(
      messages(equip({ costReducedIf: { generic: 0, condition: FEW_CARDS } })).some((m) =>
        m.includes('positive whole number'),
      ),
    ).toBe(true);
  });

  test('only a mana cost can be reduced', () => {
    expect(
      messages(
        equip({ costReducedIf: { generic: 1, condition: FEW_CARDS } }, [
          { kind: 'payLife', amount: 2 },
        ]),
      ).some((m) => m.includes('only a mana cost can be reduced')),
    ).toBe(true);
  });
});

describe("targetsPlayer of 'you'", () => {
  const counter = (filter: Record<string, unknown>) =>
    sorcery({ kind: 'counter', objects: { kind: 'target', id: 't1' } }, [
      { id: 't1', what: { kind: 'object', filter } },
    ]);

  test("a spell or ability on the stack that targets 'you' is valid", () => {
    expect(messages(counter({ zone: 'stack', targetsPlayer: 'you' }))).toEqual([]);
  });

  test('another value is refused', () => {
    expect(
      messages(counter({ zone: 'stack', targetsPlayer: 'me' })).some((m) =>
        m.includes("targetsPlayer must be true or 'you'"),
      ),
    ).toBe(true);
  });

  test('it needs the stack, as targetsPlayer true does', () => {
    expect(
      messages(counter({ zone: 'battlefield', targetsPlayer: 'you' })).some((m) =>
        m.includes('only a spell or ability on the stack'),
      ),
    ).toBe(true);
  });
});

describe('convokers', () => {
  const connive: Effect = { kind: 'connive', objects: { kind: 'convokers' } };

  test('read in the effect of a spell it is valid', () => {
    expect(messages(sorcery(connive))).toEqual([]);
  });

  test('read in an ability it is refused', () => {
    const card = singleFace({
      ...base,
      name: 'SYNTHETIC Test Creature',
      types: ['creature'],
      power: 1,
      toughness: 1,
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: connive,
        },
      ],
    });
    expect(
      messages(card).some((m) => m.includes("'convokers' is only valid in the effect of a spell")),
    ).toBe(true);
  });
});

describe('a reveal branch done by the controller', () => {
  const token = {
    kind: 'createToken',
    token: { kind: 'preset', preset: 'Map' },
    count: 1,
  } as const;
  const reveal = (branch: Record<string, unknown>): Effect =>
    ({
      kind: 'revealTopBranches',
      player: { kind: 'eachPlayer' },
      branches: [{ ifMatches: { notTypes: ['land'] }, ...branch }],
    }) as unknown as Effect;

  test('asController with onMatch is valid', () => {
    expect(messages(sorcery(reveal({ onMatch: token, asController: true })))).toEqual([]);
  });

  test('asController without onMatch is refused', () => {
    expect(
      messages(sorcery(reveal({ to: 'hand', asController: true }))).some((m) =>
        m.includes('asController is true, and only for a branch with onMatch'),
      ),
    ).toBe(true);
  });

  test('asController of false is refused', () => {
    expect(
      messages(sorcery(reveal({ onMatch: token, asController: false }))).some((m) =>
        m.includes('asController is true'),
      ),
    ).toBe(true);
  });
});
