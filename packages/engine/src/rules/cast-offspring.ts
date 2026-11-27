/**
 * Offspring (CR 702.175a), the cost half: "You may pay an additional [cost] as you cast this spell". The caster announces it as the spell is cast, after the kicker, replicate
 * and buyback questions and before the gift, X and the targets (CR 601.2b, which puts the choices of additional costs there): a `confirmOptional` decision of purpose
 * `offspring`. It is asked only when the whole cost with the offspring cost (and the kicker as it was answered) can be paid, so a player is never offered what the engine
 * would then refuse, and it is asked once: the cost can't be paid more than once. The answer is kept on the spell (`StackData.offspringPaid`), the permanent the spell
 * becomes remembers it (`GameObject.offspringPaid`, `rules/zones.ts`) and the enters trigger the keyword expands to reads it (`rules/derive-keywords.ts`).
 */
import type { GameEvent } from '../state/events';
import { getObject, patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { offspringCostOf } from './alt-costs';
import { alternativeOfStack, type CastFrom, canPayRequest, castAs } from './cast-cost';
import { faceOf } from './legality';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import { sourceInfo } from './source-info';

/** The step the cast goes on to once the offspring cost is settled: the gift, X, then the targets. */
export type AfterOffspring = (state: GameState, events: GameEvent[]) => Result;

/** After the kicker, replicate and buyback questions: asks about the offspring cost, when the spell has one that could be paid. */
export function toOffspring(state: GameState, events: GameEvent[], after: AfterOffspring): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const spell = getObject(state, casting.object);
  const stack = spell.stack;
  if (!stack) return fail('The spell is not on the stack');
  const cost = offspringCostOf(faceOf(state, spell));
  if (cost === null) return after(state, events);
  // Costs are read from the state before the cast began (`casting.snapshot`), with the card as it was.
  const before = casting.snapshot;
  const card = getObject(before, casting.from);
  const request = {
    seat: casting.seat,
    spell: castAs(card, casting.seat, spell.face),
    zone: casting.fromZone as CastFrom,
    alternative: alternativeOfStack(stack),
    excluded: card.id,
    kicked: stack.kicked,
    modes: stack.chosenModes.length,
    modeSet: stack.chosenModes,
    ...(stack.kicks === undefined ? {} : { kicks: stack.kicks }),
    offspring: true,
  } as const;
  if (!canPayRequest(before, casting.seat, request.spell, request)) return after(state, events);
  const info = sourceInfo(state, casting.object);
  return ok(
    setPending(
      // The question shares the stage of the kicker question: it is answered before X and the targets.
      { ...state, casting: { ...casting, stage: 'kicker' } },
      {
        kind: 'confirmOptional',
        seat: casting.seat,
        source: casting.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        cost,
        purpose: 'offspring',
      },
    ),
    events,
  );
}

/**
 * The answer to "pay the offspring cost?" (CR 702.175a, 601.2b): the spell remembers that it is paid or stays as it is, then the cast goes on. The answer has no event of
 * its own; `spellCast` says `offspring`.
 */
export function answerOffspring(state: GameState, accept: boolean, after: AfterOffspring): Result {
  const casting = state.casting;
  const d = state.pending;
  if (casting?.stage !== 'kicker' || d?.kind !== 'confirmOptional' || d.purpose !== 'offspring') {
    return fail('No offspring cost is being asked');
  }
  const stack = getObject(state, casting.object).stack;
  if (!stack) return fail('The spell is not on the stack');
  const next = patchObject({ ...state, pending: null }, casting.object, {
    stack: accept ? { ...stack, offspringPaid: true } : stack,
  });
  return after(next, []);
}
