// Validation of the AST nodes of D-095: `countOf` amounts, the additional costs and the alternative
// costs of a face, the `costReduction` static ability, the `controlCommander` condition, and a
// `discard` cost on Ward and on an activated ability (D-007): a node is well-formed
// (validateCardStructure) and executable (validateCard) only as the engine runs it.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type AlternativeCost,
  type CardDefinition,
  type Cost,
  type Effect,
  FEATURE_VALUES,
  type ObjectFilter,
  type SpellText,
  SUPPORTED_FEATURES,
  validateCard,
  validateCardStructure,
} from '../src/index';

const lines = (issues: readonly { path: string; message: string }[]) =>
  issues.map((i) => `${i.path}: ${i.message}`);

function spell(options: {
  readonly additionalCosts?: readonly Cost[];
  readonly alternativeCosts?: readonly AlternativeCost[];
  readonly abilities?: readonly Ability[];
  readonly effect?: Effect;
  readonly spell?: SpellText;
}): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: '',
    ...(options.abilities === undefined ? {} : { abilities: options.abilities }),
    ...(options.additionalCosts === undefined ? {} : { additionalCosts: options.additionalCosts }),
    ...(options.alternativeCosts === undefined
      ? {}
      : { alternativeCosts: options.alternativeCosts }),
    spell: options.spell ?? {
      effect: options.effect ?? { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  });
}
const structural = (c: CardDefinition) => lines(validateCardStructure(c));
const runnable = (c: CardDefinition) => lines(validateCard(c));

const SACRIFICE: Cost = { kind: 'sacrifice', what: { types: ['creature'] } };
const DISCARD: Cost = { kind: 'discard', count: 1 };

describe('countOf amounts', () => {
  const gain = (amount: unknown): Effect =>
    ({ kind: 'gainLife', player: { kind: 'you' }, amount }) as Effect;

  test('a filter in any zone is a count, in every place an amount is read', () => {
    for (const filter of [
      { types: ['creature'] },
      { types: ['land'], controller: 'you' },
      { zone: 'hand', controller: 'you' },
      { zone: 'graveyard', types: ['creature'] },
      { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }], controller: 'you' },
    ] as ObjectFilter[]) {
      const amount = { kind: 'countOf', filter };
      expect(runnable(spell({ effect: gain(amount) })), JSON.stringify(filter)).toEqual([]);
    }
    const amount = { kind: 'countOf', filter: { types: ['creature'] } };
    for (const effect of [
      { kind: 'draw', player: { kind: 'you' }, count: amount },
      { kind: 'discard', player: { kind: 'you' }, count: amount },
      { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount },
      { kind: 'dealDamage', amount, to: { kind: 'eachOpponent' } },
      { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: amount },
    ] as Effect[]) {
      expect(runnable(spell({ effect })), effect.kind).toEqual([]);
    }
  });

  test('a missing or malformed filter is refused', () => {
    expect(structural(spell({ effect: gain({ kind: 'countOf' }) }))).toEqual([
      'faces[0].spell.effect.amount.filter: countOf needs a filter',
    ]);
    expect(
      structural(spell({ effect: gain({ kind: 'countOf', filter: { zone: 'moon' } }) })),
    ).toEqual(['faces[0].spell.effect.amount.filter.zone: unknown zone "moon"']);
  });

  test('`owner` is not read in a count', () => {
    const c = spell({
      effect: gain({
        kind: 'countOf',
        filter: { zone: 'graveyard', owner: { kind: 'you' } },
      }),
    });
    expect(structural(c)).toEqual([
      expect.stringContaining('faces[0].spell.effect.amount.filter.owner: owner is only read'),
    ]);
  });

  test('the features list it', () => {
    expect(SUPPORTED_FEATURES.amountKinds).toContain('countOf');
    expect(FEATURE_VALUES.amount).toContain('countOf');
  });
});

