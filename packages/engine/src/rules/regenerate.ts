/**
 * Regeneration (CR 701.19, D-120). "Regenerate [permanent]" from a resolving spell or ability creates a
 * regeneration shield, a replacement effect that protects the permanent the next time it would be destroyed
 * this turn (CR 701.19a). It is kept in `GameState.continuousEffects` as a `regenerate` change for one
 * permanent, until end of turn (CR 514.2), like a prevention shield (`rules/prevention.ts`), and read in the
 * two places a permanent is destroyed: the `destroy` effect and the state-based actions for lethal damage
 * and deathtouch (CR 704.5g, 704.5h).
 *
 * When the shield applies, the destruction does not happen. Instead all damage marked on the permanent is
 * removed, its controller taps it, and if it is an attacking or blocking creature it is removed from combat
 * (CR 701.19a). The shield is used up, so a second destruction in the same turn is not replaced unless
 * another shield was made (each resolution of "Regenerate" makes one).
 *
 * What it does not replace: sacrifice (CR 701.21), the state-based action for toughness 0 (CR 704.5f), the
 * legend rule (CR 704.5j), exile, and a destruction of a permanent that "can't be regenerated" (CR 701.19c:
 * the shield is not applied, and stays). Activating the ability or casting the spell that makes a shield is
 * not regenerating (CR 701.19c).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { removeFromCombat } from './combat-removal';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type RegenerateNode = Extract<Effect, { kind: 'regenerate' }>;

/** The shield protecting `id`, the oldest if it has several (CR 616.1 lets the controller choose; they are identical). */
function shieldOn(state: GameState, id: ObjectId): ContinuousEffect | undefined {
  return state.continuousEffects.find((e) => e.change.kind === 'regenerate' && e.objects[0] === id);
}

/** How many unused regeneration shields protect the permanent (for the view). */
export function regenerationShieldsOn(state: GameState, id: ObjectId): number {
  return state.continuousEffects.filter(
    (e) => e.change.kind === 'regenerate' && e.objects[0] === id,
  ).length;
}

/**
 * "Regenerate [permanent]" resolves (CR 701.19a): one shield for each permanent the selector names. A
 * target that is no longer a permanent on the battlefield is skipped (CR 608.2b).
 */
export function runRegenerate(
  state: GameState,
  node: RegenerateNode,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const affected = resolveObjects(state, node.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  if (affected.length === 0) return done(state);
  let next = state;
  const created: ContinuousEffect[] = [];
  for (const id of affected) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      until: 'endOfTurn',
      change: { kind: 'regenerate' },
    });
  }
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...created] });
}

/**
 * The destruction of `id` is replaced by its regeneration shield, if it has one (CR 701.19a). Returns the
 * new state and its events, or null when nothing replaces the destruction (no shield). The caller does not
 * call this for a destruction that can't be regenerated (CR 701.19c) or for an indestructible permanent,
 * which is not destroyed at all.
 */
export function regenerateInstead(
  state: GameState,
  id: ObjectId,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  const shield = shieldOn(state, id);
  const obj = state.objects[id];
  if (shield === undefined || obj?.zone !== 'battlefield') return null;
  const events: GameEvent[] = [{ kind: 'regenerated', object: id }];
  let next: GameState = {
    ...state,
    continuousEffects: state.continuousEffects.filter((e) => e.id !== shield.id),
  };
  // CR 701.19a: remove all damage marked on it, and its controller taps it.
  next = patchObject(next, id, { damage: 0, damagedByDeathtouch: false });
  if (!obj.tapped) {
    next = patchObject(next, id, { tapped: true });
    events.push({ kind: 'tapped', object: id });
  }
  const left = removeFromCombat(next, id);
  next = left.state;
  if (left.removed) events.push({ kind: 'removedFromCombat', object: id });
  return { state: next, events };
}
