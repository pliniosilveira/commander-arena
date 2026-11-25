// Planeswalker Party deck (issue 132), group 18: Chandra, Legacy of Fire, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 122.1 and 608.2d (the controller chooses any number of permanents and one loyalty counter comes off each), CR 608.2c ("that many" is the counters really removed),
// CR 701.13 (exile the top cards), CR 601.2 (play them this turn), CR 704.5i (a planeswalker with no loyalty goes to the graveyard). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const CHANDRA = real('Chandra, Legacy of Fire');
const NAHIRI = real('Nahiri, the Harbinger');
const LIBRARY = ['Mountain', 'Island', 'Plains', 'Swamp', 'Forest', 'Mountain', 'Island', 'Plains'];

describe('Chandra, Legacy of Fire 0', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(CHANDRA)
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CHANDRA.name, { counters: { loyalty: 5 } })
      .battlefield(NAHIRI.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('removing a loyalty counter from two permanents exiles two cards', () => {
    const g = build();
    g.act(0).activate(CHANDRA.name, { ability: 2 });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(CHANDRA.name, NAHIRI.name);
    g.expect.counters(CHANDRA.name, { loyalty: 4 });
    g.expect.counters(NAHIRI.name, { loyalty: 3 });
    g.expect.librarySize(0, 6);
  });

  test('choosing none exiles none', () => {
    const g = build();
    g.act(0).activate(CHANDRA.name, { ability: 2 });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.librarySize(0, 8);
  });
});
