// The Danitha deck (issue 26), group 5 (D-1252 provisional): "{1}{W}, Blight 1, Sacrifice this Aura: Exile enchanted creature." and "Enchanted creature can't attack or
// block." (Spiral into Solitude), and a blight cost of two counters on a creature that taps (SYNTHETIC Blight Scholar).
// Pins: CR 701.68a (to blight N is to put N -1/-1 counters on a creature you control, the player chooses it), CR 701.68b (a player who can't put the counters on a creature they
// control can't choose to blight), CR 122.6 and 101.2 (a creature that can't have -1/-1 counters is no choice), CR 118.3 and 602.2b (a cost is paid as the ability is activated;
// the sacrifice is a cost, so the ability resolves without its source), CR 113.7a and 608.2h (the ability reads the permanent the Aura was attached to as it was), CR 733 (cancel
// rewinds the cost), CR 508.1a and 509.1a (can't attack, can't block), CR 704.5f (a creature with toughness 0 or less dies).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const AURA = 'SYNTHETIC Blighting Aura';
const SCHOLAR = 'SYNTHETIC Blight Scholar';
const WARD = 'SYNTHETIC Counter Ward';
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the cards are valid and the cost is supported', () => {
  test.each([AURA, SCHOLAR])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
  test('the feature', () => {
    expect(isFeatureSupported('cost:blight')).toBe(true);
  });
});

/** Seat 0 has the Aura on seat 1's Bears, two Plains and the creatures given. */
function start(...mine: readonly string[]) {
  return scenario()
    .define(syntheticCard(AURA))
    .define(syntheticCard(SCHOLAR))
    .define(syntheticCard(WARD))
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Plains', { count: 2 })
    .battlefield(...mine)
    .battlefield(AURA, { attachedTo: 'theirBears' })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'theirBears' })
    .at('precombatMain', { active: 0 })
    .build();
}

describe('"{1}{W}, Blight 1, Sacrifice this Aura: Exile enchanted creature."', () => {
  test('with one creature of yours it is the one blighted (the engine chooses), the Aura is sacrificed and the enchanted creature is exiled', () => {
    const g = start(SPIDER);
    const mark = g.mark();
    g.act(0).activate(AURA, { pay: true });
    const events = g.eventsSince(mark);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'permanentsChosen', purpose: 'blight', automatic: true }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'counterAdded', counter: '-1/-1', count: 1 }),
    );
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.expect.zone(AURA, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'exile');
    g.expect.pt(SPIDER, 1, 3);
    g.expect.invariants();
  });

  test('with several creatures the player is asked which one to blight, and the answer gets the counter', () => {
    const g = start(SPIDER, ELVES);
    g.act(0).activate(AURA, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('blight');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    // Only the creatures of the player (CR 701.68a): the enchanted Bears of the opponent is not a choice.
    expect([...d.legal].sort()).toEqual([g.id(SPIDER), g.id(ELVES)].sort());
    g.act(0).choosePermanents(SPIDER);
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.expect.counters(ELVES, {});
    g.passAll();
    g.expect.zone(BEARS, 'exile');
  });

  test('cancelling at the question rewinds the whole activation (CR 733): no counter, the mana unspent, the Aura still there', () => {
    const g = start(SPIDER, ELVES);
    g.act(0).activate(AURA, { pay: true });
    g.expect.pending('choosePermanent', 0);
    g.act(0).cancel();
    g.expect.zone(AURA, 'battlefield', { seat: 0 });
    g.expect.counters(SPIDER, {});
    g.expect.tapped({ name: 'Plains', seat: 0, zone: 'battlefield', nth: 0 }, false);
    g.expect.tapped({ name: 'Plains', seat: 0, zone: 'battlefield', nth: 1 }, false);
    g.expect.pending('priority', 0);
  });

  test('a creature with 1 toughness that is blighted dies, and the exile still happens', () => {
    const g = start(ELVES);
    g.act(0).activate(AURA, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile');
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
  });

  test('the creature the Aura enchants may be the one blighted when its controller is the Aura’s too', () => {
    const g = scenario()
      .define(syntheticCard(AURA))
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Plains', { count: 2 })
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(AURA, { attachedTo: 'spider' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(AURA, { pay: true });
    g.expect.counters(SPIDER, { '-1/-1': 1 });
    g.passAll();
    g.expect.zone(SPIDER, 'exile');
  });

  test('with no creature of yours the ability cannot be activated (CR 701.68b)', () => {
    const g = start();
    g.expect.illegal(0, { activate: AURA });
  });

  test('creatures that can’t have -1/-1 counters are not a choice: with only such creatures the ability cannot be activated (CR 122.6, 701.68b)', () => {
    // The Counter Ward is an artifact creature that says "Creatures you control can't have -1/-1 counters put on them": it protects the Giant Spider too.
    start(WARD).expect.illegal(0, { activate: AURA });
    start(WARD, SPIDER).expect.illegal(0, { activate: AURA });
  });

  test('without the mana the ability cannot be activated', () => {
    const g = scenario()
      .define(syntheticCard(AURA))
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Plains')
      .battlefield(SPIDER)
      .battlefield(AURA, { attachedTo: 'theirBears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirBears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { activate: AURA });
  });
});

describe('"Enchanted creature can’t attack or block."', () => {
  test('the enchanted creature cannot be declared as an attacker', () => {
    const g = scenario()
      .define(syntheticCard(AURA))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER)
      .battlefield(AURA, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack('bears', false);
    g.expect.canAttack(SPIDER, true);
  });

  test('the enchanted creature cannot block', () => {
    const g = scenario()
      .define(syntheticCard(AURA))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'attacker' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'blocker' })
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(AURA, { attachedTo: 'blocker', controller: 1 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('attacker');
    g.passAll();
    g.expect.pending('declareBlockers', 1);
    g.expect.canBlock('blocker', 'attacker', false);
    g.expect.canBlock('spider', 'attacker', true);
  });
});

describe('a blight cost of two counters with {T} (SYNTHETIC Blight Scholar)', () => {
  test('the source itself is the only creature: it is tapped, gets two counters and the ability draws a card', () => {
    const g = scenario()
      .define(syntheticCard(SCHOLAR))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SCHOLAR)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(SCHOLAR);
    g.expect.tapped(SCHOLAR, true);
    g.expect.counters(SCHOLAR, { '-1/-1': 2 });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.pt(SCHOLAR, -1, 2);
  });
});
