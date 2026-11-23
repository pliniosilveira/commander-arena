// The amount nodes of the Abzan Armor precon (issue 99, group B): `difference` (CR 107.1, 608.2c), `controllerLifeLostThisTurn` (CR 119.3), `eachObject` with `addCounters.perObject`
// (CR 608.2c, 122.6) and an `aggregate` as the count of `entersWithCounters` (CR 614.12). A node the engine reads in one place only is refused elsewhere. The plays through
// applyAction are in packages/cards/test/scenario-abzan-armor-amounts.test.ts.
import { describe, expect, test } from 'vitest';
import { type Amount, type CardDefinition, syntheticCard, validateCard } from '../src/index';
import { amountOf } from '../src/rules/amounts';
import { scenario } from '../src/testing/index';

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

function withAbility(ability: unknown): CardDefinition {
  const card = syntheticCard('SYNTHETIC Plain Zombie');
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, abilities: [ability] }] } as never;
}

const POWER = { kind: 'powerOf', of: { kind: 'this' } };
const TOUGHNESS = { kind: 'toughnessOf', of: { kind: 'this' } };
const upkeep = (effect: unknown) => ({
  kind: 'triggered',
  trigger: { kind: 'upkeep', whose: 'you' },
  effect,
});
const counters = (extra: Record<string, unknown>, count: unknown) =>
  upkeep({
    kind: 'addCounters',
    objects: { kind: 'each', filter: { types: ['creature'], controller: 'you', other: true } },
    counter: '+1/+1',
    count,
    ...extra,
  });

describe('the amount `difference`', () => {
  test('is the positive gap of two amounts, whichever is larger (CR 107.1)', () => {
    const g = scenario().seat(0).seat(1).at('precombatMain').build();
    const read = (amount: Amount) => amountOf(g.state, amount, { controller: 0, source: null }, []);
    expect(read({ kind: 'difference', of: [5, 2] })).toBe(3);
    expect(read({ kind: 'difference', of: [2, 5] })).toBe(3);
    expect(read({ kind: 'difference', of: [4, 4] })).toBe(0);
  });

  test('needs exactly two amounts', () => {
    const lose = (amount: unknown) => upkeep({ kind: 'loseLife', player: { kind: 'you' }, amount });
    expect(messages(withAbility(lose({ kind: 'difference', of: [POWER, TOUGHNESS] })))).toEqual([]);
    expect(messages(withAbility(lose({ kind: 'difference', of: [POWER] }))).join(' | ')).toContain(
      'exactly two amounts',
    );
  });
});

describe('the amount `controllerLifeLostThisTurn`', () => {
  test("is the controller's own life lost this turn, not another seat's", () => {
    const g = scenario({ seats: 3 }).seat(0).seat(1).seat(2).at('precombatMain').build();
    const seats = g.state.seats.map((s, i) => (i === 2 ? { ...s, lifeLostThisTurn: 6 } : s));
    const state = { ...g.state, seats } as typeof g.state;
    const read = (controller: 0 | 1 | 2) =>
      amountOf(state, { kind: 'controllerLifeLostThisTurn' }, { controller, source: null }, []);
    expect(read(0)).toBe(0);
    expect(read(2)).toBe(6);
  });
});

describe('`eachObject` and `addCounters.perObject`', () => {
  const each = (kind: string) => ({ kind, of: { kind: 'eachObject' } });
  test('valid in the count of an addCounters with perObject', () => {
    expect(messages(withAbility(counters({ perObject: true }, each('toughnessOf'))))).toEqual([]);
  });
  test('refused without perObject, and with perController', () => {
    expect(messages(withAbility(counters({}, each('toughnessOf')))).join(' | ')).toContain(
      'eachObject',
    );
    expect(
      messages(
        withAbility(counters({ perObject: true, perController: true }, each('toughnessOf'))),
      ).join(' | '),
    ).toContain('cannot both be set');
  });
  test('refused outside addCounters', () => {
    const draw = upkeep({ kind: 'draw', player: { kind: 'you' }, count: each('toughnessOf') });
    expect(messages(withAbility(draw)).join(' | ')).toContain('eachObject');
  });
});

describe('an `aggregate` as the count of `entersWithCounters`', () => {
  const titan = (count: unknown) => ({
    kind: 'replacement',
    replacement: { kind: 'entersWithCounters', counter: '+1/+1', count },
  });
  test('valid for the total toughness of other creatures', () => {
    const count = {
      kind: 'aggregate',
      how: 'total',
      stat: 'toughness',
      filter: { types: ['creature'], controller: 'you', other: true },
    };
    expect(messages(withAbility(titan(count)))).toEqual([]);
  });
});