describe('additional costs to cast (CR 118.8, 601.2f-h)', () => {
  test('a sacrifice, a discard, life and mana are executable, alone and together', () => {
    for (const costs of [
      [SACRIFICE],
      [DISCARD],
      [{ kind: 'discard', count: 2 }],
      [{ kind: 'payLife', amount: 3 }],
      [{ kind: 'mana', symbols: ['1'] }],
      [SACRIFICE, DISCARD],
      [{ kind: 'sacrifice', what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] } }],
      [
        { kind: 'sacrifice', what: { types: ['land'] } },
        { kind: 'payLife', amount: 2 },
      ],
    ] as Cost[][]) {
      expect(runnable(spell({ additionalCosts: costs })), JSON.stringify(costs)).toEqual([]);
    }
  });

  test('"sacrifice this", two sacrifices, two discards and an empty list are refused', () => {
    expect(
      structural(spell({ additionalCosts: [{ kind: 'sacrifice', what: { kind: 'this' } }] })),
    ).toEqual([expect.stringContaining('cannot sacrifice itself')]);
    expect(structural(spell({ additionalCosts: [SACRIFICE, SACRIFICE] }))).toEqual([
      expect.stringContaining('more than one sacrifice cost'),
    ]);
    expect(structural(spell({ additionalCosts: [DISCARD, DISCARD] }))).toEqual([
      expect.stringContaining('more than one discard cost'),
    ]);
    expect(structural(spell({ additionalCosts: [] }))).toEqual([
      expect.stringContaining('non-empty list'),
    ]);
  });

  test('"pay X life" has its own cost; an {X} in an additional mana cost is refused', () => {
    expect(structural(spell({ additionalCosts: [{ kind: 'mana', symbols: ['X'] }] }))).toEqual([
      expect.stringContaining('an {X} in an additional mana cost is not supported'),
    ]);
    expect(structural(spell({ additionalCosts: [{ kind: 'payXLife' }] }))).toEqual([]);
    // `payLife` takes a number, or (D-135) an amount that reads the game now: "pay X life" is `payXLife` (D-103), and
    // an X is refused here whatever it says.
    expect(
      structural(
        spell({
          additionalCosts: [{ kind: 'payLife', amount: { kind: 'x' } as unknown as number }],
        }),
      ),
    ).toEqual([expect.stringContaining('a life payment reads what the game says now')]);
    expect(structural(spell({ additionalCosts: [{ kind: 'payLife', amount: 0 }] }))).toEqual([
      expect.stringContaining('life paid must be at least 1'),
    ]);
  });

  test('costs a spell cannot have as an additional cost are refused as structure', () => {
    for (const cost of [
      { kind: 'tap' },
      { kind: 'untap' },
      { kind: 'discardThis' },
      { kind: 'removeCounters', counter: 'x', count: 1 },
      { kind: 'tapCreatures', totalPower: 2 },
    ] as Cost[]) {
      expect(structural(spell({ additionalCosts: [cost] })), cost.kind).toEqual([
        expect.stringContaining('is not an additional cost a spell can have'),
      ]);
    }
  });

  test('the sacrifice filter is a permanent the caster controls (CR 701.21a)', () => {
    expect(
      structural(
        spell({
          additionalCosts: [
            { kind: 'sacrifice', what: { types: ['creature'], controller: 'opponent' } },
          ],
        }),
      ),
    ).toEqual([expect.stringContaining('only sacrifice permanents they control')]);
    expect(
      structural(spell({ additionalCosts: [{ kind: 'sacrifice', what: { zone: 'graveyard' } }] })),
    ).toEqual([expect.stringContaining('on the battlefield')]);
  });

  test('a discard of nothing is malformed', () => {
    expect(structural(spell({ additionalCosts: [{ kind: 'discard', count: 0 }] }))).toEqual([
      expect.stringContaining('discard count must be a positive integer'),
    ]);
  });
});

