// Planeswalker Party deck (issue 132), group 20: Semester's End, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 701.13 and 115.1 (any number of targets), CR 603.7 and 603.7c (the delayed return is about the objects exiled), CR 400.7 (they return as new objects: no damage, no counters),
// CR 122.6 and 614.1c (an additional +1/+1 counter for a creature, a loyalty counter for a planeswalker, as it enters), CR 110.2 (under its owner's control). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const SEMESTER = real("Semester's End");
const NAHIRI = real('Nahiri, the Harbinger');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe("Semester's End", () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(SEMESTER)
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .hand(SEMESTER.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { label: 'my bear' })
      .battlefield(NAHIRI.name, { counters: { loyalty: 2 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'their bear' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the creature and the planeswalker are exiled, then return at the next end step with one more counter each', () => {
    const g = build();
    g.act(0).cast(SEMESTER.name, { targets: ['my bear', NAHIRI.name], pay: true });
    g.passAll();
    g.expect.zone(NAHIRI.name, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(NAHIRI.name, 'battlefield', { seat: 0 });
    g.expect.counters(NAHIRI.name, { loyalty: 5 });
    g.expect.counters({ name: BEARS, seat: 0 }, { '+1/+1': 1 });
  });
});
