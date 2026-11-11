// A target that leaves before the spell resolves.
// Pins: CR 608.2b (Resolving Spells and Abilities): a target no longer in the zone it was in is
// illegal; if all of a spell's targets are illegal it doesn't resolve, is removed from the stack
// and put into its owner's graveyard; CR 400.7 (General): an object that changes zone is a new
// object with no relation to its old self; CR 701.8 (Destroy) and CR 701.6a for the pieces used.
// Partial targets (some legal, some not) wait for multi-target cards (SPEC test 2, M5).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

describe('CR 608.2b (Resolving Spells and Abilities): the target is destroyed in response', () => {
  function boltThenMurder() {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    return g;
  }

  test('Murder resolves first (it is on top), then Bolt has no legal target', () => {
    const g = boltThenMurder();
    g.expect.stack(['Murder', 'Lightning Bolt']);
    g.passAll();
    g.expect.stack([]);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('Bolt does not resolve: it fizzles and goes to the graveyard without doing anything', () => {
    const g = boltThenMurder();
    const boltOnStack = g.id({ name: 'Lightning Bolt', zone: 'stack' });
    g.passAll();
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.eventLog([
      { kind: 'died', cardName: 'Grizzly Bears' },
      { kind: 'fizzled', cardName: 'Lightning Bolt' },
    ]);
    g.expect.noEvent({ kind: 'damageDealt' });
    // It never resolved (CR 608.2b: removed from the stack); Murder did.
    g.expect.noEvent({ kind: 'resolved', object: boltOnStack });
  });

  test('the Bolt was not countered: no countered event, no refund of its mana', () => {
    const g = boltThenMurder();
    g.passAll();
    g.expect.noEvent({ kind: 'countered' });
    g.expect.tapped('Mountain');
    g.expect.life(1, 40);
    g.expect.life(0, 40);
  });

  test('the same cards in the other order resolve normally: Bolt first kills the Bears', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.eventLog([{ kind: 'damageDealt', amount: 3 }, { kind: 'died' }]);
  });
});

describe('CR 400.7 (General): the target is bounced in response and comes back as a new object', () => {
  function murderThenUnsummon() {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .battlefield('Grizzly Bears', { label: 'bears', damage: 1, counters: { '+1/+1': 1 } })
      .build();
    const oldId = g.id('bears');
    g.act(0).cast('Murder', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [{ name: 'Grizzly Bears' }], pay: true });
    return { g, oldId };
  }

  test('Murder fizzles: the creature it targeted is gone, whatever is in the hand now', () => {
    const { g } = murderThenUnsummon();
    g.expect.stack(['Unsummon', 'Murder']);
    g.passAll();
    g.expect.eventLog([
      { kind: 'zoneChanged', cardName: 'Unsummon', toZone: 'graveyard' },
      { kind: 'fizzled', cardName: 'Murder' },
    ]);
    g.expect.noEvent({ kind: 'died' });
    g.expect.zone('Murder', 'graveyard', { seat: 0 });
    g.expect.stack([]);
  });

  test('the Bears are in their owner hand as a new object with a new id', () => {
    const { g, oldId } = murderThenUnsummon();
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
    g.expect.noObject('Grizzly Bears', { zone: 'battlefield' });
    expect(g.id('bears')).not.toBe(oldId);
    expect(g.state.objects[oldId]).toBeUndefined();
    // The card is the same (it is the same physical card), the object is not.
    expect(g.object('bears').card).not.toBeNull();
  });

  test('the returned card has no memory of the old one: no counters, no damage (CR 400.7)', () => {
    const { g } = murderThenUnsummon();
    g.passAll();
    g.expect.counters('bears', {});
    g.expect.damage('bears', 0);
    expect(g.object('bears').tapped).toBe(false);
  });

  test('a stale reference to the old object finds nothing: its last-known information remains', () => {
    const { g, oldId } = murderThenUnsummon();
    g.passAll();
    expect(g.state.objects[oldId]).toBeUndefined();
    expect(g.state.lki[oldId]?.characteristics.name).toBe('Grizzly Bears');
    expect(g.state.lki[oldId]?.object.counters).toEqual({ '+1/+1': 1 });
  });

  test('nothing is left on the stack, nobody lost life, and priority returns', () => {
    const { g } = murderThenUnsummon();
    g.passAll();
    g.expect.zone('Murder', 'graveyard', { seat: 0 });
    g.expect.life(0, 40);
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.pending?.kind).toBe('priority');
  });
});

describe('CR 608.2b (Resolving Spells and Abilities): player targets cannot leave', () => {
  test('a Bolt at a player still resolves after other spells resolve first', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt', "Angel's Mercy")
      .battlefield('Mountain')
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.act(0).cast("Angel's Mercy", { pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.life(0, 47);
  });
});
