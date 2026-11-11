/**
 * When a seat may activate an ability (CR 602.2, 602.5) and which abilities it may activate. Used
 * both to list the `activate` priority options and to validate the one a seat chooses, so the UI,
 * the AI and `applyAction` cannot disagree.
 */
import type { ObjectId, SeatId } from '../ids';
import { definitionOf, getObject, zoneList } from '../state/ops';
import type { ActivatedAbility, GameObject, GameState } from '../state/types';
import { adjustedAbility } from './activate-adjust';
import { costRefusal } from './activate-costs';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { hasSorceryTiming } from './legality';
import { isLoyaltyAbility, loyaltyActivatedThisTurn } from './loyalty';
import { legalModeSets, modalOfAbility } from './modes';
import { legalTargets, targetBounds } from './select';
import { splitSecondOnStack } from './split-second';

/**
 * Whether the card in a graveyard has a printed ability that functions there (Unearth, D-124; Encore, D-185). Derived abilities
 * are not computed for every card of a graveyard, which can hold dozens, at every priority: only a card whose
 * face lists the keyword is looked at. (An unearth ability a spell grants to a graveyard card is not supported.)
 */
function hasGraveyardAbility(state: GameState, id: ObjectId): boolean {
  const obj = getObject(state, id);
  if (obj.card === null) return false;
  const face = definitionOf(state, obj.card).faces[0];
  // D-135: an activated ability of the card that says it functions from the graveyard works there too.
  return (
    face?.abilities.some(
      (a) =>
        (a.kind === 'keyword' && (a.keyword.kind === 'unearth' || a.keyword.kind === 'encore')) ||
        (a.kind === 'activated' && a.functionsIn === 'graveyard'),
    ) === true
  );
}

/** An activated ability of an object, with its index among the object's derived abilities. */
export interface ActivatedEntry {
  readonly abilityIndex: number;
  readonly ability: ActivatedAbility;
}

/** The activated abilities an object has, wherever it is (Cycling's expansion included). */
export function activatedAbilitiesOf(state: GameState, obj: GameObject): ActivatedEntry[] {
  const out: ActivatedEntry[] = [];
  derive(state, obj).abilities.forEach((ability, abilityIndex) => {
    if (ability.kind === 'activated') out.push({ abilityIndex, ability });
  });
  return out;
}

/**
 * Why `seat` cannot activate ability `abilityIndex` of `obj` now, or null when it can. CR 602.2:
 * only the controller (the owner for a card in hand) activates; CR 113.6b: the ability must be in
 * the zone it functions from; CR 602.5d: "activate only as a sorcery"; CR 602.2b, 601.2c: targets
 * must exist for every slot; CR 602.5b: "activate only if" must hold; CR 118.3: the whole cost must be
 * payable.
 */
export function activationRefusal(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  abilityIndex: number,
): string | null {
  const entry = activatedAbilitiesOf(state, obj).find((e) => e.abilityIndex === abilityIndex);
  if (entry === undefined) return 'That object has no such activated ability';
  // CR 702.61a: no ability that is not a mana ability is activated while a spell with split second is on
  // the stack (mana abilities and triggered abilities are not activated here, CR 702.61b).
  if (splitSecondOnStack(state)) {
    return 'A spell with split second is on the stack: abilities cannot be activated (CR 702.61a)';
  }
  const { ability } = entry;
  const zone = ability.functionsIn ?? 'battlefield';
  if (obj.zone !== zone) return `That ability works only from the ${zone}`;
  if (zone === 'battlefield' ? controllerOf(state, obj) !== seat : obj.owner !== seat) {
    return 'You cannot activate an ability of an object you do not control';
  }
  // CR 606.3: a loyalty ability is activated only any time you could cast a sorcery, ...
  const loyalty = isLoyaltyAbility(ability.cost);
  if ((ability.timing === 'sorcery' || loyalty) && !hasSorceryTiming(state, seat)) {
    return 'That ability can be activated only at sorcery speed';
  }
  // ... and only if no player has activated a loyalty ability of that permanent this turn (D-200).
  if (loyalty && loyaltyActivatedThisTurn(state, obj.id)) {
    return 'A loyalty ability of that permanent was already activated this turn (CR 606.3)';
  }
  // CR 602.5b (D-139): "Activate only once each turn": this object's ability was not activated yet this turn.
  if (
    ability.oncePerTurn === true &&
    state.turnLog.activated.some((a) => a.object === obj.id && a.abilityIndex === abilityIndex)
  ) {
    return 'That ability can be activated only once each turn';
  }
  const ctx = { controller: seat, source: obj.id };
  // CR 602.5b: "Activate only if you control five or more lands" is read as it is activated, for
  // the one who activates it, with the permanent as the source.
  if (
    ability.activateOnlyIf !== undefined &&
    !evaluateCondition(state, ability.activateOnlyIf, ctx)
  ) {
    return 'That ability can be activated only if its condition holds';
  }
  // CR 700.2a: a modal ability needs a legal choice of modes (a mode with no legal target is not offered).
  const modal = modalOfAbility(ability);
  const targetable =
    modal === null
      ? (ability.targets ?? []).every(
          (spec) => legalTargets(state, spec, ctx).length >= targetBounds(spec).min,
        )
      : legalModeSets(state, modal, ctx).length > 0;
  if (!targetable) return 'That ability has no legal targets';
  // D-135: the cost as it stands now (a life amount worked out, a reduction that applies).
  const stuck = costRefusal(state, seat, obj, adjustedAbility(state, seat, obj, ability).cost);
  return stuck === null ? null : `You cannot pay for that ability: ${stuck}`;
}

/**
 * Every `activate` option `seat` has now: its battlefield permanents, then the cards in its hand (Cycling), then
 * the cards in its graveyard (Unearth, CR 702.84a, D-124).
 */
export function activatableAbilities(
  state: GameState,
  seat: SeatId,
): { object: ObjectId; abilityIndex: number }[] {
  const out: { object: ObjectId; abilityIndex: number }[] = [];
  const candidates = [
    ...state.battlefield.filter((id) => controllerOf(state, getObject(state, id)) === seat),
    ...zoneList(state, 'hand', seat),
    ...zoneList(state, 'graveyard', seat).filter((id) => hasGraveyardAbility(state, id)),
  ];
  for (const id of candidates) {
    const obj = getObject(state, id);
    for (const { abilityIndex } of activatedAbilitiesOf(state, obj)) {
      if (activationRefusal(state, seat, obj, abilityIndex) === null) {
        out.push({ object: id, abilityIndex });
      }
    }
  }
  return out;
}
