/**
 * Static abilities that change a rule for the whole game, whoever controls the permanent that has them (CR 604.1, 101.2): "Damage can't be prevented"
 * (`damageCantBePrevented`, CR 615.12) and "All damage is dealt as though its source had wither" (`damageAsThoughWither`, CR 702.80a). Read from the abilities
 * the permanents on the battlefield have after the layers, so "loses all abilities" turns them off; a cheap check of the printed abilities comes first.
 */
import type { StaticEffect } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';

type GlobalKind = Extract<StaticEffect['kind'], 'damageCantBePrevented' | 'damageAsThoughWither'>;

/** Whether a permanent on the battlefield has a static ability of `kind` now. */
function someHas(state: GameState, kind: GlobalKind): boolean {
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || !mayHaveStatic(state, obj, kind)) continue;
    if (derive(state, obj).abilities.some((a) => a.kind === 'static' && a.static.kind === kind)) {
      return true;
    }
  }
  return false;
}

/**
 * CR 701.23, 614.1a (Aven Mindcensor): "If an opponent would search a library, that player searches the top four cards of that library instead": the number of cards
 * `searcher` may look at in a library, or null when nothing limits the search. Read from the permanents an opponent of the searcher controls; the smallest number applies.
 */
export function searchTopLimit(state: GameState, searcher: SeatId): number | null {
  let limit: number | null = null;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) === searcher) continue;
    if (!mayHaveStatic(state, obj, 'opponentSearchTopOnly')) continue;
    for (const a of derive(state, obj).abilities) {
      if (a.kind === 'static' && a.static.kind === 'opponentSearchTopOnly') {
        limit = limit === null ? a.static.count : Math.min(limit, a.static.count);
      }
    }
  }
  return limit;
}

/** CR 615.12: whether damage can't be prevented. */
export const damageCantBePrevented = (state: GameState): boolean =>
  someHas(state, 'damageCantBePrevented');

/** CR 702.80a, 120.3d: whether all damage is dealt as though its source had wither. */
export const allDamageHasWither = (state: GameState): boolean =>
  someHas(state, 'damageAsThoughWither');
