/**
 * "Until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost" (CR 601.2, 118.9, 611.2a): the
 * `mayCastEachType` effect. It makes one permission (`ContinuousEffect` `freeCastPermission`) for each card type a spell can have, each naming the cards of `moved` that are in
 * exile (a land card is not cast, CR 305.1, so it names none of them) and lasting until the moment `lasts` says. What a player may do with them is decided where casting is
 * (`rules/free-cast.ts`, `rules/legality.ts`).
 */
import type { Effect } from '../ast/types';
import { CARD_TYPES, type CardType } from '../characteristics';
import { allocateTimestamp } from '../state/ops';
import type { ContinuousEffect, GameState, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { playEnd } from './impulse';
import { done, type StepOutcome } from './step-outcome';

/** The card types a spell can have (CR 301 to 315): every card type but land. */
export const SPELL_TYPES: readonly CardType[] = CARD_TYPES.filter((t) => t !== 'land');

/** `mayCastEachType`: a permission for each card type, each naming the cards of `moved` that are in exile and are not lands. */
export function runMayCastEachType(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'mayCastEachType' }>,
): StepOutcome {
  const cards = (res.lastMoved ?? []).filter((id) => {
    const card = state.objects[id];
    return card?.zone === 'exile' && !derive(state, card).types.includes('land');
  });
  if (cards.length === 0) return done(state);
  const until = playEnd(state, res.controller, effect.lasts);
  let next = state;
  const created: ContinuousEffect[] = [];
  for (const type of SPELL_TYPES) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: cards,
      until,
      change: { kind: 'freeCastPermission', seat: res.controller, type },
    });
  }
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...created] });
}
