// validateCard for what group 3 of the Danitha deck adds to the AST (D-422 to D-425): the attachment fields of `ObjectFilter`, the conditions `thisEnteredThisTurn` and a
// static `amountIs`, `targetsObject` in the spell filter of `costReduction`, the static `abilityCostReduction` and the engine-only `equip` marker. Every valid shape the cards use is
// accepted (the SYNTHETIC cards of `synthetic-danitha-g3.ts` are validated in the scenario test); the shapes the engine does not run are refused.
import { describe, expect, test } from 'vitest';
import type { Ability, Condition, ObjectFilter, StaticEffect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

const ENCHANT: Ability = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
};
const HOST = { kind: 'attached', types: ['creature'] } as const;

function aura(...abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Aura',
    manaCost: ['1'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities: [ENCHANT, ...abilities],
  });
}

function creature(...abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Creature',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'test',
    abilities,
  });
}

const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

/** An Aura whose bonus counts the permanents `filter` names. */
const counting = (filter: ObjectFilter): Ability => ({
  kind: 'static',
  static: {
    kind: 'modifyPt',
    subject: HOST,
    power: { kind: 'countOf', filter },
    toughness: 0,
  },
});

const grant = (condition: Condition, effect?: StaticEffect): Ability => ({
  kind: 'static',
  static: effect ?? { kind: 'grantKeyword', subject: HOST, keyword: { kind: 'flying' } },
  condition,
});

describe('the attachment fields of a filter', () => {
  test.each<[string, ObjectFilter]>([
    ['attachedTo source', { subtypes: ['Aura'], attachedTo: { kind: 'source' } }],
    ['attachedTo host', { subtypes: ['Aura'], attachedTo: { kind: 'host' } }],
    [
      'attachedTo matching types',
      { subtypes: ['Aura'], attachedTo: { kind: 'matching', filter: { types: ['creature'] } } },
    ],
    [
      'attachedTo matching with a controller and a color',
      {
        subtypes: ['Aura'],
        attachedTo: {
          kind: 'matching',
          filter: { types: ['creature'], colors: ['G'], controller: 'you' },
        },
      },
    ],
    ['enchanted true', { types: ['creature'], enchanted: true }],
  ])('%s is read in a count', (_name, filter) => {
    expect(messages(aura(counting(filter)))).toEqual([]);
  });

  test.each<[string, ObjectFilter, RegExp]>([
    [
      'an unknown host kind',
      { subtypes: ['Aura'], attachedTo: { kind: 'anything' } } as unknown as ObjectFilter,
      /attachedTo is source, host or matching/,
    ],
    [
      'a matching host that reads power',
      {
        subtypes: ['Aura'],
        attachedTo: {
          kind: 'matching',
          filter: { types: ['creature'], power: { cmp: 'atLeast', value: 2 } },
        },
      },
      /described by types, subtypes, colors, supertypes and its controller only/,
    ],
    [
      'a matching host that reads a keyword',
      {
        subtypes: ['Aura'],
        attachedTo: { kind: 'matching', filter: { types: ['creature'], keywords: ['flying'] } },
      },
      /described by types, subtypes, colors, supertypes and its controller only/,
    ],
    [
      'a matching host with a zone',
      {
        subtypes: ['Aura'],
        attachedTo: { kind: 'matching', filter: { types: ['creature'], zone: 'battlefield' } },
      },
      /described by types, subtypes, colors, supertypes and its controller only/,
    ],
    [
      'attachedTo in a zone other than the battlefield',
      { subtypes: ['Aura'], zone: 'graveyard', attachedTo: { kind: 'source' } },
      /only a permanent on the battlefield is attached to/,
    ],
    [
      'enchanted that is not a boolean',
      { types: ['creature'], enchanted: 'yes' } as unknown as ObjectFilter,
      /enchanted must be a boolean/,
    ],
    [
      'hostOfSource false',
      { types: ['creature'], hostOfSource: false } as unknown as ObjectFilter,
      /hostOfSource must be true/,
    ],
  ])('%s is refused', (_name, filter, expected) => {
    expect(messages(aura(counting(filter))).join('\n')).toMatch(expected);
  });

  test('a static ability cannot name its group by "enchanted" or by the kind of host, but may by the source or the host', () => {
    const group = (filter: ObjectFilter): Ability => ({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'filter', filter },
        keyword: { kind: 'flying' },
      },
    });
    expect(messages(creature(group({ types: ['creature'], enchanted: false })))).toContain(
      'a static ability\'s group cannot be named by "enchanted" or by the kind of permanent something is attached to (D-422)',
    );
    expect(
      messages(
        creature(
          group({
            subtypes: ['Aura'],
            attachedTo: { kind: 'matching', filter: { types: ['creature'] } },
          }),
        ),
      ).join('\n'),
    ).toMatch(/cannot be named by "enchanted"/);
    expect(
      messages(creature(group({ subtypes: ['Aura'], attachedTo: { kind: 'source' } }))),
    ).toEqual([]);
  });
});

