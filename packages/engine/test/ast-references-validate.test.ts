// Validation of the nodes of D-092: amounts that read a target (`powerOf`, `manaValueOf`),
// `createToken.controller`, `search.player` and `optional`, `ObjectFilter.owner`, a target of
// `counterUnlessPays`, and the `choose` selector of `moveToZone`. A node is well-formed
// (validateCardStructure) and executable (validateCard) only as the engine runs it.
import { describe, expect, test } from 'vitest';
import {
  type CardDefinition,
  type Effect,
  type ObjectFilter,
  SUPPORTED_FEATURES,
  type TargetSpec,
  validateCard,
  validateCardStructure,
} from '../src/index';
import { matchesFilterWith } from '../src/rules/filter-match';
import { singleFaceCard } from './dsl-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const PLAYER: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };
const SPELL: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } },
};

function sorcery(effect: Effect, targets?: readonly TargetSpec[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    spell: { ...(targets === undefined ? {} : { targets }), effect },
  });
}
const structural = (e: Effect, targets?: readonly TargetSpec[]) =>
  validateCardStructure(sorcery(e, targets)).map((i) => `${i.path}: ${i.message}`);
const runnable = (e: Effect, targets?: readonly TargetSpec[]) =>
  validateCard(sorcery(e, targets)).map((i) => `${i.path}: ${i.message}`);
const at = (path: string) => `faces[0].spell.effect${path}`;

describe('amounts that read an object', () => {
  const gain = (amount: unknown): Effect =>
    ({ kind: 'gainLife', player: { kind: 'you' }, amount }) as Effect;

  test('power and mana value of a declared target are runnable', () => {
    for (const kind of ['powerOf', 'manaValueOf']) {
      expect(runnable(gain({ kind, of: T1 }), [CREATURE]), kind).toEqual([]);
    }
  });

  test('an undeclared target, or a player target, is refused', () => {
    expect(structural(gain({ kind: 'manaValueOf', of: T1 }))).toEqual([
      `${at('.amount.of')}: target "t1" is not declared on this ability or spell mode`,
    ]);
    expect(structural(gain({ kind: 'powerOf', of: T1 }), [PLAYER])).toEqual([
      `${at('.amount.of')}: target "t1" is a player but an object is required here`,
    ]);
  });

  test('the features list them', () => {
    expect(SUPPORTED_FEATURES.amountKinds).toEqual([
      'number',
      'x',
      'powerOf',
      'manaValueOf',
      // D-151: "the difference" (Discover).
      'shortfall',
      'countOf',
      'timesKicked',
      // D-183: "the amount of mana spent to cast it".
      'manaSpent',
      'times',
      'lifeLostThisWay',
      'lifeLostThisTurn',
      // D-131.
      'toughnessOf',
      'countersOn',
      'aggregate',
      'devotion',
      'commanderColors',
      'commanderManaValue',
      'commanderCasts',
      // D-179: "for each color among permanents you control".
      'colorsAmong',
      'timesAttacked',
      'affected',
      'half',
      'multiple',
      'minus',
      'sum',
      'opponentsWithMore',
      'thisWay',
      // D-133.
      'triggerDamage',
      // D-194: "the number of profit votes" (CR 701.38a).
      'votesFor',
      // D-450: "for each card you've drawn this turn" (CR 121.1).
      'cardsDrawnThisTurn',
      'sacrificedAsCost',
    ]);
  });
});

describe('createToken.controller and shuffle.player', () => {
  const token = (controller: unknown): Effect =>
    ({
      kind: 'createToken',
      token: { kind: 'preset', preset: 'Treasure' },
      count: 1,
      controller,
    }) as Effect;

  test('a controller selector is validated like any player selector', () => {
    expect(runnable(token({ kind: 'controllerOf', of: T1 }), [CREATURE])).toEqual([]);
    expect(runnable(token({ kind: 'target', id: 't1' }), [PLAYER])).toEqual([]);
    expect(structural(token({ kind: 'target', id: 't1' }), [CREATURE])).toEqual([
      `${at('.controller')}: target "t1" is an object but a player is required here`,
    ]);
    expect(structural(token({ kind: 'nobody' }))).toEqual([
      `${at('.controller')}: unknown player selector nobody`,
    ]);
  });
});

