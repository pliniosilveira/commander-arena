/**
 * Targets the cost can be paid for (CR 601.2c, 601.2f, D-633): "Strive — ~ costs {2}{R} more to cast for each target beyond the first." The targets are chosen before the total cost
 * is determined, and a spell whose total cost cannot be paid cannot be cast, so a slot of "any number of target creatures" offers no more targets than the caster could pay for. The
 * cost grows with each target, so the most is found by trying 1, 2, 3 ... of the slot's legal targets. Read at CR 601.2c, before the targets are chosen, with the spell on the stack
 * (CR 601.2a). The question "may this be cast at all?" assumes no target, where the cost is the printed one.
 */
import type { TargetSpec } from '../ast/types';
import { definitionOf, patchObject } from '../state/ops';
import type { CastingContext, GameState } from '../state/types';
import { costPerExtraTargetOf } from './alt-costs';
import {
  alternativeOfStack,
  type CastFrom,
  type CostRequest,
  canPaySpellCost,
  spellCost,
} from './cast-cost';
import { legalTargets, type SelectContext } from './select';

/**
 * The most targets the spell being cast can have with its total cost payable, or null when its cost does not grow with the targets (no `costPerExtraTarget`) or the spell has no
 * slot of any number of targets to limit. With the slot's legal targets, never more than they are.
 */
export function striveTargetCap(
  state: GameState,
  casting: CastingContext,
  specs: readonly TargetSpec[],
  ctx: SelectContext,
): number | null {
  const spell = state.objects[casting.object];
  const stack = spell?.stack;
  if (spell === undefined || !stack || spell.card === null) return null;
  const face = definitionOf(state, spell.card).faces[spell.face] ?? null;
  if (costPerExtraTargetOf(face) === null) return null;
  const spec = specs.find((s) => s.anyNumber === true);
  if (spec === undefined) return null;
  const legal = legalTargets(state, spec, ctx);
  const request: CostRequest = {
    seat: casting.seat,
    spell,
    zone: casting.fromZone as CastFrom,
    alternative: alternativeOfStack(stack),
    kicked: stack.kicked === true,
    ...(stack.kicks === undefined ? {} : { kicks: stack.kicks }),
    ...(stack.replicated === undefined ? {} : { replicas: stack.replicated }),
    x: stack.x ?? 0,
  };
  let most = 0;
  for (let n = 1; n <= legal.length; n += 1) {
    const aimed = patchObject(state, casting.object, {
      stack: { ...stack, chosenTargets: legal.slice(0, n) },
    });
    const withTargets = aimed.objects[casting.object];
    if (withTargets === undefined) break;
    const cost = spellCost(aimed, { ...request, spell: withTargets });
    if (!canPaySpellCost(aimed, casting.seat, withTargets, cost)) break;
    most = n;
  }
  return most;
}
