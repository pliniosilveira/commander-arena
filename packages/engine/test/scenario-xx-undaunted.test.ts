// Undaunted (CR 702.125): "This spell costs {1} less to cast for each opponent you have", a static ability of the spell itself that `derive-keywords` expands from the keyword
// into a cost reduction by `opponentCount`. Pins: CR 702.125a (generic mana only, counted for the caster as the cost is determined), CR 702.125b (a player who has left the game is
// not an opponent), CR 702.125c (every instance applies), CR 118.7a (never below zero, never colored mana), CR 102.2 (every other player is an opponent: three and four seats).
// The cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { getLegalActions, singleFaceCard } from './dsl-helpers';

const UNDAUNTED = 'SYNTHETIC Undaunted Sorcery'; // {6}{G} sorcery, Undaunted
const TWICE = 'SYNTHETIC Doubly Undaunted Sorcery'; // {6}{G} sorcery, Undaunted twice
const CHEAP = 'SYNTHETIC Cheap Undaunted Sorcery'; // {1}{G} sorcery, Undaunted

const sorcery = (name: string, cost: string[], instances: number) =>
  singleFaceCard({
    name,
    manaCost: cost,
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Undaunted (This spell costs {1} less to cast for each opponent.)',
    abilities: Array.from({ length: instances }, () => ({
      kind: 'keyword' as const,
      keyword: { kind: 'undaunted' as const },
    })),
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  });

const CARDS = [
  sorcery(UNDAUNTED, ['6', 'G'], 1),
  sorcery(TWICE, ['6', 'G'], 2),
  sorcery(CHEAP, ['1', 'G'], 1),
];

function build(seats: 2 | 3 | 4, card: string, lands: number) {
  let b = scenario({ seats });
  for (const c of CARDS) b = b.define(c);
  b = b
    .seat(0)
    .hand(card)
    .battlefield('Forest', { count: lands })
    .at('precombatMain', { active: 0, turn: 1 });
  return b.build();
}

describe('CR 702.125a: costs {1} less for each opponent you have', () => {
  for (const [seats, generic] of [
    [2, '5'],
    [3, '4'],
    [4, '3'],
  ] as const) {
    test(`with ${seats - 1} opponent(s) {6}{G} costs {${generic}}{G}`, () => {
      const g = build(seats, UNDAUNTED, 7);
      g.act(0).cast(UNDAUNTED);
      const d = g.state.pending;
      if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
      expect(d.totalCost).toEqual([generic, 'G']);
      g.act(0).payAuto();
      g.expect.stack([UNDAUNTED]);
    });
  }

  test('it is cast with exactly the reduced mana: five lands are enough against two opponents, not against one', () => {
    const castable = (g: ReturnType<typeof build>) =>
      getLegalActions(g.state, 0).some(
        (a) => a.kind === 'castSpell' && g.state.objects[a.object] === g.object(UNDAUNTED),
      );
    // {6}{G} less {2} is five mana; less {1} is six.
    expect(castable(build(3, UNDAUNTED, 5))).toBe(true);
    expect(castable(build(2, UNDAUNTED, 5))).toBe(false);
    expect(castable(build(2, UNDAUNTED, 6))).toBe(true);
    expect(castable(build(3, UNDAUNTED, 4))).toBe(false);
  });

  test('a player who has left the game is not an opponent (CR 702.125b)', () => {
    let b = scenario({ seats: 4 });
    for (const c of CARDS) b = b.define(c);
    const g = b
      .seat(0)
      .hand(UNDAUNTED, 'Forest')
      .battlefield('Forest', { count: 7 })
      .seat(2)
      .life(0)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    // Seat 2 loses to the state-based actions that follow the first action (CR 704.5a).
    g.act(0).playLand('Forest');
    g.expect.hasLost(2);
    g.act(0).cast(UNDAUNTED);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    // Two opponents are left: {6}{G} less {2}.
    expect(d.totalCost).toEqual(['4', 'G']);
  });

  test('two instances each apply (CR 702.125c)', () => {
    const g = build(3, TWICE, 7);
    g.act(0).cast(TWICE);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.totalCost).toEqual(['2', 'G']);
  });

  test('only generic mana is reduced: {1}{G} with three opponents costs {G} (CR 118.7a)', () => {
    const g = build(4, CHEAP, 1);
    g.act(0).cast(CHEAP);
    const d = g.state.pending;
    if (d?.kind === 'payMana') {
      expect(d.totalCost).toEqual(['G']);
    } else {
      throw new Error(`expected payMana, got ${d?.kind}`);
    }
  });
});
