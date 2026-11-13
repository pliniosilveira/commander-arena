// The Danitha deck (issue 26), group 5 (D-1251 provisional): "Whenever a creature enters, you may attach this Aura to that creature." (Shielded by Faith).
// Pins: CR 701.3 (to attach an Aura to an object is to move it onto that object), CR 303.4j (an effect that attaches an Aura on the battlefield to an object it can't legally
// enchant does nothing: the Aura doesn't move), CR 702.5a (Enchant: what the Aura can enchant), CR 702.16d (protection: it can't be enchanted by an Aura of that color), CR 603.5
// (a "may" of a trigger is answered as it resolves), CR 603.2 (the trigger is about any creature, whoever controls it), CR 701.3c (moving it gives it a new timestamp).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const AURA = 'SYNTHETIC Wandering Aura';
const LOYAL = 'SYNTHETIC Loyal Wanderer';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([AURA, LOYAL])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 has the Aura on its Bears and casts Elves from its hand. */
function ownCreature(aura = AURA) {
  return scenario()
    .define(syntheticCard(aura))
    .seat(0)
    .library(...LIBRARY)
    .hand(ELVES)
    .battlefield('Forest')
    .battlefield(BEARS, { label: 'bears' })
    .battlefield(aura, { attachedTo: 'bears' })
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
}

describe('"Whenever a creature enters, you may attach this Aura to that creature"', () => {
  test('a creature enters: the controller is asked, and on a yes the Aura moves to it', () => {
    const g = ownCreature();
    g.expect.attached(AURA, 'bears');
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.attached(AURA, ELVES);
    // The Bears lose the indestructible the Aura gave, and the Elves have it.
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.derived(ELVES, { keywords: ['indestructible'] });
    g.expect.invariants();
  });

  test('on a no the Aura stays on the creature it enchants', () => {
    const g = ownCreature();
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.attached(AURA, 'bears');
    g.expect.derived(BEARS, { keywords: ['indestructible'] });
    g.expect.derived(ELVES, { keywords: [] });
  });

  test('a creature of another player enters: the Aura (still its controller’s) may move onto it', () => {
    const g = scenario()
      .define(syntheticCard(AURA))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(AURA, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .hand(ELVES)
      .battlefield('Forest')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.attached(AURA, ELVES);
    g.expect.zone(AURA, 'battlefield', { seat: 0 });
  });

  test('an Aura that can enchant only its controller’s creatures does not move onto another player’s (CR 303.4j)', () => {
    const g = scenario()
      .define(syntheticCard(LOYAL))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(LOYAL, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .hand(ELVES)
      .battlefield('Forest')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(ELVES, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.attached(LOYAL, 'bears');
    g.expect.zone(LOYAL, 'battlefield', { seat: 0 });
  });

  test('the same Aura moves onto its controller’s own new creature', () => {
    const g = ownCreature(LOYAL);
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.attached(LOYAL, ELVES);
  });

  test('a noncreature permanent that enters does not trigger it', () => {
    const g = scenario()
      .define(syntheticCard(AURA))
      .seat(0)
      .library(...LIBRARY)
      .hand('Sol Ring')
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(AURA, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Sol Ring', { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.attached(AURA, 'bears');
  });
});
