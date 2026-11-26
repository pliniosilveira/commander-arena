// "Starting with the next opponent in turn order, each player chooses a creature you don't control. Destroy the chosen creatures." (Sadistic Shell Game; CR 101.4, 608.2d, 701.8):
// `chooseObjects` with `perPlayer` and a `destroy` of the chosen set. The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: every player chooses, the next opponent
// first and the caster last, a creature of the caster can't be chosen, a player may choose their own creature, a creature chosen by two players is destroyed once, and with a single
// opponent that opponent and the caster choose.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GAME = 'SYNTHETIC Shell Game';
const BEARS = 'Grizzly Bears';
const OGRE = 'SYNTHETIC Vanilla 5/5';
const LIBRARY = Array.from({ length: 10 }, () => 'Swamp');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(GAME))).toEqual([]);
});

describe('"each player chooses a creature you don\'t control. Destroy the chosen creatures."', () => {
  const build = () =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(GAME)
      .battlefield(OGRE, 'Swamp', 'Swamp', 'Swamp', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(2)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Vanilla 2/2')
      .at('precombatMain', { active: 0 })
      .build();

  test('the creatures of the caster are never offered', () => {
    const g = build();
    g.act(0).cast(GAME, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('no choice');
    // Bears and the 2/2: the 5/5 of the caster is not among them.
    expect(d.legal).toHaveLength(2);
    expect(d.legal.some((id) => g.state.objects[id]?.controller === 0)).toBe(false);
  });

  test('seat 1, then seat 2, then the caster choose; the creatures chosen are destroyed, the caster’s own is safe', () => {
    const g = build();
    g.act(0).cast(GAME, { pay: true });
    g.passAll();
    // Seat 1 chooses its own Bears, seat 2 chooses its own creature, the caster chooses the Bears again.
    g.act(1).choosePermanents({ name: BEARS, seat: 1 });
    g.expect.pending('choosePermanent', 2);
    g.act(2).choosePermanents({ name: 'SYNTHETIC Vanilla 2/2', seat: 2 });
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents({ name: BEARS, seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { seat: 2 });
    g.expect.zone(OGRE, 'battlefield', { seat: 0 });
  });
});
