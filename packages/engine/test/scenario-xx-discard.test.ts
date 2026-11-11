// Discard as an effect (CR 701.9) and the chooseCards decision for a hand.
// Pins: CR 701.9a (a discarded card goes from the hand to the graveyard), CR 701.9b (the discarding
// player chooses by default, which is not always the effect's controller), CR 608.2d (the choice is
// made while the effect resolves; "draw a card, then discard a card" is two steps in order), and
// that a player with fewer cards than asked discards the whole hand.
// All cards are SYNTHETIC (see src/cards/fixtures/synthetic-search.ts and synthetic.ts).
import { describe, expect, test } from 'vitest';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

describe('draw a card, then discard a card', () => {
  function lootGame() {
    return scenario()
      .seat(0)
      .hand('SYNTHETIC Loot')
      .hand('Plains', { label: 'plains' })
      .hand('Grizzly Bears', { label: 'bears' })
      .pool('U')
      .library('Mountain', { label: 'mountain' })
      .library('Forest')
      .seat(1)
      .build();
  }

  test('the discard comes after the draw and may be the card just drawn', () => {
    const g = lootGame();
    g.act(0).cast('SYNTHETIC Loot', { pay: true });
    resolveTop(g);
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('discard');
    expect(d.zone).toBe('hand');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.prompt).toBe('Discard a card.');
    // The drawn card is in the hand to choose from (the spell itself is on the stack).
    expect(d.legal).toHaveLength(3);
    expect(d.legal).toContain(g.id('mountain'));
    const mark = g.mark();
    g.act(0).chooseCards('mountain');
    g.expect.zone('Mountain', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    const events = g.eventsSince(mark);
    expect(events.find((e) => e.kind === 'discarded')).toMatchObject({ seat: 0 });
    g.expect.eventLog([{ kind: 'zoneChanged', toZone: 'graveyard' }, { kind: 'discarded' }]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('the draw is already done when the player chooses', () => {
    const g = lootGame();
    g.act(0).cast('SYNTHETIC Loot', { pay: true });
    resolveTop(g);
    g.expect.eventLog([{ kind: 'cardDrawn', seat: 0 }]);
    g.expect.librarySize(0, 1);
    g.expect.zone('SYNTHETIC Loot', 'stack', { seat: 0 });
  });

  test('a card in the hand may be chosen instead', () => {
    const g = lootGame();
    g.act(0).cast('SYNTHETIC Loot', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('bears');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Mountain', 'hand', { seat: 0 });
  });

  test('the answer must be exactly one card of the hand', () => {
    const g = lootGame();
    g.act(0).cast('SYNTHETIC Loot', { pay: true });
    resolveTop(g);
    const before = g.hash();
    const plains = g.id('plains');
    const bears = g.id('bears');
    const attempts = [[], [plains, bears], [plains, plains], ['o999']];
    for (const objects of attempts) {
      expect(g.act(0).try.action({ kind: 'chooseCards', objects: objects as never }).ok).toBe(
        false,
      );
    }
    expect(g.act(1).try.action({ kind: 'chooseCards', objects: [plains] }).ok).toBe(false);
    expect(g.hash()).toBe(before);
  });

  test('lists every single card as a legal answer', () => {
    const g = lootGame();
    g.act(0).cast('SYNTHETIC Loot', { pay: true });
    resolveTop(g);
    const actions = g.legalActions(0);
    expect(actions.filter((a) => a.kind === 'chooseCards')).toHaveLength(3);
    expect(actions.at(-1)).toEqual({ kind: 'concede' });
  });
});

describe('discarding with fewer cards than asked (CR 701.9a)', () => {
  test('the whole hand is discarded without a question', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Discard Three')
      .hand('Plains', 'Forest')
      .pool('B')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Discard Three', { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.handSize(0, 0);
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    expect(g.events.filter((e) => e.kind === 'discarded')).toHaveLength(2);
  });

  test('exactly as many cards as asked also needs no question', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Discard Three')
      .hand('Plains', 'Forest', 'Island')
      .pool('B')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Discard Three', { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.handSize(0, 0);
  });

  test('with more cards than asked the player chooses which three', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Discard Three')
      .hand('Plains', 'Forest', 'Island', 'Swamp', 'Mountain')
      .pool('B')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Discard Three', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    expect(d.min).toBe(3);
    expect(d.max).toBe(3);
    expect(d.legal).toHaveLength(5);
    expect(d.prompt).toBe('Discard three cards.');
    // Ten ways to choose three of five.
    expect(g.legalActions(0).filter((a) => a.kind === 'chooseCards')).toHaveLength(10);
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: d.legal.slice(0, 2) }).ok).toBe(
      false,
    );
    g.act(0).chooseCards('Island', 'Mountain', 'Plains');
    g.expect.handSize(0, 2);
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone('Swamp', 'hand', { seat: 0 });
  });

  test('an empty hand discards nothing and nothing is asked', () => {
    const g = scenario().seat(0).hand('SYNTHETIC Discard Three').pool('B').seat(1).build();
    g.act(0).cast('SYNTHETIC Discard Three', { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    expect(g.events.filter((e) => e.kind === 'discarded')).toHaveLength(0);
    g.expect.zone('SYNTHETIC Discard Three', 'graveyard', { seat: 0 });
  });
});

