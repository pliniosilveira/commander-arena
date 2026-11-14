// Scenario 8 (SPEC 12): summoning sickness for mana creatures.
// Pins: CR 302.6 (Creatures): a creature's {T} ability can't be activated unless its controller has
// controlled it continuously since their most recent turn began.
// CR 605.1a (Mana Abilities) and 605.3a: a mana ability with {T} in the cost is such an ability.
// CR 702.10b (Haste): a creature with haste ignores that condition, which is the "unless it has
// haste" half of the SPEC line (tested with SYNTHETIC Hasty Mana Elf below).
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';

/** Seat 0 casts Llanowar Elves from hand with its Forest, in its own precombat main. */
function elvesJustCast() {
  const g = scenario()
    .seat(0)
    .hand('Llanowar Elves')
    .battlefield('Forest')
    .library('Forest', { count: 3 })
    .seat(1)
    .library('Island', { count: 3 })
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast('Llanowar Elves', { pay: true });
  g.passAll();
  g.expect.zone('Llanowar Elves', 'battlefield', { seat: 0 });
  return g;
}

describe('CR 302.6 (Creatures): a mana creature that entered this turn', () => {
  test('cannot tap for mana the turn it entered: the engine rejects it and does not offer it', () => {
    const g = elvesJustCast();
    g.expect.illegal(0, { tap: 'Llanowar Elves' });
    const r = g.act(0).try.tapForMana('Llanowar Elves');
    if (r.ok) throw new Error('summoning sick Llanowar Elves tapped for mana');
    g.expect.tapped('Llanowar Elves', false);
    g.expect.pool(0, '');
  });

  test('still cannot during the opponent turn: their turn is not the controller turn beginning', () => {
    const g = elvesJustCast();
    g.advanceTo('precombatMain', { turn: 4 });
    g.expect.step('precombatMain', { active: 1, turn: 4 });
    // Seat 0 has priority only after seat 1 passes; the elf is still not usable.
    g.act(1).pass();
    g.expect.pending('priority', 0);
    g.expect.illegal(0, { tap: 'Llanowar Elves' });
  });

  test('can tap once its controller next turn begins', () => {
    const g = elvesJustCast();
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.step('upkeep', { active: 0, turn: 5 });
    g.expect.legal(0, { tap: 'Llanowar Elves' });
    g.act(0).tapForMana('Llanowar Elves');
    g.expect.pool(0, 'G');
    g.expect.tapped('Llanowar Elves');
  });

  test('a creature on the battlefield since before the turn began can tap at once', () => {
    const g = scenario().seat(0).battlefield('Llanowar Elves').build();
    g.expect.legal(0, { tap: 'Llanowar Elves' });
    g.act(0).tapForMana('Llanowar Elves');
    g.expect.pool(0, 'G');
  });

  test('a mana creature with haste can tap for mana the turn it entered (CR 702.10b)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Hasty Mana Elf')
      .battlefield('Forest')
      .library('Forest', { count: 3 })
      .seat(1)
      .library('Island', { count: 3 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('SYNTHETIC Hasty Mana Elf', { pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Hasty Mana Elf', 'battlefield', { seat: 0 });
    g.expect.legal(0, { tap: 'SYNTHETIC Hasty Mana Elf' });
    g.act(0).tapForMana('SYNTHETIC Hasty Mana Elf');
    g.expect.pool(0, 'G');
  });

  test('a fresh permanent that is not a creature is not summoning sick', () => {
    const g = scenario().seat(0).battlefield('Sol Ring', { fresh: true }).build();
    g.expect.legal(0, { tap: 'Sol Ring' });
    g.act(0).tapForMana('Sol Ring');
    g.expect.pool(0, 'CC');
  });

  test('the sickness is per controller: a fresh elf of the opponent is sick on their own turn', () => {
    const g = scenario()
      .seat(0)
      .seat(1)
      .battlefield('Llanowar Elves', { fresh: true })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.expect.illegal(1, { tap: 'Llanowar Elves' });
  });
});
