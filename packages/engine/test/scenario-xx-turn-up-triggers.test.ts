// The triggers about turning a permanent face up (CR 701.40b, 708.8, 603.2) and about a face-down creature entering (CR 708.3, 603.6a): "Whenever you turn a permanent face up",
// "Whenever a permanent you control is turned face up, if it's a creature, ...", "When this creature is turned face up" and "Whenever a face-down creature you control enters".
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-turn-up.ts, synthetic-manifest.ts, synthetic-morph.ts); the face-down permanents are placed with `faceDown`.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4 Beast
const FLIER = 'SYNTHETIC Manifest Flier'; // {1}{W} 1/3 flying
const COSTLESS = 'SYNTHETIC Manifest Costless'; // a creature card with no mana cost
const SELF = 'SYNTHETIC Manifest Self'; // sorcery: manifest the top card of your library
const BEAR = 'SYNTHETIC Morph Bear'; // {2}{G}{G} 4/4, morph {1}{G}
const GROWER = 'SYNTHETIC Turn-Up Grower'; // whenever you turn a permanent face up, a +1/+1 counter on it
const FIGHTER = 'SYNTHETIC Turn-Up Fighter'; // a permanent you control turned face up, if a creature, may fight target creature you don't control
const PUMPER = 'SYNTHETIC Turn-Up Pumper'; // a permanent you control turned face up, if a creature, +2/+2 until end of turn
const GAIN = 'SYNTHETIC Turn-Up Gain'; // whenever a permanent is turned face up (any player's), you gain 1 life
const DRAW = 'SYNTHETIC Face-Down Draw'; // whenever a face-down creature you control enters, draw a card
const SNATCHER = 'SYNTHETIC Turn-Up Snatcher'; // morph {1}{U}; when turned face up, counter target spell, exile it, may cast it free while it remains exiled
const BOLT = 'Lightning Bolt';
const SELF_UP = 'SYNTHETIC Turn-Up Self'; // {2}{G} 3/3, when this creature is turned face up, you gain 3 life
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  at: Parameters<Builder['at']>[1] = { active: 0, turn: 3 },
): ScenarioGame {
  return theirs(
    mine(
      scenario()
        .seat(0)
        .life(20)
        .library(...FILLER),
    )
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', at)
    .build();
}

const forests = (b: Builder, count: number) => b.battlefield('Forest', { count });

describe('the cards and the trigger are known to the engine', () => {
  test('the SYNTHETIC cards are valid and the trigger and the filter are supported features', () => {
    for (const name of [GROWER, FIGHTER, PUMPER, GAIN, DRAW, SELF_UP, SNATCHER]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('trigger:turnedFaceUp')).toBe(true);
    expect(isFeatureSupported('selector:isFaceDown')).toBe(true);
  });
});

describe('"Whenever you turn a permanent face up" (CR 701.40b, 708.8)', () => {
  test('the permanent that was turned up gets the counter, as the same object', () => {
    const g = game((b) =>
      forests(b.seat(0).battlefield(GROWER).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
    );
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.stack([`${GROWER} (ability)`]);
    g.passAll();
    g.expect.counters(BRUTE, { '+1/+1': 1 });
    g.expect.pt(BRUTE, 5, 5);
    g.expect.invariants();
  });

  test('it is the special action that triggers it, not the permanent entering: a face-up creature does nothing', () => {
    const g = game((b) => forests(b.seat(0).battlefield(GROWER).battlefield(BRUTE), 4).seat(0));
    g.expect.stack([]);
    g.expect.counters(BRUTE, {});
  });

  test('a permanent another player turns face up is not one you turned ("you turn"), but a any-player\'s watcher sees it', () => {
    const g = game(
      (b) => b.seat(0).battlefield(GROWER).battlefield(GAIN),
      (b) => forests(b.seat(1).battlefield(BRUTE, { faceDown: true }), 4).seat(1),
      { active: 1, turn: 4 },
    );
    g.act(1).turnFaceUp(BRUTE, { pay: true });
    g.passAll();
    g.expect.counters(BRUTE, {});
    g.expect.life(0, 21);
  });

  test('with three seats: the watcher of seat 0 sees the permanent that seat 2 turned up, the "you" ones do not', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(GROWER)
      .battlefield(GAIN)
      .battlefield(PUMPER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .seat(2)
      .life(20)
      .library(...FILLER)
      .battlefield('Forest', { count: 4 })
      .battlefield(BRUTE, { faceDown: true })
      .at('precombatMain', { active: 2, turn: 5 })
      .build();
    g.act(2).turnFaceUp(BRUTE, { pay: true });
    g.passAll();
    g.expect.counters(BRUTE, {});
    g.expect.pt(BRUTE, 4, 4);
    g.expect.life(0, 21);
  });
});

describe('"Whenever a permanent you control is turned face up, if it\'s a creature, ..." (CR 603.4)', () => {
  test('"it gets +2/+2 until end of turn" is the permanent that was turned up, and ends with the turn', () => {
    const g = game((b) =>
      forests(b.seat(0).battlefield(PUMPER).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
    );
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.stack([`${PUMPER} (ability)`]);
    g.passAll();
    g.expect.pt(BRUTE, 6, 6);
    g.expect.invariants();
  });

  test('"you may have it fight target creature you don\'t control": the permanent fights, and the target is chosen as the ability goes on the stack', () => {
    const g = game(
      (b) =>
        forests(b.seat(0).battlefield(FIGHTER).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
      (b) => b.battlefield(FLIER),
    );
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.passAll();
    g.act(0).accept();
    // The 4/4 deals 4 to the 1/3, which deals 1 back.
    g.expect.zone(FLIER, 'graveyard');
    g.expect.damage(BRUTE, 1);
  });

  test('declining the "may" makes nobody fight', () => {
    const g = game(
      (b) =>
        forests(b.seat(0).battlefield(FIGHTER).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
      (b) => b.battlefield(FLIER),
    );
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(FLIER, 'battlefield');
    g.expect.damage(BRUTE, 0);
  });

  test("a permanent the opponent controls turned face up does not trigger the controller's watcher", () => {
    const g = game(
      (b) => b.seat(0).battlefield(PUMPER),
      (b) => forests(b.seat(1).battlefield(BRUTE, { faceDown: true }), 4).seat(1),
      { active: 1, turn: 4 },
    );
    g.act(1).turnFaceUp(BRUTE, { pay: true });
    g.expect.stack([]);
    g.expect.pt(BRUTE, 4, 4);
  });
});

describe('"When this creature is turned face up" (CR 708.8, 603.2)', () => {
  test('the ability of the permanent itself, which it has once it is face up', () => {
    const g = game((b) => forests(b.seat(0).battlefield(SELF_UP, { faceDown: true }), 3).seat(0));
    g.expect.stack([]);
    g.act(0).turnFaceUp(SELF_UP, { pay: true });
    g.expect.stack([`${SELF_UP} (ability)`]);
    g.passAll();
    g.expect.life(0, 23);
  });

  test('a face-down permanent that leaves the battlefield is not turned face up: nothing triggers', () => {
    const g = game(
      (b) => b.seat(0).battlefield(SELF_UP, { faceDown: true }).battlefield(GAIN),
      (b) => b.hand('Lightning Bolt').battlefield('Mountain'),
      { active: 1, turn: 4 },
    );
    g.act(1).cast('Lightning Bolt', { targets: [SELF_UP], pay: true });
    g.passAll();
    g.expect.zone(SELF_UP, 'graveyard');
    g.expect.life(0, 20);
    g.expect.stack([]);
  });
});

describe('"Whenever a face-down creature you control enters" (CR 708.3, 603.6a)', () => {
  test('a manifested creature draws a card; turning it face up later does not (it does not enter, CR 708.8)', () => {
    const g = game(
      (b) => forests(b.seat(0).hand(SELF).battlefield(DRAW), 3).seat(0),
      (b) => b,
      { active: 0, turn: 3 },
    );
    g.act(0).cast(SELF, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    expect(g.object({ name: 'Plains', zone: 'battlefield' }).faceDown?.by).toBe('manifest');
    g.expect.librarySize(0, FILLER.length - 2);
  });

  test('a creature cast face down draws a card when it enters, a face-up creature does not', () => {
    const g = game((b) => forests(b.seat(0).hand(BEAR).battlefield(DRAW), 3).seat(0));
    g.act(0).cast(BEAR, { alternative: 'morph', pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    const up = game((b) => forests(b.seat(0).hand(BEAR).battlefield(DRAW), 4).seat(0));
    up.act(0).cast(BEAR, { pay: true });
    up.passAll();
    up.expect.handSize(0, 0);
  });

  test('turning a creature face up is not entering: no card is drawn', () => {
    const g = game((b) =>
      forests(b.seat(0).battlefield(DRAW).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
    );
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });

  test("only a creature you control: the opponent's face-down creature entering draws nothing for you", () => {
    const g = game(
      (b) => b.seat(0).battlefield(DRAW),
      (b) => forests(b.seat(1).hand(BEAR), 3).seat(1),
      { active: 1, turn: 4 },
    );
    g.act(1).cast(BEAR, { alternative: 'morph', pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
  });
});

describe('a creature card that cannot be turned face up triggers nothing', () => {
  test('no mana cost (CR 701.40b): the special action is not offered, so there is no turned-up event', () => {
    const g = game((b) =>
      forests(b.seat(0).battlefield(GAIN).battlefield(COSTLESS, { faceDown: true }), 4).seat(0),
    );
    g.expect.illegal(0, { turnFaceUp: COSTLESS });
    g.expect.stack([]);
  });
});

describe('"When this creature is turned face up, counter target spell. ... exile it ... You may cast that card without paying its mana cost for as long as it remains exiled."', () => {
  /** Seat 1 casts the Bolt at seat 0; seat 0 holds the face-down creature and two Islands for its morph cost. */
  const respond = () => {
    const g = game(
      (b) =>
        b
          .seat(0)
          .battlefield(SNATCHER, { faceDown: 'morph' })
          .battlefield('Island', { count: 2 })
          .seat(0),
      (b) => b.seat(1).hand(BOLT).battlefield('Mountain'),
      { active: 1, turn: 4 },
    );
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.act(1).pass();
    return g;
  };

  test('turning it face up in response counters the spell, which is exiled instead of going to its owner graveyard', () => {
    const g = respond();
    g.act(0).turnFaceUp(SNATCHER, { pay: true });
    g.expect.stack([BOLT, `${SNATCHER} (ability)`].reverse());
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    g.expect.life(0, 20);
    g.expect.noObject(BOLT, { zone: 'graveyard' });
  });

  test('its controller may cast the exiled card for no mana, for as long as it remains exiled', () => {
    const g = respond();
    g.act(0).turnFaceUp(SNATCHER, { pay: true });
    g.passAll();
    // The active player has priority again after the trigger resolved; it is seat 0 who may cast the card once seat 1 passes.
    g.act(1).pass();
    const exiled = { name: BOLT, zone: 'exile', seat: 1 } as const;
    g.expect.illegal(0, { cast: exiled });
    g.expect.legal(0, { cast: exiled, alternative: 'free' });
    g.act(0).cast(exiled, { alternative: 'free', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.expect.tapped('Island[0]', true);
  });
});
