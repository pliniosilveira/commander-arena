/**
 * A cast or an activation the engine offers and then cannot complete (CR 601.2c, 601.2h, 602.2b). Some casts are offered that
 * should not be (`docs/ROADMAP.md`: the targets are read after the cheapest cost is paid, a card in a graveyard counts as its own
 * target, the cost of a prepared copy), and the decision that follows cannot be answered: a slot that needs a target lists none,
 * the slots that must differ ("another target", CR 115.3) cannot be filled together, or a payment is refused. The agents never
 * loop on it:
 *
 *  - a targets decision with nothing to choose is answered with `cancel` (the other answer is refused);
 *  - a card that was chosen to be cast is not chosen again in that turn while it is still the same object.
 *    A cast that goes through moves the card to the stack, where it is a new object (CR 400.7); the same
 *    object offered again means the cast did not go through. Without this the game cycled cast, refusal and
 *    cancel until the action cap (2 of 12 precon games, thousands of refused answers);
 *  - an activation (object and ability index) whose targets decision the agent answered with a `cancel` (that one, or
 *    any other: asked again, it would cancel again) is not chosen again in that turn (issue 638: four-seat precon games
 *    cycled activate and cancel until the action cap). It is recorded on the failure, not on the choice: an activation
 *    that went through leaves the permanent the same object, and activating it again is legitimate.
 */
import {
  type Action,
  type GameView,
  legalActionsForDecision,
  type PriorityDecision,
  type TargetsDecision,
} from '@commander-arena/engine';

/** Whether the decision is for a cast (or an activation) that needs a target and has none to choose. */
export const hasNoTargetToChoose = (d: TargetsDecision): boolean =>
  d.forTrigger !== true &&
  d.forCopy !== true &&
  d.forChange !== true &&
  (d.specs.some((s) => s.min > 0 && s.legal.length === 0) ||
    // CR 115.3: slots that must differ (or share a controller) each have targets, but no answer fills them together.
    (d.specs.some(
      (s) =>
        s.differentFrom !== undefined ||
        s.differentFromAll !== undefined ||
        s.sameControllerAs !== undefined,
    ) &&
      !legalActionsForDecision(d).some((a) => a.kind === 'chooseTargets')));

type CastAction = Extract<Action, { kind: 'castSpell' }>;
type ActivateAction = Extract<Action, { kind: 'activate' }>;

/** The loop-guard key of the cast an action makes: this turn, this object, this way of casting it. */
const castKey = (view: GameView, a: CastAction): string =>
  `cast:${view.turn}:${a.object}:${a.alternative ?? ''}:${a.face ?? ''}`;

/** The loop-guard key of an activation: this turn, this object, this ability. */
const activationKey = (view: GameView, a: ActivateAction): string =>
  `activate:${view.turn}:${a.object}:${a.abilityIndex}`;

/** The mark of the activation the agent chose last, until its decisions are answered (one at most). */
const PENDING = 'activating:';

/**
 * The decision without the casts that were already chosen in this turn for the same object, and without the activations
 * whose targets could not be chosen in this turn.
 */
export function withoutTried(
  view: GameView,
  d: PriorityDecision,
  tried: ReadonlySet<string>,
): PriorityDecision {
  const options = d.options.filter(
    (o) =>
      (o.kind !== 'castSpell' || !tried.has(castKey(view, o))) &&
      (o.kind !== 'activate' || !tried.has(activationKey(view, o))),
  );
  return options.length === d.options.length ? d : { ...d, options };
}

const clearPending = (tried: Set<string>): void => {
  for (const key of tried) if (key.startsWith(PENDING)) tried.delete(key);
};

/**
 * Records the priority answer: a cast is remembered for the turn; an activation is marked as the one being made, so a targets
 * decision the agent cancels can name it (`noteCancelled`). Any other answer ends the mark.
 */
export function noteChoice(view: GameView, action: Action, tried: Set<string>): void {
  clearPending(tried);
  if (action.kind === 'castSpell') tried.add(castKey(view, action));
  if (action.kind === 'activate') tried.add(`${PENDING}${activationKey(view, action)}`);
}

/** The targets decision of the activation being made was answered with a cancel: the activation is left out for the rest of the turn. */
export function noteCancelled(tried: Set<string>): void {
  for (const key of tried) {
    if (key.startsWith(PENDING)) {
      tried.delete(key);
      tried.add(key.slice(PENDING.length));
    }
  }
}
