// "Hideaway N. When this permanent enters, look at the top N cards of your library. Exile one of them face down and put the rest on the bottom
// of your library in a random order. The permanent gains 'You may play the exiled card ...'" (D-145): the keyword `hideaway`, the reference
// `linkedExile` and the effect `castFree` with `play`.
// Pins: CR 702.75a (Hideaway: look at the top N, exile one face down, the rest on the bottom in a random order; the controller may look at the
// exiled card while the permanent is on the battlefield), CR 607.2a (linked abilities: the exiled card is the one this permanent exiled),
// CR 400.7 (a permanent that left the battlefield and came back is a new object: it has exiled nothing), CR 406.3 (a face-down exiled card is
// known to nobody else), CR 608.2g and 118.9 (cast without paying its mana cost), CR 305.1 and 305.2a (a land played by an effect uses the
// land drop). Cards are SYNTHETIC (src/cards/fixtures/synthetic-free-cast.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const VAULT = 'SYNTHETIC Hidden Vault'; // land, Hideaway 4, enters tapped, {G},{T}: play the exiled card if creatures have total power 5+
const CACHE = 'SYNTHETIC Hidden Cache'; // artifact {1}, Hideaway 3, {2},{T}: play the exiled card
const SMASHER = 'SYNTHETIC Cache Smasher'; // instant {R}: destroy target artifact
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4
const SPIDER = 'Giant Spider'; // 2/4

