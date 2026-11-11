/**
 * What Encore does to each token copy it makes (CR 702.141a, D-185): "For each opponent, create a token that's a copy of this card that attacks
 * that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step." The token is created like any
 * token (`rules/enter-token.ts`); this adds the three things that follow, for the opponent the token was made for.
 */

import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { GameState, TriggeredAbility } from '../state/types';

/**
 * "Sacrifice them at the beginning of the next end step": the delayed triggered ability each token gets. Like the exile of Unearth it is not an
 * ability of the token (CR 603.7e): it exists whatever happens to the token's abilities, and does nothing if the token is gone (CR 603.7c).
 */
export const ENCORE_SACRIFICE_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'each' },
  effect: { kind: 'sacrifice', objects: { kind: 'this' } },
};

/**
 * The requirement to attack `opponent` (CR 508.1d), the haste (CR 702.10) until end of turn and the delayed sacrifice for the token `token`, which
 * `controller` created.
 */
export function bindEncoreToken(
  input: GameState,
  token: ObjectId,
  controller: SeatId,
  opponent: SeatId,
): GameState {
  const [attackStamp, s1] = allocateTimestamp(input);
  const [hasteStamp, s2] = allocateTimestamp(s1);
  return {
    ...s2,
    continuousEffects: [
      ...s2.continuousEffects,
      {
        id: `ce${attackStamp}`,
        timestamp: attackStamp,
        objects: [token],
        until: 'endOfTurn',
        change: { kind: 'mustAttackPlayer', seat: opponent },
      },
      {
        id: `ce${hasteStamp}`,
        timestamp: hasteStamp,
        objects: [token],
        until: 'endOfTurn',
        change: { kind: 'grantKeyword', keyword: { kind: 'haste' } },
      },
    ],
    delayedTriggers: [
      ...s2.delayedTriggers,
      { source: token, controller, ability: ENCORE_SACRIFICE_ABILITY },
    ],
  };
}
