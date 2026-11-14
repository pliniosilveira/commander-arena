// Trigger conditions that name a filter: "another creature", "a Dragon you control", "a creature
// an opponent controls". The filter reads the object as it is when it enters (CR 603.6a) or as it
// was when it left (CR 603.10a), through the same ObjectFilter every selector uses.
// All cards are SYNTHETIC (see src/cards/fixtures/synthetic-triggers.ts).
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';

describe('"whenever another creature enters under your control"', () => {
  test('triggers for your other creatures, not for itself or for the opponent', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Welcome Committee')
      .hand('Grizzly Bears')
      .pool('CG')
      .seat(1)
      .battlefield('SYNTHETIC Welcome Committee')
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.pass();
    g.pass();
    // Only seat 0's committee: the opponent's controls no creature entering.
    g.expect.stack(['SYNTHETIC Welcome Committee (ability)']);
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 40);
  });

  test('a token entering is a creature entering (CR 603.6a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Welcome Committee', 'SYNTHETIC Landfall Tokenmaker')
      .hand('Forest')
      .seat(1)
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 1 });
    g.expect.life(0, 41);
  });

  test('a nonland, noncreature permanent entering does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Welcome Committee')
      .hand('Sol Ring')
      .pool('C')
      .seat(1)
      .build();
    g.act(0).cast('Sol Ring', { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });
});

describe('"whenever a Dragon enters under your control"', () => {
  test('a subtype filter matches the entering permanent', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Dragon Roost')
      .hand('SYNTHETIC Sacrifice Dragon', 'Grizzly Bears')
      .pool('CCCB')
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Sacrifice Dragon', { pay: true });
    g.pass();
    g.pass();
    // The dragon's own enters ability and the roost trigger together: two different abilities.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers('SYNTHETIC Sacrifice Dragon', 'SYNTHETIC Dragon Roost');
    g.expect.stack(['SYNTHETIC Dragon Roost (ability)', 'SYNTHETIC Sacrifice Dragon (ability)']);
    g.pass();
    g.pass();
    g.expect.life(0, 41);
  });

  test('a creature of another type entering does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Dragon Roost')
      .hand('Grizzly Bears')
      .pool('CG')
      .seat(1)
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });
});

describe('"whenever a creature an opponent controls dies"', () => {
  test('looks at the controller of the creature as it was (CR 603.10a)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'SYNTHETIC Spite Watcher')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears', 'Llanowar Elves')
      .build();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.pass();
    g.pass();
    // Three creatures die; two belonged to the opponent.
    g.expect.stack(['SYNTHETIC Spite Watcher (ability)', 'SYNTHETIC Spite Watcher (ability)']);
    g.passAll();
    g.expect.life(0, 42);
  });
});
