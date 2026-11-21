// "As long as an opponent has N or less life" with three seats (CR 119.1, 800.4a): a player who has left the game is not an opponent any more, so their life total (which they keep,
// `loseTheGame` only marks them) is not looked at. SYNTHETIC card.
import { describe, expect, test } from 'vitest';
import { type GameState, getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BRUTE = 'SYNTHETIC Finisher';

const finisher = singleFaceCard({
  name: BRUTE,
  manaCost: ['2', 'R'],
  types: ['creature'],
  subtypes: ['Human'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 2,
  toughness: 2,
  oracleText: 'As long as an opponent has 10 or less life, ~ gets +3/+3.',
  abilities: [
    {
      kind: 'static',
      condition: { kind: 'lifeTotal', compare: { cmp: 'atMost', value: 10 }, player: 'opponent' },
      static: {
        kind: 'modifyPt',
        subject: { kind: 'this' },
        power: 3,
        toughness: 3,
      },
    },
  ],
});

/** Three seats; seat 0 controls the creature. `lives` and `lost` are set on the built state (the DSL builds the seats alive). */
function game(lives: readonly [number, number, number], lost: readonly boolean[] = []): GameState {
  const g = scenario({ seats: 3 })
    .seat(0)
    .define(finisher)
    .battlefield(BRUTE)
    .seat(1)
    .seat(2)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  return {
    ...g.state,
    seats: g.state.seats.map((s) => ({
      ...s,
      life: lives[s.id] ?? s.life,
      hasLost: lost[s.id] ?? false,
    })),
  };
}

const powerOf = (state: GameState): number | null =>
  getView(state, 0).battlefield.find((p) => p.name === BRUTE)?.power ?? null;

describe('"an opponent has N or less life" with three seats', () => {
  test('a living opponent at 10 or less makes it true', () => {
    expect(powerOf(game([40, 8, 40]))).toBe(5);
  });

  test('every living opponent above 10: false', () => {
    expect(powerOf(game([40, 20, 30]))).toBe(2);
  });

  test('an opponent who has left the game, with 0 life, does not make it true', () => {
    expect(powerOf(game([40, 0, 30], [false, true, false]))).toBe(2);
  });

  test('the opponent who is left decides: at 8 it is true even when another one has left', () => {
    expect(powerOf(game([40, 0, 8], [false, true, false]))).toBe(5);
  });
});
