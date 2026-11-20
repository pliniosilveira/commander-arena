/**
 * "Move a counter from target permanent you control onto a second target permanent" (`moveCounter`, Nesting Grounds, Llanowar Reborn's Graft; CR 122.1, 122.6, 608.2d): one counter goes
 * from the permanent `from` names onto the one `to` names. With no kind named the controller chooses one when the source has counters of more than one kind the destination can have
 * (as a `chooseOne` of the kinds, so the decision is the engine's usual one of purpose 'effect'); with one kind it is that kind. Nothing moves when a permanent has left the battlefield, the
 * two are the same permanent, the source has no counter of the kind or the destination can't have it (CR 122.6).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import { patchObject } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { counterBlocked } from './counter-prevention';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type MoveCounter = Extract<Effect, { kind: 'moveCounter' }>;

export function runMoveCounter(
  state: GameState,
  effect: MoveCounter,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const fromId = resolveObjects(state, effect.from, ctx, targets)[0];
  const toId = resolveObjects(state, effect.to, ctx, targets)[0];
  if (fromId === undefined || toId === undefined || fromId === toId) return done(state);
  const from = state.objects[fromId];
  const to = state.objects[toId];
  if (from === undefined || to === undefined) return done(state);
  if (from.zone !== 'battlefield' || to.zone !== 'battlefield') return done(state);
  // The kinds the source has and the destination can have (CR 122.6).
  const kinds = Object.entries(from.counters)
    .filter(([kind, count]) => count > 0 && !counterBlocked(state, to, kind))
    .map(([kind]) => kind)
    .sort();
  const kind = effect.counter;
  if (kind === undefined) {
    const [only, ...more] = kinds;
    if (only === undefined) return done(state);
    if (more.length > 0) {
      // CR 608.2d: the controller chooses which kind of counter moves (a counter will move: every kind offered is legal and the choice is not optional).
      return {
        ...done(
          state,
          [],
          [
            {
              kind: 'chooseOne',
              options: kinds.map((counter) => ({
                label: counter,
                effect: { ...effect, counter },
              })),
              chosen: null,
            },
          ],
        ),
        performed: 1,
      };
    }
    return moveOne(state, fromId, toId, only, ctx);
  }
  if (!kinds.includes(kind)) return done(state);
  return moveOne(state, fromId, toId, kind, ctx);
}

function moveOne(
  state: GameState,
  fromId: ObjectId,
  toId: ObjectId,
  kind: string,
  ctx: SelectContext,
): StepOutcome {
  const from = state.objects[fromId];
  const to = state.objects[toId];
  if (from === undefined || to === undefined) return done(state);
  let next = patchObject(state, from.id, {
    counters: { ...from.counters, [kind]: (from.counters[kind] ?? 0) - 1 },
  });
  next = patchObject(next, to.id, {
    counters: { ...to.counters, [kind]: (to.counters[kind] ?? 0) + 1 },
  });
  // `performed` is what "you may" and "if you do" read (D-135): one counter moved.
  return {
    ...done(next, [
      { kind: 'counterRemoved', object: from.id, counter: kind, count: 1 },
      { kind: 'counterAdded', object: to.id, counter: kind, count: 1, by: ctx.controller },
    ]),
    performed: 1,
  };
}
