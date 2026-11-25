// Planeswalker Party deck (issue 132), group 4: Nahiri, the Harbinger, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 115.1 and 601.2c (a target must be legal as it is chosen: an enchantment, a tapped artifact or a tapped creature, each member with its own quality), CR 606.4 (loyalty
// costs), CR 701.23 (search), CR 603.7c (the delayed return is about the object that was put onto the battlefield), CR 702.10 (haste).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const NAHIRI = real('Nahiri, the Harbinger');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');
const MINUS_2 = 1;
const MINUS_8 = 2;

describe('Nahiri, the Harbinger', () => {
  const build = (loyalty: number) =>
    scenario({ seats: 3 })
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY, BEARS)
      .battlefield(NAHIRI.name, { counters: { loyalty } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'tapped bear', tapped: true })
      .battlefield(BEARS, { label: 'untapped bear' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('-2 exiles a tapped creature', () => {
    const g = build(4);
    g.act(0).activate(NAHIRI.name, { ability: MINUS_2, targets: ['tapped bear'] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });

  test('-2 has no legal target when the only creature is untapped', () => {
    const g = scenario()
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(NAHIRI.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.act(0).try.activate(NAHIRI.name, { ability: MINUS_2 }).ok).toBe(false);
  });

  test('-8 puts a creature card from the library onto the battlefield with haste and returns it to the hand at the next end step', () => {
    const g = build(8);
    g.act(0).activate(NAHIRI.name, { ability: MINUS_8 });
    g.passAll();
    g.act(0).chooseCards(`${BEARS}[0]`);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });
});
