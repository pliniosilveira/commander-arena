// validateCard for the cost `sacrifice` with `alongside` ("Sacrifice a Swamp and a Forest: ...", CR 701.21a, 118.3, 602.2b) and for a filtered sacrifice in an ability that works from the
// graveyard (CR 113.6b). Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Cost, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

const SWAMP = { subtypes: ['Swamp'] };
const FOREST = { subtypes: ['Forest'] };
const RETURN: Effect = { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' };
const DRAW: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
const BOTH: Cost = { kind: 'sacrifice', what: SWAMP, alongside: [FOREST] };

function creature(abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Creature',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'test',
    abilities,
  });
}

const activated = (
  cost: readonly Cost[],
  extra: { readonly functionsIn?: 'graveyard' | 'hand' } = {},
  effect: Effect = DRAW,
): Ability => ({ kind: 'activated', cost, effect, ...extra });

describe('a sacrifice of several different permanents', () => {
  test('is valid in the cost of an ability, on the battlefield and from the graveyard', () => {
    expect(validateCard(creature([activated([BOTH])]))).toEqual([]);
    expect(
      validateCard(creature([activated([BOTH], { functionsIn: 'graveyard' }, RETURN)])),
    ).toEqual([]);
  });

  test('is not a cost of a spell', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Test Instant',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      spell: { effect: DRAW },
      additionalCosts: [BOTH],
    });
    expect(validateCard(spell).length).toBeGreaterThan(0);
  });

  test('has at least one more part, and names permanents (or the source first), not a count or an X', () => {
    const bad = (cost: Cost) => validateCard(creature([activated([cost])])).length;
    expect(bad({ kind: 'sacrifice', what: SWAMP, alongside: [] })).toBeGreaterThan(0);
    // "Sacrifice ~ and a legendary artifact" (Mount Doom): the source is the first part, so it is valid; it still has no count, X or any number.
    expect(bad({ kind: 'sacrifice', what: { kind: 'this' }, alongside: [FOREST] })).toBe(0);
    expect(bad({ kind: 'sacrifice', what: { kind: 'this' }, alongside: [] })).toBeGreaterThan(0);
    expect(
      bad({ kind: 'sacrifice', what: { kind: 'this' }, alongside: [FOREST], count: 2 }),
    ).toBeGreaterThan(0);
    expect(bad({ kind: 'sacrifice', what: SWAMP, alongside: [FOREST], count: 2 })).toBeGreaterThan(
      0,
    );
    expect(
      bad({ kind: 'sacrifice', what: SWAMP, alongside: [FOREST], countX: true }),
    ).toBeGreaterThan(0);
    expect(
      bad({
        kind: 'sacrifice',
        what: SWAMP,
        alongside: [{ subtypes: ['Forest'], controller: 'opponent' }],
      }),
    ).toBeGreaterThan(0);
    expect(
      bad({
        kind: 'sacrifice',
        what: SWAMP,
        alongside: [{ subtypes: ['Forest'], zone: 'graveyard' }],
      }),
    ).toBeGreaterThan(0);
  });

  test('is not a cost of a flashback', () => {
    const card = singleFace({
      name: 'SYNTHETIC Test Flashback',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      spell: { effect: DRAW },
      abilities: [{ kind: 'keyword', keyword: { kind: 'flashback', cost: [BOTH] } }],
    });
    expect(validateCard(card).length).toBeGreaterThan(0);
  });
});

describe('a sacrifice in an ability that works from the graveyard', () => {
  test('of permanents the controller has is valid, of the source itself is not', () => {
    const from = (cost: Cost) =>
      validateCard(creature([activated([cost], { functionsIn: 'graveyard' }, RETURN)]));
    expect(from({ kind: 'sacrifice', what: SWAMP })).toEqual([]);
    expect(from({ kind: 'sacrifice', what: { kind: 'this' } }).length).toBeGreaterThan(0);
  });
});
