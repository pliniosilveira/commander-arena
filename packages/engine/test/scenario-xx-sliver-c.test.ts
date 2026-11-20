// "Choose a creature type. Look at the top four cards of your library. You may reveal any number of cards of the chosen type from among them and put the revealed
// cards into your hand. Put the rest on the bottom of your library in a random order." and "You may cast creature spells of the chosen type from the top of your library."
// Pins: CR 701.20 (Reveal), CR 401.4 (cards put on the bottom at once), CR 205.3m (a changeling is every creature type, CR 702.73a), CR 601.3 and 601.2a (a card
// is cast from where it is, here the top of the library), CR 607.2d (the choice an object made as it entered). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-sliver-c.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SEARCH = 'SYNTHETIC Kin Search';
const WALKER = 'SYNTHETIC Kin Walker';
const ELVES = 'Llanowar Elves'; // Elf Druid
const BEARS = 'Grizzly Bears'; // Bear
const ANGEL = 'Serra Angel'; // Angel
const FILLER = Array.from({ length: 8 }, () => 'Forest');

describe('the cards are valid', () => {
  test.each([SEARCH, WALKER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('look at the top cards, take any number of the type chosen as the spell resolves', () => {
  const game = (top: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(SEARCH)
      .battlefield('Forest', 'Forest')
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('only the cards of the chosen type are offered, and any number of them may be taken', () => {
    const g = game([ELVES, BEARS, ELVES, ANGEL]);
    g.act(0).cast(SEARCH, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    if (d?.kind !== 'chooseCards') return;
    expect(d.purpose).toBe('lookTake');
    expect(d.legal).toHaveLength(2);
    expect(d.max).toBe(2);
    g.act(0).choose({ kind: 'chooseCards', objects: [...d.legal] });
    expect(g.state.seats[0]?.hand.filter((id) => g.state.objects[id]?.card !== null)).toHaveLength(
      2,
    );
    g.expect.librarySize(0, FILLER.length + 2);
    const revealed = g.events.find((e) => e.kind === 'cardsRevealed');
    expect(revealed?.kind === 'cardsRevealed' ? revealed.names : []).toEqual([ELVES, ELVES]);
  });

  test('taking none, or one of two, is allowed; the rest go to the bottom', () => {
    const g = game([ELVES, BEARS, ELVES, ANGEL]);
    g.act(0).cast(SEARCH, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    const one = d.legal[0];
    if (one === undefined) throw new Error('no card');
    g.act(0).choose({ kind: 'chooseCards', objects: [one] });
    g.expect.librarySize(0, FILLER.length + 3);
    g.expect.zone(ELVES, 'hand', { seat: 0 });
  });

  test('no card of the chosen type: nobody is asked', () => {
    const g = game([BEARS, ANGEL, BEARS, ANGEL]);
    g.act(0).cast(SEARCH, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.expect.pending('priority', 0);
    g.expect.librarySize(0, FILLER.length + 4);
  });
});

describe('creature spells of the chosen type from the top of the library', () => {
  test('the permanent that chose Elf lets an Elf on top be cast', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, { chosen: { creatureType: 'Elf' } })
      .battlefield('Forest', 'Forest')
      .library(ELVES, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.expect.legal(0, { cast: ELVES });
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
  });

  test('a creature of another type, a noncreature, and the second card are not offered', () => {
    for (const top of [BEARS, 'Lightning Bolt', 'Island']) {
      const g = scenario()
        .seat(0)
        .battlefield(WALKER, { chosen: { creatureType: 'Elf' } })
        .battlefield('Forest', 'Forest')
        .library(top, ELVES, ...FILLER)
        .seat(1)
        .library(...FILLER)
        .build();
      g.expect.illegal(0, { cast: { name: top, zone: 'library', seat: 0 } });
      g.expect.illegal(0, { cast: { name: ELVES, zone: 'library', seat: 0 } });
    }
  });

  test('without a choice made, nothing may be cast from the top', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, 'Forest', 'Forest')
      .library(ELVES, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.expect.illegal(0, { cast: { name: ELVES, zone: 'library', seat: 0 } });
  });

  test('the type that was chosen is the one read: Bear lets a Bear on top be cast', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, { chosen: { creatureType: 'Bear' } })
      .battlefield('Forest', 'Forest')
      .library(BEARS, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.expect.legal(0, { cast: BEARS });
  });
});
