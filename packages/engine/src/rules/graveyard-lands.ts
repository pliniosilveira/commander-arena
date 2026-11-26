/**
 * "For each land card put into a graveyard this way" (Eumidian Wastewaker, CR 701.9, 701.21, 608.2c): how many of the zone changes of an instruction put a land card into a graveyard.
 * Only a card counts (a token is not a card, CR 111.1, and ceases to exist in a graveyard), and it is read as it is in the graveyard (CR 400.7), so a permanent that was only a land
 * on the battlefield (an effect made it one) does not count, and a card that went anywhere else (a replacement effect exiled it) does not either.
 */
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import { derive } from './derive';

export function landCardsToGraveyard(state: GameState, events: readonly GameEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.kind !== 'zoneChanged' || event.toZone !== 'graveyard' || event.card === null) {
      continue;
    }
    const obj = state.objects[event.to];
    if (obj?.zone === 'graveyard' && derive(state, obj).types.includes('land')) count += 1;
  }
  return count;
}
