// The two-seat board most scenario tests start from: both seats at 20 life with a library that
// does not run out, seat 0 at its precombat main phase.
import { type ScenarioGame, scenario } from '../src/testing/index';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

/** `mine` stocks seat 0 and `theirs` seat 1; both have 20 life and a library of Plains. */
export function twoSeatGame(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
): ScenarioGame {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
}
