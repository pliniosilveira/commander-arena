// Scenario 24 (SPEC 12): the cleanup step.
// Pins: CR 514.1 (Cleanup Step): the active player discards down to maximum hand size (normally
// seven); CR 514.2: all damage marked on permanents is removed (and "until end of turn" effects
// end, which no supported card creates yet); CR 514.3 and 514.3a: normally no player receives
// priority, but if state-based actions are performed or triggers wait, the active player gets
// priority and, once the stack is empty and all pass, another cleanup step begins. CR 402.2
// (Hand Size): a player's maximum hand size is seven unless an effect says otherwise. "No maximum
// hand size" is in scenario-xx-no-max-hand-size.test.ts; here SeatState.handSizeMax null means 7.
// CR 903.9a: a commander discarded to the graveyard may be put into the command zone.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const ISAMARU = 'Isamaru, Hound of Konda';

/** Seat 0's end step, ready to pass into cleanup; seat 1 can draw on the next turn. */
function endStep(hand: (b: ReturnType<typeof scenario>) => unknown) {
  const b = scenario().seat(0);
  hand(b);
  return b.seat(1).library('Island', { count: 4 }).at('end', { active: 0, turn: 3 }).build();
}

describe('CR 514.1 (Cleanup Step): discarding to hand size', () => {
  test('with 9 cards in hand the active player discards 2', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }));
    g.expect.step('end');
    g.passAll();
    g.expect.step('cleanup');
    g.expect.pending('discard', 0);
    expect(g.state.pending).toMatchObject({ kind: 'discard', seat: 0, count: 2 });
    g.act(0).chooseCards('Forest[0]', 'Forest[1]');
    g.expect.handSize(0, 7);
    g.expect.zone('Forest', 'graveyard', { seat: 0, count: 2 });
    g.expect.eventLog([
      { kind: 'discarded', seat: 0 },
      { kind: 'discarded', seat: 0 },
      { kind: 'turnBegan', seat: 1, turn: 4 },
    ]);
  });

  test('the discard options are every choice of exactly 2 cards (9 choose 2) plus concede', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }));
    g.passAll();
    const actions = g.legalActions(0);
    expect(actions.filter((a) => a.kind === 'chooseCards')).toHaveLength(36);
    expect(actions.filter((a) => a.kind === 'concede')).toHaveLength(1);
    expect(g.legalActions(1)).toEqual([]);
  });

  test('a wrong discard is rejected: too few, too many, repeated, or not in hand', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }).battlefield('Mountain'));
    g.passAll();
    const hand = g.state.seats[0]?.hand ?? [];
    const [a, b, c] = hand;
    if (!a || !b || !c) throw new Error('hand too small');
    const mountain = g.id('Mountain');
    const before = g.hash();
    for (const objects of [[a], [a, b, c], [a, a], [a, mountain]]) {
      const r = g.act(0).try.action({ kind: 'chooseCards', objects });
      expect(r).toEqual({ ok: false, error: 'Choose exactly the number of cards asked' });
    }
    g.expect.hash(before);
    g.expect.pending('discard', 0);
  });

  test('only the active player discards: the opponent keeps 9 cards', () => {
    const g = endStep((b) => b.hand('Forest', { count: 7 }));
    g.act(0).pass();
    expect(g.state.pending?.kind).toBe('priority');
    const h = scenario()
      .seat(0)
      .hand('Forest', { count: 7 })
      .seat(1)
      .hand('Island', { count: 9 })
      .library('Island', { count: 4 })
      .at('end')
      .build();
    h.passAll();
    h.expect.step('upkeep', { active: 1, turn: 4 });
    h.expect.handSize(1, 9);
  });

  test('seven cards or fewer: no discard and no priority in cleanup (CR 514.3)', () => {
    const g = endStep((b) => b.hand('Forest', { count: 7 }));
    g.passAll();
    // The cleanup step began and ended without anyone deciding anything.
    g.expect.eventLog([
      { kind: 'stepBegan', step: 'cleanup' },
      { kind: 'turnBegan', seat: 1, turn: 4 },
    ]);
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.expect.noEvent({ kind: 'discarded' });
  });

  test('a maximum hand size effect changes the number (CR 402.2): 8 discards one', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }).handSizeMax(8));
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'discard', count: 1 });
  });

  test('a larger maximum hand size means fewer discards: 12 cards with a maximum of 10 discards 2', () => {
    const g = endStep((b) => b.hand('Forest', { count: 12 }).handSizeMax(10));
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'discard', count: 2 });
  });

  test('the hand size is checked in cleanup, not earlier: 9 cards in the end step is fine', () => {
    const g = endStep((b) => b.hand('Forest', { count: 9 }));
    g.expect.pending('priority', 0);
    g.expect.handSize(0, 9);
  });
});

