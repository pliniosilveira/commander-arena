/**
 * The protector of a battle (CR 310.9, 310.11, 310.12a, 704.5y): the players who may be chosen as it enters or after, and the state-based action that makes a new choice when a
 * battle's protector can't be its protector any more: the player left the game (CR 800.4a), or became its controller (a Siege's protector is an opponent of its controller).
 * The controller chooses among their opponents still in the game, asked only when more than one is left; when none is, the battle is put into its owner's graveyard.
 */
import type { SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { opponentsOf, patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { removeAttackedFromCombat } from './combat-removal';
import { controllerOf } from './control';
import { derive } from './derive';
import { sourceInfo } from './source-info';

/** The option of the protector question that stands for `seat` (`seat:<n>`, as the other questions about a player). */
export const protectorOption = (seat: SeatId): string => `seat:${seat}`;

/**
 * The players who may be the protector of a battle that `controller` controls: their opponents still in the game (CR 310.12a: only an opponent of a Siege's controller can be its
 * protector, 800.4a: a player who left the game is no longer in it). The engine treats every battle as a Siege: a battle with no battle type, whose protector could only be its
 * controller (CR 310.9a), is in no real card.
 */
export function protectorChoices(state: GameState, controller: SeatId): SeatId[] {
  return opponentsOf(state, controller);
}

/**
 * CR 704.5y: the players who can be chosen to protect the battle `obj` when its protector can't be its protector (none, one who left the game, or one who is not an opponent of its
 * controller), or null when its protector is fine.
 */
export function newProtectorChoices(state: GameState, obj: GameObject): SeatId[] | null {
  if (obj.zone !== 'battlefield' || !derive(state, obj).types.includes('battle')) return null;
  const choices = protectorChoices(state, controllerOf(state, obj));
  return obj.protector !== null && choices.includes(obj.protector) ? null : choices;
}

/** CR 704.5y: `seat` becomes the protector of the battle `id`; a creature that was attacking it stops attacking it (CR 506.4, 506.4c). */
export function setProtector(state: GameState, id: GameObject['id'], seat: SeatId): GameState {
  return removeAttackedFromCombat(patchObject(state, id, { protector: seat }), id).state;
}

/**
 * CR 704.5y: the question for the first battle that has more than one player who can be chosen as its protector: its controller chooses. Null when there is none (a battle with one
 * player to choose, or with none, is handled without a question by the state-based action).
 */
export function protectorDecision(state: GameState): NewDecision | null {
  for (const obj of Object.values(state.objects)) {
    const choices = newProtectorChoices(state, obj);
    if (choices === null || choices.length < 2) continue;
    const info = sourceInfo(state, obj.id);
    return {
      kind: 'chooseOption',
      seat: controllerOf(state, obj),
      purpose: 'protector',
      options: choices.map(protectorOption),
      source: obj.id,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
    };
  }
  return null;
}

/** The event that says which player the controller chose to protect the battle. */
export function protectorChosenEvent(
  decision: { readonly seat: SeatId; readonly source: GameObject['id'] },
  option: string,
): GameEvent {
  return {
    kind: 'optionChosen',
    seat: decision.seat,
    source: decision.source,
    purpose: 'protector',
    option,
  };
}
