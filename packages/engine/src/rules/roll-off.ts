/**
 * "Each player rolls a d20. If one or more opponents had the highest result, this creature can't attack those players or planeswalkers they control this combat." (the effect
 * `eachPlayerRollsBarHighest`; CR 706.1, 706.2, 508.1a, 506.1): every player still in the game rolls one die in turn order from the active player, and the opponents of the controller
 * whose result is the highest of all the results (a tie with the controller or another opponent counts) are the players the creature may not attack.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, seatsInOrder } from '../state/ops';
import type { ContinuousEffect, GameState } from '../state/types';
import { rollDie } from './roll-die';
import { done, type StepOutcome } from './step-outcome';

/** The opponents of `controller` among `rolls` whose result is the highest of all the rolls (CR 706.2); none when `controller` alone rolled the highest. */
export function highestOpponentRollers(
  rolls: readonly { readonly seat: SeatId; readonly result: number }[],
  controller: SeatId,
): SeatId[] {
  const highest = Math.max(...rolls.map((r) => r.result));
  return rolls.filter((r) => r.seat !== controller && r.result === highest).map((r) => r.seat);
}

export function runEachPlayerRollsBarHighest(
  state: GameState,
  node: Extract<Effect, { kind: 'eachPlayerRollsBarHighest' }>,
  source: ObjectId | null,
  controller: SeatId,
): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  const rolls: { seat: SeatId; result: number }[] = [];
  for (const seat of seatsInOrder(state, state.turn.activeSeat)) {
    const rolled = rollDie(next, seat, node.sides);
    next = rolled.state;
    events.push(...rolled.events);
    rolls.push({ seat, result: rolled.result });
  }
  // CR 400.7: a creature that has left the battlefield is bound by nothing.
  if (rolls.length === 0 || source === null || next.objects[source]?.zone !== 'battlefield') {
    return done(next, events);
  }
  for (const seat of highestOpponentRollers(rolls, controller)) {
    const [timestamp, stamped] = allocateTimestamp(next);
    const created: ContinuousEffect = {
      id: `ce${timestamp}`,
      timestamp,
      objects: [source],
      // CR 511.3 (End of Combat Step): "this combat" lasts until the end of combat step ends.
      until: 'endOfCombat',
      change: { kind: 'cantAttackPlayer', seat },
    };
    next = { ...stamped, continuousEffects: [...stamped.continuousEffects, created] };
  }
  return done(next, events);
}
