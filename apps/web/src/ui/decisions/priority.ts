/** Priority (CR 117): what a click on a card or permanent means, and what the pass button says. */
import type {
  Action,
  GameView,
  ManaColor,
  ObjectId,
  ObjectView,
  PriorityDecision,
} from '@commander-arena/engine';
import { isNamedAlternative } from '../../game/alt-cost';
import { canPassTurn } from '../../policy/should-stop';
import { STEP_LABELS } from '../format';
import { hasActivation, hasSpecialAction, type MenuItem, manaAction, menuItems } from './abilities';
import { castAction } from './flashback';
import { castPlayOptions, playAction } from './layouts';
import { type Index, nameOf } from './lookup';
import { lifeCostOf, manaChoiceLabel } from './mana-choice';

/** Objects the player may act on now: castable and playable cards, sources with abilities. */
export function playableObjects(decision: PriorityDecision): ReadonlySet<ObjectId> {
  const ids = new Set<ObjectId>();
  for (const o of decision.options) {
    if (o.kind === 'castSpell' || o.kind === 'playLand') ids.add(o.object);
    else if (o.kind === 'activateAbility') ids.add(o.source);
    else if (o.kind === 'activate') ids.add(o.object);
    else if (o.kind === 'suspend' || o.kind === 'foretell' || o.kind === 'turnFaceUp') {
      ids.add(o.object);
    }
  }
  return ids;
}

/** True when the object's only cast option is an Overload, Evoke or Dash (D-121): the player is asked. */
function namedAlternativeOnly(decision: PriorityDecision, id: ObjectId): boolean {
  const casts = castPlayOptions(decision, id);
  const [only] = casts;
  // A foretold card in exile (D-128) has no other way to be cast, so a click casts it at once.
  return (
    casts.length === 1 &&
    only?.kind === 'castSpell' &&
    isNamedAlternative(only.alternative) &&
    only.alternative !== 'foretell'
  );
}

export interface AbilityChoice {
  readonly action: Extract<Action, { kind: 'activateAbility' }>;
  readonly color: ManaColor | null;
  /** The combination this choice makes, for a mana ability with several (a filter land, D-099). */
  readonly combination?: readonly ManaColor[];
  readonly label: string;
  /** The life the ability costs, when the card's text says so: shown beside the label. */
  readonly life: number;
  /** The permanent this choice sacrifices ("Sacrifice a Spirit: Add {R}.", D-222), and its name for the button. */
  readonly sacrifice?: ObjectId;
  readonly sacrificeName?: string;
}

export type ClickOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'act'; readonly action: Action }
  /** One source with several ways to use it (mana of different colors): the player picks one. */
  | { readonly kind: 'choose'; readonly choices: readonly AbilityChoice[] }
  /** Several things to do with one object (cast and cycle, two abilities): the player picks one. */
  | { readonly kind: 'menu'; readonly items: readonly MenuItem[] };

/** Whether a menu item is an ability with a loyalty symbol in its cost (CR 606.2). */
function isLoyaltyItem(card: ObjectView | undefined, item: MenuItem): boolean {
  if (item.action.kind !== 'activate') return false;
  const index = item.action.abilityIndex;
  const entry = card?.activated?.find((a) => a.abilityIndex === index);
  return entry?.ability.cost.some((c) => c.kind === 'loyalty') === true;
}

/**
 * A click on an object: cast it, play it, activate its only ability, or ask which ability. A card
 * with several faces to cast or play (a split card, an Adventure, a modal double-faced card) has
 * one option per face and asks which face, like any object with several things to do.
 * `index` names the object's abilities and faces in the menu (D-075); it is only read then.
 */