describe('CR 514.2 (Cleanup Step): damage wears off', () => {
  function damaged() {
    return scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { damage: 1 })
      .seat(1)
      .battlefield('Grizzly Bears', { damage: 1 })
      .library('Island', { count: 4 })
      .at('postcombatMain')
      .build();
  }

  test('damage stays until cleanup, then is removed from every permanent', () => {
    const g = damaged();
    g.advanceTo('end');
    g.expect.damage({ name: 'Grizzly Bears', seat: 0 }, 1);
    g.expect.damage({ name: 'Grizzly Bears', seat: 1 }, 1);
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.damage({ name: 'Grizzly Bears', seat: 0 }, 0);
    g.expect.damage({ name: 'Grizzly Bears', seat: 1 }, 0);
  });

  test('a creature that would have died to a second 1 damage later survives, since damage is gone', () => {
    const g = damaged();
    g.advanceTo('upkeep', { turn: 4 });
    // 1 marked damage before cleanup plus 1 after would have been lethal on a 2/2.
    expect(g.object({ name: 'Grizzly Bears', seat: 0 }).damage).toBe(0);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });

  test('damage is removed even while the player discards (both are part of cleanup)', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', { count: 9 })
      .battlefield('Grizzly Bears', { damage: 1 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('end')
      .build();
    g.passAll();
    g.expect.pending('discard', 0);
    g.act(0).chooseCards('Forest[0]', 'Forest[1]');
    g.expect.damage('Grizzly Bears', 0);
  });
});

describe('CR 514.3a (Cleanup Step): something happens during cleanup, so there is priority', () => {
  /** Nine cards: Isamaru (a commander), a Bolt and seven Forests; a Mountain to cast the Bolt. */
  function commanderInHand() {
    return scenario()
      .seat(0)
      .hand(ISAMARU, { commander: true, label: 'cmd' })
      .hand('Lightning Bolt')
      .hand('Forest', { count: 7 })
      .battlefield('Mountain')
      .seat(1)
      .library('Island', { count: 4 })
      .at('end', { active: 0, turn: 3 })
      .build();
  }

  test('discarding a commander puts it in the graveyard and the owner is asked (CR 903.9a)', () => {
    const g = commanderInHand();
    g.passAll();
    g.expect.pending('discard', 0);
    g.act(0).chooseCards('cmd', 'Forest[0]');
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
    g.expect.step('cleanup');
    g.expect.pending('commanderZone', 0);
  });

  test('after the choice the active player gets priority in cleanup and can cast an instant', () => {
    const g = commanderInHand();
    g.passAll();
    g.act(0).chooseCards('cmd', 'Forest[0]');
    g.act(0).sendToCommandZone();
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.step('cleanup', { active: 0, turn: 3 });
    g.expect.pending('priority', 0);
    g.expect.legal(0, { cast: 'Lightning Bolt' });
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.step('cleanup');
  });

  test('once the stack is empty and everyone passes, another cleanup step begins', () => {
    const g = commanderInHand();
    g.passAll();
    g.act(0).chooseCards('cmd', 'Forest[0]');
    g.act(0).sendToCommandZone();
    const mark = g.mark();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.step('cleanup');
    g.passAll();
    // The second cleanup step began (a stepBegan for cleanup), found nothing to do and the turn ended.
    g.expect.eventLog(
      [
        { kind: 'stepBegan', step: 'cleanup' },
        { kind: 'turnBegan', seat: 1, turn: 4 },
      ],
      { since: mark },
    );
    g.expect.step('upkeep', { active: 1, turn: 4 });
  });

  test('cleanup ran twice in total, and the second one needed no discard', () => {
    const g = commanderInHand();
    g.passAll();
    g.act(0).chooseCards('cmd', 'Forest[0]');
    g.act(0).declineCommandZone();
    g.expect.pending('priority', 0);
    g.passAll();
    const cleanups = g.events.filter((e) => e.kind === 'stepBegan' && e.step === 'cleanup');
    expect(cleanups).toHaveLength(2);
    expect(g.events.filter((e) => e.kind === 'discarded')).toHaveLength(2);
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.expect.zone(ISAMARU, 'graveyard', { seat: 0 });
  });

  test('a discard that does nothing but discard gives no priority', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', { count: 9 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('end', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.act(0).chooseCards('Forest[0]', 'Forest[1]');
    g.expect.step('upkeep', { active: 1, turn: 4 });
    expect(g.events.filter((e) => e.kind === 'stepBegan' && e.step === 'cleanup')).toHaveLength(1);
  });
});
