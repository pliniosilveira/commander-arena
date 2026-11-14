// The Dragons the earlier primitives already ran in shape (D-151): Dragonstorm Globe's "Each Dragon you control enters with an additional +1/+1 counter",
// Haven of the Spirit Dragon's "Return target Dragon creature card or Ugin planeswalker card from your graveyard to your hand", the second ability of Orb of
// Dragonkind (look at the top seven cards, take a Dragon, the rest to the bottom). They are written here the way the parser must write them.
// Pins: CR 614.1c and 122.6 (enters with counters), CR 701.20 (reveal), CR 401.4 (a random order). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-dragons-existing.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GLOBE = 'SYNTHETIC Storm Globe';
const SANCTUM = 'SYNTHETIC Dragon Sanctum';
const SEEKER = 'SYNTHETIC Dragon Seeker';
const DRAKE = 'SYNTHETIC Plain Drake';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([GLOBE, SANCTUM, SEEKER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"each Dragon you control enters with an additional +1/+1 counter on it"', () => {
  test('a Dragon enters with a counter, another creature does not', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(GLOBE)
      .hand(DRAKE, BEARS)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(DRAKE, { pay: true });
    g.passAll();
    g.expect.counters(DRAKE, { '+1/+1': 1 });
    g.expect.pt(DRAKE, 4, 4);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
  });
});

describe('the land that returns a Dragon card from the graveyard', () => {
  function game() {
    return scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SANCTUM, 'Mountain', 'Mountain')
      .graveyard(DRAKE, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
  }

  test('only the Dragon card is a target; the land is sacrificed', () => {
    const g = game();
    const ability = g.act(0);
    ability.activate(SANCTUM, { targets: [DRAKE], pay: true });
    g.passAll();
    g.expect.zone(DRAKE, 'hand', { seat: 0 });
    g.expect.zone(SANCTUM, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a creature card that is not a Dragon is not a legal target', () => {
    const g = game();
    expect(() => g.act(0).activate(SANCTUM, { targets: [BEARS], pay: true })).toThrow();
  });
});

describe('look at the top seven cards, take a Dragon, the rest to the bottom', () => {
  test('I may reveal a Dragon card and put it into my hand; the others go to the bottom', () => {
    const g = scenario()
      .seat(0)
      .library(
        BEARS,
        'Mountain',
        DRAKE,
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Forest',
        'Forest',
      )
      .battlefield(SEEKER, 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).activate(SEEKER, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    if (d?.kind !== 'chooseCards') return;
    expect(d.purpose).toBe('lookTake');
    expect(d.looked).toHaveLength(7);
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards(DRAKE);
    g.expect.zone(DRAKE, 'hand', { seat: 0 });
    // 9 cards in the library, 7 looked at, 1 taken: the 6 others go to the bottom behind the 2 that were not looked at
    g.expect.librarySize(0, 8);
    g.expect.zone(SEEKER, 'graveyard', { seat: 0 });
  });
});
