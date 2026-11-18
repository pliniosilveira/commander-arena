// Issue 89 (Silverquill Influence), group 11 (D-648): the intervening "if" of Breena, the Demagogue: "if that opponent has more life than another of your opponents" (CR 603.4), read from a
// `playerAttacksOpponent` trigger: the opponent the declaration attacked, against the other opponents of the controller who are still in the game.
// Pins: CR 603.4 (an intervening "if": the condition is read as the ability triggers and as it resolves), CR 104.3 (a player who has lost is no opponent to compare with), "another of your
// opponents" (a different opponent than the one attacked), and "more": strictly more life.
// The DSL builds two seats, so the condition is evaluated on states with a third seat made from the second (as scenario-xx-korvold-triggers.test.ts does for a third player).
import { describe, expect, test } from 'vitest';
import { evaluateCondition } from '../src/rules/conditions';
import { type ScenarioGame, scenario } from '../src/testing/index';

const IF = { kind: 'attackedHasMoreLifeThanOtherOpponent' } as const;

function threeSeats(lives: readonly [number, number, number], lost: readonly boolean[] = []) {
  const g: ScenarioGame = scenario().seat(0).seat(1).build();
  const [s0, s1] = g.state.seats;
  if (s0 === undefined || s1 === undefined) throw new Error('seats');
  const seats = [
    { ...s0, life: lives[0], hasLost: lost[0] ?? false },
    { ...s1, life: lives[1], hasLost: lost[1] ?? false },
    { ...s1, id: 2, life: lives[2], hasLost: lost[2] ?? false },
  ] as typeof g.state.seats;
  return { ...g.state, seats };
}

const at = (state: ReturnType<typeof threeSeats>, attacked: 1 | 2) =>
  evaluateCondition(state, IF, { controller: 0, source: null, triggerAttacked: [attacked] });

describe('"if that opponent has more life than another of your opponents"', () => {
  test('the opponent attacked has more life than the other one: true', () => {
    expect(at(threeSeats([40, 30, 20]), 1)).toBe(true);
  });

  test('the other opponent has more life: false', () => {
    expect(at(threeSeats([40, 20, 30]), 1)).toBe(false);
  });

  test('equal life is not more: false (CR 603.4: "more")', () => {
    expect(at(threeSeats([40, 25, 25]), 1)).toBe(false);
  });

  test("the controller's own life does not count: it is not one of its opponents", () => {
    expect(at(threeSeats([1, 30, 30]), 1)).toBe(false);
    expect(at(threeSeats([99, 30, 20]), 1)).toBe(true);
  });

  test('an opponent who has lost the game is not compared with (CR 104.3)', () => {
    expect(at(threeSeats([40, 30, 5], [false, false, true]), 1)).toBe(false);
  });

  test('the attacked opponent is the one compared: attacking the weaker one is false', () => {
    expect(at(threeSeats([40, 30, 20]), 2)).toBe(false);
  });

  test('two players only: there is no other opponent, so false', () => {
    const g = scenario().seat(0).seat(1).build();
    expect(
      evaluateCondition(g.state, IF, { controller: 0, source: null, triggerAttacked: [1] }),
    ).toBe(false);
  });

  test('nobody attacked (no event): false', () => {
    expect(evaluateCondition(threeSeats([40, 30, 20]), IF, { controller: 0, source: null })).toBe(
      false,
    );
  });
});
