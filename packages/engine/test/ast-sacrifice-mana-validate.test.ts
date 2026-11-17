// validateCard for the nodes of "{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way."
// (D-581 to D-585): the cost `sacrifice` with `anyNumber` and `atLeastOne` in an activated ability, and the amount `sacrificedAsCost` read by it. Cards are SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Cost, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  SACRIFICE_MANA_ABILITY,
  SYNTHETIC_SACRIFICE_MANA_LIST,
} from '../src/cards/fixtures/synthetic-sacrifice-mana';

const ARTIFACTS = { types: ['artifact' as const] };
const ONE_OR_MORE: Cost = { kind: 'sacrifice', what: ARTIFACTS, anyNumber: true, atLeastOne: true };
const COUNT: Effect = {
  kind: 'draw',
  player: { kind: 'you' },
  count: { kind: 'sacrificedAsCost' },
};
const DRAW: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };

function artifact(abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Artifact',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities,
  });
}

function instant(additionalCosts: readonly Cost[], effect: Effect = DRAW): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Instant',
    manaCost: ['1'],
    types: ['instant'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    spell: { effect },
    additionalCosts,
  });
}

const activated = (cost: readonly Cost[], effect: Effect = DRAW): Ability => ({
  kind: 'activated',
  cost,
  effect,
});
const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

describe('the SYNTHETIC cards of the group are valid and supported', () => {
  test.each(SYNTHETIC_SACRIFICE_MANA_LIST.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.support).toBe('supported');
  });
});

describe('"Sacrifice one or more artifacts" (CR 602.2b, 701.21a): `sacrifice` with `anyNumber` and `atLeastOne`', () => {
  test('the cost of an activated ability with an effect that reads the count is valid', () => {
    expect(validateCard(artifact([SACRIFICE_MANA_ABILITY]))).toEqual([]);
    expect(validateCard(artifact([activated([{ kind: 'tap' }, ONE_OR_MORE], COUNT)]))).toEqual([]);
  });

  test('"any number" that may be none is not the cost of an ability, only of a spell (D-491)', () => {
    const none: Cost = { kind: 'sacrifice', what: ARTIFACTS, anyNumber: true };
    expect(messages(artifact([activated([none])])).join('\n')).toMatch(/atLeastOne/);
  });

  test('atLeastOne goes with anyNumber, and with no count, no X and not the permanent itself', () => {
    const alone: Cost = { kind: 'sacrifice', what: ARTIFACTS, atLeastOne: true };
    expect(messages(artifact([activated([alone])])).join('\n')).toMatch(/atLeastOne/);
    const counted: Cost = { ...ONE_OR_MORE, count: 2 };
    expect(messages(artifact([activated([counted])])).length).toBeGreaterThan(0);
    const x: Cost = { ...ONE_OR_MORE, countX: true };
    expect(messages(artifact([activated([x])])).length).toBeGreaterThan(0);
    const itself: Cost = {
      kind: 'sacrifice',
      what: { kind: 'this' },
      anyNumber: true,
      atLeastOne: true,
    };
    expect(messages(artifact([activated([itself])])).length).toBeGreaterThan(0);
  });

  test('an ability has one sacrifice cost', () => {
    const two = activated([ONE_OR_MORE, { kind: 'sacrifice', what: { types: ['creature'] } }]);
    expect(validateCard(artifact([two])).length).toBeGreaterThan(0);
  });

  test('a mana ability does not sacrifice one or more permanents', () => {
    const mana: Ability = {
      kind: 'mana',
      cost: [{ kind: 'tap' }, ONE_OR_MORE],
      production: { kind: 'fixed', mana: ['C'] },
    };
    expect(validateCard(artifact([mana])).length).toBeGreaterThan(0);
  });

  test('an additional cost of a spell may sacrifice any number, none included, and has no atLeastOne', () => {
    expect(
      validateCard(instant([{ kind: 'sacrifice', what: ARTIFACTS, anyNumber: true }])),
    ).toEqual([]);
    expect(messages(instant([ONE_OR_MORE])).join('\n')).toMatch(/atLeastOne/);
  });
});

describe('the amount `sacrificedAsCost` of an activated ability', () => {
  test('is read by an ability whose cost sacrifices one or more permanents', () => {
    expect(validateCard(artifact([activated([ONE_OR_MORE], COUNT)]))).toEqual([]);
  });

  test('is refused by an ability whose cost sacrifices nothing of the kind', () => {
    const noCost = activated([{ kind: 'tap' }], COUNT);
    expect(messages(artifact([noCost])).join('\n')).toMatch(/sacrificedAsCost/);
    const fixed = activated([{ kind: 'sacrifice', what: ARTIFACTS }], COUNT);
    expect(messages(artifact([fixed])).join('\n')).toMatch(/sacrificedAsCost/);
  });

  test('is still refused in the text of a spell with no optional sacrifice, and in a triggered ability', () => {
    expect(messages(instant([{ kind: 'payLife', amount: 1 }], COUNT)).join('\n')).toMatch(
      /sacrificedAsCost/,
    );
    const trigger: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: COUNT,
    };
    expect(messages(artifact([trigger])).join('\n')).toMatch(/sacrificedAsCost/);
  });
});
