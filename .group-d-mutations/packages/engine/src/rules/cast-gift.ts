/**
 * Gift (CR 702.174, D-135): "As an additional cost to cast this spell, you may choose an opponent" (CR 702.174a). The caster
 * announces it as the spell is cast, after the kicker and replicate questions and before X and the targets (CR 601.2b, which
 * puts the choices of additional costs there): a `confirmOptional` decision of purpose `gift`, naming the opponent the gift
 * would go to. With several opponents each is offered in turn order until one is accepted; declining all casts the spell
 * with no gift. The opponent is kept on the spell (`StackData.giftTo`): "the gift was promised" (CR 702.174k) and "the chosen
 * player" read it, a permanent the spell becomes remembers it, and the target slots marked `ifGiftPromised` exist only
 * then (CR 702.174m, `targetSpecsOf`). The question is not asked when the gift could not be promised: no opponent is in the
 * game, or a target the promise requires has no legal choice.
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getObject, opponentsOf, patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { hasGift } from './alt-costs';
import { faceOf } from './legality';
import { fail, ok, type Result } from './result';
import { legalTargets, targetBounds } from './select';
import { setPending } from './set-pending';
import { sourceInfo } from './source-info';

/** "The chosen player draws a card" (CR 702.174e). */
const GIFT_DRAW: Effect = { kind: 'draw', player: { kind: 'giftRecipient' }, count: 1 };

/**
 * The effect that happens first as an instant or sorcery with a promised gift resolves (CR 702.174b, 702.174j: always before any other
 * spell ability of the card), or null: the spell has no gift, it was not promised, or it is a permanent spell (its gift is an enters
 * trigger, `derive-keywords.ts`).
 */
export function giftEffectOf(state: GameState, spell: GameObject): Effect | null {
  const face = faceOf(state, spell);
  if (spell.stack?.giftTo === undefined || !hasGift(face)) return null;
  return face?.types.some((t) => t === 'instant' || t === 'sorcery') === true ? GIFT_DRAW : null;
}

/** The step the cast goes on to once the gift is settled: announcing X, then the targets. */
export type AfterGift = (state: GameState, events: GameEvent[]) => Result;

/** Whether every target slot that exists only if the gift is promised could be filled (CR 702.174m). */
function giftTargetsPossible(
  state: GameState,
  seat: SeatId,
  spell: ReturnType<typeof getObject>,
): boolean {
  const slots = (faceOf(state, spell)?.spell?.targets ?? []).filter(
    (spec) => spec.ifGiftPromised === true,
  );
  const ctx = { controller: seat, source: spell.id };
  return slots.every((spec) => legalTargets(state, spec, ctx).length >= targetBounds(spec).min);
}

function ask(state: GameState, events: GameEvent[], opponent: SeatId): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
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
        purpose: 'gift',
        giftTo: opponent,
      },
    ),
    events,
  );
}

/** After the kicker and replicate questions: asks about the gift, when the spell has one that could be promised. */
export function toGift(state: GameState, events: GameEvent[], after: AfterGift): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const spell = getObject(state, casting.object);
  if (!hasGift(faceOf(state, spell))) return after(state, events);
  const first = opponentsOf(state, casting.seat)[0];
  if (first === undefined || !giftTargetsPossible(state, casting.seat, spell)) {
    return after(state, events);
  }
  return ask(state, events, first);
}

/**
 * The answer to "promise a gift to this opponent?": accepting keeps the opponent on the spell and goes on to X and the targets;
 * declining offers the next opponent, or goes on with no gift.
 */
export function answerGift(state: GameState, accept: boolean, after: AfterGift): Result {
  const casting = state.casting;
  const d = state.pending;
  if (casting?.stage !== 'kicker' || d?.kind !== 'confirmOptional' || d.purpose !== 'gift') {
    return fail('No gift is being asked');
  }
  const opponent = d.giftTo;
  const stack = getObject(state, casting.object).stack;
  if (opponent === undefined || !stack) return fail('The spell is not on the stack');
  const cleared: GameState = { ...state, pending: null };
  if (accept) {
    return after(
      patchObject(cleared, casting.object, { stack: { ...stack, giftTo: opponent } }),
      [],
    );
  }
  const opponents = opponentsOf(state, casting.seat);
  const next = opponents[opponents.indexOf(opponent) + 1];
  return next === undefined ? after(cleared, []) : ask(cleared, [], next);
}
