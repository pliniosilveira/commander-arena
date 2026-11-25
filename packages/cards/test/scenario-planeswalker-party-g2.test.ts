// Planeswalker Party deck (issue 132), group 2: Fog Bank and The Wanderer, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 615.1 and 615.6 (prevention: the damage is never dealt), CR 506.3 (combat damage dealt to and by a blocker), CR 120.2 (combat and noncombat damage),
// CR 108.4 and 613.1b (a permanent's controller). Three seats, so "you" and "other permanents you control" are tested against two opponents.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const FOG = real('Fog Bank');
const WANDERER = real('The Wanderer');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('Fog Bank', () => {
  test('a creature it blocks takes no damage from it and deals none to it', () => {
    const g = scenario()
      .define(FOG)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(FOG.name, { label: 'fog' })
      .build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: 'fog', attacker: BEARS }],
      until: 'endOfCombat',
    });
    g.expect.damage('fog', 0);
    g.expect.damage(BEARS, 0);
  });

  test('noncombat damage to it is dealt', () => {
    const g = scenario()
      .define(FOG)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(FOG.name, { label: 'fog' })
      .build();
    g.act(0).cast(BOLT, { targets: ['fog'], pay: true });
    g.passAll();
    g.expect.zone(FOG.name, 'graveyard', { seat: 1 });
  });
});

describe('The Wanderer', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(WANDERER)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WANDERER.name)
      .battlefield(BEARS, { label: 'bear' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'enemy bear' })
      .build();

  test('a Lightning Bolt at its controller or at their other permanents deals nothing', () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    const h = build();
    h.act(0).cast(BOLT, { targets: ['bear'], pay: true });
    h.passAll();
    h.expect.damage('bear', 0);
  });

  test('another player and their permanents are not covered', () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: ['enemy bear'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
  });
});
