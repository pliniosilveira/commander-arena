/**
 * A cast the engine offers and then cannot complete (CR 601.2c, 601.2h). Some casts are offered that
 * should not be (`docs/ROADMAP.md`: the targets are read after the cheapest cost is paid, a card in a
 * graveyard counts as its own target, the cost of a prepared copy), and the decision that follows cannot
 * be answered: a slot that needs a target lists none, or a payment is refused. The agents never loop on it:
 *
 *  - a targets decision with nothing to choose is answered with `cancel` (the other answer is refused);
 *  - a card that was chosen to be cast is not chosen again in that turn while it is still the same object.
 *    A cast that goes through moves the card to the stack, where it is a new object (CR 400.7); the same
 *    object offered again means the cast did not go through. Without this the game cycled cast, refusal and
 *    cancel until the action cap (2 of 12 precon games, thousands of refused answers).
 */
import type { Action, GameView, PriorityDecision, TargetsDecision } from '@commander-arena/engine';

/** Whether the decision is for a cast (or an activation) that needs a target and has none to choose. */
export const hasNoTargetToChoose = (d: TargetsDecision): boolean =>
  d.forTrigger !== true &&
  d.forCopy !== true &&
  d.forChange !== true &&
  d.specs.some((s) => s.min > 0 && s.legal.length === 0);

type CastAction = Extract<Action, { kind: 'castSpell' }>;

/** The loop-guard key of the cast an action makes: this turn, this object, this way of casting it. */
const castKey = (view: GameView, a: CastAction): string =>
  `cast:${view.turn}:${a.object}:${a.alternative ?? ''}:${a.face ?? ''}`;

/** The decision without the casts that were already chosen in this turn for the same object. */
export function withoutTriedCasts(
  view: GameView,
  d: PriorityDecision,
  tried: ReadonlySet<string>,
): PriorityDecision {
  const options = d.options.filter((o) => o.kind !== 'castSpell' || !tried.has(castKey(view, o)));
  return options.length === d.options.length ? d : { ...d, options };
}

/** Records that the action, when it is a cast, was chosen in this turn. */
export function noteCast(view: GameView, action: Action, tried: Set<string>): void {
  if (action.kind === 'castSpell') tried.add(castKey(view, action));
}
