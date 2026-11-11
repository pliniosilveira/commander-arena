/**
 * "Exile the top card of your library. You may play that card this turn." (D-151): the `exileTop` and `mayPlay` effects.
 *
 * `exileTop` puts the top cards of the controller's library into exile, face up, one after the other (CR 701.13 Exile); they are what `moved`
 * names afterwards. `mayPlay` gives the controller a `playPermission` for each card of `moved` that is in exile (CR 601.2, 305.1, 611.2a): a continuous
 * effect that names the card as it is (a card that leaves exile is a new object, CR 400.7) and lasts until the moment `until` says. What a player may
 * do with the permission is decided in `rules/legality.ts` (`mayPlayFromExile`): cast it at the timing of its type, paying its ordinary cost, or
 * play it when it is a land (the land drop counted, CR 305.2).
 */
import type { Amount, Effect, PlayUntil } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp, getSeat, patchObject } from '../state/ops';
import type {
  ChosenTarget,
  ContinuousEffect,
  EffectEnd,
  GameState,
  ResolutionContext,
} from '../state/types';
import { amountOf, moveInstructions, moving } from './effect-support';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/** The steps of a turn that come before its end step (CR 500.1): "your next end step" is this turn's while one of them is current. */
const BEFORE_END: readonly string[] = [
  'untap',
  'upkeep',
  'draw',
  'precombatMain',
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endOfCombat',
  'postcombatMain',
];

/** When a permission that lasts until `until` ends, for `seat` as it is created now. */
export function playEnd(state: GameState, seat: SeatId, until: PlayUntil): EffectEnd {
  if (until === 'endOfTurn') return 'endOfTurn';
  // D-187: "for as long as they remain exiled": nothing ends it but the card leaving exile, which makes it a new object (CR 400.7).
  if (until === 'whileExiled') return 'permanent';
  const taken = getSeat(state, seat).turnsTaken;
  // CR 500.1: "the end of your next turn" is the turn of the controller that comes after this moment: this turn is not it, even when it is theirs.
  if (until === 'endOfYourNextTurn') return { kind: 'turnEnd', seat, turnsTaken: taken + 1 };
  const thisTurn = state.turn.activeSeat === seat && BEFORE_END.includes(state.turn.step);
  return { kind: 'endStep', seat, turnsTaken: thisTurn ? taken : taken + 1 };
}

export function runExileTop(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'exileTop' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const n = amountOf(state, effect.count, ctx, []);
  // D-187: "the top two cards of target opponent's library": the library of the one player the selector names, a target that is gone (or no longer
  // legal) exiles nothing (CR 608.2b).
  const [owner] =
    effect.from === undefined ? [res.controller] : resolvePlayers(state, effect.from, ctx, targets);
  if (owner === undefined) return moving(state, []);
  const top = getSeat(state, owner).library.slice(0, Math.max(0, n));
  const moves = moveInstructions(top, 'exile');
  // CR 406.3 (D-187): "face down": no one may look at the cards.
  return moving(
    state,
    effect.faceDown === true
      ? moves.map((m) => (m.kind === 'move' ? { ...m, faceDown: true as const } : m))
      : moves,
  );
}

export function runMayPlay(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'mayPlay' }>,
): StepOutcome {
  const cards = (res.lastMoved ?? []).filter((id) => state.objects[id]?.zone === 'exile');
  const until = playEnd(state, res.controller, effect.lasts);
  let next = state;
  const created: ContinuousEffect[] = [];
  for (const id of cards) {
    // CR 406.3 (D-187): "you may look at and play those cards": the controller may look at each card that is face down, until it leaves exile.
    if (effect.lookAt === true && next.objects[id]?.exiledFaceDown === true) {
      const lookers = next.objects[id]?.lookers ?? [];
      if (!lookers.includes(res.controller)) {
        next = patchObject(next, id, { lookers: [...lookers, res.controller] });
      }
    }
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      until,
      change: { kind: 'playPermission', seat: res.controller },
    });
  }
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...created] });
}

/** `amount` with each "those cards that are still exiled" replaced by the cards `ids` (`cardsStillExiled`). */
function bakeAmount(amount: Amount, ids: readonly ObjectId[]): Amount {
  if (typeof amount === 'number') return amount;
  switch (amount.kind) {
    case 'exiledStillThere':
      return { kind: 'cardsStillExiled', objects: ids };
    case 'multiple':
      return { ...amount, of: bakeAmount(amount.of, ids) };
    case 'half':
      return { ...amount, of: bakeAmount(amount.of, ids) };
    case 'sum':
      return { ...amount, of: amount.of.map((a) => bakeAmount(a, ids)) };
    default:
      return amount;
  }
}

/**
 * "At the beginning of your next end step, ~ deals 2 damage to each opponent for each of those cards that are still exiled" (D-151, CR 603.7c):
 * a delayed trigger names no object of the spell that created it, so the cards its effect counts are written into it as it is created.
 */
export function bakeStillExiled(effect: Effect, ids: readonly ObjectId[]): Effect {
  switch (effect.kind) {
    case 'dealDamage':
      return { ...effect, amount: bakeAmount(effect.amount, ids) };
    case 'loseLife':
    case 'gainLife':
      return { ...effect, amount: bakeAmount(effect.amount, ids) };
    case 'draw':
      return { ...effect, count: bakeAmount(effect.count, ids) };
    case 'sequence':
      return { ...effect, effects: effect.effects.map((e) => bakeStillExiled(e, ids)) };
    default:
      return effect;
  }
}
