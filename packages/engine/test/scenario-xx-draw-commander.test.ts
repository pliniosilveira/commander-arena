// A commander drawn from a library (CR 903.9b, 121.1, 121.2, 504.1).
// A commander can be in a library when its owner declined the command zone as it was put there
// (the put-from-hand-on-top effect of D-093). Putting the top card of the library into the hand is
// drawing it (CR 121.1), and a commander that would be put into its owner's hand from anywhere may
// go to the command zone instead (CR 903.9b), so every draw asks the owner. The CR does not say
// whether the replaced draw counts as a card drawn; the engine follows CR 121.1 (a draw is the card
// entering the hand): no `cardDrawn` event, no card in hand, and the draws that remain go on
// (CR 121.2, 121.6b: a sequence of draws resumes after a replacement is completed). D-097.
// Cards: Isamaru as the commander, Divination (real, "Draw two cards."), basic lands.
import { describe, expect, test } from 'vitest';
import { applyAction } from '../src/index';
import { scenario } from '../src/testing/index';

const ISAMARU = 'Isamaru, Hound of Konda';

/** Seat 0's upkeep of turn 3, the commander on top of its library, then two lands. */
function drawStepGame() {
  return scenario()
    .seat(0)
    .library(ISAMARU, { commander: true, label: 'cmd' })
    .library('Forest', { label: 'f' })
    .library('Island', { label: 'i' })
    .seat(1)
    .library('Plains', { count: 3 })
    .at('upkeep', { active: 0, turn: 3 })
    .build();
}

