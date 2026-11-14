/**
 * Targets that leave the cost payable (CR 601.2c, 601.2f, 602.2b, D-424, D-425): a cost reduction that reads what the spell or the ability targets ("Aura spells you cast that
 * target enchanted creature cost {3} less", "Equip abilities you activate that target enchanted creature cost {3} less") is known only once the targets are chosen, and the targets
 * are chosen before the total cost is determined. The question "may this be cast or activated at all?" assumes the most favourable target, so a player who can pay only with the
 * reduction would otherwise be able to choose a target that does not give it and then be unable to pay. The first slot offers, in that case, only the targets after which the cost can
 * be paid. When the cost can be paid without any such reduction nothing is restricted: every legal target is still a choice. Only the first slot that must have a target is
 * restricted (the same limit as the conditional flash of D-408: a spell whose second slot could meet it is offered fewer choices than the rules allow, `docs/ROADMAP.md`).
 */
import type { TargetSpec } from '../ast/types';
import type { ObjectId } from '../ids';
import { patchObject } from '../state/ops';
import type { CastingContext, GameState } from '../state/types';
import { reducedForTargets } from './activate-adjust';
import { costRefusal } from './activate-costs';
import {
  alternativeOfStack,
  type CastFrom,
  type CostRequest,
  canPaySpellCost,
  spellCost,
} from './cast-cost';
import { abilityReductionSources, costReductionSources } from './derive-statics';
import { legalTargets, type SelectContext } from './select';
import { flashSlotOf } from './target-choice';

/** The object ids a slot may offer, or null for "all of its legal targets". */
export type PayableOnly = readonly ObjectId[] | null;

/** The index of the slot a restriction applies to, or -1. */
export function payableSlotOf(specs: readonly TargetSpec[]): number {
  return flashSlotOf(specs);
}

/**
 * The targets of the spell being cast after which its total cost can be paid, or null when every target is as good as another: no permanent reduces the cost by what it targets, or
 * the cost can be paid whatever is targeted. Read at CR 601.2c, before the targets are chosen, with the spell on the stack (CR 601.2a).
 */
export function payableSpellTargets(
  state: GameState,
  casting: CastingContext,
  specs: readonly TargetSpec[],
  ctx: SelectContext,
): PayableOnly {
  if (!costReductionSources(state).some((s) => s.spells.targetsObject !== undefined)) return null;
  const slot = payableSlotOf(specs);
  const spec = specs[slot];
  const spell = state.objects[casting.object];
  const stack = spell?.stack;
  if (spec === undefined || spell === undefined || !stack) return null;
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
  // With no target chosen yet no reduction by the target applies: the cost as it stands without any.
  if (canPaySpellCost(state, casting.seat, spell, spellCost(state, request))) return null;
  const ids: ObjectId[] = [];
  for (const target of legalTargets(state, spec, ctx)) {
    if (target.kind !== 'object') continue;
    const aimed = patchObject(state, casting.object, {
      stack: { ...stack, chosenTargets: [target] },
    });
    const withTarget = aimed.objects[casting.object];
    if (withTarget === undefined) continue;
    if (
      canPaySpellCost(
        aimed,
        casting.seat,
        withTarget,
        spellCost(aimed, { ...request, spell: withTarget }),
      )
    ) {
      ids.push(target.id);
    }
  }
  return ids;
}

/**
 * The targets of the Equip ability being activated after which its cost can be paid (see `payableSpellTargets`), or null when every target is as good as another. `before` is the
 * state before the ability went on the stack, as the cost is checked there.
 */
export function payableEquipTargets(
  before: GameState,
  casting: CastingContext,
  specs: readonly TargetSpec[],
  ctx: SelectContext,
): PayableOnly {
  const activation = casting.activation;
  if (activation === null || activation.ability.equip !== true) return null;
  if (abilityReductionSources(before).length === 0) return null;
  const slot = payableSlotOf(specs);
  const spec = specs[slot];
  const source = before.objects[activation.source];
  if (spec === undefined || source === undefined) return null;
  const ability = activation.ability;
  if (costRefusal(before, casting.seat, source, ability.cost, activation.x) === null) return null;
  const ids: ObjectId[] = [];
  for (const target of legalTargets(before, spec, ctx)) {
    if (target.kind !== 'object') continue;
    const reduced = reducedForTargets(before, casting.seat, ability, [target.id]);
    if (reduced !== ability && costRefusal(before, casting.seat, source, reduced.cost) === null) {
      ids.push(target.id);
    }
  }
  return ids;
}
