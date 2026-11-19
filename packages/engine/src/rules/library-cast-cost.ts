/**
 * The additional cost of a spell cast from the top of the library through "You may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their
 * other costs." (CR 601.2b, 601.2f, 118.8; the static ability `castFromTopOfLibrary` with `sacrifice`). The cost is part of the total cost of the spell (`rules/cast-cost.ts`), so the legality of
 * the cast (a permanent to sacrifice) and the payment follow the way the additional costs on a card do.
 */
import type { ObjectFilter } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { libraryCastSources } from './derive-statics';
import { matchesFilter } from './select';

/**
 * The permanent `spell` (a card cast from the library of `seat`, as the card or as the spell on the stack) must have sacrificed as an additional cost, or null for none. Every permission
 * of a permanent `seat` controls that the spell fits gives the cast; one of them that asks no sacrifice is the way to cast it without (the caster chooses the cheapest, which is also the
 * only one a player could prefer), otherwise the sacrifice of the first.
 */
export function libraryCastSacrificeOf(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
): ObjectFilter | null {
  let first: ObjectFilter | null = null;
  for (const source of libraryCastSources(state)) {
    if (controllerOf(state, source.object) !== seat) continue;
    // The spell is a card in the library before it is cast and a spell on the stack after: the filter, which names no zone, is read where the spell is.
    if (
      !matchesFilter(
        state,
        spell,
        { ...source.spells, zone: spell.zone },
        { controller: seat, source: source.object.id },
      )
    ) {
      continue;
    }
    if (source.sacrifice === undefined) return null;
    first ??= source.sacrifice;
  }
  return first;
}
