// validateCard (and the supported gate) for the nodes of group 3 of the Galadriel deck: `exchangeControl`, `removeCounters`, `draw` with `reveal`, the amount `dieResult`, the trigger
// `rollsHighest`, the restriction `cantActivateAbilities`, `counterUnlessPays` with `genericAmount`, the copy exceptions `notLegendary` and `startingLoyalty`, the static `crewSaddleBonus`
// and the keyword `buyback`. Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect, SpellText } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  DRAW_REVEAL_REMOVE,
  ENTERS_KICKED_COPY,
  EXCHANGE_ABILITY,
  HIGHEST_DRAWS,
  KICKER_TWO,
  MUTATION_EFFECT,
  MUTATION_TARGETS,
  UPKEEP_ROLL_SCRY,
} from '../src/cards/fixtures/synthetic-galadriel-g3';

const T1 = { kind: 'target', id: 't1' } as const;
const T2 = { kind: 'target', id: 't2' } as const;
const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

const permanent = (
  abilities: readonly Ability[],
  types: ('enchantment' | 'creature')[] = ['enchantment'],
): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Permanent',
    manaCost: ['1'],
    types,
    ...(types.includes('creature') ? { power: 1, toughness: 1 } : {}),
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    abilities,
  });
const spell = (
  text: SpellText,
  type: 'instant' | 'sorcery' = 'instant',
  cost: readonly string[] = ['1'],
): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Test Spell',
    manaCost: cost,
    types: [type],
    colors: [],
    colorIdentity: [],
    oracleText: 'test',
    spell: text,
  });

const full = (card: CardDefinition) => validateCard(card).map((i) => `${i.path}: ${i.message}`);
const has = (found: readonly string[], fragment: string) =>
  expect(
    found.some((m) => m.includes(fragment)),
    `${fragment} in ${found.join(' | ')}`,
  ).toBe(true);

const OBJ = (filter: Record<string, unknown> = {}) =>
  ({ kind: 'object', filter: { zone: 'battlefield', ...filter } }) as const;

describe('exchangeControl (CR 701.12)', () => {
  const swap = (first: unknown, second: unknown): CardDefinition =>
    spell({
      targets: [
        { id: 't1', what: OBJ({ types: ['creature'] }) },
        { id: 't2', what: OBJ({ types: ['creature'] }) },
      ],
      effect: { kind: 'exchangeControl', first, second } as Effect,
    });

  test('the real shapes are valid: this and a target, two targets', () => {
    expect(full(permanent([EXCHANGE_ABILITY]))).toEqual([]);
    expect(full(swap(T1, T2))).toEqual([]);
  });

  test('each side is the permanent with the ability or a target', () => {
    has(full(swap(T1, { kind: 'each', filter: { types: ['creature'] } })), 'names the permanent');
    has(full(swap({ kind: 'moved' }, T2)), 'names the permanent');
    has(full(swap(T1, { kind: 'triggerSubject' })), 'names the permanent');
  });

  test('two different permanents: the same target twice, or this twice, is refused', () => {
    has(full(swap(T1, T1)), 'two different permanents');
    has(
      full(
        permanent([
          {
            kind: 'activated',
            cost: [{ kind: 'tap' }],
            effect: { kind: 'exchangeControl', first: THIS, second: THIS },
          },
        ]),
      ),
      'two different permanents',
    );
  });

  test('a target must be declared', () => {
    has(
      full(
        spell({
          targets: [{ id: 't1', what: OBJ() }],
          effect: { kind: 'exchangeControl', first: T1, second: T2 },
        }),
      ),
      't2',
    );
  });
});

describe('removeCounters (CR 122.1)', () => {
  const remove = (effect: Record<string, unknown>): CardDefinition =>
    permanent([{ kind: 'activated', cost: [{ kind: 'tap' }], effect: effect as Effect }]);

  test('the real shape is valid, with a number and with an amount', () => {
    expect(
      full(remove({ kind: 'removeCounters', objects: THIS, counter: 'loyalty', count: 2 })),
    ).toEqual([]);
    expect(full(DRAW_REVEAL_REMOVE_CARD)).toEqual([]);
  });

  test('it names a counter and a valid amount', () => {
    has(
      full(remove({ kind: 'removeCounters', objects: THIS, counter: '', count: 1 })),
      'counter name',
    );
    has(
      full(remove({ kind: 'removeCounters', objects: THIS, counter: 'loyalty', count: -1 })),
      'non-negative',
    );
  });

  test('"that card\'s mana value" needs a card an earlier effect moved', () => {
    has(
      full(
        remove({
          kind: 'removeCounters',
          objects: THIS,
          counter: 'loyalty',
          count: { kind: 'manaValueOf', of: { kind: 'moved' } },
        }),
      ),
      "'moved'",
    );
  });
});