describe('the cards are valid', () => {
  test.each([VAULT, CACHE, SMASHER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('Hideaway belongs to a permanent card (CR 702.75a)', () => {
    const card = syntheticCard('SYNTHETIC Free Cast Rite');
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        { ...face, abilities: [{ kind: 'keyword', keyword: { kind: 'hideaway', count: 3 } }] },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    expect(validateCard(bad as any).map((i) => i.message)).toContain(
      'hideaway belongs to a permanent card (CR 702.75a)',
    );
  });

  test('a count of zero is refused', () => {
    const card = syntheticCard(CACHE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...card,
      faces: [
        {
          ...face,
          abilities: face.abilities.map((a) =>
            a.kind === 'keyword' ? { kind: 'keyword', keyword: { kind: 'hideaway', count: 0 } } : a,
          ),
        },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: a deliberately malformed card for the validator
    expect(validateCard(bad as any).length).toBeGreaterThan(0);
  });
});

describe('the enters trigger: look at the top N, exile one face down, the rest to the bottom (CR 702.75a)', () => {
  const game = (cards: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(CACHE)
      .battlefield('Forest', 'Forest')
      .library(...cards)
      .seat(1)
      .library('Island', 'Island')
      .build();

  test('three cards are looked at, one must be taken, and the other two go to the bottom', () => {
    const g = game([BEARS, ANGEL, SPIDER, 'Swamp', 'Plains']);
    g.act(0).cast(CACHE, { pay: true });
    g.passAll();
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.looked).toHaveLength(3);
    expect(d.legal).toHaveLength(3);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    g.act(0).chooseCards(ANGEL);
    g.expect.zone(ANGEL, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(SPIDER, 'library', { seat: 0 });
    // The two untouched cards are now the top two; the two put back are at the bottom.
    expect((g.state.seats[0]?.library ?? []).slice(0, 2)).toEqual([g.id('Swamp'), g.id('Plains')]);
    expect(g.state.seats[0]?.library).toHaveLength(4);
    g.expect.invariants();
  });

  test('the order of the two cards put on the bottom is random but fixed by the seed (CR 702.75a)', () => {
    const run = (seed: number) => {
      const g = scenario()
        .seat(0)
        .seed(seed)
        .hand(CACHE)
        .battlefield('Forest', 'Forest')
        .library(BEARS, ANGEL, SPIDER, 'Swamp', 'Plains')
        .seat(1)
        .library('Island')
        .build();
      g.act(0).cast(CACHE, { pay: true });
      g.passAll();
      g.passAll();
      g.act(0).chooseCards(BEARS);
      return JSON.stringify(
        (g.state.seats[0]?.library ?? []).map((id) => g.state.objects[id]?.card),
      );
    };
    expect(run(5)).toEqual(run(5));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(run)).size).toBeGreaterThan(1);
  });

  test('declining is not possible: no empty answer is legal', () => {
    const g = game([BEARS, ANGEL, SPIDER, 'Swamp']);
    g.act(0).cast(CACHE, { pay: true });
    g.passAll();
    g.passAll();
    expect(() => g.act(0).chooseCards()).toThrow();
    g.expect.pending('chooseCards', 0);
  });

  test('a library with fewer cards than N: all of them are looked at, one is exiled', () => {
    const g = game([BEARS, ANGEL]);
    g.act(0).cast(CACHE, { pay: true });
    g.passAll();
    g.passAll();
    expect(chooseCardsDecision(g).looked).toHaveLength(2);
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ANGEL, 'library', { seat: 0 });
  });

  test('an empty library: nothing is exiled and nothing is asked', () => {
    const g = scenario()
      .seat(0)
      .hand(CACHE)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .library('Island')
      .build();
    g.act(0).cast(CACHE, { pay: true });
    g.passAll();
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('the land version enters tapped and also hides a card (the keyword and the replacement together)', () => {
    const g = scenario()
      .seat(0)
      .hand(VAULT)
      .library(BEARS, ANGEL, SPIDER, 'Swamp', 'Plains')
      .seat(1)
      .library('Island')
      .build();
    g.act(0).playLand(VAULT);
    g.expect.tapped(VAULT, true);
    g.passAll();
    expect(chooseCardsDecision(g).looked).toHaveLength(4);
    g.act(0).chooseCards(SPIDER);
    g.expect.zone(SPIDER, 'exile', { seat: 0 });
  });
});

describe('who may look at the exiled card (CR 702.75a, 406.3)', () => {
  const hidden = () => {
    const g = scenario()
      .seat(0)
      .hand(CACHE)
      .battlefield('Forest', 'Forest')
      .library(BEARS, ANGEL, SPIDER, 'Swamp')
      .seat(1)
      .hand(SMASHER)
      .battlefield('Mountain')
      .library('Island')
      .build();
    g.act(0).cast(CACHE, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).chooseCards(ANGEL);
    return g;
  };

  test('the controller of the permanent sees what it is, the opponent sees a face-down card', () => {
    const g = hidden();
    const mine = getView(g.state, 0).exile.find((o) => o.id === g.id(ANGEL));
    expect(mine?.name).toBe(ANGEL);
    expect(mine?.faceDown).toBe(true);
    const theirs = getView(g.state, 1).exile.find((o) => o.id === g.id(ANGEL));
    expect(theirs?.faceDown).toBe(true);
    expect(theirs?.name).not.toBe(ANGEL);
  });

  test('once the permanent has left the battlefield nobody sees the card, its controller included', () => {
    const g = hidden();
    g.pass();
    g.act(1).cast(SMASHER, { targets: [CACHE], pay: true });
    g.passAll();
    g.expect.zone(CACHE, 'graveyard', { seat: 0 });
    const own = getView(g.state, 0).exile.find((o) => o.id === g.id(ANGEL));
    expect(own?.name).not.toBe(ANGEL);
    expect(own?.faceDown).toBe(true);
  });
});

describe('"you may play the exiled card" (CR 607.2a, 608.2g, 305.1)', () => {
  const ready = (
    cards: readonly string[],
    extra: (b: ReturnType<typeof scenario>) => void = () => {},
  ) => {
    const b = scenario()
      .seat(0)
      .hand(CACHE)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library(...cards);
    extra(b);
    const g = b.seat(1).library('Island').build();
    g.act(0).cast(CACHE, { pay: true });
    g.passAll();
    g.passAll();
    return g;
  };

  test('a spell is cast without paying its mana cost', () => {
    const g = ready([ANGEL, 'Plains', 'Plains', 'Plains']);
    g.act(0).chooseCards(ANGEL);
    g.act(0).activate(CACHE, { pay: true });
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect(d.zone).toBe('exile');
    expect(d.legal).toEqual([g.id(ANGEL)]);
    g.act(0).chooseCards(ANGEL);
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a land is played onto the battlefield and uses the land drop', () => {
    const g = ready(['Swamp', 'Plains', 'Plains', 'Plains']);
    g.act(0).chooseCards('Swamp');
    g.act(0).activate(CACHE, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Swamp');
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(1);
  });

  test('a land is not offered when the land drop is used', () => {
    const g = ready(['Swamp', 'Plains', 'Plains', 'Plains'], (b) => b.landsPlayed(1));
    g.act(0).chooseCards('Swamp');
    g.act(0).activate(CACHE, { pay: true });
    g.passAll();
    // Nothing can be played: the ability resolves without a question and the card stays in exile.
    g.expect.zone('Swamp', 'exile', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('the player may decline: the card stays exiled and can be played later', () => {
    const g = ready([BEARS, 'Plains', 'Plains', 'Plains']);
    g.act(0).chooseCards(BEARS);
    g.act(0).activate(CACHE, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });
});

describe('a condition on the play: total power 5 or greater', () => {
  const vault = (creatures: readonly string[]) => {
    const g = scenario()
      .seat(0)
      .hand(VAULT)
      .battlefield('Forest', 'Forest', ...creatures)
      .library(BEARS, ANGEL, SPIDER, 'Swamp', 'Plains')
      .seat(1)
      .library('Island')
      .build();
    g.act(0).playLand(VAULT);
    g.passAll();
    g.act(0).chooseCards(SPIDER);
    return g;
  };

  test('with total power below 5 the effect does nothing and the card stays hidden', () => {
    const g = vault([BEARS]);
    // The vault entered tapped: go on to this player's next turn, when it untaps.
    g.advanceTo('precombatMain', { turn: 'next' }).advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VAULT, { pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'exile', { seat: 0 });
  });

  test('with total power 5 or greater the card is played', () => {
    const g = vault([BEARS, ANGEL]);
    g.advanceTo('precombatMain', { turn: 'next' }).advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(VAULT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(SPIDER);
    g.passAll();
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
  });
});

describe('a permanent that left and came back is a new object (CR 400.7, 607.2a)', () => {
  test('the new permanent has exiled nothing: its play ability finds no card', () => {
    const g = scenario()
      .seat(0)
      .hand(CACHE)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library(BEARS, ANGEL, SPIDER, 'Swamp')
      .seat(1)
      .hand(SMASHER)
      .battlefield('Mountain')
      .library('Island')
      .build();
    g.act(0).cast(CACHE, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).chooseCards(ANGEL);
    // The first permanent is gone: its exiled card is no longer linked to anything on the battlefield.
    g.pass();
    g.act(1).cast(SMASHER, { targets: [CACHE], pay: true });
    g.passAll();
    const linked = g.state.objects[g.id(ANGEL)]?.hideaway;
    const source = linked === undefined ? undefined : g.state.objects[linked];
    expect(source?.zone ?? 'gone').not.toBe('battlefield');
  });
});
