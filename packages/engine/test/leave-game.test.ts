// A player leaves a game of three or four seats (issue 336, CR 800.4): the objects they own leave the game, the control effects they made end, what they still control
// is exiled, their triggers do not go on the stack, and the game goes on without them. Pins: CR 800.4a (what leaving does), 800.4b and 800.4d (nothing goes under their
// control, a trigger of theirs is not put on the stack), 104.3a (concede), 104.4a (all remaining players lose at once: a draw), 725.4 (the monarch passes on).
// The cards are real fixtures, or SYNTHETIC ones of `src/cards/fixtures/synthetic-control.ts`.
import { describe, expect, test } from 'vitest';
import { loseTheGame } from '../src/rules/lose-game';
import { settle } from '../src/rules/settle';
import { scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';
const BORROW = 'SYNTHETIC Borrow Creature'; // control of a creature until end of turn
const FILLER = Array.from({ length: 14 }, () => 'Plains');

const three = () =>
  scenario({ seats: 3 })
    .seat(0)
    .battlefield(BEARS)
    .library(...FILLER)
    .seat(1)
    .hand('Plains')
    .battlefield(BEARS, 'Mountain', 'Mountain', 'Mountain')
    .library(...FILLER)
    .seat(2)
    .battlefield(BEARS)
    .library(...FILLER);

describe('a seat leaves the game (CR 800.4a)', () => {
  test('conceding: the objects of the seat are gone from every zone, the game goes on', () => {
    const g = three().at('precombatMain', { active: 0, priority: 1 }).build();
    g.act(1).concede();
    g.expect.hasLost(1);
    g.expect.noObject(BEARS, { seat: 1 });
    g.expect.noObject('Mountain');
    g.expect.noObject('Plains', { zone: 'hand' });
    g.expect.librarySize(1, 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 2 });
    expect(g.state.result).toBeNull();
    g.expect.invariants();
  });

  test('losing by state-based actions leaves the same way', () => {
    const g = three().seat(1).life(0).at('precombatMain', { active: 0 }).build();
    g.act(0).pass();
    g.expect.hasLost(1);
    g.expect.noObject(BEARS, { seat: 1 });
    expect(g.state.result).toBeNull();
  });

  test('a seat loses in the same check as its creature dies of 0 toughness (CR 704.3, 800.4a)', () => {
    const g = three()
      .seat(1)
      .life(0)
      .battlefield(BEARS, { label: 'doomed', counters: { '-1/-1': 2 } })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.expect.hasLost(1);
    g.expect.noObject(BEARS, { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.state.result).toBeNull();
    g.expect.invariants();
  });

  test('the mirror: the same creature dies with no seat losing', () => {
    const g = three()
      .seat(1)
      .battlefield(BEARS, { label: 'doomed', counters: { '-1/-1': 2 } })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    expect(g.state.seats[1]?.hasLost).toBe(false);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a permanent owned by the seat and controlled by another leaves the game too', () => {
    const g = three()
      .seat(1)
      .battlefield(BEARS)
      .seat(2)
      .battlefield('Grizzly Bears', { controller: 1 })
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).concede();
    expect(g.find({ name: BEARS, zone: 'battlefield' }).map((o) => o.owner)).toEqual([0, 2]);
  });

  test('a permanent the seat controls but does not own is exiled (CR 800.4a)', () => {
    const g = three()
      .seat(2)
      .battlefield(BEARS, { controller: 1 })
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).concede();
    const exiled = g.find({ name: BEARS, zone: 'exile' });
    expect(exiled).toHaveLength(1);
    expect(exiled[0]?.owner).toBe(2);
  });

  test('control the seat took for a time ends: the permanent goes back to its owner, not to exile', () => {
    const g = three().seat(1).hand(BORROW).at('precombatMain', { active: 1 }).build();
    g.act(1).cast(BORROW, { targets: [{ name: BEARS, seat: 2 }], pay: true });
    g.passAll();
    g.act(1).concede();
    g.expect.zone(BEARS, 'battlefield', { seat: 2 });
    g.expect.noObject(BEARS, { seat: 1 });
    g.expect.invariants();
  });

  test('a spell of the seat on the stack is gone, and so is an ability of it', () => {
    const g = three().seat(1).hand('Lightning Bolt').at('precombatMain', { active: 1 }).build();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
    g.act(1).concede();
    g.expect.stack([]);
    g.expect.life(0, 40);
  });

  test('a concession with a spell half cast leaves cleanly', () => {
    const g = three().seat(1).hand('Lightning Bolt').at('precombatMain', { active: 1 }).build();
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }] });
    g.act(1).concede();
    g.expect.hasLost(1);
    g.expect.noObject('Lightning Bolt');
    expect(g.state.casting).toBeNull();
  });
});