describe('alternative costs (CR 118.9)', () => {
  test('free, with and without a condition, is executable', () => {
    expect(runnable(spell({ alternativeCosts: [{ kind: 'free' }] }))).toEqual([]);
    expect(
      runnable(
        spell({ alternativeCosts: [{ kind: 'free', condition: { kind: 'controlCommander' } }] }),
      ),
    ).toEqual([]);
    expect(
      runnable(
        spell({
          alternativeCosts: [
            {
              kind: 'free',
              condition: {
                kind: 'and',
                terms: [
                  { kind: 'controlCommander' },
                  { kind: 'not', term: { kind: 'opponentsAtLeast', count: 3 } },
                ],
              },
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  test('two, an unknown kind and a malformed condition are refused', () => {
    expect(structural(spell({ alternativeCosts: [{ kind: 'free' }, { kind: 'free' }] }))).toEqual([
      expect.stringContaining('more than one alternative cost'),
    ]);
    expect(
      structural(spell({ alternativeCosts: [{ kind: 'sacrificeInstead' } as never] })),
    ).toEqual([expect.stringContaining('unknown alternative cost')]);
    expect(
      structural(
        spell({ alternativeCosts: [{ kind: 'free', condition: { kind: 'moonPhase' } as never }] }),
      ),
    ).toEqual([expect.stringContaining('unknown condition')]);
    expect(structural(spell({ alternativeCosts: [] }))).toEqual([
      expect.stringContaining('non-empty list'),
    ]);
  });

  test('the features list free, and the condition', () => {
    expect(SUPPORTED_FEATURES.castAlternatives).toContain('free');
    expect(SUPPORTED_FEATURES.conditionKinds).toContain('controlCommander');
    expect(FEATURE_VALUES.condition).toContain('controlCommander');
  });
});

describe('the controlCommander condition', () => {
  test('is valid in a conditional effect, an entering replacement and an intervening "if"', () => {
    const cond = { kind: 'controlCommander' } as const;
    expect(
      runnable(
        spell({
          effect: {
            kind: 'conditional',
            condition: cond,
            effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 4 },
          },
        }),
      ),
    ).toEqual([]);
    const land = singleFace({
      name: 'SYNTHETIC Validation Land',
      manaCost: null,
      types: ['land'],
      colors: [],
      colorIdentity: [],
      oracleText: '',
      abilities: [{ kind: 'replacement', replacement: { kind: 'entersTapped', unless: cond } }],
    });
    expect(runnable(land)).toEqual([]);
  });

  test('on a "dies" trigger it reads the battlefield as it is, which looks back in time: refused', () => {
    const c = singleFace({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: '',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          interveningIf: { kind: 'controlCommander' },
          effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        },
      ],
    });
    expect(runnable(c)).toEqual([expect.stringContaining('CR 603.10a')]);
  });
});

describe('the costReduction static ability (CR 118.7, 601.2f)', () => {
  const reducer = (
    spells: unknown,
    amount: unknown,
    types: ('artifact' | 'sorcery')[] = ['artifact'],
  ) =>
    singleFace({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['2'],
      types,
      colors: [],
      colorIdentity: [],
      oracleText: '',
      ...(types.includes('sorcery')
        ? { spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } as Effect } }
        : {}),
      abilities: [
        { kind: 'static', static: { kind: 'costReduction', spells, amount } } as unknown as Ability,
      ],
    });

  test('"this" with a count, a filter with a number, and a filter with a count are executable', () => {
    const creatures = { kind: 'countOf', filter: { types: ['creature'] } };
    expect(runnable(reducer({ kind: 'this' }, creatures, ['sorcery']))).toEqual([]);
    expect(runnable(reducer({ kind: 'this' }, 2, ['sorcery']))).toEqual([]);
    expect(runnable(reducer({ types: ['artifact'], controller: 'you' }, 1))).toEqual([]);
    expect(
      runnable(
        reducer(
          { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }], controller: 'you' },
          creatures,
        ),
      ),
    ).toEqual([]);
    expect(runnable(reducer({}, 1))).toEqual([]);
  });

  test('the amount is a positive number or a count, nothing else', () => {
    expect(structural(reducer({ types: ['artifact'] }, 0))).toEqual([
      expect.stringContaining('positive integer'),
    ]);
    expect(structural(reducer({ types: ['artifact'] }, -1))).toEqual([
      expect.stringContaining('positive integer'),
    ]);
    expect(structural(reducer({ types: ['artifact'] }, { kind: 'x' }))).toEqual([
      expect.stringContaining('a cost reduction reads what the game says now'),
    ]);
    // D-420: the power of the permanent with the ability is read as the cost is determined; the power of anything else is not.
    expect(
      structural(
        reducer({ types: ['artifact'] }, { kind: 'powerOf', of: { kind: 'target', id: 't1' } }),
      ),
    ).toEqual([expect.stringContaining('a cost reduction reads what the game says now')]);
    expect(
      structural(reducer({ types: ['artifact'] }, { kind: 'powerOf', of: { kind: 'this' } })),
    ).toEqual([]);
    expect(
      structural(reducer({ kind: 'this' } as never, { kind: 'powerOf', of: { kind: 'this' } })),
    ).toEqual([expect.stringContaining('a cost reduction reads what the game says now')]);
  });

  test('the filter describes a spell being cast: no zone, no stack kind, no owner', () => {
    expect(structural(reducer({ zone: 'hand' }, 1))).toEqual([
      expect.stringContaining('zone and stackKind are not set'),
    ]);
    expect(structural(reducer({ stackKind: 'spell' }, 1))).toEqual([
      expect.stringContaining('zone and stackKind are not set'),
    ]);
    expect(structural(reducer({ owner: { kind: 'you' } }, 1))).toEqual([
      expect.stringContaining('owner is only read'),
    ]);
  });

  test('the features list it', () => {
    expect(SUPPORTED_FEATURES.staticKinds).toContain('costReduction');
    expect(FEATURE_VALUES.static).toContain('costReduction');
  });
});

describe('a discard cost on Ward and on an activated ability', () => {
  const creature = (...abilities: Ability[]) =>
    singleFace({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: '',
      abilities,
    });
  const activated = (cost: Cost[], functionsIn?: 'hand'): Ability => ({
    kind: 'activated',
    cost,
    ...(functionsIn === undefined ? {} : { functionsIn }),
    effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
  });

  test('Ward—Discard a card is executable, alone and with mana or life', () => {
    for (const cost of [
      [DISCARD],
      [DISCARD, { kind: 'mana', symbols: ['1'] }],
      [DISCARD, { kind: 'payLife', amount: 2 }],
    ] as Cost[][]) {
      const ward: Ability = { kind: 'keyword', keyword: { kind: 'ward', cost } };
      expect(runnable(creature(ward)), JSON.stringify(cost)).toEqual([]);
    }
  });

  test('"counter unless its controller discards" is executable too', () => {
    const counter = singleFace({
      name: 'SYNTHETIC Validation Probe',
      manaCost: ['U'],
      types: ['instant'],
      colors: ['U'],
      colorIdentity: ['U'],
      oracleText: '',
      spell: {
        targets: [{ id: 't1', what: { kind: 'object', filter: { stackKind: 'spell' } } }],
        effect: {
          kind: 'counterUnlessPays',
          objects: { kind: 'target', id: 't1' },
          cost: [DISCARD],
        },
      },
    });
    expect(runnable(counter)).toEqual([]);
  });

  test('a discard in Cycling and Equip costs is not executable (they pay mana and life only)', () => {
    const cycling: Ability = { kind: 'keyword', keyword: { kind: 'cycling', cost: [DISCARD] } };
    expect(runnable(creature(cycling))).toEqual([expect.stringContaining('cost "discard"')]);
    const equip: Ability = { kind: 'keyword', keyword: { kind: 'equip', cost: [DISCARD] } };
    expect(runnable(creature(equip))).toEqual([expect.stringContaining('cost "discard"')]);
  });

  test('an activated ability may discard cards, once, and not from the hand', () => {
    expect(runnable(creature(activated([DISCARD])))).toEqual([]);
    expect(
      runnable(creature(activated([{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }, DISCARD]))),
    ).toEqual([]);
    expect(runnable(creature(activated([DISCARD, DISCARD])))).toEqual([
      expect.stringContaining('more than one discard cost'),
    ]);
    expect(structural(creature(activated([DISCARD], 'hand')))).toEqual([
      expect.stringContaining('cannot cost discard'),
    ]);
  });

  test('crew alone: a discard beside it is not executable', () => {
    expect(
      runnable(creature(activated([{ kind: 'tapCreatures', totalPower: 2 }, DISCARD]))),
    ).toEqual([expect.stringContaining('creature-tapping')]);
  });
});
