// validateCard for the continuous-effect nodes (setPt, loseAllAbilities, setTypes, setColors,
// grantKeyword, CR 611.2, 613), the `moved` reference (CR 400.7j), `moveToZone.controller` and the
// prowess keyword (CR 702.108). Structural rules come from validateCardStructure, the "can the
// engine run it" rules from validateCard. Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, SUPPORTED_FEATURES } from '../src/ast/features';
import type { Ability, Effect, SpellText, TargetSpec } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

const CREATURE_T1: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
};
const ANY_PERMANENT_T1: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield' } },
};
const T1 = { kind: 'target', id: 't1' } as const;
const END = 'untilEndOfTurn' as const;

function instant(spell: SpellText): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Test Instant',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'test',
    spell,
  });
}

const on = (effect: Effect, target: TargetSpec = CREATURE_T1): CardDefinition =>
  instant({ targets: [target], effect });

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

const structure = (card: CardDefinition) =>
  validateCardStructure(card).map((i) => `${i.path}: ${i.message}`);
const full = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);

function expectIssue(found: readonly string[], fragment: string): void {
  expect(
    found.some((m) => m.includes(fragment)),
    `${fragment} in ${found.join(' | ')}`,
  ).toBe(true);
}

describe('the continuous-effect nodes that are valid and supported', () => {
  const valid: [string, Effect][] = [
    ['setPt', { kind: 'setPt', objects: T1, power: 1, toughness: 1, duration: END }],
    ['loseAllAbilities', { kind: 'loseAllAbilities', objects: T1, duration: END }],
    ['setTypes subtypes', { kind: 'setTypes', objects: T1, subtypes: ['Frog'], duration: END }],
    ['setTypes types', { kind: 'setTypes', objects: T1, types: ['artifact'], duration: END }],
    [
      'setTypes both',
      {
        kind: 'setTypes',
        objects: T1,
        types: ['creature'],
        subtypes: ['Frog'],
        duration: END,
      },
    ],
    ['setColors', { kind: 'setColors', objects: T1, colors: ['U'], duration: END }],
    ['setColors colorless', { kind: 'setColors', objects: T1, colors: [], duration: END }],
    [
      'grantKeyword',
      { kind: 'grantKeyword', objects: T1, keyword: { kind: 'flying' }, duration: END },
    ],
  ];
  test.each(valid)('%s', (_name, effect) => {
    expect(structure(on(effect))).toEqual([]);
    expect(full(on(effect))).toEqual([]);
  });

  test('the registry lists them, and a duration of permanent is still not supported', () => {
    for (const kind of [
      'setPt',
      'loseAllAbilities',
      'setTypes',
      'setColors',
      'grantKeyword',
    ] as const) {
      expect(SUPPORTED_FEATURES.effectKinds).toContain(kind);
      expect(isFeatureSupported(`effect:${kind}`)).toBe(true);
    }
    expect(SUPPORTED_FEATURES.durationKinds).toEqual([
      'untilEndOfTurn',
      'untilYourNextTurn',
      'forAsLongAsYouControlThis',
      'forAsLongAsThisRemains',
    ]);
    const forever: Effect = {
      kind: 'loseAllAbilities',
      objects: T1,
      duration: 'permanent',
    };
    expect(structure(on(forever))).toEqual([]);
    expectIssue(full(on(forever)), 'duration "permanent" is not implemented');
    expect(isFeatureSupported('duration:permanent')).toBe(false);
    expect(isFeatureSupported('selector:moved')).toBe(true);
    expect(isFeatureSupported('keyword:prowess')).toBe(true);
  });
});

describe('the continuous-effect nodes that are refused', () => {
  test('setPt needs integers', () => {
    const e: Effect = { kind: 'setPt', objects: T1, power: 1.5, toughness: 1, duration: END };
    expectIssue(structure(on(e)), 'base power must be an integer');
  });

  test('every node needs a known duration and a declared target', () => {
    const e: Effect = { kind: 'loseAllAbilities', objects: T1, duration: 'forever' as never };
    expectIssue(structure(on(e)), 'unknown duration');
    const undeclared: Effect = {
      kind: 'loseAllAbilities',
      objects: { kind: 'target', id: 'nope' },
      duration: END,
    };
    expectIssue(structure(on(undeclared)), 'target "nope" is not declared');
  });

  test('setTypes needs types or subtypes, valid ones, and creature types only', () => {
    expectIssue(
      structure(on({ kind: 'setTypes', objects: T1, duration: END })),
      'setTypes needs types, subtypes or both',
    );
    expectIssue(
      structure(on({ kind: 'setTypes', objects: T1, types: ['frog' as never], duration: END })),
      'unknown card type',
    );
    expectIssue(
      structure(on({ kind: 'setTypes', objects: T1, subtypes: [], duration: END })),
      'subtypes must be a non-empty list',
    );
    expectIssue(
      structure(on({ kind: 'setTypes', objects: T1, subtypes: ['Desert'], duration: END })),
      'Desert is not a creature type',
    );
    expectIssue(
      structure(
        on({
          kind: 'setTypes',
          objects: T1,
          types: ['artifact'],
          subtypes: ['Frog'],
          duration: END,
        }),
      ),
      'creature subtypes need the creature or kindred card type',
    );
  });

  test('setColors needs real colors without duplicates', () => {
    expectIssue(
      structure(on({ kind: 'setColors', objects: T1, colors: ['X' as never], duration: END })),
      'unknown color',
    );
    expectIssue(
      structure(on({ kind: 'setColors', objects: T1, colors: ['U', 'U'], duration: END })),
      'duplicate color',
    );
  });

  test('grantKeyword grants only keywords without parameters', () => {
    const cost = [{ kind: 'mana', symbols: ['1'] }] as const;
    for (const keyword of [
      { kind: 'cycling', cost },
      { kind: 'ward', cost },
      { kind: 'flash' },
    ] as const) {
      expectIssue(
        structure(on({ kind: 'grantKeyword', objects: T1, keyword, duration: END })),
        'only keywords without parameters can be granted',
      );
    }
  });
});

