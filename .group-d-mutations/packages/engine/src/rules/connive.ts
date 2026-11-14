/**
 * Connive (CR 701.50, D-209, D-223): "that permanent's controller draws a card, then discards a card. If a nonland card is discarded this way, that player puts
 * a +1/+1 counter on the conniving permanent" (CR 701.50a).
 *
 * - CR 701.50b: if a permanent is no longer on the battlefield as the effect instructs it to connive, its last-known information says which object connived and who
 *   controlled it: it still connives (its last controller draws and discards) and no counter can be put on it.
 * - CR 701.50c: if several permanents are instructed to connive at the same time, the first player in APNAP order who controls (or last controlled) one or more of
 *   them chooses one of them and it connives; then the process is repeated for each remaining instruction. A player with one of them has nothing to choose.
 */
import type { ObjectId, SeatId } from '../ids';
import { seatsInOrder } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { done, type StepOutcome } from './step-outcome';

type ConniveNext = Extract<Instruction, { kind: 'conniveNext' }>;

/** The player who controls the permanent, or controlled it as it left (CR 701.50b), or null when nothing is known of it as a permanent. */
function connivingController(state: GameState, id: ObjectId): SeatId | null {
  const obj = state.objects[id];
  if (obj?.zone === 'battlefield') return controllerOf(state, obj);
  const known = state.lki[id]?.object;
  return known?.zone === 'battlefield' ? known.controller : null; // stored controller: frozen with the effective one as it left
}

/** The instruction that makes `objects` connive at the same time, in the order the effect names them; none for an empty list. */
export function conniveInstruction(state: GameState, objects: readonly ObjectId[]): Instruction[] {
  const pending = objects.flatMap((object) => {
    const seat = connivingController(state, object);
    return seat === null ? [] : [{ object, seat }];
  });
  return pending.length === 0 ? [] : [{ kind: 'conniveNext', pending, chosen: null }];
}

/** Runs one step of the process of CR 701.50c: asks the first player in APNAP order, if they control more than one, and makes one permanent connive. */
export function runConniveNext(
  state: GameState,
  res: ResolutionContext,
  ins: ConniveNext,
): StepOutcome {
  const apnap = seatsInOrder(state, state.turn.activeSeat);
  const seat = apnap.find((s) => ins.pending.some((p) => p.seat === s));
  // A player who has left the game controls nothing that can connive for them (the pending ones of such a seat are dropped).
  if (seat === undefined) return done(state);
  const mine = ins.pending.filter((p) => p.seat === seat).map((p) => p.object);
  const picked = ins.chosen?.[0] ?? (mine.length === 1 ? mine[0] : undefined);
  if (picked === undefined) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'conniveOrder',
        min: 1,
        max: 1,
        legal: mine,
      },
    };
  }
  const rest = ins.pending.filter((p) => p.object !== picked);
  return done(
    state,
    [],
    [
      { kind: 'draw', seat, count: 1, commanderChoice: null },
      { kind: 'discard', seat, count: 1, conniver: picked, chosen: null },
      ...(rest.length === 0 ? [] : [{ kind: 'conniveNext' as const, pending: rest, chosen: null }]),
    ],
  );
}
