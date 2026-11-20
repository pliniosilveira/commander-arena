/**
 * "Exchange target opponent's life total with this creature's toughness" (CR 701.12a, 701.12g, 119.5, 119.7, 119.8, 613.4b).
 *
 * The player and the permanent swap two numbers: the player gains or loses the life that makes their life total the permanent's power or toughness, and the permanent's power or
 * toughness is set (layer 7b, no end) to the life total the player had. If the entire exchange can't be completed, no part of it occurs (CR 701.12a).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, getSeat } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import type { OrderFlow } from './damage-order';
import { derive } from './derive';
import { gainLifeOf, loseLifeOf } from './effect-support';
import { lifeTotalIsLocked } from './player-lock';
import { cannotGainLife } from './player-protection';
import { resolveObjects, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

export function runExchangeLifeWithPt(
  state: GameState,
  effect: Extract<Effect, { kind: 'exchangeLifeWithPt' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
  flow: OrderFlow,
  source: ObjectId,
): StepOutcome {
  const seats = resolvePlayers(state, effect.player, ctx, targets);
  const objects = resolveObjects(state, effect.object, ctx, targets);
  const seat = seats[0];
  const id = objects[0];
  if (seats.length !== 1 || objects.length !== 1 || seat === undefined || id === undefined) {
    return done(state);
  }
  const permanent = state.objects[id];
  if (permanent?.zone !== 'battlefield') return done(state);
  const value = derive(state, permanent)[effect.stat];
  // CR 208.3: a permanent with no power or toughness has no value to give; the exchange can't be completed.
  if (value === null || value === undefined) return done(state);
  const life = getSeat(state, seat).life;
  const delta = value - life;
  // CR 119.7, 119.8: a player who can't gain life can't be given a higher life total, and one whose life total can't change can't be given another.
  if (delta > 0 && cannotGainLife(state, seat)) return done(state);
  if (delta !== 0 && lifeTotalIsLocked(state, seat)) return done(state);

  let next = state;
  const events: GameEvent[] = [];
  if (delta !== 0) {
    const r =
      delta > 0 ? gainLifeOf(next, seat, delta, flow, source) : loseLifeOf(next, seat, -delta);
    if ('kind' in r && r.kind === 'asked') {
      return { state, events: [], front: [], needs: r.decision };
    }
    next = r.state;
    events.push(...r.events);
  }
  // CR 701.12g, 613.4b: a continuous effect sets that power or toughness to the life total the player had, with no end (CR 611.2a).
  const [timestamp, stamped] = allocateTimestamp(next);
  const set: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: [id],
    until: 'permanent',
    change: {
      kind: 'setPt',
      power: effect.stat === 'power' ? life : null,
      toughness: effect.stat === 'toughness' ? life : null,
    },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, set] }, events);
}
