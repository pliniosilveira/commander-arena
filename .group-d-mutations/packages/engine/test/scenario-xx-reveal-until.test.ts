// "Reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the
// bottom of your library in a random order." and "Look at the top four cards ... You may reveal a creature card with mana value less than or
// equal to the number of lands you control from among them and put it onto the battlefield." (D-145): the effect `revealUntil` and the
// destination, tapped flag and mana value limit of `lookAtTop.take`.
// Pins: CR 701.20 (reveal: every card revealed is shown to all players), CR 401.4 and 701.24 (a random order from the game's generator),
// CR 110.2a (put onto the battlefield: under the control of the player doing it), CR 614.1c (enters tapped), CR 202.3 (mana value),
// CR 400.7j ("it": the new object), CR 603.6a (an enters trigger), CR 903.9b (a commander moved to a library or hand asks its owner).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-reveal.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const DIGGER = 'SYNTHETIC Land Digger';
const LUCKY = 'SYNTHETIC Lucky Dig';
const SEEKER = 'SYNTHETIC Big Seeker';
const SCOUT = 'SYNTHETIC Land Scout';
const TAPPED_SCOUT = 'SYNTHETIC Tapped Scout';
const BEARS = 'Grizzly Bears'; // MV 2
const SPIDER = 'Giant Spider'; // MV 4
const ELVES = 'Llanowar Elves'; // MV 1
const ANGEL = 'Serra Angel'; // MV 5, power 4
const YARGLE = 'Yargle, Glutton of Urborg';

const libraryCards = (g: ScenarioGame, seat: 0 | 1 = 0) =>
  (g.state.seats[seat]?.library ?? []).map((id) => g.state.objects[id]?.card);

