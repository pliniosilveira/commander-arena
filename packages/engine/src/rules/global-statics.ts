/**
 * Static abilities that change a rule for the whole game, whoever controls the permanent that has them (CR 604.1, 101.2): "Damage can't be prevented"
 * (`damageCantBePrevented`, CR 615.12) and "All damage is dealt as though its source had wither" (`damageAsThoughWither`, CR 702.80a). Read from the abilities
 * the permanents on the battlefield have after the layers, so "loses all abilities" turns them off; a cheap check of the printed abilities comes first.
 */
import type { StaticEffect } from '../ast/types';
import type { GameState } from '../state/types';
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

/** CR 615.12: whether damage can't be prevented. */
// An effect that says so for the turn (Stomp) counts like the static ability.
export const damageCantBePrevented = (state: GameState): boolean =>
  state.turn.damageUnpreventable === true || someHas(state, 'damageCantBePrevented');

/** CR 702.80a, 120.3d: whether all damage is dealt as though its source had wither. */
export const allDamageHasWither = (state: GameState): boolean =>
  someHas(state, 'damageAsThoughWither');
