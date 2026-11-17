/** Devotion as a layer-independent read of the mana costs of controlled permanents (CR 700.5). */
import type { Color } from '../characteristics';
import type { SeatId } from '../ids';
import { objectsInZone } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';

/** Mana symbols matching any of the colors, with a hybrid or Phyrexian symbol counted once. */
export function devotionSymbols(cost: readonly string[] | null, colors: readonly Color[]): number {
  if (cost === null) return 0;
  let count = 0;
  for (const symbol of cost) {
    if (symbol.split('/').some((part) => (colors as readonly string[]).includes(part))) count += 1;
  }
  return count;
}

/** The devotion of `seat` to `colors`, including copiable mana-cost changes. */
export function devotionOf(state: GameState, seat: SeatId, colors: readonly Color[]): number {
  let total = 0;
  for (const id of objectsInZone(state, 'battlefield')) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    total += devotionSymbols(devotionCostOf(state, obj), colors);
  }
  return total;
}

/** The mana cost a permanent contributes to devotion after copy effects (CR 700.5a). */
export function devotionCostOf(state: GameState, obj: GameObject): readonly string[] | null {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) return null;
  return copiableValues(state, obj).characteristics.manaCost;
}
