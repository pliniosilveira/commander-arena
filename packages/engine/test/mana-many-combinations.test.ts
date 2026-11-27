// Issue 632: "Add X mana in any combination of colors" (CR 106.1b, 605.3b) has one outcome per multiset of X of the five colors, C(X + 4, 4)
// of them. What a land could produce (CR 106.7) and the payment planner (SPEC 4.2) must not grow with that number: a late board of the
// Dance of the Elements precon (Selvala, Heart of the Wilds beside a big creature, tri-lands, Chromatic Lantern) stalled the view for
// seconds and took gigabytes.
// SYNTHETIC Wild Heart is defined here, after Selvala's mana ability ("{G}, {T}: Add X mana in any combination of colors, where X is the
// greatest power among creatures you control"); it is not a real card. SYNTHETIC Tri Land and SYNTHETIC Prism Lantern are the engine's
// synthetic fixtures (src/cards/fixtures/synthetic-mana.ts, synthetic-mana-plus.ts); Grizzly Bears, Forest and Plains are real fixtures.
// The payment sources of the planner test are SYNTHETIC too (test/mana-fixtures.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { PaymentPlan } from '../src/index';
import { getView, parseManaCost, planPayment } from '../src/index';
import type { ManaColor } from '../src/mana/types';
import {
  combinationCount,
  MAX_LISTED_COMBINATIONS,
  representativeCombinations,
} from '../src/rules/mana-outcomes';
import { scenario } from '../src/testing/index';
import { land, oid, source } from './mana-fixtures';

const WILD_HEART = 'SYNTHETIC Wild Heart';
const TRI = 'SYNTHETIC Tri Land';
const LANTERN = 'SYNTHETIC Prism Lantern';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const wildHeart = singleFace({
  name: WILD_HEART,
  manaCost: ['1', 'G', 'G'],
  types: ['creature'],
  subtypes: ['Elf', 'Scout'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 3,
  oracleText:
    '{G}, {T}: Add X mana in any combination of colors, where X is the greatest power among creatures you control.',
  abilities: [
    {
      kind: 'mana',
      cost: [{ kind: 'mana', symbols: ['G'] }, { kind: 'tap' }],
      production: {
        kind: 'anyCombinationAmount',
        amount: {
          kind: 'aggregate',
          how: 'greatest',
          stat: 'power',
          filter: { types: ['creature'], controller: 'you' },
        },
      },
    },
  ],
});

/** Seat 0 has the Wild Heart, a Grizzly Bears with `counters` +1/+1 counters (so X is 2 + counters), six tri-lands and the Lantern. */
const game = (counters: number) =>
  scenario()
    .define(wildHeart)
    .seat(0)
    .battlefield(WILD_HEART)
    .battlefield(BEARS, { counters: { '+1/+1': counters } })
    .battlefield(LANTERN, TRI, TRI, TRI, TRI, TRI, TRI)
    .library(...LIBRARY)
    .seat(1)
    .battlefield('Forest')
    .library(...LIBRARY)
    .at('precombatMain')
    .build();

describe('what a land could produce beside a big "any combination" source (CR 106.7)', () => {
  test('X = 202: the tri-lands could produce every color, read without listing the combinations', () => {
    // C(206, 4) is about 72 million combinations of 202 mana: listing them does not end in a test's time or memory.
    const view = getView(game(200).state, 0);
    const tris = view.battlefield.filter((o) => o.name === TRI);
    expect(tris).toHaveLength(6);
    for (const tri of tris) expect(tri.landMana).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(view.battlefield.find((o) => o.name === 'Forest')?.landMana).toEqual(['G']);
  }, 10_000);
});

/** Every multiset of `count` of the five colors, in the order the engine lists "any combination" outcomes (W, U, B, R, G; never going back). */
function combinations(count: number): ManaColor[][] {
  const colors: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];
  const out: ManaColor[][] = [];
  const build = (from: number, picked: ManaColor[]): void => {
    if (picked.length === count) {
      out.push([...picked]);
      return;
    }
    for (let i = from; i < colors.length; i += 1) build(i, [...picked, colors[i] as ManaColor]);
  };
  build(0, []);
  return out;
}

