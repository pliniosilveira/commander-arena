// Group 1 of the Lorehold Spirit deck (issue 86), the batch of discards: "Whenever you discard one or more nonland cards, you may exile one of them from your graveyard. If you do, you may
// cast it this turn." (a batch trigger of `discarded`, the effect `exileFromTriggerCards`, the permission `mayPlay` with `castOnly`) and "Whenever this creature attacks, you may pay {1}
// and discard a card. If you do, draw a card." (`mayPay` with a mana cost and a discard cost).
// Pins: CR 603.2c (one trigger for one or more cards discarded at once, a trigger for each discard that is another event), CR 608.2d (the player chooses among the cards while the effect
// resolves; the choice is the offer), CR 603.12 and 608.2c ("if you do" reads whether a card was exiled), CR 400.7 (a card that left the graveyard is a new object: it is not offered),
// CR 601.2 and 305.1 ("cast" gives no permission to play a land), CR 118.3 (a cost that cannot be paid is not paid and nobody is asked), CR 701.9a (discard).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g1.ts); the real cards are played in packages/cards/test/convert-grammar-engine-lorehold-g1.test.ts.
import { describe, expect, test } from 'vitest';
import { syntheticCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const GOLEM = 'SYNTHETIC Quarantine Golem'; // discard a card: may exile it, may play it this turn
const CAST_GOLEM = 'SYNTHETIC Cast Golem'; // the same, but "cast it"
const SEER = 'SYNTHETIC Doubting Seer'; // attacks: pay {1} and discard to draw; one or more nonland cards discarded: may exile one, may cast it
const WATCHER = 'SYNTHETIC Discard Watcher'; // one or more cards discarded: draw a card
const PAIR = 'SYNTHETIC Double Discard'; // {R}: discard two cards
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

describe('"Whenever you discard one or more nonland cards, you may exile one of them from your graveyard. If you do, you may cast it this turn."', () => {
  const board = (...hand: string[]) =>
    defs()
      .seat(0)
      .hand(PAIR, ...hand)
      .library(...FILLER)
      .battlefield(SEER)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 });

  const discardPair = (g: ReturnType<ReturnType<typeof board>['build']>) => {
    g.act(0).cast(PAIR, { pay: true });
    g.passAll();
  };

  test('two nonland cards discarded at once are one trigger, and one of them may be chosen', () => {
    const g = board(GOBLIN, BOLT).build();
    discardPair(g);
    g.expect.stack([`${SEER} (ability)`]);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.zone).toBe('graveyard');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect([...d.legal].sort()).toEqual([g.id(GOBLIN), g.id(BOLT)].sort());
    g.act(0).chooseCards(BOLT);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.legal(0, { cast: BOLT });
    g.expect.illegal(0, { cast: GOBLIN });
    g.expect.invariants();
  });

  test('the card exiled can be cast this turn, for its cost', () => {
    const g = board(GOBLIN, BOLT).build();
    discardPair(g);
    g.passAll();
    g.act(0).chooseCards(GOBLIN);
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
  });

  test('choosing no card is declining: nothing is exiled and no card may be cast', () => {
    const g = board(GOBLIN, BOLT).build();
    discardPair(g);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: GOBLIN });
    g.expect.illegal(0, { cast: BOLT });
  });

  test('a land card discarded with them is not one of the cards: only nonland cards are offered', () => {
    const g = board(GOBLIN, 'Forest').build();
    discardPair(g);
    g.passAll();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(GOBLIN)]);
  });

  test('lands only: it does not trigger', () => {
    const g = board('Forest', 'Swamp').build();
    discardPair(g);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('the cards discarded at another time are not among them: each discard is its own occurrence', () => {
    const g = defs()
      .seat(0)
      .hand(LOOT, GOBLIN)
      .library(BOLT, ...FILLER)
      .battlefield(SEER)
      .battlefield('Island', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GOBLIN);
    g.passAll();
    expect(chooseCardsDecision(g).legal).toEqual([g.id(GOBLIN)]);
  });

  test('a card that has left the graveyard meanwhile is not offered (CR 400.7)', () => {
    // The Quarantine Golem and the Seer both see the one discard. Whichever of their abilities resolves first, nothing breaks: if the Golem's is first and it exiles the
    // card, the Seer's has no card in the graveyard to offer and asks nothing.
    const g = defs()
      .seat(0)
      .hand(LOOT, GOBLIN)
      .library(BOLT, ...FILLER)
      .battlefield(SEER)
      .battlefield(GOLEM)
      .battlefield('Island', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GOBLIN);
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    const pending = g.view(0).pending;
    expect(['confirmOptional', 'chooseCards']).toContain(pending?.kind);
    if (pending?.kind === 'confirmOptional') {
      g.act(0).accept();
      g.passAll();
      g.expect.pending('priority', 0);
      g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    } else {
      g.act(0).chooseCards(GOBLIN);
      g.passAll();
      g.expect.pending('priority', 0);
    }
    g.expect.invariants();
  });
});

