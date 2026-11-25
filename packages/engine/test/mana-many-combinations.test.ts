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
import { getView, parseManaCost, planPayment } from '../src/index';
import type { ManaColor } from '../src/mana/types';
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
});
