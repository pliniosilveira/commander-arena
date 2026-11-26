// Planeswalker Party deck (issue 132), group 8: Ajani Steadfast, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 122.6 (counters on each creature, and a loyalty counter on each other planeswalker), CR 306.5b (loyalty counters), CR 114.1 and 114.4 (the emblem works from the command
// zone), CR 615.1 ("prevent all but 1 of that damage": a source of 3 deals 1, a source of 1 deals 1, damage to a creature is not touched). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const AJANI = real('Ajani Steadfast');
const NAHIRI = real('Nahiri, the Harbinger');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Ajani Steadfast', () => {
  test('-2: a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker', () => {
    const g = scenario({ seats: 3 })
      .define(AJANI)
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(AJANI.name, { counters: { loyalty: 4 } })
      .battlefield(NAHIRI.name, { counters: { loyalty: 3 } })
      .battlefield(BEARS, { label: 'my bear' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'their bear' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(AJANI.name, { ability: 1 });
    g.passAll();
    g.expect.counters('my bear', { '+1/+1': 1 });
    g.expect.counters('their bear', {});
    g.expect.counters(NAHIRI.name, { loyalty: 4 });
    g.expect.counters(AJANI.name, { loyalty: 2 });
  });

  test('-7: the emblem leaves 1 damage of each source dealt to you or to a planeswalker you control', () => {
    const g = scenario({ seats: 3 })
      .define(AJANI)
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(AJANI.name, { counters: { loyalty: 7 } })
      .battlefield(NAHIRI.name, { label: 'nahiri', counters: { loyalty: 5 } })
      .battlefield('Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(AJANI.name, { ability: 2 });
    g.passAll();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 39);
    g.act(0).cast(`${BOLT}[0]`, { targets: ['nahiri'], pay: true });
    g.passAll();
    g.expect.counters('nahiri', { loyalty: 4 });
  });
});