describe('the moved reference and the owner control option (CR 400.7j, 110.2)', () => {
  const flicker: Effect = {
    kind: 'sequence',
    effects: [
      { kind: 'exile', objects: T1 },
      { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'owner' },
    ],
  };

  test('a flicker is valid and supported for a target that cannot be an Aura', () => {
    expect(structure(on(flicker))).toEqual([]);
    expect(full(on(flicker))).toEqual([]);
  });

  test('moved needs an exile, destroy or moveToZone before it in the sequence', () => {
    const alone: Effect = {
      kind: 'moveToZone',
      objects: { kind: 'moved' },
      to: 'battlefield',
    };
    expectIssue(structure(on(alone)), "'moved' needs an exile, destroy or moveToZone effect");
    const first: Effect = {
      kind: 'sequence',
      effects: [alone, { kind: 'exile', objects: T1 }],
    };
    expectIssue(structure(on(first)), "'moved' needs an exile, destroy or moveToZone effect");
    const afterOther: Effect = {
      kind: 'sequence',
      effects: [{ kind: 'draw', player: { kind: 'you' }, count: 1 }, alone],
    };
    expectIssue(structure(on(afterOther)), "'moved' needs an exile, destroy or moveToZone effect");
  });

  test('moved works after a nested sequence, inside a conditional and as a player reference', () => {
    const nested: Effect = {
      kind: 'sequence',
      effects: [
        { kind: 'sequence', effects: [{ kind: 'exile', objects: T1 }] },
        {
          kind: 'conditional',
          condition: { kind: 'opponentsAtLeast', count: 1 },
          effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'hand' },
        },
        { kind: 'draw', player: { kind: 'ownerOf', of: { kind: 'moved' } }, count: 1 },
      ],
    };
    expect(structure(on(nested))).toEqual([]);
  });

  test("controller is only valid, as 'owner' or 'you', when moving to the battlefield", () => {
    const mine: Effect = {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1 },
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield', controller: 'you' },
      ],
    };
    expect(full(on(mine))).toEqual([]);
    const toHand: Effect = { kind: 'moveToZone', objects: T1, to: 'hand', controller: 'owner' };
    expectIssue(structure(on(toHand)), 'controller is only valid');
    const wrong = {
      kind: 'moveToZone',
      objects: T1,
      to: 'battlefield',
      controller: 'opponent',
    } as unknown as Effect;
    expectIssue(structure(on(wrong)), 'controller is only valid');
  });

  test('a flicker of something that could be an Aura is run: the Aura chooses what it enchants as it returns (CR 303.4f, D-149)', () => {
    expect(full(on(flicker, ANY_PERMANENT_T1))).toEqual([]);
    const enchantments: TargetSpec = {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
    };
    expect(full(on(flicker, enchantments))).toEqual([]);
    // The same sequence is fine for a creature or an artifact.
    const artifacts: TargetSpec = {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } },
    };
    expect(full(on(flicker, artifacts))).toEqual([]);
  });

  test('a moved reference chained through a second move is run too (D-149)', () => {
    const chained: Effect = {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1 },
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'hand' },
        { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield' },
      ],
    };
    expect(full(on(chained, ANY_PERMANENT_T1))).toEqual([]);
  });
});

describe('the prowess keyword', () => {
  test('is valid and supported, with no parameters', () => {
    const card = creature([{ kind: 'keyword', keyword: { kind: 'prowess' } }]);
    expect(structure(card)).toEqual([]);
    expect(full(card)).toEqual([]);
  });

  test('two instances are valid (CR 702.108b)', () => {
    const card = creature([
      { kind: 'keyword', keyword: { kind: 'prowess' } },
      { kind: 'keyword', keyword: { kind: 'prowess' } },
    ]);
    expect(full(card)).toEqual([]);
  });
});
