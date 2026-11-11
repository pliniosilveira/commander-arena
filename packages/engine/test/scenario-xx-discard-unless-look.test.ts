// "Draw three cards. Then discard two cards unless you discard an artifact card" and "Look at the top six cards of your library. You may reveal an
// artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order" (D-139).
// Pins: CR 701.9 (discard: the player chooses), CR 701.9b/608.2d (choices made as the effect resolves), CR 701.20 (reveal), CR 401.4 and 701.24
// (a random order from the game's generator, hidden), CR 121.2 (draws are one at a time), CR 603.2 and 508.1 (an attack trigger of the equipped
// creature), CR 903.9b (a commander moved to the hand or library asks its owner).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-library-artifacts.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const STUDY = 'SYNTHETIC Study Rite'; // draw 3, discard 2 unless an artifact card
const BEAST_RITE = 'SYNTHETIC Beast Rite'; // draw 2, discard 2 unless a creature card
const ARTIFACT_SKETCH = 'SYNTHETIC Artifact Sketch'; // top 6, one artifact card, rest on the bottom in random order
const BEAST_SKETCH = 'SYNTHETIC Beast Sketch'; // top 4, up to two creature cards, rest into the graveyard
const LAND_SKETCH = 'SYNTHETIC Land Sketch'; // top 3, a land card, rest on the bottom
const GEAR = 'SYNTHETIC Scout Gear'; // equipment: when equipped creature attacks, top 6, an artifact card
const TRINKET = 'SYNTHETIC Trinket 1';
const TRINKET2 = 'SYNTHETIC Trinket 2';
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const FILLER = [
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Plains',
] as const;

type Builder = ReturnType<typeof scenario>;

function main(
  library: readonly string[],
  mine: (b: Builder) => Builder,
  seed?: number,
  filler: readonly string[] = FILLER,
) {
  let b = scenario().seat(0).life(20);
  if (seed !== undefined) b = b.seed(seed);
  b = b.library(...library, ...filler);
  return mine(b)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();
}

