/**
 * "If a card would be put into an opponent's graveyard from anywhere, instead exile it with a void counter on it." (issue 102, Dauthi Voidwalker; CR 614.1a, 400.3, 122.1): the
 * replacement effects of permanents on the battlefield (`exileInsteadOfOpponentGraveyard`) that change where a card goes when it would be put into the graveyard of an opponent of
 * the permanent's controller. `moveObject` (zones.ts) asks `opponentGraveyardReplacement` for every move to a graveyard of a card, so destruction, mill, discard, a spell that
 * resolves and the rest are all covered. A replacement is read from the battlefield as the event begins (CR 614.12); the oldest permanent's applies when several do (CR 616.1, `docs/ROADMAP.md`).
 */
import type { SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** The counter the card is exiled with, or null when no permanent replaces it going to its owner's graveyard. */
export function opponentGraveyardReplacement(state: GameState, card: GameObject): string | null {
  // A token is no card (CR 111.1): it is not put into a graveyard as a card.
  if (card.card === null) return null;
  const sources = state.battlefield
    .filter((id) => state.objects[id] !== undefined)
    .sort((a, b) => (state.objects[a]?.timestamp ?? 0) - (state.objects[b]?.timestamp ?? 0));
  for (const id of sources) {
    const source = state.objects[id];
    if (source === undefined) continue;
    const controller: SeatId = controllerOf(state, source);
    // "An opponent's graveyard": the graveyard of the owner of the card, an opponent of the controller of the permanent.
    if (card.owner === controller) continue;
    for (const a of derive(state, source).abilities) {
      if (a.kind === 'replacement' && a.replacement.kind === 'exileInsteadOfOpponentGraveyard') {
        return a.replacement.counter;
      }
    }
  }
  return null;
}