describe('a trigger of a seat that left does not go on the stack (CR 800.4d)', () => {
  test('a waiting trigger of the seat is dropped and the game settles', () => {
    const g = three().at('precombatMain', { active: 0 }).build();
    const trigger = {
      source: null,
      controller: 1,
      abilityIndex: 0,
      ability: { kind: 'triggered' },
      subject: null,
    };
    const withTrigger = {
      ...g.state,
      seats: g.state.seats.map((s) => (s.id === 1 ? { ...s, hasLost: true } : s)),
      pendingTriggers: [trigger],
    } as unknown as typeof g.state;
    // Before issue 336 this repeated an empty round until its guard threw "did not settle".
    const r = settle(withTrigger);
    expect(r.state.pendingTriggers).toEqual([]);
  });

  test('nothing waits for the seat after it concedes with a trigger pending', () => {
    const g = three().at('precombatMain', { active: 0, priority: 1 }).build();
    g.act(1).concede();
    expect(g.state.pendingTriggers.filter((t) => t.controller === 1)).toEqual([]);
  });
});

describe('seats that lose together', () => {
  test('two seats lose in one check: both leave, the third wins as the game ends', () => {
    const g = three().seat(1).life(0).seat(2).life(0).at('precombatMain', { active: 0 }).build();
    g.act(0).pass();
    g.expect.hasLost(1);
    g.expect.hasLost(2);
    g.expect.gameOver({ win: 0 });
  });

  test('every seat that remains loses at once: a draw (CR 104.4a)', () => {
    const g = three().seat(0).life(0).seat(1).life(0).seat(2).life(0).at('precombatMain').build();
    g.act(0).pass();
    g.expect.gameOver('draw');
  });

  test('a player who loses to an effect leaves; whether the others can lose is read before anyone leaves', () => {
    const g = three().at('precombatMain', { active: 0 }).build();
    const r = loseTheGame(g.state, [1, 2]);
    expect(r.state.seats[1]?.hasLost).toBe(true);
    expect(r.state.seats[2]?.hasLost).toBe(true);
  });
});

describe('the turn of a seat that leaves (CR 800.4j)', () => {
  test('the active seat concedes: the turn goes on and the next seat has priority', () => {
    const g = three().at('precombatMain', { active: 1 }).build();
    g.act(1).concede();
    g.expect.hasLost(1);
    g.expect.pending('priority', 2);
    g.expect.noObject(BEARS, { seat: 1 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 2 });
  });

  test('a seat that left is never asked for a decision', () => {
    const g = three().at('precombatMain', { active: 1 }).build();
    g.act(1).concede();
    for (let i = 0; i < 40 && g.state.result === null; i += 1) {
      const pending = g.state.pending;
      if (pending === null || pending.kind !== 'priority') break;
      expect(pending.seat).not.toBe(1);
      g.act(pending.seat).pass();
    }
  });
});

describe('a game of two seats keeps its final board', () => {
  test('the loser of a two seat game is not removed from the game that has ended', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).concede();
    g.expect.gameOver({ win: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});
