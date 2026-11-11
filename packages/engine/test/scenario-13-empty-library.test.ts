// Scenario 13 (SPEC 12): drawing from an empty library.
// Pins: CR 121.4 (Drawing a Card) and CR 704.5b (State-Based Actions): a player who attempted to
// draw from an empty library loses the next time state-based actions are checked, which is when a
// player would next receive priority, not in the middle of the spell. CR 608.2c (Resolving Spells
// and Abilities): the spell's remaining instructions still happen.
// Uses SYNTHETIC "Draw Three Gain Five" (invented card, see src/cards/fixtures/synthetic.ts).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const SPELL = 'SYNTHETIC Draw Three Gain Five';

function castWith(libraryCards: number) {
  const b = scenario().seat(0).life(20).hand(SPELL).battlefield('Island', { count: 3 }).seat(1);
  if (libraryCards > 0) b.seat(0).library('Forest', { count: libraryCards });
  const g = b.build();
  g.act(0).cast(SPELL, { pay: true });
  return g;
}

describe('CR 704.5b (State-Based Actions): the spell finishes, then the player loses', () => {
  test('drawing three from a one-card library still gains the 5 life, then the player loses', () => {
    const g = castWith(1);
    g.passAll();
    // The spell finished: it drew the one card and gained 5 life (20 + 5).
    g.expect.zone('Forest', 'hand', { seat: 0, count: 1 });
    g.expect.life(0, 25);
    g.expect.zone(SPELL, 'graveyard', { seat: 0 });
    g.expect.eventLog([
      { kind: 'cardDrawn', seat: 0 },
      { kind: 'drewFromEmptyLibrary', seat: 0 },
      { kind: 'drewFromEmptyLibrary', seat: 0 },
      { kind: 'lifeChanged', seat: 0, from: 20, to: 25 },
      { kind: 'resolved' },
      { kind: 'playerLost', seat: 0, reason: 'emptyLibrary' },
      { kind: 'gameEnded', result: 'win', winner: 1 },
    ]);
    g.expect.hasLost(0);
    g.expect.gameOver({ win: 1 });
  });

  test('the loss is not part of the resolution: it comes at the check after it', () => {
    const g = castWith(1);
    g.expect.hasLost(0, false);
    g.act(0).pass();
    g.expect.hasLost(0, false);
    // The second pass resolves the spell; the loss is then found by the check before priority.
    const mark = g.mark();
    g.act(1).pass();
    g.expect.hasLost(0);
    g.expect.eventLog(
      [{ kind: 'resolved' }, { kind: 'playerLost', seat: 0, reason: 'emptyLibrary' }],
      { since: mark },
    );
  });

  test('an empty library from the start: all three draws fail, the 5 life still comes', () => {
    const g = castWith(0);
    g.passAll();
    g.expect.life(0, 25);
    g.expect.handSize(0, 0);
    g.expect.hasLost(0);
  });

  test('exactly three cards in the library: no loss', () => {
    const g = castWith(3);
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, 0);
    g.expect.life(0, 25);
    g.expect.hasLost(0, false);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'drewFromEmptyLibrary' });
  });

  test('an empty library only loses when a draw is attempted, not before', () => {
    const g = scenario().seat(0).seat(1).build();
    expect(g.state.seats[0]?.library).toHaveLength(0);
    g.passAll();
    g.expect.hasLost(0, false);
  });

  test('the draw step with an empty library loses before anyone can act (CR 121.4)', () => {
    const g = scenario()
      .seat(0)
      .seat(1)
      .library('Forest')
      .at('end', { active: 0, turn: 3 })
      .build();
    // Seat 1 draws its only card in its draw step: not a failed draw, so no loss.
    g.advanceTo('draw', { turn: 4 });
    g.expect.zone('Forest', 'hand', { seat: 1 });
    g.expect.hasLost(1, false);
  });

  test('a player that tries to draw in the draw step with no cards loses at that priority', () => {
    const g = scenario().seat(0).seat(1).at('end', { active: 0, turn: 3 }).build();
    g.advanceTo('upkeep', { turn: 4 });
    g.act(1).pass();
    g.act(0).pass();
    // Entering the draw step, seat 1 attempted a draw from an empty library; before priority it lost.
    g.expect.hasLost(1);
    g.expect.gameOver({ win: 0 });
    g.expect.eventLog([
      { kind: 'drewFromEmptyLibrary', seat: 1 },
      { kind: 'playerLost', seat: 1, reason: 'emptyLibrary' },
    ]);
  });
});
