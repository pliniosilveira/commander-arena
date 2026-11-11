/**
 * CasualAgent and the sacrifice-for-value abilities of Food and Clue tokens (CR 111.10b, 111.10f).
 * The agent reads the shape of an ability, never a card name, so any permanent with the same shape
 * (the SYNTHETIC Snack is a Food by this test) is treated the same way:
 *
 * - "gain N life": an activated ability with no target, whose costs are only mana, {T} and
 *   "sacrifice this", at least one of them the sacrifice, and whose effect is `gainLife` for the
 *   agent. It is used when the agent's life is below `EAT_BELOW_LIFE` (15, a bit over a third of a
 *   Commander life total of 40, where a few points start to matter).
 * - "draw N cards": the same costs and `draw` for the agent. It is used when the agent holds fewer
 *   than `CRACK_BELOW_CARDS` (3) cards, so the card is worth more than the mana.
 *
 * Both use only spare mana. The engine lists the `activate` option only when the cost is payable,
 * and `choosePriorityAction` considers abilities after every worthwhile spell has been cast, so
 * nothing the agent would rather cast is left uncast. To keep the mana for combat tricks and for
 * spells cast later this turn, they are used only in the second main phase or in an end step (the
 * agent's own or the opponent's). Neither is a creature: a creature that sacrifices itself is a
 * play this agent cannot judge. The loop guard of `casual-activations.ts` applies.
 */
import type { ActivatedAbility, GameView, ObjectView } from '@commander-arena/engine';
import { isCreature, ownHand, ownLife } from './casual-view';

/** Life below which a Food-like ability is used. */
export const EAT_BELOW_LIFE = 15;

/** Cards in hand below which a Clue-like ability is used. */
export const CRACK_BELOW_CARDS = 3;

/** Costs that are only mana, {T} and a sacrifice of the permanent itself, with at least the latter. */
function sacrificesItself(ability: ActivatedAbility): boolean {
  if ((ability.targets?.length ?? 0) > 0) return false;
  let sacrifice = false;
  for (const cost of ability.cost) {
    if (cost.kind === 'sacrifice' && 'kind' in cost.what && cost.what.kind === 'this') {
      sacrifice = true;
    } else if (cost.kind !== 'mana' && cost.kind !== 'tap') {
      return false;
    }
  }
  return sacrifice;
}

/** "{2}, {T}, Sacrifice this: You gain 3 life": a Food. */
export function gainsLifeForSacrifice(ability: ActivatedAbility): boolean {
  const e = ability.effect;
  return (
    sacrificesItself(ability) &&
    e.kind === 'gainLife' &&
    e.player.kind === 'you' &&
    typeof e.amount === 'number' &&
    e.amount > 0
  );
}

/** "{2}, Sacrifice this: Draw a card": a Clue. */
export function drawsForSacrifice(ability: ActivatedAbility): boolean {
  const e = ability.effect;
  return (
    sacrificesItself(ability) &&
    e.kind === 'draw' &&
    e.player.kind === 'you' &&
    typeof e.count === 'number' &&
    e.count > 0
  );
}

/** Spare mana: the second main phase, or an end step of either player's turn. */
const isSpareManaWindow = (view: GameView): boolean =>
  view.step === 'postcombatMain' || view.step === 'end';

/**
 * Whether the agent wants to use `ability` of its permanent `obj` now, by the rules in the file
 * comment. The caller has already checked that the engine offers the activation.
 */
export function wantsTokenAbility(
  view: GameView,
  obj: ObjectView,
  ability: ActivatedAbility,
): boolean {
  if (obj.controller !== view.viewer || obj.zone !== 'battlefield' || isCreature(obj)) return false;
  if (!isSpareManaWindow(view)) return false;
  if (gainsLifeForSacrifice(ability)) return ownLife(view) < EAT_BELOW_LIFE;
  if (drawsForSacrifice(ability)) return ownHand(view).length < CRACK_BELOW_CARDS;
  return false;
}
