// "Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control" and its siblings (D-149).
// Pins: CR 614.1c and 614.12 (a replacement effect changes how a permanent enters, read from the game without it), CR 122.6 (the
// counters are there as it enters), CR 111.1 (a token enters too), CR 205.3m (the chosen creature type), CR 113.6 (the ability works on the
// battlefield: another permanent, and not for the permanent itself). Cards are SYNTHETIC (src/cards/fixtures/synthetic-enters-group.ts)
// or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CHIEF = 'SYNTHETIC Chief Angel';
const MIMIC = 'SYNTHETIC Type Mimic';
const BANNER = 'SYNTHETIC Growth Banner';
const SHRINE = 'SYNTHETIC Withering Shrine';
const SUMMONS = 'SYNTHETIC Angel Summons';
const ANGEL = 'Serra Angel'; // an Angel, 4/4
const BEARS = 'Grizzly Bears';
const REANIMATE = 'SYNTHETIC Reanimate Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([CHIEF, MIMIC, BANNER, SHRINE, SUMMONS])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const lands = ['Plains', 'Plains', 'Plains', 'Plains', 'Forest', 'Forest'] as const;

describe('"for each Angel you already control"', () => {
  test('the Chief alone: an Angel enters with one counter (the Chief)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(ANGEL)
      .battlefield(CHIEF, ...lands)
      .seat(1)
      .build();
    g.act(0).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.counters(ANGEL, { '+1/+1': 1 });
    g.expect.pt(ANGEL, 5, 5);
  });

  test('two Angels already there: two counters', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(ANGEL)
      .battlefield(CHIEF, ...lands)
      .battlefield('SYNTHETIC Chief Angel', { label: 'second' })
      .seat(1)
      .build();
    // Two Chiefs: each gives counters for all three Angels the second time round; here the first Angel entering sees two Angels
    // already (the two Chiefs) and gets two counters from each Chief.
    g.act(0).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.counters(ANGEL, { '+1/+1': 4 });
  });

  test('the Chief itself enters with no counter from its own ability', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(CHIEF)
      .battlefield(...lands)
      .seat(1)
      .build();
    g.act(0).cast(CHIEF, { pay: true });
    g.passAll();
    g.expect.counters(CHIEF, {});
  });

  test('a creature that is not an Angel enters with none', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(CHIEF, ...lands)
      .seat(1)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
  });

  test('an opponent\'s Angel enters with none ("you control")', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CHIEF)
      .seat(1)
      .library(...LIBRARY)
      .hand(ANGEL)
      .battlefield(...lands)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.counters(ANGEL, {});
  });

  test('a token Angel enters with the counters too', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(SUMMONS)
      .battlefield(CHIEF, ...lands)
      .seat(1)
      .build();
    g.act(0).cast(SUMMONS, { pay: true });
    g.passAll();
    g.expect.counters('Angel', { '+1/+1': 1 });
    g.expect.pt('Angel', 4, 4);
  });

  test('an Angel put onto the battlefield from the graveyard enters with them too, and so does it without the ability gone', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(REANIMATE)
      .graveyard(ANGEL)
      .battlefield(CHIEF, 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    g.act(0).cast(REANIMATE, { targets: [ANGEL], pay: true });
    g.passAll();
    // One counter from the Chief and two from the card's own "if it's an Angel".
    g.expect.counters(ANGEL, { '+1/+1': 3 });
  });

  test('it stops when the Chief leaves the battlefield', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(ANGEL)
      .battlefield(CHIEF, ...lands)
      .seat(1)
      .library(...LIBRARY)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [CHIEF], pay: true });
    g.passAll();
    g.act(0).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.counters(ANGEL, {});
  });
});

describe('"of the chosen type"', () => {
  const withMimic = (type: string) => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MIMIC, BEARS, ANGEL)
      .battlefield(...lands, 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(MIMIC, { pay: true });
    g.passAll();
    g.act(0).chooseOption(type);
    return g;
  };

  test('a creature of the chosen type enters with a counter', () => {
    const g = withMimic('Angel');
    g.expect.derived(MIMIC, { subtypes: ['Shapeshifter', 'Angel'] });
    g.act(0).cast(ANGEL, { pay: true });
    g.passAll();
    g.expect.counters(ANGEL, { '+1/+1': 1 });
  });

  test('a creature of another type enters with none', () => {
    const g = withMimic('Angel');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
  });

  test('the choice is read from the permanent: choosing Bear counts the Bears', () => {
    const g = withMimic('Bear');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
  });
});

describe('other numbers, filters and counters', () => {
  test('"each nontoken creature you control enters with two additional counters": a spell, not a token', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS, SUMMONS)
      .battlefield(BANNER, ...lands)
      .seat(1)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 2 });
    g.act(0).cast(SUMMONS, { pay: true });
    g.passAll();
    g.expect.counters('Angel', {});
  });

  test('"each creature your opponents control enters with a -1/-1 counter": the opponent\'s creature, not mine', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(SHRINE, ...lands)
      .seat(1)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(...lands)
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters({ name: BEARS, seat: 0 }, {});
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters({ name: BEARS, seat: 1 }, { '-1/-1': 1 });
    g.expect.pt({ name: BEARS, seat: 1 }, 1, 1);
  });
});
