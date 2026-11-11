// Scenario 9 (SPEC 12): mana abilities and the mana pool.
// Pins: CR 605.3a and 605.3b (Mana Abilities): a mana ability can be activated while paying a cost,
// does not use the stack and cannot be responded to; CR 106.4 (Mana) and CR 500.5 (General): each
// pool empties at the end of each step and phase, a turn-based action; CR 117.4 (Priority) is
// untouched by mana abilities. CR 601.2g-h (Casting Spells) for pool mana before sources.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

describe('CR 605.3 (Mana Abilities): no stack, no priority', () => {
  test('activating a mana ability at priority leaves the stack empty and keeps priority', () => {
    const g = scenario().seat(0).battlefield('Mountain').seat(1).build();
    g.act(0).tapForMana('Mountain');
    g.expect.stack([]);
    g.expect.pool(0, 'R');
    // The opponent was never given priority: the same seat is still deciding.
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'priorityPassed' });
    g.expect.noEvent({ kind: 'abilityActivated' });
  });

  test('paying a cost with mana abilities puts nothing but the spell on the stack', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield('Mountain').seat(1).build();
    const cast = g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }] });
    // During payment: the proposed spell is the only stack object (CR 601.2a).
    g.expect.stack(['Lightning Bolt']);
    g.expect.pending('payMana', 0);
    // Priority cannot be passed while paying; only paying or cancelling is legal.
    g.expect.illegal(0, 'pass');
    const mark = g.mark();
    cast.payManual(['Mountain']);
    g.expect.stack(['Lightning Bolt']);
    g.expect.tapped('Mountain');
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: mark });
    g.expect.noEvent({ kind: 'abilityActivated' }, { since: mark });
    // The tap was an event, not a stack object, and the opponent has no chance to respond to it.
    g.expect.eventLog([{ kind: 'tapped' }, { kind: 'manaAdded' }, { kind: 'spellCast' }], {
      since: mark,
    });
    g.expect.pending('priority', 0);
  });

  test('the planner taps the sources itself without any stack object either', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield('Island', { count: 3 })
      .seat(1)
      .build();
    const mark = g.mark();
    g.act(0).cast('Divination', { pay: true });
    g.expect.stack(['Divination']);
    expect(g.state.stack).toHaveLength(1);
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: mark });
    for (let i = 0; i < 3; i += 1) g.expect.tapped(`Island[${i}]`);
  });
});

describe('CR 106.4 (Mana) and CR 500.5 (General): unspent mana empties', () => {
  test('mana left in the pool empties when the step ends', () => {
    const g = scenario().seat(0).battlefield('Forest').seat(1).build();
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'G');
    g.passAll();
    g.expect.step('beginningOfCombat');
    g.expect.pool(0, '');
    g.expect.eventLog([
      { kind: 'manaEmptied', seat: 0, count: 1 },
      { kind: 'stepBegan', step: 'beginningOfCombat' },
    ]);
  });

  test('both pools empty, whoever holds the mana', () => {
    const g = scenario().seat(0).pool('GG').seat(1).pool('R').build();
    g.passAll();
    g.expect.pool(0, '');
    g.expect.pool(1, '');
    g.expect.eventLog([
      { kind: 'manaEmptied', seat: 0, count: 2 },
      { kind: 'manaEmptied', seat: 1, count: 1 },
    ]);
  });

  test('mana does not carry from the main phase to the next phase or step', () => {
    const g = scenario().seat(0).battlefield('Forest', 'Mountain').seat(1).build();
    g.act(0).tapForMana('Forest');
    g.passAll();
    g.act(0).tapForMana('Mountain');
    g.expect.pool(0, 'R');
    g.passAll();
    g.expect.step('declareAttackers');
    g.expect.pool(0, '');
  });

  test('mana survives while players only pass priority with a non-empty stack', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    g.act(0).tapForMana('Mountain[0]');
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    // The pooled R paid for the Bolt; the second Mountain stays untapped and nothing is left over.
    g.expect.pool(0, '');
    g.expect.tapped('Mountain[1]', false);
    g.act(0).tapForMana('Mountain[1]');
    g.passAll();
    // Resolving a spell does not end the step, so the R is still there (CR 500.5 only at step end).
    g.expect.step('precombatMain');
    g.expect.pool(0, 'R');
    g.passAll();
    g.expect.pool(0, '');
  });
});

describe('CR 601.2g-h (Casting Spells): paying from the pool and from sources', () => {
  test('pool mana is spent before any land is tapped', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .pool('R')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.pool(0, '');
    g.expect.tapped('Mountain', false);
  });

  test('pool mana pays what it can and lands pay the rest', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears')
      .pool('B')
      .seat(1)
      .build();
    g.act(0).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.expect.pool(0, '');
    g.expect.tapped('Swamp[0]');
    g.expect.tapped('Swamp[1]');
  });

  test('Sol Ring makes two colorless mana', () => {
    const g = scenario().seat(0).battlefield('Sol Ring').build();
    g.act(0).tapForMana('Sol Ring');
    g.expect.pool(0, 'CC');
  });

  test('Sol Ring pays a generic cost and the leftover stays in the pool until the step ends', () => {
    const g = scenario()
      .seat(0)
      .hand('Sol Ring', { label: 'second' })
      .battlefield('Sol Ring', { label: 'first' })
      .seat(1)
      .build();
    g.act(0).cast('second', { pay: true });
    g.expect.tapped('first');
    // {1} was paid with one of the two {C}; the other stays in the pool (CR 106.4a).
    g.expect.pool(0, 'C');
    g.passAll();
    g.expect.stack([]);
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0, count: 2 });
    g.expect.pool(0, 'C');
    g.passAll();
    g.expect.pool(0, '');
  });

  test('Sol Ring pays {2} of Divination and an Island pays {U}', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .battlefield('Sol Ring', 'Island')
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.expect.tapped('Sol Ring');
    g.expect.tapped('Island');
    g.expect.pool(0, '');
  });

  test('colorless mana cannot pay a colored cost', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield('Sol Ring').build();
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
  });
});