describe('ObjectFilter.owner', () => {
  const wipe = (filter: ObjectFilter): Effect => ({
    kind: 'exile',
    objects: { kind: 'each', filter },
  });

  test('the owner of an `each` selector may name a player target', () => {
    expect(
      runnable(wipe({ zone: 'graveyard', owner: { kind: 'target', id: 't1' } }), [PLAYER]),
    ).toEqual([]);
    expect(runnable(wipe({ zone: 'graveyard', owner: { kind: 'you' } }))).toEqual([]);
  });

  test('a target that is not a player is refused', () => {
    expect(
      structural(wipe({ zone: 'graveyard', owner: { kind: 'target', id: 't1' } }), [CREATURE]),
    ).toEqual([
      `${at('.objects.filter.owner')}: target "t1" is an object but a player is required here`,
    ]);
  });

  test('anywhere an effect cannot resolve it, owner is refused', () => {
    const message = (path: string) =>
      `${path}: owner is only read in the 'each' selector of an effect (not in a target slot, trigger, condition, static ability, search or cost)`;
    const owner = { kind: 'you' } as const;
    // A target slot.
    expect(
      structural({ kind: 'destroy', objects: T1 }, [
        { id: 't1', what: { kind: 'object', filter: { zone: 'graveyard', owner } } },
      ]),
    ).toEqual([message('faces[0].spell.targets[0].what.filter.owner')]);
    // A search filter.
    expect(
      structural({
        kind: 'search',
        player: { kind: 'you' },
        filter: { owner },
        max: 1,
        destinations: [{ zone: 'hand', count: 1 }],
        reveal: false,
        shuffle: true,
      }),
    ).toEqual([message(at('.filter.owner'))]);
    // A member of anyOf.
    expect(
      structural(wipe({ zone: 'graveyard', anyOf: [{ owner }, { types: ['land'] }] })),
    ).toEqual([message(at('.objects.filter.anyOf[0].owner'))]);
    // A sacrifice choice.
    expect(
      structural({ kind: 'sacrifice', objects: { kind: 'choose', filter: { owner } } }),
    ).toEqual([message(at('.objects.filter.owner'))]);
    // A prevention shield.
    expect(
      structural({
        kind: 'preventDamage',
        scope: 'all',
        amount: 'all',
        to: { kind: 'each', filter: { owner } },
        duration: 'untilEndOfTurn',
      }),
    ).toEqual([`${at('.to.filter.owner')}: a prevention shield does not read the owner of a card`]);
  });

  test('a filter whose owner was not resolved matches nothing (fails closed)', () => {
    const base = { types: ['creature'], supertypes: [], subtypes: [], colors: [] } as const;
    // Only the shape the filter code reads is needed: an object owned by seat 1 in a graveyard.
    const obj = { zone: 'graveyard', owner: 1, controller: 1, tapped: false, id: 'o1' } as never;
    const filter: ObjectFilter = { zone: 'graveyard', owner: { kind: 'you' } };
    const state = { continuousEffects: [] } as never;
    const ctx = { controller: 0, source: null } as const;
    expect(matchesFilterWith(state, obj, () => base, filter, ctx)).toBe(false);
    expect(matchesFilterWith(state, obj, () => base, filter, { ...ctx, owners: [0] })).toBe(false);
    expect(matchesFilterWith(state, obj, () => base, filter, { ...ctx, owners: [1] })).toBe(true);
    expect(matchesFilterWith(state, obj, () => base, { zone: 'graveyard' }, ctx)).toBe(true);
  });

  test('the features list ownerRef', () => {
    expect(SUPPORTED_FEATURES.selectorKinds).toContain('ownerRef');
  });
});

describe('counterUnlessPays with a target', () => {
  const counter = (objects: unknown): Effect =>
    ({
      kind: 'counterUnlessPays',
      objects,
      cost: [{ kind: 'mana', symbols: ['3'] }],
    }) as Effect;

  test('a declared target slot is runnable in a spell', () => {
    expect(runnable(counter(T1), [SPELL])).toEqual([]);
  });

  test('an undeclared target, this and "each" are refused', () => {
    expect(structural(counter(T1))).toEqual([
      `${at('.objects')}: target "t1" is not declared on this ability or spell mode`,
    ]);
    for (const objects of [{ kind: 'thisSpell' }, { kind: 'each', filter: {} }]) {
      expect(structural(counter(objects), [SPELL])).toEqual([
        `${at('.objects')}: counterUnlessPays names a target spell or ability, or the triggering one (triggerSubject)`,
      ]);
    }
  });
});

describe('moveToZone with choose', () => {
  const bounce = (objects: unknown, to = 'hand'): Effect =>
    ({ kind: 'moveToZone', objects, to }) as Effect;
  const land = { kind: 'choose', filter: { types: ['land'], controller: 'you' } };

  test('"a land you control" to the hand, graveyard or library is runnable', () => {
    for (const to of ['hand', 'graveyard', 'library']) {
      expect(runnable(bounce(land, to)), to).toEqual([]);
    }
    expect(runnable(bounce({ ...land, count: 2 }))).toEqual([]);
  });

  test('the filter must say "you control", look at the battlefield and ask for a positive count', () => {
    expect(structural(bounce({ kind: 'choose', filter: { types: ['land'] } }))).toEqual([
      `${at('.objects.filter.controller')}: a choice of what to move is among the permanents you control: set controller to 'you'`,
    ]);
    expect(
      structural(bounce({ kind: 'choose', filter: { types: ['land'], controller: 'opponent' } })),
    ).toEqual([
      `${at('.objects.filter.controller')}: a choice of what to move is among the permanents you control: set controller to 'you'`,
    ]);
    expect(
      structural(bounce({ kind: 'choose', filter: { zone: 'library', controller: 'you' } })),
    ).toEqual([
      `${at('.objects.filter.zone')}: only permanents on the battlefield, or cards in your hand or graveyard (D-139) or exiled with this permanent (D-207), can be chosen to move`,
    ]);
    expect(structural(bounce({ ...land, count: 0 }))).toEqual([
      `${at('.objects.count')}: count must be a positive integer`,
    ]);
  });

  test('onto the battlefield is refused', () => {
    expect(structural(bounce(land, 'battlefield'))).toEqual([
      `${at('.to')}: a chosen permanent cannot be moved onto the battlefield`,
    ]);
  });
});
