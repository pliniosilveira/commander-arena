// validateCard for the nodes of group 3 of the Feather deck (D-1320 to D-1322 provisional): `ObjectFilter.isSource` and `targetsOnly` (a spell that targets this creature, or only it),
// a disjunction of spells one member of which says what the spell targets, `copySpell` with `forEach` and `copier` (CR 707.10, 707.10e), and `exileOnResolve` (CR 614.1a). Cards are
// SYNTHETIC or defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect, ObjectFilter } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import { SYNTHETIC_FEATHER_G3_LIST } from '../src/cards/fixtures/synthetic-feather-g3';

function creature(abilities: readonly Ability[]): CardDefinition {
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

const castTrigger = (filter: ObjectFilter, effect: Effect, by: 'you' | 'any' = 'you'): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter, by },
  effect,
});

const DRAW: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
const SPELL = { kind: 'triggerSubject' } as const;
const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

describe('the SYNTHETIC cards of the group are valid and supported', () => {
  test.each(SYNTHETIC_FEATHER_G3_LIST.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.support).toBe('supported');
  });
});

describe('isSource and targetsOnly (CR 115.1, 115.9c)', () => {
  test('a spell that targets this creature, or only it, is valid', () => {
    for (const aimed of [
      { targetsObject: { isSource: true as const } },
      { targetsOnly: { isSource: true as const } },
    ]) {
      expect(validateCard(creature([castTrigger({ stackKind: 'spell', ...aimed }, DRAW)]))).toEqual(
        [],
      );
    }
  });

  test('isSource is only the object a spell targets', () => {
    expect(messages(creature([castTrigger({ stackKind: 'spell', isSource: true }, DRAW)]))).toEqual(
      [expect.stringContaining('isSource is read in the filter of what a spell targets')],
    );
    expect(
      messages(
        creature([
          {
            kind: 'triggered',
            trigger: { kind: 'entersBattlefield', what: { isSource: true } },
            effect: DRAW,
          },
        ]),
      ),
    ).toEqual([expect.stringContaining('isSource is read in the filter of what a spell targets')]);
  });

  test('targetsOnly is about a spell or ability on the stack', () => {
    expect(
      messages(
        creature([
          {
            kind: 'triggered',
            trigger: { kind: 'entersBattlefield', what: { targetsOnly: { isSource: true } } },
            effect: DRAW,
          },
        ]),
      ),
    ).toEqual([expect.stringContaining('only a spell or ability on the stack has targets chosen')]);
  });

  test('targetsObject and targetsOnly are not read together', () => {
    expect(
      messages(
        creature([
          castTrigger(
            {
              stackKind: 'spell',
              targetsObject: { isSource: true },
              targetsOnly: { isSource: true },
            },
            DRAW,
          ),
        ]),
      ),
    ).toEqual([expect.stringContaining('are not read together')]);
  });

  test('a member of a disjunction of spells may say what the spell targets; on the battlefield it may not', () => {
    const aimed = { targetsObject: { types: ['creature' as const], controller: 'you' as const } };
    expect(
      validateCard(
        creature([
          castTrigger({ stackKind: 'spell', anyOf: [{ subtypes: ['Equipment'] }, aimed] }, DRAW),
        ]),
      ),
    ).toEqual([]);
    expect(
      messages(
        creature([
          {
            kind: 'triggered',
            trigger: {
              kind: 'entersBattlefield',
              what: { anyOf: [{ subtypes: ['Equipment'] }, aimed] },
            },
            effect: DRAW,
          },
        ]),
      ),
    ).toEqual([expect.stringContaining('only a spell or ability on the stack has targets chosen')]);
  });
});

describe('copySpell with forEach (CR 707.10, 707.10e)', () => {
  const forEach: ObjectFilter = { types: ['creature'], controller: 'you', other: true };
  const filter: ObjectFilter = { stackKind: 'spell', targetsOnly: { isSource: true } };
  const copy = (extra: Partial<Extract<Effect, { kind: 'copySpell' }>>): Effect => ({
    kind: 'copySpell',
    spell: SPELL,
    newTargets: 'no',
    forEach,
    ...extra,
  });

  test('a copy for each other creature, and "that player" copies, are valid', () => {
    expect(validateCard(creature([castTrigger(filter, copy({}))]))).toEqual([]);
    expect(
      validateCard(
        creature([
          castTrigger(
            filter,
            copy({ copier: 'triggerPlayer', forEach: { ...forEach, controller: 'triggerPlayer' } }),
            'any',
          ),
        ]),
      ),
    ).toEqual([]);
  });

  test('nobody chooses the targets of the copies, and there is no count', () => {
    expect(messages(creature([castTrigger(filter, copy({ newTargets: 'may' }))]))).toEqual([
      expect.stringContaining('newTargets is "no"'),
    ]);
    expect(messages(creature([castTrigger(filter, copy({ count: 2 }))]))).toEqual([
      expect.stringContaining('has no count of its own'),
    ]);
  });

  test('the objects are permanents on the battlefield', () => {
    expect(
      messages(
        creature([castTrigger(filter, copy({ forEach: { ...forEach, zone: 'graveyard' } }))]),
      ),
    ).toEqual([expect.stringContaining('permanents on the battlefield')]);
  });

  test('"that player" is the one who cast the spell: the spell of the trigger', () => {
    expect(
      messages(
        creature([
          castTrigger(filter, {
            kind: 'copySpell',
            spell: { kind: 'target', id: 't1' },
            newTargets: 'no',
            forEach,
            copier: 'triggerPlayer',
          }),
        ]),
      ).some((m) => m.includes('the one who cast the spell of the trigger')),
    ).toBe(true);
  });

  test('"they control" needs a trigger about a player: a spell text has none', () => {
    const spell = singleFace({
      name: 'SYNTHETIC Test Copier',
      manaCost: ['1'],
      types: ['instant'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      spell: {
        targets: [
          { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
        ],
        effect: {
          kind: 'copySpell',
          spell: { kind: 'target', id: 't1' },
          newTargets: 'no',
          forEach: { ...forEach, controller: 'triggerPlayer' },
        },
      },
    });
    expect(
      messages(spell).some((m) => m.includes('needs a trigger whose event is about a player')),
    ).toBe(true);
  });
});

describe('exileOnResolve (CR 614.1a)', () => {
  test('the spell whose casting caused the trigger', () => {
    expect(
      validateCard(
        creature([castTrigger({ stackKind: 'spell' }, { kind: 'exileOnResolve', spell: SPELL })]),
      ),
    ).toEqual([]);
  });

  test('not a permanent trigger, and not another object', () => {
    expect(
      messages(
        creature([
          {
            kind: 'triggered',
            trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
            effect: { kind: 'exileOnResolve', spell: SPELL },
          },
        ]),
      ),
    ).toEqual([expect.stringContaining('the triggering object is a permanent here')]);
    expect(
      messages(
        creature([
          castTrigger({ stackKind: 'spell' }, { kind: 'exileOnResolve', spell: { kind: 'this' } }),
        ]),
      ),
    ).toEqual([expect.stringContaining('names the spell that was cast')]);
  });
});
