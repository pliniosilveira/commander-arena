import type { GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import type { LogEntry } from '../src/game/protocol';
import { roundOf, turnLabel, turnOwner } from '../src/game/turn-label';
import { areaClass, battlefieldLabel } from '../src/ui/board/active-area';
import { groupByTurn, groupHeading } from '../src/ui/panels/log-model';

describe('round number (D-153)', () => {
  test('two players: turns 1 and 2 are round 1, 3 and 4 round 2', () => {
    const rounds = [1, 2, 3, 4, 5, 6, 9, 10, 11].map((n) => roundOf(n, 2));
    expect(rounds).toEqual([1, 1, 2, 2, 3, 3, 5, 5, 6]);
  });

  test('the first turn of the game is round 1 and setup is round 0', () => {
    expect(roundOf(1, 2)).toBe(1);
    expect(roundOf(0, 2)).toBe(0);
    expect(roundOf(-1, 2)).toBe(0);
  });

  test('three and four players share a round across all their turns', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => roundOf(n, 3))).toEqual([1, 1, 1, 2, 2, 2, 3]);
    expect([1, 4, 5, 8, 9].map((n) => roundOf(n, 4))).toEqual([1, 1, 2, 2, 3]);
  });

  test('one player rounds are their own turns; no seats gives no round', () => {
    expect(roundOf(5, 1)).toBe(5);
    expect(roundOf(5, 0)).toBe(0);
  });
});

describe('turn label', () => {
  test('names the player and the round, the official word "turn" kept', () => {
    expect(turnLabel(0, 0, 9, 2)).toBe('Your turn 5');
    expect(turnLabel(1, 0, 10, 2)).toBe("Opponent's turn 5");
    expect(turnLabel(0, 0, 1, 2)).toBe('Your turn 1');
    expect(turnLabel(1, 0, 2, 2)).toBe("Opponent's turn 1");
    expect(turnLabel(0, 0, 3, 2)).toBe('Your turn 2');
  });

  test('the viewer, not the seat number, is "Your"', () => {
    expect(turnOwner(1, 1)).toBe('Your');
    expect(turnOwner(0, 1)).toBe("Opponent's");
  });
});

function entry(turn: number, extra: Partial<LogEntry> = {}): LogEntry {
  return {
    id: turn,
    turn,
    seat: null,
    level: 'major',
    text: 'x',
    objects: [],
    rule: null,
    ...extra,
  };
}

describe('log group heading', () => {
  test('setup, then the player and the round', () => {
    const groups = groupByTurn([
      entry(0),
      entry(1, { activeSeat: 1, round: 1 }),
      entry(2, { activeSeat: 0, round: 1 }),
      entry(3, { activeSeat: 1, round: 2 }),
    ]);
    expect(groups.map((g) => groupHeading(g, 0))).toEqual([
      'Setup',
      "Opponent's turn 1",
      'Your turn 1',
      "Opponent's turn 2",
    ]);
  });

  test('a log without the seat and round falls back to the engine turn', () => {
    const [group] = groupByTurn([entry(4)]);
    if (group === undefined) throw new Error('no group');
    expect(groupHeading(group, 0)).toBe('Turn 4');
  });
});

const view = (activeSeat: number, prioritySeat: number | null = null): GameView =>
  ({ viewer: 0, activeSeat, prioritySeat }) as unknown as GameView;

describe('active area', () => {
  test('the class follows the active seat, never priority', () => {
    expect(areaClass(view(0, 1), 0)).toBe('is-active-area');
    expect(areaClass(view(0, 1), 1)).toBe('is-idle-area');
    expect(areaClass(view(1, 0), 0)).toBe('is-idle-area');
    expect(areaClass(view(1, 0), 1)).toBe('is-active-area');
  });

  test('the battlefield names whose turn it is, not by colour alone', () => {
    expect(battlefieldLabel(view(0), 0)).toBe('Your battlefield, your turn');
    expect(battlefieldLabel(view(0), 1)).toBe("Opponent's battlefield");
    expect(battlefieldLabel(view(1), 1)).toBe("Opponent's battlefield, opponent's turn");
    expect(battlefieldLabel(view(1), 0)).toBe('Your battlefield');
  });
});