describe('the cards are valid', () => {
  test.each([STUDY, BEAST_RITE, ARTIFACT_SKETCH, BEAST_SKETCH, LAND_SKETCH, GEAR])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Discard two cards unless you discard an artifact card" (CR 701.9)', () => {
  const rite = (hand: readonly string[]) =>
    main(['Plains', 'Plains', 'Plains'], (b) => {
      let s = b.hand(STUDY).battlefield('Island', { count: 3 });
      for (const card of hand) s = s.hand(card);
      return s;
    });

  test('with an artifact card in hand the player may discard it alone', () => {
    const g = rite([TRINKET, BEARS]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the discard');
    expect(d.purpose).toBe('discard');
    expect(d.min).toBe(1);
    expect(d.max).toBe(2);
    expect(d.orSingle).toEqual([g.id(TRINKET)]);
    g.act(0).chooseCards(TRINKET);
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
    // Hand: Bears and the three Plains drawn.
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });

  test('or two cards, whichever they are', () => {
    const g = rite([TRINKET, BEARS]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    g.act(0).chooseCards(BEARS, { name: 'Plains', nth: 0 });
    g.expect.handSize(0, 3);
    g.expect.zone(TRINKET, 'hand', { seat: 0 });
  });

  test('one card that is not an artifact is not an answer; nor is three', () => {
    const g = rite([TRINKET, BEARS]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseCards(BEARS)).toThrow();
    expect(() => g.act(0).chooseCards(BEARS, TRINKET, { name: 'Plains', nth: 0 })).toThrow();
  });

  test('without an artifact card in hand it is a plain discard of two', () => {
    const g = rite([BEARS]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the discard');
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.orSingle).toBeUndefined();
  });

  test('the legal answers listed are the single artifact cards and the pairs, and each is accepted', () => {
    const g = rite([TRINKET, TRINKET2, BEARS]);
    g.act(0).cast(STUDY, { pay: true });
    g.passAll();
    const answers = getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseCards');
    const sizes = answers.map((a) => (a.kind === 'chooseCards' ? a.objects.length : 0));
    expect(sizes.filter((n) => n === 1)).toHaveLength(2);
    expect(sizes.every((n) => n === 1 || n === 2)).toBe(true);
  });

  test('over another filter: "discard two cards unless you discard a creature card"', () => {
    const g = main(['Plains', 'Plains'], (b) =>
      b.hand(BEAST_RITE).hand(BEARS).hand(GOBLIN).battlefield('Island', { count: 3 }),
    );
    g.act(0).cast(BEAST_RITE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the discard');
    expect(d.orSingle).toHaveLength(2);
    g.act(0).chooseCards(GOBLIN);
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('nothing in the hand matches the filter: both drawn cards are simply discarded, with no question about the alternative', () => {
    const g = main(['Plains'], (b) => b.hand(BEAST_RITE).battlefield('Island', { count: 3 }));
    // Draw two, so the hand holds two Plains and nothing matches: a plain discard of both.
    g.act(0).cast(BEAST_RITE, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });
});

describe('"Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand" (CR 701.20)', () => {
  const top = (cards: readonly string[]) =>
    main(cards, (b) => b.hand(ARTIFACT_SKETCH).battlefield('Island', { count: 2 }));

  test('the artifact card among the six is taken; the other five go to the bottom, hidden, in a random order', () => {
    const g = top([BEARS, 'Plains', TRINKET, GOBLIN, 'Plains', 'Plains']);
    const before = g.state.seats[0]?.library.length ?? 0;
    g.act(0).cast(ARTIFACT_SKETCH, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the choice');
    expect(d.purpose).toBe('lookTake');
    expect(d.zone).toBe('library');
    expect(d.looked).toHaveLength(6);
    expect(d.legal).toHaveLength(1);
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    g.act(0).chooseCards(TRINKET);
    g.expect.zone(TRINKET, 'hand', { seat: 0 });
    expect(g.state.seats[0]?.library.length).toBe(before - 1);
    // The five went to the bottom: the top of the library is what was below the six.
    const topNow = g.state.seats[0]?.library[0];
    expect(topNow === undefined ? null : g.state.objects[topNow]?.card).not.toBeNull();
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsBottomed' && e.count === 5)).toBe(true);
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsRevealed')).toBe(true);
    g.expect.invariants();
  });

  test('the player may take none: all six go to the bottom', () => {
    const g = top([TRINKET, BEARS, 'Plains', 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(ARTIFACT_SKETCH, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(TRINKET, 'library', { seat: 0 });
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsBottomed' && e.count === 6)).toBe(true);
  });

  test('no artifact card among them: nothing is asked and all go to the bottom', () => {
    const g = top([BEARS, GOBLIN, 'Plains', 'Plains', 'Plains', 'Plains', TRINKET]);
    g.act(0).cast(ARTIFACT_SKETCH, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    // The artifact below the sixth card was not looked at: it is now the top card.
    g.expect.zone(TRINKET, 'library', { seat: 0 });
    expect(g.state.seats[0]?.library[0]).toBe(g.id(TRINKET));
  });

  test('the order of the bottom is random but fixed by the seed: the same seed gives the same library', () => {
    const run = (seed: number) => {
      const g = main([TRINKET, BEARS, GOBLIN, 'Plains', 'Plains', 'Plains'], (b) =>
        b.hand(ARTIFACT_SKETCH).battlefield('Island', { count: 2 }).seed(seed),
      );
      g.act(0).cast(ARTIFACT_SKETCH, { pay: true });
      g.passAll();
      g.act(0).chooseCards();
      return g.state.seats[0]?.library.map((id) => g.state.objects[id]?.card);
    };
    expect(run(5)).toEqual(run(5));
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(run(s))));
    expect(orders.size).toBeGreaterThan(1);
  });

  test('fewer cards than six in the library: it looks at what there is and the artifact card among them is taken', () => {
    const g = main(
      [BEARS, TRINKET],
      (b) => b.hand(ARTIFACT_SKETCH).battlefield('Island', { count: 2 }),
      undefined,
      [],
    );
    g.act(0).cast(ARTIFACT_SKETCH, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the choice');
    expect(d.looked).toHaveLength(2);
    g.act(0).chooseCards(TRINKET);
    g.expect.zone(TRINKET, 'hand', { seat: 0 });
    g.expect.librarySize(0, 1);
  });

  test('another count, another filter, up to two cards, the rest into the graveyard', () => {
    const g = main([BEARS, TRINKET, GOBLIN, 'Plains', BEARS], (b) =>
      b.hand(BEAST_SKETCH).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(BEAST_SKETCH, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the choice');
    expect(d.looked).toHaveLength(4);
    expect(d.legal).toHaveLength(2);
    expect(d.max).toBe(2);
    g.act(0).chooseCards({ name: BEARS, nth: 0 }, GOBLIN);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(GOBLIN, 'hand', { seat: 0 });
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('a land card, three looked at', () => {
    const g = main([BEARS, 'Forest', TRINKET], (b) =>
      b.hand(LAND_SKETCH).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(LAND_SKETCH, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });
});

describe('"Whenever equipped creature attacks, look at the top six cards ..." (CR 508.1, 603.2)', () => {
  test('the equipped creature attacking triggers it; another creature attacking does not', () => {
    const g = main([BEARS, TRINKET, 'Plains', 'Plains', 'Plains', 'Plains'], (b) =>
      b
        .battlefield(GEAR, { attachedTo: 'wearer' })
        .battlefield(BEARS, { label: 'wearer' })
        .battlefield(GOBLIN),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(GOBLIN);
    g.expect.stack([]);
    const g2 = main([BEARS, TRINKET, 'Plains', 'Plains', 'Plains', 'Plains'], (b) =>
      b.battlefield(GEAR, { attachedTo: 'wearer' }).battlefield(BEARS, { label: 'wearer' }),
    );
    g2.advanceTo('declareAttackers');
    g2.act(0).attack('wearer');
    g2.expect.stack([`${GEAR} (ability)`]);
    g2.passAll();
    g2.expect.pending('chooseCards', 0);
    g2.act(0).chooseCards(TRINKET);
    g2.expect.zone(TRINKET, 'hand', { seat: 0 });
  });
});