describe('the cards are valid', () => {
  test.each([DIGGER, LUCKY, SEEKER, SCOUT, TAPPED_SCOUT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('reveal until a land card: onto the battlefield tapped, the rest on the bottom', () => {
  const game = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(DIGGER)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library(...library)
      .seat(1)
      .library('Island', 'Island')
      .build();

  test('the first land is found after two other cards: it enters tapped, those two go to the bottom', () => {
    const g = game([BEARS, SPIDER, 'Swamp', 'Island', 'Plains']);
    const swamp = g.id('Swamp');
    g.act(0).cast(DIGGER, { pay: true });
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.tapped('Swamp', true);
    expect(g.state.objects[swamp]).toBeUndefined();
    // The top of the library is what was below the revealed cards; Bears and Spider are the last two cards.
    const library = g.state.seats[0]?.library ?? [];
    expect(library).toHaveLength(4);
    const top = library[0];
    expect(top === undefined ? undefined : g.state.objects[top]?.zone).toBe('library');
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(SPIDER, 'library', { seat: 0 });
    expect(library.slice(2).map((id) => g.state.objects[id]?.card).length).toBe(2);
    g.expect.invariants();
  });

  test('the cards revealed are public: the event lists all three by name, the land included (CR 701.20)', () => {
    const g = game([BEARS, SPIDER, 'Swamp', 'Island']);
    g.act(0).cast(DIGGER, { pay: true });
    g.passAll();
    const reveal = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(reveal?.kind === 'cardsRevealed' ? reveal.names : []).toEqual([BEARS, SPIDER, 'Swamp']);
  });

  test('the first card is a land: only that one is revealed and nothing goes to the bottom', () => {
    const g = game(['Swamp', BEARS]);
    g.act(0).cast(DIGGER, { pay: true });
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsBottomed')).toBe(false);
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });

  test('no land in the library: the whole library is revealed and goes to the bottom, nothing enters', () => {
    const g = game([BEARS, SPIDER, ELVES]);
    g.act(0).cast(DIGGER, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.library).toHaveLength(3);
    expect(g.find({ name: 'Swamp', zone: 'battlefield' })).toHaveLength(0);
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsBottomed' && e.count === 3)).toBe(true);
  });

  test('an empty library does nothing', () => {
    const g = game([]);
    g.act(0).cast(DIGGER, { pay: true });
    g.passAll();
    g.expect.zone(DIGGER, 'battlefield', { seat: 0 });
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsRevealed')).toBe(false);
  });

  test('the order of the bottom is random but fixed by the seed (CR 401.4)', () => {
    const run = (seed: number) => {
      const g = scenario()
        .seat(0)
        .seed(seed)
        .hand(DIGGER)
        .battlefield('Forest', 'Forest', 'Forest', 'Forest')
        .library(BEARS, SPIDER, ELVES, ANGEL, 'Swamp', 'Island')
        .seat(1)
        .library('Island')
        .build();
      g.act(0).cast(DIGGER, { pay: true });
      g.passAll();
      return libraryCards(g);
    };
    expect(run(3)).toEqual(run(3));
    expect(
      new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(run(s)))).size,
    ).toBeGreaterThan(1);
  });

  test('a commander revealed on the way asks its owner: the command zone or the bottom (CR 903.9b)', () => {
    const g = scenario()
      .seat(0)
      .hand(DIGGER)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library(YARGLE, { commander: true })
      .library('Swamp', 'Island')
      .seat(1)
      .library('Island')
      .build();
    g.act(0).cast(DIGGER, { pay: true });
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(YARGLE, 'command', { seat: 0 });
  });
});

describe('"it" is the card found, and the destination can be the hand', () => {
  test('a land put onto the battlefield gets the counter the same spell puts on "it"', () => {
    const g = scenario()
      .seat(0)
      .hand(LUCKY)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(BEARS, 'Swamp', 'Island')
      .seat(1)
      .library('Island')
      .build();
    g.act(0).cast(LUCKY, { pay: true });
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.tapped('Swamp', false);
    g.expect.counters('Swamp', { '+1/+1': 1 });
  });

  test('no card found: "it" is nothing and no counter is put anywhere', () => {
    const g = scenario()
      .seat(0)
      .hand(LUCKY)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(BEARS, SPIDER)
      .seat(1)
      .library('Island')
      .build();
    g.act(0).cast(LUCKY, { pay: true });
    g.passAll();
    g.expect.zone(LUCKY, 'graveyard', { seat: 0 });
  });

  test('until a creature card with power 4 or greater: it goes to the hand, the others to the bottom', () => {
    const g = scenario()
      .seat(0)
      .hand(SEEKER)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(BEARS, 'Swamp', ANGEL, ELVES)
      .seat(1)
      .library('Island')
      .build();
    g.act(0).cast(SEEKER, { pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone('Swamp', 'library', { seat: 0 });
    expect(g.state.seats[0]?.library).toHaveLength(3);
  });
});

describe('look at the top four, put a creature card onto the battlefield (mana value limit)', () => {
  const game = (lands: number, library: readonly string[], scout = SCOUT) =>
    scenario()
      .seat(0)
      .battlefield(scout, { label: 'scout' })
      .battlefield('Forest', { count: lands })
      .library(...library, 'Plains', 'Plains')
      .seat(1)
      .library('Island')
      .build();

  const choice = (g: ScenarioGame) => {
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected the choice, got ${d?.kind}`);
    return d;
  };

  test('with two lands only the cards of mana value 2 or less are offered', () => {
    const g = game(2, [ANGEL, BEARS, SPIDER, ELVES]);
    g.act(0).activate('scout');
    g.passAll();
    const d = choice(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.looked).toHaveLength(4);
    expect([...d.legal].sort()).toEqual([g.id(BEARS), g.id(ELVES)].sort());
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
    g.expect.zone(ANGEL, 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('the number of lands is read as the effect runs: five lands offer the mana value 5 as well', () => {
    const g = game(5, [ANGEL, BEARS, SPIDER, ELVES]);
    g.act(0).activate('scout');
    g.passAll();
    expect(choice(g).legal).toHaveLength(4);
  });

  test('a card that is not a creature is never offered, whatever its mana value', () => {
    const g = game(5, ['Island', 'Swamp', 'Mountain', BEARS]);
    g.act(0).activate('scout');
    g.passAll();
    expect(choice(g).legal).toEqual([g.id(BEARS)]);
  });

  test('nothing eligible: nothing is asked, all four go to the bottom', () => {
    const g = game(1, [ANGEL, SPIDER, BEARS, 'Island']);
    g.act(0).activate('scout');
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsBottomed' && e.count === 4)).toBe(true);
  });

  test('the player may take none', () => {
    const g = game(3, [BEARS, ELVES, SPIDER, 'Island']);
    g.act(0).activate('scout');
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });

  test('"tapped": the creature enters tapped', () => {
    const g = game(3, [BEARS, 'Island', 'Island', 'Island'], TAPPED_SCOUT);
    g.act(0).activate('scout');
    g.passAll();
    g.act(0).chooseCards(BEARS);
    g.expect.tapped(BEARS, true);
  });

  test('a creature put onto the battlefield enters under its controller control and may have an enters trigger', () => {
    const g = game(4, [DIGGER, 'Island', 'Island', 'Island']);
    g.act(0).activate('scout');
    g.passAll();
    g.act(0).chooseCards(DIGGER);
    g.expect.zone(DIGGER, 'battlefield', { seat: 0 });
    // Its enters trigger is on the stack above nothing.
    g.expect.stack([`${DIGGER} (ability)`]);
  });
});

describe('validation', () => {
  const withEffect = (e: object) =>
    ({
      ...syntheticCard(SEEKER),
      faces: [{ ...syntheticCard(SEEKER).faces[0], spell: { effect: e } }],
    }) as unknown as Parameters<typeof validateCard>[0];

  test('revealUntil: a filter of cards in a library and a place for the card found', () => {
    expect(
      validateCard(withEffect({ kind: 'revealUntil', filter: { types: ['land'] }, put: 'hand' })),
    ).toEqual([]);
    for (const bad of [
      { kind: 'revealUntil', filter: { types: ['land'], zone: 'graveyard' }, put: 'hand' },
      { kind: 'revealUntil', filter: { types: ['land'], controller: 'you' }, put: 'hand' },
      { kind: 'revealUntil', filter: { types: ['land'] }, put: 'graveyard' },
      { kind: 'revealUntil', filter: { types: ['land'] }, put: 'hand', tapped: true },
      { kind: 'revealUntil', filter: { types: ['land'] }, put: 'battlefield', tapped: false },
    ]) {
      expect(validateCard(withEffect(bad)).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  test('lookAtTop take: where it goes, tapped only on the battlefield, a limit that reads the game', () => {
    const look = (take: object) =>
      withEffect({
        kind: 'lookAtTop',
        count: 4,
        take: { filter: { types: ['creature'] }, max: 1, ...take },
        rest: 'bottomRandom',
      });
    expect(validateCard(look({ to: 'battlefield', tapped: true }))).toEqual([]);
    expect(
      validateCard(
        look({
          manaValueAtMost: { kind: 'countOf', filter: { types: ['land'], controller: 'you' } },
        }),
      ),
    ).toEqual([]);
    expect(validateCard(look({ to: 'graveyard' })).length).toBeGreaterThan(0);
    expect(validateCard(look({ tapped: true })).length).toBeGreaterThan(0);
    expect(validateCard(look({ manaValueAtMost: { kind: 'x' } })).length).toBeGreaterThan(0);
  });
});
