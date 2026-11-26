// Planeswalker Party deck (issue 132), group 14: Sarkhan the Masterless, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 508.1b and 603.2 (whenever a creature attacks you or a planeswalker you control), CR 120.3 (each Dragon is a source of its own 1 damage), CR 111.1 (-3: a 4/4 flying Dragon
// token), CR 613 (+1). Three seats: an attack on the third player does not trigger it.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const SARKHAN = real('Sarkhan the Masterless');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Sarkhan the Masterless', () => {
  test('-3 creates a 4/4 red Dragon with flying', () => {
    const g = scenario({ seats: 3 })
      .define(SARKHAN)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SARKHAN.name, { counters: { loyalty: 5 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(SARKHAN.name, { ability: 2 });
    g.passAll();
    g.expect.derived('Dragon', { types: ['creature'], subtypes: ['Dragon'], keywords: ['flying'] });
    g.expect.pt('Dragon', 4, 4);
  });

  const DRAKE = parsed('SYNTHETIC Test Dragon', 'Creature — Dragon', '', {
    manaCost: '{1}',
    power: '1',
    toughness: '1',
  });
  const attack = (target: 0 | 2) => {
    const h = scenario({ seats: 3 })
      .define(SARKHAN)
      .define(DRAKE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SARKHAN.name, { counters: { loyalty: 5 } })
      .battlefield(DRAKE.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    h.advanceTo('declareAttackers', { attack: false });
    h.act(1).declareAttackers([{ attacker: 'bear', target: { player: target } }]);
    h.passAll();
    return h;
  };

  test('a creature attacking me takes 1 damage from each Dragon I control', () => {
    attack(0).expect.damage('bear', 1);
  });

  test('a creature attacking another player takes none', () => {
    attack(2).expect.damage('bear', 0);
  });
});

// CR 205.1a: "becomes a 4/4 red Dragon creature" sets the card type, so the planeswalker type goes, and with it the subtypes of a planeswalker (CR 205.3d).
describe('Sarkhan the Masterless +1, the type line', () => {
  test('a walker becomes a Dragon creature only: its planeswalker subtype is gone with its type', () => {
    const WALKER = 'SYNTHETIC Loyalty Walker';
    const g = scenario({ seats: 2 })
      .define(SARKHAN)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SARKHAN.name, { counters: { loyalty: 5 } })
      .battlefield(WALKER, { counters: { loyalty: 3 } })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(SARKHAN.name, { ability: 1 });
    g.passAll();
    g.expect.derived(WALKER, { types: ['creature'], subtypes: ['Dragon'] });
    g.expect.derived(SARKHAN.name, { types: ['creature'], subtypes: ['Dragon'] });
  });
});
