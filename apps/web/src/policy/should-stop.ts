/**
 * The auto-pass policy (SPEC 17.5 A18, D-018): a pure function of the human's view and settings.
 * The engine stays the rulebook; this is only a preference about when to ask the human.
 *
 * Every auto-pass is sent as an ordinary `pass` action, so replays stay exact.
 */
import type { GameView, ObjectView, PriorityDecision, StepId } from '@commander-arena/engine';

export interface StopSettings {
  /** Stop at every priority point and hold priority after casting (Arena's Full Control). */
  readonly fullControl: boolean;
  /**
   * Stop when an opponent's spell or ability on the stack targets you or something you control,
   * even if you have no response, so you can see it before it resolves (issue 34).
   */
  readonly stopWhenTargeted: boolean;
  /**
   * Stop when the opponent has a spell on the stack, whatever it is aimed at and even if you have no
   * response, so you can read what it is (the card, its rules text, its targets) before it resolves
   * (issue 105: a board wipe resolved with nobody asking the player to look). Their abilities are
   * not included: a trigger on every attack would stop the game all the time.
   */
  readonly stopForOpponentSpells: boolean;
  /** Steps of your own turn at which to stop every turn. */
  readonly myTurnStops: readonly StepId[];
  /** Steps of the opponent's turn at which to stop every turn. */
  readonly opponentTurnStops: readonly StepId[];
  /** Steps to stop at during one specific turn only (A18 "for this turn"). */
  readonly thisTurn: { readonly turn: number; readonly steps: readonly StepId[] } | null;
}

/** A18 defaults: your precombat and postcombat main phases, nothing on the opponent's turn. */
export const DEFAULT_STOPS: StopSettings = {
  fullControl: false,
  stopWhenTargeted: true,
  stopForOpponentSpells: true,
  myTurnStops: ['precombatMain', 'postcombatMain'],
  opponentTurnStops: [],
  thisTurn: null,
};

/** Steps the settings panel lets the player toggle, in turn order. */
export const STOP_STEPS: readonly StepId[] = [
  'upkeep',
  'draw',
  'precombatMain',
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'endOfCombat',
  'postcombatMain',
  'end',
];

/**
 * Where the seat may cast from: hand, command zone, graveyard (Flashback, CR 702.34a) and the
 * cards of its own in exile on an Adventure (CR 715.3d) or foretold (CR 702.143a).
 */
function ownCards(view: GameView): readonly ObjectView[] {
  const me = view.seats[view.viewer];
  // And the foretold cards (CR 702.143a, D-128): the viewer's own face-down cards, with the full view.
  const fromExile = view.exile.filter(
    (o) =>
      o.owner === view.viewer &&
      (o.onAdventure === true || o.foretold === true || o.preparedSpell === true),
  );
  return [...(me?.hand ?? []), ...(me?.command ?? []), ...(me?.graveyard ?? []), ...fromExile];
}

/**
 * True when casting `face` of `card` can be done at instant speed. An option that names a face
 * (a split half, an Adventure, a modal face) is judged by that face alone (CR 709.3a, 715.3a,
 * 712.11c): a split card with an instant half and a sorcery half has both types in the view, but
 * only the half the option names matters. A flash keyword is read from the card's keywords for the
 * face that is up (face 0 in a hand) and from the face's own rules text for another face.
 */
function isInstantSpeed(card: ObjectView, face: number | undefined): boolean {
  const printed = face === undefined ? undefined : card.faces?.[face];
  if (printed === undefined)
    return card.types.includes('instant') || card.keywords.includes('flash');
  if (printed.types.includes('instant')) return true;
  return face === 0 ? card.keywords.includes('flash') : /^Flash\b/m.test(printed.oracleText);
}

/**
 * A18 "relevant action": an instant-speed spell or a non-mana ability the seat can use now. The
 * engine lists a castSpell option only when timing, targets and the whole cost (planned against the
 * seat's available mana) are satisfied, and an `activate` option only for an ability that is not a
 * mana ability and whose targets and whole cost are available (D-075), so affordability is already
 * decided. A flashback card in the graveyard counts like the same card in hand: its option is a
 * `castSpell`, and an instant (or a flash card) from the graveyard stops the autopilot; a sorcery's
 * flashback is never listed outside sorcery timing, so it never stops on the opponent's turn.
 * Every `activate` option therefore counts, on a permanent or in hand (Cycling); mana
 * abilities (`activateAbility`) never do. Like an instant, it makes the policy stop when the
 * opponent puts something on the stack; D-045 still holds, so the player's own spell or ability
 * resolves without a click even while they hold one (Full Control restores the stop).
 */
export function hasRelevantAction(view: GameView, decision: PriorityDecision): boolean {
  const cards = ownCards(view);
  return decision.options.some((option) => {
    if (option.kind === 'activate') return true;
    if (option.kind !== 'castSpell') return false;
    const card = cards.find((c) => c.id === option.object);
    if (card === undefined) return false;
    // A card with flash is castable whenever an instant is (CR 702.8a Flash), so holding one is
    // a reason to stop for the same reasons an instant is.
    return isInstantSpeed(card, option.face);
  });
}

/** A spell on the stack (a card, a copy or a permanent spell), not an activated or triggered ability. */
function isSpell(object: ObjectView): boolean {
  return object.ability === undefined && object.abilitySource === undefined;
}

/**
 * True when an object on the stack that someone else controls targets the viewer or a permanent
 * the viewer controls (CR 115.1: a spell or ability names its targets as it is put on the stack).
 */
