/**
 * Spells that cost more because of what they target (CR 601.2f, 601.2c, 604.2, 113.6, D-149): "Spells your opponents cast that target this creature cost {2} more to cast." The
 * `costIncrease` static abilities are read from the derived abilities of the permanents on the battlefield (CR 604.1, 613.1f), so one a `grantAbility` gives counts and one a permanent
 * lost does not; every instance applies. The spell is on the stack, its targets chosen before the total cost is determined (CR 601.2c), so a spell with no target chosen yet is taxed
 * by none: the question "may this be cast at all?" asks the cheapest cost, and `payableSpellTargets` keeps the first target slot to the targets that leave the cost payable.
 */
import type { ObjectFilter } from '../ast/types';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { hasCostIncreaseSources } from './derive-statics';
import { matchesFilter, type SelectContext } from './select';

/** A `costIncrease` static ability of a permanent on the battlefield, as the permanent has it after the layers. */
export interface CostIncreaseSource {
  readonly object: GameObject;
  readonly spells: ObjectFilter;
  readonly amount: number;
}

/** The `costIncrease` abilities of the permanents on the battlefield, one entry for each instance. */
export function costIncreaseSources(state: GameState): readonly CostIncreaseSource[] {
  if (!hasCostIncreaseSources(state)) return [];
  const out: CostIncreaseSource[] = [];
  for (const id of state.battlefield) {
    const object = state.objects[id];
    if (object === undefined) continue;
    for (const a of derive(state, object).abilities) {
      if (a.kind === 'static' && a.static.kind === 'costIncrease') {
        out.push({ object, spells: a.static.spells, amount: a.static.amount });
      }
    }
  }
  return out;
}

/** The generic mana added to the cost of `spell` by the permanents on the battlefield. `excluded` is a card that has not left its zone yet. */
export function costIncreaseFor(
  state: GameState,
  spell: GameObject,
  base: Partial<SelectContext>,
): number {
  let total = 0;
  for (const source of costIncreaseSources(state)) {
    const ctx: SelectContext = {
      controller: controllerOf(state, source.object),
      source: source.object.id,
      ...base,
    };
    if (matchesFilter(state, spell, { ...source.spells, zone: 'stack' }, ctx)) {
      total += source.amount;
    }
  }
  return total;
}
