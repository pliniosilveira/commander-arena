// Planeswalker Party deck (issue 132), group 10: Gatewatch Beacon, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 614.1c ("enters with three loyalty counters"), CR 122.1 and 122.6 (moving a counter takes it off one permanent and puts it on another), CR 603.4 (the intervening "if":
// the Beacon has loyalty counters), CR 603.5 ("you may" is asked as the ability resolves), CR 306.5b (loyalty counters on a planeswalker). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const BEACON = real('Gatewatch Beacon');
const NARSET = real('Narset, Parter of Veils');

describe('Gatewatch Beacon', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(BEACON)
      .define(NARSET)
      .seat(0)
      .library(...Array.from({ length: 8 }, () => 'Plains'))
      .hand(BEACON.name, NARSET.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...Array.from({ length: 8 }, () => 'Plains'))
      .seat(2)
      .library(...Array.from({ length: 8 }, () => 'Plains'))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const withBeacon = () => {
    const g = build();
    g.act(0).cast(BEACON.name, { pay: true });
    g.passAll();
    g.expect.counters(BEACON.name, { loyalty: 3 });
    return g;
  };

  test('a planeswalker you control enters: you may move a loyalty counter from the Beacon onto it', () => {
    const g = withBeacon();
    g.act(0).cast(NARSET.name, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.counters(BEACON.name, { loyalty: 2 });
    g.expect.counters(NARSET.name, { loyalty: 6 });
  });

  test('declining leaves the counters where they are', () => {
    const g = withBeacon();
    g.act(0).cast(NARSET.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.counters(BEACON.name, { loyalty: 3 });
    g.expect.counters(NARSET.name, { loyalty: 5 });
  });
});
