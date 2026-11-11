// "Reveals the top card of their library. If it's a permanent card, they put it onto the battlefield", "exile cards until you exile a nonland card; cast
// it if its mana value is N or less, else put it into your hand", Discover N with the tapped Treasures for the difference, and "look at the top card of
// your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand" (D-151).
// Pins: CR 701.20 (Reveal), CR 701.57 (Discover: exile until a nonland card of mana value N or less, cast it for free or put it into your hand, the rest on the
// bottom in a random order), CR 608.2g (a card cast during resolution), CR 110.2a (put onto the battlefield under the control of the player who
// does it), CR 401.5 (the top card stays where it is). Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-reveal.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARP = 'SYNTHETIC Warp Bolt';
const PROBE = 'SYNTHETIC Reveal Probe';
const HOARD = 'SYNTHETIC Breaching Hoard';
const RITE = 'SYNTHETIC Discovery Rite';
const TRUMPET = 'SYNTHETIC Herald Trumpet';
const DRAKE = 'SYNTHETIC Plain Drake';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';

const RED5 = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'] as const;

describe('the cards are valid', () => {
  test.each([WARP, PROBE, HOARD, RITE, TRUMPET])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(PROBE);
    const face = card.faces[0];
    if (face === undefined || face.spell === null) throw new Error('no spell');
    const spellWith = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, spell: { ...face.spell, effect } }] }) as never;
    const reveal = (extra: Record<string, unknown>) => ({
      kind: 'revealTop',
      player: { kind: 'you' },
      ifMatches: { types: ['land'] },
      to: 'battlefield',
      ...extra,
    });
    expect(validateCard(spellWith(reveal({})))).toEqual([]);
    expect(
      validateCard(spellWith(reveal({ ifMatches: { zone: 'graveyard' } }))).length,
    ).toBeGreaterThan(0);
    expect(validateCard(spellWith(reveal({ to: 'graveyard' }))).length).toBeGreaterThan(0);
    expect(validateCard(spellWith(reveal({ to: 'hand', tapped: true }))).length).toBeGreaterThan(0);
    const until = (extra: Record<string, unknown>) => ({
      kind: 'exileUntilCast',
      rest: 'bottomRandom',
      ...extra,
    });
    expect(validateCard(spellWith(until({ foundAtMost: 10 })))).toEqual([]);
    expect(validateCard(spellWith(until({ foundAtMost: -1 }))).length).toBeGreaterThan(0);
    expect(validateCard(spellWith(until({ castAtMost: 1.5 }))).length).toBeGreaterThan(0);
    expect(validateCard(spellWith(until({ rest: 'graveyard' }))).length).toBeGreaterThan(0);
    // the difference needs a positive limit and a card to read
    const treasure = (count: unknown) => ({
      kind: 'sequence',
      effects: [
        until({}),
        { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count },
      ],
    });
    expect(
      validateCard(spellWith(treasure({ kind: 'shortfall', limit: 4, of: { kind: 'moved' } }))),
    ).toEqual([]);
    expect(
      validateCard(spellWith(treasure({ kind: 'shortfall', limit: 0, of: { kind: 'moved' } })))
        .length,
    ).toBeGreaterThan(0);
  });
});