const DRAW_REVEAL_REMOVE_CARD = singleFace({
  name: 'SYNTHETIC Test Walker',
  manaCost: ['1'],
  types: ['planeswalker'],
  colors: [],
  colorIdentity: [],
  loyalty: 3,
  oracleText: 'test',
  abilities: [DRAW_REVEAL_REMOVE],
});

describe('draw with reveal', () => {
  const draw = (effect: Record<string, unknown>) =>
    permanent([{ kind: 'activated', cost: [{ kind: 'tap' }], effect: effect as Effect }]);

  test('one card, revealed, is valid and makes "that card" readable', () => {
    expect(full(DRAW_REVEAL_REMOVE_CARD)).toEqual([]);
  });

  test('reveal is true with a count of exactly 1 and no "up to"', () => {
    has(full(draw({ kind: 'draw', player: YOU, count: 2, reveal: true })), 'reveal');
    has(full(draw({ kind: 'draw', player: YOU, count: 1, reveal: false })), 'reveal');
    has(full(draw({ kind: 'draw', player: YOU, count: 1, upTo: true, reveal: true })), 'reveal');
    expect(full(draw({ kind: 'draw', player: YOU, count: 1, reveal: true }))).toEqual([]);
  });

  test('without the reveal the drawn card is not "moved" (nothing names it)', () => {
    has(
      full(
        draw({
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: 1 },
            {
              kind: 'removeCounters',
              objects: THIS,
              counter: 'loyalty',
              count: { kind: 'manaValueOf', of: { kind: 'moved' } },
            },
          ],
        }),
      ),
      "'moved'",
    );
  });
});

