// The Prismari deck (issue 87), group 3: Creative Technique, "Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the
// bottom of your library in a random order. You may cast the exiled card without paying its mana cost." (SYNTHETIC Reveal Technique, src/cards/fixtures/synthetic-prismari-g3.ts: the
// `revealUntil` effect with `put: 'exile'`, then `castFree`). Pins: CR 701.20 (reveal: public, the cards stay in the library), CR 701.24 (shuffle), CR 701.13 (exile), CR 401.4 (the rest on the
// bottom in a random order), CR 608.2g (cast during resolution), CR 118.9 and 107.3b (free, X = 0), CR 603.3/601.2i (the cast is a spell cast: it triggers).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const TECHNIQUE = 'SYNTHETIC Reveal Technique';
const GAIN7 = 'SYNTHETIC Calamity Gain Seven';
const GAIN2 = 'SYNTHETIC Calamity Gain Two';

type Builder = ReturnType<typeof scenario>;

/** Casts the Technique with this library (the shuffle makes the order of it a matter of the seed: `library` is the whole of it). */
function game(library: readonly string[], seed = 1, extra: (b: Builder) => void = () => {}) {
  const b = scenario().seat(0).hand(TECHNIQUE).pool('RRRRR').seed(seed).library(...library);
  extra(b);
  const g = b
    .seat(1)
    .library('Island', 'Island')
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(TECHNIQUE, { pay: true });
  // Demonstrate: the cast trigger asks whether to copy the spell; no copy here (demonstrate has its own tests).
  g.passAll();
  g.act(0).decline();
  g.passAll();
  return g;
}

const exiled = (g: ScenarioGame) => g.state.exile.map((id) => g.state.objects[id]);

describe('the card is valid', () => {
  test(TECHNIQUE, () => expect(validateCard(syntheticCard(TECHNIQUE))).toEqual([]));
});

describe('reveal until a nonland card, exile it, the rest on the bottom (CR 701.20, 701.13, 401.4)', () => {
  test('one nonland card in the library: after the shuffle the lands above it are revealed, it is exiled, the lands go to the bottom', () => {
    const g = game(['Island', 'Island', 'Island', GAIN7, 'Island']);
    // The card was exiled and is offered; every card above it was revealed.
    expect(exiled(g)).toHaveLength(1);
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'cast', zone: 'exile', seat: 0 });
    const revealed = g.events.filter((e) => e.kind === 'cardsRevealed');
    expect(revealed).toHaveLength(1);
    // Four lands remain in the library, the revealed ones on the bottom: only lands are left in it.
    expect(g.state.seats[0]?.library).toHaveLength(4);
    g.expect.invariants();
  });

  test('casting it: free, from exile, and it resolves', () => {
    const g = game(['Island', GAIN7, 'Island']);
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    // No mana was spent on it (CR 118.9), and it was cast by an effect from exile.
    const spell = g.state.objects[g.state.stack[0] as `o${number}`];
    expect(spell?.stack?.manaSpent).toBeUndefined();
    expect(spell?.stack).toMatchObject({ castFrom: 'exile', byEffect: true });
    g.passAll();
    g.expect.life(0, 47);
    g.expect.zone(GAIN7, 'graveyard', { seat: 0 });
  });

  test('not casting it leaves it exiled (it does not go to the hand)', () => {
    const g = game(['Island', GAIN2, 'Island']);
    g.act(0).chooseCards();
    expect(exiled(g)).toHaveLength(1);
    expect(g.state.seats[0]?.hand).toHaveLength(0);
    g.expect.life(0, 40);
  });

  test('the first nonland card after the shuffle is the one exiled, and only that one', () => {
    const g = game([GAIN2, GAIN7, 'Island', 'Island'], 5);
    expect(exiled(g)).toHaveLength(1);
    // The other nonland card is still in the library (or was revealed and put on the bottom with the lands), never in exile.
    expect(g.state.seats[0]?.library).toHaveLength(3);
  });

  test('a library with no nonland card: it is revealed to its end and nothing is exiled or cast', () => {
    const g = game(['Island', 'Island', 'Island']);
    expect(exiled(g)).toHaveLength(0);
    expect(g.state.seats[0]?.library).toHaveLength(3);
    g.expect.pending('priority', 0);
    expect(g.state.seats[0]?.hasLost).toBe(false);
  });

  test('an empty library: nothing happens', () => {
    const g = game([]);
    g.expect.pending('priority', 0);
    expect(exiled(g)).toHaveLength(0);
  });

  test('the shuffle comes first: the same cards under another seed give another card exiled first', () => {
    const lib = [GAIN2, GAIN7, 'SYNTHETIC Prismari Big Study', 'SYNTHETIC Prismari Trinket', 'Island'];
    const first = (seed: number) => {
      const g = game(lib, seed);
      return exiled(g)[0]?.card;
    };
    expect(first(11)).toBe(first(11));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(first)).size).toBeGreaterThan(1);
  });

  test('the revealed cards are public: one event lists every card revealed, with its name', () => {
    const g = game(['Island', GAIN7, 'Island']);
    const reveal = g.events.find((e) => e.kind === 'cardsRevealed');
    if (reveal?.kind !== 'cardsRevealed') throw new Error('no reveal');
    expect(reveal.names.at(-1)).toBeDefined();
    expect(reveal.names).toContain(GAIN7);
  });

  test('X is 0 for the exiled card (CR 107.3b)', () => {
    const g = game(['SYNTHETIC Prismari X Spell']);
    g.act(0).chooseCards({ name: 'SYNTHETIC Prismari X Spell', zone: 'exile', seat: 0 });
    g.passAll();
    g.expect.life(0, 40);
  });

  test('a card whose additional cost cannot be paid is exiled and not offered', () => {
    const g = game(['SYNTHETIC Calamity Discard Draw']);
    expect(exiled(g)).toHaveLength(1);
    g.expect.pending('priority', 0);
  });
});
