/**
 * "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with this creature." (Evendo Brushrazer; CR 607.2a, 601.2a, 305.1, 604.1): the static
 * ability `playFromLinkedExile` of a permanent lets its controller play, as though from their hand, each card in exile that the permanent exiled with its linked ability (`exile.linked`,
 * `GameObject.linkedExile`). A land is played as a land play and a spell is cast at the timing of its type paying its ordinary cost, both checked where the card is played (`rules/legality.ts`).
 * The permission is the permanent's: it is gone when the permanent leaves the battlefield, loses its abilities or the condition stops being true.
 */
import type { SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { linkedExilePlaySources } from './derive-statics';

/** Whether a permanent `seat` controls lets them play `obj`, a card in exile, because it exiled the card with its linked ability, with its condition true as it is now. */
export function linkedExilePlayPermitted(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'exile') return false;
  for (const source of linkedExilePlaySources(state)) {
    if (controllerOf(state, source.object) !== seat) continue;
    if (!(source.object.linkedExile ?? []).includes(obj.id)) continue;
    if (
      source.condition === undefined ||
      evaluateCondition(state, source.condition, { controller: seat, source: source.object.id })
    ) {
      return true;
    }
  }
  return false;
}
