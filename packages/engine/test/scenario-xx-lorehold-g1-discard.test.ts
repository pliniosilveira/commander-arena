// Group 1 of the Lorehold Spirit deck (issue 86): "Whenever you discard a card, you may exile that card from your graveyard. If you do, you may play that card this turn." (Containment
// Construct: the trigger `discarded` of one card, `may` of an `exile` of the card, and `mayPlay` of it after "if you do"). The batch of discards and the payment of {1} and a discard are in
// scenario-xx-lorehold-g1-discard-batch.test.ts.
// Pins: CR 701.9a (discard), CR 603.2 and 603.2c (a trigger for each card discarded), CR 603.12 and 608.2c (an "if you do" reads what the instruction before it did), CR 400.7 (a card that
// left the graveyard is a new object), CR 601.2 and 305.1 (casting from exile at the timing of the type; playing a land from exile uses the land drop), CR 611.2a (the permission lasts until
// end of turn).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g1.ts); the real cards are played in packages/cards/test/convert-grammar-engine-lorehold-g1.test.ts.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GOLEM = 'SYNTHETIC Quarantine Golem'; // discard a card: may exile it, may play it this turn
const CAST_GOLEM = 'SYNTHETIC Cast Golem'; // the same, but "cast it"
const SEER = 'SYNTHETIC Doubting Seer'; // attacks: pay {1} and discard to draw; one or more nonland cards discarded: may exile one, may cast it
const WATCHER = 'SYNTHETIC Discard Watcher'; // one or more cards discarded: draw a card
const PAIR = 'SYNTHETIC Twin Discard'; // {R}: discard two cards
const LOOT = 'SYNTHETIC Loot'; // {U}: draw a card, then discard a card
const BOLT = 'Lightning Bolt';
const GOBLIN = 'Raging Goblin'; // {R}
const FILLER = Array.from({ length: 8 }, () => 'Mountain');

const defs = () =>
  scenario()
    .define(syntheticCard(GOLEM))
    .define(syntheticCard(CAST_GOLEM))
    .define(syntheticCard(SEER))
    .define(syntheticCard(WATCHER))
    .define(syntheticCard(PAIR))
    .define(syntheticCard(LOOT));

describe('the cards are valid', () => {
  test.each([GOLEM, CAST_GOLEM, SEER, WATCHER, PAIR, LOOT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Whenever you discard a card, you may exile that card from your graveyard. If you do, you may play that card this turn."', () => {
  const board = (...hand: string[]) =>
    defs()
      .seat(0)
      .hand(LOOT, ...hand)
      .library('Mountain', ...FILLER)
      .battlefield(GOLEM)
      .battlefield('Mountain', 'Mountain', 'Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 });

  /** Seat 0 casts Loot, which draws the Mountain on top, and discards `card`: the trigger of the Golem goes on the stack. */
  function discard(g: ReturnType<ReturnType<typeof board>['build']>, card: string) {
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(card);
  }

  test('accepting exiles that card and lets it be cast this turn', () => {
    const g = board(GOBLIN).build();
    discard(g, GOBLIN);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: GOBLIN });
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the permission is for that card only', () => {
    const g = board(GOBLIN, BOLT).build();
    discard(g, GOBLIN);
    g.passAll();
    g.act(0).accept();
    g.expect.legal(0, { cast: GOBLIN });
    g.expect.zone(BOLT, 'hand', { seat: 0 });
  });

  test('declining leaves the card in the graveyard with no permission', () => {
    const g = board(GOBLIN).build();
    discard(g, GOBLIN);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: GOBLIN });
  });

  test('a land card exiled this way can be played as a land, using the land drop (CR 305.2)', () => {
    const g = board('Forest').build();
    discard(g, 'Forest');
    g.passAll();
    g.act(0).accept();
    g.expect.legal(0, { playLand: 'Forest' });
    g.act(0).playLand('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the permission ends with the turn', () => {
    const g = board(GOBLIN).build();
    discard(g, GOBLIN);
    g.passAll();
    g.act(0).accept();
    g.expect.legal(0, { cast: GOBLIN });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.illegal(0, { cast: GOBLIN });
  });

  test("the permission is the controller's own: the opponent cannot cast the card", () => {
    const g = board(GOBLIN).build();
    discard(g, GOBLIN);
    g.passAll();
    g.act(0).accept();
    g.expect.illegal(1, { cast: { name: GOBLIN, seat: 0 } });
  });

  test('two cards discarded at once are two triggers, one for each card (CR 603.2c)', () => {
    const g = defs()
      .seat(0)
      .hand(PAIR, GOBLIN, BOLT)
      .library(...FILLER)
      .battlefield(GOLEM)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(PAIR, { pay: true });
    g.passAll();
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([`${GOLEM} (ability)`, `${GOLEM} (ability)`]);
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.act(0).accept();
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('another player discarding does not trigger it', () => {
    const g = defs()
      .seat(0)
      .hand('SYNTHETIC Opponent Discards Two')
      .battlefield(GOLEM)
      .battlefield('Mountain', 'Swamp')
      .seat(1)
      .hand(GOBLIN, BOLT)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('SYNTHETIC Opponent Discards Two', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(GOBLIN, 'graveyard', { seat: 1 });
  });
});
