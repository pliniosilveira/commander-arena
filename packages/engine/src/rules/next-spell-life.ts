/**
 * "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (`nextSpellPayLife`, Marshland Bloodcaster; CR 118.9, 601.2b,
 * 601.2f, 202.3e, 119.4, 611.2a). The effect makes a `nextSpellLife` continuous effect for the controller that lasts until end of turn. While it exists, the controller's spells may be cast by the
 * alternative cost `lifeForMana` (a cast option listed beside the ordinary one: `rules/priority.ts`, `rules/legality.ts`; the cost is in `rules/cast-cost.ts`). The next spell the controller
 * casts uses every such effect up (`finishCast`), whether or not it was cast that way; a cancelled cast restores the state from before it, so the effect stays (CR 733). Lands are played, not
 * cast, and abilities are not spells, so neither uses it up (CR 305.1, 112.1).
 */
import type { SeatId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { ContinuousEffect, GameState, ResolutionContext } from '../state/types';
import { done, type StepOutcome } from './step-outcome';

/** `nextSpellPayLife`: the controller's next spell this turn may be cast by paying life instead of mana. */
export function runNextSpellPayLife(state: GameState, res: ResolutionContext): StepOutcome {
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: [],
    until: 'endOfTurn',
    change: { kind: 'nextSpellLife', seat: res.controller },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}

/** Whether `seat` may cast its next spell by paying life equal to its mana value (CR 118.9): an effect that grants it is still around. */
export function mayPayLifeForMana(state: GameState, seat: SeatId): boolean {
  return state.continuousEffects.some(
    (e) => e.change.kind === 'nextSpellLife' && e.change.seat === seat,
  );
}

/** CR 601.2i: the spell `seat` casts uses up the permission, however it was paid for. */
export function useUpNextSpellLife(state: GameState, seat: SeatId): GameState {
  if (!mayPayLifeForMana(state, seat)) return state;
  return {
    ...state,
    continuousEffects: state.continuousEffects.filter(
      (e) => !(e.change.kind === 'nextSpellLife' && e.change.seat === seat),
    ),
  };
}
