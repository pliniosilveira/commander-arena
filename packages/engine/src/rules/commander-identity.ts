/**
 * The colors of a player's commanders (CR 903.4), read by the amount `commanderColors` (`rules/amounts.ts`) and by the mana a commander's
 * identity allows (`rules/mana-outcomes.ts`). Its own module so that neither needs the other (no import cycle).
 */
import { CREATURE_TYPES } from '../data/creature-types';
import type { SeatId } from '../ids';
import { definitionOf, getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { derive } from './derive';
import { hasPrintedKeyword } from './derive-keywords';
import { cardsOf } from './melded';

export { commanderIdentity } from './commander-colors';

/**
 * CR 903.3, 205.3m (group 4 of the Vraska deck, D-225): the creature types of the seat's commander cards. A commander on the battlefield or on the stack is
 * the object it is now: it has the creature types it has now (CR 613.1d: an effect can have changed them, and a changeling has every one, CR 702.73a). A
 * commander anywhere else is the card, with the types printed on the face it would have there, the front one (CR 712.8a). Read by the mana rider "a creature
 * spell that shares a creature type with your commander".
 */
export function commanderCreatureTypes(state: GameState, seat: SeatId): ReadonlySet<string> {
  const types = new Set<string>();
  for (const card of getSeat(state, seat).commanders) {
    const live = Object.values(state.objects).find(
      // CR 903.3b (D-991): the commander card may be one of the two cards of a melded permanent.
      (o) => cardsOf(o).includes(card) && (o.zone === 'battlefield' || o.zone === 'stack'),
    );
    if (live !== undefined) {
      for (const t of derive(state, live).subtypes) if (CREATURE_TYPES.includes(t)) types.add(t);
      continue;
    }
    const face = definitionOf(state, card).faces[0];
    if (face === undefined) continue;
    if (hasPrintedKeyword(face.abilities, 'changeling')) {
      for (const t of CREATURE_TYPES) types.add(t);
      continue;
    }
    for (const t of face.subtypes) if (CREATURE_TYPES.includes(t)) types.add(t);
  }
  return types;
}