export function clickOutcome(
  decision: PriorityDecision,
  id: ObjectId,
  index?: Index,
): ClickOutcome {
  if (
    hasActivation(decision, id) ||
    hasSpecialAction(decision, id) ||
    castPlayOptions(decision, id).length > 1 ||
    namedAlternativeOnly(decision, id)
  ) {
    const items = menuItems(decision, id, index);
    const [only, ...more] = items;
    if (only === undefined) return { kind: 'none' };
    // One option that is an alternative cost is still asked about: "Dash {1}{R}" is not "Cast X",
    // and the plain cast it replaces (cannot be paid now) is not what a click should do unasked.
    // A loyalty ability is asked about even when it is the only one (D-203): the menu shows its cost, "+1", "\u22122", "0", and what it does.
    const loyalty = isLoyaltyItem(index?.get(id), only);
    return more.length === 0 &&
      !namedAlternativeOnly(decision, id) &&
      !hasSpecialAction(decision, id) &&
      !loyalty
      ? { kind: 'act', action: only.action }
      : { kind: 'menu', items };
  }
  for (const o of decision.options) {
    if (o.kind === 'castSpell' && o.object === id) {
      // A graveyard card is cast with flashback: the option's alternative goes with the action.
      return { kind: 'act', action: castAction(o) };
    }
  }
  for (const o of decision.options) {
    if (o.kind === 'playLand' && o.object === id) {
      return { kind: 'act', action: playAction(o) };
    }
  }
  const abilities: AbilityChoice[] = [];
  for (const o of decision.options) {
    if (o.kind !== 'activateAbility' || o.source !== id) continue;
    abilities.push({
      action: manaAction(id, o),
      color: o.color,
      ...(o.combination === undefined ? {} : { combination: o.combination }),
      label: manaChoiceLabel(o.abilityIndex, o.color, o.combination),
      life: lifeCostOf(index?.get(id), o.color, o.combination),
      ...(o.sacrifice === undefined
        ? {}
        : {
            sacrifice: o.sacrifice,
            sacrificeName: index === undefined ? 'it' : nameOf(index, o.sacrifice),
          }),
    });
  }
  const [only, ...more] = abilities;
  if (only === undefined) return { kind: 'none' };
  return more.length === 0
    ? { kind: 'act', action: only.action }
    : { kind: 'choose', choices: abilities };
}

/**
 * True when the viewer has a permanent that could attack this turn, read from the view: an untapped
 * creature that is not summoning sick and has no defender, or a Vehicle that a crew could animate
 * (CR 508.1a, 302.6, 702.3b, 301.7). The engine asks for the declaration only when there is a
 * candidate, so with none the player has no attack to declare and the button says so (issue 34).
 */
export function canAttackThisTurn(view: Pick<GameView, 'viewer' | 'battlefield'>): boolean {
  return view.battlefield.some((o) => {
    if (o.controller !== view.viewer || o.tapped || o.keywords.includes('defender')) return false;
    if (o.types.includes('creature')) return !o.summoningSick;
    return o.printedPt !== undefined && o.wouldBeSummoningSick !== true;
  });
}

/** True when a creature in this combat has first strike or double strike (CR 510.4). */
function combatHasFirstStrike(view: Pick<GameView, 'combat' | 'battlefield'>): boolean {
  if (view.combat === null) return false;
  const inCombat = new Set<ObjectId>();
  for (const a of view.combat.attackers) {
    inCombat.add(a.object);
    for (const b of a.blockedBy) inCombat.add(b);
  }
  return view.battlefield.some(
    (o) =>
      inCombat.has(o.id) &&
      (o.keywords.includes('firstStrike') || o.keywords.includes('doubleStrike')),
  );
}

/**
 * The step a pass leads to, as the viewer can tell it from the view, in the words of a button
 * (issue 42). Combat steps are skipped as the rules skip them: with no attackers declared there is
 * no declare blockers or combat damage step (CR 508.8), and the first strike damage step happens
 * only when a creature in combat has first strike or double strike (CR 510.4).
 */
export function nextStepLabel(
  view: Pick<GameView, 'viewer' | 'activeSeat' | 'step' | 'battlefield' | 'combat'> &
    Pick<GameView, 'addedPhase' | 'nextAddedPhase'>,
): string {
  const mine = view.activeSeat === view.viewer;
  // CR 500.8 (D-1130): the last step of a phase leads to the phase an effect added after it, when one waits.
  const ends =
    view.step === 'draw' ||
    view.step === 'precombatMain' ||
    view.step === 'endOfCombat' ||
    view.step === 'postcombatMain';
  if (ends && view.nextAddedPhase === 'beginning') return 'To Extra Beginning Phase';
  if (ends && view.nextAddedPhase === 'combat') return 'To Extra Combat';
  // The draw step of an additional beginning phase is followed by what follows the phase it was added after, the end step.
  if (view.step === 'draw' && view.addedPhase === true) return 'To End Step';
  switch (view.step) {
    case 'untap':
      return 'To Upkeep';
    case 'upkeep':
      return 'To Draw';
    case 'draw':
      return 'To First Main';
    case 'precombatMain':
      return 'To Combat';
    case 'beginningOfCombat':
      return 'To Declare Attackers';
    case 'declareAttackers':
      return (view.combat?.attackers.length ?? 0) > 0 ? 'To Declare Blockers' : 'To End of Combat';
    case 'declareBlockers':
      return combatHasFirstStrike(view) ? 'To First Strike Damage' : 'To Combat Damage';
    case 'firstStrikeDamage':
      return 'To Combat Damage';
    case 'combatDamage':
      return 'To End of Combat';
    case 'endOfCombat':
      return 'To Second Main';
    case 'postcombatMain':
      return 'To End Step';
    default:
      return mine ? 'End Turn' : 'To Your Turn';
  }
}