describe('CR 504.1 and 903.9b: the draw step draws a commander', () => {
  test('the owner is asked before the card moves, and the question names the library', () => {
    const g = drawStepGame();
    g.passAll();
    g.expect.step('draw');
    g.expect.pending('commanderZone', 0);
    expect(g.state.pending).toMatchObject({ kind: 'commanderZone', seat: 0, from: 'library' });
    g.expect.zone(ISAMARU, 'library', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.noEvent({ kind: 'cardDrawn' });
    g.expect.invariants();
  });

  test('accepting puts it into the command zone; no card was put into the hand', () => {
    const g = drawStepGame();
    g.passAll();
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.librarySize(0, 2);
    g.expect.eventLog([{ kind: 'commanderMovedToCommandZone', from: 'library' }]);
    g.expect.noEvent({ kind: 'cardDrawn' });
    // The draw step goes on: the active player gets priority in it.
    g.expect.step('draw');
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('declining draws it into the hand, a card drawn', () => {
    const g = drawStepGame();
    g.passAll();
    g.act(0).declineCommandZone();
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
    g.expect.handSize(0, 1);
    g.expect.eventLog([{ kind: 'cardDrawn', seat: 0 }]);
    g.expect.step('draw');
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('the engine lists exactly the two answers, for the owner only', () => {
    const g = drawStepGame();
    g.passAll();
    const kinds = g.legalActions(0).map((a) => a.kind);
    expect(kinds).toContain('moveToCommandZone');
    expect(kinds).toContain('declineCommandZone');
    expect(kinds).not.toContain('passPriority');
    expect(g.legalActions(1)).toEqual([]);
    // The other seat cannot answer it.
    expect(applyAction(g.state, 1, { kind: 'declineCommandZone' }).ok).toBe(false);
  });

  test('the next draw of the turn is not affected: the game goes on to the main phase', () => {
    const g = drawStepGame();
    g.passAll();
    g.act(0).sendToCommandZone();
    g.passAll();
    g.expect.step('precombatMain');
    g.expect.handSize(0, 0);
    g.expect.zone('Forest', 'library', { seat: 0 });
  });

  test('a commander that is not on top is drawn only when it gets there', () => {
    const g = scenario()
      .seat(0)
      .library('Forest')
      .library(ISAMARU, { commander: true })
      .seat(1)
      .library('Plains', { count: 3 })
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.step('draw');
    g.expect.pending('priority', 0);
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });
});

function divinationGame(order: readonly ('commander' | 'land')[]) {
  const b = scenario().seat(0).hand('Divination').pool('UUU');
  order.forEach((kind, i) => {
    if (kind === 'commander') b.library(ISAMARU, { commander: true });
    else b.library('Forest', { label: `land${i}` });
  });
  b.library('Island', { label: 'rest' });
  const g = b.seat(1).library('Plains').build();
  g.act(0).cast('Divination', { pay: true });
  g.passAll();
  return g;
}

describe('CR 121.2 and 121.6b: "draw two cards" draws one card at a time', () => {
  test('commander first, accepted: the question comes between the draws, then the rest go on', () => {
    const g = divinationGame(['commander', 'land']);
    g.expect.pending('commanderZone', 0);
    g.expect.handSize(0, 0);
    g.act(0).sendToCommandZone();
    // The second draw still happens: one card is in hand and the Island stays in the library.
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.handSize(0, 1);
    g.expect.zone('Island', 'library', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.zone('Divination', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('commander first, declined: both cards are drawn', () => {
    const g = divinationGame(['commander', 'land']);
    g.act(0).declineCommandZone();
    g.expect.handSize(0, 2);
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('commander second: the first card is already in hand when the owner is asked', () => {
    const g = divinationGame(['land', 'commander']);
    g.expect.pending('commanderZone', 0);
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.handSize(0, 1);
    g.act(0).sendToCommandZone();
    g.expect.handSize(0, 1);
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('a replaced draw is not a card drawn: one cardDrawn event for two draws', () => {
    const g = divinationGame(['commander', 'land']);
    const mark = g.mark();
    g.act(0).sendToCommandZone();
    const drawn = g.eventsSince(mark).filter((e) => e.kind === 'cardDrawn');
    expect(drawn).toHaveLength(1);
  });

  test('two commanders on top: asked twice, in order, the spell finishing after', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .pool('UUU')
      .library('Isamaru, Hound of Konda', { commander: true })
      .library('Serra Angel', { commander: true })
      .library('Island')
      .seat(1)
      .library('Plains')
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    g.expect.zone('Isamaru, Hound of Konda', 'command', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.zone('Divination', 'graveyard', { seat: 0 });
  });

  test('a commander drawn by the second card of a draw from a one-card library', () => {
    const g = scenario()
      .seat(0)
      .hand('Divination')
      .pool('UUU')
      .library(ISAMARU, { commander: true })
      .seat(1)
      .library('Plains')
      .build();
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.act(0).sendToCommandZone();
    // The second draw finds the library empty (CR 121.4): the player loses at the next check.
    g.expect.hasLost(0);
  });
});

describe('the opponent learns nothing from the question', () => {
  test('the view of the other seat has no pending decision and names no card', () => {
    const g = drawStepGame();
    g.passAll();
    const view = g.view(1);
    expect(view.pending).toBeNull();
    expect(view.decidingSeat).toBe(0);
    expect(JSON.stringify(view)).not.toContain('Isamaru');
  });
});

describe('draws made by triggered abilities ask the same question', () => {
  test('"When this creature enters, draw a card" with a commander on top', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Enters Draw Creature')
      .pool('UC')
      .library(ISAMARU, { commander: true })
      .library('Forest')
      .seat(1)
      .library('Plains')
      .build();
    g.act(0).cast('SYNTHETIC Enters Draw Creature', { pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('an upkeep draw asks, and the draw step then draws the next card', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Upkeep Reader')
      .library(ISAMARU, { commander: true })
      .library('Forest')
      .library('Island')
      .seat(1)
      .library('Plains', { count: 3 })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.passAll();
    g.expect.step('upkeep');
    g.expect.stack(['SYNTHETIC Upkeep Reader (ability)']);
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.step('upkeep');
    g.expect.pending('priority', 0);
    // The draw step draws the Forest: the replaced upkeep draw did not use it up.
    g.passAll();
    g.expect.step('draw');
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});
