// "Whenever a source you control deals noncombat damage to an opponent, if there are four or more card types among cards in your graveyard, ~ deals that amount of damage to target creature
// that player controls" (Fear of Burning Alive; CR 120.2b, 603.2, 603.4, 109.4): `noncombatDamageDealt` with a target of the damaged player's creatures (`controller: 'triggerPlayer'`),
// `triggerDamage` and an intervening "if" of `cardTypesAmong`. The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: the amount is the damage dealt, the condition is
// read as the damage is dealt, only a creature of the damaged player can be the target, and with 3 seats the other opponent's creatures are not.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const REPRISAL = 'SYNTHETIC Burning Reprisal';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 2/2';
const FOUR_TYPES = ['Grizzly Bears', 'Forest', 'Sol Ring', 'SYNTHETIC Drain One'];
const LIBRARY = Array.from({ length: 12 }, () => 'Forest');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(REPRISAL))).toEqual([]);
});

describe('"that amount of damage to target creature that player controls"', () => {
  const build = (graveyard: readonly string[], seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .graveyard(...graveyard)
      .battlefield(REPRISAL, 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(VANILLA);
    if (seats === 3)
      b = b
        .seat(2)
        .library(...LIBRARY)
        .battlefield(BEARS);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('with four card types in the graveyard a Bolt to the face deals 3 to a creature of that player', () => {
    const g = build(FOUR_TYPES);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    // The trigger asks for its target and deals the damage the Bolt dealt: the 2/2 dies.
    g.passAll();
    g.expect.zone(VANILLA, 'graveyard', { seat: 1 });
  });

  test('with only two card types in the graveyard (three with the resolved Bolt) the condition is not met: nothing triggers', () => {
    const g = build(FOUR_TYPES.slice(0, 2));
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(VANILLA, 'battlefield', { seat: 1 });
  });

  test('damage to the controller does not trigger it (only an opponent)', () => {
    const g = build(FOUR_TYPES);
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    expect(g.state.stack).toHaveLength(0);
  });

  test('with 3 seats only a creature of the player who was damaged can be the target', () => {
    const g = build(FOUR_TYPES, 3);
    g.act(0).cast(BOLT, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.passAll();
    // Seat 2 was damaged: its Grizzly Bears take 3 damage; seat 1's creature is untouched.
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.zone(VANILLA, 'battlefield', { seat: 1 });
  });
});
