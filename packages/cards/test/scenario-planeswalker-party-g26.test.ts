// Planeswalker Party deck (issue 132), group 26: Repeated Reverberation, Jaya's Phoenix and Leori, Sparktouched Hunter, read from the golden corpus through the grammar with no override
// and played with the scenario DSL. Pins: CR 603.7, 603.7a and 603.7b (a delayed ability of the turn that waits for the next event and uses itself up, or triggers at each with "whenever"),
// CR 606.2 (only a loyalty ability), CR 707.10 and 707.10c (the copy has the ability's text and may choose new targets; it is not activated, so it is no new activation and triggers nothing),
// CR 606.3 (the copy is no second loyalty activation of the planeswalker). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const REVERB = real('Repeated Reverberation');
const PHOENIX = real("Jaya's Phoenix");
const LEORI = real('Leori, Sparktouched Hunter');
const walker = (name: string, type: string) =>
  parsed(name, `Legendary Planeswalker — ${type}`, '+1: You gain 1 life.', {
    manaCost: '{2}',
    loyalty: '4',
  });
const ONE = walker('SYNTHETIC Quiet Walker', 'Nahiri');
const TWO = walker('SYNTHETIC Loud Walker', 'Gideon');
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const base = () =>
  scenario({ seats: 3 }).define(REVERB).define(PHOENIX).define(LEORI).define(ONE).define(TWO);

describe('Repeated Reverberation', () => {
  const build = () =>
    base()
      .seat(0)
      .library(...LIBRARY)
      .hand(REVERB.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(ONE.name, { counters: { loyalty: 4 } })
      .battlefield(TWO.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the next loyalty ability is copied twice: +1 gains 1 life three times; the one after is not copied', () => {
    const g = build();
    g.act(0).cast(REVERB.name, { pay: true });
    g.passAll();
    g.act(0).activate(ONE.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 43);
    g.act(0).activate(TWO.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 44);
  });

  test('an instant cast next is copied twice (3 Lightning Bolts at the same player: 9 damage)', () => {
    const g = base()
      .seat(0)
      .library(...LIBRARY)
      .hand(REVERB.name, 'Lightning Bolt')
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(REVERB.name, { pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 31);
  });

  test('without the spell a loyalty ability is not copied', () => {
    const g = build();
    g.act(0).activate(ONE.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 41);
  });
});

describe("Jaya's Phoenix", () => {
  test('combat damage copies the next loyalty ability once, when it is activated', () => {
    const g = base()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(PHOENIX.name)
      .battlefield(ONE.name, { counters: { loyalty: 4 } })
      .battlefield(TWO.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(PHOENIX.name, { player: 1 });
    g.advanceTo('postcombatMain');
    g.act(0).activate(ONE.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 42);
    g.act(0).activate(TWO.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 43);
  });
});

describe('Leori, Sparktouched Hunter', () => {
  test('a chosen planeswalker type: every ability of such a planeswalker is copied this turn, others are not', () => {
    const g = base()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LEORI.name)
      .battlefield(ONE.name, { counters: { loyalty: 4 } })
      .battlefield(TWO.name, { counters: { loyalty: 4 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(LEORI.name, { player: 1 });
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Nahiri');
    g.passAll();
    g.advanceTo('postcombatMain');
    g.act(0).activate(ONE.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 42);
    g.act(0).activate(TWO.name, { ability: 0 });
    g.passAll();
    g.expect.life(0, 43);
  });
});
