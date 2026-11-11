/**
 * Log lines for "[do something] unless [that player] pays [cost]" (CR 118.12a, `unlessPays`, D-111).
 * The question, the payment and the controller's "you may" have no event that names the effect, so
 * their lines are worded from the decision that was pending before the answer and the ability it
 * came from (the stack object `before` holds), as Ward's lines are (`describe-ward.ts`).
 */
import type { Action, GameEvent, GameState, ObjectId, SeatId } from '@commander-arena/engine';
import { unlessCostPhrase } from './cost-text';
import {
  effectBase,
  findUnless,
  inSentence,
  payerOf,
  type UnlessEffect,
  unlessResultText,
  type Who,
} from './unless-text';

export interface UnlessLine {
  readonly text: string;
  readonly seat: SeatId;
  readonly rule: string;
}

/** The `unlessPays` effect and the controller of the ability on the stack that asked. */
function abilityOf(
  before: GameState,
  source: ObjectId,
): {
  readonly unless: UnlessEffect;
  readonly controller: SeatId;
  readonly optional: boolean;
} | null {
  const object = before.objects[source];
  const ability = object?.stack?.ability;
  if (object === undefined || ability === undefined || ability === null) return null;
  const unless = findUnless(ability.effect);
  if (unless === null) return null;
  return {
    unless,
    controller: object.controller,
    optional: ability.kind === 'triggered' && ability.optional === true,
  };
}

const rel = (seat: SeatId, viewer: SeatId): Who => (seat === viewer ? 'you' : 'opp');
const nameOf = (who: Who): string => (who === 'you' ? 'You' : 'Opponent');

/** "You pay {1}." / "You don't pay; Opponent draws a card." for the payer's answer to the question. */
export function unlessAnswerLine(
  before: GameState,
  event: Extract<GameEvent, { kind: 'optionalAnswered' }>,
  viewer: SeatId,
): UnlessLine | null {
  const asked = before.pending;
  if (asked?.kind !== 'confirmOptional' || asked.purpose !== 'unlessPays') return null;
  if (asked.source !== event.source) return null;
  const found = abilityOf(before, asked.source);
  const payer = nameOf(rel(event.seat, viewer));
  const you = event.seat === viewer;
  const rule = 'CR 118.12a';
  if (event.accepted) {
    const does = unlessCostPhrase(asked.cost ?? [], !you);
    return { text: `${payer} ${does}.`, seat: event.seat, rule };
  }
  return { text: declineText(found, payer, you, event.seat, viewer), seat: event.seat, rule };
}

function declineText(
  found: ReturnType<typeof abilityOf>,
  payer: string,
  you: boolean,
  payerSeat: SeatId,
  viewer: SeatId,
): string {
  const dont = `${payer} ${you ? "don't" : "doesn't"} pay`;
  if (found === null) return `${dont}.`;
  const result = unlessResultText(
    found.unless,
    rel(found.controller, viewer),
    rel(payerSeat, viewer),
  );
  return result === null ? `${dont}.` : `${dont}; ${inSentence(result.text)}.`;
}

/** The line for backing out of the payment (`cancel` at the `payMana` of the cost: "do not pay"). */
export function unlessCancelLine(
  before: GameState,
  action: Action | undefined,
  viewer: SeatId,
): UnlessLine | null {
  const asked = before.pending;
  if (action?.kind !== 'cancel' || asked?.kind !== 'payMana' || asked.purpose !== 'unlessPays') {
    return null;
  }
  const found = abilityOf(before, asked.source);
  const you = asked.seat === viewer;
  const payer = nameOf(rel(asked.seat, viewer));
  return {
    text: declineText(found, payer, you, asked.seat, viewer),
    seat: asked.seat,
    rule: 'CR 118.12a',
  };
}

/**
 * The controller's answer to "you may [effect]" after the payer did not pay: "You choose to draw a
 * card." / "You choose not to draw a card." The question is a plain `confirmOptional` on the ability
 * on the stack, whose own `optional` flag is not set; its event names the permanent (`source`), so the
 * question is matched through the stack object's source.
 */
export function mayEffectLine(
  before: GameState,
  event: Extract<GameEvent, { kind: 'optionalAnswered' }>,
  viewer: SeatId,
): UnlessLine | null {
  const asked = before.pending;
  if (
    asked?.kind !== 'confirmOptional' ||
    asked.purpose !== undefined ||
    asked.cost !== undefined
  ) {
    return null;
  }
  const object = before.objects[asked.source];
  if (object?.stack?.source !== event.source) return null;
  const found = abilityOf(before, asked.source);
  if (found === null || found.optional || found.unless.optional !== true) return null;
  const who = nameOf(rel(event.seat, viewer));
  const controller = rel(found.controller, viewer);
  const result = unlessResultText(
    found.unless,
    controller,
    payerOf(found.unless, controller, null),
  );
  const base = effectBase(found.unless.effect);
  const rule = 'CR 118.12a';
  const you = event.seat === viewer;
  // Only the controller's own effect is worded ("You choose to draw a card"); another player's
  // ("have Opponent lose 2 life") is left to the generic line.
  if (result === null || base === null || result.subject !== who) return null;
  return {
    text: `${who} choose${you ? '' : 's'} ${event.accepted ? 'to' : 'not to'} ${base}.`,
    seat: event.seat,
    rule,
  };
}
