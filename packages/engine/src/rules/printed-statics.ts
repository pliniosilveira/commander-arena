/**
 * A cheap "can this permanent have a static ability of this kind?" for the rules that scan the whole battlefield for one kind of static
 * ability ("You have hexproof", "You have no maximum hand size") and would otherwise derive every permanent for it. The abilities
 * `derive` gives an object are its copiable abilities with their keyword expansions, plus what layer 6 adds: keywords, the keyword
 * expansions of Exalted and Prowess (triggered), and the abilities a static `grantAbility` gives, which are mana, activated or
 * triggered, never static (D-099, D-151), and the alternative-cost abilities (triggered or keyword); "loses all abilities" only
 * removes. So an object whose copiable abilities and their expansions hold no static ability of the kind cannot have one after any
 * layer, and the answer needs no `derive`. A `true` answer means "maybe": the caller still derives.
 */
import type { StaticEffect } from '../ast/types';
import type { GameObject, GameState } from '../state/types';
import { copiableValues } from './copiable';
import { expandKeywords } from './derive-keywords';

/** False only when `obj` certainly has no static ability of `kind` as `derive` reads it, in any layer. */
export function mayHaveStatic(
  state: GameState,
  obj: GameObject,
  kind: StaticEffect['kind'],
): boolean {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) return false;
  return expandKeywords(copiableValues(state, obj).abilities).some(
    (a) => a.kind === 'static' && a.static.kind === kind,
  );
}
