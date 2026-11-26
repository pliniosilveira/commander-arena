// Planeswalker Party deck (issue 132), group 23: Sparkshaper Visionary, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 115.1 and 601.2c ("any number of target planeswalkers you control": the chosen ones only), CR 613.1d-f and 613.4b (3/3 blue Bird creature with flying and hexproof, no longer a
// planeswalker), CR 603.2 (a trigger at the beginning of combat on your turn only), CR 611.2a (it ends with the turn). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const VISIONARY = real('Sparkshaper Visionary');
const walker = (name: string, type: string) =>
  parsed(name, `Legendary Planeswalker — ${type}`, '+1: You gain 1 life.', {
    manaCost: '{2}',
    loyalty: '4',
  });
const ONE = walker('SYNTHETIC Quiet Walker', 'Nahiri');
const TWO = walker('SYNTHETIC Loud Walker', 'Gideon');
const THEIRS = walker('SYNTHETIC Far Walker', 'Jace');
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const build = () =>
  scenario({ seats: 3 })
    .define(VISIONARY)
    .define(ONE)
    .define(TWO)
    .define(THEIRS)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(VISIONARY.name)
    .battlefield(ONE.name, { label: 'one', counters: { loyalty: 4 } })
    .battlefield(TWO.name, { label: 'two', counters: { loyalty: 4 } })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(THEIRS.name, { label: 'theirs', counters: { loyalty: 4 } })
    .seat(2)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('Sparkshaper Visionary', () => {
  test('only the chosen planeswalker becomes a 3/3 blue flying hexproof Bird creature', () => {
    const g = build();
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseTargets('one');
    g.passAll();
    g.expect.derived('one', {
      types: ['creature'],
      colors: ['U'],
      subtypes: ['Bird'],
      keywords: ['flying', 'hexproof'],
    });
    g.expect.pt('one', 3, 3);
    g.expect.derived('two', { types: ['planeswalker'], colors: [] });
    g.expect.derived('theirs', { types: ['planeswalker'], colors: [] });
    g.expect.counters('one', { loyalty: 4 });
  });

  test('both of yours may be chosen, and it ends with the turn', () => {
    const g = build();
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseTargets('one', 'two');
    g.passAll();
    g.expect.pt('one', 3, 3);
    g.expect.pt('two', 3, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived('one', { types: ['planeswalker'], colors: [] });
    g.expect.derived('two', { types: ['planeswalker'], colors: [] });
  });

  test("an opponent's planeswalker cannot be chosen", () => {
    const g = build();
    g.advanceTo('beginningOfCombat');
    g.expect.pending('targets', 0);
    expect(() => g.act(0).chooseTargets('theirs')).toThrow();
  });
});