describe('the conditions', () => {
  test('"this entered this turn" is a plain condition: it is read by every layer, with `and`, `or`, `not`', () => {
    expect(messages(aura(grant({ kind: 'thisEnteredThisTurn' })))).toEqual([]);
    expect(
      messages(
        aura(
          grant(
            { kind: 'not', term: { kind: 'thisEnteredThisTurn' } },
            { kind: 'setColors', subject: { kind: 'attached' }, colors: ['G'] },
          ),
        ),
      ),
    ).toEqual([]);
  });

  test('a static ability reads a count of objects against a number, and nothing else of `amountIs`', () => {
    const count: Condition = {
      kind: 'amountIs',
      amount: {
        kind: 'countOf',
        filter: { subtypes: ['Aura'], other: true, attachedTo: { kind: 'host' } },
      },
      compare: { cmp: 'atLeast', value: 1 },
    };
    expect(messages(aura(grant(count)))).toEqual([]);
    const greatest: Condition = {
      kind: 'amountIs',
      amount: {
        kind: 'aggregate',
        how: 'greatest',
        stat: 'power',
        filter: { types: ['creature'] },
      },
      compare: { cmp: 'atLeast', value: 4 },
    };
    expect(messages(aura(grant(greatest))).join('\n')).toMatch(
      /compares a count of objects \(countOf\) with a number/,
    );
    const keyword: Condition = {
      kind: 'amountIs',
      amount: { kind: 'countOf', filter: { types: ['creature'], keywords: ['flying'] } },
      compare: { cmp: 'atLeast', value: 1 },
    };
    expect(messages(aura(grant(keyword))).join('\n')).toMatch(/cannot read a keyword/);
  });
});

describe('the cost reductions that read the targets', () => {
  const reduce = (spells: ObjectFilter, amount: number | { kind: 'x' } = 3): Ability =>
    ({
      kind: 'static',
      static: { kind: 'costReduction', spells, amount },
    }) as unknown as Ability;

  test('"Aura spells you cast that target enchanted creature cost {3} less" is valid', () => {
    expect(
      messages(
        aura(
          reduce({
            subtypes: ['Aura'],
            controller: 'you',
            targetsObject: { hostOfSource: true },
          }),
        ),
      ),
    ).toEqual([]);
  });

  test.each<[string, ObjectFilter, RegExp]>([
    [
      'a target with a zone of its own',
      { subtypes: ['Aura'], controller: 'you', targetsObject: { zone: 'graveyard' } },
      /permanent on the battlefield, described without a zone of its own/,
    ],
    [
      'a target of a target',
      {
        subtypes: ['Aura'],
        controller: 'you',
        targetsObject: { targetsObject: { types: ['creature'] } },
      },
      /permanent on the battlefield/,
    ],
    [
      'a spell filter with a zone',
      { subtypes: ['Aura'], zone: 'stack', targetsObject: { hostOfSource: true } },
      /zone and stackKind are not set/,
    ],
  ])('%s is refused', (_name, spells, expected) => {
    expect(messages(aura(reduce(spells))).join('\n')).toMatch(expected);
  });
});

describe('abilityCostReduction and the equip marker', () => {
  const equipReduction = (extra: Record<string, unknown> = {}): Ability =>
    ({
      kind: 'static',
      static: {
        kind: 'abilityCostReduction',
        abilities: 'equip',
        targeting: { hostOfSource: true },
        amount: 3,
        ...extra,
      },
    }) as unknown as Ability;

  test('the Equip reduction of an Aura is valid', () => {
    expect(messages(aura(equipReduction()))).toEqual([]);
  });

  test.each<[string, Record<string, unknown>, RegExp]>([
    [
      'another kind of ability',
      { abilities: 'crew' },
      /only Equip abilities or the abilities of some objects are named/,
    ],
    ['no target filter', { targeting: undefined }, /needs a filter of what it targets/],
    [
      'a target with a zone',
      { targeting: { zone: 'graveyard' } },
      /no zone, stackKind or targetsObject/,
    ],
    ['an amount of 0', { amount: 0 }, /must be a positive integer/],
    [
      'an amount that is not a number or a count',
      { amount: { kind: 'x' } },
      /reads what the game says now/,
    ],
  ])('%s is refused', (_name, extra, expected) => {
    expect(messages(aura(equipReduction(extra))).join('\n')).toMatch(expected);
  });

  test('a card cannot write the `equip` marker the engine puts on the expanded Equip ability', () => {
    const marked: Ability = {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      equip: true,
    };
    expect(messages(creature(marked)).join('\n')).toMatch(/equip is written by the engine/);
  });
});
