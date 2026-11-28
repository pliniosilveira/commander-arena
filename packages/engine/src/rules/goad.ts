/**
 * Goad (CR 701.15, D-639): a keyword action that makes a creature goaded, a designation: the creature attacks each combat if able and attacks a player other than the
 * player that goaded it if able (CR 701.15b). Goaded is neither an ability nor part of the copiable values, so it is kept as continuous effects of the game (an effect
 * of a spell or ability, until the goader's next turn, CR 701.15a) and read from the permanents attached to the creature (a static ability that says "is goaded").
 * `rules/combat-legality.ts` reads `goadersOf` where attackers are declared.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { derive } from './derive';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/**
 * "Goad target creature" (CR 701.15a): each creature the effect names that is on the battlefield is goaded by the controller of the effect until that player's next
 * turn begins (the turn the effect resolves in is not counted, CR 500.1). CR 701.15d: a creature the same player already goaded is not goaded again, so no second
 * requirement is made and the first one keeps its end. The set is fixed now (CR 611.2c).
 */
export function runGoad(
  state: GameState,
  node: Extract<Effect, { kind: 'goad' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const affected = resolveObjects(state, node.objects, ctx, targets).filter((id) => {
    const obj = state.objects[id];
    return obj?.zone === 'battlefield' && derive(state, obj).types.includes('creature');
  });
  let next = state;
  const made: ContinuousEffect[] = [];
  const taken = state.seats[ctx.controller]?.turnsTaken ?? 0;
  for (const id of affected) {
    if (effectGoaders(next, id).includes(ctx.controller)) continue;
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    made.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      // CR 611.2b: "for the rest of the game" has no end.
      until:
        node.forever === true
          ? 'permanent'
          : { kind: 'turnStart', seat: ctx.controller, turnsTaken: taken + 1 },
      change: { kind: 'goaded', by: ctx.controller },
    });
  }
  if (made.length === 0) return done(state);
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...made] });
}

/**
 * "Each creature you control is no longer goaded" (CR 701.15a): the creatures the effect names are taken out of every continuous effect of a goad (any player's). A creature goaded by an
 * Aura's static "is goaded" stays goaded by it: that designation is not an effect of the game. The set is fixed now (CR 611.2c).
 */
export function runEndGoad(
  state: GameState,
  node: Extract<Effect, { kind: 'endGoad' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const affected = new Set(resolveObjects(state, node.objects, ctx, targets));
  let changed = false;
  const kept: ContinuousEffect[] = [];
  for (const e of state.continuousEffects) {
    if (e.change.kind !== 'goaded' || !e.objects.some((id) => affected.has(id))) {
      kept.push(e);
      continue;
    }
    changed = true;
    const rest = e.objects.filter((id) => !affected.has(id));
    if (rest.length > 0) kept.push({ ...e, objects: rest });
  }
  return changed ? done({ ...state, continuousEffects: kept }) : done(state);
}

/** The players whose spells or abilities have goaded `id` and whose turn has not begun since (CR 701.15a). */
function effectGoaders(state: GameState, id: ObjectId): SeatId[] {
  const seats: SeatId[] = [];
  for (const e of state.continuousEffects) {
    if (e.change.kind === 'goaded' && e.objects.includes(id)) seats.push(e.change.by);
  }
  return seats;
}

/**
 * The players whose spells or abilities goad the creature `id` now (CR 701.15b-c): the continuous effects of the `goad` effect that have not ended (CR 701.15a), each player once
 * (CR 701.15d). The static ability "is goaded" of an Aura (issue 201, CR 303.4m) is not read here: it is the derived `goadedBy` of the creature (`rules/derive-statics.ts`).
 */
export function goadersOf(state: GameState, id: ObjectId): SeatId[] {
  return [...new Set(effectGoaders(state, id))];
}
