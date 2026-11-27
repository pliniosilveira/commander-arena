// Undaunted (CR 702.125a): "This spell costs {1} less to cast for each opponent", a cost reduction of the spell itself that `derive-keywords` expands from the keyword.
// Pins: the number of opponents of the caster still in the game (two seats: 1, three seats: 2, four: 3), CR 601.2f (read as the total cost is determined, generic mana
// only) and CR 118.7a (a reduction never goes below zero). Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const WRATH = 'SYNTHETIC Undaunted Wrath'; // {5}{B}{B} sorcery, Undaunted
const wrath = singleFace({
  name: WRATH,
  manaCost: ['5', 'B', 'B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Undaunted\nDraw a card.',
  abilities: [{ kind: 'keyword', keyword: { kind: 'undaunted' } }],
  spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
});

function totalCost(seats: number): readonly string[] {
  let b = scenario({ seats })
    .define(wrath)
    .seat(0)
    .hand(WRATH)
    .battlefield(...Array.from({ length: 7 }, () => 'Swamp'))
    .library('Swamp', 'Swamp');
  for (let s = 1; s < seats; s += 1) b = b.seat(s).library('Swamp', 'Swamp');
  const g = b.build();
  g.act(0).cast(WRATH);
  const d = g.state.pending;
  if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
  return d.totalCost;
}

describe('CR 702.125a: costs {1} less to cast for each opponent', () => {
  test.each([
    [2, ['4', 'B', 'B']],
    [3, ['3', 'B', 'B']],
    [4, ['2', 'B', 'B']],
  ])(
    'with %i seats the generic cost shrinks by the opponents, colored mana does not',
    (seats, cost) => {
      expect(totalCost(seats)).toEqual(cost);
    },
  );
});
