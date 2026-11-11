// Scenario 12 (SPEC 12): state-based actions are performed simultaneously, as one event.
// Pins: CR 704.3 (State-Based Actions): all applicable actions are performed simultaneously as a
// single event; CR 704.5a: a player with 0 or less life loses; CR 704.5g: lethal damage destroys a
// creature; CR 104.4a (Ending the Game): if all remaining players lose simultaneously the game is a
// draw; CR 104.2a: one player left wins.
import { describe, expect, test } from 'vitest';
import { checkStateBasedActions } from '../src/rules/sba';
import { scenario } from '../src/testing/index';

describe('CR 704.3 (State-Based Actions): one check handles everything', () => {
  function board(life0: number, life1: number) {
    return scenario()
      .seat(0)
      .life(life0)
      .battlefield('Grizzly Bears', { damage: 2 })
      .battlefield('Llanowar Elves', { damage: 1 })
      .seat(1)
      .life(life1)
      .build();
  }

  test('two lethally damaged creatures and a player at 0 life are all handled in one check', () => {
    const g = board(0, 40);
    // Nothing happens until a player would receive priority (CR 117.5): the built state is as written.
    g.expect.zone('Grizzly Bears', 'battlefield');
    g.expect.zone('Llanowar Elves', 'battlefield');
    // One call of the check performs all of it at once: both deaths and the loss.
    const once = checkStateBasedActions(g.state);
    expect(once.performed).toBe(true);
    expect(once.events.filter((e) => e.kind === 'died')).toHaveLength(2);
    expect(once.events.filter((e) => e.kind === 'playerLost')).toEqual([
      { kind: 'playerLost', seat: 0, reason: 'life' },
    ]);
    expect(once.state.seats[0]?.hasLost).toBe(true);
    expect(once.state.battlefield).toEqual([]);
  });

  test('through the game: seat 1 would receive priority, so the check runs, and settles all of it', () => {
    const g = board(0, 40);
    g.act(0).pass();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.noObject('Grizzly Bears', { zone: 'battlefield' });
    g.expect.hasLost(0);
    // The game ended in that same check; had the loss been processed alone, the creatures would
    // have stayed on the battlefield. They are in the graveyard, so it was one check.
    g.expect.gameOver({ win: 1 });
    g.expect.eventLog([
      { kind: 'playerLost', seat: 0, reason: 'life' },
      { kind: 'died', cardName: 'Grizzly Bears' },
      { kind: 'died', cardName: 'Llanowar Elves' },
      { kind: 'gameEnded', result: 'win', winner: 1 },
    ]);
  });

  test('negative life loses as well as 0', () => {
    const g = board(-3, 40);
    g.act(0).pass();
    g.expect.hasLost(0);
    g.expect.gameOver({ win: 1 });
  });

  test('without a player at 0 life only the creatures go and the game goes on', () => {
    const g = board(5, 40);
    g.act(0).pass();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'playerLost' });
    g.expect.pending('priority', 1);
  });

  test('a repeat check finds nothing more (the loop ends when no action applies)', () => {
    const g = board(5, 40);
    g.act(0).pass();
    const again = checkStateBasedActions(g.state);
    expect(again.performed).toBe(false);
    expect(again.events).toEqual([]);
  });

  test('the creatures of both players die in the same check', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { damage: 2 })
      .seat(1)
      .battlefield('Grizzly Bears', { damage: 2 })
      .build();
    const once = checkStateBasedActions(g.state);
    expect(once.events.filter((e) => e.kind === 'died')).toHaveLength(2);
    expect(once.state.battlefield).toEqual([]);
  });
});

describe('CR 104.4a (Ending the Game): everyone loses at once is a draw', () => {
  test('both players at 0 life: the game is a draw', () => {
    const g = scenario().seat(0).life(0).seat(1).life(0).build();
    g.act(0).pass();
    g.expect.gameOver('draw');
    g.expect.hasLost(0);
    g.expect.hasLost(1);
    g.expect.eventLog([
      { kind: 'playerLost', seat: 0 },
      { kind: 'playerLost', seat: 1 },
      { kind: 'gameEnded', result: 'draw', winner: null },
    ]);
  });

  test('both below 0, and with creatures dying in the same check', () => {
    const g = scenario()
      .seat(0)
      .life(-2)
      .battlefield('Grizzly Bears', { damage: 2 })
      .seat(1)
      .life(0)
      .battlefield('Llanowar Elves', { damage: 1 })
      .build();
    g.act(0).pass();
    g.expect.gameOver('draw');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
  });

  test('once the game is over nothing more is legal and applyAction refuses', () => {
    const g = scenario().seat(0).life(0).seat(1).life(0).build();
    g.act(0).pass();
    expect(g.legalActions(0)).toEqual([]);
    expect(g.legalActions(1)).toEqual([]);
    expect(g.act(0).try.pass()).toEqual({ ok: false, error: 'The game is over' });
    expect(g.state.pending).toBeNull();
  });
});
