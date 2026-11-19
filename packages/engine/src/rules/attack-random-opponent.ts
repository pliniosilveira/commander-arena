/**
 * "Choose an opponent at random that this creature didn't attack during your last combat. This creature attacks that player this combat if able. If you can't choose an opponent this
 * way, tap this creature." (the effect `attackRandomOpponent`; CR 508.1d, 508.6, 506.1, 701.26a) and the record of the attacks of each combat phase that it reads.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { nextInt } from '../rng/index';
import type { RngState } from '../rng/types';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, opponentsOf, patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { done, type StepOutcome } from './step-outcome';

/** One item of a non-empty list, chosen by the game's generator (a list of one draws nothing). */
export function pickRandom<T>(items: readonly T[], rng: RngState): [T, RngState] {
  const [index, next] = nextInt(rng, items.length);
  return [items[index] as T, next];
}

/**
 * A combat phase begins (CR 506.1): the attacks of the one before it become the "last combat" of the player who declared them, and a new record starts. Run as the beginning of
 * combat step begins, before its triggers are put on the stack, so an ability of that step reads the combat before this one.
 */
export function beginCombatRecord(state: GameState, active: SeatId): GameState {
  const previous = state.combatAttacks;
  const last =
    previous === undefined
      ? state.lastCombatAttacks
      : { ...(state.lastCombatAttacks ?? {}), [previous.seat]: previous.attacks };
  return {
    ...state,
    ...(last === undefined ? {} : { lastCombatAttacks: last }),
    combatAttacks: { seat: active, attacks: [] },
  };
}

/** Creatures were declared attacking players (CR 508.1, 508.6): added to the record of the combat phase in progress. */
export function recordAttacks(
  state: GameState,
  seat: SeatId,
  attacks: readonly { readonly object: ObjectId; readonly player: SeatId }[],
): GameState {
  if (attacks.length === 0) return state;
  const current = state.combatAttacks ?? { seat, attacks: [] };
  return {
    ...state,
    combatAttacks: { seat: current.seat, attacks: [...current.attacks, ...attacks] },
  };
}

/**
 * The effect (CR 508.1d, 701.26a): the opponents of the controller still in the game that the creature was not declared attacking in the controller's last combat phase are the
 * candidates; one is picked by the seeded generator and the creature must attack that player this combat if able (the requirement `mustAttackPlayer`, until the combat ends); with no
 * candidate the creature is tapped. A creature that is no longer on the battlefield is neither required nor tapped.
 */
export function runAttackRandomOpponent(
  state: GameState,
  node: Extract<Effect, { kind: 'attackRandomOpponent' }>,
  source: ObjectId | null,
  controller: SeatId,
): StepOutcome {
  const creature = source === null ? undefined : state.objects[source];
  if (source === null || creature?.zone !== 'battlefield') return done(state);
  // `anyOpponent`: no opponent is left out for having been attacked, and no creature is tapped when there is no opponent.
  const attacked = new Set(
    node.anyOpponent === true
      ? []
      : (state.lastCombatAttacks?.[controller] ?? [])
          .filter((a) => a.object === source)
          .map((a) => a.player),
  );
  const candidates = opponentsOf(state, controller).filter((seat) => !attacked.has(seat));
  const events: GameEvent[] = [];
  if (candidates.length === 0) {
    if (node.anyOpponent === true) return done(state);
    if (creature.tapped) return done(state);
    events.push({ kind: 'tapped', object: source, by: controller });
    return done(patchObject(state, source, { tapped: true }), events);
  }
  const [opponent, rng] = pickRandom(candidates, state.rng);
  const [stamp, next] = allocateTimestamp({ ...state, rng });
  return done(
    {
      ...next,
      continuousEffects: [
        ...next.continuousEffects,
        {
          id: `ce${stamp}`,
          timestamp: stamp,
          objects: [source],
          until: 'endOfCombat',
          change: { kind: 'mustAttackPlayer', seat: opponent },
        },
      ],
    },
    events,
  );
}
