// Gaining life: the replacement "If you would gain life, you gain that much life plus N instead", the trigger "whenever you gain life
// [for the first time each turn]", the trigger "whenever you put one or more counters on ...", and "this ability triggers only once each turn" (D-149).
// Pins: CR 119.3 (a life gain adjusts the life total), CR 119.9 (a gain of 0 life is no event and triggers nothing), CR 119.10 (a gain of 0
// life is not replaced), CR 614.1a (a replacement effect changes the event, each applies once, so two add up), CR 702.15b (lifelink gains life
// as the damage is dealt: it is a gain too), CR 603.2 (a trigger is noticed once for each event; "only once each turn" ignores the rest),
// CR 122.6 and 122.6a (counters are put by a player; an object that enters with counters has them put by its controller).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-life-gain.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const VITAL = 'SYNTHETIC Vital Angel';
const RADIANT = 'SYNTHETIC Radiant Angel';
const SEER = 'SYNTHETIC Seer Seraph';
const PINGER = 'SYNTHETIC Dawn Pinger';
const ENVIOUS = 'SYNTHETIC Envious Angel';
const WATCHFUL = 'SYNTHETIC Watchful Angel';
const GROWING = 'SYNTHETIC Growing Light';
const ADMIRER = 'SYNTHETIC Counter Admirer';
const COLLECTOR = 'SYNTHETIC Counter Collector';
const MEND = 'SYNTHETIC Mend';
const MEND_TWICE = 'SYNTHETIC Mend Twice';
const MEND_NOTHING = 'SYNTHETIC Mend Nothing';
const MEND_THEM = 'SYNTHETIC Mend Them';
const BOON = 'SYNTHETIC Counter Boon';
const ROT = 'SYNTHETIC Rot Boon';
const HAWK = "Healer's Hawk"; // 1/1 flying lifelink
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([
    VITAL,
    RADIANT,
    SEER,
    PINGER,
    ENVIOUS,
    WATCHFUL,
    GROWING,
    ADMIRER,
    COLLECTOR,
    MEND,
    MEND_TWICE,
    MEND_NOTHING,
    MEND_THEM,
    BOON,
    ROT,
  ])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const base = () =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Plains', 'Plains', 'Plains');

describe('"If you would gain life, you gain that much life plus N instead"', () => {
  test('a gain of 3 is 4 with a plus 1', () => {
    const g = base().hand(MEND).battlefield(VITAL).seat(1).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 44);
  });

  test("the number is the card's: plus 3 makes a gain of 3 into 6", () => {
    const g = base().hand(MEND).battlefield(RADIANT).seat(1).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 46);
  });

  test('two of them each apply once and add up', () => {
    const g = base().hand(MEND).battlefield(VITAL, RADIANT).seat(1).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 47);
  });

  test('a gain of 0 life is no event and is not replaced (CR 119.10)', () => {
    const g = base().hand(MEND_NOTHING).battlefield(VITAL).seat(1).build();
    g.act(0).cast(MEND_NOTHING, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.noEvent({ kind: 'lifeGained' });
  });

  test("it applies to the controller's gains only: an opponent gaining life is not changed", () => {
    const g = base().hand(MEND_THEM).battlefield(VITAL).seat(1).build();
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 42);
  });

  test("an opponent's permanent does not change my gain", () => {
    const g = base().hand(MEND).seat(1).battlefield(VITAL).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });

  test('lifelink damage is a gain too', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HAWK, VITAL)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(HAWK);
    g.advanceTo('endOfCombat', { block: false });
    g.expect.life(1, 39);
    g.expect.life(0, 42);
  });

  test('it is the ability of the permanent: it stops when the permanent leaves', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield('Plains', 'Plains', 'Plains')
      .battlefield(VITAL, { label: 'vital' })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: ['vital'], pay: true });
    g.passAll();
    g.expect.zone(VITAL, 'graveyard', { seat: 0 });
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });

  test('"+2/+2 as long as you have 25 or more life"', () => {
    const high = scenario().seat(0).life(30).battlefield(VITAL).seat(1).build();
    high.expect.pt(VITAL, 4, 4);
    const edge = scenario().seat(0).life(25).battlefield(VITAL).seat(1).build();
    edge.expect.pt(VITAL, 4, 4);
    const low = scenario().seat(0).life(24).battlefield(VITAL).seat(1).build();
    low.expect.pt(VITAL, 2, 2);
  });
});

