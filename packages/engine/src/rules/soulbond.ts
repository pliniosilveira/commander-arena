/**
 * Soulbond (CR 702.95, D-984): the pairing the two triggered abilities of the keyword make. `derive-keywords.ts` expands the keyword into the abilities of
 * `rules/soulbond-abilities.ts`; this file reads their intervening "if" (`soulbondReadyHolds`, CR 603.4) and runs their effect (`runPair`, CR 702.95a,
 * 702.95c, 702.95d). The designation itself is `rules/pairing.ts`.
 */
import type { Condition } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameObject, GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { isPaired, pairObjects } from './pairing';
import { done, type StepOutcome } from './step-outcome';

/**
 * CR 702.95a, 702.95c, 702.95d: `obj` can be paired by `seat` now: it is a creature on the battlefield under `seat`'s control (as `derive` types it) and is
 * unpaired. A creature whose partner is phased out is still paired (CR 702.26d: phasing does not end a pair), so it can not be paired again.
 */
export function canBePairedBy(
  state: GameState,
  obj: GameObject | undefined,
  seat: SeatId,
): obj is GameObject {
  return (
    obj !== undefined &&
    obj.zone === 'battlefield' &&
    controllerOf(state, obj) === seat &&
    !isPaired(state, obj) &&
    derive(state, obj).types.includes('creature')
  );
}

/** The creatures `self` may be paired with: the other creatures `seat` controls that are unpaired, in the order of the battlefield. */
export function soulbondCandidates(state: GameState, self: GameObject, seat: SeatId): ObjectId[] {
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return id !== self.id && canBePairedBy(state, obj, seat);
  });
}

/** What `soulbondReadyHolds` knows of the ability it is read for (a subset of `ConditionContext`). */
export interface SoulbondContext {
  readonly controller: SeatId;
  readonly source: ObjectId | null;
  readonly triggerSubject?: ObjectId;
}

/**
 * CR 702.95a, 603.4: the intervening "if" of the two abilities, read as the event happens and again as the ability resolves. The creature the ability
 * belongs to is on the battlefield under its controller's control and unpaired; `another`: they control another unpaired creature; `triggerSubject`: the
 * creature that entered is one too (and is not this one).
 */
export function soulbondReadyHolds(
  state: GameState,
  condition: Extract<Condition, { kind: 'soulbondReady' }>,
  ctx: SoulbondContext,
): boolean {
  const self = ctx.source === null ? undefined : state.objects[ctx.source];
  if (!canBePairedBy(state, self, ctx.controller)) return false;
  if (condition.with === 'another')
    return soulbondCandidates(state, self, ctx.controller).length > 0;
  const other = ctx.triggerSubject === undefined ? undefined : state.objects[ctx.triggerSubject];
  return other !== undefined && other.id !== self.id && canBePairedBy(state, other, ctx.controller);
}

type Pair = Extract<Instruction, { kind: 'pair' }>;

/**
 * Runs `pair` (CR 702.95a, 702.95c, 702.95d). Everything CR 702.95c asks is checked against the game now: the creature the ability belongs to and the one it
 * would be paired with are creatures on the battlefield under the control of the player who controls the ability, and neither is paired; if not, nobody
 * is paired. The controller is asked (a `choosePermanent` decision of purpose 'soulbond', `min` 0: choosing none is the "may", CR 603.5, and a
 * creature that is the only candidate is still asked) while there is a creature to pair with; nothing is asked, and nobody paired, when there is none (a
 * creature left in response). The instruction stays at the head of the queue until it is answered; an empty answer is a decline, never a prompt again.
 */
export function runPair(state: GameState, res: ResolutionContext, ins: Pair): StepOutcome {
  const seat = res.controller;
  const self = state.objects[res.source];
  if (!canBePairedBy(state, self, seat)) return done(state);
  let candidates: ObjectId[];
  if (ins.partner === 'choose') {
    candidates = soulbondCandidates(state, self, seat);
  } else {
    const other = res.triggerSubject === undefined ? undefined : state.objects[res.triggerSubject];
    candidates =
      other !== undefined && other.id !== self.id && canBePairedBy(state, other, seat)
        ? [other.id]
        : [];
  }
  if (candidates.length === 0) return done(state);
  if (ins.chosen === null) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'soulbond',
        subject: self.id,
        min: 0,
        max: 1,
        legal: candidates,
      },
    };
  }
  const [picked] = ins.chosen;
  if (picked === undefined || !candidates.includes(picked)) return done(state); // declined
  const events: GameEvent[] = [{ kind: 'creaturesPaired', a: self.id, b: picked, by: seat }];
  return done(pairObjects(state, self.id, picked, seat), events);
}