describe('the amount dieResult and the trigger rollsHighest (CR 706.2)', () => {
  test('the real shapes are valid', () => {
    expect(full(permanent([UPKEEP_ROLL_SCRY, HIGHEST_DRAWS]))).toEqual([]);
  });

  test('the result needs a die rolled earlier in the same sequence', () => {
    const upkeep = (effect: Effect): Ability => ({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      effect,
    });
    has(full(permanent([upkeep({ kind: 'scry', count: { kind: 'dieResult' } })])), 'rollDie');
    has(
      full(
        permanent([
          upkeep({
            kind: 'sequence',
            effects: [
              { kind: 'scry', count: { kind: 'dieResult' } },
              { kind: 'rollDie', sides: 4 },
            ],
          }),
        ]),
      ),
      'rollDie',
    );
    expect(
      full(
        permanent([
          upkeep({
            kind: 'sequence',
            effects: [
              { kind: 'rollDie', sides: 6 },
              { kind: 'draw', player: YOU, count: { kind: 'dieResult' } },
            ],
          }),
        ]),
      ),
    ).toEqual([]);
  });

  test('the trigger names a player relative to the ability', () => {
    for (const who of ['you', 'opponent', 'any'] as const) {
      expect(
        full(
          permanent([
            {
              kind: 'triggered',
              trigger: { kind: 'rollsHighest', who },
              effect: { kind: 'draw', player: YOU, count: 1 },
            },
          ]),
        ),
      ).toEqual([]);
    }
    has(
      full(
        permanent([
          {
            kind: 'triggered',
            trigger: { kind: 'rollsHighest', who: 'them' } as never,
            effect: { kind: 'draw', player: YOU, count: 1 },
          },
        ]),
      ),
      'who',
    );
  });

  test('"that player" is the one who rolled: triggerPlayer is readable', () => {
    expect(
      full(
        permanent([
          {
            kind: 'triggered',
            trigger: { kind: 'rollsHighest', who: 'any' },
            effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('the restriction cantActivateAbilities (CR 602.5)', () => {
  const restrict = (restriction: string, duration: string): CardDefinition =>
    spell({
      targets: [{ id: 't1', what: OBJ() }],
      effect: { kind: 'restrict', objects: T1, restriction, duration } as Effect,
    });

  test('an effect gives it until end of turn', () => {
    expect(full(restrict('cantActivateAbilities', 'untilEndOfTurn'))).toEqual([]);
  });

  test('a static ability does not give it (no static form is built)', () => {
    has(
      full(
        permanent(
          [
            {
              kind: 'static',
              static: { kind: 'restriction', subject: THIS, restriction: 'cantActivateAbilities' },
            },
          ],
          ['creature'],
        ),
      ),
      'cantActivateAbilities',
    );
  });

  test('it does not last longer than the turn', () => {
    has(full(restrict('cantActivateAbilities', 'permanent')), 'duration');
  });
});

describe('counterUnlessPays with a generic amount (CR 118.12a)', () => {
  test('the real shape is valid', () => {
    expect(
      full(
        spell({ x: true, targets: MUTATION_TARGETS, effect: MUTATION_EFFECT }, 'instant', [
          'X',
          'G',
          'U',
        ]),
      ),
    ).toEqual([]);
  });

  const counter = (
    extra: Record<string, unknown>,
    objects: Record<string, unknown> = { kind: 'target', id: 't2' },
  ) =>
    full(
      spell({
        targets: [
          { id: 't2', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'spell' } } },
        ],
        effect: { kind: 'counterUnlessPays', objects, ...extra } as Effect,
      }),
    );

  test('with a generic amount the cost is empty', () => {
    has(counter({ cost: [{ kind: 'mana', symbols: ['1'] }], genericAmount: 2 }), 'cost is empty');
    expect(counter({ cost: [], genericAmount: 2 })).toEqual([]);
  });

  test('without one the cost is a cost, as before', () => {
    has(counter({ cost: [] }), 'cost list is empty');
    expect(counter({ cost: [{ kind: 'mana', symbols: ['3'] }] })).toEqual([]);
  });

  test('a generic amount is for a target spell, not for the spell that triggered a Ward', () => {
    const ward = full(
      permanent(
        [
          {
            kind: 'triggered',
            trigger: {
              kind: 'becomesTarget',
              by: 'opponent',
              what: { types: ['creature'] },
            } as never,
            effect: {
              kind: 'counterUnlessPays',
              objects: { kind: 'triggerSubject' },
              cost: [],
              genericAmount: 2,
            },
          },
        ],
        ['creature'],
      ),
    );
    has(ward, 'generic amount');
  });

  test('the amount is a valid amount', () => {
    has(counter({ cost: [], genericAmount: -1 }), 'non-negative');
  });
});

describe('the copy exceptions notLegendary and startingLoyalty (CR 707.9b)', () => {
  const copy = (token: Record<string, unknown>): CardDefinition =>
    permanent([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'createToken',
          token: { kind: 'copyOf', object: THIS, ...token } as never,
          count: 1,
        },
      },
    ]);

  test('the real shape is valid', () => {
    expect(full(permanent([ENTERS_KICKED_COPY, KICKER_TWO]))).toEqual([]);
    expect(full(copy({ notLegendary: true, startingLoyalty: 1 }))).toEqual([]);
    expect(full(copy({ startingLoyalty: 0 }))).toEqual([]);
  });

  test('notLegendary is true when present, and the loyalty a whole number from 0', () => {
    has(full(copy({ notLegendary: false })), 'notLegendary');
    has(full(copy({ startingLoyalty: -1 })), 'startingLoyalty');
    has(full(copy({ startingLoyalty: 1.5 })), 'startingLoyalty');
  });
});

describe('the static crewSaddleBonus', () => {
  const bonus = (amount: number) =>
    permanent([{ kind: 'static', static: { kind: 'crewSaddleBonus', amount } }], ['creature']);

  test('a positive whole number is valid', () => {
    expect(full(bonus(2))).toEqual([]);
  });

  test('zero, a negative number and a fraction are not', () => {
    for (const n of [0, -1, 1.5]) has(full(bonus(n)), 'bonus');
  });
});

describe('the keyword buyback (CR 702.27a)', () => {
  const buyback = (cost: unknown, type: 'instant' | 'sorcery' | 'creature' = 'sorcery') =>
    singleFace({
      name: 'SYNTHETIC Test Buyback',
      manaCost: ['1'],
      types: [type],
      ...(type === 'creature' ? { power: 1, toughness: 1 } : {}),
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      abilities: [{ kind: 'keyword', keyword: { kind: 'buyback', cost } as never }],
      ...(type === 'creature' ? {} : { spell: { effect: { kind: 'scry', count: 1 } } }),
    });

  test('a mana cost on an instant or a sorcery is valid', () => {
    expect(full(buyback([{ kind: 'mana', symbols: ['2'] }]))).toEqual([]);
    expect(full(buyback([{ kind: 'mana', symbols: ['2'] }], 'instant'))).toEqual([]);
  });

  test('it is on an instant or a sorcery (the card goes to the hand as the spell resolves)', () => {
    has(full(buyback([{ kind: 'mana', symbols: ['2'] }], 'creature')), 'instant or a sorcery');
  });

  test('the cost is mana, with no X, and is not empty', () => {
    has(full(buyback([{ kind: 'payLife', amount: 2 }])), 'mana only');
    has(full(buyback([{ kind: 'mana', symbols: ['X'] }])), 'X in a buyback cost');
    has(full(buyback([])), 'cost');
  });

  test('one buyback only', () => {
    const two = singleFace({
      name: 'SYNTHETIC Test Two Buybacks',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'buyback', cost: [{ kind: 'mana', symbols: ['2'] }] } },
        { kind: 'keyword', keyword: { kind: 'buyback', cost: [{ kind: 'mana', symbols: ['3'] }] } },
      ],
      spell: { effect: { kind: 'scry', count: 1 } },
    });
    has(full(two), 'more than one buyback');
  });
});
