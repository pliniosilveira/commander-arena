// validateCard for what group 2 of the Limit Break deck adds to the AST: the static `loseKeyword` (Colossus Hammer), `isSource` in the `targeting` filter of the static
// `abilityCostReduction` (Helitrooper), the filter flag `powerGreaterThanSource` in an `objectMatches` condition (Conformer Shuriken) and the `may` of an `addCounters` effect
// (Sephiroth, Fallen Hero). Every valid shape the cards use is accepted; the shapes the engine does not run are refused.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

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

function equipment(...abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Equipment',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities,
  });
}

const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

describe('the static loseKeyword (CR 613.1f)', () => {
  const loses = (keyword: object): Ability => ({
    kind: 'static',
    static: { kind: 'loseKeyword', subject: { kind: 'attached' }, keyword } as never,
  });

  test('a keyword without parameters is taken from the equipped creature', () => {
    expect(messages(equipment(loses({ kind: 'flying' })))).toEqual([]);
  });

  test('a keyword with parameters is refused', () => {
    expect(messages(equipment(loses({ kind: 'ward', cost: [] }))).join('|')).toContain(
      'only a keyword without parameters is taken away',
    );
  });

  test('it takes a condition like the other layer 6 statics', () => {
    const conditional: Ability = {
      ...loses({ kind: 'flying' }),
      condition: { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 3 },
    } as never;
    expect(messages(equipment(conditional))).toEqual([]);
  });
});

describe('abilityCostReduction targeting isSource (Helitrooper, CR 601.2f, 702.6a)', () => {
  const reduction = (targeting: object): Ability => ({
    kind: 'static',
    static: { kind: 'abilityCostReduction', abilities: 'equip', targeting, amount: 2 } as never,
  });

  test('"that target this creature" is accepted', () => {
    expect(messages(creature(reduction({ isSource: true })))).toEqual([]);
  });

  test('isSource stays refused in a filter that is not about what is targeted', () => {
    const counted: Ability = {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'this' },
        power: { kind: 'countOf', filter: { isSource: true } },
        toughness: 0,
      },
    };
    expect(messages(creature(counted)).join('|')).toContain('isSource');
  });
});

describe('objectMatches with powerGreaterThanSource (Conformer Shuriken, CR 208.1, 608.2c)', () => {
  const when = (flag: unknown): Ability => ({
    kind: 'triggered',
    trigger: { kind: 'attacks', what: { kind: 'this' } },
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
    effect: {
      kind: 'conditional',
      condition: {
        kind: 'objectMatches',
        of: { kind: 'target', id: 't1' },
        filter: { powerGreaterThanSource: flag } as never,
      },
      effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
    } as Effect,
  });

  test('the flag is accepted', () => {
    expect(messages(creature(when(true)))).toEqual([]);
  });

  test('the flag is true or absent', () => {
    expect(messages(creature(when(false))).join('|')).toContain(
      'powerGreaterThanSource must be true',
    );
  });
});

describe('a may of an addCounters effect (Sephiroth, Fallen Hero, CR 608.2d)', () => {
  test('is accepted before another instruction of the same ability', () => {
    const effect: Effect = {
      kind: 'sequence',
      effects: [
        {
          kind: 'may',
          effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: 'cell', count: 1 },
        },
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
      ],
    };
    expect(
      messages(
        creature({
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect,
        }),
      ),
    ).toEqual([]);
  });
});