describe("another player's discard (CR 701.9b)", () => {
  function opponentGame() {
    return scenario()
      .seat(0)
      .hand('SYNTHETIC Opponent Discards Two')
      .pool('CB')
      .seat(1)
      .hand('Plains', { label: 'plains' })
      .hand('Forest', { label: 'forest' })
      .hand('Grizzly Bears', { label: 'bears' })
      .build();
  }

  test('the target chooses, and only they may answer', () => {
    const g = opponentGame();
    g.act(0).cast('SYNTHETIC Opponent Discards Two', { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    g.expect.pending('chooseCards', 1);
    const d = chooseCardsDecision(g);
    expect(d.seat).toBe(1);
    expect(d.min).toBe(2);
    expect(d.legal).toEqual(g.state.seats[1]?.hand);
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: d.legal.slice(0, 2) }).ok).toBe(
      false,
    );
    g.act(1).chooseCards('plains', 'bears');
    g.expect.zone('Plains', 'graveyard', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('Forest', 'hand', { seat: 1 });
    // The controller of the spell gets priority again (CR 117.3b).
    g.expect.pending('priority', 0);
  });

  test('the controller sees only that a discard is in progress; the hand stays hidden', () => {
    const g = opponentGame();
    g.act(0).cast('SYNTHETIC Opponent Discards Two', { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    const mine = g.view(0);
    expect(mine.pending).toBeNull();
    expect(mine.pendingCards).toBeUndefined();
    expect(mine.waitingOn).toEqual({
      seat: 1,
      purpose: 'discard',
      sourceName: 'SYNTHETIC Opponent Discards Two',
    });
    expect(mine.seats[1]?.hand).toBeNull();
    expect(JSON.stringify(mine)).not.toContain('Grizzly Bears');
    const theirs = g.view(1);
    expect(theirs.pendingCards?.map((o) => o.name).sort()).toEqual(
      ['Forest', 'Grizzly Bears', 'Plains'].sort(),
    );
    expect(theirs.waitingOn).toBeUndefined();
  });
});

describe('each player discards', () => {
  test('the controller chooses first, then the other player', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Each Player Discards')
      .hand('Plains', 'Forest')
      .pool('CB')
      .seat(1)
      .hand('Island', 'Swamp')
      .build();
    g.act(0).cast('SYNTHETIC Each Player Discards', { pay: true });
    resolveTop(g);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Plains');
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Swamp');
    g.expect.pending('priority', 0);
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Swamp', 'graveyard', { seat: 1 });
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);
    const discards = g.events.filter((e) => e.kind === 'discarded');
    expect(discards.map((e) => (e.kind === 'discarded' ? e.seat : -1))).toEqual([0, 1]);
  });

  test('a player with a single card discards it without a question', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Each Player Discards')
      .hand('Plains', 'Forest')
      .pool('CB')
      .seat(1)
      .hand('Island')
      .build();
    g.act(0).cast('SYNTHETIC Each Player Discards', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('Plains');
    g.expect.pending('priority', 0);
    g.expect.handSize(1, 0);
    g.expect.zone('Island', 'graveyard', { seat: 1 });
  });
});
