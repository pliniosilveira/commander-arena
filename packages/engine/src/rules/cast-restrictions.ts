/**
 * "You can't cast ~ during your first, second, or third turns of the game" (CR 101.2, 601.2; D-149): the `cantCastThis` ability of a card
 * says when it can't be cast. It is checked wherever the engine decides whether a card can be cast, so a cast of any kind (from the hand,
 * the command zone, with an alternative cost, for free as an effect resolves) obeys it: "can't" beats "can" (CR 101.2).
 */
import type { SeatId } from '../ids';
import { definitionOf, printedCard } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';
import { staticConditionHolds } from './static-conditions';

/**
 * Whether a `cantCastThis` ability of the face `spell` is, stops `seat` from casting it now. `spell` is the card as it would be on the
 * stack (`castAs`); its own abilities are read, as the engine does for a card anywhere but on the battlefield.
 */
export function castForbiddenByOwnAbility(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
): boolean {
  const card = printedCard(spell);
  const face = card === null ? undefined : definitionOf(state, card).faces[spell.face];
  if (face === undefined) return false;
  return face.abilities.some(
    (a) =>
      a.kind === 'static' &&
      a.static.kind === 'cantCastThis' &&
      (a.condition === undefined ||
        evaluateCondition(state, a.condition, { controller: seat, source: spell.id })),
  );
}

/**
 * CR 101.2, 604.1 (D-179): "Your opponents can't cast spells during your turn": whether a permanent on the battlefield, controlled by the active
 * player, has that ability now (and its "as long as" condition holds for it) while `seat`, who is not the active player, would cast a spell.
 * A permanent that lost its abilities has none (`derive`). Every way of casting asks (`canCast`, `canCastDuringResolution`).
 */
export function castForbiddenByOpponentsPermanent(state: GameState, seat: SeatId): boolean {
  const active = state.turn.activeSeat;
  if (seat === active) return false;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== active) continue;
    if (!mayHaveStatic(state, obj, 'opponentsCantCastOnYourTurn')) continue;
    const holds = derive(state, obj).abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.static.kind === 'opponentsCantCastOnYourTurn' &&
        (a.condition === undefined || staticConditionHolds(state, a.condition, obj)),
    );
    if (holds) return true;
  }
  return false;
}