describe('"Whenever you gain life for the first time each turn"', () => {
  test('one gain triggers it', () => {
    const g = base().hand(MEND).battlefield(PINGER).seat(1).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(1, 39);
  });

  test('two gains in one resolution trigger it once', () => {
    const g = base().hand(MEND_TWICE).battlefield(PINGER).seat(1).build();
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.passAll();
    g.expect.life(0, 44);
    g.expect.life(1, 39);
  });

  test('a second spell in the same turn does not trigger it again; the next turn does', () => {
    const g = base()
      .hand(MEND, MEND, MEND)
      .battlefield(PINGER)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(`${MEND}[0]`, { pay: true });
    g.passAll();
    g.act(0).cast(`${MEND}[0]`, { pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(1, 38);
  });

  test('an opponent gaining life is not a gain of mine', () => {
    const g = base().hand(MEND_THEM).battlefield(PINGER).seat(1).build();
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 42);
  });

  test('the real shape: surveil 1 asks the controller to arrange the top card', () => {
    const g = base().hand(MEND).battlefield(SEER).seat(1).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.pending('arrangeCards', 0);
  });
});

describe('"Whenever a player gains life" and "whenever an opponent gains life"', () => {
  test("any player: my gain and the opponent's gain each trigger it", () => {
    const g = base().hand(MEND, MEND_THEM).battlefield(ENVIOUS).seat(1).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 42); // +3, -1
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('an opponent gaining life draws a card for the Watcher, my own gain does not', () => {
    const g = base().hand(MEND, MEND_THEM).battlefield(WATCHFUL).seat(1).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1); // Mend was cast, the hand held MEND_THEM only
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.handSize(0, 1); // MEND_THEM left, one card drawn
  });
});

describe('"Whenever you put one or more +1/+1 counters on this creature, draw a card. This ability triggers only once each turn."', () => {
  const game = () =>
    base()
      .hand(MEND, MEND_TWICE, BOON)
      .battlefield(GROWING, 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('a life gain puts a counter and the counter draws a card', () => {
    const g = game();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.counters(GROWING, { '+1/+1': 1 });
    g.expect.handSize(0, 3); // BOON and MEND_TWICE, plus one drawn
  });

  test('two gains put two counters but draw once', () => {
    const g = game();
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.passAll();
    g.expect.counters(GROWING, { '+1/+1': 2 });
    g.expect.handSize(0, 3); // MEND and BOON, plus one drawn
  });

  test('another source of counters in the same turn does not draw again; the next turn does', () => {
    const g = game();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.act(0).cast(BOON, { targets: [GROWING], pay: true });
    g.passAll();
    g.expect.counters(GROWING, { '+1/+1': 3 });
    g.expect.handSize(0, 2); // MEND_TWICE and one drawn; BOON and MEND left
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.passAll();
    g.expect.counters(GROWING, { '+1/+1': 5 });
  });
});

describe('who put the counters, and which kind', () => {
  test('"you put": my counters on my creature trigger it, the opponent\'s on my creature do not', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BOON)
      .battlefield(ADMIRER, BEARS, 'Forest')
      .seat(1)
      .hand(BOON)
      .battlefield('Forest')
      .build();
    g.act(0).cast(BOON, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 41);
    g.act(0).pass();
    g.act(1).cast(BOON, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 41);
    g.expect.counters(BEARS, { '+1/+1': 4 });
  });

  test('any kind of counter: a -1/-1 counter I put counts', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(ROT)
      .battlefield(ADMIRER, BEARS, 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast(ROT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('"by any player", only +1/+1 counters: both players\' counters trigger it, a -1/-1 counter does not', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BOON, ROT)
      .battlefield(COLLECTOR, BEARS, 'Forest', 'Swamp')
      .seat(1)
      .hand(BOON)
      .battlefield('Forest')
      .build();
    g.act(0).cast(BOON, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.act(0).cast(ROT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.act(0).pass();
    g.act(1).cast(BOON, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(1, 38);
  });
});