describe('the payment planner beside a big "any combination" source (SPEC 4.2)', () => {
  test('X = 20: {2}{G}{G}{R} is paid with the first combination that can pay it, without trying all 10626', () => {
    const outcomes = combinations(20);
    expect(outcomes).toHaveLength(10626);
    // A Forest pays the {G} of the Wild Heart; the two other lands cannot pay {2}{G}{G}{R} on their own, so the Wild Heart is tapped.
    const plan = planPayment({
      cost: parseManaCost(['2', 'G', 'G', 'R']),
      x: 0,
      pool: [],
      lifeAvailable: 0,
      spell: { types: ['sorcery'] },
      sources: [
        land(1, 'G'),
        source(2, [['B'], ['R'], ['G']]),
        source(3, outcomes, { tier: 'creature', cost: parseManaCost(['G']) }),
        source(4, [['W'], ['U'], ['B']]),
      ],
    });
    // Every combination leaves 15 mana over, so the tie goes to the first one (preference 11): seventeen {W}, {R}, {G}, {G}, the {W}
    // paying the {2}.
    const first = outcomes.findIndex((o) => o.join('') === `${'W'.repeat(17)}RGG`);
    expect(plan?.taps).toEqual([
      { object: oid(1), abilityIndex: 0, outcome: 0 },
      { object: oid(3), abilityIndex: 0, outcome: first },
    ]);
    expect(plan?.spentColors).toEqual(['W', 'W', 'R', 'G', 'G']);
    expect(plan?.leftover.map((m) => m.color)).toEqual(Array.from({ length: 15 }, () => 'W'));
  }, 3_000);

  test('X = 45: a source with more combinations than one call takes as arguments (211876) is planned', () => {
    // A tuning run crashed with "Maximum call stack size exceeded": the planner spread every outcome of a source into one call.
    const outcomes = combinations(45);
    expect(outcomes).toHaveLength(211876);
    const plan = planPayment({
      cost: parseManaCost(['1', 'G']),
      x: 0,
      pool: [],
      lifeAvailable: 0,
      spell: { types: ['sorcery'] },
      sources: [
        land(1, 'G'),
        source(2, outcomes, { tier: 'creature', cost: parseManaCost(['G']) }),
      ],
    });
    // The Forest pays the {G} of the source, whose first combination with a {G} (forty-four {W} and a {G}) pays {1}{G}.
    const first = outcomes.findIndex((o) => o.join('') === `${'W'.repeat(44)}G`);
    expect(plan?.taps).toEqual([
      { object: oid(1), abilityIndex: 0, outcome: 0 },
      { object: oid(2), abilityIndex: 0, outcome: first },
    ]);
  }, 10_000);
});

describe('a source with more combinations than are listed (issue 632)', () => {
  const lazy = (n: number, count: number, opts = {}) =>
    source(n, representativeCombinations(count), { anyCombination: count, ...opts });

  test('the listed combinations are a few, each of X mana of the five colors', () => {
    expect(combinationCount(8)).toBeLessThanOrEqual(MAX_LISTED_COMBINATIONS);
    expect(combinationCount(9)).toBeGreaterThan(MAX_LISTED_COMBINATIONS);
    const listed = representativeCombinations(47);
    // Five of one color, ten pairs split evenly and the five colors split evenly.
    expect(listed).toHaveLength(16);
    for (const c of listed) expect(c).toHaveLength(47);
    expect(listed[0]?.join('')).toBe('W'.repeat(47));
    expect(listed.at(-1)?.join('')).toBe(
      `${'W'.repeat(10)}${'U'.repeat(10)}${'B'.repeat(9)}${'R'.repeat(9)}${'G'.repeat(9)}`,
    );
    expect(new Set(listed.map((c) => c.join(''))).size).toBe(16);
  });

  /** The plan as far as it matters: what is tapped, what is spent on the colors the cost names, and how much is left over. */
  const shape = (plan: PaymentPlan | null, colors: readonly ManaColor[]) =>
    plan === null
      ? null
      : {
          taps: plan.taps.map((t) => t.object),
          spent: plan.spentColors.length,
          colored: colors.map((c) => plan.spentColors.filter((m) => m === c).length),
          leftover: plan.leftover.length,
          life: plan.lifePaid,
        };

  const COSTS = [
    ['2', 'G', 'G', 'R'],
    ['W', 'U', 'B', 'R', 'G'],
    ['3'],
    ['G', 'G', 'G', 'G'],
    ['1', 'W', 'W', 'U', 'U'],
    ['R', 'R', 'G'],
    ['9'],
    ['6', 'B'],
  ];
  const OTHERS: { name: string; sources: () => ReturnType<typeof land>[] }[] = [
    { name: 'alone', sources: () => [] },
    { name: 'beside a Forest', sources: () => [land(1, 'G')] },
    {
      name: 'beside lands of three colors',
      sources: () => [land(1, 'G'), land(3, 'R'), source(4, [['W'], ['U']])],
    },
  ];

  for (const count of [4, 7, 9, 12]) {
    test(`X = ${count}: the plans are as good as with every combination listed`, () => {
      const all = combinations(count);
      for (const cost of COSTS) {
        const colors: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];
        for (const other of OTHERS) {
          for (const costed of [false, true]) {
            const opts = costed ? { tier: 'creature' as const, cost: parseManaCost(['G']) } : {};
            const request = (heart: ReturnType<typeof source>) => ({
              cost: parseManaCost(cost),
              x: 0,
              pool: [],
              lifeAvailable: 0,
              spell: { types: ['sorcery'] },
              sources: [...other.sources(), heart],
            });
            const full = planPayment(request(source(2, all, opts)));
            const few = planPayment(request(lazy(2, count, opts)));
            expect(shape(few, colors), `${cost.join('')} ${other.name} ${costed}`).toEqual(
              shape(full, colors),
            );
          }
        }
      }
    }, 60_000);
  }

  test('X = 47: {2}{G}{G}{R} and a five-color cost are planned at once', () => {
    const started = performance.now();
    const plan = planPayment({
      cost: parseManaCost(['2', 'G', 'G', 'R']),
      x: 0,
      pool: [],
      lifeAvailable: 0,
      spell: { types: ['sorcery'] },
      sources: [land(1, 'G'), lazy(2, 47, { tier: 'creature', cost: parseManaCost(['G']) })],
    });
    expect(plan?.taps.map((t) => t.object)).toEqual([oid(1), oid(2)]);
    expect(plan?.spentColors.filter((c) => c === 'G')).toHaveLength(2);
    expect(plan?.spentColors.filter((c) => c === 'R')).toHaveLength(1);
    expect(plan?.spentColors).toHaveLength(5);
    expect(plan?.leftover).toHaveLength(42);
    const five = planPayment({
      cost: parseManaCost(['W', 'U', 'B', 'R', 'G']),
      x: 0,
      pool: [],
      lifeAvailable: 0,
      spell: { types: ['sorcery'] },
      sources: [lazy(2, 47)],
    });
    expect([...(five?.spentColors ?? [])].sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
    expect(five?.leftover).toHaveLength(42);
    expect(performance.now() - started).toBeLessThan(2_000);
  }, 10_000);

  test('X = 47 against a cost its colors cannot pay is not planned', () => {
    const plan = planPayment({
      cost: parseManaCost(['48']),
      x: 0,
      pool: [],
      lifeAvailable: 0,
      spell: { types: ['sorcery'] },
      sources: [lazy(2, 47)],
    });
    expect(plan).toBeNull();
  });
});