describe('"Whenever you discard one or more cards, draw a card."', () => {
  test('two cards discarded at once draw one card (CR 603.2c)', () => {
    const g = defs()
      .seat(0)
      .hand(PAIR, GOBLIN, BOLT)
      .library('Island', 'Swamp', ...FILLER)
      .battlefield(WATCHER)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(PAIR, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.zone('Swamp', 'library', { seat: 0 });
  });

  test('a card discarded some other time is another trigger', () => {
    const g = defs()
      .seat(0)
      .hand(LOOT, GOBLIN)
      .library('Island', 'Swamp', ...FILLER)
      .battlefield(WATCHER)
      .battlefield('Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GOBLIN);
    g.passAll();
    // Loot drew one card and discarded one, the Watcher drew one more.
    g.expect.handSize(0, 2);
  });
});

describe('"you may cast it this turn" is no permission to play a land (CR 305.1, 601.2)', () => {
  const board = (...hand: string[]) =>
    defs()
      .seat(0)
      .hand(LOOT, ...hand)
      .library('Mountain', ...FILLER)
      .battlefield(CAST_GOLEM)
      .battlefield('Mountain', 'Mountain', 'Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 });

  test('a land card exiled this way stays in exile: it cannot be played', () => {
    const g = board('Forest').build();
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    g.passAll();
    g.act(0).accept();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.illegal(0, { playLand: 'Forest' });
  });

  test('a nonland card exiled this way can be cast', () => {
    const g = board(GOBLIN).build();
    g.act(0).cast(LOOT, { pay: true });
    g.passAll();
    g.act(0).chooseCards(GOBLIN);
    g.passAll();
    g.act(0).accept();
    g.expect.legal(0, { cast: GOBLIN });
  });
});

describe('"Whenever this creature attacks, you may pay {1} and discard a card. If you do, draw a card." (CR 118.3, 608.2c)', () => {
  const board = (hand: readonly string[], lands = 2) =>
    defs()
      .seat(0)
      .hand(...hand)
      .library('Island', 'Swamp', ...FILLER)
      .battlefield(SEER, { label: 'seer' })
      .battlefield(...Array.from({ length: lands }, () => 'Mountain'))
      .seat(1)
      .library(...FILLER)
      .at('beginningOfCombat', { active: 0 });

  test('accepting discards the card chosen, pays the mana and draws a card', () => {
    const g = board([GOBLIN, BOLT]).build();
    g.passAll();
    g.act(0).attack('seer');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    expect(chooseCardsDecision(g).purpose).toBe('discard');
    g.act(0).chooseCards(BOLT);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('declining pays nothing, discards nothing and draws nothing', () => {
    const g = board([GOBLIN, BOLT]).build();
    g.passAll();
    g.act(0).attack('seer');
    g.passAll();
    g.act(0).decline();
    g.expect.handSize(0, 2);
    g.expect.zone('Island', 'library', { seat: 0 });
    g.expect.pool(0, '');
  });

  test('with one card in hand the card is discarded without a question', () => {
    const g = board([GOBLIN]).build();
    g.passAll();
    g.act(0).attack('seer');
    g.passAll();
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'hand', { seat: 0 });
  });

  test('with no card in hand the cost cannot be paid: nobody is asked and nothing is drawn (CR 118.3)', () => {
    const g = board([]).build();
    g.passAll();
    g.act(0).attack('seer');
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.handSize(0, 0);
    g.expect.zone('Island', 'library', { seat: 0 });
  });

  test('with no mana for {1} the cost cannot be paid: nobody is asked and the cards are kept', () => {
    const g = board([GOBLIN, BOLT], 0).build();
    g.passAll();
    g.act(0).attack('seer');
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.handSize(0, 2);
  });

  test('the card paid for is discarded: a discard of a nonland card, so the Seer may exile it and cast it (an instant, at combat)', () => {
    const g = board([GOBLIN, BOLT], 3).build();
    g.passAll();
    g.act(0).attack('seer');
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards(BOLT);
    g.act(0).payAuto();
    g.passAll();
    g.expect.pending('chooseCards', 0);
    expect(chooseCardsDecision(g).legal).toEqual([g.id(BOLT)]);
    g.act(0).chooseCards(BOLT);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: BOLT });
  });
});
