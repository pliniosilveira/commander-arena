// The Danitha deck (issue 26), group 5 (D-405 provisional): "Search your library for an enchantment card, reveal it, then shuffle and put that card on top." (Sterling Grove).
// Pins: CR 701.23a-b (the search, with a stated quality the player may find nothing), CR 701.24b (the card found is not part of the shuffle, even while it is in the library: it
// is put on top once the rest is shuffled), CR 701.20 (the reveal), CR 400.7 (a card that changes zones is a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-danitha-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { shuffle } from '../src/rng';
import { shuffleLibrary } from '../src/rules/effect-support';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const GROVE = 'SYNTHETIC Grove Warden';
const TUTOR = 'SYNTHETIC Quiet Tutor';
const MIGHT = 'SYNTHETIC Might Aura';
const WINGS = 'SYNTHETIC Wings Aura';
const FILLER = Array.from({ length: 6 }, () => 'Plains');

function start() {
  return scenario()
    .seat(0)
    .battlefield(GROVE)
    .battlefield('Plains', { count: 2 })
    .library('Grizzly Bears', { label: 'bears' })
    .library(MIGHT, { label: 'might' })
    .library('Forest', { label: 'forest' })
    .library(WINGS, { label: 'wings' })
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('"then shuffle and put that card on top" (CR 701.24b)', () => {
  test('the cards are valid and the destination is supported', () => {
    expect(validateCard(syntheticCard(GROVE))).toEqual([]);
    expect(validateCard(syntheticCard(TUTOR))).toEqual([]);
    expect(isFeatureSupported('searchDestination:library')).toBe(true);
    expect(isFeatureSupported('searchDestination:exile')).toBe(false);
  });

  test('the search offers the enchantments, and the prompt says the card goes on top after the shuffle', () => {
    const g = start();
    g.act(0).activate(GROVE, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('search');
    expect(d.legal).toEqual([g.id('might'), g.id('wings')].sort());
    expect(d.min).toBe(0);
    expect(d.reveal).toBe(true);
    expect(d.prompt).toBe(
      'Choose up to one enchantment card; it goes on top of your library. The cards you find are revealed. The rest of your library is shuffled first.',
    );
  });

  test('the sacrifice is a cost: the Grove is gone when the search resolves', () => {
    const g = start();
    g.act(0).activate(GROVE, { pay: true });
    g.expect.zone(GROVE, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pending('chooseCards', 0);
  });

  test('the card found is revealed, is on top of the library afterwards and the library is shuffled below it', () => {
    const g = start();
    g.act(0).activate(GROVE, { pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).chooseCards('wings');
    expect(g.state.seats[0]?.library[0]).toBe(g.id('wings'));
    g.expect.librarySize(0, 10);
    const events = g.eventsSince(mark).map((e) => e.kind);
    expect(events.filter((k) => k !== 'priorityPassed')).toEqual([
      'librarySearched',
      'cardsRevealed',
      'libraryShuffled',
      'zoneChanged',
      'resolved',
    ]);
    g.expect.invariants();
  });

  test('the card found is never in the shuffled part: it is on top in every game of many seeds', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const g = scenario()
        .seed(seed)
        .seat(0)
        .battlefield(GROVE)
        .battlefield('Plains', { count: 2 })
        .library('Forest')
        .library('Forest')
        .library('Forest')
        .library(MIGHT, { label: 'might' })
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      g.act(0).activate(GROVE, { pay: true });
      g.passAll();
      g.act(0).chooseCards('might');
      expect(g.state.seats[0]?.library[0]).toBe(g.id('might'));
    }
  });

  test('the shuffle leaves out the cards it is told to keep (CR 701.24b): they stay where they are, the rest is the seeded shuffle of the others', () => {
    const g = start();
    const library = g.state.seats[0]?.library ?? [];
    const keep = g.id('forest');
    const result = shuffleLibrary(g.state, 0, [keep]);
    const rest = library.filter((id) => id !== keep);
    expect(result.state.seats[0]?.library).toEqual([keep, ...shuffle(rest, g.state.rng)[0]]);
    // Without a keep list every card is shuffled together.
    expect(shuffleLibrary(g.state, 0).state.seats[0]?.library).toEqual(
      shuffle(library, g.state.rng)[0],
    );
  });

  test('finding nothing is allowed; the library is still shuffled', () => {
    const g = start();
    g.act(0).activate(GROVE, { pay: true });
    g.passAll();
    const mark = g.mark();
    g.act(0).chooseCards();
    g.expect.librarySize(0, 10);
    const events = g.eventsSince(mark).map((e) => e.kind);
    expect(events).toContain('libraryShuffled');
    expect(events).not.toContain('cardsRevealed');
    g.expect.invariants();
  });

  test('with no enchantment in the library the search finds nothing and the library is shuffled', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GROVE)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(GROVE, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.librarySize(0, 6);
  });

  test('a spell that searches for any card without a reveal puts it on top too', () => {
    const g = scenario()
      .define(syntheticCard(TUTOR))
      .seat(0)
      .hand(TUTOR)
      .battlefield('Swamp', { count: 2 })
      .library('Grizzly Bears', { label: 'bears' })
      .library('Forest', { label: 'forest' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(TUTOR, { pay: true });
    g.passAll();
    g.act(0).chooseCards('bears');
    expect(g.state.seats[0]?.library[0]).toBe(g.id('bears'));
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.invariants();
  });
});
