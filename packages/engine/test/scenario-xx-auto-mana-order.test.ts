// Issue 18 (better mana management): automatic payment taps the least flexible mana first and keeps the colors the
// rest of the hand asks for. Pins: CR 601.2g-h (Casting Spells: the player pays the total cost, mana abilities
// are activated first), CR 106.4 (mana empties at the end of each step and phase). Real cards from the engine fixtures.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';

describe('automatic payment spends colorless mana before colored mana', () => {
  test('Sol Ring pays the generic part of a spell, so the Islands stay untapped', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield('Island', { count: 3 })
      .battlefield('Sol Ring')
      .seat(1)
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.expect.stack(['Divination']);
    g.expect.tapped('Sol Ring');
    g.expect.tapped('Island[0]');
    g.expect.tapped('Island[1]', false);
    g.expect.tapped('Island[2]', false);
  });
});

describe('automatic payment keeps the colors the rest of the hand needs', () => {
  test('the Mountain stays untapped for the Lightning Bolt in the hand', () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears', 'Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.expect.tapped('Mountain', false);
    g.expect.tapped('Forest[0]');
    g.expect.tapped('Forest[1]');
  });

  test('with nothing else in the hand the planner still pays, and the reserve never makes a payment fail', () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears', 'Llanowar Elves')
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.expect.stack(['Grizzly Bears']);
    g.expect.tapped('Forest[0]');
    g.expect.tapped('Forest[1]');
  });
});
