/**
 * "You may cast spells this turn as though they had flash." (CR 601.3b, 702.8a, 611.2, 514.2; Alchemist's Refuge): a continuous effect of the game state that lets the
 * players the effect named cast any spell at the timing of an instant for the rest of the turn. The players are fixed as the effect begins (CR 611.2c). The effect
 * gives the spells no flash keyword; `castTiming` (`rules/legality.ts`) reads it through `hasGrantedFlashCasting`.
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type Node = Extract<Effect, { kind: 'grantCastAsThoughFlash' }>;

export function runGrantCastAsThoughFlash(
  state: GameState,
  node: Node,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const seats = resolvePlayers(state, node.player, ctx, targets);
  if (seats.length === 0) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  return done({
    ...stamped,
    continuousEffects: [
      ...stamped.continuousEffects,
      {
        id: `ce${timestamp}`,
        timestamp,
        objects: [],
        players: seats,
        until: 'endOfTurn',
        change: { kind: 'playerCastAsThoughFlash' },
      },
    ],
  });
}

/** Whether an effect of this turn lets the player cast spells as though they had flash (CR 601.3b). */
export function hasGrantedFlashCasting(state: GameState, seat: SeatId): boolean {
  return state.continuousEffects.some(
    (e) => e.change.kind === 'playerCastAsThoughFlash' && (e.players ?? []).includes(seat),
  );
}