describe('a real "any combination" source with X = 47 (issue 632)', () => {
  /** Seat 0: the Wild Heart beside a Grizzly Bears of 47 power (X = 47), a Forest and, in hand, another Grizzly Bears. */
  const big = (hand: readonly string[] = []) =>
    scenario()
      .define(wildHeart)
      .seat(0)
      .hand(...hand)
      .battlefield(WILD_HEART)
      .battlefield(BEARS, { counters: { '+1/+1': 45 } })
      .battlefield('Forest')
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Plains')
      .library(...LIBRARY)
      .at('precombatMain')
      .build();

  test('the view, the legal actions and a priority pass do not weigh every combination', () => {
    const g = big();
    const started = performance.now();
    getView(g.state, 0);
    g.legalActions(0);
    expect(performance.now() - started).toBeLessThan(2_000);
  }, 10_000);

  test('it lists a few combinations to choose, each of 47 mana', () => {
    const g = big();
    // Its {G} cost is paid from the pool: with no mana in it, it is not on offer.
    g.act(0).tapForMana('Forest');
    const listed = g
      .legalActions(0)
      .flatMap((a) =>
        a.kind === 'activateAbility' && a.source === g.id(WILD_HEART) && a.combination
          ? [a.combination]
          : [],
      );
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.length).toBeLessThanOrEqual(16);
    for (const c of listed) expect(c).toHaveLength(47);
  });

  test('a combination that is not listed is accepted when it is X mana of the five colors', () => {
    const g = big();
    g.act(0).tapForMana('Forest');
    const chosen = `${'R'.repeat(40)}${'G'.repeat(7)}`;
    g.act(0).tapForMana(WILD_HEART, { combination: chosen });
    g.expect.pool(0, chosen);
    g.expect.tapped(WILD_HEART);
  });

  test('a combination of another size, or with colorless mana, is refused', () => {
    const g = big();
    g.act(0).tapForMana('Forest');
    const short = g.act(0).try.tapForMana(WILD_HEART, { combination: 'RRGG' });
    expect(short.ok).toBe(false);
    const colorless = g.act(0).try.tapForMana(WILD_HEART, {
      combination: `${'R'.repeat(46)}C`,
    });
    expect(colorless.ok).toBe(false);
    g.expect.tapped(WILD_HEART, false);
  });

  test('a spell is paid with it by the planner, the rest of the mana stays in the pool', () => {
    const g = big([BEARS]);
    const started = performance.now();
    g.act(0).cast(BEARS, { pay: true });
    expect(performance.now() - started).toBeLessThan(2_000);
    g.expect.tapped(WILD_HEART);
    g.expect.tapped('Forest');
    // {1}{G} of the 47 mana: 45 stay in the pool.
    expect(g.state.seats[0]?.manaPool).toHaveLength(45);
  }, 10_000);
});
