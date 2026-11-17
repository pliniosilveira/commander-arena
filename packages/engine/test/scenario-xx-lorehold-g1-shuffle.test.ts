// Group 1 of the Lorehold Spirit deck (issue 86): "{T}: Mill two cards." and "{2}, Exile this artifact: Shuffle any number of target cards from your graveyard into your library."
// (a shuffle of the targets into the library: `moveToZone` to the library of an any-number slot, then `shuffle`).
// Pins: CR 701.24d (a library is shuffled even if no card is shuffled into it), CR 701.24a (the order of the library is random afterwards), CR 701.17a (mill: the top cards go to the
// graveyard), CR 115.1 and 601.2c (any number of targets: none to as many as there are), CR 608.2b (a target that left the graveyard is not shuffled), CR 602.2 and 118.12 (the
// exile of the artifact is a cost, paid when the ability is activated), CR 404.1 (only cards of your own graveyard).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g1.ts); the real card is played in packages/cards/test/convert-grammar-engine-lorehold-g1.test.ts.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { targetsDecision } from './pending-helpers';

const CLOCK = 'SYNTHETIC Memory Clock'; // {2} artifact: {T} mill two; {2}, exile it: shuffle any number of target cards from your graveyard into your library
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const LIBRARY = ['Island', 'Swamp', 'Forest', 'Mountain'];

const board = () =>
  scenario()
    .define(syntheticCard(CLOCK))
    .seat(0)
    .library(...LIBRARY)
    .graveyard(BEARS, { label: 'bears' })
    .graveyard(SPIDER, { label: 'spider' })
    .graveyard(BOLT, { label: 'bolt' })
    .battlefield(CLOCK, { label: 'clock' })
    .battlefield('Plains', 'Plains')
    .seat(1)
    .library(...LIBRARY)
    .graveyard('Serra Angel', { label: 'their angel' })
    .at('precombatMain', { active: 0 });

describe('the card is valid', () => {
  test(CLOCK, () => {
    expect(validateCard(syntheticCard(CLOCK))).toEqual([]);
  });
});

describe('{T}: Mill two cards (CR 701.17a)', () => {
  test('the top two cards of the library go to the graveyard', () => {
    const g = board().build();
    g.act(0).activate(CLOCK, { ability: 0 });
    g.passAll();
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 2);
    g.expect.tapped('clock');
  });
});

describe('{2}, Exile this artifact: Shuffle any number of target cards from your graveyard into your library (CR 701.24)', () => {
  test('the artifact is exiled as a cost and only cards of your own graveyard can be the targets', () => {
    const g = board().build();
    g.act(0).activate(CLOCK, { ability: 1 });
    const slot = targetsDecision(g).specs[0];
    // The cards of the graveyard of the controller: not the Angel of the other player's.
    expect(slot?.legal.map((t) => ('id' in t ? t.id : null)).sort()).toEqual(
      [g.id('bears'), g.id('spider'), g.id('bolt')].sort(),
    );
    expect(slot?.min).toBe(0);
    g.act(0).chooseTargets();
    g.act(0).payAuto();
    g.expect.zone(CLOCK, 'exile', { seat: 0 });
  });

  test('two targets go into the library, which is shuffled', () => {
    const g = board().build();
    g.act(0).activate(CLOCK, { ability: 1 }).targets(['bears', 'bolt']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.zone(BOLT, 'library', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.librarySize(0, LIBRARY.length + 2);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
    g.expect.zone(CLOCK, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('one target goes into the library', () => {
    const g = board().build();
    g.act(0).activate(CLOCK, { ability: 1 }).targets(['spider']).pay();
    g.passAll();
    g.expect.zone(SPIDER, 'library', { seat: 0 });
    g.expect.librarySize(0, LIBRARY.length + 1);
  });

  test('every card of the graveyard may be the target', () => {
    const g = board().build();
    g.act(0).activate(CLOCK, { ability: 1 }).targets(['bears', 'spider', 'bolt']).pay();
    g.passAll();
    g.expect.librarySize(0, LIBRARY.length + 3);
    expect(g.find({ zone: 'graveyard', seat: 0, name: BEARS })).toHaveLength(0);
    expect(g.find({ zone: 'graveyard', seat: 0, name: SPIDER })).toHaveLength(0);
    expect(g.find({ zone: 'graveyard', seat: 0, name: BOLT })).toHaveLength(0);
  });

  test('no target at all: the library is shuffled anyway (CR 701.24d)', () => {
    const g = board().build();
    g.act(0).activate(CLOCK, { ability: 1 }).targets([]).pay();
    g.passAll();
    g.expect.librarySize(0, LIBRARY.length);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
    g.expect.zone(CLOCK, 'exile', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test("the other player's library is not shuffled", () => {
    const g = board().build();
    g.act(0).activate(CLOCK, { ability: 1 }).targets(['bears']).pay();
    g.passAll();
    g.expect.noEvent({ kind: 'libraryShuffled', seat: 1 }, { since: 0 });
  });
});