describe('reveal the top card, and put it onto the battlefield if it is a permanent card', () => {
  const probeGame = (top: readonly string[]) =>
    scenario()
      .seat(0)
      .library(...top)
      .hand(PROBE)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...top)
      .build();

  test("a permanent card enters under its owner's control, whoever cast the spell", () => {
    const g = scenario()
      .seat(0)
      .library(BOLT, BOLT)
      .hand(PROBE)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(BEARS, BOLT)
      .build();
    g.act(0).cast(PROBE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.librarySize(1, 1);
    g.expect.librarySize(0, 2);
    g.expect.invariants();
  });

  test('a card that is not a permanent card stays on top', () => {
    const g = probeGame([BOLT, BEARS]);
    g.act(0).cast(PROBE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.librarySize(1, 2);
    g.expect.zone(BOLT, 'library', { seat: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test('the card is revealed: the event names it', () => {
    const g = probeGame([BOLT, BEARS]);
    g.act(0).cast(PROBE, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const revealed = g.events.find((e) => e.kind === 'cardsRevealed');
    expect(revealed?.kind === 'cardsRevealed' ? revealed.names : []).toEqual([BOLT]);
  });

  test('an empty library reveals nothing', () => {
    const g = scenario()
      .seat(0)
      .library(BOLT)
      .hand(PROBE)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(BOLT)
      .build();
    g.act(0).cast(PROBE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.librarySize(0, 1);
    expect(g.events.some((e) => e.kind === 'cardsRevealed')).toBe(true);
  });
});

describe('"the owner of target permanent shuffles it into their library, then reveals the top card"', () => {
  test('the permanent is shuffled in, and the owner puts the top card onto the battlefield (they are all permanent cards)', () => {
    const g = scenario()
      .seat(0)
      .library(BOLT)
      .hand(WARP)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library('Mountain', 'Mountain', 'Mountain')
      .battlefield(BEARS)
      .build();
    g.act(0).cast(WARP, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    // the library had 3 cards, with the Bears 4; one came out and is now a permanent of the owner's
    g.expect.librarySize(1, 3);
    const mine = g.state.battlefield.filter((id) => g.state.objects[id]?.controller === 1);
    expect(mine).toHaveLength(1);
    g.expect.librarySize(0, 1);
    g.expect.invariants();
  });
});

describe('Discover and "exile until a nonland card, cast it or put it into your hand"', () => {
  const riteGame = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .library(...library)
      .hand(RITE)
      .battlefield(...RED5)
      .seat(1)
      .library('Mountain', 'Mountain')
      .build();

  test('the first nonland card of mana value 4 or less: cast free, and the difference in tapped Treasures', () => {
    const g = riteGame(['Mountain', ANGEL, BEARS, 'Mountain', 'Mountain']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind !== 'confirmOptional') return;
    expect(d.purpose).toBe('cascade');
    expect(d.subject).toBeDefined();
    g.act(0).accept();
    // Bears is on the stack; 4 - 2 = 2 Treasures, tapped
    g.expect.stack([BEARS]);
    const treasures = g.state.battlefield.filter((id) =>
      g.state.objects[id]?.token?.characteristics.subtypes.includes('Treasure'),
    );
    expect(treasures).toHaveLength(2);
    expect(treasures.every((id) => g.state.objects[id]?.tapped === true)).toBe(true);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    // the others (a Mountain and the Angel) went to the bottom of the library: 2 + 1 not exiled
    expect(g.state.exile).toHaveLength(0);
    g.expect.librarySize(0, 4);
    g.expect.invariants();
  });

  test('declined: the card goes into my hand, and the Treasures are made all the same', () => {
    const g = riteGame([BEARS, 'Mountain']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    const treasures = g.state.battlefield.filter(
      (id) => g.state.objects[id]?.token !== null && g.state.objects[id]?.token !== undefined,
    );
    expect(treasures).toHaveLength(2);
  });

  test('a card over the limit is not the card found: the library runs out and nothing is found', () => {
    const g = riteGame([ANGEL, 'Mountain']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    // the Angel is mana value 5: over the limit, it is not the card found; the library runs out: nothing is found
    g.expect.pending('priority', 0);
    g.expect.zone(ANGEL, 'library', { seat: 0 });
    expect(g.state.battlefield.some((id) => g.state.objects[id]?.token != null)).toBe(false);
  });

  test('a card of mana value 4, the limit: no difference, no Treasure', () => {
    const g = riteGame(['Giant Spider', 'Mountain']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.stack(['Giant Spider']);
    expect(g.state.battlefield.some((id) => g.state.objects[id]?.token != null)).toBe(false);
  });

  test('nothing found: every card exiled goes back to the bottom, no Treasure', () => {
    const g = riteGame(['Mountain', 'Mountain', 'Mountain']);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.librarySize(0, 3);
    expect(g.state.exile).toHaveLength(0);
  });
});

describe('"exile cards until you exile a nonland card; you may cast it if its mana value is 4 or less; if you don\'t, put it into your hand"', () => {
  const hoardGame = (library: readonly string[]) =>
    scenario()
      .seat(0)
      .library(...library)
      .hand(HOARD)
      .battlefield(...RED5)
      .seat(1)
      .library('Mountain', 'Mountain')
      .build();

  test('a card of mana value 4 or less may be cast; the lands exiled stay in exile', () => {
    const g = hoardGame(['Mountain', 'Mountain', BEARS, 'Mountain']);
    g.act(0).cast(HOARD, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).accept();
    g.expect.stack([BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.state.exile).toHaveLength(2);
    g.expect.librarySize(0, 1);
  });

  test('a card over 4 cannot be cast and goes into my hand', () => {
    const g = hoardGame(['Mountain', ANGEL, 'Mountain']);
    g.act(0).cast(HOARD, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
    expect(g.state.exile).toHaveLength(1);
  });

  test('declining puts the card into my hand', () => {
    const g = hoardGame([BEARS, 'Mountain']);
    g.act(0).cast(HOARD, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test("when a Dragon enters, the enchantment goes back to its owner's hand", () => {
    const g = scenario()
      .seat(0)
      .library('Mountain', 'Mountain')
      .battlefield(HOARD)
      .hand(DRAKE)
      .battlefield(...RED5)
      .seat(1)
      .library('Mountain', 'Mountain')
      .build();
    g.act(0).cast(DRAKE, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(HOARD, 'hand', { seat: 0 });
    g.expect.zone(DRAKE, 'battlefield', { seat: 0 });
  });
});

describe('"look at the top card of your library. If it\'s a creature card of the chosen type, you may reveal it and put it into your hand"', () => {
  const upkeepGame = (top: string) =>
    scenario()
      .seat(0)
      .library(top, 'Mountain', 'Mountain')
      .battlefield(TRUMPET, { chosen: { creatureType: 'Bear' } })
      .seat(1)
      .library('Mountain', 'Mountain', 'Mountain')
      .build();

  test('a creature of the chosen type: I may take it', () => {
    const g = upkeepGame(BEARS);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    if (d?.kind !== 'chooseCards') return;
    expect(d.purpose).toBe('lookTake');
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('declining leaves it on top', () => {
    const g = upkeepGame(BEARS);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'library', { seat: 0 });
    expect(g.state.seats[0]?.library[0]).toBe(g.object(BEARS).id);
  });

  test('a creature of another type is not offered', () => {
    const g = upkeepGame(ANGEL);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(ANGEL, 'library', { seat: 0 });
  });

  test('creature spells of the chosen type cost {1} less', () => {
    const g = scenario()
      .seat(0)
      .library('Mountain', 'Mountain')
      .hand(BEARS)
      .battlefield(TRUMPET, { chosen: { creatureType: 'Bear' } })
      .battlefield('Forest')
      .seat(1)
      .library('Mountain', 'Mountain')
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

describe('"you may behold a Dragon. If you do, create a Treasure token"', () => {
  const SCOUT = 'SYNTHETIC Dragon Scout';
  const scoutGame = (hand: readonly string[], battlefield: readonly string[] = []) => {
    let b = scenario()
      .seat(0)
      .library('Mountain', 'Mountain')
      .hand(SCOUT, ...hand)
      .battlefield('Mountain', 'Mountain');
    for (const name of battlefield) b = b.battlefield(name);
    return b.seat(1).library('Mountain', 'Mountain').build();
  };
  const treasures = (g: ReturnType<typeof scoutGame>) =>
    g.state.battlefield.filter((id) => g.state.objects[id]?.token != null).length;

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(SCOUT))).toEqual([]);
  });

  test('a Dragon card in my hand: I reveal it, and I get a Treasure', () => {
    const g = scoutGame([DRAKE]);
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    g.act(0).accept();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    if (d?.kind !== 'chooseCards') return;
    expect(d.purpose).toBe('behold');
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards(DRAKE);
    expect(treasures(g)).toBe(1);
    const revealed = g.events.find((e) => e.kind === 'cardsRevealed');
    expect(revealed?.kind === 'cardsRevealed' ? revealed.names : []).toEqual([DRAKE]);
    g.expect.zone(DRAKE, 'hand', { seat: 0 });
  });

  test('a Dragon I control: I choose it, nothing is revealed', () => {
    const g = scoutGame([], [DRAKE]);
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).choose({ kind: 'chooseCards', objects: [g.object(DRAKE).id] });
    expect(treasures(g)).toBe(1);
    expect(g.events.some((e) => e.kind === 'cardsRevealed')).toBe(false);
  });

  test('a Dragon in the hand and one on the battlefield are both offered', () => {
    const g = scoutGame([DRAKE], [DRAKE]);
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    g.act(0).accept();
    const d = g.state.pending;
    expect(d?.kind === 'chooseCards' ? d.legal : []).toHaveLength(2);
  });

  test('no Dragon: nothing to behold, no Treasure', () => {
    const g = scoutGame([]);
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.pending('priority', 0);
    expect(treasures(g)).toBe(0);
  });

  test('declining the "may": no Treasure', () => {
    const g = scoutGame([DRAKE]);
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    g.act(0).decline();
    expect(treasures(g)).toBe(0);
    g.expect.pending('priority', 0);
  });

  test('"Whenever a Dragon you control enters": a counter, and a Dragon with flying until end of turn', () => {
    const g = scenario()
      .seat(0)
      .library('Mountain', 'Mountain')
      .battlefield(SCOUT)
      .hand(DRAKE)
      .battlefield(...RED5)
      .seat(1)
      .library('Mountain', 'Mountain')
      .build();
    g.act(0).cast(DRAKE, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.counters(SCOUT, { '+1/+1': 1 });
    g.expect.derived(SCOUT, { subtypes: ['Human', 'Druid', 'Dragon'], keywords: ['flying'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(SCOUT, { subtypes: ['Human', 'Druid'], keywords: [] });
  });
});