/** The "Pass turn" button (issue 46): what it says, and the name a screen reader gives it. */
export const PASS_TURN_LABEL = 'Pass Turn';
export const PASS_TURN_NAME = 'Pass turn: skip to the end of my turn';

/** The button's tooltip; with Full Control on it says that Full Control still stops every step. */
export function passTurnHint(fullControl: boolean): string {
  const base =
    'Skip combat and the other steps: pass your priority until your turn ends (P). The game still ' +
    "stops for the opponent's spells aimed at you or that you can answer, and for any question; " +
    'Esc cancels.';
  return fullControl
    ? `${base} Full Control is on, so you still get priority at every step and the pass stops there.`
    : base;
}

/**
 * True when the primary button is itself "Pass turn": in the first main phase with no creature that
 * could attack there is no combat to skip, so the button does what it says and ends the turn's
 * steps instead of passing once (issue 46). Otherwise "Pass turn" is a second button.
 */
export function passTurnIsPrimary(
  view: Pick<GameView, 'viewer' | 'activeSeat' | 'step' | 'stack' | 'battlefield'>,
): boolean {
  return canPassTurn(view) && view.step === 'precombatMain' && !canAttackThisTurn(view);
}

/**
 * The single context-sensitive button (SPEC 10): it says what a click does. With something on the
 * stack it resolves; otherwise it names the step its one pass moves to. Only in the first main
 * phase with nothing able to attack is it the real "Pass Turn" (`passTurnIsPrimary`): the label
 * never says "Pass Turn" for a single-step pass (issue 46).
 */
export function passLabel(
  view: Pick<GameView, 'viewer' | 'activeSeat' | 'step' | 'stack' | 'battlefield' | 'combat'>,
): string {
  if (view.stack.length > 0) return 'Resolve';
  return passTurnIsPrimary(view) ? PASS_TURN_LABEL : nextStepLabel(view);
}

export function priorityPrompt(view: GameView, index: Index): string {
  const mine = view.activeSeat === view.viewer;
  const where = `${mine ? 'Your' : "Opponent's"} turn, ${STEP_LABELS[view.step]}`;
  const top = view.stack[view.stack.length - 1];
  if (top !== undefined) {
    const owner = top.controller === view.viewer ? 'your' : "the opponent's";
    return `${nameOf(index, top.id)} (${owner}) is on the stack.`;
  }
  return where;
}

/**
 * Why nothing can be cast or activated while a spell with split second is on the stack (CR 702.61a):
 * players can't cast spells or activate abilities that aren't mana abilities until it leaves; mana
 * abilities, special actions and triggered abilities go on as normal (CR 702.61b).
 */
export const SPLIT_SECOND_HINT =
  'Split second: no spells or abilities can be cast or activated until this resolves. Mana abilities still work.';

/** The spell with split second on the stack, if any: the engine offers no casts or abilities then. */
export function splitSecondSpell(view: Pick<GameView, 'stack'>): ObjectView | undefined {
  return view.stack.find(
    (o) => o.abilitySource === undefined && o.keywords.includes('splitSecond'),
  );
}

/** The line under the pass prompt: the split second note, else how to respond to the stack. */
export function priorityDetail(view: Pick<GameView, 'stack'>): string | null {
  if (splitSecondSpell(view) !== undefined) return SPLIT_SECOND_HINT;
  return view.stack.length > 0 ? 'Respond, or pass to resolve it.' : null;
}
