/**
 * What an activated ability costs as it is activated (CR 601.2f, 602.2b, D-135): the amounts of its `payLife` costs ("Pay life
 * equal to the number of colors in your commanders' color identity") worked out once, and the reduction of its generic mana
 * ("This ability costs {4} less to activate if an opponent controls four or more nonbasic lands") applied when its condition
 * holds. The result is the ability as it is put on the stack and paid, with numbers for amounts and no `costReducedIf`, so the
 * rest of the activation code (`breakDown`, `costRefusal`) reads a plain cost and the stack object shows what was paid. Used by
 * `activationRefusal` (a cost that can be paid is one the engine offers) and by `beginActivate`.
 */
import type { Cost } from '../ast/types';
import type { SeatId } from '../ids';
import type { ActivatedAbility, GameObject, GameState } from '../state/types';
import { amountOf } from './amounts';
import { reduceGeneric } from './cast-cost';
import { evaluateCondition } from './conditions';

/** CR 601.2f: the generic mana of the first mana cost goes down by `by` (never below zero); later mana costs are untouched. */
function reducedCosts(costs: readonly Cost[], by: number): readonly Cost[] {
  const at = costs.findIndex((c) => c.kind === 'mana');
  return costs.map((c, i) =>
    i === at && c.kind === 'mana' ? { ...c, symbols: reduceGeneric(c.symbols, by) } : c,
  );
}

/**
 * The ability with its costs as they stand for `seat` activating it from `source` now. The ability itself when nothing needs
 * working out (the usual case): the same object comes back.
 */
export function adjustedAbility(
  state: GameState,
  seat: SeatId,
  source: GameObject,
  ability: ActivatedAbility,
): ActivatedAbility {
  const worked = ability.cost.some((c) => c.kind === 'payLife' && typeof c.amount !== 'number');
  if (!worked && ability.costReducedIf === undefined && ability.costReducedBy === undefined) {
    return ability;
  }
  const ctx = { controller: seat, source: source.id };
  let cost: readonly Cost[] = ability.cost.map((c) =>
    c.kind === 'payLife' && typeof c.amount !== 'number'
      ? { ...c, amount: Math.max(0, amountOf(state, c.amount, ctx, [])) }
      : c,
  );
  const { costReducedIf, costReducedBy, ...rest } = ability;
  if (costReducedIf !== undefined && evaluateCondition(state, costReducedIf.condition, ctx)) {
    cost = reducedCosts(cost, costReducedIf.generic);
  }
  // D-139: "costs {1} less for each other artifact you control": the amount is read as the ability is activated (CR 601.2f).
  if (costReducedBy !== undefined) {
    const by = amountOf(state, costReducedBy.amount, ctx, []);
    if (by > 0) cost = reducedCosts(cost, by);
  }
  return { ...rest, cost };
}
