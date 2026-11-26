// "Whenever a player taps a land for mana, if this creature is tapped, that player adds one mana of any type that land produced. Then that land deals 1 damage to that player." (Barbflare
// Gremlin; CR 605.1b, 605.4a, 603.4, 106.12a): a triggered mana ability (`tappedForMana` by the `tapper`) with the intervening "if" "this creature is tapped" and damage the land deals to the player.
// The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: nothing happens while the creature is untapped, with it tapped any player's land makes one more mana of its type
// and deals 1 damage to that player (the controller's own too), a land that makes mana of one type adds that type, and with 3 seats each player pays for their own land.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GREMLIN = 'SYNTHETIC Spiteful Gremlin';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(GREMLIN))).toEqual([]);
});

describe('"that player adds one mana of any type that land produced. Then that land deals 1 damage to that player."', () => {
  const build = (tapped: boolean, seats: 2 | 3 = 2) => {
    let b = scenario({ seats }).seat(0);
    b = tapped ? b.battlefield(GREMLIN, { tapped: true }) : b.battlefield(GREMLIN);
    b = b.battlefield('Forest');
    b = b.seat(1).battlefield('Mountain');
    if (seats === 3) b = b.seat(2).battlefield('Island');
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('the Gremlin untapped: a land makes its one mana and no damage is dealt', () => {
    const g = build(false);
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'G');
    g.expect.life(0, 40);
  });

  test('the Gremlin tapped: its controller’s land makes two mana of its type and takes 1 damage', () => {
    const g = build(true);
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'GG');
    g.expect.life(0, 39);
  });

  test('with 3 seats the player who taps the land gets the mana and the damage, not the Gremlin’s controller', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(GREMLIN, { tapped: true })
      .seat(1)
      .battlefield('Mountain')
      .seat(2)
      .battlefield('Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).tapForMana('Mountain');
    g.expect.pool(1, 'RR');
    g.expect.life(1, 39);
    g.expect.life(0, 40);
    g.expect.life(2, 40);
  });

  test('paying for a spell by tapping the land: the mana of the extra trigger is left over and the damage is dealt', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GREMLIN, { tapped: true })
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.life(0, 39);
    g.expect.pool(0, 'R');
  });
});