function isTargetedAtViewer(view: GameView, top: ObjectView): boolean {
  if (top.controller === view.viewer) return false;
  return top.targets.some((t) =>
    t.kind === 'player'
      ? t.seat === view.viewer
      : view.battlefield.some((o) => o.id === t.id && o.controller === view.viewer),
  );
}

/**
 * The combat steps in which the defender, or the attacker, may still change what the coming
 * damage does (CR 509.2, 117.3d, 117.4): after attackers are declared (the defender's chance to
 * act before blocks, on the opponent's turn only) and after blockers are declared (on either
 * turn). Combat damage follows the second window directly, so passing it for the player takes
 * away their last chance (issue 35).
 */
function inCombatWindow(view: GameView): boolean {
  if ((view.combat?.attackers.length ?? 0) === 0) return false;
  if (view.step === 'declareBlockers') return true;
  return view.step === 'declareAttackers' && view.activeSeat !== view.viewer;
}

/** True when the UI should wait for the human; false when it may send `pass` for them. */
export function shouldStop(view: GameView, settings: StopSettings): boolean {
  const decision = view.pending;
  if (decision === null) return false;
  // Every decision except priority is a real question. That includes the three M5 S2 kinds
  // (choosePermanent, orderTriggers, confirmOptional): only the player can answer them, whatever
  // the stop settings or Full Control say, and the store's autopilot never sends them.
  if (decision.kind !== 'priority') return true;
  if (settings.fullControl) return true;

  const relevant = hasRelevantAction(view, decision);
  const top = view.stack[view.stack.length - 1];
  if (top !== undefined) {
    // Something is on the stack: stop to respond to someone else's object, or to look at their spell.
    // Resolving your own spell (and everything else) is passed through without a click.
    if (top.controller === view.viewer) return false;
    if (relevant) return true;
    // Issue 105: an opponent's spell is always shown to the player before it resolves. An ability
    // has `ability` or `abilitySource` in its view; a spell, a copy of one and a permanent spell do not.
    if (settings.stopForOpponentSpells && isSpell(top)) return true;
    return settings.stopWhenTargeted && isTargetedAtViewer(view, top);
  }

  // The steps between declaring attackers and combat damage: stop when there is something to do.
  if (relevant && inCombatWindow(view)) return true;

  const mine = view.activeSeat === view.viewer;
  const stops = mine ? settings.myTurnStops : settings.opponentTurnStops;
  if (stops.includes(view.step)) return true;
  const once = settings.thisTurn;
  return once !== null && once.turn === view.turn && once.steps.includes(view.step);
}

/** What a running "Pass turn" does at the view it is looking at (issue 46). */
export type PassTurnVerdict =
  /** Send `pass` for the player: nothing here needs them. */
  | 'pass'
  /** Declare no attackers (a main phase pass skips combat); only when nothing is required to attack. */
  | 'declareNoAttack'
  /** The yield is over (the turn ended, an interrupt, a question): the normal policy decides. */
  | 'end';

/**
 * "Pass turn" (issue 46): a yield until the end of the viewer's own turn. It passes the viewer's
 * priority at every step of `turn`, ignoring the step stops of the settings (the point of the
 * button), and ends, so the normal policy takes over again, at the first of:
 *
 * - the turn is over, or it is the opponent's turn now (the opponent's turn keeps its normal stops);
 * - the game is over or waits for nobody;
 * - any decision but priority: a target, a choice, an optional trigger, a discard are never
 *   answered for the player. The one exception is the declaration of attackers, which "skip
 *   combat" answers with no attackers when no creature is required to attack (CR 508.1d); a
 *   required attacker ends the yield instead of being overridden;
 * - Full Control, or any stop `shouldStop` has for an object on the stack (the opponent's spell or
 *   ability that is aimed at the viewer, or that the viewer holds a relevant instant-speed action
 *   against, D-138) or for combat damage.
 *
 * It only ever answers the viewer's own priority. The opponent still receives theirs in each step
 * from the engine, so no window the rules give them is skipped.
 */
export function passTurnVerdict(
  view: GameView,
  settings: StopSettings,
  turn: number,
): PassTurnVerdict {
  const decision = view.pending;
  if (view.result !== null || decision === null) return 'end';
  if (view.turn !== turn || view.activeSeat !== view.viewer) return 'end';
  if (decision.kind === 'declareAttackers') {
    return decision.seat === view.viewer && decision.mustAttack.length === 0
      ? 'declareNoAttack'
      : 'end';
  }
  if (decision.kind !== 'priority') return 'end';
  // The step stops are what the yield passes through; everything else in `shouldStop` still holds.
  return shouldStop(view, { ...settings, myTurnStops: [], thisTurn: null }) ? 'end' : 'pass';
}

/**
 * True when "Pass turn" is on offer (issue 46): in one of the viewer's own main phases, for a view
 * where the viewer holds priority (the caller knows that), with nothing on the stack. The stack must be empty because a pass then resolves an object
 * instead of moving through the turn, and the main phases are where the player is deciding what to
 * do with the turn (the later steps have the one-step "End Turn").
 */
export function canPassTurn(
  view: Pick<GameView, 'viewer' | 'activeSeat' | 'step' | 'stack'>,
): boolean {
  return (
    view.activeSeat === view.viewer &&
    view.stack.length === 0 &&
    (view.step === 'precombatMain' || view.step === 'postcombatMain')
  );
}
