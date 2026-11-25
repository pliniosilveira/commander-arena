// "Search your library for a card that shares a color with a legendary creature you control" (Ringsight, `ObjectFilter.sharesColorWith`), after "The Ring tempts you".
// Pins: CR 105.1 and 105.2c (a color the cards have in common; a colorless card has none to share), CR 109.4 (the creatures you control), CR 701.54a, 205.4 (the Ring-bearer is legendary: the
// emblem's first ability), CR 701.23b (a stated quality: finding nothing is allowed), CR 701.20 (reveal), CR 701.24 (shuffle).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-shares-color.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const SEEK = 'SYNTHETIC Ring Seek'; // {1}{U}{B} sorcery
const ISAMARU = 'Isamaru, Hound of Konda'; // legendary white creature
const ELVES = 'Llanowar Elves'; // green, not legendary until it is the Ring-bearer
const SERRA = 'Serra Angel'; // white
const COUNTERSPELL = 'Counterspell'; // blue
const BOLT = 'Lightning Bolt'; // red
const SOL_RING = 'Sol Ring'; // colorless
const SPIDER = 'Giant Spider'; // green

test('the card is valid', () => {
  expect(validateCard(syntheticCard(SEEK))).toEqual([]);
});

const board = (battlefield: readonly string[], seats: 2 | 3 = 2) => {
  let b = scenario({ seats }).seat(0).hand(SEEK).battlefield('Island', 'Swamp', 'Island');
  for (const name of battlefield) b = b.battlefield(name);
  b = b
    .library(SERRA, { label: 'serra' })
    .library(COUNTERSPELL, { label: 'counter' })
    .library(BOLT, { label: 'bolt' })
    .library(SOL_RING, { label: 'ring' })
    .library(SPIDER, { label: 'spider' })
    .seat(1)
    .library('Plains', 'Plains');
  if (seats === 3) b = b.seat(2).library('Plains', 'Plains');
  return b.at('precombatMain', { active: 0 }).build();
};

describe('the cards found share a color with a legendary creature you control', () => {
  test('a white legendary creature: the white card is offered, no other and no colorless one (CR 105.2c)', () => {
    const g = board([ISAMARU]);
    g.act(0).cast(SEEK, { pay: true });
    g.passAll();
    // One creature: the Ring-bearer is chosen without a question.
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('search');
    expect(d.legal).toEqual([g.id('serra')]);
    // CR 701.23b: a stated quality, so finding nothing is allowed.
    expect(d.min).toBe(0);
    expect(d.reveal).toBe(true);
  });

  test('the Ring tempts first: the Ring-bearer is legendary, so a green card is found for it (CR 701.54c)', () => {
    const g = board([ELVES]);
    g.act(0).cast(SEEK, { pay: true });
    g.passAll();
    g.expect.ringBearer(0, g.id(ELVES));
    const d = chooseCardsDecision(g);
    expect(d.legal).toEqual([g.id('spider')]);
  });

  test('a creature that is not legendary becomes so as the Ring-bearer, and only its own color matches', () => {
    const g = board([SERRA]);
    g.act(0).cast(SEEK, { pay: true });
    g.passAll();
    // The Ring-bearer is Serra Angel, legendary and white: only the white card of the library matches.
    const d = chooseCardsDecision(g);
    expect(d.legal).toEqual([g.id('serra')]);
  });

  test('with no creature at all there is no legendary creature to share a color with: the search finds nothing', () => {
    const g = board([]);
    g.act(0).cast(SEEK, { pay: true });
    g.passAll();
    g.expect.ringLevel(0, 1);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test("an opponent's legendary creature does not count (CR 109.4)", () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand(SEEK)
      .battlefield('Island', 'Swamp', 'Island')
      .library(SERRA, { label: 'serra' })
      .library(SPIDER, { label: 'spider' })
      .seat(1)
      .battlefield(ISAMARU)
      .library('Plains', 'Plains')
      .seat(2)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SEEK, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});
