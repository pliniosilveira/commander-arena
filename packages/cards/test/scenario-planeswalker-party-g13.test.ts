// Planeswalker Party deck (issue 132), group 13: "each planeswalker you control becomes a 4/4 red Dragon creature" (the +1 of Sarkhan the Masterless), as a SYNTHETIC planeswalker with
// that one ability, read through the grammar. Pins: CR 613.1d-e and 613.4b (types, color, base power and toughness), CR 205.1a (no longer a planeswalker, so no planeswalker subtype either), CR 606.3 (its loyalty
// abilities can still be activated), CR 302.6 (a creature that came under control this turn can't attack), CR 611.2c (the group is fixed as the effect resolves).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const DRAGON_WALKER = parsed(
  'SYNTHETIC Dragon Walker',
  'Legendary Planeswalker — Sarkhan',
  '+1: Until end of turn, each planeswalker you control becomes a 4/4 red Dragon creature and gains flying.',
  { manaCost: '{3}{R}{R}', loyalty: '5' },
);
const OTHER_WALKER = parsed(
  'SYNTHETIC Other Walker',
  'Legendary Planeswalker — Nahiri',
  '+1: You gain 1 life.',
  { manaCost: '{2}', loyalty: '4' },
);
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('each planeswalker becomes a Dragon creature', () => {
  test("both planeswalkers you control become 4/4 red flying Dragon creatures, no longer planeswalkers; the opponent's do not", () => {
    const g = scenario({ seats: 3 })
      .define(DRAGON_WALKER)
      .define(OTHER_WALKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DRAGON_WALKER.name, { counters: { loyalty: 5 } })
      .battlefield(OTHER_WALKER.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(OTHER_WALKER.name, { label: 'theirs', counters: { loyalty: 4 } })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(DRAGON_WALKER.name, { ability: 0 });
    g.passAll();
    g.expect.derived(`${OTHER_WALKER.name}[0]`, {
      types: ['creature'],
      colors: ['R'],
      subtypes: ['Dragon'],
      keywords: ['flying'],
    });
    g.expect.pt(`${OTHER_WALKER.name}[0]`, 4, 4);
    g.expect.derived('theirs', { types: ['planeswalker'], colors: [], subtypes: ['Nahiri'] });
    g.expect.counters(`${OTHER_WALKER.name}[0]`, { loyalty: 4 });
  });

  test('a loyalty ability of one that is a creature can still be activated', () => {
    const g = scenario()
      .define(DRAGON_WALKER)
      .define(OTHER_WALKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DRAGON_WALKER.name, { counters: { loyalty: 5 } })
      .battlefield(OTHER_WALKER.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(DRAGON_WALKER.name, { ability: 0 });
    g.passAll();
    g.act(0).activate(OTHER_WALKER.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 41);
  });
});
