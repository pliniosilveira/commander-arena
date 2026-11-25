// "Whenever you cast a spell, choose up to one -" with "Return target spell you don't control to its owner's hand." and "Return target nonland permanent to its owner's hand."
// (Hullbreaker Horror's wording, run through the grammar as a SYNTHETIC card). CR 700.2 (modal: up to one), 115.1 and 405.1 (a spell on the stack as a target), 603.2
// (cast trigger), 109.4 (a spell's controller is who cast it); rule numbers were not checked against the CR text, which was not available.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const HORROR = parsed(
  'SYNTHETIC Parsed Horror',
  'Creature — Horror',
  "Flash\nThis spell can't be countered.\nWhenever you cast a spell, choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Return target nonland permanent to its owner's hand.",
  { manaCost: '{5}{U}{U}', colors: ['U'], power: '7', toughness: '8' },
);

const LIB = ['Plains', 'Plains', 'Plains', 'Plains'];

function game(seats: 2 | 3 | 4) {
  let b = scenario({ seats })
    .define(HORROR)
    .seat(0)
    .library(...LIB)
    .hand('Unsummon')
    .battlefield('Island')
    .battlefield('Grizzly Bears')
    .seat(1)
    .library(...LIB)
    .hand('Unsummon')
    .battlefield(HORROR.name)
    .battlefield('Island');
  if (seats > 2) {
    b = b
      .seat(2)
      .library(...LIB)
      .hand('Unsummon')
      .battlefield('Island');
  }
  if (seats > 3) b = b.seat(3).library(...LIB);
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
}

describe('Hullbreaker Horror wording: a cast trigger with up to one mode', () => {
  test('mode one returns a spell another player controls to its owner hand', () => {
    const g = game(2);
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'], pay: true });
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [HORROR.name], pay: true });
    g.expect.pending('chooseModes', 1);
    g.act(1).chooseModes(0);
    // The one spell another player controls is the only legal target: it is taken without asking.
    expect(g.state.pending?.kind).toBe('priority');
    g.passAll();
    g.expect.zone('Unsummon', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('with no spell of another player on the stack mode one is not offered, the spell of its own controller is no target', () => {
    const g = game(2);
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [HORROR.name], pay: true });
    const d = g.state.pending;
    expect(d?.kind === 'chooseModes' ? d.modes.map((m) => m.legal) : []).toEqual([false, true]);
  });

  test('choosing no mode is allowed (up to one)', () => {
    const g = game(2);
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [HORROR.name], pay: true });
    g.act(1).chooseModes();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test.each([3, 4] as const)(
    'at %i seats a spell of any other player can be the target',
    (seats) => {
      const g = game(seats);
      g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'], pay: true });
      g.act(0).pass();
      g.act(1).cast('Unsummon', { targets: [HORROR.name], pay: true });
      g.act(1).chooseModes(0);
      g.passAll();
      g.expect.zone('Unsummon', 'hand', { seat: 0 });
      g.expect.invariants();
    },
  );
});
