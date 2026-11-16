/**
 * "You gain hexproof until end of turn" (CR 702.11b, 611.2, 514.2; Hylda group 3): a continuous effect of the game state that gives the players the effect named
 * hexproof for the rest of the turn, as "You have hexproof" of a permanent does while it stays (`rules/player-protection.ts`). The players are fixed as the effect
 * begins (CR 611.2c); a player who has hexproof can't be the target of spells or abilities their opponents control, and still can be of their own.
 */
import type { Effect } from '../ast/types';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type Node = Extract<Effect, { kind: 'grantPlayerHexproof' }>;

export function runGrantPlayerHexproof(
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
        change: { kind: 'playerHexproof' },
      },
    ],
  });
}
